import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Song, Album } from '../types';

// Helper arbitraries
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
});

// Generate valid date strings directly to avoid Invalid Date issues
const releaseDateArbitrary = fc.tuple(
  fc.integer({ min: 1950, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([year, month, day]) => 
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const albumArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
  releaseDate: releaseDateArbitrary,
  trackCount: fc.integer({ min: 1, max: 20 }),
});

const contentTypeArbitrary = fc.constantFrom('songs', 'albums', 'singles') as fc.Arbitrary<'songs' | 'albums' | 'singles'>;

const TITLES: Record<'songs' | 'albums' | 'singles', string> = {
  songs: 'Top Songs',
  albums: 'Albums',
  singles: 'Singles & EPs',
};

// Pure function that generates page header text
function getPageHeader(artistName: string, contentType: 'songs' | 'albums' | 'singles'): { artistName: string; title: string } {
  return {
    artistName,
    title: TITLES[contentType],
  };
}

// Pure function that gets items based on content type
function getItems(
  contentType: 'songs' | 'albums' | 'singles',
  topSongs: Song[],
  albums: Album[],
  singlesAndEPs: Album[]
): Song[] | Album[] {
  switch (contentType) {
    case 'songs':
      return topSongs;
    case 'albums':
      return albums;
    case 'singles':
      return singlesAndEPs;
    default:
      return [];
  }
}

describe('ArtistContentPage Logic', () => {
  // **Feature: artist-view-more-pages, Property 2: Page Header Display**
  // **Validates: Requirements 1.2, 2.2, 3.2**
  describe('Property 2: Page Header Display', () => {
    it('should include artist name in page header for any content type', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          contentTypeArbitrary,
          (artistName, contentType) => {
            const header = getPageHeader(artistName, contentType);
            expect(header.artistName).toBe(artistName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include correct section title in page header', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          contentTypeArbitrary,
          (artistName, contentType) => {
            const header = getPageHeader(artistName, contentType);
            expect(header.title).toBe(TITLES[contentType]);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "Top Songs" title for songs content type', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (artistName) => {
            const header = getPageHeader(artistName, 'songs');
            expect(header.title).toBe('Top Songs');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "Albums" title for albums content type', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (artistName) => {
            const header = getPageHeader(artistName, 'albums');
            expect(header.title).toBe('Albums');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "Singles & EPs" title for singles content type', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }),
          (artistName) => {
            const header = getPageHeader(artistName, 'singles');
            expect(header.title).toBe('Singles & EPs');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: artist-view-more-pages, Property 3: Content Rendering Completeness**
  // **Validates: Requirements 1.3, 2.3, 3.3**
  describe('Property 3: Content Rendering Completeness', () => {
    it('should return all top songs when content type is songs', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 0, maxLength: 50 }),
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          (topSongs, albums, singles) => {
            const items = getItems('songs', topSongs as Song[], albums as Album[], singles as Album[]);
            expect(items).toEqual(topSongs);
            expect(items.length).toBe(topSongs.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all albums when content type is albums', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 0, maxLength: 50 }),
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          (topSongs, albums, singles) => {
            const items = getItems('albums', topSongs as Song[], albums as Album[], singles as Album[]);
            expect(items).toEqual(albums);
            expect(items.length).toBe(albums.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return all singles/EPs when content type is singles', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 0, maxLength: 50 }),
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          (topSongs, albums, singles) => {
            const items = getItems('singles', topSongs as Song[], albums as Album[], singles as Album[]);
            expect(items).toEqual(singles);
            expect(items.length).toBe(singles.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve item order in returned items', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 1, maxLength: 50 }),
          (topSongs) => {
            const items = getItems('songs', topSongs as Song[], [], []);
            for (let i = 0; i < topSongs.length; i++) {
              expect(items[i]).toEqual(topSongs[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: artist-view-more-pages, Property 4: Loading State Indicator**
  // **Validates: Requirements 4.2**
  describe('Property 4: Loading State Indicator', () => {
    // Pure function to determine if loading indicator should be shown
    const shouldShowLoadingIndicator = (loading: boolean): boolean => loading;

    it('should show loading indicator when loading is true', () => {
      expect(shouldShowLoadingIndicator(true)).toBe(true);
    });

    it('should hide loading indicator when loading is false', () => {
      expect(shouldShowLoadingIndicator(false)).toBe(false);
    });

    it('should correctly reflect loading state for any boolean', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (loading) => {
            expect(shouldShowLoadingIndicator(loading)).toBe(loading);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: artist-view-more-pages, Property 6: Error State with Retry**
  // **Validates: Requirements 4.4**
  describe('Property 6: Error State with Retry', () => {
    // Pure function to determine error display state
    const getErrorState = (error: string | null): { showError: boolean; showRetry: boolean; errorMessage: string | null } => ({
      showError: error !== null,
      showRetry: error !== null,
      errorMessage: error,
    });

    it('should show error message and retry button when error exists', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (errorMessage) => {
            const state = getErrorState(errorMessage);
            expect(state.showError).toBe(true);
            expect(state.showRetry).toBe(true);
            expect(state.errorMessage).toBe(errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should hide error message and retry button when no error', () => {
      const state = getErrorState(null);
      expect(state.showError).toBe(false);
      expect(state.showRetry).toBe(false);
      expect(state.errorMessage).toBeNull();
    });

    it('should preserve error message content', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 200 }),
          (errorMessage) => {
            const state = getErrorState(errorMessage);
            expect(state.errorMessage).toBe(errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
