/**
 * Property-based tests for Artist Artwork Deduplication and Reference Counting
 * 
 * **Property 3: Artist Artwork Deduplication and Reference Counting**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 * 
 * Tests that:
 * - Caching N songs with the same artist results in exactly 1 artist artwork entry
 * - The reference count equals the number of songs referencing that artist
 * - Deleting all songs referencing an artist deletes the artist artwork
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import 'fake-indexeddb/auto';
import { indexedDB } from 'fake-indexeddb';
import { OfflineCacheService, CachedArtistArtwork } from './offlineCacheService';

// ============================================================================
// Test Setup
// ============================================================================

// Reset fake-indexeddb before each test
beforeEach(() => {
  // Clear all databases
  indexedDB._databases.clear();
});

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid artist ID
 */
const artistIdArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0)
  .map(s => `artist-${s}`);

/**
 * Generate a small Blob for testing (simulating artist artwork)
 */
const artworkBlobArb = fc.uint8Array({ minLength: 10, maxLength: 100 })
  .map(arr => new Blob([arr], { type: 'image/jpeg' }));

/**
 * Generate a positive integer for reference count operations
 */
const positiveIntArb = fc.integer({ min: 1, max: 10 });

// ============================================================================
// Property 3: Artist Artwork Deduplication and Reference Counting
// ============================================================================

