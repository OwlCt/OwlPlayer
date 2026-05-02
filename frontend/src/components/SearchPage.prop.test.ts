import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SearchResult, SearchResultWithTop, Song, Album, Artist, TopResultItem, BestMatchItem } from '../types';

// **Feature: unified-album-display, Property 1: Combined records display in all view**
// **Validates: Requirements 1.1**

// Constants matching SearchPage
const INITIAL_DISPLAY = 5;

// Pure function that determines which sections should be visible
interface SectionVisibility {
  showBestMatch: boolean;
  showSongs: boolean;
  showArtists: boolean;
  showRecords: boolean;
}

function getSectionVisibility(results: SearchResult): SectionVisibility {
  const hasSongs = results.songs && results.songs.length > 0;
  const hasArtists = results.artists && results.artists.length > 0;
  const hasRecords = (results.albums?.length ?? 0) > 0 || (results.singlesAndEPs?.length ?? 0) > 0;
  
  // Best match is shown if any results exist
  const hasAnyResults = hasSongs || hasArtists || hasRecords;
  
  return {
    showBestMatch: hasAnyResults,
    showSongs: hasSongs,
    showArtists: hasArtists,
    showRecords: hasRecords,
  };
}

// Pure function to combine albums and singlesAndEPs
function getCombinedRecords(results: SearchResult): Album[] {
  return [...(results.albums || []), ...(results.singlesAndEPs || [])];
}

