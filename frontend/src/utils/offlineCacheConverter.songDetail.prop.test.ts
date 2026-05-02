/**
 * Property-based tests for offline song detail loading
 * 
 * Tests:
 * - Property 4: Offline Song Detail Loading with Artist Artwork
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  getSongDetailFromCache,
  getArtistArtworkWithFallback,
  revokeObjectUrls,
} from './offlineCacheConverter';
import {
  CachedSong,
  CachedSongDetail,
  SongMetadata,
  LyricsData,
  offlineCacheService,
} from '../services/offlineCacheService';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid ID string
 */
const idArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0);

/**
 * Generate a valid name string
 */
const nameArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

/**
 * Generate a duration in milliseconds (1 second to 10 minutes)
 */
const durationArb = fc.integer({ min: 1000, max: 600000 });

/**
 * Generate a timestamp (Unix timestamp in milliseconds)
 */
const timestampArb = fc.integer({ min: 0, max: Date.now() });

/**
 * Generate a date string (YYYY-MM-DD format)
 */
const dateStringArb = fc.tuple(
  fc.integer({ min: 2000, max: 2025 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([year, month, day]) => 
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

/**
 * Generate a small Blob for testing
 */
const blobArb = fc.uint8Array({ minLength: 1, maxLength: 100 })
  .map(arr => new Blob([arr], { type: 'image/png' }));


/**
 * Generate SongMetadata
 */
const songMetadataArb: fc.Arbitrary<SongMetadata> = fc.record({
  id: idArb,
  name: nameArb,
  artistName: nameArb,
  artistId: idArb,
  albumName: nameArb,
  albumId: idArb,
  duration: durationArb,
  hasLyrics: fc.boolean(),
});

/**
 * Generate minimal LyricsData - stores raw TTML string
 */
const lyricsDataArb: fc.Arbitrary<LyricsData> = fc.constant({
  ttml: '',
  type: '',
});

/**
 * Generate CachedSongDetail with artist info
 */
const cachedSongDetailArb: fc.Arbitrary<CachedSongDetail> = fc.record({
  composerName: fc.option(nameArb, { nil: undefined }),
  genres: fc.option(fc.array(nameArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  isrc: fc.option(fc.string({ minLength: 12, maxLength: 12 }), { nil: undefined }),
  credits: fc.record({
    composer: fc.option(nameArb, { nil: undefined }),
    recordLabel: fc.option(nameArb, { nil: undefined }),
    copyright: fc.option(nameArb, { nil: undefined }),
  }),
  album: fc.option(fc.record({
    id: idArb,
    name: nameArb,
    artworkUrl: fc.constant('https://example.com/artwork.jpg'),
    recordLabel: fc.option(nameArb, { nil: undefined }),
    copyright: fc.option(nameArb, { nil: undefined }),
    releaseDate: fc.option(dateStringArb, { nil: undefined }),
    trackCount: fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
  }), { nil: undefined }),
  artists: fc.option(fc.array(fc.record({
    id: idArb,
    name: nameArb,
  }), { minLength: 1, maxLength: 3 }), { nil: undefined }),
  primaryArtistId: fc.option(idArb, { nil: undefined }),
});

/**
 * Generate CachedSong with songDetail
 */
const cachedSongWithDetailArb: fc.Arbitrary<CachedSong> = fc.record({
  id: idArb,
  audio: blobArb,
  artwork: blobArb,
  lyrics: lyricsDataArb,
  metadata: songMetadataArb,
  songDetail: fc.option(cachedSongDetailArb, { nil: undefined }),
  cachedAt: timestampArb,
}).map(song => ({
  ...song,
  id: song.metadata.id, // Ensure id matches metadata.id
}));

/**
 * Generate CachedSong with songDetail that has primaryArtistId
 */
const cachedSongWithArtistRefArb: fc.Arbitrary<CachedSong> = fc.record({
  id: idArb,
  audio: blobArb,
  artwork: blobArb,
  lyrics: lyricsDataArb,
  metadata: songMetadataArb,
  cachedAt: timestampArb,
}).chain(song => {
  return cachedSongDetailArb.map(detail => ({
    ...song,
    id: song.metadata.id,
    songDetail: {
      ...detail,
      primaryArtistId: song.metadata.artistId, // Use artist ID from metadata
    },
  }));
});

// ============================================================================
// Test Helpers
// ============================================================================

// Track created Object URLs for cleanup
let createdObjectUrls: string[] = [];

// Mock URL.createObjectURL and URL.revokeObjectURL for testing
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(async () => {
  createdObjectUrls = [];
  // Initialize the offline cache service
  await offlineCacheService.init();
  // Clear all cached data before each test
  await offlineCacheService.clearAllCache();
  
  // Mock URL.createObjectURL to return predictable URLs
  // This is needed because fake-indexeddb doesn't preserve Blob instances
  let urlCounter = 0;
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:test-${urlCounter++}`;
    createdObjectUrls.push(url);
    return url;
  };
  
  URL.revokeObjectURL = () => {
    // No-op for testing
  };
});

afterEach(async () => {
  // Clean up any Object URLs created during tests
  revokeObjectUrls(createdObjectUrls);
  // Close the database connection
  offlineCacheService.close();
  
  // Restore original URL functions
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  
  // Clear tracked URLs
  createdObjectUrls.length = 0;
});


// ============================================================================
// Property 4: Offline Song Detail Loading with Artist Artwork
// ============================================================================

describe('Property 4: Offline Song Detail Loading with Artist Artwork', () => {
  /**
   * **Feature: nowplaying-offline-cache, Property 4: Offline Song Detail Loading with Artist Artwork**
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   * 
   * For any cached song with songDetail and primaryArtistId:
   * - Loading song detail from cache SHALL return the songDetail data
   * - If artist artwork is cached, loading SHALL return a valid Object URL
   * - If artist artwork is not cached, artistArtworkUrl SHALL be null (fallback to album artwork)
   */
  
  it('returns null for non-existent song', async () => {
    await fc.assert(
      fc.asyncProperty(idArb, async (songId) => {
        const result = await getSongDetailFromCache(songId);
        return result === null;
      }),
      { numRuns: 100 }
    );
  });

  it('returns songDetail when song is cached with detail', async () => {
    await fc.assert(
      fc.asyncProperty(cachedSongWithDetailArb, async (cachedSong) => {
        // Cache the song
        await offlineCacheService.cacheSong(cachedSong);
        
        // Load song detail from cache
        const result = await getSongDetailFromCache(cachedSong.id);
        
        if (result) {
          createdObjectUrls.push(...result.objectUrls);
        }
        
        // If song has songDetail, result should contain it
        if (cachedSong.songDetail) {
          return (
            result !== null &&
            result.songDetail !== null &&
            result.songDetail.composerName === cachedSong.songDetail.composerName
          );
        }
        
        // If song has no songDetail, result.songDetail should be null
        return result !== null && result.songDetail === null;
      }),
      { numRuns: 100 }
    );
  });

  it('returns valid Object URL when artist artwork is cached', async () => {
    await fc.assert(
      fc.asyncProperty(
        cachedSongWithArtistRefArb,
        blobArb,
        async (cachedSong, artworkBlob) => {
          // Cache the song
          await offlineCacheService.cacheSong(cachedSong);
          
          // Cache the artist artwork
          const artistId = cachedSong.songDetail?.primaryArtistId;
          if (artistId) {
            await offlineCacheService.cacheArtistArtwork(artistId, artworkBlob);
          }
          
          // Load song detail from cache
          const result = await getSongDetailFromCache(cachedSong.id);
          
          if (result) {
            createdObjectUrls.push(...result.objectUrls);
          }
          
          // Should have valid Object URL for artist artwork
          if (artistId) {
            return (
              result !== null &&
              result.artistArtworkUrl !== null &&
              result.artistArtworkUrl.startsWith('blob:') &&
              result.objectUrls.length === 1
            );
          }
          
          return result !== null;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns null artistArtworkUrl when artist artwork is not cached', async () => {
    await fc.assert(
      fc.asyncProperty(cachedSongWithArtistRefArb, async (cachedSong) => {
        // Cache the song but NOT the artist artwork
        await offlineCacheService.cacheSong(cachedSong);
        
        // Load song detail from cache
        const result = await getSongDetailFromCache(cachedSong.id);
        
        if (result) {
          createdObjectUrls.push(...result.objectUrls);
        }
        
        // artistArtworkUrl should be null (fallback scenario)
        return (
          result !== null &&
          result.artistArtworkUrl === null &&
          result.objectUrls.length === 0
        );
      }),
      { numRuns: 100 }
    );
  });

  it('objectUrls array contains all created URLs for cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(
        cachedSongWithArtistRefArb,
        blobArb,
        async (cachedSong, artworkBlob) => {
          // Cache the song and artist artwork
          await offlineCacheService.cacheSong(cachedSong);
          const artistId = cachedSong.songDetail?.primaryArtistId;
          if (artistId) {
            await offlineCacheService.cacheArtistArtwork(artistId, artworkBlob);
          }
          
          // Load song detail from cache
          const result = await getSongDetailFromCache(cachedSong.id);
          
          if (result) {
            createdObjectUrls.push(...result.objectUrls);
            
            // If artistArtworkUrl exists, it should be in objectUrls
            if (result.artistArtworkUrl) {
              return result.objectUrls.includes(result.artistArtworkUrl);
            }
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ============================================================================
// Artist Artwork Fallback Helper Tests
// ============================================================================

describe('getArtistArtworkWithFallback', () => {
  /**
   * Returns artist artwork URL when available
   */
  it('returns artist artwork URL when available', () => {
    fc.assert(
      fc.property(
        fc.webUrl(),
        fc.webUrl(),
        (artistUrl, fallbackUrl) => {
          const result = getArtistArtworkWithFallback(artistUrl, fallbackUrl);
          return result === artistUrl;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Returns fallback URL when artist artwork is null
   */
  it('returns fallback URL when artist artwork is null', () => {
    fc.assert(
      fc.property(fc.webUrl(), (fallbackUrl) => {
        const result = getArtistArtworkWithFallback(null, fallbackUrl);
        return result === fallbackUrl;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Never returns null when fallback is provided
   */
  it('never returns null when fallback is provided', () => {
    fc.assert(
      fc.property(
        fc.option(fc.webUrl(), { nil: null }),
        fc.webUrl(),
        (artistUrl, fallbackUrl) => {
          const result = getArtistArtworkWithFallback(artistUrl, fallbackUrl);
          return result !== null && result.length > 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  /**
   * Song without songDetail returns null songDetail
   */
  it('song without songDetail returns null songDetail', async () => {
    const songWithoutDetailArb = fc.record({
      id: idArb,
      audio: blobArb,
      artwork: blobArb,
      lyrics: lyricsDataArb,
      metadata: songMetadataArb,
      cachedAt: timestampArb,
    }).map(song => ({
      ...song,
      id: song.metadata.id,
      songDetail: undefined,
    }));

    await fc.assert(
      fc.asyncProperty(songWithoutDetailArb, async (cachedSong) => {
        await offlineCacheService.cacheSong(cachedSong);
        
        const result = await getSongDetailFromCache(cachedSong.id);
        
        if (result) {
          createdObjectUrls.push(...result.objectUrls);
        }
        
        return (
          result !== null &&
          result.songDetail === null &&
          result.artistArtworkUrl === null &&
          result.objectUrls.length === 0
        );
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Song with songDetail but no primaryArtistId returns null artistArtworkUrl
   */
  it('song with songDetail but no primaryArtistId returns null artistArtworkUrl', async () => {
    const songWithDetailNoArtistArb = fc.record({
      id: idArb,
      audio: blobArb,
      artwork: blobArb,
      lyrics: lyricsDataArb,
      metadata: songMetadataArb,
      cachedAt: timestampArb,
    }).chain(song => {
      return cachedSongDetailArb.map(detail => ({
        ...song,
        id: song.metadata.id,
        songDetail: {
          ...detail,
          primaryArtistId: undefined, // No artist reference
        },
      }));
    });

    await fc.assert(
      fc.asyncProperty(songWithDetailNoArtistArb, async (cachedSong) => {
        await offlineCacheService.cacheSong(cachedSong);
        
        const result = await getSongDetailFromCache(cachedSong.id);
        
        if (result) {
          createdObjectUrls.push(...result.objectUrls);
        }
        
        return (
          result !== null &&
          result.songDetail !== null &&
          result.artistArtworkUrl === null &&
          result.objectUrls.length === 0
        );
      }),
      { numRuns: 100 }
    );
  });
});
