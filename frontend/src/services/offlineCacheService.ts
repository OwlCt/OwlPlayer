/**
 * OfflineCacheService - IndexedDB-based service for offline music caching
 * 
 * This service handles all IndexedDB operations for caching songs, albums,
 * and playlists for offline playback.
 */

import { openDB, DBSchema, IDBPDatabase } from 'idb';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Lyrics data structure for cached songs
 * Stores raw TTML string to reuse the same parser as online mode
 */
export interface LyricsData {
  ttml: string;      // Raw TTML string from API
  type: string;      // 'syllable-lyrics' or 'lyrics'
}

// Legacy types kept for backward compatibility with existing cached data
export interface CachedLyricLine {
  startTime: number;
  endTime: number;
  text: string;
  syllables?: CachedSyllable[];
}

export interface CachedSyllable {
  timestamp: number;
  endTime: number;
  text: string;
}

// Legacy LyricsData format for migration
export interface LegacyLyricsData {
  lines: CachedLyricLine[];
  hasSyllables: boolean;
  translation?: CachedLyricLine[];
}

/**
 * Song metadata stored with cached songs
 */
export interface SongMetadata {
  id: string;
  name: string;
  artistName: string;
  artistId: string;
  albumName: string;
  albumId: string;
  duration: number;
  hasLyrics: boolean;
}

/**
 * Complete cached song structure
 */
export interface CachedSong {
  id: string;
  audio: Blob;           // Audio file (7-10 MB typical)
  artwork: Blob;         // Cover image (50-200 KB)
  lyrics: LyricsData;    // Lyrics with timestamps
  metadata: SongMetadata;
  songDetail?: CachedSongDetail;  // Optional song detail for NowPlaying
  cachedAt: number;      // Unix timestamp
}

/**
 * Album metadata stored with cached albums
 */
export interface AlbumMetadata {
  id: string;
  name: string;
  artistName: string;
  artistId: string;
  releaseDate: string;
  trackCount: number;
  genre?: string;
}

/**
 * Complete cached album structure
 */
export interface CachedAlbum {
  id: string;
  artwork: Blob;
  motionVideoAlbumId?: string;  // Reference to motionVideos store (replaces motionVideo Blob)
  metadata: AlbumMetadata;
  trackIds: string[];    // Ordered list of song IDs
  cachedAt: number;
}

/**
 * Playlist metadata stored with cached playlists
 */
export interface PlaylistMetadata {
  id: string;
  name: string;
  description?: string;
  songCount: number;
  createdAt: string;
  curatorName?: string;
}

/**
 * Complete cached playlist structure
 */
export interface CachedPlaylist {
  id: string;
  artwork: Blob;
  metadata: PlaylistMetadata;
  trackIds: string[];    // Ordered list of song IDs
  motionVideoAlbumIds: string[];  // References to motion videos in motionVideos store
  cachedAt: number;
}

/**
 * Song reference tracking for shared songs between collections
 */
export interface SongReference {
  songId: string;
  albumIds: string[];
  playlistIds: string[];
}

/**
 * Cached motion video with reference counting for deduplication
 */
export interface CachedMotionVideo {
  albumId: string;        // Primary key, same as album ID
  video: Blob;            // Motion video file (1-5 MB)
  referenceCount: number; // Number of albums/playlists referencing this
  cachedAt: number;       // Unix timestamp
}

/**
 * Cached song detail data for offline NowPlaying view
 */
export interface CachedSongDetail {
  composerName?: string;
  genres?: string[];
  isrc?: string;
  audioInfo?: {
    codec?: string;
    container?: string;
    mimeType?: string;
    bitrate?: number;
    bitDepth?: number;
    sampleRate?: number;
    channels?: number;
  };
  credits: {
    composer?: string;
    recordLabel?: string;
    copyright?: string;
  };
  album?: {
    id: string;
    name: string;
    artworkUrl: string;
    recordLabel?: string;
    copyright?: string;
    releaseDate?: string;
    trackCount?: number;
  };
  artists?: {
    id: string;
    name: string;
    // artworkUrl is stored separately in artistArtworks store
  }[];
  // Reference to artist artwork in artistArtworks store
  primaryArtistId?: string;
}

/**
 * Cached artist artwork with reference counting for deduplication
 */
export interface CachedArtistArtwork {
  artistId: string;        // Primary key
  artwork: Blob;           // Artist image (50-200 KB)
  referenceCount: number;  // Number of songs referencing this
  cachedAt: number;        // Unix timestamp
}

// ============================================================================
// IndexedDB Schema
// ============================================================================

