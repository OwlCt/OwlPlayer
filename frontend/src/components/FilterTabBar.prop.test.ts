import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SearchFilterTab, SearchResult, Song, Album, Artist } from '../types';
import { tabs } from './FilterTabBar';

// **Feature: unified-album-display, Property 5: Tab visibility logic**
// **Validates: Requirements 2.4**

// Pure function that filters search results based on active tab
// Updated to match the current implementation which uses 'records' instead of separate albums/singlesAndEPs
function filterSearchResults(
  results: SearchResult,
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
      return { songs: [], artists: [], records: results.records || [] };
    case 'all':
    default:
      return {
        songs: results.songs,
        artists: results.artists,
        records: results.records || [],
      };
  }
}

// Pure function to determine if records tab should be visible
function shouldShowRecordsTab(results: SearchResult): boolean {
  return (results.records?.length ?? 0) > 0;
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
});

const albumArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  trackCount: fc.integer({ min: 1, max: 20 }),
  isSingle: fc.boolean(),
});

const artistArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  genres: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }),
});

const searchResultArbitrary = fc.record({
  songs: fc.array(songArbitrary, { minLength: 0, maxLength: 10 }),
  artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 10 }),
  records: fc.array(albumArbitrary, { minLength: 0, maxLength: 10 }),
});

const filterTabArbitrary = fc.constantFrom<SearchFilterTab>('all', 'songs', 'artists', 'records');

describe('FilterTabBar Filter Logic', () => {
  // **Feature: unified-album-display, Property 5: Tab visibility logic**
  // **Validates: Requirements 2.4**
  describe('Property 5: Tab visibility logic', () => {
    it('records tab should be visible if and only if records has items', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const shouldShow = shouldShowRecordsTab(results);
          const hasRecords = (results.records?.length ?? 0) > 0;
          
          expect(shouldShow).toBe(hasRecords);
        }),
        { numRuns: 100 }
      );
    });

    it('records tab should be hidden when records is empty', () => {
      const emptyResults: SearchResult = {
        songs: [],
        artists: [],
        records: [],
      };
      expect(shouldShowRecordsTab(emptyResults)).toBe(false);
    });

    it('records tab should be visible when records has items', () => {
      fc.assert(
        fc.property(
          fc.array(albumArbitrary, { minLength: 1, maxLength: 5 }),
          (records) => {
            const results: SearchResult = {
              songs: [],
              artists: [],
              records,
            };
            expect(shouldShowRecordsTab(results)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Filter tab correctly filters results by type', () => {
    it('songs tab should only show songs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'songs');
          expect(filtered.songs).toEqual(results.songs);
          expect(filtered.artists).toEqual([]);
          expect(filtered.records).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    it('artists tab should only show artists', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'artists');
          expect(filtered.songs).toEqual([]);
          expect(filtered.artists).toEqual(results.artists);
          expect(filtered.records).toEqual([]);
        }),
        { numRuns: 100 }
      );
    });

    it('records tab should only show records', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'records');
          expect(filtered.songs).toEqual([]);
          expect(filtered.artists).toEqual([]);
          expect(filtered.records).toEqual(results.records || []);
        }),
        { numRuns: 100 }
      );
    });

    it('all tab should show all result types', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const filtered = filterSearchResults(results, 'all');
          expect(filtered.songs).toEqual(results.songs);
          expect(filtered.artists).toEqual(results.artists);
          expect(filtered.records).toEqual(results.records || []);
        }),
        { numRuns: 100 }
      );
    });

    it('filtering should be idempotent', () => {
      fc.assert(
        fc.property(searchResultArbitrary, filterTabArbitrary, (results, tab) => {
          const filtered1 = filterSearchResults(results, tab);
          const filtered2 = filterSearchResults(results, tab);
          expect(filtered1).toEqual(filtered2);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Tab configuration', () => {
    it('should contain records tab with label 唱片', () => {
      const recordsTab = tabs.find(t => t.key === 'records');
      expect(recordsTab).toBeDefined();
      expect(recordsTab?.label).toBe('唱片');
    });

    it('should have exactly 4 tabs', () => {
      expect(tabs).toHaveLength(4);
    });
  });
});

// Export for use in SearchPage
export { filterSearchResults, shouldShowRecordsTab };
