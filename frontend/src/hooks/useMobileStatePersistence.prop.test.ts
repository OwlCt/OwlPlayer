/**
 * Property-based tests for Mobile State Persistence
 * 
 * **Feature: spotify-mobile-ui, Property 16: State Persistence Round Trip**
 * **Validates: Requirements 10.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  saveMobileNavigationState,
  loadMobileNavigationState,
  clearMobileNavigationState,
  serializeMobileState,
  deserializeMobileState,
  MobileNavigationState,
  MobilePersistentState,
} from './useMobileStatePersistence';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Arbitrary for generating valid pathnames
const pathnameArbitrary = fc.oneof(
  fc.constant('/'),
  fc.constant('/search'),
  fc.constant('/library'),
  fc.constant('/liked-songs'),
  fc.constant('/settings'),
  fc.constant('/profile'),
  // Dynamic routes with IDs
  fc.uuid().map(id => `/playlist/${id}`),
  fc.uuid().map(id => `/album/${id}`),
  fc.uuid().map(id => `/artist/${id}`),
  // Search with query params
  fc.string({ minLength: 1, maxLength: 50 }).map(q => `/search?q=${encodeURIComponent(q)}`),
);

// Arbitrary for generating playback position (0 to 10 minutes in seconds)
const playbackPositionArbitrary = fc.float({ min: 0, max: 600, noNaN: true });

// Arbitrary for generating song IDs
const songIdArbitrary = fc.uuid();

// Arbitrary for generating complete mobile persistent state
const mobilePersistentStateArbitrary = fc.record({
  navigation: fc.record({
    version: fc.constant(1),
    pathname: pathnameArbitrary,
    timestamp: fc.integer({ min: Date.now() - 1000000, max: Date.now() }),
  }) as fc.Arbitrary<MobileNavigationState>,
  playbackPosition: fc.option(playbackPositionArbitrary, { nil: undefined }),
  currentSongId: fc.option(songIdArbitrary, { nil: undefined }),
}) as fc.Arbitrary<MobilePersistentState>;

describe('Mobile State Persistence Property Tests', () => {
  beforeEach(() => {
    // Setup localStorage mock
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  /**
   * **Feature: spotify-mobile-ui, Property 16: State Persistence Round Trip**
   * 
   * *For any* navigation state and playback position, saving and then restoring
   * SHALL produce equivalent state.
   * 
   * **Validates: Requirements 10.2**
   */
  describe('Property 16: State Persistence Round Trip', () => {
    it('should restore equivalent navigation state after save and load', () => {
      fc.assert(
        fc.property(
          pathnameArbitrary,
          (pathname) => {
            // Clear any existing state
            clearMobileNavigationState();

            // Save the navigation state
            saveMobileNavigationState(pathname);

            // Load the navigation state
            const loadedState = loadMobileNavigationState();

            // Assert: state should be restored
            expect(loadedState).not.toBeNull();
            expect(loadedState!.pathname).toBe(pathname);
            expect(loadedState!.version).toBe(1);
            expect(typeof loadedState!.timestamp).toBe('number');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should serialize and deserialize mobile state correctly (round trip)', () => {
      fc.assert(
        fc.property(
          mobilePersistentStateArbitrary,
          (state) => {
            // Serialize the state
            const serialized = serializeMobileState(state);

            // Deserialize the state
            const deserialized = deserializeMobileState(serialized);

            // Assert: deserialized state should equal original
            expect(deserialized).not.toBeNull();
            expect(deserialized!.navigation.pathname).toBe(state.navigation.pathname);
            expect(deserialized!.navigation.version).toBe(state.navigation.version);
            expect(deserialized!.navigation.timestamp).toBe(state.navigation.timestamp);
            
            // Check optional fields
            if (state.playbackPosition !== undefined) {
              expect(deserialized!.playbackPosition).toBeCloseTo(state.playbackPosition, 5);
            } else {
              expect(deserialized!.playbackPosition).toBeUndefined();
            }
            
            if (state.currentSongId !== undefined) {
              expect(deserialized!.currentSongId).toBe(state.currentSongId);
            } else {
              expect(deserialized!.currentSongId).toBeUndefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve pathname exactly through save/load cycle', () => {
      fc.assert(
        fc.property(
          pathnameArbitrary,
          (pathname) => {
            clearMobileNavigationState();
            
            // Save
            saveMobileNavigationState(pathname);
            
            // Load
            const loaded = loadMobileNavigationState();
            
            // The pathname should be exactly preserved
            expect(loaded?.pathname).toBe(pathname);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple save/load cycles correctly', () => {
      fc.assert(
        fc.property(
          fc.array(pathnameArbitrary, { minLength: 1, maxLength: 10 }),
          (pathnames) => {
            clearMobileNavigationState();
            
            // Save each pathname in sequence
            for (const pathname of pathnames) {
              saveMobileNavigationState(pathname);
            }
            
            // Load should return the last saved pathname
            const loaded = loadMobileNavigationState();
            const lastPathname = pathnames[pathnames.length - 1];
            
            expect(loaded?.pathname).toBe(lastPathname);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should return null after clearing state', () => {
      fc.assert(
        fc.property(
          pathnameArbitrary,
          (pathname) => {
            // Save state
            saveMobileNavigationState(pathname);
            
            // Verify it was saved
            expect(loadMobileNavigationState()).not.toBeNull();
            
            // Clear state
            clearMobileNavigationState();
            
            // Should return null after clearing
            expect(loadMobileNavigationState()).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle special characters in pathnames', () => {
      // Generate pathnames with special characters that might appear in search queries
      const specialCharPathname = fc.string({ minLength: 1, maxLength: 50 })
        .filter(s => !s.includes('\0')) // Exclude null characters
        .map(q => `/search?q=${encodeURIComponent(q)}`);

      fc.assert(
        fc.property(
          specialCharPathname,
          (pathname) => {
            clearMobileNavigationState();
            
            saveMobileNavigationState(pathname);
            const loaded = loadMobileNavigationState();
            
            expect(loaded?.pathname).toBe(pathname);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Edge Cases', () => {
    it('should return null when no state is saved', () => {
      clearMobileNavigationState();
      const loaded = loadMobileNavigationState();
      expect(loaded).toBeNull();
    });

    it('should handle corrupted localStorage data gracefully', () => {
      // Manually set corrupted data
      localStorage.setItem('mobile-navigation-state', 'not-valid-json');
      
      // Should return null instead of throwing
      const loaded = loadMobileNavigationState();
      expect(loaded).toBeNull();
    });

    it('should handle missing version field gracefully', () => {
      // Set data with wrong version
      localStorage.setItem('mobile-navigation-state', JSON.stringify({
        version: 999, // Wrong version
        pathname: '/',
        timestamp: Date.now(),
      }));
      
      // Should return null for incompatible version
      const loaded = loadMobileNavigationState();
      expect(loaded).toBeNull();
    });
  });
});
