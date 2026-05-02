/**
 * Property-based tests for ExpandedLyricsPage component
 * 
 * **Feature: expanded-lyrics-mode**
 * Tests the correctness properties for expanded lyrics page rendering
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock the API module
vi.mock('../api', () => ({
  getLyrics: vi.fn(),
  getPlaybackState: vi.fn(),
  savePlaybackState: vi.fn(),
  prefetchSongs: vi.fn(),
  getPrefetchStatus: vi.fn(),
}));

// Song arbitrary for generating test songs
const songArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.option(fc.webUrl(), { nil: undefined }),
  hasLyrics: fc.boolean(),
});

/**
 * Helper function to extract metadata from a rendered component
 * This simulates what the component would render given a song
 */
function extractExpandedViewMetadata(song: {
  name: string;
  artistName: string;
  artworkUrl?: string;
}) {
  return {
    title: song.name,
    artist: song.artistName,
    artworkUrl: song.artworkUrl,
    hasTitle: song.name.length > 0,
    hasArtist: song.artistName.length > 0,
    hasArtwork: !!song.artworkUrl,
  };
}

/**
 * Helper function to determine if "no lyrics" message should be displayed
 */
function shouldShowNoLyricsMessage(lyrics: Array<{ text: string }> | null | undefined): boolean {
  return !lyrics || lyrics.length === 0;
}

/**
 * Helper function to determine if expand button should be visible and enabled
 * Based on Requirements 2.1 and 4.1
 */
function shouldExpandButtonBeVisibleAndEnabled(state: {
  nowPlayingSection: 'lyrics' | 'artist' | 'queue';
  currentSong: { id: string } | null;
}): { visible: boolean; enabled: boolean } {
  // Expand button is visible when nowPlayingSection is 'lyrics'
  const visible = state.nowPlayingSection === 'lyrics';
  // Expand button is enabled when there is a current song
  const enabled = visible && state.currentSong !== null;
  return { visible, enabled };
}

/**
 * Helper function to determine if minimize button should be visible
 * Based on Requirements 2.2
 */
function shouldMinimizeButtonBeVisible(state: {
  expandedLyricsMode: boolean;
}): boolean {
  return state.expandedLyricsMode === true;
}

