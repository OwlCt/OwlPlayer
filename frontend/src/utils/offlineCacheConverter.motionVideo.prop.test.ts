/**
 * Property-based tests for Playlist Motion Video Caching
 * 
 * Tests:
 * - Property 3: 歌单动态封面缓存
 * 
 * **Feature: motion-video-deduplication**
 * **Validates: Requirements 3.1, 3.2, 3.4**
 */

import { describe, it, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import 'fake-indexeddb/auto';
import { OfflineCacheService, CachedAlbum, CachedSong, AlbumMetadata, SongMetadata, LyricsData } from '../services/offlineCacheService';
import { convertCachedAlbumToAlbumDetail, revokeObjectUrls } from './offlineCacheConverter';

// ============================================================================
// Test Setup
// ============================================================================

let service: OfflineCacheService;
const createdObjectUrls: string[] = [];

// Mock URL.createObjectURL and URL.revokeObjectURL for testing
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(async () => {
  // Create a fresh service instance for each test
  service = new OfflineCacheService();
  await service.init();
  // Clear all data to ensure clean state
  await service.clearAllCache();
  
  // Mock URL.createObjectURL to return predictable URLs
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
  // Clear all data before closing
  try {
    await service.clearAllCache();
  } catch {
    // Ignore errors during cleanup
  }
  service.close();
  
  // Restore original URL functions
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  
  // Clear tracked URLs
  createdObjectUrls.length = 0;
});

// ============================================================================
// Generators
// ============================================================================

/**
 * Generate a valid album ID
 */
const albumIdArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0 && !s.includes('\0'));

/**
 * Generate a valid song ID
 */
const songIdArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => s.trim().length > 0 && !s.includes('\0'));

/**
 * Generate a Blob representing artwork
 */
const artworkBlobArb = fc.uint8Array({ minLength: 10, maxLength: 100 })
  .map(arr => new Blob([arr], { type: 'image/jpeg' }));

/**
 * Generate a Blob representing a motion video
 */
const videoBlobArb = fc.uint8Array({ minLength: 100, maxLength: 500 })
  .map(arr => new Blob([arr], { type: 'video/mp4' }));

/**
 * Generate a Blob representing audio
 */
const audioBlobArb = fc.uint8Array({ minLength: 100, maxLength: 500 })
  .map(arr => new Blob([arr], { type: 'audio/mpeg' }));

/**
 * Generate album metadata
 */
const albumMetadataArb = (albumId: string): fc.Arbitrary<AlbumMetadata> => 
  fc.record({
    id: fc.constant(albumId),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    artistName: fc.string({ minLength: 1, maxLength: 50 }),
    artistId: fc.string({ minLength: 1, maxLength: 20 }),
    releaseDate: fc.tuple(
      fc.integer({ min: 1970, max: 2030 }),
      fc.integer({ min: 1, max: 12 }),
      fc.integer({ min: 1, max: 28 })
    ).map(([year, month, day]) => 
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    ),
    trackCount: fc.integer({ min: 1, max: 20 }),
    genre: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  });

/**
 * Generate song metadata
 */
const songMetadataArb = (songId: string, albumId: string): fc.Arbitrary<SongMetadata> =>
  fc.record({
    id: fc.constant(songId),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    artistName: fc.string({ minLength: 1, maxLength: 50 }),
    artistId: fc.string({ minLength: 1, maxLength: 20 }),
    albumName: fc.string({ minLength: 1, maxLength: 50 }),
    albumId: fc.constant(albumId),
    duration: fc.integer({ min: 60, max: 600 }),
    hasLyrics: fc.boolean(),
  });

/**
 * Generate empty lyrics data - stores raw TTML string
 */
const emptyLyricsArb: fc.Arbitrary<LyricsData> = fc.constant({
  ttml: '',
  type: '',
});

/**
 * Generate a cached song
 */
const cachedSongArb = (songId: string, albumId: string): fc.Arbitrary<CachedSong> =>
  fc.tuple(
    audioBlobArb,
    artworkBlobArb,
    songMetadataArb(songId, albumId),
    emptyLyricsArb
  ).map(([audio, artwork, metadata, lyrics]) => ({
    id: songId,
    audio,
    artwork,
    metadata,
    lyrics,
    cachedAt: Date.now(),
  }));

/**
 * Generate a cached album with motion video reference
 */
