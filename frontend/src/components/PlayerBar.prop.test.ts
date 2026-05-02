/**
 * Property-based tests for PlayerBar button state logic
 * 
 * **Feature: player-bar-lyrics-queue-buttons**
 * Tests the correctness properties for button state in PlayerBar
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { NowPlayingSectionType } from '../store/playerStore';

// Type for button state
type ButtonState = 'active' | 'inactive' | 'disabled';

// Arbitrary for generating section types
const sectionArb = fc.constantFrom<NowPlayingSectionType>('lyrics', 'artist', 'queue');

// Arbitrary for generating player state relevant to button logic
const playerStateArb = fc.record({
  currentSong: fc.option(fc.record({
    id: fc.string(),
    name: fc.string(),
  }), { nil: null }),
  showNowPlaying: fc.boolean(),
  nowPlayingSection: sectionArb,
});

/**
 * Pure function to compute button state based on player state
 * This mirrors the logic in PlayerBar component
 */
function computeButtonState(
  section: 'lyrics' | 'queue',
  currentSong: unknown | null,
  showNowPlaying: boolean,
  nowPlayingSection: NowPlayingSectionType
): ButtonState {
  // If no song is playing, button is disabled
  if (!currentSong) {
    return 'disabled';
  }
  
  // If NowPlayingView is open and this section is active, button is active
  if (showNowPlaying && nowPlayingSection === section) {
    return 'active';
  }
  
  // Otherwise, button is inactive
  return 'inactive';
}

describe('PlayerBar Button State Logic', () => {
  /**
   * **Feature: player-bar-lyrics-queue-buttons, Property 2: Button active state synchronization**
   * 
   * *For any* player state where `showNowPlaying=true`, the button corresponding to 
   * `nowPlayingSection` SHALL be in active state, and other section buttons SHALL be in inactive state.
   * 
   * **Validates: Requirements 1.4, 1.5**
   */
  describe('Property 2: Button active state synchronization', () => {
    it('should show active state only for the current section button when NowPlayingView is open', () => {
      fc.assert(
        fc.property(
          sectionArb,
          fc.record({ id: fc.string(), name: fc.string() }), // non-null song
          (activeSection, song) => {
            const lyricsState = computeButtonState('lyrics', song, true, activeSection);
            const queueState = computeButtonState('queue', song, true, activeSection);
            
            // The button for the active section should be active
            if (activeSection === 'lyrics') {
              expect(lyricsState).toBe('active');
              expect(queueState).toBe('inactive');
            } else if (activeSection === 'queue') {
              expect(queueState).toBe('active');
              expect(lyricsState).toBe('inactive');
            } else {
              // artist section - both lyrics and queue should be inactive
              expect(lyricsState).toBe('inactive');
              expect(queueState).toBe('inactive');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show inactive state for all buttons when NowPlayingView is closed', () => {
      fc.assert(
        fc.property(
          sectionArb,
          fc.record({ id: fc.string(), name: fc.string() }), // non-null song
          (section, song) => {
            const lyricsState = computeButtonState('lyrics', song, false, section);
            const queueState = computeButtonState('queue', song, false, section);
            
            // Both buttons should be inactive when NowPlayingView is closed
            expect(lyricsState).toBe('inactive');
            expect(queueState).toBe('inactive');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: player-bar-lyrics-queue-buttons, Property 5: Button disabled state**
   * 
   * *For any* player state where `currentSong=null`, the lyrics and queue buttons SHALL be disabled.
   * 
   * **Validates: Requirements 3.1**
   */
  describe('Property 5: Button disabled state', () => {
    it('should disable both buttons when no song is playing', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          sectionArb,
          (showNowPlaying, section) => {
            const lyricsState = computeButtonState('lyrics', null, showNowPlaying, section);
            const queueState = computeButtonState('queue', null, showNowPlaying, section);
            
            // Both buttons should be disabled when no song is playing
            expect(lyricsState).toBe('disabled');
            expect(queueState).toBe('disabled');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not disable buttons when a song is playing', () => {
      fc.assert(
        fc.property(
          playerStateArb.filter(state => state.currentSong !== null),
          (state) => {
            const lyricsState = computeButtonState(
              'lyrics', 
              state.currentSong, 
              state.showNowPlaying, 
              state.nowPlayingSection
            );
            const queueState = computeButtonState(
              'queue', 
              state.currentSong, 
              state.showNowPlaying, 
              state.nowPlayingSection
            );
            
            // Neither button should be disabled when a song is playing
            expect(lyricsState).not.toBe('disabled');
            expect(queueState).not.toBe('disabled');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// Export for potential reuse
export { computeButtonState };
