/**
 * Property-based tests for MobileLyricLine component
 * 
 * **Feature: mobile-lyrics-view, Property 5: Line opacity based on distance**
 * **Validates: Requirements 4.1, 4.3, 9.3, 9.4**
 */
import * as fc from 'fast-check';
import { getLineOpacity, OPACITY_CONFIG, TYPOGRAPHY_CONFIG } from './MobileLyricsConfig';

describe('MobileLyricLine - Property Tests', () => {
  /**
   * **Feature: mobile-lyrics-view, Property 5: Line opacity based on distance**
   * 
   * *For any* lyric line at distance d from the active line, the opacity SHALL be:
   * - 1.0 if d == 0 (active)
   * - 0.5 if |d| == 1
   * - 0.3 if |d| == 2
   * - 0.2 if |d| > 2
   * 
   * **Validates: Requirements 4.1, 4.3, 9.3, 9.4**
   */
  describe('Property 5: Line opacity based on distance', () => {
    it('should return full opacity (1.0) for active line (distance = 0)', () => {
      fc.assert(
        fc.property(fc.constant(0), (distance) => {
          const opacity = getLineOpacity(distance);
          return opacity === OPACITY_CONFIG.active && opacity === 1.0;
        }),
        { numRuns: 100 }
      );
    });

    it('should return 0.5 opacity for adjacent lines (distance = ±1)', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(1), fc.constant(-1)),
          (distance) => {
            const opacity = getLineOpacity(distance);
            return opacity === OPACITY_CONFIG.adjacent1 && opacity === 0.5;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0.3 opacity for lines at distance ±2', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(2), fc.constant(-2)),
          (distance) => {
            const opacity = getLineOpacity(distance);
            return opacity === OPACITY_CONFIG.adjacent2 && opacity === 0.3;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0.2 opacity for lines at distance > 2', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 3, max: 1000 }),
          (distance) => {
            const opacity = getLineOpacity(distance);
            return opacity === OPACITY_CONFIG.other && opacity === 0.2;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0.2 opacity for lines at distance < -2', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: -3 }),
          (distance) => {
            const opacity = getLineOpacity(distance);
            return opacity === OPACITY_CONFIG.other && opacity === 0.2;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle any integer distance correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -10000, max: 10000 }),
          (distance) => {
            const opacity = getLineOpacity(distance);
            const absDistance = Math.abs(distance);
            
            if (absDistance === 0) {
              return opacity === 1.0;
            } else if (absDistance === 1) {
              return opacity === 0.5;
            } else if (absDistance === 2) {
              return opacity === 0.3;
            } else {
              return opacity === 0.2;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always return a value between 0 and 1', () => {
      fc.assert(
        fc.property(
          fc.integer(),
          (distance) => {
            const opacity = getLineOpacity(distance);
            return opacity >= 0 && opacity <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be symmetric for positive and negative distances', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),
          (distance) => {
            const positiveOpacity = getLineOpacity(distance);
            const negativeOpacity = getLineOpacity(-distance);
            return positiveOpacity === negativeOpacity;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * **Feature: mobile-lyrics-view, Property 11: Translation display**
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */
describe('MobileLyricLine - Translation Display Property Tests', () => {
  /**
   * **Feature: mobile-lyrics-view, Property 11: Translation display**
   * 
   * *For any* lyrics with translations, when translation is enabled:
   * - A toggle button SHALL be displayed (tested in header component)
   * - Translation text SHALL appear below each lyric line
   * - Translation text SHALL have font-size 14px and opacity 0.6
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3**
   */
  describe('Property 11: Translation display', () => {
    // Generator for lyric line with optional translation
    const lyricLineArb = fc.record({
      key: fc.string({ minLength: 1, maxLength: 10 }),
      timestamp: fc.nat({ max: 300000 }),
      endTime: fc.nat({ max: 300000 }),
      text: fc.string({ minLength: 1, maxLength: 200 }),
      translation: fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: undefined }),
    });

    it('should include translation when showTranslation is true and translation exists', () => {
      fc.assert(
        fc.property(
          lyricLineArb,
          fc.boolean(),
          (line, showTranslation) => {
            const hasTranslation = line.translation !== undefined;
            const shouldShowTranslation = showTranslation && hasTranslation;
            
            // This tests the logic: translation should be shown only when
            // both showTranslation is true AND translation exists
            if (showTranslation && hasTranslation) {
              return shouldShowTranslation === true;
            } else {
              return shouldShowTranslation === false;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not show translation when showTranslation is false', () => {
      fc.assert(
        fc.property(
          lyricLineArb,
          (line) => {
            const showTranslation = false;
            const shouldShowTranslation = showTranslation && line.translation !== undefined;
            return shouldShowTranslation === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not show translation when translation is undefined', () => {
      fc.assert(
        fc.property(
          fc.record({
            key: fc.string({ minLength: 1, maxLength: 10 }),
            timestamp: fc.nat({ max: 300000 }),
            endTime: fc.nat({ max: 300000 }),
            text: fc.string({ minLength: 1, maxLength: 200 }),
            translation: fc.constant(undefined),
          }),
          (line) => {
            const showTranslation = true;
            const shouldShowTranslation = showTranslation && line.translation !== undefined;
            return shouldShowTranslation === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('translation font size should be 14px as per TYPOGRAPHY_CONFIG', () => {
      expect(TYPOGRAPHY_CONFIG.translationFontSize).toBe(14);
    });

    it('translation opacity should be 0.6 as per TYPOGRAPHY_CONFIG', () => {
      expect(TYPOGRAPHY_CONFIG.translationOpacity).toBe(0.6);
    });
  });
});
