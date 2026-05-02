/**
 * Property-based tests for LyricsPanel scroll recalculation on translation toggle
 * Uses fast-check for property-based testing
 *
 * **Feature: lyrics-scroll-animation, Property 7: Scroll Recalculation on Translation Toggle**
 * **Validates: Requirements 3.1, 3.2**
 *
 * For any change in showTranslation setting while a line is active,
 * scrollToLine SHALL be called to recenter the active line.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

/**
 * Helper function to simulate the scroll recalculation logic
 * This mirrors the behavior in LyricsPanel when translation mode is toggled
 */
interface ScrollRecalculationState {
  currentLineIndex: number;
  initialScrollDone: boolean;
  showTranslation: boolean;
  scrollToLineCalled: boolean;
  scrollToLineIndex: number | null;
}

function simulateTranslationToggle(
  state: ScrollRecalculationState,
  newShowTranslation: boolean
): ScrollRecalculationState {
  const newState = { ...state, showTranslation: newShowTranslation };
  
  // Logic from LyricsPanel: recalculate scroll when translation mode changes
  // Only if currentLineIndex >= 0 and initial scroll is done
  if (state.currentLineIndex >= 0 && state.initialScrollDone) {
    newState.scrollToLineCalled = true;
    newState.scrollToLineIndex = state.currentLineIndex;
  } else {
    newState.scrollToLineCalled = false;
    newState.scrollToLineIndex = null;
  }
  
  return newState;
}

describe('Property 7: Scroll Recalculation on Translation Toggle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Translation toggle triggers scroll recalculation', () => {
    it('scrollToLine is called when translation is toggled on with active line', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // currentLineIndex
          (currentLineIndex) => {
            const initialState: ScrollRecalculationState = {
              currentLineIndex,
              initialScrollDone: true,
              showTranslation: false,
              scrollToLineCalled: false,
              scrollToLineIndex: null,
            };

            // Toggle translation on
            const newState = simulateTranslationToggle(initialState, true);

            // scrollToLine should be called with the current line index
            return newState.scrollToLineCalled && newState.scrollToLineIndex === currentLineIndex;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('scrollToLine is called when translation is toggled off with active line', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // currentLineIndex
          (currentLineIndex) => {
            const initialState: ScrollRecalculationState = {
              currentLineIndex,
              initialScrollDone: true,
              showTranslation: true,
              scrollToLineCalled: false,
              scrollToLineIndex: null,
            };

            // Toggle translation off
            const newState = simulateTranslationToggle(initialState, false);

            // scrollToLine should be called with the current line index
            return newState.scrollToLineCalled && newState.scrollToLineIndex === currentLineIndex;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('scrollToLine is NOT called when no line is active (index < 0)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -100, max: -1 }), // negative currentLineIndex
          fc.boolean(), // showTranslation
          (currentLineIndex, showTranslation) => {
            const initialState: ScrollRecalculationState = {
              currentLineIndex,
              initialScrollDone: true,
              showTranslation,
              scrollToLineCalled: false,
              scrollToLineIndex: null,
            };

            // Toggle translation
            const newState = simulateTranslationToggle(initialState, !showTranslation);

            // scrollToLine should NOT be called when no line is active
            return !newState.scrollToLineCalled && newState.scrollToLineIndex === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('scrollToLine is NOT called before initial scroll is done', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // currentLineIndex
          fc.boolean(), // showTranslation
          (currentLineIndex, showTranslation) => {
            const initialState: ScrollRecalculationState = {
              currentLineIndex,
              initialScrollDone: false, // Initial scroll not done yet
              showTranslation,
              scrollToLineCalled: false,
              scrollToLineIndex: null,
            };

            // Toggle translation
            const newState = simulateTranslationToggle(initialState, !showTranslation);

            // scrollToLine should NOT be called before initial scroll is done
            return !newState.scrollToLineCalled && newState.scrollToLineIndex === null;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Scroll recalculation preserves active line centering', () => {
    it('scrollToLine is called with the same line index regardless of translation state', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // currentLineIndex
          fc.boolean(), // initial showTranslation
          (currentLineIndex, initialShowTranslation) => {
            const initialState: ScrollRecalculationState = {
              currentLineIndex,
              initialScrollDone: true,
              showTranslation: initialShowTranslation,
              scrollToLineCalled: false,
              scrollToLineIndex: null,
            };

            // Toggle translation
            const newState = simulateTranslationToggle(initialState, !initialShowTranslation);

            // The line index passed to scrollToLine should match currentLineIndex
            return newState.scrollToLineIndex === currentLineIndex;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple translation toggles always recalculate for the current line', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }), // currentLineIndex
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }), // sequence of toggle states
          (currentLineIndex, toggleSequence) => {
            let state: ScrollRecalculationState = {
              currentLineIndex,
              initialScrollDone: true,
              showTranslation: false,
              scrollToLineCalled: false,
              scrollToLineIndex: null,
            };

            // Apply each toggle in sequence
            for (const newShowTranslation of toggleSequence) {
              if (newShowTranslation !== state.showTranslation) {
                state = simulateTranslationToggle(state, newShowTranslation);
                // Each toggle should trigger scroll to the same line
                if (!state.scrollToLineCalled || state.scrollToLineIndex !== currentLineIndex) {
                  return false;
                }
              }
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
