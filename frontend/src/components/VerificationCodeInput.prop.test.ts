import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property tests for VerificationCodeInput component
 * Tests the core logic of the verification code input behavior
 */

// Pure function that simulates auto-focus behavior
// Returns the index of the input that should be focused after entering a digit
function getNextFocusIndex(currentIndex: number, digit: string): number | null {
  // Only digits 0-9 are valid
  if (!/^\d$/.test(digit)) return null;
  
  // If we're at the last input (index 5), stay there
  if (currentIndex >= 5) return 5;
  
  // Otherwise, move to the next input
  return currentIndex + 1;
}

// Pure function that simulates backspace navigation
// Returns the index of the input that should be focused after pressing backspace
function getBackspaceFocusIndex(currentIndex: number, currentValue: string): number {
  // If current input is empty and we're not at the first input, move to previous
  if (!currentValue && currentIndex > 0) {
    return currentIndex - 1;
  }
  // Otherwise stay at current position
  return currentIndex;
}

// Pure function that distributes pasted digits across input boxes
function distributePastedCode(pastedText: string): string[] {
  // Remove non-digits and take first 6 characters
  const digits = pastedText.replace(/\D/g, '').slice(0, 6);
  
  // Create array of 6 empty strings
  const result = ['', '', '', '', '', ''];
  
  // Fill in the digits
  for (let i = 0; i < digits.length; i++) {
    result[i] = digits[i];
  }
  
  return result;
}

describe('VerificationCodeInput Logic', () => {
  // **Feature: verification-code-ui-refactor, Property 1: Auto-focus on Digit Input**
  // **Validates: Requirements 1.2**
  describe('Property 1: Auto-focus on Digit Input', () => {
    it('should move focus to next input when a digit is entered at position N < 5', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 4 }), // currentIndex (0-4, not the last one)
          fc.integer({ min: 0, max: 9 }), // digit
          (currentIndex, digitNum) => {
            const digit = String(digitNum);
            const nextIndex = getNextFocusIndex(currentIndex, digit);
            
            // Should move to the next input
            expect(nextIndex).toBe(currentIndex + 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should stay at position 5 when entering digit at the last input', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 9 }), // digit
          (digitNum) => {
            const digit = String(digitNum);
            const nextIndex = getNextFocusIndex(5, digit);
            
            // Should stay at position 5
            expect(nextIndex).toBe(5);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return null for non-digit input', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }), // currentIndex
          fc.string({ minLength: 1, maxLength: 1 }).filter(s => !/^\d$/.test(s)), // non-digit
          (currentIndex, nonDigit) => {
            const nextIndex = getNextFocusIndex(currentIndex, nonDigit);
            
            // Should return null for invalid input
            expect(nextIndex).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: verification-code-ui-refactor, Property 2: Backspace Navigation**
  // **Validates: Requirements 1.3**
  describe('Property 2: Backspace Navigation', () => {
    it('should move focus to previous input when backspace is pressed on empty input at position N > 0', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 5 }), // currentIndex (1-5, not the first one)
          (currentIndex) => {
            const focusIndex = getBackspaceFocusIndex(currentIndex, '');
            
            // Should move to the previous input
            expect(focusIndex).toBe(currentIndex - 1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should stay at position 0 when backspace is pressed on empty first input', () => {
      const focusIndex = getBackspaceFocusIndex(0, '');
      expect(focusIndex).toBe(0);
    });

    it('should stay at current position when backspace is pressed on non-empty input', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 5 }), // currentIndex
          fc.integer({ min: 0, max: 9 }), // digit in the input
          (currentIndex, digitNum) => {
            const currentValue = String(digitNum);
            const focusIndex = getBackspaceFocusIndex(currentIndex, currentValue);
            
            // Should stay at current position
            expect(focusIndex).toBe(currentIndex);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Helper to generate digit-only strings
  const digitStringArb = (minLen: number, maxLen: number) =>
    fc.array(fc.integer({ min: 0, max: 9 }), { minLength: minLen, maxLength: maxLen })
      .map(arr => arr.join(''));

  // **Feature: verification-code-ui-refactor, Property 3: Paste Distribution**
  // **Validates: Requirements 1.4**
  describe('Property 3: Paste Distribution', () => {
    it('should distribute 6-digit code correctly across all input boxes', () => {
      fc.assert(
        fc.property(
          digitStringArb(6, 6),
          (sixDigitCode) => {
            const result = distributePastedCode(sixDigitCode);
            
            // Each digit should be in its corresponding position
            for (let i = 0; i < 6; i++) {
              expect(result[i]).toBe(sixDigitCode[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle codes shorter than 6 digits by leaving remaining boxes empty', () => {
      fc.assert(
        fc.property(
          digitStringArb(1, 5),
          (shortCode) => {
            const result = distributePastedCode(shortCode);
            
            // First N digits should be filled
            for (let i = 0; i < shortCode.length; i++) {
              expect(result[i]).toBe(shortCode[i]);
            }
            
            // Remaining should be empty
            for (let i = shortCode.length; i < 6; i++) {
              expect(result[i]).toBe('');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should truncate codes longer than 6 digits', () => {
      fc.assert(
        fc.property(
          digitStringArb(7, 20),
          (longCode) => {
            const result = distributePastedCode(longCode);
            
            // Should only have 6 digits
            expect(result.filter(d => d !== '').length).toBe(6);
            
            // First 6 digits should match
            for (let i = 0; i < 6; i++) {
              expect(result[i]).toBe(longCode[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should filter out non-digit characters from pasted text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }),
          (mixedText) => {
            const result = distributePastedCode(mixedText);
            
            // All non-empty values should be digits
            result.forEach(value => {
              if (value !== '') {
                expect(/^\d$/.test(value)).toBe(true);
              }
            });
            
            // Result should always have exactly 6 elements
            expect(result.length).toBe(6);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all empty strings for text with no digits', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !/\d/.test(s)),
          (noDigitText) => {
            const result = distributePastedCode(noDigitText);
            
            // All should be empty
            expect(result).toEqual(['', '', '', '', '', '']);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// Export functions for potential reuse
export { getNextFocusIndex, getBackspaceFocusIndex, distributePastedCode };
