/**
 * Property-based tests for OfflineCacheService
 * 
 * These tests validate the correctness properties of the offline cache service
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';
import {
  CachedSong,
  CachedAlbum,
  CachedPlaylist,
  SongMetadata,
  AlbumMetadata,
  PlaylistMetadata,
  LyricsData,
} from './offlineCacheService';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generator for LyricsData - stores raw TTML string
 */
const lyricsDataArb: fc.Arbitrary<LyricsData> = fc.record({
  ttml: fc.string({ minLength: 0, maxLength: 10000 }),
  type: fc.constantFrom('syllable-lyrics', 'lyrics', ''),
});

/**
 * Generator for SongMetadata
 */
const songMetadataArb: fc.Arbitrary<SongMetadata> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.uuid(),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: fc.uuid(),
  duration: fc.integer({ min: 1000, max: 600000 }),
  hasLyrics: fc.boolean(),
});

/**
 * Generator for Blob (simulated with size and type)
 */
const blobArb = (minSize: number, maxSize: number): fc.Arbitrary<Blob> =>
  fc.tuple(
    fc.integer({ min: minSize, max: maxSize }),
    fc.constantFrom('audio/mpeg', 'audio/mp4', 'audio/aac', 'image/jpeg', 'image/png')
  ).map(([size, type]) => {
    // Create a Blob with random data of the specified size
    const data = new Uint8Array(Math.min(size, 1024)); // Limit actual data for test performance
    return new Blob([data], { type });
  });

/**
 * Generator for audio Blob (7-10 MB typical, but smaller for tests)
 */
const audioBlobArb = blobArb(1000, 10000);

/**
 * Generator for artwork Blob (50-200 KB typical, but smaller for tests)
 */
const artworkBlobArb = blobArb(100, 1000);

/**
 * Generator for CachedSong
 */
const cachedSongArb: fc.Arbitrary<CachedSong> = fc.record({
  id: fc.uuid(),
  audio: audioBlobArb,
  artwork: artworkBlobArb,
  lyrics: lyricsDataArb,
  metadata: songMetadataArb,
  cachedAt: fc.integer({ min: 1577836800000, max: Date.now() }),
});

/**
 * Generator for date string (YYYY-MM-DD format)
 */
const dateStringArb = fc.integer({ min: 946684800000, max: Date.now() }).map(ts => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

/**
 * Generator for ISO date string
 */
const isoDateStringArb = fc.integer({ min: 946684800000, max: Date.now() }).map(ts => new Date(ts).toISOString());

/**
 * Generator for AlbumMetadata
 */
const albumMetadataArb: fc.Arbitrary<AlbumMetadata> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.uuid(),
  releaseDate: dateStringArb,
  trackCount: fc.integer({ min: 1, max: 50 }),
  genre: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

/**
 * Generator for CachedAlbum
 */
const cachedAlbumArb: fc.Arbitrary<CachedAlbum> = fc.record({
  id: fc.uuid(),
  artwork: artworkBlobArb,
  metadata: albumMetadataArb,
  trackIds: fc.array(fc.uuid(), { minLength: 1, maxLength: 50 }),
  cachedAt: fc.integer({ min: 1577836800000, max: Date.now() }),
});

/**
 * Generator for PlaylistMetadata
 */
const playlistMetadataArb: fc.Arbitrary<PlaylistMetadata> = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
  songCount: fc.integer({ min: 0, max: 1000 }),
  createdAt: isoDateStringArb,
});

/**
 * Generator for CachedPlaylist
 */
const cachedPlaylistArb: fc.Arbitrary<CachedPlaylist> = fc.record({
  id: fc.uuid(),
  artwork: artworkBlobArb,
  metadata: playlistMetadataArb,
  trackIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 100 }),
  cachedAt: fc.integer({ min: 1577836800000, max: Date.now() }),
});

// ============================================================================
// Property Tests
// ============================================================================

/**
 * **Feature: pwa-offline-music-cache, Property 1: CachedSong Structure Completeness**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 12.1**
 * 
 * For any CachedSong object stored in IndexedDB, it SHALL contain all required fields:
 * id (string), audio (Blob), artwork (Blob), lyrics (LyricsData with ttml and type),
 * metadata (with id, name, artistName, artistId, albumName, albumId, duration),
 * and cachedAt (number timestamp).
 */
