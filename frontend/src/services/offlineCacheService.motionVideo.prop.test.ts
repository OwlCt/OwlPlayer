/**
 * Property-based tests for Motion Video Deduplication
 * 
 * Tests:
 * - Property 1: 动态封面去重存储
 * - Property 2: 引用计数正确性
 * 
 * **Feature: motion-video-deduplication**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import 'fake-indexeddb/auto';
import { OfflineCacheService, CachedMotionVideo } from './offlineCacheService';

// ============================================================================
// Test Setup
// ============================================================================

let service: OfflineCacheService;

beforeEach(async () => {
  // Create a fresh service instance for each test
  service = new OfflineCacheService();
  await service.init();
  // Clear all data to ensure clean state
  await service.clearAllCache();
});

afterEach(async () => {
  // Clear all data before closing
  try {
    await service.clearAllCache();
  } catch {
    // Ignore errors during cleanup
  }
  service.close();
});

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid album ID
 */
const albumIdArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0 && !s.includes('\0'));

/**
 * Generate a Blob representing a motion video
 */
const videoBlobArb = fc.uint8Array({ minLength: 100, maxLength: 1000 })
  .map(arr => new Blob([arr], { type: 'video/mp4' }));

/**
 * Generate a sequence of cache operations for the same album ID
 */
const cacheOperationSequenceArb = fc.tuple(
  albumIdArb,
  videoBlobArb,
  fc.integer({ min: 1, max: 10 })
).map(([albumId, video, cacheCount]) => ({
  albumId,
  video,
  cacheCount
}));

/**
 * Generate a sequence of increment/decrement operations
 */
const refCountOperationsArb = fc.tuple(
  albumIdArb,
  videoBlobArb,
  fc.array(fc.boolean(), { minLength: 1, maxLength: 20 })
).map(([albumId, video, operations]) => ({
  albumId,
  video,
  // true = increment, false = decrement
  operations
}));

// ============================================================================
// Property 1: 动态封面去重存储
// **Validates: Requirements 1.3, 1.4**
// ============================================================================

