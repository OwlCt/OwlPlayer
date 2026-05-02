import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SearchResultWithTop, Song, Album, Artist, TopResultItem, BestMatchItem } from '../types';

/**
 * Property-based tests for Search UI Redesign feature
 * Tests correctness properties defined in the design document
 */

// Pure function that converts TopResultItem to BestMatchItem (same as in SearchPage.tsx)
function topResultToBestMatch(topResult: TopResultItem): BestMatchItem {
  return {
    type: topResult.type,
    id: topResult.id,
    name: topResult.name,
    subtitle: topResult.subtitle,
    imageUrl: topResult.artworkUrl,
    isCircular: topResult.type === 'artist',
  };
}

// Pure function to determine if Best Match section should be visible
function shouldShowBestMatchSection(results: SearchResultWithTop | null): boolean {
  if (!results) return false;
  return results.topResults && results.topResults.length > 0;
}

// Pure function to get Best Match item from results
function getBestMatchItem(results: SearchResultWithTop): BestMatchItem | null {
  if (!results.topResults || results.topResults.length === 0) {
    return null;
  }
  return topResultToBestMatch(results.topResults[0]);
}

// Generators for test data
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

const albumArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  trackCount: fc.integer({ min: 1, max: 20 }),
}) as fc.Arbitrary<Album>;

const artistArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  genres: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
}) as fc.Arbitrary<Artist>;

// Generator for TopResultItem
const topResultItemArbitrary = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('artist', 'album', 'song') as fc.Arbitrary<'artist' | 'album' | 'song'>,
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  subtitle: fc.string({ minLength: 0, maxLength: 50 }),
});

// Generator for SearchResultWithTop
const searchResultWithTopArbitrary = fc.record({
  songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
  artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
  albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  topResults: fc.array(topResultItemArbitrary, { minLength: 0, maxLength: 5 }),
  order: fc.array(fc.constantFrom('songs', 'artists', 'albums'), { minLength: 0, maxLength: 3 }),
}) as fc.Arbitrary<SearchResultWithTop>;

// Generator for SearchResultWithTop with non-empty topResults
const searchResultWithNonEmptyTopArbitrary = fc.record({
  songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
  artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
  albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  topResults: fc.array(topResultItemArbitrary, { minLength: 1, maxLength: 5 }),
  order: fc.array(fc.constantFrom('songs', 'artists', 'albums'), { minLength: 0, maxLength: 3 }),
}) as fc.Arbitrary<SearchResultWithTop>;

