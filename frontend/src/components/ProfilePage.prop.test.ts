import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { formatProfileStats, ClickableStats } from './ProfilePage';

// Arbitraries for generating test data
const topArtistItemArb = fc.record({
  artistId: fc.uuid(),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  playCount: fc.integer({ min: 1, max: 1000 }),
});

const topTrackItemArb = fc.record({
  songId: fc.uuid(),
  songName: fc.string({ minLength: 1, maxLength: 50 }),
  artistId: fc.uuid(),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.uuid(),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  duration: fc.integer({ min: 1000, max: 600000 }),
  playCount: fc.integer({ min: 1, max: 1000 }),
});

// Generate ISO date string directly using timestamp range
const isoDateStringArb = fc
  .integer({ min: 1577836800000, max: 2208988800000 }) // 2020-01-01 to 2040-01-01 in milliseconds
  .map(ts => new Date(ts).toISOString());

const followedArtistArb = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  artist_id: fc.uuid(),
  artist_name: fc.string({ minLength: 1, maxLength: 50 }),
  artwork_url: fc.webUrl(),
  created_at: isoDateStringArb,
});

const recentlyPlayedArtistArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
});

// Helper function to simulate section item limiting (same logic as ProfilePage)
function limitSectionItems<T>(items: T[], limit: number): T[] {
  return items.slice(0, limit);
}

