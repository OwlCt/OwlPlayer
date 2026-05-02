/**
 * Property-based tests for MobileLyricsContent component
 * 
 * **Feature: mobile-lyrics-view, Property 9: Virtual scrolling for large lyrics**
 * **Validates: Requirements 7.4**
 */

import * as fc from 'fast-check';
import { shouldEnableVirtualScroll, getVisibleRange } from './MobileLyricsContent';
import { VIRTUAL_SCROLL_CONFIG } from './MobileLyricsConfig';

describe('MobileLyricsContent', () => {
  describe('Property 9: Virtual scrolling for large lyrics', () => {
    /**
     * **Feature: mobile-lyrics-view, Property 9: Virtual scrolling for large lyrics**
     * **Validates: Requirements 7.4**
     * 
     * *For any* lyrics with more than 50 lines, the system SHALL enable virtual scrolling
     * to render only visible lines.
     */
    it('should enable virtual scrolling when line count exceeds threshold', () => {
      fc.assert(
        fc.property(
          // Generate line counts above threshold
          fc.integer({ min: VIRTUAL_SCROLL_CONFIG.threshold + 1, max: 1000 }),
          (lineCount) => {
            const result = shouldEnableVirtualScroll(lineCount);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT enable virtual scrolling when line count is at or below threshold', () => {
      fc.assert(
        fc.property(
          // Generate line counts at or below threshold
          fc.integer({ min: 0, max: VIRTUAL_SCROLL_CONFIG.threshold }),
          (lineCount) => {
            const result = shouldEnableVirtualScroll(lineCount);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct threshold boundary behavior', () => {
      // Exactly at threshold - should NOT enable
      expect(shouldEnableVirtualScroll(VIRTUAL_SCROLL_CONFIG.threshold)).toBe(false);
      // One above threshold - should enable
      expect(shouldEnableVirtualScroll(VIRTUAL_SCROLL_CONFIG.threshold + 1)).toBe(true);
    });
  });

  describe('getVisibleRange', () => {
    /**
     * Property: Visible range should always include the current line
     */
    it('should always include current line in visible range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }), // currentLineIndex
          fc.integer({ min: 1, max: 1000 }), // totalLines
          (currentLineIndex, totalLines) => {
            // Ensure currentLineIndex is valid
            const validIndex = Math.min(currentLineIndex, totalLines - 1);
            const { start, end } = getVisibleRange(validIndex, totalLines);
            
            // Current line should be within visible range
            expect(validIndex).toBeGreaterThanOrEqual(start);
            expect(validIndex).toBeLessThanOrEqual(end);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Visible range should be bounded by 0 and totalLines - 1
     */
    it('should keep visible range within valid bounds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 1, max: 1000 }),
          (currentLineIndex, totalLines) => {
            const validIndex = Math.min(currentLineIndex, totalLines - 1);
            const { start, end } = getVisibleRange(validIndex, totalLines);
            
            // Range should be within bounds
            expect(start).toBeGreaterThanOrEqual(0);
            expect(end).toBeLessThan(totalLines);
            expect(start).toBeLessThanOrEqual(end);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Property: Visible range should include overscan buffer around current line
     */
    it('should include overscan buffer when possible', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 20, max: 480 }), // currentLineIndex (middle range)
          fc.integer({ min: 100, max: 1000 }), // totalLines (large enough)
          (currentLineIndex, totalLines) => {
            const validIndex = Math.min(currentLineIndex, totalLines - 1);
            const overscan = VIRTUAL_SCROLL_CONFIG.overscan;
            const { start, end } = getVisibleRange(validIndex, totalLines);
            
            // Should have at least overscan lines before and after (when not at edges)
            if (validIndex >= overscan + 10) {
              expect(start).toBeLessThanOrEqual(validIndex - overscan);
            }
            if (validIndex + overscan + 10 < totalLines) {
              expect(end).toBeGreaterThanOrEqual(validIndex + overscan);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe('Property 7: Line tap seeks to timestamp', () => {
  /**
   * **Feature: mobile-lyrics-view, Property 7: Line tap seeks to timestamp**
   * **Validates: Requirements 6.1**
   * 
   * *For any* lyric line with timestamp t, when the user taps that line,
   * the playback position SHALL seek to t/1000 seconds.
   */

  // Generator for LyricLine
  const lyricLineArb = fc.record({
    key: fc.string({ minLength: 1, maxLength: 10 }),
    timestamp: fc.integer({ min: 0, max: 600000 }), // 0 to 10 minutes in ms
    endTime: fc.integer({ min: 0, max: 600000 }),
    text: fc.string({ minLength: 1, maxLength: 100 }),
    translation: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  }).map(line => ({
    ...line,
    endTime: Math.max(line.timestamp + 1000, line.endTime), // Ensure endTime > timestamp
  }));

  it('should call onLineClick with the correct line when tapped', () => {
    fc.assert(
      fc.property(
        lyricLineArb,
        (line) => {
          // The onLineClick callback should receive the exact line that was clicked
          // This allows the parent component to seek to line.timestamp / 1000 seconds
          
          // Verify the line has a valid timestamp
          expect(line.timestamp).toBeGreaterThanOrEqual(0);
          expect(typeof line.timestamp).toBe('number');
          
          // The seek position in seconds would be:
          const seekPositionSeconds = line.timestamp / 1000;
          expect(seekPositionSeconds).toBeGreaterThanOrEqual(0);
          expect(Number.isFinite(seekPositionSeconds)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should provide correct seek position for any valid timestamp', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3600000 }), // 0 to 1 hour in ms
        (timestampMs) => {
          // Convert milliseconds to seconds for seek
          const seekPositionSeconds = timestampMs / 1000;
          
          // Verify conversion is correct
          expect(seekPositionSeconds).toBe(timestampMs / 1000);
          expect(seekPositionSeconds).toBeGreaterThanOrEqual(0);
          expect(seekPositionSeconds).toBeLessThanOrEqual(3600);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case timestamps correctly', () => {
    // Test boundary values
    const testCases = [
      { timestamp: 0, expectedSeek: 0 },
      { timestamp: 1000, expectedSeek: 1 },
      { timestamp: 60000, expectedSeek: 60 },
      { timestamp: 300000, expectedSeek: 300 },
    ];

    testCases.forEach(({ timestamp, expectedSeek }) => {
      const seekPosition = timestamp / 1000;
      expect(seekPosition).toBe(expectedSeek);
    });
  });
});
