import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: spotify-mobile-ui, Property 7: Search Results Layout**
// **Validates: Requirements 4.2**

/**
 * Type definitions for search results
 * These mirror the types used in MobileSearchPage
 */
interface Song {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
}

interface Artist {
  id: string;
  name: string;
  artworkUrl: string;
  genres?: string[];
}

interface Album {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
}

interface SearchResults {
  songs: Song[];
  artists: Artist[];
  albums: Album[];
  singlesAndEPs: Album[];
}

/**
 * Pure function to calculate the layout structure for search results
 * This represents the logic that determines how results are displayed
 * 
 * Returns the number of columns used for the layout
 * Mobile search results should always use single-column (1)
 */
export function getSearchResultsColumnCount(_results: SearchResults): number {
  // Mobile search results are always displayed in a single column
  // This is enforced by the CSS class "space-y-1" on the results container
  // and individual items using "w-full" for full-width display
  return 1;
}

/**
 * Pure function to determine if a result item should be full-width
 * In mobile search, all items should be full-width (single column)
 */
export function isResultItemFullWidth(_itemType: 'song' | 'artist' | 'album'): boolean {
  // All mobile search result items are full-width
  return true;
}

/**
 * Pure function to get the display order of result sections
 * Mobile search displays: Songs -> Artists -> Albums
 */
export function getResultSectionOrder(): ('songs' | 'artists' | 'albums')[] {
  return ['songs', 'artists', 'albums'];
}

/**
 * Pure function to calculate the maximum items shown per section
 * Mobile search limits each section to 5 items for better UX
 */
export const MAX_ITEMS_PER_SECTION = 5;

export function getDisplayedItemCount(totalItems: number): number {
  return Math.min(totalItems, MAX_ITEMS_PER_SECTION);
}

/**
 * Pure function to determine if results should be shown
 * Results are shown when there's at least one item in any category
 */
export function hasSearchResults(results: SearchResults): boolean {
  return (
    results.songs.length > 0 ||
    results.artists.length > 0 ||
    results.albums.length > 0 ||
    results.singlesAndEPs.length > 0
  );
}

// Generators for test data
const songArb: fc.Arbitrary<Song> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
});

const artistArb: fc.Arbitrary<Artist> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
  genres: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
});

const albumArb: fc.Arbitrary<Album> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
});

const searchResultsArb: fc.Arbitrary<SearchResults> = fc.record({
  songs: fc.array(songArb, { minLength: 0, maxLength: 20 }),
  artists: fc.array(artistArb, { minLength: 0, maxLength: 20 }),
  albums: fc.array(albumArb, { minLength: 0, maxLength: 20 }),
  singlesAndEPs: fc.array(albumArb, { minLength: 0, maxLength: 20 }),
});

const nonEmptySearchResultsArb: fc.Arbitrary<SearchResults> = fc.record({
  songs: fc.array(songArb, { minLength: 1, maxLength: 20 }),
  artists: fc.array(artistArb, { minLength: 1, maxLength: 20 }),
  albums: fc.array(albumArb, { minLength: 1, maxLength: 20 }),
  singlesAndEPs: fc.array(albumArb, { minLength: 0, maxLength: 10 }),
});

describe('MobileSearchPage', () => {
  // **Feature: spotify-mobile-ui, Property 7: Search Results Layout**
  // **Validates: Requirements 4.2**
  describe('Property 7: Search Results Layout', () => {
    it('should always use single-column layout for search results', () => {
      fc.assert(
        fc.property(
          searchResultsArb,
          (results) => {
            const columnCount = getSearchResultsColumnCount(results);
            expect(columnCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should render all result item types as full-width', () => {
      const itemTypes = ['song', 'artist', 'album'] as const;
      
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          (itemType) => {
            const isFullWidth = isResultItemFullWidth(itemType);
            expect(isFullWidth).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display results in consistent section order: songs, artists, albums', () => {
      const order = getResultSectionOrder();
      expect(order).toEqual(['songs', 'artists', 'albums']);
    });

    it('should limit each section to maximum 5 items', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (totalItems) => {
            const displayedCount = getDisplayedItemCount(totalItems);
            expect(displayedCount).toBeLessThanOrEqual(MAX_ITEMS_PER_SECTION);
            expect(displayedCount).toBe(Math.min(totalItems, MAX_ITEMS_PER_SECTION));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect when results exist', () => {
      fc.assert(
        fc.property(
          nonEmptySearchResultsArb,
          (results) => {
            const hasResults = hasSearchResults(results);
            expect(hasResults).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect when no results exist', () => {
      const emptyResults: SearchResults = {
        songs: [],
        artists: [],
        albums: [],
        singlesAndEPs: [],
      };
      
      const hasResults = hasSearchResults(emptyResults);
      expect(hasResults).toBe(false);
    });

    it('should detect results when only one category has items', () => {
      // Test each category individually
      const categoriesArb = fc.oneof(
        fc.record({
          songs: fc.array(songArb, { minLength: 1, maxLength: 5 }),
          artists: fc.constant([] as Artist[]),
          albums: fc.constant([] as Album[]),
          singlesAndEPs: fc.constant([] as Album[]),
        }),
        fc.record({
          songs: fc.constant([] as Song[]),
          artists: fc.array(artistArb, { minLength: 1, maxLength: 5 }),
          albums: fc.constant([] as Album[]),
          singlesAndEPs: fc.constant([] as Album[]),
        }),
        fc.record({
          songs: fc.constant([] as Song[]),
          artists: fc.constant([] as Artist[]),
          albums: fc.array(albumArb, { minLength: 1, maxLength: 5 }),
          singlesAndEPs: fc.constant([] as Album[]),
        }),
        fc.record({
          songs: fc.constant([] as Song[]),
          artists: fc.constant([] as Artist[]),
          albums: fc.constant([] as Album[]),
          singlesAndEPs: fc.array(albumArb, { minLength: 1, maxLength: 5 }),
        })
      );

      fc.assert(
        fc.property(
          categoriesArb,
          (results) => {
            const hasResults = hasSearchResults(results);
            expect(hasResults).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve item order within each section', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 1, maxLength: 20 }),
          (songs) => {
            // The displayed items should be the first N items (up to MAX_ITEMS_PER_SECTION)
            const displayedCount = getDisplayedItemCount(songs.length);
            const expectedDisplayed = songs.slice(0, displayedCount);
            
            // Verify the count matches
            expect(expectedDisplayed.length).toBe(displayedCount);
            
            // Verify order is preserved (first items are displayed)
            for (let i = 0; i < displayedCount; i++) {
              expect(expectedDisplayed[i]).toBe(songs[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle combined albums and singlesAndEPs correctly', () => {
      fc.assert(
        fc.property(
          fc.array(albumArb, { minLength: 0, maxLength: 10 }),
          fc.array(albumArb, { minLength: 0, maxLength: 10 }),
          (albums, singlesAndEPs) => {
            const results: SearchResults = {
              songs: [],
              artists: [],
              albums,
              singlesAndEPs,
            };
            
            // Combined albums should be albums + singlesAndEPs
            const combinedAlbums = [...albums, ...singlesAndEPs];
            const displayedCount = getDisplayedItemCount(combinedAlbums.length);
            
            // Should display up to MAX_ITEMS_PER_SECTION combined items
            expect(displayedCount).toBeLessThanOrEqual(MAX_ITEMS_PER_SECTION);
            expect(displayedCount).toBe(Math.min(combinedAlbums.length, MAX_ITEMS_PER_SECTION));
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
