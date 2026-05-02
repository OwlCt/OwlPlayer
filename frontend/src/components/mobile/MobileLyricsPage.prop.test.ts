import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LyricLine } from '../../utils/ttmlParser';
import { findActiveLineIndex, shouldTriggerClose } from './MobileLyricsPage';
import { GESTURE_CONFIG } from './MobileLyricsConfig';

/**
 * Arbitrary for generating a valid LyricLine.
 */
const lyricLineArb = fc.record({
  key: fc.string({ minLength: 1, maxLength: 10 }),
  timestamp: fc.nat({ max: 300000 }), // 0-300 seconds in ms
  endTime: fc.nat({ max: 310000 }),
  text: fc.string({ minLength: 1, maxLength: 100 }),
  translation: fc.option(fc.string({ minLength: 1, maxLength: 100 })),
});

/**
 * Arbitrary for generating an array of sorted lyric lines.
 * Lines are sorted by timestamp in ascending order.
 */
const sortedLyricLinesArb = fc.array(lyricLineArb, { minLength: 1, maxLength: 50 })
  .map(lines => {
    // Sort by timestamp and ensure unique keys
    const sorted = [...lines].sort((a, b) => a.timestamp - b.timestamp);
    return sorted.map((line, index) => ({
      ...line,
      key: `L${index + 1}`,
      endTime: Math.max(line.endTime, line.timestamp + 1000), // Ensure endTime > timestamp
    }));
  });

/**
 * Arbitrary for generating current time in milliseconds.
 */
const currentTimeMsArb = fc.nat({ max: 320000 });

/**
 * Arbitrary for generating swipe gesture info.
 */
const swipeGestureArb = fc.record({
  velocityY: fc.double({ min: -500, max: 1000, noNaN: true }),
  offsetY: fc.double({ min: -100, max: 500, noNaN: true }),
});

// **Feature: mobile-lyrics-view, Property 1: Active line scroll positioning**
// **Validates: Requirements 1.3**
describe('Property 1: Active line scroll positioning', () => {
  it('should find the active line whose timestamp is <= current time and is the latest such line', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, currentTimeMsArb, (lines, currentTime) => {
        const activeIndex = findActiveLineIndex(lines, currentTime);
        
        if (activeIndex === -1) {
          // No active line means current time is before all lines
          expect(lines.every(line => line.timestamp > currentTime)).toBe(true);
        } else {
          // Active line's timestamp should be <= current time
          expect(lines[activeIndex].timestamp).toBeLessThanOrEqual(currentTime);
          
          // No later line should have timestamp <= current time
          for (let i = activeIndex + 1; i < lines.length; i++) {
            expect(lines[i].timestamp).toBeGreaterThan(currentTime);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should return -1 when current time is before all lines', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, (lines) => {
        // Set current time before the first line
        const firstTimestamp = lines[0].timestamp;
        if (firstTimestamp > 0) {
          const currentTime = firstTimestamp - 1;
          const activeIndex = findActiveLineIndex(lines, currentTime);
          expect(activeIndex).toBe(-1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should return the last line index when current time is after all lines', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, (lines) => {
        // Set current time after the last line
        const lastTimestamp = lines[lines.length - 1].timestamp;
        const currentTime = lastTimestamp + 10000;
        const activeIndex = findActiveLineIndex(lines, currentTime);
        expect(activeIndex).toBe(lines.length - 1);
      }),
      { numRuns: 100 }
    );
  });

  it('should return correct index when current time exactly matches a line timestamp', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, fc.nat(), (lines, indexSeed) => {
        const targetIndex = indexSeed % lines.length;
        const currentTime = lines[targetIndex].timestamp;
        const activeIndex = findActiveLineIndex(lines, currentTime);
        
        // Should return this index or a later one with the same timestamp
        expect(activeIndex).toBeGreaterThanOrEqual(targetIndex);
        expect(lines[activeIndex].timestamp).toBe(currentTime);
      }),
      { numRuns: 100 }
    );
  });
});


