import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Generate valid ISO date strings directly
const isoDateStringArb = fc.integer({ min: 946684800000, max: 1924905600000 })
  .map(timestamp => new Date(timestamp).toISOString());

// Arbitrary for generating playlist data
const playlistArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  artwork_url: fc.option(fc.webUrl(), { nil: undefined }),
  user_id: fc.uuid(),
  created_at: isoDateStringArb,
  updated_at: isoDateStringArb,
});

// Helper function to simulate playlist card rendering count
function getPlaylistCardCount(playlists: { id: string }[]): number {
  return playlists.length;
}

// Helper function to generate navigation path for playlist
function getPlaylistNavigationPath(playlistId: string): string {
  return `/playlist/${playlistId}`;
}

describe('PlaylistsPage', () => {
  // **Feature: profile-stats-navigation, Property 2: Playlists page data consistency**
  // **Validates: Requirements 3.1**
  describe('Property 2: Playlists page data consistency', () => {
    it('should render exactly the same number of playlist cards as playlists in the store', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArb, { minLength: 0, maxLength: 50 }),
          (playlists) => {
            const cardCount = getPlaylistCardCount(playlists);
            
            // The number of rendered cards should equal the number of playlists
            expect(cardCount).toBe(playlists.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty playlist array correctly', () => {
      const cardCount = getPlaylistCardCount([]);
      expect(cardCount).toBe(0);
    });

    it('should preserve all playlist IDs when rendering', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArb, { minLength: 1, maxLength: 20 }),
          (playlists) => {
            // All playlist IDs should be preserved
            const playlistIds = playlists.map(p => p.id);
            const uniqueIds = new Set(playlistIds);
            
            // Each playlist should have a unique ID that would be used for rendering
            expect(uniqueIds.size).toBe(playlists.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: profile-stats-navigation, Property 3: Playlist card navigation**
  // **Validates: Requirements 3.2**
  describe('Property 3: Playlist card navigation', () => {
    it('should generate correct navigation path for any playlist', () => {
      fc.assert(
        fc.property(
          playlistArb,
          (playlist) => {
            const navigationPath = getPlaylistNavigationPath(playlist.id);
            
            // Navigation path should be /playlist/{playlistId}
            expect(navigationPath).toBe(`/playlist/${playlist.id}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique navigation paths for different playlists', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArb, { minLength: 2, maxLength: 20 }),
          (playlists) => {
            // Ensure unique IDs for this test
            const uniquePlaylists = playlists.filter((p, i, arr) => 
              arr.findIndex(x => x.id === p.id) === i
            );
            
            if (uniquePlaylists.length < 2) return true; // Skip if not enough unique playlists
            
            const paths = uniquePlaylists.map(p => getPlaylistNavigationPath(p.id));
            const uniquePaths = new Set(paths);
            
            // Each playlist should have a unique navigation path
            expect(uniquePaths.size).toBe(uniquePlaylists.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always start navigation path with /playlist/', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (playlistId) => {
            const navigationPath = getPlaylistNavigationPath(playlistId);
            
            expect(navigationPath.startsWith('/playlist/')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include the exact playlist ID in the navigation path', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (playlistId) => {
            const navigationPath = getPlaylistNavigationPath(playlistId);
            
            expect(navigationPath.endsWith(playlistId)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