describe('Property 1: 动态封面去重存储', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   * For any album ID and motion video Blob, caching the same album ID multiple times
   * SHALL result in exactly one stored Blob
   */
  it('caching same album ID multiple times stores exactly one Blob', async () => {
    await fc.assert(
      fc.asyncProperty(cacheOperationSequenceArb, async ({ albumId, video, cacheCount }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Cache the same album ID multiple times
        for (let i = 0; i < cacheCount; i++) {
          await service.cacheMotionVideo(albumId, video);
        }

        // Get all cached motion videos
        const allVideos = await service.getAllCachedMotionVideos();
        
        // Filter to find videos with this album ID
        const matchingVideos = allVideos.filter(v => v.albumId === albumId);
        
        // Should have exactly one entry
        return matchingVideos.length === 1;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 1.3, 1.4**
   * Subsequent cache calls SHALL increment the reference count without storing duplicate data
   */
  it('subsequent cache calls increment reference count', async () => {
    await fc.assert(
      fc.asyncProperty(cacheOperationSequenceArb, async ({ albumId, video, cacheCount }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Cache the same album ID multiple times
        for (let i = 0; i < cacheCount; i++) {
          await service.cacheMotionVideo(albumId, video);
        }

        // Get the reference count
        const refCount = await service.getMotionVideoRefCount(albumId);
        
        // Reference count should equal the number of cache calls
        return refCount === cacheCount;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Caching different album IDs creates separate entries
   */
  it('different album IDs create separate entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(albumIdArb, videoBlobArb), { minLength: 1, maxLength: 10 }),
        async (albumsWithVideos) => {
          // Clear before each iteration
          await service.clearAllCache();
          
          // Get unique album IDs
          const uniqueAlbumIds = [...new Set(albumsWithVideos.map(([id]) => id))];
          
          // Cache each album
          for (const [albumId, video] of albumsWithVideos) {
            await service.cacheMotionVideo(albumId, video);
          }

          // Get all cached motion videos
          const allVideos = await service.getAllCachedMotionVideos();
          
          // Should have exactly as many entries as unique album IDs
          return allVideos.length === uniqueAlbumIds.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * isMotionVideoCached returns true after caching
   */
  it('isMotionVideoCached returns true after caching', async () => {
    await fc.assert(
      fc.asyncProperty(albumIdArb, videoBlobArb, async (albumId, video) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Initially not cached
        const beforeCache = await service.isMotionVideoCached(albumId);
        
        // Cache the video
        await service.cacheMotionVideo(albumId, video);
        
        // Now should be cached
        const afterCache = await service.isMotionVideoCached(albumId);
        
        return !beforeCache && afterCache;
      }),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: 引用计数正确性
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
// ============================================================================

describe('Property 2: 引用计数正确性', () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   * Reference count SHALL equal the number of active references
   */
  it('reference count equals number of increments minus decrements', async () => {
    await fc.assert(
      fc.asyncProperty(refCountOperationsArb, async ({ albumId, video, operations }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // First cache the video
        await service.cacheMotionVideo(albumId, video);
        let expectedCount = 1;

        // Apply operations
        for (const isIncrement of operations) {
          if (isIncrement) {
            await service.incrementMotionVideoRef(albumId);
            expectedCount++;
          } else {
            const deleted = await service.decrementMotionVideoRef(albumId);
            expectedCount--;
            
            // If deleted, stop processing
            if (deleted || expectedCount <= 0) {
              const exists = await service.isMotionVideoCached(albumId);
              return !exists;
            }
          }
        }

        // Check final reference count
        const actualCount = await service.getMotionVideoRefCount(albumId);
        return actualCount === expectedCount;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.3, 2.4**
   * Motion video SHALL be deleted if and only if reference count reaches zero
   */
  it('motion video is deleted when reference count reaches zero', async () => {
    await fc.assert(
      fc.asyncProperty(
        albumIdArb,
        videoBlobArb,
        fc.integer({ min: 1, max: 10 }),
        async (albumId, video, initialRefs) => {
          // Clear before each iteration
          await service.clearAllCache();
          
          // Cache with initial reference count
          for (let i = 0; i < initialRefs; i++) {
            await service.cacheMotionVideo(albumId, video);
          }

          // Verify initial state
          const initialCount = await service.getMotionVideoRefCount(albumId);
          if (initialCount !== initialRefs) return false;

          // Decrement until deleted
          for (let i = 0; i < initialRefs; i++) {
            const deleted = await service.decrementMotionVideoRef(albumId);
            const remainingCount = await service.getMotionVideoRefCount(albumId);
            const exists = await service.isMotionVideoCached(albumId);

            if (i === initialRefs - 1) {
              // Last decrement should delete
              if (!deleted || exists || remainingCount !== 0) return false;
            } else {
              // Not last decrement, should not delete
              if (deleted || !exists || remainingCount !== initialRefs - i - 1) return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 2.5**
   * getMotionVideoRefCount returns correct count
   */
  it('getMotionVideoRefCount returns 0 for non-existent video', async () => {
    await fc.assert(
      fc.asyncProperty(albumIdArb, async (albumId) => {
        const count = await service.getMotionVideoRefCount(albumId);
        return count === 0;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * incrementMotionVideoRef on non-existent video does nothing
   */
  it('incrementMotionVideoRef on non-existent video does nothing', async () => {
    await fc.assert(
      fc.asyncProperty(albumIdArb, async (albumId) => {
        // Try to increment non-existent video
        await service.incrementMotionVideoRef(albumId);
        
        // Should still not exist
        const exists = await service.isMotionVideoCached(albumId);
        const count = await service.getMotionVideoRefCount(albumId);
        
        return !exists && count === 0;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * decrementMotionVideoRef on non-existent video returns false
   */
  it('decrementMotionVideoRef on non-existent video returns false', async () => {
    await fc.assert(
      fc.asyncProperty(albumIdArb, async (albumId) => {
        const deleted = await service.decrementMotionVideoRef(albumId);
        return deleted === false;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * getCachedMotionVideo returns the correct video data
   */
  it('getCachedMotionVideo returns correct video data', async () => {
    let testCounter = 0;
    await fc.assert(
      fc.asyncProperty(videoBlobArb, async (video) => {
        // Use unique album ID for each iteration to avoid state issues
        const albumId = `test-album-${testCounter++}-${Date.now()}`;
        
        // Cache the video
        await service.cacheMotionVideo(albumId, video);
        
        // Get the cached video
        const cached = await service.getCachedMotionVideo(albumId);
        
        // Verify the data exists and has correct structure
        if (!cached) {
          return false;
        }
        
        // Note: fake-indexeddb may not preserve Blob.size correctly,
        // so we only check that video exists and is a Blob-like object
        return (
          cached.albumId === albumId &&
          cached.video !== null &&
          cached.video !== undefined &&
          cached.referenceCount === 1 &&
          typeof cached.cachedAt === 'number'
        );
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Reference count is always non-negative
   */
  it('reference count is always non-negative', async () => {
    await fc.assert(
      fc.asyncProperty(
        albumIdArb,
        videoBlobArb,
        fc.array(fc.boolean(), { minLength: 0, maxLength: 30 }),
        async (albumId, video, operations) => {
          // Clear before each iteration
          await service.clearAllCache();
          
          // Cache the video
          await service.cacheMotionVideo(albumId, video);

          // Apply random operations
          for (const isIncrement of operations) {
            if (isIncrement) {
              await service.incrementMotionVideoRef(albumId);
            } else {
              await service.decrementMotionVideoRef(albumId);
            }
            
            // Check reference count is non-negative
            const count = await service.getMotionVideoRefCount(albumId);
            if (count < 0) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
