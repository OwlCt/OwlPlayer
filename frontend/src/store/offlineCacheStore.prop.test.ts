/**
 * Property-based tests for offlineCacheStore
 * 
 * Tests:
 * - Property 10: Cache Status Calculation
 * - Property 11: Sidebar Cache Section Visibility
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateCacheStatus, shouldShowCacheSection, CacheStatus } from './offlineCacheStore';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid song ID
 */
const songIdArb = fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0);

/**
 * Generate a set of song IDs
 */
const songIdSetArb = fc.array(songIdArb, { minLength: 0, maxLength: 50 })
  .map(ids => new Set(ids));

/**
 * Generate track IDs array (for an album or playlist)
 */
const trackIdsArb = fc.array(songIdArb, { minLength: 0, maxLength: 30 });

/**
 * Generate a scenario where all tracks are cached
 */
const allCachedScenarioArb = fc.array(songIdArb, { minLength: 1, maxLength: 20 })
  .map(trackIds => ({
    trackIds,
    cachedSongIds: new Set(trackIds),
  }));

/**
 * Generate a scenario where no tracks are cached
 */
const noneCachedScenarioArb = fc.tuple(
  fc.array(songIdArb, { minLength: 1, maxLength: 20 }),
  fc.array(songIdArb, { minLength: 0, maxLength: 20 })
).map(([trackIds, otherIds]) => ({
  trackIds,
  // Ensure cached IDs don't overlap with track IDs
  cachedSongIds: new Set(otherIds.filter(id => !trackIds.includes(id))),
}));

/**
 * Generate a scenario where some (but not all) tracks are cached
 */
const partialCachedScenarioArb = fc.array(songIdArb, { minLength: 2, maxLength: 20 })
  .chain(trackIds => {
    // Pick a random subset (at least 1, at most trackIds.length - 1)
    const minCached = 1;
    const maxCached = trackIds.length - 1;
    return fc.integer({ min: minCached, max: maxCached })
      .map(numCached => {
        const cachedIds = trackIds.slice(0, numCached);
        return {
          trackIds,
          cachedSongIds: new Set(cachedIds),
        };
      });
  });

// ============================================================================
// Property 10: Cache Status Calculation
// ============================================================================

