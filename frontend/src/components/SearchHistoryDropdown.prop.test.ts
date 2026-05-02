import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Determines if the search history dropdown should be visible
 * based on input focus state and input value
 * 
 * @param isFocused - Whether the search input is focused
 * @param inputValue - The current value of the search input
 * @returns Whether the dropdown should be visible
 */
function shouldShowDropdown(isFocused: boolean, inputValue: string): boolean {
  // Dropdown is visible when:
  // 1. Input is focused AND
  // 2. Input value is empty (or only whitespace)
  return isFocused && inputValue.trim() === '';
}

/**
 * Determines if search suggestions should be shown instead of history
 * 
 * @param isFocused - Whether the search input is focused
 * @param inputValue - The current value of the search input
 * @returns Whether search suggestions should be shown
 */
function shouldShowSuggestions(isFocused: boolean, inputValue: string): boolean {
  // Suggestions are shown when:
  // 1. Input is focused AND
  // 2. Input has non-empty text
  return isFocused && inputValue.trim() !== '';
}

// Generator for whitespace-only strings
const whitespaceOnlyArbitrary = fc.array(
  fc.constantFrom(' ', '\t', '\n', '\r'),
  { minLength: 0, maxLength: 10 }
).map(arr => arr.join(''));

// Generator for non-empty text (after trimming)
const nonEmptyTextArbitrary = fc.string({ minLength: 1, maxLength: 50 })
  .filter(s => s.trim() !== '');

// Generator for input value (including empty, whitespace, and non-empty strings)
const inputValueArbitrary = fc.oneof(
  fc.constant(''),                                    // Empty string
  whitespaceOnlyArbitrary,                            // Whitespace only
  nonEmptyTextArbitrary                               // Non-empty text
);

describe('SearchHistoryDropdown Visibility', () => {
  // **Feature: user-profile-search-history, Property 10: Search history dropdown visibility**
  // **Validates: Requirements 3.10**
  describe('Property 10: Search history dropdown visibility', () => {
    it('dropdown should be visible when input is focused AND empty', () => {
      fc.assert(
        fc.property(whitespaceOnlyArbitrary, (emptyValue) => {
          const isFocused = true;
          const isVisible = shouldShowDropdown(isFocused, emptyValue);
          
          // When focused and empty, dropdown should be visible
          expect(isVisible).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('dropdown should be hidden when input is not focused', () => {
      fc.assert(
        fc.property(inputValueArbitrary, (inputValue) => {
          const isFocused = false;
          const isVisible = shouldShowDropdown(isFocused, inputValue);
          
          // When not focused, dropdown should always be hidden
          expect(isVisible).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('dropdown should be hidden when input has non-empty text', () => {
      fc.assert(
        fc.property(nonEmptyTextArbitrary, (inputValue) => {
          const isFocused = true;
          const isVisible = shouldShowDropdown(isFocused, inputValue);
          
          // When focused but has text, dropdown should be hidden
          expect(isVisible).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('dropdown and suggestions should be mutually exclusive when focused', () => {
      fc.assert(
        fc.property(inputValueArbitrary, (inputValue) => {
          const isFocused = true;
          const showDropdown = shouldShowDropdown(isFocused, inputValue);
          const showSuggestions = shouldShowSuggestions(isFocused, inputValue);
          
          // When focused, exactly one should be true (XOR)
          expect(showDropdown !== showSuggestions).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('neither dropdown nor suggestions should show when not focused', () => {
      fc.assert(
        fc.property(inputValueArbitrary, (inputValue) => {
          const isFocused = false;
          const showDropdown = shouldShowDropdown(isFocused, inputValue);
          const showSuggestions = shouldShowSuggestions(isFocused, inputValue);
          
          // When not focused, both should be hidden
          expect(showDropdown).toBe(false);
          expect(showSuggestions).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('visibility state should be deterministic for same inputs', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          inputValueArbitrary,
          (isFocused, inputValue) => {
            // Call the function twice with same inputs
            const result1 = shouldShowDropdown(isFocused, inputValue);
            const result2 = shouldShowDropdown(isFocused, inputValue);
            
            // Results should be identical
            expect(result1).toBe(result2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('whitespace-only input should be treated as empty', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).map(arr => arr.join('')),
          (whitespaceInput) => {
            const isFocused = true;
            
            // Whitespace-only should show dropdown (treated as empty)
            const showDropdown = shouldShowDropdown(isFocused, whitespaceInput);
            expect(showDropdown).toBe(true);
            
            // Whitespace-only should NOT show suggestions
            const showSuggestions = shouldShowSuggestions(isFocused, whitespaceInput);
            expect(showSuggestions).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