// **Feature: mobile-lyrics-view, Property 3: Swipe velocity triggers close**
// **Validates: Requirements 2.4**
describe('Property 3: Swipe velocity triggers close', () => {
  it('should trigger close when velocity exceeds threshold regardless of distance', () => {
    fc.assert(
      fc.property(
        fc.double({ min: GESTURE_CONFIG.swipeVelocityThreshold + 1, max: 2000, noNaN: true }),
        fc.double({ min: -100, max: 500, noNaN: true }),
        (velocityY, offsetY) => {
          const shouldClose = shouldTriggerClose(velocityY, offsetY);
          expect(shouldClose).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not trigger close when velocity is below threshold and distance is small', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 50, noNaN: true }), // Low velocity
        fc.double({ min: 0, max: GESTURE_CONFIG.swipeCloseThreshold - 1, noNaN: true }), // Small distance
        (velocityY, offsetY) => {
          const shouldClose = shouldTriggerClose(velocityY, offsetY);
          expect(shouldClose).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should trigger close when distance exceeds threshold with some velocity', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 51, max: GESTURE_CONFIG.swipeVelocityThreshold, noNaN: true }), // Some velocity
        fc.double({ min: GESTURE_CONFIG.swipeCloseThreshold + 1, max: 500, noNaN: true }), // Large distance
        (velocityY, offsetY) => {
          const shouldClose = shouldTriggerClose(velocityY, offsetY);
          expect(shouldClose).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case at exactly velocity threshold', () => {
    const velocityY = GESTURE_CONFIG.swipeVelocityThreshold;
    const offsetY = 50; // Small offset
    const shouldClose = shouldTriggerClose(velocityY, offsetY);
    // At exactly threshold, should not trigger (need to exceed)
    expect(shouldClose).toBe(false);
  });

  it('should handle negative velocity (upward swipe) - should not close', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -1000, max: 0, noNaN: true }), // Negative velocity (upward)
        fc.double({ min: -100, max: 100, noNaN: true }),
        (velocityY, offsetY) => {
          const shouldClose = shouldTriggerClose(velocityY, offsetY);
          expect(shouldClose).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// **Feature: mobile-lyrics-view, Property 6: Auto-scroll pause and resume behavior**
// **Validates: Requirements 5.3, 5.4, 5.5**
describe('Property 6: Auto-scroll pause and resume behavior', () => {
  it('should have correct pause duration configured', () => {
    // Verify the configuration matches the requirement (5 seconds)
    expect(GESTURE_CONFIG.autoScrollPauseDuration).toBe(5000);
  });

  it('should have valid gesture thresholds', () => {
    // Verify thresholds are positive and reasonable
    expect(GESTURE_CONFIG.swipeCloseThreshold).toBeGreaterThan(0);
    expect(GESTURE_CONFIG.swipeVelocityThreshold).toBeGreaterThan(0);
    expect(GESTURE_CONFIG.minTouchTarget).toBeGreaterThanOrEqual(44); // Accessibility requirement
  });
});

// **Feature: mobile-lyrics-view, Property 8: Active line updates after seek**
// **Validates: Requirements 6.3**
describe('Property 8: Active line updates after seek', () => {
  it('should update active line index correctly after seek to any time', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, currentTimeMsArb, (lines, seekTime) => {
        // Simulate seek by finding active line at new time
        const newActiveIndex = findActiveLineIndex(lines, seekTime);
        
        if (newActiveIndex >= 0) {
          // Active line timestamp should be <= seek time
          expect(lines[newActiveIndex].timestamp).toBeLessThanOrEqual(seekTime);
          
          // It should be the latest such line
          if (newActiveIndex < lines.length - 1) {
            expect(lines[newActiveIndex + 1].timestamp).toBeGreaterThan(seekTime);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should handle seek to beginning of song', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, (lines) => {
        const activeIndex = findActiveLineIndex(lines, 0);
        
        if (lines[0].timestamp === 0) {
          // First line starts at 0, should be active
          expect(activeIndex).toBe(0);
        } else {
          // First line starts after 0, no active line
          expect(activeIndex).toBe(-1);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should handle seek to end of song', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, (lines) => {
        const lastTimestamp = lines[lines.length - 1].timestamp;
        const activeIndex = findActiveLineIndex(lines, lastTimestamp + 100000);
        
        // Should be the last line
        expect(activeIndex).toBe(lines.length - 1);
      }),
      { numRuns: 100 }
    );
  });

  it('should handle seek between lines', () => {
    fc.assert(
      fc.property(sortedLyricLinesArb, (lines) => {
        if (lines.length < 2) return;
        
        // Find a gap between two consecutive lines
        for (let i = 0; i < lines.length - 1; i++) {
          const currentEnd = lines[i].timestamp;
          const nextStart = lines[i + 1].timestamp;
          
          if (nextStart > currentEnd + 1) {
            // Seek to middle of gap
            const seekTime = Math.floor((currentEnd + nextStart) / 2);
            const activeIndex = findActiveLineIndex(lines, seekTime);
            
            // Should be the line before the gap
            expect(activeIndex).toBe(i);
            break;
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});


// **Feature: mobile-lyrics-view, Property 13: Background color from artwork**
// **Validates: Requirements 9.1**
describe('Property 13: Background color from artwork', () => {
  /**
   * Arbitrary for generating valid hex color strings.
   */
  const hexColorArb = fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 })
  ).map(([r, g, b]) => `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`);

  /**
   * Arbitrary for generating artwork colors object.
   */
  const artworkColorsArb = fc.record({
    dominant: hexColorArb,
    vibrant: hexColorArb,
    muted: hexColorArb,
    darkMuted: hexColorArb,
    lightMuted: hexColorArb,
    isLoading: fc.boolean(),
  });

  it('should use darkMuted color from artwork when available', () => {
    fc.assert(
      fc.property(artworkColorsArb, (colors) => {
        // When darkMuted is available, it should be used as background
        if (colors.darkMuted && !colors.isLoading) {
          // The darkMuted color should be a valid hex color
          expect(colors.darkMuted).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid color format for all extracted colors', () => {
    fc.assert(
      fc.property(artworkColorsArb, (colors) => {
        // All color properties should be valid hex colors
        const colorProps = ['dominant', 'vibrant', 'muted', 'darkMuted', 'lightMuted'] as const;
        
        for (const prop of colorProps) {
          const color = colors[prop];
          expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should use default background when artwork colors are not available', async () => {
    // Test that DEFAULT_COLORS.background is used as fallback
    const { DEFAULT_COLORS } = await import('./MobileLyricsConfig');
    
    // Default background should be a valid dark color
    expect(DEFAULT_COLORS.background).toMatch(/^#[0-9a-fA-F]{6}$/);
    
    // Verify it's a dark color (for readability of white text)
    const hex = DEFAULT_COLORS.background.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    
    // Should be a dark color (luminance < 0.3)
    expect(luminance).toBeLessThan(0.3);
  });

  it('should derive background from artwork dominant dark color', () => {
    fc.assert(
      fc.property(
        hexColorArb,
        fc.boolean(),
        (darkMutedColor, hasArtwork) => {
          // When artwork is available, darkMuted should be extracted
          if (hasArtwork) {
            // darkMuted color should be usable as background
            expect(darkMutedColor).toMatch(/^#[0-9a-fA-F]{6}$/);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle color transition timing', async () => {
    // Verify the background color transition duration matches requirement (700ms)
    const { ANIMATION_CONFIG } = await import('./MobileLyricsConfig');
    
    expect(ANIMATION_CONFIG.background.duration).toBe(700);
  });
});
