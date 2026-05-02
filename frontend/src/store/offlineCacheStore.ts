/**
 * offlineCacheStore - Zustand store for offline cache state management
 * 
 * This store manages:
 * - Cache status (which songs/albums/playlists are cached)
 * - Download progress tracking
 * - Storage information
 * - Network status
 */

import { create } from 'zustand';
import { offlineCacheService, CachedAlbum, CachedPlaylist } from '../services/offlineCacheService';
import { downloadManager, DownloadProgress } from '../services/downloadManager';
import { cacheManager, StorageInfo } from '../services/cacheManager';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Cache status for a collection (album or playlist)
 */
export type CacheStatus = 'none' | 'partial' | 'full';

/**
 * Song reference info for tracking which collections own each song
 */
interface SongReferenceMap {
  [songId: string]: {
    albumIds: string[];
    playlistIds: string[];
  };
}

/**
 * Offline cache state interface
 */
interface OfflineCacheState {
  // Cache status - using Set for O(1) lookups
  cachedSongIds: Set<string>;
  cachedAlbumIds: Set<string>;
  cachedPlaylistIds: Set<string>;
  partialAlbumIds: Set<string>;   // Albums with some songs cached
  partialPlaylistIds: Set<string>; // Playlists with some songs cached
  
  // Song references - tracks which collections own each cached song
  songReferences: SongReferenceMap;
  
  // Cached metadata for display (albums/playlists not in library but cached)
  cachedAlbums: CachedAlbum[];
  cachedPlaylists: CachedPlaylist[];
  
  // Download state
  downloadProgress: DownloadProgress | null;
  isDownloading: boolean;
  
  // Storage info
  storageInfo: StorageInfo | null;
  
  // Network status
  isOnline: boolean;
  
  // Initialization flag
  isInitialized: boolean;
  
  // Actions
  init: () => Promise<void>;
  refreshCacheStatus: () => Promise<void>;
  startAlbumDownload: (albumId: string) => Promise<void>;
  startPlaylistDownload: (playlistId: string) => Promise<void>;
  startLikedSongsDownload: (songs: import('../types').Song[]) => Promise<void>;
  cancelDownload: () => void;
  deleteAlbumCache: (albumId: string) => Promise<void>;
  deletePlaylistCache: (playlistId: string) => Promise<void>;
  deleteSongCache: (songId: string, collectionType: 'album' | 'playlist', collectionId: string) => Promise<void>;
  clearAllCache: () => Promise<void>;
  setOnlineStatus: (isOnline: boolean) => void;
  