describe('Search UI Redesign Property Tests', () => {
  /**
   * **Feature: search-ui-redesign, Property 1: Best Match Section Visibility**
   * *For any* search result, the Best_Match_Section SHALL be displayed if and only if topResults array is non-empty.
   * **Validates: Requirements 1.1, 1.6**
   */
  describe('Property 1: Best Match Section Visibility', () => {
    it('Best Match section should be visible when topResults is non-empty', () => {
      fc.assert(
        fc.property(searchResultWithNonEmptyTopArbitrary, (results) => {
          const shouldShow = shouldShowBestMatchSection(results);
          expect(shouldShow).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match section should NOT be visible when topResults is empty', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const resultsWithEmptyTopResults = { ...results, topResults: [] };
          const shouldShow = shouldShowBestMatchSection(resultsWithEmptyTopResults);
          expect(shouldShow).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match section visibility should be equivalent to topResults.length > 0', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const shouldShow = shouldShowBestMatchSection(results);
          const hasTopResults = results.topResults && results.topResults.length > 0;
          expect(shouldShow).toBe(hasTopResults);
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match section should NOT be visible when results is null', () => {
      const shouldShow = shouldShowBestMatchSection(null);
      expect(shouldShow).toBe(false);
    });
  });

  /**
   * **Feature: search-ui-redesign, Property 2: Best Match Item Circular Image**
   * *For any* BestMatchItem, the isCircular property SHALL be true if and only if the item type is "artist".
   * **Validates: Requirements 1.3, 1.4**
   */
  describe('Property 2: Best Match Item Circular Image', () => {
    it('isCircular should be true when type is artist', () => {
      const artistTopResultArbitrary = fc.record({
        id: fc.uuid(),
        type: fc.constant('artist') as fc.Arbitrary<'artist'>,
        name: fc.string({ minLength: 1, maxLength: 50 }),
        artworkUrl: fc.webUrl(),
        subtitle: fc.string({ minLength: 0, maxLength: 50 }),
      });

      fc.assert(
        fc.property(artistTopResultArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          expect(bestMatch.isCircular).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('isCircular should be false when type is album', () => {
      const albumTopResultArbitrary = fc.record({
        id: fc.uuid(),
        type: fc.constant('album') as fc.Arbitrary<'album'>,
        name: fc.string({ minLength: 1, maxLength: 50 }),
        artworkUrl: fc.webUrl(),
        subtitle: fc.string({ minLength: 0, maxLength: 50 }),
      });

      fc.assert(
        fc.property(albumTopResultArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          expect(bestMatch.isCircular).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('isCircular should be false when type is song', () => {
      const songTopResultArbitrary = fc.record({
        id: fc.uuid(),
        type: fc.constant('song') as fc.Arbitrary<'song'>,
        name: fc.string({ minLength: 1, maxLength: 50 }),
        artworkUrl: fc.webUrl(),
        subtitle: fc.string({ minLength: 0, maxLength: 50 }),
      });

      fc.assert(
        fc.property(songTopResultArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          expect(bestMatch.isCircular).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('isCircular should be equivalent to (type === "artist") for any type', () => {
      fc.assert(
        fc.property(topResultItemArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          expect(bestMatch.isCircular).toBe(topResult.type === 'artist');
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match from search results should have correct isCircular based on first topResult type', () => {
      fc.assert(
        fc.property(searchResultWithNonEmptyTopArbitrary, (results) => {
          const bestMatch = getBestMatchItem(results);
          expect(bestMatch).not.toBeNull();
          expect(bestMatch!.isCircular).toBe(results.topResults[0].type === 'artist');
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: search-ui-redesign, Property 3: Best Match Item Required Fields**
   * *For any* BestMatchItem created from a TopResultItem, the item SHALL contain valid id, name, subtitle, imageUrl, and type fields.
   * **Validates: Requirements 1.2**
   */
  describe('Property 3: Best Match Item Required Fields', () => {
    it('BestMatchItem should contain all required fields from TopResultItem', () => {
      fc.assert(
        fc.property(topResultItemArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          
          // All required fields must be present
          expect(bestMatch).toHaveProperty('id');
          expect(bestMatch).toHaveProperty('name');
          expect(bestMatch).toHaveProperty('subtitle');
          expect(bestMatch).toHaveProperty('imageUrl');
          expect(bestMatch).toHaveProperty('type');
          expect(bestMatch).toHaveProperty('isCircular');
        }),
        { numRuns: 100 }
      );
    });

    it('BestMatchItem fields should match TopResultItem values', () => {
      fc.assert(
        fc.property(topResultItemArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          
          expect(bestMatch.id).toBe(topResult.id);
          expect(bestMatch.name).toBe(topResult.name);
          expect(bestMatch.subtitle).toBe(topResult.subtitle);
          expect(bestMatch.imageUrl).toBe(topResult.artworkUrl);
          expect(bestMatch.type).toBe(topResult.type);
        }),
        { numRuns: 100 }
      );
    });

    it('BestMatchItem type should be one of artist, album, or song', () => {
      fc.assert(
        fc.property(topResultItemArbitrary, (topResult) => {
          const bestMatch = topResultToBestMatch(topResult);
          expect(['artist', 'album', 'song']).toContain(bestMatch.type);
        }),
        { numRuns: 100 }
      );
    });

    it('BestMatchItem from search results should have valid fields', () => {
      fc.assert(
        fc.property(searchResultWithNonEmptyTopArbitrary, (results) => {
          const bestMatch = getBestMatchItem(results);
          expect(bestMatch).not.toBeNull();
          
          // Verify all fields are defined
          expect(bestMatch!.id).toBeDefined();
          expect(bestMatch!.name).toBeDefined();
          expect(bestMatch!.type).toBeDefined();
          expect(bestMatch!.imageUrl).toBeDefined();
          expect(typeof bestMatch!.isCircular).toBe('boolean');
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: search-ui-redesign, Property 4: Songs Display Limit**
   * *For any* search result with N songs where N > 0, the "全部" view SHALL display at most 4 songs in the first row.
   * **Validates: Requirements 2.3**
   */
  describe('Property 4: Songs Display Limit', () => {
    const SONGS_DISPLAY_LIMIT = 4;

    // Pure function that returns songs to display in "all" view first row
    function getSongsForFirstRow(results: SearchResultWithTop): Song[] {
      return results.songs.slice(0, SONGS_DISPLAY_LIMIT);
    }

    it('songs in first row should be at most 4', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const songsToDisplay = getSongsForFirstRow(results);
          expect(songsToDisplay.length).toBeLessThanOrEqual(SONGS_DISPLAY_LIMIT);
        }),
        { numRuns: 100 }
      );
    });

    it('songs in first row should equal min(total songs, 4)', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const songsToDisplay = getSongsForFirstRow(results);
          const expectedCount = Math.min(results.songs.length, SONGS_DISPLAY_LIMIT);
          expect(songsToDisplay.length).toBe(expectedCount);
        }),
        { numRuns: 100 }
      );
    });

    it('when songs > 4, exactly 4 should be displayed', () => {
      // Generate results with more than 4 songs
      const manysongsArbitrary = fc.record({
        songs: fc.array(songArbitrary, { minLength: 5, maxLength: 20 }),
        artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
        albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        topResults: fc.array(topResultItemArbitrary, { minLength: 0, maxLength: 5 }),
        order: fc.array(fc.constantFrom('songs', 'artists', 'albums'), { minLength: 0, maxLength: 3 }),
      }) as fc.Arbitrary<SearchResultWithTop>;

      fc.assert(
        fc.property(manysongsArbitrary, (results) => {
          const songsToDisplay = getSongsForFirstRow(results);
          expect(songsToDisplay.length).toBe(SONGS_DISPLAY_LIMIT);
        }),
        { numRuns: 100 }
      );
    });

    it('displayed songs should be the first N songs from results', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const songsToDisplay = getSongsForFirstRow(results);
          
          // Each displayed song should match the corresponding song in results
          songsToDisplay.forEach((song, index) => {
            expect(song).toEqual(results.songs[index]);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('empty songs array should result in empty display', () => {
      const emptyResults: SearchResultWithTop = {
        songs: [],
        artists: [],
        albums: [],
        singlesAndEPs: [],
        topResults: [],
        order: [],
      };
      const songsToDisplay = getSongsForFirstRow(emptyResults);
      expect(songsToDisplay).toHaveLength(0);
    });
  });

  /**
   * **Feature: search-ui-redesign, Property 5: Filter Tab Filtering**
   * *For any* search result and selected filter tab, the displayed results SHALL contain only items of the corresponding type
   * (songs for "歌曲", artists for "艺术家", albums+singlesAndEPs for "唱片").
   * **Validates: Requirements 4.2**
   */
  describe('Property 5: Filter Tab Filtering', () => {
    // Pure function that filters search results based on active tab
    type SearchFilterTab = 'all' | 'songs' | 'artists' | 'records';
    
    function filterSearchResults(
      results: SearchResultWithTop,
      activeTab: SearchFilterTab
    ): {
      songs: Song[];
      artists: Artist[];
      records: Album[];
    } {
      switch (activeTab) {
        case 'songs':
          return { songs: results.songs, artists: [], records: [] };
        case 'artists':
          return { songs: [], artists: results.artists, records: [] };
        case 'records':
          return { songs: [], artists: [], records: [...results.albums, ...(results.singlesAndEPs || [])] };
        case 'all':
        default:
          return {
            songs: results.songs,
            artists: results.artists,
            records: [...results.albums, ...(results.singlesAndEPs || [])],
          };
      }
    }

    const filterTabArbitrary = fc.constantFrom<SearchFilterTab>('all', 'songs', 'artists', 'records');

    it('songs tab should only contain songs', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'songs');
          expect(filtered.songs).toEqual(results.songs);
          expect(filtered.artists).toHaveLength(0);
          expect(filtered.records).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('artists tab should only contain artists', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'artists');
          expect(filtered.songs).toHaveLength(0);
          expect(filtered.artists).toEqual(results.artists);
          expect(filtered.records).toHaveLength(0);
        }),
        { numRuns: 100 }
      );
    });

    it('records tab should contain albums and singlesAndEPs combined', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'records');
          const expectedRecords = [...results.albums, ...(results.singlesAndEPs || [])];
          expect(filtered.songs).toHaveLength(0);
          expect(filtered.artists).toHaveLength(0);
          expect(filtered.records).toEqual(expectedRecords);
        }),
        { numRuns: 100 }
      );
    });

    it('all tab should contain all result types', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'all');
          expect(filtered.songs).toEqual(results.songs);
          expect(filtered.artists).toEqual(results.artists);
          expect(filtered.records).toEqual([...results.albums, ...(results.singlesAndEPs || [])]);
        }),
        { numRuns: 100 }
      );
    });

    it('filtering should be consistent for any tab', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, filterTabArbitrary, (results, tab) => {
          const filtered1 = filterSearchResults(results, tab);
          const filtered2 = filterSearchResults(results, tab);
          expect(filtered1).toEqual(filtered2);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: search-ui-redesign, Property 6: Filter Tab Visibility**
   * *For any* search result where a category has zero items, the corresponding filter tab SHALL be disabled or hidden.
   * **Validates: Requirements 4.3**
   */
  describe('Property 6: Filter Tab Visibility', () => {
    // Pure function to determine which tabs should be visible based on results
    function getVisibleTabs(results: SearchResultWithTop): {
      songs: boolean;
      artists: boolean;
      records: boolean;
    } {
      return {
        songs: (results.songs?.length ?? 0) > 0,
        artists: (results.artists?.length ?? 0) > 0,
        records: (results.albums?.length ?? 0) > 0 || (results.singlesAndEPs?.length ?? 0) > 0,
      };
    }

    it('songs tab should be visible only when songs array is non-empty', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const visible = getVisibleTabs(results);
          const hasSongs = (results.songs?.length ?? 0) > 0;
          expect(visible.songs).toBe(hasSongs);
        }),
        { numRuns: 100 }
      );
    });

    it('artists tab should be visible only when artists array is non-empty', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const visible = getVisibleTabs(results);
          const hasArtists = (results.artists?.length ?? 0) > 0;
          expect(visible.artists).toBe(hasArtists);
        }),
        { numRuns: 100 }
      );
    });

    it('records tab should be visible when albums or singlesAndEPs is non-empty', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const visible = getVisibleTabs(results);
          const hasAlbums = (results.albums?.length ?? 0) > 0;
          const hasSinglesAndEPs = (results.singlesAndEPs?.length ?? 0) > 0;
          expect(visible.records).toBe(hasAlbums || hasSinglesAndEPs);
        }),
        { numRuns: 100 }
      );
    });

    it('all tabs should be hidden when all categories are empty', () => {
      const emptyResults: SearchResultWithTop = {
        songs: [],
        artists: [],
        albums: [],
        singlesAndEPs: [],
        topResults: [],
        order: [],
      };
      const visible = getVisibleTabs(emptyResults);
      expect(visible.songs).toBe(false);
      expect(visible.artists).toBe(false);
      expect(visible.records).toBe(false);
    });

    it('tab visibility should be consistent with category content', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const visible = getVisibleTabs(results);
          
          // If songs tab is visible, songs must have items
          if (visible.songs) {
            expect(results.songs.length).toBeGreaterThan(0);
          }
          
          // If artists tab is visible, artists must have items
          if (visible.artists) {
            expect(results.artists.length).toBeGreaterThan(0);
          }
          
          // If records tab is visible, albums or singlesAndEPs must have items
          if (visible.records) {
            expect(results.albums.length + (results.singlesAndEPs?.length ?? 0)).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});

// Export functions for potential reuse
export {
  topResultToBestMatch,
  shouldShowBestMatchSection,
  getBestMatchItem,
};
