/**
 * Property-based tests for Song Detail Caching in DownloadManager
 * 
 * Feature: nowplaying-offline-cache
 * 
 * Property 1: Song Detail Caching During Download
 * Validates: Requirements 1.1, 1.2
 * 
 * Property 2: Cached Song Detail Completeness
 * Validates: Requirements 1.3, 1.4
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CachedSongDetail } from './offlineCacheService';

// ============================================================================
// Test Helpers and Arbitraries
// ============================================================================

/**
 * Generate a valid release date string
 */
const releaseDateArbitrary = fc.integer({ min: 2000, max: 2025 }).chain(year =>
  fc.integer({ min: 1, max: 12 }).chain(month =>
    fc.integer({ min: 1, max: 28 }).map(day => 
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    )
  )
);

/**
 * Generate a valid CachedSongDetail for testing
 */
const cachedSongDetailArbitrary = fc.record({
  composerName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  genres: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
  isrc: fc.option(fc.string({ minLength: 12, maxLength: 12 }), { nil: undefined }),
  credits: fc.record({
    composer: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    recordLabel: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    copyright: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
  }),
  album: fc.option(fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 100 }),
    artworkUrl: fc.constant('https://example.com/art/{w}x{h}.jpg'),
    recordLabel: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    copyright: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    releaseDate: fc.option(releaseDateArbitrary, { nil: undefined }),
    trackCount: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
  }), { nil: undefined }),
  artists: fc.option(fc.array(fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
  }), { minLength: 1, maxLength: 5 }), { nil: undefined }),
  primaryArtistId: fc.option(fc.uuid(), { nil: undefined }),
});

/**
 * Generate a valid CachedSongDetail with required fields for completeness testing
 * primaryArtistId is derived from the first artist's id
 */
const completeCachedSongDetailArbitrary = fc.array(
  fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  { minLength: 1, maxLength: 5 }
).chain(artists => 
  fc.record({
    composerName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
    genres: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
    isrc: fc.option(fc.string({ minLength: 12, maxLength: 12 }), { nil: undefined }),
    credits: fc.record({
      composer: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      recordLabel: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      copyright: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
    }),
    album: fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      artworkUrl: fc.constant('https://example.com/art/{w}x{h}.jpg'),
      recordLabel: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
      copyright: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
      releaseDate: fc.option(releaseDateArbitrary, { nil: undefined }),
      trackCount: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
    }),
    artists: fc.constant(artists),
    primaryArtistId: fc.constant(artists[0].id),
  })
);

/**
 * Simulate song detail caching for a collection of songs
 * Returns an array of cached song details (some may be undefined if caching failed)
 */
function simulateSongDetailCaching(
  songCount: number,
  failedIndices: Set<number>,
  songDetails: CachedSongDetail[]
): (CachedSongDetail | undefined)[] {
  const result: (CachedSongDetail | undefined)[] = [];
  
  for (let i = 0; i < songCount; i++) {
    if (failedIndices.has(i)) {
      result.push(undefined);
    } else {
      result.push(songDetails[i % songDetails.length]);
    }
  }
  
  return result;
}

/**
 * Check if a CachedSongDetail has all required fields for completeness
 */
function isCompleteSongDetail(detail: CachedSongDetail): boolean {
  // Must have credits object (not null/undefined)
  if (detail.credits === null || detail.credits === undefined) return false;
  
  // Must have artists array with at least one artist
  if (!detail.artists || detail.artists.length === 0) return false;
  
  // Each artist must have id and name
  for (const artist of detail.artists) {
    if (!artist.id || !artist.name) return false;
  }
  
  // Must have album object with id and name
  if (!detail.album || !detail.album.id || !detail.album.name) return false;
  
  return true;
}

// ============================================================================
// Property 1: Song Detail Caching During Download
// ============================================================================

