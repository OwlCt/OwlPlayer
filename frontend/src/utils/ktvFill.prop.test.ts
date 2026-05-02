/**
 * Property-based tests for KTV Lyrics Fill Effect
 * **Feature: ktv-lyrics-fill**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getWordFillPercent, LyricWord } from './ttmlParser';

// Arbitrary generator for LyricWord with valid timing (endTime > timestamp)
const validWordArb = fc.record({
  timestamp: fc.integer({ min: 0, max: 300000 }),
  duration: fc.integer({ min: 1, max: 30000 }), // At least 1ms duration
  text: fc.string({ minLength: 1, maxLength: 20 })
}).map(({ timestamp, duration, text }) => ({
  timestamp,
  endTime: timestamp + duration,
  text
}));

// Arbitrary generator for any currentTime
const currentTimeArb = fc.integer({ min: -1000, max: 400000 });

describe('KTV Lyrics Fill Property Tests', () => {
  /**
   * **Feature: ktv-lyrics-fill, Property 1: 填充百分比范围有效性**
   * **Validates: Requirements 2.2**
   * For any LyricWord and any currentTime, getWordFillPercent SHALL return a value in [0, 100]
   */
  it('Property 1: Fill percent is always within [0, 100] range', () => {
    fc.assert(
      fc.property(validWordArb, currentTimeArb, (word, currentTime) => {
        const fillPercent = getWordFillPercent(word, currentTime);
        
        expect(fillPercent).toBeGreaterThanOrEqual(0);
        expect(fillPercent).toBeLessThanOrEqual(100);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: ktv-lyrics-fill, Property 2: 填充百分比单调递增**
   * **Validates: Requirements 1.1**
   * For any LyricWord, when currentTime increases from word.timestamp to word.endTime,
   * getWordFillPercent SHALL return monotonically increasing values (from 0 to 100)
   */
  it('Property 2: Fill percent monotonically increases as time progresses', () => {
    fc.assert(
      fc.property(validWordArb, (word) => {
        // Sample multiple time points within the word's duration
        const duration = word.endTime - word.timestamp;
        const sampleCount = 10;
        const timePoints: number[] = [];
        
        for (let i = 0; i <= sampleCount; i++) {
          timePoints.push(word.timestamp + (duration * i) / sampleCount);
        }
        
        const fillPercents = timePoints.map(t => getWordFillPercent(word, t));
        
        // Verify monotonic increase
        for (let i = 1; i < fillPercents.length; i++) {
          expect(fillPercents[i]).toBeGreaterThanOrEqual(fillPercents[i - 1]);
        }
        
        // First should be 0, last should be 100
        expect(fillPercents[0]).toBe(0);
        expect(fillPercents[fillPercents.length - 1]).toBe(100);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: ktv-lyrics-fill, Property 3: 边界条件正确性**
   * **Validates: Requirements 1.2, 1.3**
   * For any LyricWord:
   * - When currentTime < word.timestamp, fillPercent SHALL equal 0
   * - When currentTime >= word.endTime, fillPercent SHALL equal 100
   */
  it('Property 3: Boundary conditions are correct (0 before start, 100 after end)', () => {
    fc.assert(
      fc.property(validWordArb, (word) => {
        // Test before start
        const beforeStart = word.timestamp - 1;
        expect(getWordFillPercent(word, beforeStart)).toBe(0);
        
        // Test at exact start
        expect(getWordFillPercent(word, word.timestamp)).toBe(0);
        
        // Test at exact end
        expect(getWordFillPercent(word, word.endTime)).toBe(100);
        
        // Test after end
        const afterEnd = word.endTime + 1;
        expect(getWordFillPercent(word, afterEnd)).toBe(100);
        
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Edge case: Invalid word timing (endTime <= timestamp)
   * Should handle gracefully without errors
   */
  it('Edge case: Handles invalid word timing gracefully', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 300000 }),
        currentTimeArb,
        (timestamp, currentTime) => {
          // Word with zero duration
          const zeroWord: LyricWord = { timestamp, endTime: timestamp, text: 'test' };
          const zeroPercent = getWordFillPercent(zeroWord, currentTime);
          expect(zeroPercent).toBeGreaterThanOrEqual(0);
          expect(zeroPercent).toBeLessThanOrEqual(100);
          
          // Word with negative duration (endTime < timestamp)
          const negWord: LyricWord = { timestamp, endTime: timestamp - 100, text: 'test' };
          const negPercent = getWordFillPercent(negWord, currentTime);
          expect(negPercent).toBeGreaterThanOrEqual(0);
          expect(negPercent).toBeLessThanOrEqual(100);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