describe('Property 10: Cache Status Calculation', () => {
  /**
   * **Validates: Requirements 6.4**
   * If no trackIds are in cachedSongIds, status SHALL be "none"
   */
  it('returns "none" when no tracks are cached', () => {
    fc.assert(
      fc.property(noneCachedScenarioArb, ({ trackIds, cachedSongIds }) => {
        // Skip empty track lists (edge case handled separately)
        if (trackIds.length === 0) return true;
        
        const status = calculateCacheStatus(cachedSongIds, trackIds);
        return status === 'none';
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.1, 6.2**
   * If all trackIds are in cachedSongIds, status SHALL be "full"
   */
  it('returns "full" when all tracks are cached', () => {
    fc.assert(
      fc.property(allCachedScenarioArb, ({ trackIds, cachedSongIds }) => {
        const status = calculateCacheStatus(cachedSongIds, trackIds);
        return status === 'full';
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 6.3**
   * If some (but not all) trackIds are in cachedSongIds, status SHALL be "partial"
   */
  it('returns "partial" when some tracks are cached', () => {
    fc.assert(
      fc.property(partialCachedScenarioArb, ({ trackIds, cachedSongIds }) => {
        const status = calculateCacheStatus(cachedSongIds, trackIds);
        return status === 'partial';
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Edge case: empty track list returns "none"
   */
  it('returns "none" for empty track list', () => {
    fc.assert(
      fc.property(songIdSetArb, (cachedSongIds) => {
        const status = calculateCacheStatus(cachedSongIds, []);
        return status === 'none';
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Status is always one of the valid values
   */
  it('always returns a valid status value', () => {
    fc.assert(
      fc.property(songIdSetArb, trackIdsArb, (cachedSongIds, trackIds) => {
        const status = calculateCacheStatus(cachedSongIds, trackIds);
        return status === 'none' || status === 'partial' || status === 'full';
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Status calculation is deterministic
   */
  it('is deterministic - same inputs produce same output', () => {
    fc.assert(
      fc.property(songIdSetArb, trackIdsArb, (cachedSongIds, trackIds) => {
        const status1 = calculateCacheStatus(cachedSongIds, trackIds);
        const status2 = calculateCacheStatus(cachedSongIds, trackIds);
        return status1 === status2;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Adding a cached song can only increase or maintain status (none -> partial -> full)
   */
  it('adding a cached song never decreases status', () => {
    fc.assert(
      fc.property(
        songIdSetArb,
        trackIdsArb.filter(t => t.length > 0),
        fc.integer({ min: 0, max: 100 }),
        (cachedSongIds, trackIds, index) => {
          const statusBefore = calculateCacheStatus(cachedSongIds, trackIds);
          
          // Add a track to cached songs
          const trackToAdd = trackIds[index % trackIds.length];
          const newCachedSongIds = new Set(cachedSongIds);
          newCachedSongIds.add(trackToAdd);
          
          const statusAfter = calculateCacheStatus(newCachedSongIds, trackIds);
          
          // Status should not decrease
          const statusOrder: Record<CacheStatus, number> = { 'none': 0, 'partial': 1, 'full': 2 };
          return statusOrder[statusAfter] >= statusOrder[statusBefore];
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 11: Sidebar Cache Section Visibility
// ============================================================================

describe('Property 11: Sidebar Cache Section Visibility', () => {
  /**
   * **Validates: Requirements 7.1, 7.2**
   * Section SHALL be visible only when cached albums or playlists exist
   * Individual cached songs do not affect visibility since songs are accessed through their parent album/playlist
   */
  it('does NOT show section when only songs are cached (no albums or playlists)', () => {
    fc.assert(
      fc.property(
        fc.array(songIdArb, { minLength: 1, maxLength: 20 }).map(ids => new Set(ids)),
        (cachedSongIds) => {
          const visible = shouldShowCacheSection(
            cachedSongIds,
            new Set<string>(),
            new Set<string>()
          );
          // Should NOT be visible when only songs are cached
          return visible === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   * Section SHALL be visible if albums are cached
   */
  it('shows section when albums are cached', () => {
    fc.assert(
      fc.property(
        fc.array(songIdArb, { minLength: 1, maxLength: 20 }).map(ids => new Set(ids)),
        (cachedAlbumIds) => {
          const visible = shouldShowCacheSection(
            new Set<string>(),
            cachedAlbumIds,
            new Set<string>()
          );
          return visible === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.1**
   * Section SHALL be visible if playlists are cached
   */
  it('shows section when playlists are cached', () => {
    fc.assert(
      fc.property(
        fc.array(songIdArb, { minLength: 1, maxLength: 20 }).map(ids => new Set(ids)),
        (cachedPlaylistIds) => {
          const visible = shouldShowCacheSection(
            new Set<string>(),
            new Set<string>(),
            cachedPlaylistIds
          );
          return visible === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 7.2**
   * Section SHALL be hidden when no cached content exists
   */
  it('hides section when nothing is cached', () => {
    const visible = shouldShowCacheSection(
      new Set<string>(),
      new Set<string>(),
      new Set<string>()
    );
    expect(visible).toBe(false);
  });

  /**
   * Visibility is true if and only if albums or playlists are cached
   * (songs alone do not trigger visibility)
   */
  it('visibility equals (albums.size > 0 OR playlists.size > 0)', () => {
    fc.assert(
      fc.property(
        songIdSetArb,
        songIdSetArb,
        songIdSetArb,
        (cachedSongIds, cachedAlbumIds, cachedPlaylistIds) => {
          const visible = shouldShowCacheSection(
            cachedSongIds,
            cachedAlbumIds,
            cachedPlaylistIds
          );
          // Only albums and playlists affect visibility, not songs
          const expected = cachedAlbumIds.size > 0 || cachedPlaylistIds.size > 0;
          return visible === expected;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Visibility is deterministic
   */
  it('is deterministic - same inputs produce same output', () => {
    fc.assert(
      fc.property(
        songIdSetArb,
        songIdSetArb,
        songIdSetArb,
        (cachedSongIds, cachedAlbumIds, cachedPlaylistIds) => {
          const visible1 = shouldShowCacheSection(
            cachedSongIds,
            cachedAlbumIds,
            cachedPlaylistIds
          );
          const visible2 = shouldShowCacheSection(
            cachedSongIds,
            cachedAlbumIds,
            cachedPlaylistIds
          );
          return visible1 === visible2;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Adding albums or playlists can only make section visible (never hide it)
   * Note: Adding songs alone does NOT make section visible (by design)
   */
  it('adding cached content never hides the section', () => {
    fc.assert(
      fc.property(
        songIdSetArb,
        songIdSetArb,
        songIdSetArb,
        songIdArb,
        (cachedSongIds, cachedAlbumIds, cachedPlaylistIds, newId) => {
          const visibleBefore = shouldShowCacheSection(
            cachedSongIds,
            cachedAlbumIds,
            cachedPlaylistIds
          );
          
          // Add a new album (not song, since songs don't affect visibility)
          const newCachedAlbumIds = new Set(cachedAlbumIds);
          newCachedAlbumIds.add(newId);
          
          const visibleAfter = shouldShowCacheSection(
            cachedSongIds,
            newCachedAlbumIds,
            cachedPlaylistIds
          );
          
          // If it was visible before, it should still be visible
          // Adding an album should make it visible
          if (visibleBefore) {
            return visibleAfter === true;
          }
          // After adding an album, it should be visible
          return visibleAfter === true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