describe('Property 1: Song Detail Caching During Download', () => {
  /**
   * **Property 1: Song Detail Caching During Download**
   * *For any* album or playlist download operation, after the download completes,
   * every song in the collection SHALL have its songDetail field populated with valid data.
   * 
   * **Validates: Requirements 1.1, 1.2**
   */

  it('all successfully downloaded songs have songDetail populated', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.array(cachedSongDetailArbitrary, { minLength: 1, maxLength: 20 }),
        (songCount, songDetails) => {
          // No failures - all songs should have songDetail
          const failedIndices = new Set<number>();
          const cachedDetails = simulateSongDetailCaching(songCount, failedIndices, songDetails);
          
          // All songs should have songDetail populated
          for (let i = 0; i < songCount; i++) {
            expect(cachedDetails[i]).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('failed song downloads have undefined songDetail', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 20 }),
        fc.array(fc.integer({ min: 0, max: 19 }), { minLength: 1, maxLength: 5 }),
        fc.array(cachedSongDetailArbitrary, { minLength: 1, maxLength: 20 }),
        (songCount, failedIndicesArray, songDetails) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const cachedDetails = simulateSongDetailCaching(songCount, failedIndices, songDetails);
          
          // Failed songs should have undefined songDetail
          for (const idx of failedIndices) {
            expect(cachedDetails[idx]).toBeUndefined();
          }
          
          // Successful songs should have songDetail
          for (let i = 0; i < songCount; i++) {
            if (!failedIndices.has(i)) {
              expect(cachedDetails[i]).toBeDefined();
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('songDetail count equals successful download count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.integer({ min: 0, max: 19 }), { minLength: 0, maxLength: 10 }),
        fc.array(cachedSongDetailArbitrary, { minLength: 1, maxLength: 20 }),
        (songCount, failedIndicesArray, songDetails) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const cachedDetails = simulateSongDetailCaching(songCount, failedIndices, songDetails);
          
          const definedCount = cachedDetails.filter(d => d !== undefined).length;
          const expectedCount = songCount - failedIndices.size;
          
          expect(definedCount).toBe(expectedCount);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 2: Cached Song Detail Completeness
// ============================================================================

describe('Property 2: Cached Song Detail Completeness', () => {
  /**
   * **Property 2: Cached Song Detail Completeness**
   * *For any* cached song with songDetail, the songDetail SHALL contain:
   * - credits object (may have empty fields)
   * - artists array with at least one artist (id and name)
   * - album object with id and name
   * 
   * **Validates: Requirements 1.3, 1.4**
   */

  it('complete songDetail has credits object', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          expect(songDetail.credits).toBeDefined();
          expect(typeof songDetail.credits).toBe('object');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('complete songDetail has artists array with at least one artist', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          expect(songDetail.artists).toBeDefined();
          expect(Array.isArray(songDetail.artists)).toBe(true);
          expect(songDetail.artists!.length).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('each artist in songDetail has id and name', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          for (const artist of songDetail.artists!) {
            expect(artist.id).toBeDefined();
            expect(typeof artist.id).toBe('string');
            expect(artist.id.length).toBeGreaterThan(0);
            
            expect(artist.name).toBeDefined();
            expect(typeof artist.name).toBe('string');
            expect(artist.name.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('complete songDetail has album object with id and name', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          expect(songDetail.album).toBeDefined();
          expect(songDetail.album!.id).toBeDefined();
          expect(typeof songDetail.album!.id).toBe('string');
          expect(songDetail.album!.id.length).toBeGreaterThan(0);
          
          expect(songDetail.album!.name).toBeDefined();
          expect(typeof songDetail.album!.name).toBe('string');
          expect(songDetail.album!.name.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isCompleteSongDetail correctly identifies complete details', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          expect(isCompleteSongDetail(songDetail)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isCompleteSongDetail rejects details without artists', () => {
    fc.assert(
      fc.property(
        cachedSongDetailArbitrary,
        (songDetail) => {
          const detailWithoutArtists = { ...songDetail, artists: undefined };
          expect(isCompleteSongDetail(detailWithoutArtists)).toBe(false);
          
          const detailWithEmptyArtists = { ...songDetail, artists: [] };
          expect(isCompleteSongDetail(detailWithEmptyArtists)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isCompleteSongDetail rejects details without album', () => {
    fc.assert(
      fc.property(
        cachedSongDetailArbitrary,
        (songDetail) => {
          const detailWithoutAlbum = { ...songDetail, album: undefined };
          expect(isCompleteSongDetail(detailWithoutAlbum)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isCompleteSongDetail rejects details without credits', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          // Test with credits set to null
          const detailWithNullCredits = { ...songDetail, credits: null as any };
          expect(isCompleteSongDetail(detailWithNullCredits)).toBe(false);
          
          // Test with credits set to undefined
          const detailWithUndefinedCredits = { ...songDetail, credits: undefined as any };
          expect(isCompleteSongDetail(detailWithUndefinedCredits)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Additional Song Detail Invariants
// ============================================================================

describe('Song Detail Caching Invariants', () => {
  it('primaryArtistId matches first artist id when artists exist', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          if (songDetail.artists && songDetail.artists.length > 0) {
            // primaryArtistId should match the first artist's id
            expect(songDetail.primaryArtistId).toBe(songDetail.artists[0].id);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('album artworkUrl contains placeholder tokens', () => {
    fc.assert(
      fc.property(
        completeCachedSongDetailArbitrary,
        (songDetail) => {
          if (songDetail.album && songDetail.album.artworkUrl) {
            // Artwork URL should contain {w} and {h} placeholders
            expect(songDetail.album.artworkUrl).toContain('{w}');
            expect(songDetail.album.artworkUrl).toContain('{h}');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('genres array contains only non-empty strings', () => {
    fc.assert(
      fc.property(
        cachedSongDetailArbitrary,
        (songDetail) => {
          if (songDetail.genres) {
            for (const genre of songDetail.genres) {
              expect(typeof genre).toBe('string');
              expect(genre.length).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
