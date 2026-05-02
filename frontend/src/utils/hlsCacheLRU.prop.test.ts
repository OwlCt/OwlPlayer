/**
 * Property-based tests for HLS Cache LRU Eviction
 * 
 * **Feature: ios-pwa-background-continuity, Property 7: LRU Cache Eviction**
 * **Validates: Requirements 2.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  HLSCacheEntry,
  calculateLRUEviction,
  verifyLRUEviction,
  calculateTotalSize,
  getEntriesByAge,
  HLS_CACHE_MAX_SIZE
} from './hlsCacheLRU';

describe('HLS Cache LRU Eviction - Property Tests', () => {
  /**
   * Generator for HLS cache entries
   */
  const hlsCacheEntryArb = (songId: string, timestamp: number): fc.Arbitrary<HLSCacheEntry> =>
    fc.record({
      songId: fc.constant(songId),
      playlistUrl: fc.constant(`/api/stream/${songId}/playlist.m3u8`),
      segmentUrls: fc.array(fc.constant(`/api/stream/${songId}/segment_0.ts`), { minLength: 0, maxLength: 3 }),
      cachedAt: fc.constant(timestamp),
      lastAccessed: fc.integer({ min: timestamp, max: timestamp + 1000000 }),
      totalSize: fc.integer({ min: 100000, max: 10000000 }), // 100KB to 10MB
      expiresAt: fc.constant(timestamp + 300000) // 5 minutes TTL
    });

  /**
   * Generator for a map of cache entries with unique timestamps
   */
  const cacheEntriesArb = fc.integer({ min: 1, max: 20 }).chain(count => {
    const baseTime = Date.now() - 1000000;
    const entries: fc.Arbitrary<Record<string, HLSCacheEntry>>[] = [];
    
    for (let i = 0; i < count; i++) {
      const songId = `song_${i}`;
      const timestamp = baseTime + i * 10000; // Ensure unique timestamps
      entries.push(
        hlsCacheEntryArb(songId, timestamp).map(entry => ({ [songId]: entry }))
      );
    }
    
    return fc.tuple(...entries).map(arr => 
      arr.reduce((acc, curr) => ({ ...acc, ...curr }), {})
    );
  });

  /**
   * Property 7: LRU Cache Eviction
   * *For any* HLS cache that exceeds the size limit (50MB), after cleanup,
   * the total size SHALL be at or below the limit, and evicted entries
   * SHALL be those with oldest lastAccessed timestamps.
   * 
   * **Validates: Requirements 2.4**
   */
  describe('Property 7: LRU Cache Eviction', () => {
    it('should evict entries until cache is at or below size limit', () => {
      fc.assert(
        fc.property(cacheEntriesArb, fc.integer({ min: 1000000, max: 100000000 }), (entries, maxSize) => {
          const result = calculateLRUEviction(entries, maxSize);
          
          // After eviction, remaining size should be at or below limit
          expect(result.remainingSize).toBeLessThanOrEqual(maxSize);
        }),
        { numRuns: 100 }
      );
    });

    it('should not evict anything if cache is under limit', () => {
      fc.assert(
        fc.property(cacheEntriesArb, (entries) => {
          const totalSize = calculateTotalSize(entries);
          // Use a max size larger than total
          const maxSize = totalSize + 10000000;
          
          const result = calculateLRUEviction(entries, maxSize);
          
          // Should not evict anything
          expect(result.entriesToEvict.length).toBe(0);
          expect(result.evictedSize).toBe(0);
          expect(result.remainingSize).toBe(totalSize);
        }),
        { numRuns: 100 }
      );
    });

    it('should evict oldest entries first (LRU order)', () => {
      fc.assert(
        fc.property(cacheEntriesArb, fc.integer({ min: 1000000, max: 50000000 }), (entries, maxSize) => {
          const result = calculateLRUEviction(entries, maxSize);
          
          if (result.entriesToEvict.length === 0) {
            // No eviction needed, skip this case
            return;
          }
          
          // Get entries sorted by age
          const sortedByAge = getEntriesByAge(entries);
          const evictedSet = new Set(result.entriesToEvict);
          
          // Find the newest evicted entry
          let newestEvictedTime = 0;
          for (const entry of sortedByAge) {
            if (evictedSet.has(entry.songId)) {
              const time = entry.lastAccessed || entry.cachedAt || 0;
              newestEvictedTime = Math.max(newestEvictedTime, time);
            }
          }
          
          // All remaining entries should have lastAccessed >= newest evicted
          for (const entry of sortedByAge) {
            if (!evictedSet.has(entry.songId)) {
              const time = entry.lastAccessed || entry.cachedAt || 0;
              expect(time).toBeGreaterThanOrEqual(newestEvictedTime);
            }
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly calculate evicted size', () => {
      fc.assert(
        fc.property(cacheEntriesArb, fc.integer({ min: 1000000, max: 50000000 }), (entries, maxSize) => {
          const result = calculateLRUEviction(entries, maxSize);
          
          // Calculate expected evicted size
          let expectedEvictedSize = 0;
          for (const songId of result.entriesToEvict) {
            expectedEvictedSize += entries[songId].totalSize || 0;
          }
          
          expect(result.evictedSize).toBe(expectedEvictedSize);
        }),
        { numRuns: 100 }
      );
    });

    it('should satisfy all LRU properties (verification function)', () => {
      fc.assert(
        fc.property(cacheEntriesArb, fc.integer({ min: 1000000, max: 50000000 }), (entries, maxSize) => {
          const result = calculateLRUEviction(entries, maxSize);
          
          // Use verification function to check all properties
          expect(verifyLRUEviction(entries, result, maxSize)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Invariant: Total size consistency
   */
  describe('Size calculation invariants', () => {
    it('should maintain size consistency: remaining + evicted = original', () => {
      fc.assert(
        fc.property(cacheEntriesArb, fc.integer({ min: 1000000, max: 50000000 }), (entries, maxSize) => {
          const originalSize = calculateTotalSize(entries);
          const result = calculateLRUEviction(entries, maxSize);
          
          // remaining + evicted should equal original
          expect(result.remainingSize + result.evictedSize).toBe(originalSize);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle empty cache', () => {
      const result = calculateLRUEviction({}, HLS_CACHE_MAX_SIZE);
      
      expect(result.entriesToEvict).toEqual([]);
      expect(result.evictedSize).toBe(0);
      expect(result.remainingSize).toBe(0);
    });

    it('should handle single entry cache', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100000, max: 100000000 }), // entry size
          fc.integer({ min: 1000000, max: 100000000 }), // max size
          (entrySize, maxSize) => {
            const entries: Record<string, HLSCacheEntry> = {
              'song_1': {
                songId: 'song_1',
                playlistUrl: '/api/stream/song_1/playlist.m3u8',
                segmentUrls: [],
                cachedAt: Date.now(),
                lastAccessed: Date.now(),
                totalSize: entrySize,
                expiresAt: Date.now() + 300000
              }
            };
            
            const result = calculateLRUEviction(entries, maxSize);
            
            if (entrySize <= maxSize) {
              // Should not evict
              expect(result.entriesToEvict.length).toBe(0);
            } else {
              // Should evict the single entry
              expect(result.entriesToEvict).toEqual(['song_1']);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Edge cases
   */
  describe('Edge cases', () => {
    it('should handle entries with zero size', () => {
      const entries: Record<string, HLSCacheEntry> = {
        'song_1': {
          songId: 'song_1',
          playlistUrl: '/api/stream/song_1/playlist.m3u8',
          segmentUrls: [],
          cachedAt: Date.now() - 10000,
          lastAccessed: Date.now() - 10000,
          totalSize: 0,
          expiresAt: Date.now() + 300000
        },
        'song_2': {
          songId: 'song_2',
          playlistUrl: '/api/stream/song_2/playlist.m3u8',
          segmentUrls: [],
          cachedAt: Date.now(),
          lastAccessed: Date.now(),
          totalSize: 0,
          expiresAt: Date.now() + 300000
        }
      };
      
      const result = calculateLRUEviction(entries, 1000);
      
      // Zero size entries should not trigger eviction
      expect(result.entriesToEvict.length).toBe(0);
      expect(result.remainingSize).toBe(0);
    });

    it('should handle entries with same lastAccessed time', () => {
      const now = Date.now();
      const entries: Record<string, HLSCacheEntry> = {
        'song_1': {
          songId: 'song_1',
          playlistUrl: '/api/stream/song_1/playlist.m3u8',
          segmentUrls: [],
          cachedAt: now,
          lastAccessed: now,
          totalSize: 10000000, // 10MB
          expiresAt: now + 300000
        },
        'song_2': {
          songId: 'song_2',
          playlistUrl: '/api/stream/song_2/playlist.m3u8',
          segmentUrls: [],
          cachedAt: now,
          lastAccessed: now,
          totalSize: 10000000, // 10MB
          expiresAt: now + 300000
        }
      };
      
      // Max size 15MB, total 20MB - need to evict one
      const result = calculateLRUEviction(entries, 15000000);
      
      // Should evict exactly one entry
      expect(result.entriesToEvict.length).toBe(1);
      expect(result.remainingSize).toBeLessThanOrEqual(15000000);
    });

    it('should use cachedAt as fallback when lastAccessed is missing', () => {
      const entries: Record<string, HLSCacheEntry> = {
        'song_1': {
          songId: 'song_1',
          playlistUrl: '/api/stream/song_1/playlist.m3u8',
          segmentUrls: [],
          cachedAt: Date.now() - 20000, // Older
          lastAccessed: 0, // Missing
          totalSize: 10000000,
          expiresAt: Date.now() + 300000
        },
        'song_2': {
          songId: 'song_2',
          playlistUrl: '/api/stream/song_2/playlist.m3u8',
          segmentUrls: [],
          cachedAt: Date.now(), // Newer
          lastAccessed: 0, // Missing
          totalSize: 10000000,
          expiresAt: Date.now() + 300000
        }
      };
      
      // Max size 15MB, total 20MB - need to evict one
      const result = calculateLRUEviction(entries, 15000000);
      
      // Should evict the older one (song_1)
      expect(result.entriesToEvict).toEqual(['song_1']);
    });
  });

  /**
   * Default max size (50MB) tests
   */
  describe('Default max size (50MB)', () => {
    it('should use 50MB as default max size', () => {
      expect(HLS_CACHE_MAX_SIZE).toBe(50 * 1024 * 1024);
    });

    it('should evict when cache exceeds 50MB', () => {
      // Create entries totaling ~60MB
      const entries: Record<string, HLSCacheEntry> = {};
      const now = Date.now();
      
      for (let i = 0; i < 6; i++) {
        entries[`song_${i}`] = {
          songId: `song_${i}`,
          playlistUrl: `/api/stream/song_${i}/playlist.m3u8`,
          segmentUrls: [],
          cachedAt: now - (6 - i) * 10000, // Older entries first
          lastAccessed: now - (6 - i) * 10000,
          totalSize: 10 * 1024 * 1024, // 10MB each
          expiresAt: now + 300000
        };
      }
      
      const result = calculateLRUEviction(entries);
      
      // Should evict at least one entry to get under 50MB
      expect(result.entriesToEvict.length).toBeGreaterThan(0);
      expect(result.remainingSize).toBeLessThanOrEqual(HLS_CACHE_MAX_SIZE);
      
      // Should evict oldest entries first
      expect(result.entriesToEvict[0]).toBe('song_0');
    });
  });
});