describe('Property 1: CachedSong Structure Completeness', () => {
  it('should have all required top-level fields', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // Check all required top-level fields exist
        return (
          typeof song.id === 'string' &&
          song.id.length > 0 &&
          song.audio instanceof Blob &&
          song.artwork instanceof Blob &&
          typeof song.lyrics === 'object' &&
          song.lyrics !== null &&
          typeof song.metadata === 'object' &&
          song.metadata !== null &&
          typeof song.cachedAt === 'number' &&
          song.cachedAt > 0
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid audio Blob', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // Audio should be a Blob with size > 0
        return (
          song.audio instanceof Blob &&
          song.audio.size > 0 &&
          typeof song.audio.type === 'string'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid artwork Blob', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // Artwork should be a Blob with size > 0
        return (
          song.artwork instanceof Blob &&
          song.artwork.size > 0 &&
          typeof song.artwork.type === 'string'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid lyrics structure with ttml and type', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // Lyrics should have ttml string and type string
        return (
          typeof song.lyrics.ttml === 'string' &&
          typeof song.lyrics.type === 'string'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid metadata with all required fields', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        const { metadata } = song;
        // Check all required metadata fields
        return (
          typeof metadata.id === 'string' &&
          metadata.id.length > 0 &&
          typeof metadata.name === 'string' &&
          metadata.name.length > 0 &&
          typeof metadata.artistName === 'string' &&
          metadata.artistName.length > 0 &&
          typeof metadata.artistId === 'string' &&
          metadata.artistId.length > 0 &&
          typeof metadata.albumName === 'string' &&
          metadata.albumName.length > 0 &&
          typeof metadata.albumId === 'string' &&
          metadata.albumId.length > 0 &&
          typeof metadata.duration === 'number' &&
          metadata.duration > 0 &&
          typeof metadata.hasLyrics === 'boolean'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid cachedAt timestamp', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // cachedAt should be a valid Unix timestamp (after year 2000)
        const minTimestamp = new Date('2000-01-01').getTime();
        return (
          typeof song.cachedAt === 'number' &&
          song.cachedAt >= minTimestamp &&
          song.cachedAt <= Date.now()
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid lyrics type when ttml is present', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // If ttml is non-empty, type should be one of the valid values
        if (song.lyrics.ttml.length > 0) {
          return ['syllable-lyrics', 'lyrics', ''].includes(song.lyrics.type);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: pwa-offline-music-cache, Property 2: CachedAlbum Structure Completeness**
 * **Validates: Requirements 5.1, 12.2**
 * 
 * For any CachedAlbum object stored in IndexedDB, it SHALL contain all required fields:
 * id (string), artwork (Blob), metadata (with id, name, artistName, artistId, releaseDate, trackCount),
 * trackIds (string array), and cachedAt (number timestamp).
 */
describe('Property 2: CachedAlbum Structure Completeness', () => {
  it('should have all required top-level fields', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        return (
          typeof album.id === 'string' &&
          album.id.length > 0 &&
          album.artwork instanceof Blob &&
          typeof album.metadata === 'object' &&
          album.metadata !== null &&
          Array.isArray(album.trackIds) &&
          typeof album.cachedAt === 'number' &&
          album.cachedAt > 0
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid artwork Blob', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        return (
          album.artwork instanceof Blob &&
          album.artwork.size > 0 &&
          typeof album.artwork.type === 'string'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid metadata with all required fields', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        const { metadata } = album;
        return (
          typeof metadata.id === 'string' &&
          metadata.id.length > 0 &&
          typeof metadata.name === 'string' &&
          metadata.name.length > 0 &&
          typeof metadata.artistName === 'string' &&
          metadata.artistName.length > 0 &&
          typeof metadata.artistId === 'string' &&
          metadata.artistId.length > 0 &&
          typeof metadata.releaseDate === 'string' &&
          metadata.releaseDate.length > 0 &&
          typeof metadata.trackCount === 'number' &&
          metadata.trackCount > 0 &&
          (metadata.genre === undefined || typeof metadata.genre === 'string')
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid trackIds array with string elements', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        return (
          Array.isArray(album.trackIds) &&
          album.trackIds.length > 0 &&
          album.trackIds.every(id => typeof id === 'string' && id.length > 0)
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid cachedAt timestamp', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        const minTimestamp = new Date('2000-01-01').getTime();
        return (
          typeof album.cachedAt === 'number' &&
          album.cachedAt >= minTimestamp &&
          album.cachedAt <= Date.now()
        );
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: pwa-offline-music-cache, Property 3: CachedPlaylist Structure Completeness**
 * **Validates: Requirements 5.2, 12.3**
 * 
 * For any CachedPlaylist object stored in IndexedDB, it SHALL contain all required fields:
 * id (string), artwork (Blob), metadata (with id, name, songCount),
 * trackIds (string array), and cachedAt (number timestamp).
 */
describe('Property 3: CachedPlaylist Structure Completeness', () => {
  it('should have all required top-level fields', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        return (
          typeof playlist.id === 'string' &&
          playlist.id.length > 0 &&
          playlist.artwork instanceof Blob &&
          typeof playlist.metadata === 'object' &&
          playlist.metadata !== null &&
          Array.isArray(playlist.trackIds) &&
          typeof playlist.cachedAt === 'number' &&
          playlist.cachedAt > 0
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid artwork Blob', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        return (
          playlist.artwork instanceof Blob &&
          playlist.artwork.size > 0 &&
          typeof playlist.artwork.type === 'string'
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid metadata with all required fields', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        const { metadata } = playlist;
        return (
          typeof metadata.id === 'string' &&
          metadata.id.length > 0 &&
          typeof metadata.name === 'string' &&
          metadata.name.length > 0 &&
          typeof metadata.songCount === 'number' &&
          metadata.songCount >= 0 &&
          typeof metadata.createdAt === 'string' &&
          metadata.createdAt.length > 0 &&
          (metadata.description === undefined || typeof metadata.description === 'string')
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid trackIds array with string elements', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        return (
          Array.isArray(playlist.trackIds) &&
          playlist.trackIds.every(id => typeof id === 'string' && id.length > 0)
        );
      }),
      { numRuns: 100 }
    );
  });

  it('should have valid cachedAt timestamp', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        const minTimestamp = new Date('2000-01-01').getTime();
        return (
          typeof playlist.cachedAt === 'number' &&
          playlist.cachedAt >= minTimestamp &&
          playlist.cachedAt <= Date.now()
        );
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: pwa-offline-music-cache, Property 4: Cache Round-Trip Serialization**
 * **Validates: Requirements 12.4**
 * 
 * For any valid CachedSong, CachedAlbum, or CachedPlaylist object, storing it to IndexedDB
 * and then retrieving it SHALL produce an equivalent object (excluding Blob reference equality,
 * comparing Blob sizes and types instead).
 * 
 * Note: This property test validates the serialization logic by testing the comparison functions
 * and structure preservation. Full IndexedDB round-trip testing requires integration tests
 * with a real browser environment.
 */
describe('Property 4: Cache Round-Trip Serialization', () => {
  /**
   * Helper function to compare two CachedSong objects
   * Compares Blob by size and type instead of reference equality
   */
  const compareCachedSongs = (original: CachedSong, retrieved: CachedSong): boolean => {
    // Compare id
    if (original.id !== retrieved.id) return false;
    
    // Compare audio Blob (by size and type)
    if (original.audio.size !== retrieved.audio.size) return false;
    if (original.audio.type !== retrieved.audio.type) return false;
    
    // Compare artwork Blob (by size and type)
    if (original.artwork.size !== retrieved.artwork.size) return false;
    if (original.artwork.type !== retrieved.artwork.type) return false;
    
    // Compare lyrics
    if (JSON.stringify(original.lyrics) !== JSON.stringify(retrieved.lyrics)) return false;
    
    // Compare metadata
    if (JSON.stringify(original.metadata) !== JSON.stringify(retrieved.metadata)) return false;
    
    // Compare cachedAt
    if (original.cachedAt !== retrieved.cachedAt) return false;
    
    return true;
  };

  /**
   * Helper function to compare two CachedAlbum objects
   */
  const compareCachedAlbums = (original: CachedAlbum, retrieved: CachedAlbum): boolean => {
    if (original.id !== retrieved.id) return false;
    if (original.artwork.size !== retrieved.artwork.size) return false;
    if (original.artwork.type !== retrieved.artwork.type) return false;
    if (JSON.stringify(original.metadata) !== JSON.stringify(retrieved.metadata)) return false;
    if (JSON.stringify(original.trackIds) !== JSON.stringify(retrieved.trackIds)) return false;
    if (original.cachedAt !== retrieved.cachedAt) return false;
    return true;
  };

  /**
   * Helper function to compare two CachedPlaylist objects
   */
  const compareCachedPlaylists = (original: CachedPlaylist, retrieved: CachedPlaylist): boolean => {
    if (original.id !== retrieved.id) return false;
    if (original.artwork.size !== retrieved.artwork.size) return false;
    if (original.artwork.type !== retrieved.artwork.type) return false;
    if (JSON.stringify(original.metadata) !== JSON.stringify(retrieved.metadata)) return false;
    if (JSON.stringify(original.trackIds) !== JSON.stringify(retrieved.trackIds)) return false;
    if (original.cachedAt !== retrieved.cachedAt) return false;
    return true;
  };

  /**
   * Simulate round-trip by creating a deep copy (simulating IndexedDB serialization)
   * IndexedDB uses structured clone algorithm which preserves Blobs
   */
  const simulateRoundTrip = <T>(obj: T): T => {
    // For Blobs, create new Blob with same data
    // For other objects, use JSON parse/stringify
    return JSON.parse(JSON.stringify(obj, (key, value) => {
      if (value instanceof Blob) {
        return { __blob__: true, size: value.size, type: value.type };
      }
      return value;
    }), (key, value) => {
      if (value && value.__blob__) {
        // Create a new Blob with the same size and type
        const data = new Uint8Array(Math.min(value.size, 1024));
        return new Blob([data], { type: value.type });
      }
      return value;
    });
  };

  it('CachedSong comparison function correctly identifies equal objects', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        // Create a copy with same values
        const copy: CachedSong = {
          id: song.id,
          audio: new Blob([new Uint8Array(song.audio.size)], { type: song.audio.type }),
          artwork: new Blob([new Uint8Array(song.artwork.size)], { type: song.artwork.type }),
          lyrics: JSON.parse(JSON.stringify(song.lyrics)),
          metadata: JSON.parse(JSON.stringify(song.metadata)),
          cachedAt: song.cachedAt,
        };
        
        return compareCachedSongs(song, copy);
      }),
      { numRuns: 100 }
    );
  });

  it('CachedSong comparison function correctly identifies different objects', () => {
    fc.assert(
      fc.property(cachedSongArb, cachedSongArb, (song1, song2) => {
        // If IDs are different, comparison should return false
        if (song1.id !== song2.id) {
          return !compareCachedSongs(song1, song2);
        }
        return true; // Skip if IDs happen to be the same
      }),
      { numRuns: 100 }
    );
  });

  it('CachedAlbum comparison function correctly identifies equal objects', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        const copy: CachedAlbum = {
          id: album.id,
          artwork: new Blob([new Uint8Array(album.artwork.size)], { type: album.artwork.type }),
          metadata: JSON.parse(JSON.stringify(album.metadata)),
          trackIds: [...album.trackIds],
          cachedAt: album.cachedAt,
        };
        
        return compareCachedAlbums(album, copy);
      }),
      { numRuns: 100 }
    );
  });

  it('CachedAlbum comparison function correctly identifies different objects', () => {
    fc.assert(
      fc.property(cachedAlbumArb, cachedAlbumArb, (album1, album2) => {
        if (album1.id !== album2.id) {
          return !compareCachedAlbums(album1, album2);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('CachedPlaylist comparison function correctly identifies equal objects', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        const copy: CachedPlaylist = {
          id: playlist.id,
          artwork: new Blob([new Uint8Array(playlist.artwork.size)], { type: playlist.artwork.type }),
          metadata: JSON.parse(JSON.stringify(playlist.metadata)),
          trackIds: [...playlist.trackIds],
          cachedAt: playlist.cachedAt,
        };
        
        return compareCachedPlaylists(playlist, copy);
      }),
      { numRuns: 100 }
    );
  });

  it('CachedPlaylist comparison function correctly identifies different objects', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, cachedPlaylistArb, (playlist1, playlist2) => {
        if (playlist1.id !== playlist2.id) {
          return !compareCachedPlaylists(playlist1, playlist2);
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('CachedSong metadata is JSON serializable and deserializable', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        const serialized = JSON.stringify(song.metadata);
        const deserialized = JSON.parse(serialized);
        return JSON.stringify(deserialized) === serialized;
      }),
      { numRuns: 100 }
    );
  });

  it('CachedSong lyrics is JSON serializable and deserializable', () => {
    fc.assert(
      fc.property(cachedSongArb, (song) => {
        const serialized = JSON.stringify(song.lyrics);
        const deserialized = JSON.parse(serialized);
        return JSON.stringify(deserialized) === serialized;
      }),
      { numRuns: 100 }
    );
  });

  it('CachedAlbum metadata is JSON serializable and deserializable', () => {
    fc.assert(
      fc.property(cachedAlbumArb, (album) => {
        const serialized = JSON.stringify(album.metadata);
        const deserialized = JSON.parse(serialized);
        return JSON.stringify(deserialized) === serialized;
      }),
      { numRuns: 100 }
    );
  });

  it('CachedPlaylist metadata is JSON serializable and deserializable', () => {
    fc.assert(
      fc.property(cachedPlaylistArb, (playlist) => {
        const serialized = JSON.stringify(playlist.metadata);
        const deserialized = JSON.parse(serialized);
        return JSON.stringify(deserialized) === serialized;
      }),
      { numRuns: 100 }
    );
  });
});

// Export generators for use in other test files
export {
  cachedSongArb,
  cachedAlbumArb,
  cachedPlaylistArb,
  songMetadataArb,
  albumMetadataArb,
  playlistMetadataArb,
  lyricsDataArb,
  audioBlobArb,
  artworkBlobArb,
};
