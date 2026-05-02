import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getTrackPlayIcon,
  shouldHighlightTrack,
  shouldShowPlayButton,
  shouldShowTrackIndex,
  TrackPlayState,
} from './albumTrackState';

// Generator for TrackPlayState
const trackPlayStateArb = fc.record({
  isCurrentSong: fc.boolean(),
  isPlaying: fc.boolean(),
  isHovered: fc.boolean(),
});

describe('Album Track State Property Tests', () => {
  /**
   * **Feature: album-play-button-consistency, Property 2: Playing song shows pause icon on hover**
   * 
   * For any album track row where the track is the current playing song and is playing,
   * when hovered, the displayed icon should be the pause icon.
   * 
   * **Validates: Requirements 1.2**
   */
  it('Property 2: Playing song shows pause icon when isCurrentSong && isPlaying', () => {
    fc.assert(
      fc.property(trackPlayStateArb, (state: TrackPlayState) => {
        const icon = getTrackPlayIcon(state);
        
        if (state.isCurrentSong && state.isPlaying) {
          expect(icon).toBe('pause');
        } else {
          expect(icon).toBe('play');
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: album-play-button-consistency, Property 3: Current song visual highlight**
   * 
   * For any album track row where the track is the current playing song,
   * both the track index and track title should have the green highlight color applied.
   * 
   * **Validates: Requirements 1.3, 1.4**
   */
  it('Property 3: Current song should be highlighted', () => {
    fc.assert(
      fc.property(fc.boolean(), (isCurrentSong: boolean) => {
        const shouldHighlight = shouldHighlightTrack(isCurrentSong);
        expect(shouldHighlight).toBe(isCurrentSong);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: album-play-button-consistency, Property 1: Hover state shows play button**
   * 
   * For any album track row, when the row is in hovered state,
   * the play button should be visible and the track index should be hidden.
   * 
   * **Validates: Requirements 1.1**
   */
  it('Property 1: Hover state toggles play button and index visibility', () => {
    fc.assert(
      fc.property(fc.boolean(), (isHovered: boolean) => {
        const showPlayButton = shouldShowPlayButton(isHovered);
        const showTrackIndex = shouldShowTrackIndex(isHovered);
        
        // Play button visible when hovered
        expect(showPlayButton).toBe(isHovered);
        // Track index visible when NOT hovered
        expect(showTrackIndex).toBe(!isHovered);
        // They should be mutually exclusive
        expect(showPlayButton).not.toBe(showTrackIndex);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Additional test: Icon selection is deterministic
   * The same state should always produce the same icon
   */
  it('Icon selection is deterministic for same state', () => {
    fc.assert(
      fc.property(trackPlayStateArb, (state: TrackPlayState) => {
        const icon1 = getTrackPlayIcon(state);
        const icon2 = getTrackPlayIcon(state);
        expect(icon1).toBe(icon2);
      }),
      { numRuns: 100 }
    );
  });
});