  // Utility methods
  isSongCached: (songId: string) => boolean;
  isAlbumCached: (albumId: string) => boolean;
  isPlaylistCached: (playlistId: string) => boolean;
  getAlbumCacheStatus: (albumId: string, trackIds: string[]) => CacheStatus;
  getPlaylistCacheStatus: (playlistId: string, trackIds: string[]) => CacheStatus;
  getAlbumCacheStatusByCount: (albumId: string, currentTrackCount: number) => CacheStatus;
  getPlaylistCacheStatusByCount: (playlistId: string, currentTrackCount: number) => CacheStatus;
  isSongCachedForAlbum: (songId: string, albumId: string) => boolean;
  isSongCachedForPlaylist: (songId: string, playlistId: string) => boolean;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useOfflineCacheStore = create<OfflineCacheState>((set, get) => {
  // Subscribe to download progress changes
  let unsubscribeProgress: (() => void) | null = null;

  return {
    // Initial state
    cachedSongIds: new Set<string>(),
    cachedAlbumIds: new Set<string>(),
    cachedPlaylistIds: new Set<string>(),
    partialAlbumIds: new Set<string>(),
    partialPlaylistIds: new Set<string>(),
    songReferences: {},
    cachedAlbums: [],
    cachedPlaylists: [],
    downloadProgress: null,
    isDownloading: false,
    storageInfo: null,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isInitialized: false,

    /**
     * Initialize the store - load cache status from IndexedDB
     */
    init: async () => {
      if (get().isInitialized) return;
      
      try {
        // Initialize IndexedDB service
        await offlineCacheService.init();
        
        // Load cache status
        await get().refreshCacheStatus();
        
        // Subscribe to download progress
        if (!unsubscribeProgress) {
          let lastSongId: string | null = null;
          
          unsubscribeProgress = downloadManager.onProgressChange((progress) => {
            const prevCachedSongIds = get().cachedSongIds;
            let newCachedSongIds = prevCachedSongIds;
            
            // When currentSongId changes and we had a previous song, it means that song completed
            // Add it to cachedSongIds immediately for instant UI feedback
            if (lastSongId && lastSongId !== progress.currentSongId && !progress.failedSongs.includes(lastSongId)) {
              newCachedSongIds = new Set(prevCachedSongIds);
              newCachedSongIds.add(lastSongId);
            }
            
            lastSongId = progress.currentSongId;
            
            set({
              downloadProgress: progress,
              isDownloading: progress.status === 'downloading',
              cachedSongIds: newCachedSongIds,
            });
            
            // Refresh full cache status when download completes
            if (progress.status === 'completed' || progress.status === 'cancelled') {
              lastSongId = null;
              get().refreshCacheStatus();
            }
          });
        }
        
        // Set up online/offline listeners
        if (typeof window !== 'undefined') {
          window.addEventListener('online', () => get().setOnlineStatus(true));
          window.addEventListener('offline', () => get().setOnlineStatus(false));
        }
        
        set({ isInitialized: true });
      } catch (error) {
        console.error('Failed to initialize offline cache store:', error);
      }
    },

    /**
     * Refresh cache status from IndexedDB
     */
    refreshCacheStatus: async () => {
      try {
        // Get all cached IDs, metadata, and song references
        const [songIds, albumIds, playlistIds, storageInfo, albums, playlists, songRefs] = await Promise.all([
          offlineCacheService.getAllCachedSongIds(),
          offlineCacheService.getAllCachedAlbumIds(),
          offlineCacheService.getAllCachedPlaylistIds(),
          cacheManager.getStorageInfo(),
          offlineCacheService.getAllCachedAlbums(),
          offlineCacheService.getAllCachedPlaylists(),
          offlineCacheService.getAllSongReferences(),
        ]);
        
        const cachedSongIds = new Set(songIds);
        const cachedAlbumIds = new Set(albumIds);
        const cachedPlaylistIds = new Set(playlistIds);
        
        // Build song references map
        const songReferences: SongReferenceMap = {};
        for (const ref of songRefs) {
          songReferences[ref.songId] = {
            albumIds: ref.albumIds || [],
            playlistIds: ref.playlistIds || [],
          };
        }
        
        // Calculate partial cache status for albums
        // An album is partial if it has some songs cached FOR THIS ALBUM (not just globally cached)
        const partialAlbumIds = new Set<string>();
        for (const album of albums) {
          const cachedForAlbumCount = album.trackIds.filter(id => {
            const refs = songReferences[id];
            return refs && refs.albumIds.includes(album.id);
          }).length;
          if (cachedForAlbumCount > 0 && cachedForAlbumCount < album.trackIds.length) {
            partialAlbumIds.add(album.id);
          }
        }
        
        // Calculate partial cache status for playlists
        // A playlist is partial if it has some songs cached FOR THIS PLAYLIST (not just globally cached)
        const partialPlaylistIds = new Set<string>();
        for (const playlist of playlists) {
          const cachedForPlaylistCount = playlist.trackIds.filter(id => {
            const refs = songReferences[id];
            return refs && refs.playlistIds.includes(playlist.id);
          }).length;
          if (cachedForPlaylistCount > 0 && cachedForPlaylistCount < playlist.trackIds.length) {
            partialPlaylistIds.add(playlist.id);
          }
        }
        
        set({
          cachedSongIds,
          cachedAlbumIds,
          cachedPlaylistIds,
          partialAlbumIds,
          partialPlaylistIds,
          songReferences,
          cachedAlbums: albums,
          cachedPlaylists: playlists,
          storageInfo,
        });
      } catch (error) {
        console.error('Failed to refresh cache status:', error);
      }
    },

    /**
     * Start downloading an album
     */
    startAlbumDownload: async (albumId: string) => {
      if (get().isDownloading) {
        console.warn('A download is already in progress');
        return;
      }
      
      try {
        set({ isDownloading: true });
        await downloadManager.downloadAlbum(albumId);
      } catch (error) {
        console.error('Failed to download album:', error);
        set({ isDownloading: false });
        throw error;
      }
    },

    /**
     * Start downloading a playlist
     */
    startPlaylistDownload: async (playlistId: string) => {
      if (get().isDownloading) {
        console.warn('A download is already in progress');
        return;
      }
      
      try {
        set({ isDownloading: true });
        await downloadManager.downloadPlaylist(playlistId);
      } catch (error) {
        console.error('Failed to download playlist:', error);
        set({ isDownloading: false });
        throw error;
      }
    },

    /**
     * Start downloading liked songs
     */
    startLikedSongsDownload: async (songs: import('../types').Song[]) => {
      if (get().isDownloading) {
        console.warn('A download is already in progress');
        return;
      }
      
      try {
        set({ isDownloading: true });
        await downloadManager.downloadLikedSongs(songs);
      } catch (error) {
        console.error('Failed to download liked songs:', error);
        set({ isDownloading: false });
        throw error;
      }
    },

    /**
     * Cancel current download
     */
    cancelDownload: () => {
      downloadManager.cancelDownload();
      set({ isDownloading: false });
    },

    /**
     * Delete an album's cache
     */
    deleteAlbumCache: async (albumId: string) => {
      try {
        await cacheManager.deleteAlbumCache(albumId);
        await get().refreshCacheStatus();
      } catch (error) {
        console.error('Failed to delete album cache:', error);
        throw error;
      }
    },

    /**
     * Delete a playlist's cache
     */
    deletePlaylistCache: async (playlistId: string) => {
      try {
        await cacheManager.deletePlaylistCache(playlistId);
        await get().refreshCacheStatus();
      } catch (error) {
        console.error('Failed to delete playlist cache:', error);
        throw error;
      }
    },

    /**
     * Delete a single song from a collection
     */
    deleteSongCache: async (songId: string, collectionType: 'album' | 'playlist', collectionId: string) => {
      try {
        await cacheManager.deleteSongFromCollection(songId, collectionType, collectionId);
        await get().refreshCacheStatus();
      } catch (error) {
        console.error('Failed to delete song cache:', error);
        throw error;
      }
    },

    /**
     * Clear all cached data
     */
    clearAllCache: async () => {
      try {
        await cacheManager.clearAllCache();
        set({
          cachedSongIds: new Set<string>(),
          cachedAlbumIds: new Set<string>(),
          cachedPlaylistIds: new Set<string>(),
          partialAlbumIds: new Set<string>(),
          partialPlaylistIds: new Set<string>(),
          songReferences: {},
          cachedAlbums: [],
          cachedPlaylists: [],
          storageInfo: null,
        });
        // Refresh storage info
        const storageInfo = await cacheManager.getStorageInfo();
        set({ storageInfo });
      } catch (error) {
        console.error('Failed to clear all cache:', error);
        throw error;
      }
    },

    /**
     * Update online status
     */
    setOnlineStatus: (isOnline: boolean) => {
      set({ isOnline });
    },

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Check if a song is cached
     */
    isSongCached: (songId: string) => {
      return get().cachedSongIds.has(songId);
    },

    /**
     * Check if an album is fully cached
     */
    isAlbumCached: (albumId: string) => {
      return get().cachedAlbumIds.has(albumId) && !get().partialAlbumIds.has(albumId);
    },

    /**
     * Check if a playlist is fully cached
     */
    isPlaylistCached: (playlistId: string) => {
      return get().cachedPlaylistIds.has(playlistId) && !get().partialPlaylistIds.has(playlistId);
    },

    /**
     * Get cache status for an album
     * Only counts songs that are cached FOR THIS ALBUM (via songReferences)
     */
    getAlbumCacheStatus: (albumId: string, trackIds: string[]): CacheStatus => {
      const { cachedSongIds, songReferences } = get();
      
      if (trackIds.length === 0) return 'none';
      
      // Count songs that are both cached AND referenced by this album
      const cachedForAlbumCount = trackIds.filter(id => {
        if (!cachedSongIds.has(id)) return false;
        const refs = songReferences[id];
        return refs && refs.albumIds.includes(albumId);
      }).length;
      
      if (cachedForAlbumCount === 0) return 'none';
      if (cachedForAlbumCount === trackIds.length) return 'full';
      return 'partial';
    },

    /**
     * Get cache status for a playlist
     * Only counts songs that are cached FOR THIS PLAYLIST (via songReferences)
     */
    getPlaylistCacheStatus: (playlistId: string, trackIds: string[]): CacheStatus => {
      const { cachedSongIds, songReferences } = get();
      
      if (trackIds.length === 0) return 'none';
      
      // Count songs that are both cached AND referenced by this playlist
      const cachedForPlaylistCount = trackIds.filter(id => {
        if (!cachedSongIds.has(id)) return false;
        const refs = songReferences[id];
        return refs && refs.playlistIds.includes(playlistId);
      }).length;
      
      if (cachedForPlaylistCount === 0) return 'none';
      if (cachedForPlaylistCount === trackIds.length) return 'full';
      return 'partial';
    },

    /**
     * Get cache status for an album by comparing cached track count with current track count
     * Used when we don't have the full trackIds list (e.g., in library sidebar)
     */
    getAlbumCacheStatusByCount: (albumId: string, currentTrackCount: number): CacheStatus => {
      const { cachedAlbumIds, cachedAlbums, cachedSongIds, songReferences } = get();
      
      // If not in cached albums, return 'none'
      if (!cachedAlbumIds.has(albumId)) return 'none';
      
      // Find the cached album
      const cachedAlbum = cachedAlbums.find(a => a.id === albumId);
      if (!cachedAlbum) return 'none';
      
      // Count songs that are actually cached for this album
      const cachedForAlbumCount = cachedAlbum.trackIds.filter(id => {
        if (!cachedSongIds.has(id)) return false;
        const refs = songReferences[id];
        return refs && refs.albumIds.includes(albumId);
      }).length;
      
      if (cachedForAlbumCount === 0) return 'none';
      // Compare with current track count - if different, it's partial
      if (cachedForAlbumCount < currentTrackCount) return 'partial';
      if (cachedForAlbumCount === currentTrackCount) return 'full';
      // If cached count > current count (songs removed), still show as full
      return 'full';
    },

    /**
     * Get cache status for a playlist by comparing cached track count with current track count
     * Used when we don't have the full trackIds list (e.g., in library sidebar)
     */
    getPlaylistCacheStatusByCount: (playlistId: string, currentTrackCount: number): CacheStatus => {
      const { cachedPlaylistIds, cachedPlaylists, cachedSongIds, songReferences } = get();
      
      // If not in cached playlists, return 'none'
      if (!cachedPlaylistIds.has(playlistId)) return 'none';
      
      // Find the cached playlist
      const cachedPlaylist = cachedPlaylists.find(p => p.id === playlistId);
      if (!cachedPlaylist) return 'none';
      
      // Count songs that are actually cached for this playlist
      const cachedForPlaylistCount = cachedPlaylist.trackIds.filter(id => {
        if (!cachedSongIds.has(id)) return false;
        const refs = songReferences[id];
        return refs && refs.playlistIds.includes(playlistId);
      }).length;
      
      if (cachedForPlaylistCount === 0) return 'none';
      // Compare with current track count - if different, it's partial
      if (cachedForPlaylistCount < currentTrackCount) return 'partial';
      if (cachedForPlaylistCount === currentTrackCount) return 'full';
      // If cached count > current count (songs removed), still show as full
      return 'full';
    },

    /**
     * Check if a song is cached for a specific album
     */
    isSongCachedForAlbum: (songId: string, albumId: string): boolean => {
      const { cachedSongIds, songReferences } = get();
      if (!cachedSongIds.has(songId)) return false;
      const refs = songReferences[songId];
      return refs ? refs.albumIds.includes(albumId) : false;
    },

    /**
     * Check if a song is cached for a specific playlist
     */
    isSongCachedForPlaylist: (songId: string, playlistId: string): boolean => {
      const { cachedSongIds, songReferences } = get();
      if (!cachedSongIds.has(songId)) return false;
      const refs = songReferences[songId];
      return refs ? refs.playlistIds.includes(playlistId) : false;
    },
  };
});

// ============================================================================
// Helper Functions for Cache Status Calculation
// ============================================================================

/**
 * Calculate cache status given cached song IDs, track IDs, and song references
 * This is a pure function for testing
 * @param cachedSongIds - Set of all cached song IDs
 * @param trackIds - Array of track IDs in the collection
 * @param collectionType - Type of collection ('album' or 'playlist')
 * @param collectionId - ID of the collection
 * @param songReferences - Map of song references
 */
export function calculateCacheStatus(
  cachedSongIds: Set<string>,
  trackIds: string[],
  collectionType?: 'album' | 'playlist',
  collectionId?: string,
  songReferences?: SongReferenceMap
): CacheStatus {
  if (trackIds.length === 0) return 'none';
  
  // If no collection info provided, fall back to simple check (for backward compatibility)
  if (!collectionType || !collectionId || !songReferences) {
    const cachedCount = trackIds.filter(id => cachedSongIds.has(id)).length;
    if (cachedCount === 0) return 'none';
    if (cachedCount === trackIds.length) return 'full';
    return 'partial';
  }
  
  // Count songs that are both cached AND referenced by this collection
  const cachedForCollectionCount = trackIds.filter(id => {
    if (!cachedSongIds.has(id)) return false;
    const refs = songReferences[id];
    if (!refs) return false;
    return collectionType === 'album' 
      ? refs.albumIds.includes(collectionId)
      : refs.playlistIds.includes(collectionId);
  }).length;
  
  if (cachedForCollectionCount === 0) return 'none';
  if (cachedForCollectionCount === trackIds.length) return 'full';
  return 'partial';
}

/**
 * Check if sidebar cache section should be visible
 * Only show when there are cached albums or playlists (not individual songs)
 * This is a pure function for testing
 */
export function shouldShowCacheSection(
  cachedSongIds: Set<string>,
  cachedAlbumIds: Set<string>,
  cachedPlaylistIds: Set<string>
): boolean {
  // Only show cache tab when there are cached albums or playlists
  // Individual songs are accessed through their parent album/playlist
  return cachedAlbumIds.size > 0 || cachedPlaylistIds.size > 0;
}
