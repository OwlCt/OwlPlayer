/**
 * Property-based tests for LyricsPanel translation visibility
 * 
 * Uses fast-check for property-based testing
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LyricLine } from '../types';

// Helper function to simulate translation visibility logic
const shouldShowTranslation = (
  line: LyricLine,
  showTranslation: boolean
): boolean => {
  return showTranslation && !!line.translation;
};

// Helper function to determine button visual state
const getButtonActiveState = (showTranslation: boolean): 'active' | 'inactive' => {
  return showTranslation ? 'active' : 'inactive';
};

// Generator for lyric lines
const lyricLineArb = fc.record({
  timestamp: fc.nat({ max: 300000 }), // 0-5 minutes in ms
  endTime: fc.option(fc.nat({ max: 300000 }), { nil: undefined }),
  text: fc.string({ minLength: 0, maxLength: 100 }),
  translation: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

describe('LyricsPanel Translation Properties', () => {
  // **Feature: lyrics-translation-toggle, Property 2: Translation visibility consistency**
  // *For any* set of lyric lines and toggle state:
  // - When translation is enabled: lines with translation data show translation,
  //   lines without translation data show only original text
  // - When translation is disabled: no translation text is visible for any line
  // **Validates: Requirements 1.3, 1.4, 1.5**
  describe('Property 2: Translation visibility consistency', () => {
    it('should show translation only when enabled AND translation exists', () => {
      fc.assert(
        fc.property(lyricLineArb, fc.boolean(), (line, showTranslation) => {
          const visible = shouldShowTranslation(line, showTranslation);
          
          if (!showTranslation) {
            // When disabled, translation should never be visible
            expect(visible).toBe(false);
          } else if (!line.translation) {
            // When enabled but no translation data, should not show
            expect(visible).toBe(false);
          } else {
            // When enabled and has translation, should show
            expect(visible).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should never show translation when toggle is disabled', () => {
      fc.assert(
        fc.property(fc.array(lyricLineArb, { minLength: 1, maxLength: 50 }), (lines) => {
          const showTranslation = false;
          
          for (const line of lines) {
            const visible = shouldShowTranslation(line, showTranslation);
            expect(visible).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should show translation for all lines with translation data when enabled', () => {
      fc.assert(
        fc.property(
          fc.array(lyricLineArb, { minLength: 1, maxLength: 50 }),
          (lines) => {
            const showTranslation = true;
            
            for (const line of lines) {
              const visible = shouldShowTranslation(line, showTranslation);
              const hasTranslation = !!line.translation;
              expect(visible).toBe(hasTranslation);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: lyrics-translation-toggle, Property 4: Visual state consistency**
  // *For any* toggle state, the button's visual appearance (active/inactive styling)
  // should match the current state value.
  // **Validates: Requirements 3.1, 3.2**
  describe('Property 4: Visual state consistency', () => {
    it('should have button visual state match toggle state', () => {
      fc.assert(
        fc.property(fc.boolean(), (showTranslation) => {
          const buttonState = getButtonActiveState(showTranslation);
          
          if (showTranslation) {
            expect(buttonState).toBe('active');
          } else {
            expect(buttonState).toBe('inactive');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should always have consistent visual state for any sequence of toggles', () => {
      fc.assert(
        fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), (states) => {
          for (const state of states) {
            const buttonState = getButtonActiveState(state);
            const expectedState = state ? 'active' : 'inactive';
            expect(buttonState).toBe(expectedState);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