const cachedAlbumWithMotionVideoArb: fc.Arbitrary<{
  album: CachedAlbum;
  songs: CachedSong[];
  motionVideo: Blob;
}> = fc.tuple(
  albumIdArb,
  artworkBlobArb,
  videoBlobArb,
  fc.array(songIdArb, { minLength: 1, maxLength: 5 })
).chain(([albumId, artwork, motionVideo, songIds]) => {
  // Generate unique song IDs
  const uniqueSongIds = [...new Set(songIds)];
  
  return fc.tuple(
    albumMetadataArb(albumId),
    fc.tuple(...uniqueSongIds.map(sid => cachedSongArb(sid, albumId)))
  ).map(([metadata, songs]) => ({
    album: {
      id: albumId,
      artwork,
      motionVideoAlbumId: albumId, // Reference to motion video
      metadata: { ...metadata, trackCount: uniqueSongIds.length },
      trackIds: uniqueSongIds,
      cachedAt: Date.now(),
    },
    songs,
    motionVideo,
  }));
});

/**
 * Generate a cached album without motion video
 */
const cachedAlbumWithoutMotionVideoArb: fc.Arbitrary<{
  album: CachedAlbum;
  songs: CachedSong[];
}> = fc.tuple(
  albumIdArb,
  artworkBlobArb,
  fc.array(songIdArb, { minLength: 1, maxLength: 5 })
).chain(([albumId, artwork, songIds]) => {
  const uniqueSongIds = [...new Set(songIds)];
  
  return fc.tuple(
    albumMetadataArb(albumId),
    fc.tuple(...uniqueSongIds.map(sid => cachedSongArb(sid, albumId)))
  ).map(([metadata, songs]) => ({
    album: {
      id: albumId,
      artwork,
      motionVideoAlbumId: undefined, // No motion video
      metadata: { ...metadata, trackCount: uniqueSongIds.length },
      trackIds: uniqueSongIds,
      cachedAt: Date.now(),
    },
    songs,
  }));
});

/**
 * Generate multiple albums with some having motion videos (simulating playlist scenario)
 */
const playlistAlbumsArb: fc.Arbitrary<{
  albums: Array<{ album: CachedAlbum; songs: CachedSong[]; motionVideo?: Blob }>;
  uniqueMotionVideoAlbumIds: string[];
}> = fc.array(
  fc.oneof(
    cachedAlbumWithMotionVideoArb.map(data => ({ ...data, hasMotionVideo: true as const })),
    cachedAlbumWithoutMotionVideoArb.map(data => ({ ...data, hasMotionVideo: false as const, motionVideo: undefined }))
  ),
  { minLength: 1, maxLength: 5 }
).map(albums => {
  // Ensure unique album IDs
  const seenIds = new Set<string>();
  const uniqueAlbums = albums.filter(a => {
    if (seenIds.has(a.album.id)) return false;
    seenIds.add(a.album.id);
    return true;
  });
  
  const uniqueMotionVideoAlbumIds = uniqueAlbums
    .filter(a => a.hasMotionVideo && a.album.motionVideoAlbumId)
    .map(a => a.album.motionVideoAlbumId!);
  
  return {
    albums: uniqueAlbums,
    uniqueMotionVideoAlbumIds,
  };
});

// ============================================================================
// Property 3: 歌单动态封面缓存
// **Validates: Requirements 3.1, 3.2, 3.4**
// ============================================================================

