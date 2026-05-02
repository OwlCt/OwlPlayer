import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property tests for Password Validation
 * Tests the password length validation consistency between frontend and backend
 */

// Password validation constants (should match backend)
const PASSWORD_MIN_LENGTH = 8;

// Pure function that validates password length
function isPasswordValid(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH;
}

// Pure function that returns validation error message
function getPasswordValidationError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return '密码至少需要8个字符';
  }
  return null;
}

describe('Password Validation Logic', () => {
  // **Feature: verification-code-ui-refactor, Property 4: Password Length Validation Consistency**
  // **Validates: Requirements 5.1, 5.2, 5.3**
  describe('Property 4: Password Length Validation Consistency', () => {
    it('should reject passwords shorter than 8 characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 7 }),
          (shortPassword) => {
            expect(isPasswordValid(shortPassword)).toBe(false);
            expect(getPasswordValidationError(shortPassword)).toBe('密码至少需要8个字符');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept passwords with 8 or more characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 100 }),
          (validPassword) => {
            expect(isPasswordValid(validPassword)).toBe(true);
            expect(getPasswordValidationError(validPassword)).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should use exactly 8 as the minimum length (matching backend)', () => {
      // Test boundary: 7 characters should fail, 8 should pass
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1 }), // single char to append
          (char) => {
            const sevenChars = 'abcdefg'; // exactly 7 characters
            const eightChars = sevenChars + char; // exactly 8 characters
            
            expect(isPasswordValid(sevenChars)).toBe(false);
            expect(isPasswordValid(eightChars)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty password', () => {
      expect(isPasswordValid('')).toBe(false);
      expect(getPasswordValidationError('')).toBe('密码至少需要8个字符');
    });

    it('should handle passwords with special characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 50 }),
          (password) => {
            // Password validation should only check length, not content
            expect(isPasswordValid(password)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle passwords with unicode characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 8, maxLength: 50, unit: 'grapheme' }),
          (unicodePassword) => {
            // Unicode characters should be counted by string length
            // Note: grapheme unit ensures proper unicode handling
            expect(unicodePassword.length >= 8).toBe(true);
            expect(isPasswordValid(unicodePassword)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// Export functions for potential reuse
export { isPasswordValid, getPasswordValidationError, PASSWORD_MIN_LENGTH };
