/**
 * Property-based tests for Chinese utilities
 * **Feature: lyrics-refactor**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { containsCJK, isTraditionalChinese, selectChineseVariant } from './chineseUtils';

// Sample CJK characters for testing
const cjkChars = '中国日本韩国你好世界爱情音乐歌词';
const traditionalChars = '國學書語說話讀寫聽見視覺觀親愛戀歡樂';
const simplifiedChars = '国学书语说话读写听见视觉观亲爱恋欢乐';
const asciiChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Generators - using array and join for string generation
const asciiStringArb = fc.array(fc.constantFrom(...asciiChars.split('')), { minLength: 1, maxLength: 50 }).map(arr => arr.join(''));
const cjkStringArb = fc.array(fc.constantFrom(...cjkChars.split('')), { minLength: 1, maxLength: 50 }).map(arr => arr.join(''));
const traditionalStringArb = fc.array(fc.constantFrom(...traditionalChars.split('')), { minLength: 1, maxLength: 50 }).map(arr => arr.join(''));
const simplifiedStringArb = fc.array(fc.constantFrom(...simplifiedChars.split('')), { minLength: 1, maxLength: 50 }).map(arr => arr.join(''));

describe('Chinese Utils Property Tests', () => {
  /**
   * **Property 6: CJK 字符检测准确性**
   * **Validates: Requirements 5.1**
   * containsCJK should return true for strings with CJK characters, false for ASCII-only
   */
  it('Property 6: CJK detection accuracy', () => {
    // ASCII-only strings should return false
    fc.assert(
      fc.property(asciiStringArb, (s) => {
        expect(containsCJK(s)).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
    
    // CJK strings should return true
    fc.assert(
      fc.property(cjkStringArb, (s) => {
        expect(containsCJK(s)).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
    
    // Mixed strings with CJK should return true
    fc.assert(
      fc.property(asciiStringArb, cjkStringArb, (ascii, cjk) => {
        const mixed = ascii + cjk;
        expect(containsCJK(mixed)).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Property 7: 简繁体检测准确性**
   * **Validates: Requirements 5.2**
   * isTraditionalChinese should correctly identify traditional vs simplified
   */
  it('Property 7: Traditional/Simplified detection accuracy', () => {
    // Traditional-only strings should be detected as traditional
    fc.assert(
      fc.property(traditionalStringArb, (s) => {
        expect(isTraditionalChinese(s)).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
    
    // Simplified-only strings should NOT be detected as traditional
    fc.assert(
      fc.property(simplifiedStringArb, (s) => {
        expect(isTraditionalChinese(s)).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
  });


  /**
   * **Property 8: 简繁体选择一致性**
   * **Validates: Requirements 5.3, 5.4**
   * selectChineseVariant should return appropriate text based on user preference
   */
  it('Property 8: Chinese variant selection consistency', () => {
    // When user prefers traditional and main is simplified, should use traditional translation
    fc.assert(
      fc.property(simplifiedStringArb, traditionalStringArb, (simplified, traditional) => {
        const result = selectChineseVariant(simplified, traditional, 'traditional');
        // Should select the traditional version
        expect(result.text).toBe(traditional);
        expect(result.showTranslation).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
    
    // When user prefers simplified and main is traditional, should use simplified translation
    fc.assert(
      fc.property(traditionalStringArb, simplifiedStringArb, (traditional, simplified) => {
        const result = selectChineseVariant(traditional, simplified, 'simplified');
        // Should select the simplified version
        expect(result.text).toBe(simplified);
        expect(result.showTranslation).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
    
    // When main matches preference, should keep main
    fc.assert(
      fc.property(traditionalStringArb, simplifiedStringArb, (traditional, simplified) => {
        const result = selectChineseVariant(traditional, simplified, 'traditional');
        expect(result.text).toBe(traditional);
        expect(result.showTranslation).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Test that non-CJK translations are shown as translations
   */
  it('Non-CJK translations are shown separately', () => {
    fc.assert(
      fc.property(cjkStringArb, asciiStringArb, (cjk, ascii) => {
        const result = selectChineseVariant(cjk, ascii, 'simplified');
        // Should show main text and indicate translation should be shown
        expect(result.text).toBe(cjk);
        expect(result.showTranslation).toBe(true);
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Test that undefined translation returns main text
   */
  it('Undefined translation returns main text', () => {
    fc.assert(
      fc.property(cjkStringArb, (cjk) => {
        const result = selectChineseVariant(cjk, undefined, 'simplified');
        expect(result.text).toBe(cjk);
        expect(result.showTranslation).toBe(false);
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