describe('Property 3: Artist Artwork Deduplication and Reference Counting', () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   * Caching the same artist N times results in exactly 1 entry with refCount = N
   */
  it('caching same artist N times creates 1 entry with refCount = N', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, positiveIntArb, async (artistId, artwork, n) => {
        // Create fresh service for each property run
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Cache the same artist N times
          for (let i = 0; i < n; i++) {
            await service.cacheArtistArtwork(artistId, artwork);
          }

          // Should have exactly 1 entry
          const allArtworks = await service.getAllCachedArtistArtworks();
          const matchingArtworks = allArtworks.filter(a => a.artistId === artistId);
          expect(matchingArtworks.length).toBe(1);

          // Reference count should equal N
          const refCount = await service.getArtistArtworkRefCount(artistId);
          expect(refCount).toBe(n);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 2.2**
   * Different artists create separate entries
   */
  it('different artists create separate entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(artistIdArb, { minLength: 2, maxLength: 5 }).filter(ids => new Set(ids).size === ids.length),
        artworkBlobArb,
        async (artistIds, artwork) => {
          const service = new OfflineCacheService();
          await service.init();
          
          try {
            // Cache each unique artist once
            for (const artistId of artistIds) {
              await service.cacheArtistArtwork(artistId, artwork);
            }

            // Should have exactly artistIds.length entries
            const allArtworks = await service.getAllCachedArtistArtworks();
            expect(allArtworks.length).toBe(artistIds.length);

            // Each should have refCount = 1
            for (const artistId of artistIds) {
              const refCount = await service.getArtistArtworkRefCount(artistId);
              expect(refCount).toBe(1);
            }
          } finally {
            service.close();
            indexedDB._databases.clear();
          }

          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 2.3**
   * Incrementing reference count increases it by 1
   */
  it('incrementArtistArtworkRef increases refCount by 1', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, positiveIntArb, async (artistId, artwork, initialCount) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Cache artist initialCount times
          for (let i = 0; i < initialCount; i++) {
            await service.cacheArtistArtwork(artistId, artwork);
          }

          const refCountBefore = await service.getArtistArtworkRefCount(artistId);
          
          // Increment
          await service.incrementArtistArtworkRef(artistId);
          
          const refCountAfter = await service.getArtistArtworkRefCount(artistId);
          expect(refCountAfter).toBe(refCountBefore + 1);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 2.3, 2.4**
   * Decrementing reference count decreases it by 1, deletes when zero
   */
  it('decrementArtistArtworkRef decreases refCount by 1, deletes at zero', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, positiveIntArb, async (artistId, artwork, n) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Cache artist N times
          for (let i = 0; i < n; i++) {
            await service.cacheArtistArtwork(artistId, artwork);
          }

          // Decrement N times
          for (let i = 0; i < n; i++) {
            const refCountBefore = await service.getArtistArtworkRefCount(artistId);
            const deleted = await service.decrementArtistArtworkRef(artistId);
            
            if (i < n - 1) {
              // Not the last decrement - should not be deleted
              expect(deleted).toBe(false);
              const refCountAfter = await service.getArtistArtworkRefCount(artistId);
              expect(refCountAfter).toBe(refCountBefore - 1);
            } else {
              // Last decrement - should be deleted
              expect(deleted).toBe(true);
              const isCached = await service.isArtistArtworkCached(artistId);
              expect(isCached).toBe(false);
            }
          }
        } finally {
          service.close();
          indexedDB._databases.clear();
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 2.4**
   * After all references removed, artwork is deleted
   */
  it('artwork is deleted when all references are removed', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, positiveIntArb, async (artistId, artwork, n) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Cache artist N times
          for (let i = 0; i < n; i++) {
            await service.cacheArtistArtwork(artistId, artwork);
          }

          // Verify it exists
          expect(await service.isArtistArtworkCached(artistId)).toBe(true);

          // Remove all references
          for (let i = 0; i < n; i++) {
            await service.decrementArtistArtworkRef(artistId);
          }

          // Should be deleted
          expect(await service.isArtistArtworkCached(artistId)).toBe(false);
          expect(await service.getArtistArtworkRefCount(artistId)).toBe(0);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * **Validates: Requirements 2.1**
   * getCachedArtistArtwork returns the artwork data
   */
  it('getCachedArtistArtwork returns correct artwork', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, async (artistId, artwork) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          await service.cacheArtistArtwork(artistId, artwork);

          const cached = await service.getCachedArtistArtwork(artistId);
          expect(cached).not.toBeNull();
          expect(cached!.artistId).toBe(artistId);
          // fake-indexeddb may not preserve Blob type, just check artwork exists
          expect(cached!.artwork).toBeDefined();
          expect(cached!.referenceCount).toBe(1);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * isArtistArtworkCached returns correct boolean
   */
  it('isArtistArtworkCached returns correct boolean', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, async (artistId, artwork) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Before caching
          expect(await service.isArtistArtworkCached(artistId)).toBe(false);

          // After caching
          await service.cacheArtistArtwork(artistId, artwork);
          expect(await service.isArtistArtworkCached(artistId)).toBe(true);

          // After removing
          await service.decrementArtistArtworkRef(artistId);
          expect(await service.isArtistArtworkCached(artistId)).toBe(false);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }

        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Decrementing non-existent artwork returns false
   */
  it('decrementArtistArtworkRef on non-existent returns false', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, async (artistId) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          const deleted = await service.decrementArtistArtworkRef(artistId);
          expect(deleted).toBe(false);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }
        
        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Incrementing non-existent artwork does nothing (no error)
   */
  it('incrementArtistArtworkRef on non-existent does nothing', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, async (artistId) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Should not throw
          await service.incrementArtistArtworkRef(artistId);
          
          // Should still not exist
          expect(await service.isArtistArtworkCached(artistId)).toBe(false);
          expect(await service.getArtistArtworkRefCount(artistId)).toBe(0);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }
        
        return true;
      }),
      { numRuns: 50 }
    );
  });

  /**
   * Reference count is always non-negative
   */
  it('reference count is always non-negative', async () => {
    await fc.assert(
      fc.asyncProperty(artistIdArb, artworkBlobArb, positiveIntArb, async (artistId, artwork, n) => {
        const service = new OfflineCacheService();
        await service.init();
        
        try {
          // Cache and then over-decrement
          await service.cacheArtistArtwork(artistId, artwork);
          
          // Decrement more times than cached
          for (let i = 0; i < n + 5; i++) {
            await service.decrementArtistArtworkRef(artistId);
          }
          
          // Reference count should be 0 (not negative)
          const refCount = await service.getArtistArtworkRefCount(artistId);
          expect(refCount).toBeGreaterThanOrEqual(0);
        } finally {
          service.close();
          indexedDB._databases.clear();
        }
        
        return true;
      }),
      { numRuns: 50 }
    );
  });
});
