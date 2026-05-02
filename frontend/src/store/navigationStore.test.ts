import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { useNavigationStore } from './navigationStore';
import { SearchResult } from '../types';

// Arbitrary for generating search results
const songArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  artistName: fc.string({ minLength: 1 }),
  albumName: fc.string({ minLength: 1 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.string(),
  hasLyrics: fc.boolean(),
});

const albumArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  artistName: fc.string({ minLength: 1 }),
  artworkUrl: fc.string(),
  trackCount: fc.integer({ min: 1, max: 50 }),
});

const artistArbitrary = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  artworkUrl: fc.string(),
  genres: fc.array(fc.string()),
});

const searchResultArbitrary: fc.Arbitrary<SearchResult> = fc.record({
  songs: fc.array(songArbitrary),
  albums: fc.array(albumArbitrary),
  artists: fc.array(artistArbitrary),
});

describe('NavigationStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useNavigationStore.setState({
      searchQuery: '',
      searchResults: null,
      expandedSection: null,
    });
  });

  /**
   * **Feature: enhanced-search-results, Property 12: Navigation State Preservation**
   * *For any* navigation from search results to a detail page and back,
   * the search query and results should be preserved.
   * **Validates: Requirements 4.3, 4.4**
   */
  it('Property 12: setSearchState preserves query and results', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        searchResultArbitrary,
        (query, results) => {
          const store = useNavigationStore.getState();
          
          // Set search state
          store.setSearchState(query, results);
          
          // Get updated state
          const updatedState = useNavigationStore.getState();
          
          // Verify query is preserved
          expect(updatedState.searchQuery).toBe(query);
          
          // Verify results are preserved
          expect(updatedState.searchResults).toEqual(results);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: enhanced-search-results, Property 12: Navigation State Preservation**
   * After setting and then clearing search state, the state should be reset.
   * **Validates: Requirements 4.3, 4.4**
   */
  it('Property 12: clearSearchState resets all search state', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        searchResultArbitrary,
        fc.constantFrom('songs', 'albums', 'artists', null),
        (query, results, section) => {
          const store = useNavigationStore.getState();
          
          // Set search state
          store.setSearchState(query, results);
          store.setExpandedSection(section as 'songs' | 'albums' | 'artists' | null);
          
          // Clear search state
          store.clearSearchState();
          
          // Get updated state
          const clearedState = useNavigationStore.getState();
          
          // Verify all state is cleared
          expect(clearedState.searchQuery).toBe('');
          expect(clearedState.searchResults).toBeNull();
          expect(clearedState.expandedSection).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: enhanced-search-results, Property 12: Navigation State Preservation**
   * Setting expanded section should preserve the section value.
   * **Validates: Requirements 4.3, 4.4**
   */
  it('Property 12: setExpandedSection preserves section value', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('songs', 'albums', 'artists', null),
        (section) => {
          const store = useNavigationStore.getState();
          
          // Set expanded section
          store.setExpandedSection(section as 'songs' | 'albums' | 'artists' | null);
          
          // Get updated state
          const updatedState = useNavigationStore.getState();
          
          // Verify section is preserved
          expect(updatedState.expandedSection).toBe(section);
        }
      ),
      { numRuns: 100 }
    );
  });
});
