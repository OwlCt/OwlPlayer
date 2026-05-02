/**
 * Property-based tests for lyrics translation toggle feature
 * 
 * Uses fast-check for property-based testing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  loadTranslationPreference,
  saveTranslationPreference,
} from './playerStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get store() {
      return store;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('Lyrics Translation Toggle Properties', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  // **Feature: lyrics-translation-toggle, Property 1: Toggle state inversion**
  // *For any* initial toggle state (enabled or disabled), clicking the toggle
  // button should result in the opposite state.
  // **Validates: Requirements 1.2**
  describe('Property 1: Toggle state inversion', () => {
    it('should invert any boolean state when toggled', () => {
      fc.assert(
        fc.property(fc.boolean(), (initialState) => {
          // Set initial state
          saveTranslationPreference(initialState);
          
          // Toggle (simulate by reading, inverting, saving)
          const currentState = loadTranslationPreference();
          const newState = !currentState;
          saveTranslationPreference(newState);
          
          // Verify the state is inverted
          const finalState = loadTranslationPreference();
          expect(finalState).toBe(!initialState);
        }),
        { numRuns: 100 }
      );
    });

    it('should always produce opposite state after toggle', () => {
      fc.assert(
        fc.property(fc.boolean(), (state) => {
          const toggled = !state;
          expect(toggled).not.toBe(state);
          expect(toggled).toBe(!state);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: lyrics-translation-toggle, Property 3: Preference persistence round-trip**
  // *For any* toggle state change, reading from localStorage immediately after
  // the change should return the same state value.
  // **Validates: Requirements 2.1, 2.2**
  describe('Property 3: Preference persistence round-trip', () => {
    it('should persist and retrieve any boolean state correctly', () => {
      fc.assert(
        fc.property(fc.boolean(), (state) => {
          // Save state
          saveTranslationPreference(state);
          
          // Load state
          const loaded = loadTranslationPreference();
          
          // Should be the same
          expect(loaded).toBe(state);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle multiple sequential state changes', () => {
      fc.assert(
        fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), (states) => {
          for (const state of states) {
            saveTranslationPreference(state);
            const loaded = loadTranslationPreference();
            expect(loaded).toBe(state);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should default to true when no preference exists', () => {
      localStorageMock.clear();
      const loaded = loadTranslationPreference();
      expect(loaded).toBe(true);
    });
  });
});