interface OfflineCacheDBSchema extends DBSchema {
  songs: {
    key: string;
    value: CachedSong;
    indexes: {
      'by-cached-at': number;
    };
  };
  albums: {
    key: string;
    value: CachedAlbum;
    indexes: {
      'by-cached-at': number;
    };
  };
  playlists: {
    key: string;
    value: CachedPlaylist;
    indexes: {
      'by-cached-at': number;
    };
  };
  songReferences: {
    key: string;
    value: SongReference;
  };
  motionVideos: {
    key: string;
    value: CachedMotionVideo;
    indexes: {
      'by-cached-at': number;
    };
  };
  artistArtworks: {
    key: string;
    value: CachedArtistArtwork;
    indexes: {
      'by-cached-at': number;
    };
  };
}

const DB_NAME = 'owlplayer-offline-cache';
const DB_VERSION = 3;

// ============================================================================
// OfflineCacheService Class
// ============================================================================

class OfflineCacheService {
  private db: IDBPDatabase<OfflineCacheDBSchema> | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    if (this.db) {
      return;
    }

    this.initPromise = this.openDatabase();
    await this.initPromise;
  }

  private async openDatabase(): Promise<void> {
    try {
      this.db = await openDB<OfflineCacheDBSchema>(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Create songs store
          if (!db.objectStoreNames.contains('songs')) {
            const songsStore = db.createObjectStore('songs', { keyPath: 'id' });
            songsStore.createIndex('by-cached-at', 'cachedAt');
          }

          // Create albums store
          if (!db.objectStoreNames.contains('albums')) {
            const albumsStore = db.createObjectStore('albums', { keyPath: 'id' });
            albumsStore.createIndex('by-cached-at', 'cachedAt');
          }

          // Create playlists store
          if (!db.objectStoreNames.contains('playlists')) {
            const playlistsStore = db.createObjectStore('playlists', { keyPath: 'id' });
            playlistsStore.createIndex('by-cached-at', 'cachedAt');
          }

          // Create song references store for tracking shared songs
          if (!db.objectStoreNames.contains('songReferences')) {
            db.createObjectStore('songReferences', { keyPath: 'songId' });
          }

          // Create motion videos store for deduplicated motion video storage
          if (!db.objectStoreNames.contains('motionVideos')) {
            const motionVideosStore = db.createObjectStore('motionVideos', { keyPath: 'albumId' });
            motionVideosStore.createIndex('by-cached-at', 'cachedAt');
          }

          // Create artist artworks store for deduplicated artist artwork storage
          if (!db.objectStoreNames.contains('artistArtworks')) {
            const artistArtworksStore = db.createObjectStore('artistArtworks', { keyPath: 'artistId' });
            artistArtworksStore.createIndex('by-cached-at', 'cachedAt');
          }
        },
      });
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);
      throw error;
    }
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureDB(): Promise<IDBPDatabase<OfflineCacheDBSchema>> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // ==========================================================================
  // Song Operations
  // ==========================================================================

  /**
   * Cache a song with all its data
   */
  async cacheSong(song: CachedSong): Promise<void> {
    const db = await this.ensureDB();
    await db.put('songs', song);
  }

  /**
   * Get a cached song by ID
   */
  async getCachedSong(songId: string): Promise<CachedSong | null> {
    const db = await this.ensureDB();
    const song = await db.get('songs', songId);
    return song || null;
  }

  /**
   * Delete a cached song by ID
   */
  async deleteCachedSong(songId: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete('songs', songId);
    // Also clean up song references
    await db.delete('songReferences', songId);
  }

  /**
   * Check if a song is cached
   */
  async isSongCached(songId: string): Promise<boolean> {
    const db = await this.ensureDB();
    const song = await db.get('songs', songId);
    return !!song;
  }

  /**
   * Get all cached songs
   */
  async getAllCachedSongs(): Promise<CachedSong[]> {
    const db = await this.ensureDB();
    return db.getAll('songs');
  }

  /**
   * Get all cached song IDs
   */
  async getAllCachedSongIds(): Promise<string[]> {
    const db = await this.ensureDB();
    return db.getAllKeys('songs');
  }

  // ==========================================================================
  // Album Operations
  // ==========================================================================

  /**
   * Cache an album with its metadata
   */
  async cacheAlbum(album: CachedAlbum): Promise<void> {
    const db = await this.ensureDB();
    await db.put('albums', album);
  }

  /**
   * Get a cached album by ID
   */
  async getCachedAlbum(albumId: string): Promise<CachedAlbum | null> {
    const db = await this.ensureDB();
    const album = await db.get('albums', albumId);
    return album || null;
  }

  /**
   * Delete a cached album by ID
   */
  async deleteCachedAlbum(albumId: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete('albums', albumId);
  }

  /**
   * Get all cached albums
   */
  async getAllCachedAlbums(): Promise<CachedAlbum[]> {
    const db = await this.ensureDB();
    return db.getAll('albums');
  }

  /**
   * Get all cached album IDs
   */
  async getAllCachedAlbumIds(): Promise<string[]> {
    const db = await this.ensureDB();
    return db.getAllKeys('albums');
  }

  // ==========================================================================
  // Playlist Operations
  // ==========================================================================

  /**
   * Cache a playlist with its metadata
   */
  async cachePlaylist(playlist: CachedPlaylist): Promise<void> {
    const db = await this.ensureDB();
    await db.put('playlists', playlist);
  }

  /**
   * Get a cached playlist by ID
   */
  async getCachedPlaylist(playlistId: string): Promise<CachedPlaylist | null> {
    const db = await this.ensureDB();
    const playlist = await db.get('playlists', playlistId);
    return playlist || null;
  }

  /**
   * Delete a cached playlist by ID
   */
  async deleteCachedPlaylist(playlistId: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete('playlists', playlistId);
  }

  /**
   * Get all cached playlists
   */
  async getAllCachedPlaylists(): Promise<CachedPlaylist[]> {
    const db = await this.ensureDB();
    return db.getAll('playlists');
  }

  /**
   * Get all cached playlist IDs
   */
  async getAllCachedPlaylistIds(): Promise<string[]> {
    const db = await this.ensureDB();
    return db.getAllKeys('playlists');
  }

  // ==========================================================================
  // Song Reference Operations
  // ==========================================================================

  /**
   * Get song references (which albums/playlists reference this song)
   */
  async getSongReferences(songId: string): Promise<SongReference | null> {
    const db = await this.ensureDB();
    const ref = await db.get('songReferences', songId);
    return ref || null;
  }

  /**
   * Update song references
   */
  async updateSongReferences(reference: SongReference): Promise<void> {
    const db = await this.ensureDB();
    await db.put('songReferences', reference);
  }

  /**
   * Delete song references
   */
  async deleteSongReferences(songId: string): Promise<void> {
    const db = await this.ensureDB();
    await db.delete('songReferences', songId);
  }

  /**
   * Get all song references
   */
  async getAllSongReferences(): Promise<SongReference[]> {
    const db = await this.ensureDB();
    return db.getAll('songReferences');
  }

  // ==========================================================================
  // Motion Video Operations
  // ==========================================================================

  /**
   * Cache a motion video with reference counting
   * If the motion video already exists, increment the reference count
   * Otherwise, create a new entry with reference count 1
   */
  async cacheMotionVideo(albumId: string, video: Blob): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get('motionVideos', albumId);

    if (existing) {
      // Increment reference count
      existing.referenceCount += 1;
      await db.put('motionVideos', existing);
    } else {
      // Create new entry
      const cached: CachedMotionVideo = {
        albumId,
        video,
        referenceCount: 1,
        cachedAt: Date.now()
      };
      await db.put('motionVideos', cached);
    }
  }

  /**
   * Get a cached motion video by album ID
   */
  async getCachedMotionVideo(albumId: string): Promise<CachedMotionVideo | null> {
    const db = await this.ensureDB();
    const video = await db.get('motionVideos', albumId);
    return video || null;
  }

  /**
   * Check if a motion video is cached
   */
  async isMotionVideoCached(albumId: string): Promise<boolean> {
    const db = await this.ensureDB();
    const video = await db.get('motionVideos', albumId);
    return !!video;
  }

  /**
   * Increment motion video reference count
   */
  async incrementMotionVideoRef(albumId: string): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get('motionVideos', albumId);
    if (existing) {
      existing.referenceCount += 1;
      await db.put('motionVideos', existing);
    }
  }

  /**
   * Decrement motion video reference count and delete if zero
   * Returns true if the motion video was deleted, false otherwise
   */
  async decrementMotionVideoRef(albumId: string): Promise<boolean> {
    const db = await this.ensureDB();
    const existing = await db.get('motionVideos', albumId);

    if (!existing) return false;

    existing.referenceCount -= 1;

    if (existing.referenceCount <= 0) {
      await db.delete('motionVideos', albumId);
      return true;  // Deleted
    } else {
      await db.put('motionVideos', existing);
      return false;  // Still referenced
    }
  }

  /**
   * Get motion video reference count
   */
  async getMotionVideoRefCount(albumId: string): Promise<number> {
    const db = await this.ensureDB();
    const video = await db.get('motionVideos', albumId);
    return video?.referenceCount || 0;
  }

  /**
   * Get all cached motion videos
   */
  async getAllCachedMotionVideos(): Promise<CachedMotionVideo[]> {
    const db = await this.ensureDB();
    return db.getAll('motionVideos');
  }

  // ==========================================================================
  // Artist Artwork Operations
  // ==========================================================================

  /**
   * Cache an artist artwork with reference counting
   * If the artist artwork already exists, increment the reference count
   * Otherwise, create a new entry with reference count 1
   */
  async cacheArtistArtwork(artistId: string, artwork: Blob): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get('artistArtworks', artistId);

    if (existing) {
      // Increment reference count
      existing.referenceCount += 1;
      await db.put('artistArtworks', existing);
    } else {
      // Create new entry
      const cached: CachedArtistArtwork = {
        artistId,
        artwork,
        referenceCount: 1,
        cachedAt: Date.now()
      };
      await db.put('artistArtworks', cached);
    }
  }

  /**
   * Get a cached artist artwork by artist ID
   */
  async getCachedArtistArtwork(artistId: string): Promise<CachedArtistArtwork | null> {
    const db = await this.ensureDB();
    const artwork = await db.get('artistArtworks', artistId);
    return artwork || null;
  }

  /**
   * Check if an artist artwork is cached
   */
  async isArtistArtworkCached(artistId: string): Promise<boolean> {
    const db = await this.ensureDB();
    const artwork = await db.get('artistArtworks', artistId);
    return !!artwork;
  }

  /**
   * Increment artist artwork reference count
   */
  async incrementArtistArtworkRef(artistId: string): Promise<void> {
    const db = await this.ensureDB();
    const existing = await db.get('artistArtworks', artistId);
    if (existing) {
      existing.referenceCount += 1;
      await db.put('artistArtworks', existing);
    }
  }

  /**
   * Decrement artist artwork reference count and delete if zero
   * Returns true if the artist artwork was deleted, false otherwise
   */
  async decrementArtistArtworkRef(artistId: string): Promise<boolean> {
    const db = await this.ensureDB();
    const existing = await db.get('artistArtworks', artistId);

    if (!existing) return false;

    existing.referenceCount -= 1;

    if (existing.referenceCount <= 0) {
      await db.delete('artistArtworks', artistId);
      return true;  // Deleted
    } else {
      await db.put('artistArtworks', existing);
      return false;  // Still referenced
    }
  }

  /**
   * Get artist artwork reference count
   */
  async getArtistArtworkRefCount(artistId: string): Promise<number> {
    const db = await this.ensureDB();
    const artwork = await db.get('artistArtworks', artistId);
    return artwork?.referenceCount || 0;
  }

  /**
   * Get all cached artist artworks
   */
  async getAllCachedArtistArtworks(): Promise<CachedArtistArtwork[]> {
    const db = await this.ensureDB();
    return db.getAll('artistArtworks');
  }

  // ==========================================================================
  // Utility Operations
  // ==========================================================================

  /**
   * Get total cache size in bytes (approximate)
   */
  async getCacheSize(): Promise<number> {
    const db = await this.ensureDB();
    let totalSize = 0;

    // Calculate songs size
    const songs = await db.getAll('songs');
    for (const song of songs) {
      totalSize += song.audio.size;
      totalSize += song.artwork.size;
      // Estimate metadata size (JSON string length * 2 for UTF-16)
      totalSize += JSON.stringify(song.metadata).length * 2;
      totalSize += JSON.stringify(song.lyrics).length * 2;
      // Include songDetail size if present
      if (song.songDetail) {
        totalSize += JSON.stringify(song.songDetail).length * 2;
      }
    }

    // Calculate albums size
    const albums = await db.getAll('albums');
    for (const album of albums) {
      totalSize += album.artwork.size;
      totalSize += JSON.stringify(album.metadata).length * 2;
      totalSize += JSON.stringify(album.trackIds).length * 2;
    }

    // Calculate playlists size
    const playlists = await db.getAll('playlists');
    for (const playlist of playlists) {
      totalSize += playlist.artwork.size;
      totalSize += JSON.stringify(playlist.metadata).length * 2;
      totalSize += JSON.stringify(playlist.trackIds).length * 2;
    }

    // Calculate motion videos size
    const motionVideos = await db.getAll('motionVideos');
    for (const mv of motionVideos) {
      totalSize += mv.video.size;
    }

    // Calculate artist artworks size
    const artistArtworks = await db.getAll('artistArtworks');
    for (const aa of artistArtworks) {
      totalSize += aa.artwork.size;
    }

    return totalSize;
  }

  /**
   * Clear all cached data
   */
  async clearAllCache(): Promise<void> {
    const db = await this.ensureDB();
    await db.clear('songs');
    await db.clear('albums');
    await db.clear('playlists');
    await db.clear('songReferences');
    await db.clear('motionVideos');
    await db.clear('artistArtworks');
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
}

// Export singleton instance
export const offlineCacheService = new OfflineCacheService();

// Export class for testing
export { OfflineCacheService };