// Pure function to determine if "view more" button should be shown
function shouldShowViewMoreButton(results: SearchResult): boolean {
  const allRecords = getCombinedRecords(results);
  return allRecords.length > INITIAL_DISPLAY;
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

const searchResultArbitrary = fc.record({
  songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
  artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
  albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
}) as fc.Arbitrary<SearchResult>;

describe('SearchPage Section Visibility', () => {
  // **Feature: unified-album-display, Property 1: Combined records display in all view**
  // **Validates: Requirements 1.1**
  describe('Property 1: Combined records display in all view', () => {
    it('combined records count should equal albums.length + singlesAndEPs.length', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const combinedRecords = getCombinedRecords(results);
          const expectedCount = (results.albums?.length ?? 0) + (results.singlesAndEPs?.length ?? 0);
          expect(combinedRecords.length).toBe(expectedCount);
        }),
        { numRuns: 100 }
      );
    });

    it('combined records should contain all albums first, then all singlesAndEPs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const combinedRecords = getCombinedRecords(results);
          const albumsLength = results.albums?.length ?? 0;
          
          // First part should be albums
          for (let i = 0; i < albumsLength; i++) {
            expect(combinedRecords[i]).toEqual(results.albums[i]);
          }
          
          // Second part should be singlesAndEPs
          const singlesAndEPs = results.singlesAndEPs || [];
          for (let i = 0; i < singlesAndEPs.length; i++) {
            expect(combinedRecords[albumsLength + i]).toEqual(singlesAndEPs[i]);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('records section should be visible when albums or singlesAndEPs has items', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const visibility = getSectionVisibility(results);
          const hasAlbums = (results.albums?.length ?? 0) > 0;
          const hasSinglesAndEPs = (results.singlesAndEPs?.length ?? 0) > 0;
          
          expect(visibility.showRecords).toBe(hasAlbums || hasSinglesAndEPs);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: unified-album-display, Property 2: View more button visibility**
  // **Validates: Requirements 1.3**
  describe('Property 2: View more button visibility', () => {
    it('view more button should appear when combined records exceed INITIAL_DISPLAY', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const shouldShow = shouldShowViewMoreButton(results);
          const combinedCount = (results.albums?.length ?? 0) + (results.singlesAndEPs?.length ?? 0);
          
          expect(shouldShow).toBe(combinedCount > INITIAL_DISPLAY);
        }),
        { numRuns: 100 }
      );
    });

    it('view more button should not appear when combined records are within limit', () => {
      // Generate results with at most INITIAL_DISPLAY total records
      const limitedSearchResultArbitrary = fc.record({
        songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
        artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
        albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 2 }),
        singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 2 }),
      }) as fc.Arbitrary<SearchResult>;

      fc.assert(
        fc.property(limitedSearchResultArbitrary, (results) => {
          const combinedCount = (results.albums?.length ?? 0) + (results.singlesAndEPs?.length ?? 0);
          if (combinedCount <= INITIAL_DISPLAY) {
            expect(shouldShowViewMoreButton(results)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Section visibility consistency', () => {
    it('should hide songs section when no songs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const visibility = getSectionVisibility(results);
          expect(visibility.showSongs).toBe(results.songs.length > 0);
        }),
        { numRuns: 100 }
      );
    });

    it('should hide artists section when no artists', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const visibility = getSectionVisibility(results);
          expect(visibility.showArtists).toBe(results.artists.length > 0);
        }),
        { numRuns: 100 }
      );
    });

    it('should hide best match when all sections are empty', () => {
      const emptyResults: SearchResult = {
        songs: [],
        artists: [],
        albums: [],
        singlesAndEPs: [],
      };
      
      const visibility = getSectionVisibility(emptyResults);
      expect(visibility.showBestMatch).toBe(false);
      expect(visibility.showSongs).toBe(false);
      expect(visibility.showArtists).toBe(false);
      expect(visibility.showRecords).toBe(false);
    });

    it('should show best match when any section has results', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const visibility = getSectionVisibility(results);
          const hasAnyResults = 
            results.songs.length > 0 || 
            results.artists.length > 0 || 
            (results.albums?.length ?? 0) > 0 || 
            (results.singlesAndEPs?.length ?? 0) > 0;
          
          expect(visibility.showBestMatch).toBe(hasAnyResults);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: unified-album-display, Property 3: Expanded view completeness**
  // **Validates: Requirements 1.4**
  describe('Property 3: Expanded view completeness', () => {
    it('expanded records view should contain all albums and singlesAndEPs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const expandedItems = getCombinedRecords(results);
          
          // All albums should be in expanded view
          results.albums.forEach(album => {
            expect(expandedItems).toContainEqual(album);
          });
          
          // All singlesAndEPs should be in expanded view
          (results.singlesAndEPs || []).forEach(album => {
            expect(expandedItems).toContainEqual(album);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('expanded view should not contain any items not from albums or singlesAndEPs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const expandedItems = getCombinedRecords(results);
          const allOriginalRecords = [...(results.albums || []), ...(results.singlesAndEPs || [])];
          
          expandedItems.forEach(item => {
            expect(allOriginalRecords).toContainEqual(item);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('expanded view item count should equal sum of albums and singlesAndEPs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const expandedItems = getCombinedRecords(results);
          const expectedCount = (results.albums?.length ?? 0) + (results.singlesAndEPs?.length ?? 0);
          
          expect(expandedItems.length).toBe(expectedCount);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: unified-album-display, Property 4: Filtered records view**
  // **Validates: Requirements 2.3**
  describe('Property 4: Filtered records view', () => {
    it('filtered records should include all items from both albums and singlesAndEPs', () => {
      fc.assert(
        fc.property(searchResultArbitrary, (results) => {
          const filteredRecords = getCombinedRecords(results);
          
          // Should contain all albums
          results.albums.forEach(album => {
            expect(filteredRecords).toContainEqual(album);
          });
          
          // Should contain all singlesAndEPs
          (results.singlesAndEPs || []).forEach(album => {
            expect(filteredRecords).toContainEqual(album);
          });
        }),
        { numRuns: 100 }
      );
    });
  });
});

// **Feature: search-refactor, Property 2: TopResults first item as Best Match**
// **Validates: Requirements 2.2**

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

// Pure function to get Best Match from search results using topResults
function getBestMatchFromTopResults(results: SearchResultWithTop): BestMatchItem | null {
  if (!results.topResults || results.topResults.length === 0) {
    return null;
  }
  return topResultToBestMatch(results.topResults[0]);
}

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

describe('SearchPage TopResults Best Match', () => {
  // **Feature: search-refactor, Property 2: TopResults first item as Best Match**
  // **Validates: Requirements 2.2**
  describe('Property 2: TopResults first item as Best Match', () => {
    it('Best Match should be null when topResults is empty', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const resultsWithEmptyTopResults = { ...results, topResults: [] };
          const bestMatch = getBestMatchFromTopResults(resultsWithEmptyTopResults);
          expect(bestMatch).toBeNull();
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match should use first item from topResults when available', () => {
      // Generate results with at least one topResult
      const resultsWithTopResultsArbitrary = fc.record({
        songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
        artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
        albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        topResults: fc.array(topResultItemArbitrary, { minLength: 1, maxLength: 5 }),
        order: fc.array(fc.constantFrom('songs', 'artists', 'albums'), { minLength: 0, maxLength: 3 }),
      }) as fc.Arbitrary<SearchResultWithTop>;

      fc.assert(
        fc.property(resultsWithTopResultsArbitrary, (results) => {
          const bestMatch = getBestMatchFromTopResults(results);
          expect(bestMatch).not.toBeNull();
          
          // Best Match should have same id as first topResult
          expect(bestMatch!.id).toBe(results.topResults[0].id);
          expect(bestMatch!.name).toBe(results.topResults[0].name);
          expect(bestMatch!.type).toBe(results.topResults[0].type);
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match isCircular should be true only for artist type', () => {
      const resultsWithTopResultsArbitrary = fc.record({
        songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
        artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
        albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        topResults: fc.array(topResultItemArbitrary, { minLength: 1, maxLength: 5 }),
        order: fc.array(fc.constantFrom('songs', 'artists', 'albums'), { minLength: 0, maxLength: 3 }),
      }) as fc.Arbitrary<SearchResultWithTop>;

      fc.assert(
        fc.property(resultsWithTopResultsArbitrary, (results) => {
          const bestMatch = getBestMatchFromTopResults(results);
          expect(bestMatch).not.toBeNull();
          
          // isCircular should be true only for artist type
          expect(bestMatch!.isCircular).toBe(results.topResults[0].type === 'artist');
        }),
        { numRuns: 100 }
      );
    });

    it('Best Match should correctly map all fields from TopResultItem', () => {
      const resultsWithTopResultsArbitrary = fc.record({
        songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
        artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
        albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
        topResults: fc.array(topResultItemArbitrary, { minLength: 1, maxLength: 5 }),
        order: fc.array(fc.constantFrom('songs', 'artists', 'albums'), { minLength: 0, maxLength: 3 }),
      }) as fc.Arbitrary<SearchResultWithTop>;

      fc.assert(
        fc.property(resultsWithTopResultsArbitrary, (results) => {
          const bestMatch = getBestMatchFromTopResults(results);
          const topResult = results.topResults[0];
          
          expect(bestMatch).not.toBeNull();
          expect(bestMatch!.id).toBe(topResult.id);
          expect(bestMatch!.type).toBe(topResult.type);
          expect(bestMatch!.name).toBe(topResult.name);
          expect(bestMatch!.subtitle).toBe(topResult.subtitle);
          expect(bestMatch!.imageUrl).toBe(topResult.artworkUrl);
        }),
        { numRuns: 100 }
      );
    });
  });
});

// **Feature: search-refactor, Property 5: Section order consistency**
// **Validates: Requirements 4.1, 4.2**

// Type for section visibility check
interface SectionAvailability {
  songs: boolean;
  artists: boolean;
  albums: boolean;
}

// Pure function to determine which sections are available based on results
function getSectionAvailability(results: SearchResultWithTop): SectionAvailability {
  return {
    songs: (results.songs?.length ?? 0) > 0,
    artists: (results.artists?.length ?? 0) > 0,
    albums: (results.albums?.length ?? 0) > 0 || (results.singlesAndEPs?.length ?? 0) > 0,
  };
}

// Pure function to get the ordered sections that should be displayed
// This mirrors the logic in SearchPage.tsx renderAllView
// Note: Handles duplicate entries in order array by only including each section once
function getOrderedSections(results: SearchResultWithTop): string[] {
  const order = results.order && results.order.length > 0 ? results.order : ['songs', 'artists', 'albums'];
  const availability = getSectionAvailability(results);
  
  // Filter order to only include sections that have data, and deduplicate
  const seen = new Set<string>();
  return order.filter(sectionType => {
    if (seen.has(sectionType)) return false;
    seen.add(sectionType);
    
    if (sectionType === 'songs') return availability.songs;
    if (sectionType === 'artists') return availability.artists;
    if (sectionType === 'albums') return availability.albums;
    return false;
  });
}

// Pure function to get the first section type (displayed alongside Best Match)
function getFirstSectionType(results: SearchResultWithTop): string | undefined {
  const orderedSections = getOrderedSections(results);
  return orderedSections[0];
}

// Pure function to get remaining sections (displayed after Best Match row)
function getRemainingSections(results: SearchResultWithTop): string[] {
  const orderedSections = getOrderedSections(results);
  return orderedSections.slice(1);
}

// Generator for valid order arrays (no duplicates, only valid section types)
const validOrderArbitrary = fc.shuffledSubarray(['songs', 'artists', 'albums'], { minLength: 0, maxLength: 3 });

// Generator for SearchResultWithTop with valid order array
const searchResultWithValidOrderArbitrary = fc.record({
  songs: fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
  artists: fc.array(artistArbitrary, { minLength: 0, maxLength: 5 }),
  albums: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  singlesAndEPs: fc.array(albumArbitrary, { minLength: 0, maxLength: 5 }),
  topResults: fc.array(topResultItemArbitrary, { minLength: 0, maxLength: 5 }),
  order: validOrderArbitrary,
}) as fc.Arbitrary<SearchResultWithTop>;

describe('SearchPage Section Ordering', () => {
  // **Feature: search-refactor, Property 5: Section order consistency**
  // **Validates: Requirements 4.1, 4.2**
  describe('Property 5: Section order consistency', () => {
    it('displayed sections should follow API order array', () => {
      fc.assert(
        fc.property(searchResultWithValidOrderArbitrary, (results) => {
          const orderedSections = getOrderedSections(results);
          const apiOrder = results.order && results.order.length > 0 ? results.order : ['songs', 'artists', 'albums'];
          
          // Each displayed section should appear in the same relative order as in API order
          for (let i = 0; i < orderedSections.length - 1; i++) {
            const currentSection = orderedSections[i];
            const nextSection = orderedSections[i + 1];
            
            const currentIndex = apiOrder.indexOf(currentSection);
            const nextIndex = apiOrder.indexOf(nextSection);
            
            // Current section should come before next section in API order
            expect(currentIndex).toBeLessThan(nextIndex);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('only sections with data should be displayed', () => {
      fc.assert(
        fc.property(searchResultWithValidOrderArbitrary, (results) => {
          const orderedSections = getOrderedSections(results);
          const availability = getSectionAvailability(results);
          
          // Each displayed section should have data
          orderedSections.forEach(section => {
            if (section === 'songs') expect(availability.songs).toBe(true);
            if (section === 'artists') expect(availability.artists).toBe(true);
            if (section === 'albums') expect(availability.albums).toBe(true);
          });
        }),
        { numRuns: 100 }
      );
    });

    it('sections with data should not be omitted from display if in order array', () => {
      fc.assert(
        fc.property(searchResultWithValidOrderArbitrary, (results) => {
          const orderedSections = getOrderedSections(results);
          const availability = getSectionAvailability(results);
          const apiOrder = results.order && results.order.length > 0 ? results.order : ['songs', 'artists', 'albums'];
          
          // Each section with data that is in API order should be displayed
          apiOrder.forEach(section => {
            const hasData = 
              (section === 'songs' && availability.songs) ||
              (section === 'artists' && availability.artists) ||
              (section === 'albums' && availability.albums);
            
            if (hasData) {
              expect(orderedSections).toContain(section);
            }
          });
        }),
        { numRuns: 100 }
      );
    });

    it('first section should be the first available section in API order', () => {
      fc.assert(
        fc.property(searchResultWithValidOrderArbitrary, (results) => {
          const firstSection = getFirstSectionType(results);
          const availability = getSectionAvailability(results);
          const apiOrder = results.order && results.order.length > 0 ? results.order : ['songs', 'artists', 'albums'];
          
          if (!availability.songs && !availability.artists && !availability.albums) {
            // No sections available, first section should be undefined
            expect(firstSection).toBeUndefined();
          } else {
            // First section should be the first available section in API order
            const expectedFirst = apiOrder.find(section => {
              if (section === 'songs') return availability.songs;
              if (section === 'artists') return availability.artists;
              if (section === 'albums') return availability.albums;
              return false;
            });
            expect(firstSection).toBe(expectedFirst);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('remaining sections should not contain the first section', () => {
      fc.assert(
        fc.property(searchResultWithValidOrderArbitrary, (results) => {
          const firstSection = getFirstSectionType(results);
          const remainingSections = getRemainingSections(results);
          
          if (firstSection) {
            // First section should not be in remaining sections
            expect(remainingSections).not.toContain(firstSection);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('default order should be songs, artists, albums when order array is empty', () => {
      fc.assert(
        fc.property(searchResultWithValidOrderArbitrary, (results) => {
          // Create results with empty order array
          const resultsWithEmptyOrder = { ...results, order: [] };
          const orderedSections = getOrderedSections(resultsWithEmptyOrder);
          const availability = getSectionAvailability(resultsWithEmptyOrder);
          
          // Default order is ['songs', 'artists', 'albums']
          const defaultOrder = ['songs', 'artists', 'albums'];
          const expectedSections = defaultOrder.filter(section => {
            if (section === 'songs') return availability.songs;
            if (section === 'artists') return availability.artists;
            if (section === 'albums') return availability.albums;
            return false;
          });
          
          expect(orderedSections).toEqual(expectedSections);
        }),
        { numRuns: 100 }
      );
    });

    it('displayed sections should be unique (no duplicates)', () => {
      fc.assert(
        fc.property(searchResultWithTopArbitrary, (results) => {
          const orderedSections = getOrderedSections(results);
          const uniqueSections = [...new Set(orderedSections)];
          
          expect(orderedSections.length).toBe(uniqueSections.length);
        }),
        { numRuns: 100 }
      );
    });
  });
});

// Export for potential reuse
export { 
  getSectionVisibility, 
  getCombinedRecords, 
  shouldShowViewMoreButton, 
  INITIAL_DISPLAY, 
  topResultToBestMatch, 
  getBestMatchFromTopResults,
  getSectionAvailability,
  getOrderedSections,
  getFirstSectionType,
  getRemainingSections,
};