describe('Property 3: 歌单动态封面缓存', () => {
  /**
   * **Validates: Requirements 3.1, 3.2**
   * For any playlist containing songs from N unique albums with motion videos,
   * caching the playlist SHALL result in exactly N motion videos being cached
   */
  it('caching albums with motion videos results in exactly N unique motion videos', async () => {
    await fc.assert(
      fc.asyncProperty(playlistAlbumsArb, async ({ albums, uniqueMotionVideoAlbumIds }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Cache motion videos for albums that have them
        for (const albumData of albums) {
          if (albumData.hasMotionVideo && albumData.motionVideo) {
            await service.cacheMotionVideo(albumData.album.id, albumData.motionVideo);
          }
        }
        
        // Get all cached motion videos
        const allMotionVideos = await service.getAllCachedMotionVideos();
        
        // Should have exactly as many motion videos as unique albums with motion videos
        return allMotionVideos.length === uniqueMotionVideoAlbumIds.length;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * Loading any song offline SHALL return the correct motion video for that song's album
   */
  it('convertCachedAlbumToAlbumDetail loads motion video from store', async () => {
    await fc.assert(
      fc.asyncProperty(cachedAlbumWithMotionVideoArb, async ({ album, songs, motionVideo }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Cache the motion video in the store
        await service.cacheMotionVideo(album.id, motionVideo);
        
        // Convert the album (this should load motion video from store)
        const albumDetail = await convertCachedAlbumToAlbumDetail(album, songs);
        
        // Should have a motion video URL
        const hasMotionVideoUrl = albumDetail.motionVideoUrl !== undefined;
        
        // Clean up object URLs
        revokeObjectUrls(albumDetail._objectUrls);
        
        return hasMotionVideoUrl;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * Album without motion video reference should not have motionVideoUrl
   */
  it('album without motion video reference has no motionVideoUrl', async () => {
    await fc.assert(
      fc.asyncProperty(cachedAlbumWithoutMotionVideoArb, async ({ album, songs }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Convert the album (no motion video to load)
        const albumDetail = await convertCachedAlbumToAlbumDetail(album, songs);
        
        // Should NOT have a motion video URL
        const hasNoMotionVideoUrl = albumDetail.motionVideoUrl === undefined;
        
        // Clean up object URLs
        revokeObjectUrls(albumDetail._objectUrls);
        
        return hasNoMotionVideoUrl;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.4**
   * Motion video URL should be included in _objectUrls for cleanup
   */
  it('motion video URL is included in _objectUrls for cleanup', async () => {
    await fc.assert(
      fc.asyncProperty(cachedAlbumWithMotionVideoArb, async ({ album, songs, motionVideo }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Cache the motion video in the store
        await service.cacheMotionVideo(album.id, motionVideo);
        
        // Convert the album
        const albumDetail = await convertCachedAlbumToAlbumDetail(album, songs);
        
        // If there's a motion video URL, it should be in _objectUrls
        let result = true;
        if (albumDetail.motionVideoUrl) {
          result = albumDetail._objectUrls.includes(albumDetail.motionVideoUrl);
        }
        
        // Clean up object URLs
        revokeObjectUrls(albumDetail._objectUrls);
        
        return result;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.1, 3.2**
   * Multiple albums referencing same motion video should share the cached video
   */
  it('multiple albums can reference the same motion video', async () => {
    await fc.assert(
      fc.asyncProperty(
        albumIdArb,
        videoBlobArb,
        fc.integer({ min: 2, max: 5 }),
        async (sharedAlbumId, motionVideo, numReferences) => {
          // Clear before each iteration
          await service.clearAllCache();
          
          // Cache the motion video multiple times (simulating multiple albums referencing it)
          for (let i = 0; i < numReferences; i++) {
            await service.cacheMotionVideo(sharedAlbumId, motionVideo);
          }
          
          // Should have exactly one motion video stored
          const allMotionVideos = await service.getAllCachedMotionVideos();
          const matchingVideos = allMotionVideos.filter(v => v.albumId === sharedAlbumId);
          
          // Should have exactly one entry with reference count equal to numReferences
          if (matchingVideos.length !== 1) return false;
          
          const refCount = await service.getMotionVideoRefCount(sharedAlbumId);
          return refCount === numReferences;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Album artwork URL is always created regardless of motion video
   */
  it('album artwork URL is always created', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(cachedAlbumWithMotionVideoArb, cachedAlbumWithoutMotionVideoArb),
        async (albumData) => {
          // Clear before each iteration
          await service.clearAllCache();
          
          // Cache motion video if present
          if ('motionVideo' in albumData && albumData.motionVideo) {
            await service.cacheMotionVideo(albumData.album.id, albumData.motionVideo);
          }
          
          // Convert the album
          const albumDetail = await convertCachedAlbumToAlbumDetail(albumData.album, albumData.songs);
          
          // Should always have an artwork URL
          const hasArtworkUrl = albumDetail.artworkUrl !== undefined && albumDetail.artworkUrl.length > 0;
          
          // Clean up object URLs
          revokeObjectUrls(albumDetail._objectUrls);
          
          return hasArtworkUrl;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Track order is preserved in conversion
   */
  it('track order is preserved in conversion', async () => {
    await fc.assert(
      fc.asyncProperty(cachedAlbumWithoutMotionVideoArb, async ({ album, songs }) => {
        // Clear before each iteration
        await service.clearAllCache();
        
        // Convert the album
        const albumDetail = await convertCachedAlbumToAlbumDetail(album, songs);
        
        // Track IDs in albumDetail.tracks should match the order in album.trackIds
        const convertedTrackIds = albumDetail.tracks.map(t => t.id);
        const expectedTrackIds = album.trackIds.filter(id => songs.some(s => s.id === id));
        
        // Clean up object URLs
        revokeObjectUrls(albumDetail._objectUrls);
        
        // Check order matches
        if (convertedTrackIds.length !== expectedTrackIds.length) return false;
        return convertedTrackIds.every((id, index) => id === expectedTrackIds[index]);
      }),
      { numRuns: 100 }
    );
  });
});