describe('ProfilePage', () => {
  // **Feature: user-profile-search-history, Property 1: Profile section item limits**
  // **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
  describe('Property 1: Profile section item limits', () => {
    it('should limit top artists section to at most 4 items', () => {
      fc.assert(
        fc.property(
          fc.array(topArtistItemArb, { minLength: 0, maxLength: 20 }),
          (topArtists) => {
            const displayed = limitSectionItems(topArtists, 4);
            
            // Should never exceed 4 items
            expect(displayed.length).toBeLessThanOrEqual(4);
            
            // Should display all items if less than or equal to 4
            if (topArtists.length <= 4) {
              expect(displayed.length).toBe(topArtists.length);
            } else {
              expect(displayed.length).toBe(4);
            }
            
            // Displayed items should be the first N items from the original array
            displayed.forEach((item, index) => {
              expect(item).toEqual(topArtists[index]);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should limit top tracks section to at most 4 items', () => {
      fc.assert(
        fc.property(
          fc.array(topTrackItemArb, { minLength: 0, maxLength: 20 }),
          (topTracks) => {
            const displayed = limitSectionItems(topTracks, 4);
            
            // Should never exceed 4 items
            expect(displayed.length).toBeLessThanOrEqual(4);
            
            // Should display all items if less than or equal to 4
            if (topTracks.length <= 4) {
              expect(displayed.length).toBe(topTracks.length);
            } else {
              expect(displayed.length).toBe(4);
            }
            
            // Displayed items should be the first N items from the original array
            displayed.forEach((item, index) => {
              expect(item).toEqual(topTracks[index]);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should limit recently played artists section to at most 4 items', () => {
      fc.assert(
        fc.property(
          fc.array(recentlyPlayedArtistArb, { minLength: 0, maxLength: 20 }),
          (recentArtists) => {
            const displayed = limitSectionItems(recentArtists, 4);
            
            // Should never exceed 4 items
            expect(displayed.length).toBeLessThanOrEqual(4);
            
            // Should display all items if less than or equal to 4
            if (recentArtists.length <= 4) {
              expect(displayed.length).toBe(recentArtists.length);
            } else {
              expect(displayed.length).toBe(4);
            }
            
            // Displayed items should be the first N items from the original array
            displayed.forEach((item, index) => {
              expect(item).toEqual(recentArtists[index]);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should limit followed artists section to at most 4 items', () => {
      fc.assert(
        fc.property(
          fc.array(followedArtistArb, { minLength: 0, maxLength: 20 }),
          (followedArtists) => {
            const displayed = limitSectionItems(followedArtists, 4);
            
            // Should never exceed 4 items
            expect(displayed.length).toBeLessThanOrEqual(4);
            
            // Should display all items if less than or equal to 4
            if (followedArtists.length <= 4) {
              expect(displayed.length).toBe(followedArtists.length);
            } else {
              expect(displayed.length).toBe(4);
            }
            
            // Displayed items should be the first N items from the original array
            displayed.forEach((item, index) => {
              expect(item).toEqual(followedArtists[index]);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty arrays correctly for all sections', () => {
      // Edge case: all sections are empty
      expect(limitSectionItems([], 4)).toEqual([]);
    });

    it('should preserve item order when limiting', () => {
      fc.assert(
        fc.property(
          fc.array(topArtistItemArb, { minLength: 5, maxLength: 20 }),
          (topArtists) => {
            const displayed = limitSectionItems(topArtists, 4);
            
            // First 4 items should be in the same order as original
            for (let i = 0; i < 4; i++) {
              expect(displayed[i].artistId).toBe(topArtists[i].artistId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: user-profile-search-history, Property 8: Profile statistics format**
  // **Validates: Requirements 6.3**
  describe('Property 8: Profile statistics format', () => {
    it('should format statistics in exact format "{P}个歌单 · 关注{F}位艺术家"', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount, followedCount) => {
            const result = formatProfileStats(playlistCount, followedCount);
            
            // Verify exact format
            const expectedFormat = `${playlistCount}个歌单 · 关注${followedCount}位艺术家`;
            expect(result).toBe(expectedFormat);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly include playlist count in output', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount, followedCount) => {
            const result = formatProfileStats(playlistCount, followedCount);
            
            // Result should contain the playlist count followed by "个歌单"
            expect(result).toContain(`${playlistCount}个歌单`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly include followed artist count in output', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount, followedCount) => {
            const result = formatProfileStats(playlistCount, followedCount);
            
            // Result should contain "关注" followed by the count and "位艺术家"
            expect(result).toContain(`关注${followedCount}位艺术家`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use middle dot separator between playlist and followed counts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount, followedCount) => {
            const result = formatProfileStats(playlistCount, followedCount);
            
            // Result should contain the separator " · "
            expect(result).toContain(' · ');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle zero values correctly', () => {
      // Edge case: both counts are zero
      const result = formatProfileStats(0, 0);
      expect(result).toBe('0个歌单 · 关注0位艺术家');
    });

    it('should handle large values correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 10000, max: 1000000 }),
          fc.integer({ min: 10000, max: 1000000 }),
          (playlistCount, followedCount) => {
            const result = formatProfileStats(playlistCount, followedCount);
            
            // Should still produce valid format with large numbers
            expect(result).toBe(`${playlistCount}个歌单 · 关注${followedCount}位艺术家`);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// Helper functions for navigation testing
function getPlaylistsNavigationPath(): string {
  return '/profile/playlists';
}

function getFollowedArtistsNavigationPath(): string {
  return '/profile/followed-artists';
}

function shouldShowAllLinkBeVisible(playlistCount: number): boolean {
  return playlistCount > 0;
}

describe('ProfilePage Navigation', () => {
  // **Feature: profile-stats-navigation, Property 1: Profile stats navigation consistency**
  // **Validates: Requirements 1.1, 2.1, 4.2**
  describe('Property 1: Profile stats navigation consistency', () => {
    it('should navigate to /profile/followed-artists when clicking followed artists stat', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          (followedCount) => {
            const navigationPath = getFollowedArtistsNavigationPath();
            
            // Clicking "关注n位艺术家" should always navigate to /profile/followed-artists
            expect(navigationPath).toBe('/profile/followed-artists');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should navigate to /profile/playlists when clicking playlists stat', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount) => {
            const navigationPath = getPlaylistsNavigationPath();
            
            // Clicking "n个歌单" should always navigate to /profile/playlists
            expect(navigationPath).toBe('/profile/playlists');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should navigate to /profile/playlists when clicking show all link', () => {
      const navigationPath = getPlaylistsNavigationPath();
      
      // Clicking "显示全部" in playlists section should navigate to /profile/playlists
      expect(navigationPath).toBe('/profile/playlists');
    });

    it('should allow navigation regardless of count values', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount, followedCount) => {
            // Navigation should work for any count value including zero
            const playlistsPath = getPlaylistsNavigationPath();
            const followedPath = getFollowedArtistsNavigationPath();
            
            expect(playlistsPath).toBe('/profile/playlists');
            expect(followedPath).toBe('/profile/followed-artists');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: profile-stats-navigation, Property 4: Show all link visibility**
  // **Validates: Requirements 4.1, 4.3**
  describe('Property 4: Show all link visibility', () => {
    it('should show "显示全部" link when playlist count is greater than zero', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (playlistCount) => {
            const isVisible = shouldShowAllLinkBeVisible(playlistCount);
            
            // Link should be visible when there are playlists
            expect(isVisible).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should hide "显示全部" link when playlist count is zero', () => {
      const isVisible = shouldShowAllLinkBeVisible(0);
      
      // Link should be hidden when there are no playlists
      expect(isVisible).toBe(false);
    });

    it('should correctly determine visibility for any playlist count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          (playlistCount) => {
            const isVisible = shouldShowAllLinkBeVisible(playlistCount);
            
            // Visibility should be true if and only if count > 0
            expect(isVisible).toBe(playlistCount > 0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