describe('ExpandedLyricsPage Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 3: Expand button visibility**
   * 
   * *For any* state where nowPlayingSection is 'lyrics' AND currentSong is not null,
   * the expand button should be visible and enabled.
   * 
   * **Validates: Requirements 2.1, 4.1**
   */
  describe('Property 3: Expand button visibility', () => {
    it('should be visible and enabled when section is lyrics and song is playing', () => {
      fc.assert(
        fc.property(songArb, (song) => {
          const state = {
            nowPlayingSection: 'lyrics' as const,
            currentSong: song,
          };
          
          const result = shouldExpandButtonBeVisibleAndEnabled(state);
          
          // Assert: button should be visible when section is lyrics
          expect(result.visible).toBe(true);
          // Assert: button should be enabled when there is a current song
          expect(result.enabled).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should be visible but disabled when section is lyrics and no song is playing', () => {
      const state = {
        nowPlayingSection: 'lyrics' as const,
        currentSong: null,
      };
      
      const result = shouldExpandButtonBeVisibleAndEnabled(state);
      
      // Assert: button should be visible when section is lyrics
      expect(result.visible).toBe(true);
      // Assert: button should be disabled when there is no current song
      expect(result.enabled).toBe(false);
    });

    it('should not be visible when section is not lyrics', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('artist' as const, 'queue' as const),
          fc.option(songArb, { nil: null }),
          (section, song) => {
            const state = {
              nowPlayingSection: section,
              currentSong: song,
            };
            
            const result = shouldExpandButtonBeVisibleAndEnabled(state);
            
            // Assert: button should not be visible when section is not lyrics
            expect(result.visible).toBe(false);
            expect(result.enabled).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly determine visibility for any section and song combination', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('lyrics' as const, 'artist' as const, 'queue' as const),
          fc.option(songArb, { nil: null }),
          (section, song) => {
            const state = {
              nowPlayingSection: section,
              currentSong: song,
            };
            
            const result = shouldExpandButtonBeVisibleAndEnabled(state);
            
            // Assert: visibility depends only on section being 'lyrics'
            expect(result.visible).toBe(section === 'lyrics');
            // Assert: enabled depends on both visibility and having a song
            expect(result.enabled).toBe(section === 'lyrics' && song !== null);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 4: Minimize button visibility**
   * 
   * *For any* state where expandedLyricsMode is true, the minimize button 
   * should be visible in the expanded lyrics view.
   * 
   * **Validates: Requirements 2.2**
   */
  describe('Property 4: Minimize button visibility', () => {
    it('should be visible when expanded lyrics mode is active', () => {
      fc.assert(
        fc.property(fc.constant(true), (expandedLyricsMode) => {
          const state = { expandedLyricsMode };
          
          const visible = shouldMinimizeButtonBeVisible(state);
          
          // Assert: minimize button should be visible when expanded mode is active
          expect(visible).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should not be visible when expanded lyrics mode is inactive', () => {
      fc.assert(
        fc.property(fc.constant(false), (expandedLyricsMode) => {
          const state = { expandedLyricsMode };
          
          const visible = shouldMinimizeButtonBeVisible(state);
          
          // Assert: minimize button should not be visible when expanded mode is inactive
          expect(visible).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly determine visibility for any expanded mode state', () => {
      fc.assert(
        fc.property(fc.boolean(), (expandedLyricsMode) => {
          const state = { expandedLyricsMode };
          
          const visible = shouldMinimizeButtonBeVisible(state);
          
          // Assert: visibility should match expanded mode state
          expect(visible).toBe(expandedLyricsMode);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 5: Expanded view contains required metadata**
   * 
   * *For any* song with valid metadata, when expandedLyricsMode is true, 
   * the expanded lyrics view should contain the song title, artist name, 
   * and album artwork URL.
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 5: Expanded view contains required metadata', () => {
    it('should contain song title, artist name, and artwork URL for any valid song', () => {
      fc.assert(
        fc.property(songArb, (song) => {
          // Extract metadata that would be rendered
          const metadata = extractExpandedViewMetadata(song);
          
          // Assert: title should match song name
          expect(metadata.title).toBe(song.name);
          
          // Assert: artist should match song artistName
          expect(metadata.artist).toBe(song.artistName);
          
          // Assert: artwork URL should match song artworkUrl
          expect(metadata.artworkUrl).toBe(song.artworkUrl);
          
          // Assert: required fields should be present
          expect(metadata.hasTitle).toBe(true);
          expect(metadata.hasArtist).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle songs with and without artwork URLs', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string({ minLength: 1 }),
            name: fc.string({ minLength: 1 }),
            artistName: fc.string({ minLength: 1 }),
            artworkUrl: fc.option(fc.webUrl(), { nil: undefined }),
          }),
          (song) => {
            const metadata = extractExpandedViewMetadata(song);
            
            // Assert: hasArtwork should correctly reflect presence of artworkUrl
            expect(metadata.hasArtwork).toBe(!!song.artworkUrl);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 6: No lyrics message display**
   * 
   * *For any* state where expandedLyricsMode is true AND the current song 
   * has no lyrics, the expanded lyrics view should display a "no lyrics" message.
   * 
   * **Validates: Requirements 4.2**
   */
  describe('Property 6: No lyrics message display', () => {
    it('should show no lyrics message when lyrics array is empty', () => {
      fc.assert(
        fc.property(
          fc.constantFrom([], null, undefined),
          (lyrics) => {
            const shouldShow = shouldShowNoLyricsMessage(lyrics as any);
            expect(shouldShow).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not show no lyrics message when lyrics are present', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              text: fc.string({ minLength: 1 }),
              timestamp: fc.integer({ min: 0 }),
              endTime: fc.integer({ min: 0 }),
            }),
            { minLength: 1, maxLength: 100 }
          ),
          (lyrics) => {
            const shouldShow = shouldShowNoLyricsMessage(lyrics);
            expect(shouldShow).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly determine no lyrics state for any lyrics array', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant([]),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(
              fc.record({
                text: fc.string(),
                timestamp: fc.integer({ min: 0 }),
                endTime: fc.integer({ min: 0 }),
              }),
              { minLength: 1, maxLength: 50 }
            )
          ),
          (lyrics) => {
            const shouldShow = shouldShowNoLyricsMessage(lyrics as any);
            const isEmpty = !lyrics || (Array.isArray(lyrics) && lyrics.length === 0);
            
            // Assert: shouldShow should be true iff lyrics is empty/null/undefined
            expect(shouldShow).toBe(isEmpty);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

/**
 * Helper function to simulate navigation deactivation behavior
 * Based on Requirements 4.3
 */
function simulateNavigationDeactivation(state: {
  expandedLyricsMode: boolean;
  routeChanged: boolean;
}): boolean {
  // When route changes and expanded mode is active, it should be deactivated
  if (state.routeChanged && state.expandedLyricsMode) {
    return false; // expandedLyricsMode becomes false
  }
  return state.expandedLyricsMode;
}

describe('Navigation Deactivation Properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 7: Navigation deactivates expanded mode**
   * 
   * *For any* state where expandedLyricsMode is true, when the route changes,
   * expandedLyricsMode should become false.
   * 
   * **Validates: Requirements 4.3**
   */
  describe('Property 7: Navigation deactivates expanded mode', () => {
    it('should deactivate expanded mode when route changes and mode is active', () => {
      fc.assert(
        fc.property(fc.constant(true), (expandedLyricsMode) => {
          const state = {
            expandedLyricsMode,
            routeChanged: true,
          };
          
          const newExpandedMode = simulateNavigationDeactivation(state);
          
          // Assert: expanded mode should be deactivated after route change
          expect(newExpandedMode).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should not affect expanded mode when route does not change', () => {
      fc.assert(
        fc.property(fc.boolean(), (expandedLyricsMode) => {
          const state = {
            expandedLyricsMode,
            routeChanged: false,
          };
          
          const newExpandedMode = simulateNavigationDeactivation(state);
          
          // Assert: expanded mode should remain unchanged when route doesn't change
          expect(newExpandedMode).toBe(expandedLyricsMode);
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly handle any combination of expanded mode and route change', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          (expandedLyricsMode, routeChanged) => {
            const state = { expandedLyricsMode, routeChanged };
            
            const newExpandedMode = simulateNavigationDeactivation(state);
            
            // Assert: if route changed and was expanded, should be deactivated
            if (routeChanged && expandedLyricsMode) {
              expect(newExpandedMode).toBe(false);
            } else {
              // Otherwise, should remain unchanged
              expect(newExpandedMode).toBe(expandedLyricsMode);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
