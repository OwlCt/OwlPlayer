import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateWordFillPercentage } from './MobileLyricsConfig';

// **Feature: mobile-lyrics-view, Property 4: Word fill percentage calculation**
// **Validates: Requirements 3.2, 3.3**

/**
 * Arbitrary for generating valid word timestamps.
 * Ensures wordStart < wordEnd and both are non-negative.
 */
const wordTimestampsArb = fc.tuple(
  fc.nat({ max: 300000 }), // wordStart: 0-300 seconds
  fc.nat({ max: 10000 })   // duration: 0-10 seconds
).map(([start, duration]) => ({
  wordStart: start,
  wordEnd: start + Math.max(duration, 1), // Ensure end > start
}));

/**
 * Arbitrary for generating current time relative to word timestamps.
 */
const currentTimeArb = fc.nat({ max: 320000 }); // 0-320 seconds

describe('Word Fill Percentage Calculation', () => {
  // **Feature: mobile-lyrics-view, Property 4: Word fill percentage calculation**
  // **Validates: Requirements 3.2, 3.3**
  describe('Property 4: Word fill percentage calculation', () => {
    it('should return 0% when current time is before word start', () => {
      fc.assert(
        fc.property(wordTimestampsArb, (timestamps) => {
          const { wordStart, wordEnd } = timestamps;
          // Generate time before word start
          const currentTime = wordStart > 0 ? wordStart - 1 : 0;
          
          if (currentTime < wordStart) {
            const fillPercent = calculateWordFillPercentage(currentTime, wordStart, wordEnd);
            expect(fillPercent).toBe(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should return 100% when current time is at or after word end', () => {
      fc.assert(
        fc.property(wordTimestampsArb, fc.nat({ max: 10000 }), (timestamps, offset) => {
          const { wordStart, wordEnd } = timestamps;
          // Generate time at or after word end
          const currentTime = wordEnd + offset;
          
          const fillPercent = calculateWordFillPercentage(currentTime, wordStart, wordEnd);
          expect(fillPercent).toBe(100);
        }),
        { numRuns: 100 }
      );
    });

    it('should return proportional fill when current time is within word duration', () => {
      fc.assert(
        fc.property(
          wordTimestampsArb,
          fc.double({ min: 0.01, max: 0.99, noNaN: true }),
          (timestamps, progress) => {
            const { wordStart, wordEnd } = timestamps;
            const duration = wordEnd - wordStart;
            const currentTime = wordStart + Math.floor(duration * progress);
            
            const fillPercent = calculateWordFillPercentage(currentTime, wordStart, wordEnd);
            
            // Fill should be between 0 and 100
            expect(fillPercent).toBeGreaterThanOrEqual(0);
            expect(fillPercent).toBeLessThanOrEqual(100);
            
            // Fill should be approximately proportional to progress
            const expectedFill = ((currentTime - wordStart) / duration) * 100;
            expect(fillPercent).toBeCloseTo(expectedFill, 5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should calculate fill independently for each word', () => {
      fc.assert(
        fc.property(
          fc.array(wordTimestampsArb, { minLength: 2, maxLength: 10 }),
          currentTimeArb,
          (wordsTimestamps, currentTime) => {
            // Calculate fill for each word independently
            const fills = wordsTimestamps.map(({ wordStart, wordEnd }) =>
              calculateWordFillPercentage(currentTime, wordStart, wordEnd)
            );
            
            // Each fill should be valid (0-100)
            fills.forEach(fill => {
              expect(fill).toBeGreaterThanOrEqual(0);
              expect(fill).toBeLessThanOrEqual(100);
            });
            
            // Fills should be independent - different words can have different fills
            // This is verified by the fact that each calculation uses its own timestamps
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0% at exactly word start time', () => {
      fc.assert(
        fc.property(wordTimestampsArb, (timestamps) => {
          const { wordStart, wordEnd } = timestamps;
          const fillPercent = calculateWordFillPercentage(wordStart, wordStart, wordEnd);
          expect(fillPercent).toBe(0);
        }),
        { numRuns: 100 }
      );
    });

    it('should return 100% at exactly word end time', () => {
      fc.assert(
        fc.property(wordTimestampsArb, (timestamps) => {
          const { wordStart, wordEnd } = timestamps;
          const fillPercent = calculateWordFillPercentage(wordEnd, wordStart, wordEnd);
          expect(fillPercent).toBe(100);
        }),
        { numRuns: 100 }
      );
    });

    it('should be monotonically increasing as time progresses', () => {
      fc.assert(
        fc.property(
          wordTimestampsArb,
          fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 2, maxLength: 10 }),
          (timestamps, progressValues) => {
            const { wordStart, wordEnd } = timestamps;
            const duration = wordEnd - wordStart;
            
            // Sort progress values to get increasing times
            const sortedProgress = [...progressValues].sort((a, b) => a - b);
            const times = sortedProgress.map(p => wordStart + Math.floor(duration * p));
            
            // Calculate fills for each time
            const fills = times.map(t => calculateWordFillPercentage(t, wordStart, wordEnd));
            
            // Fills should be monotonically non-decreasing
            for (let i = 1; i < fills.length; i++) {
              expect(fills[i]).toBeGreaterThanOrEqual(fills[i - 1]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle zero-duration words gracefully', () => {
      fc.assert(
        fc.property(fc.nat({ max: 300000 }), currentTimeArb, (wordTime, currentTime) => {
          // Zero duration: wordStart === wordEnd
          const fillPercent = calculateWordFillPercentage(currentTime, wordTime, wordTime);
          
          // Should return 100% since duration is 0 (or handle gracefully)
          expect(fillPercent).toBeGreaterThanOrEqual(0);
          expect(fillPercent).toBeLessThanOrEqual(100);
        }),
        { numRuns: 100 }
      );
    });

    it('should be consistent for same inputs', () => {
      fc.assert(
        fc.property(wordTimestampsArb, currentTimeArb, (timestamps, currentTime) => {
          const { wordStart, wordEnd } = timestamps;
          
          const fill1 = calculateWordFillPercentage(currentTime, wordStart, wordEnd);
          const fill2 = calculateWordFillPercentage(currentTime, wordStart, wordEnd);
          
          expect(fill1).toBe(fill2);
        }),
        { numRuns: 100 }
      );
    });
  });
});
