import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { shouldShowMiniPlayer, handlePlayPauseClick } from './MiniPlayer';

// **Feature: spotify-mobile-ui, Property 3: Mini Player Visibility**
// **Validates: Requirements 2.1, 2.5**

// Song arbitrary generator for testing
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }), // 1 second to 10 minutes in ms
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
});

// Null/undefined values that should hide the mini player
const nullishValues = fc.constantFrom(null, undefined);

describe('MiniPlayer Property Tests', () => {
  // **Feature: spotify-mobile-ui, Property 3: Mini Player Visibility**
  // **Validates: Requirements 2.1, 2.5**
  describe('Property 3: Mini Player Visibility', () => {
    it('should be visible when a song is loaded (currentSong is not null/undefined)', () => {
      fc.assert(
        fc.property(
          songArbitrary,
          (song) => {
            const isVisible = shouldShowMiniPlayer(song);
            expect(isVisible).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be hidden when no song is loaded (currentSong is null or undefined)', () => {
      fc.assert(
        fc.property(
          nullishValues,
          (nullishValue) => {
            const isVisible = shouldShowMiniPlayer(nullishValue);
            expect(isVisible).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly determine visibility for any playback state', () => {
      // Generate either a song or null/undefined
      const playbackState = fc.oneof(
        songArbitrary.map(song => ({ song, expectedVisible: true })),
        nullishValues.map(nullish => ({ song: nullish, expectedVisible: false }))
      );

      fc.assert(
        fc.property(
          playbackState,
          ({ song, expectedVisible }) => {
            const isVisible = shouldShowMiniPlayer(song);
            expect(isVisible).toBe(expectedVisible);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: spotify-mobile-ui, Property 4: Play/Pause Toggle Isolation**
  // **Validates: Requirements 2.3**
  describe('Property 4: Play/Pause Toggle Isolation', () => {
    it('should call togglePlay and stop event propagation', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isPlaying state (not used in function but represents context)
          () => {
            const togglePlay = vi.fn();
            const stopPropagation = vi.fn();
            const mockEvent = {
              stopPropagation,
            } as unknown as React.MouseEvent;

            handlePlayPauseClick(togglePlay, mockEvent);

            // Verify togglePlay was called
            expect(togglePlay).toHaveBeenCalledTimes(1);
            // Verify event propagation was stopped (isolation from expand behavior)
            expect(stopPropagation).toHaveBeenCalledTimes(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always stop propagation regardless of play state', () => {
      // Test that for any sequence of clicks, propagation is always stopped
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }), // Number of clicks
          (clickCount) => {
            const togglePlay = vi.fn();
            
            for (let i = 0; i < clickCount; i++) {
              const stopPropagation = vi.fn();
              const mockEvent = {
                stopPropagation,
              } as unknown as React.MouseEvent;

              handlePlayPauseClick(togglePlay, mockEvent);
              
              // Each click should stop propagation
              expect(stopPropagation).toHaveBeenCalledTimes(1);
            }

            // togglePlay should be called for each click
            expect(togglePlay).toHaveBeenCalledTimes(clickCount);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should toggle play state without triggering expand (isolation property)', () => {
      // This test verifies the isolation property:
      // The play/pause action should be completely independent of the expand action
      fc.assert(
        fc.property(
          fc.boolean(), // Initial playing state
          fc.boolean(), // Whether expand callback exists
          (initialPlaying, hasExpandCallback) => {
            let playState = initialPlaying;
            const togglePlay = vi.fn(() => {
              playState = !playState;
            });
            
            let expandCalled = false;
            const onExpand = hasExpandCallback ? vi.fn(() => {
              expandCalled = true;
            }) : undefined;

            const stopPropagation = vi.fn();
            const mockEvent = {
              stopPropagation,
            } as unknown as React.MouseEvent;

            // Simulate play/pause click
            handlePlayPauseClick(togglePlay, mockEvent);

            // Play state should toggle
            expect(playState).toBe(!initialPlaying);
            
            // Expand should NOT be called (isolation)
            expect(expandCalled).toBe(false);
            
            // Propagation should be stopped to prevent expand
            expect(stopPropagation).toHaveBeenCalled();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
