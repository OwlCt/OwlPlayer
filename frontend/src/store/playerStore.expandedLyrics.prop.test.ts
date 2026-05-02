/**
 * Property-based tests for Expanded Lyrics Mode
 * 
 * **Feature: expanded-lyrics-mode**
 * Tests the correctness properties for expanded lyrics mode state management
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { 
  usePlayerStore, 
  NowPlayingSectionType,
  EXPANDED_LYRICS_KEY,
  loadExpandedLyricsMode,
  saveExpandedLyricsMode
} from './playerStore';

// Mock the API module
vi.mock('../api', () => ({
  getPlaybackState: vi.fn(),
  savePlaybackState: vi.fn(),
  prefetchSongs: vi.fn(),
  getPrefetchStatus: vi.fn(),
}));

// Arbitrary for generating NowPlayingSection types
const nowPlayingSectionArb = fc.constantFrom<NowPlayingSectionType>('lyrics', 'artist', 'queue');

describe('Expanded Lyrics Mode', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePlayerStore.setState({
      expandedLyricsMode: false,
      previousNowPlayingSection: null,
      nowPlayingSection: 'artist',
      showNowPlaying: true,
    });
    
    // Clear localStorage
    localStorage.clear();
    
    // Reset mocks
    vi.clearAllMocks();
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 9: Persistence round-trip**
   * 
   * *For any* expandedLyricsMode value, saving to localStorage then loading 
   * should return the same value.
   * 
   * **Validates: Requirements 5.2, 5.3**
   */
  describe('Property 9: Persistence round-trip', () => {
    it('should persist and restore expandedLyricsMode correctly', () => {
      fc.assert(
        fc.property(fc.boolean(), (expanded) => {
          // Clear localStorage before each iteration
          localStorage.removeItem(EXPANDED_LYRICS_KEY);
          
          // Save the value
          saveExpandedLyricsMode(expanded);
          
          // Load the value
          const loaded = loadExpandedLyricsMode();
          
          // Assert: loaded value should match saved value
          expect(loaded).toBe(expanded);
        }),
        { numRuns: 100 }
      );
    });

    it('should default to false when localStorage is empty', () => {
      localStorage.removeItem(EXPANDED_LYRICS_KEY);
      const loaded = loadExpandedLyricsMode();
      expect(loaded).toBe(false);
    });

    it('should handle invalid localStorage values gracefully', () => {
      localStorage.setItem(EXPANDED_LYRICS_KEY, 'invalid');
      const loaded = loadExpandedLyricsMode();
      expect(loaded).toBe(false);
    });
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 1: Activation sets expanded mode and switches NowPlayingView to artist**
   * 
   * *For any* initial state where a song is playing and NowPlayingView is showing any section,
   * when activateExpandedLyrics is called, the expandedLyricsMode should be true 
   * AND nowPlayingSection should be 'artist'.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */
  describe('Property 1: Activation sets expanded mode and switches NowPlayingView to artist', () => {
    it('should set expandedLyricsMode to true and nowPlayingSection to artist', () => {
      fc.assert(
        fc.property(nowPlayingSectionArb, (initialSection) => {
          // Setup: set initial state with any section
          usePlayerStore.setState({
            expandedLyricsMode: false,
            previousNowPlayingSection: null,
            nowPlayingSection: initialSection,
          });
          
          // Action: activate expanded lyrics
          usePlayerStore.getState().activateExpandedLyrics();
          
          // Assert
          const state = usePlayerStore.getState();
          expect(state.expandedLyricsMode).toBe(true);
          expect(state.nowPlayingSection).toBe('artist');
          expect(state.previousNowPlayingSection).toBe(initialSection);
        }),
        { numRuns: 100 }
      );
    });

    it('should persist expandedLyricsMode to localStorage', () => {
      fc.assert(
        fc.property(nowPlayingSectionArb, (initialSection) => {
          localStorage.removeItem(EXPANDED_LYRICS_KEY);
          
          usePlayerStore.setState({
            expandedLyricsMode: false,
            nowPlayingSection: initialSection,
          });
          
          usePlayerStore.getState().activateExpandedLyrics();
          
          // Assert: localStorage should have 'true'
          expect(localStorage.getItem(EXPANDED_LYRICS_KEY)).toBe('true');
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 2: Deactivation switches to lyrics section**
   * 
   * *For any* initial state, deactivating expanded lyrics mode 
   * should set nowPlayingSection to 'lyrics' (to show normal lyrics in NowPlayingView).
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 2: Deactivation switches to lyrics section', () => {
    it('should set nowPlayingSection to lyrics after deactivate', () => {
      fc.assert(
        fc.property(nowPlayingSectionArb, (initialSection) => {
          // Setup: set initial state
          usePlayerStore.setState({
            expandedLyricsMode: false,
            previousNowPlayingSection: null,
            nowPlayingSection: initialSection,
          });
          
          // Action: activate then deactivate
          usePlayerStore.getState().activateExpandedLyrics();
          usePlayerStore.getState().deactivateExpandedLyrics();
          
          // Assert: should switch to lyrics section
          const state = usePlayerStore.getState();
          expect(state.expandedLyricsMode).toBe(false);
          expect(state.nowPlayingSection).toBe('lyrics');
        }),
        { numRuns: 100 }
      );
    });

    it('should set nowPlayingSection to lyrics when deactivating', () => {
      // Setup: manually set state with expanded mode active
      usePlayerStore.setState({
        expandedLyricsMode: true,
        previousNowPlayingSection: null,
        nowPlayingSection: 'artist',
      });
      
      // Action: deactivate
      usePlayerStore.getState().deactivateExpandedLyrics();
      
      // Assert: should switch to 'lyrics'
      const state = usePlayerStore.getState();
      expect(state.nowPlayingSection).toBe('lyrics');
    });

    it('should persist expandedLyricsMode false to localStorage on deactivate', () => {
      localStorage.setItem(EXPANDED_LYRICS_KEY, 'true');
      
      usePlayerStore.setState({
        expandedLyricsMode: true,
        previousNowPlayingSection: 'lyrics',
        nowPlayingSection: 'artist',
      });
      
      usePlayerStore.getState().deactivateExpandedLyrics();
      
      // Assert: localStorage should have 'false'
      expect(localStorage.getItem(EXPANDED_LYRICS_KEY)).toBe('false');
    });
  });

  /**
   * **Feature: expanded-lyrics-mode, Property 8: Expanded mode preference is preserved**
   * 
   * *For any* state where expandedLyricsMode is true, the preference should be preserved
   * even when lyricsVisible is toggled off and on. This allows users to remember their
   * preferred lyrics view mode.
   * 
   * **Validates: Requirements for lyrics button memory**
   */
  describe('Property 8: Expanded mode preference is preserved', () => {
    it('should preserve expandedLyricsMode when toggling lyrics visibility', () => {
      fc.assert(
        fc.property(nowPlayingSectionArb, (initialSection) => {
          // Setup: expanded lyrics mode is active
          usePlayerStore.setState({
            expandedLyricsMode: true,
            lyricsVisible: true,
            previousNowPlayingSection: initialSection,
            nowPlayingSection: 'artist',
            showNowPlaying: true,
          });
          
          // Action: toggle lyrics visibility off
          usePlayerStore.getState().toggleLyricsVisibility();
          
          // Assert: expandedLyricsMode should still be true (preference preserved)
          let state = usePlayerStore.getState();
          expect(state.expandedLyricsMode).toBe(true);
          expect(state.lyricsVisible).toBe(false);
          
          // Action: toggle lyrics visibility on
          usePlayerStore.getState().toggleLyricsVisibility();
          
          // Assert: should restore expanded lyrics mode
          state = usePlayerStore.getState();
          expect(state.expandedLyricsMode).toBe(true);
          expect(state.lyricsVisible).toBe(true);
          expect(state.nowPlayingSection).toBe('artist');
        }),
        { numRuns: 100 }
      );
    });

    it('should show normal lyrics when expandedLyricsMode is false', () => {
      fc.assert(
        fc.property(nowPlayingSectionArb, (initialSection) => {
          // Setup: expanded lyrics mode is NOT active
          usePlayerStore.setState({
            expandedLyricsMode: false,
            lyricsVisible: false,
            previousNowPlayingSection: null,
            nowPlayingSection: initialSection,
            showNowPlaying: false,
          });
          
          // Action: toggle lyrics visibility on
          usePlayerStore.getState().toggleLyricsVisibility();
          
          // Assert: should show normal lyrics in NowPlayingView
          const state = usePlayerStore.getState();
          expect(state.expandedLyricsMode).toBe(false);
          expect(state.lyricsVisible).toBe(true);
          expect(state.showNowPlaying).toBe(true);
          expect(state.nowPlayingSection).toBe('lyrics');
        }),
        { numRuns: 100 }
      );
    });

    it('should persist expandedLyricsMode to localStorage', () => {
      localStorage.removeItem(EXPANDED_LYRICS_KEY);
      
      // Setup: activate expanded lyrics
      usePlayerStore.setState({
        expandedLyricsMode: false,
        lyricsVisible: false,
        nowPlayingSection: 'artist',
        showNowPlaying: false,
      });
      
      usePlayerStore.getState().activateExpandedLyrics();
      
      // Assert: localStorage should have 'true'
      expect(localStorage.getItem(EXPANDED_LYRICS_KEY)).toBe('true');
      
      // Toggle lyrics off and on
      usePlayerStore.getState().toggleLyricsVisibility();
      usePlayerStore.getState().toggleLyricsVisibility();
      
      // Assert: localStorage should still have 'true'
      expect(localStorage.getItem(EXPANDED_LYRICS_KEY)).toBe('true');
    });
  });
});
