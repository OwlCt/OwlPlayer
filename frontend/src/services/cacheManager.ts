/**
 * CacheManager - Service for managing cache storage and reference counting
 * 
 * This service handles:
 * - Song reference tracking (which albums/playlists reference each song)
 * - Collection deletion with proper reference counting
 * - Storage quota management
 * - Cache cleanup operations
 */

import { clearTransientAudioCaches } from '../utils/transientAudioCache';
import { offlineCacheService, SongReference, CachedAlbum, CachedPlaylist } from './offlineCacheService';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Storage information from the Storage API
 */
export interface StorageInfo {
  used: number;      // bytes used by app
  quota: number;     // total quota available
  available: number; // remaining space
  persistent: boolean;
}

/**
 * Result of a collection deletion operation
 */
export interface DeletionResult {
  success: boolean;
  deletedSongIds: string[];
  preservedSongIds: string[];
  error?: string;
}

// ============================================================================
// CacheManager Class
// ============================================================================

class CacheManager {
  /**
   * Clear transient client-side audio caches so deleted offline content
   * cannot continue playing from preloaded blob URLs or Service Worker caches.
   */
  private async clearTransientAudioCaches(songIds?: string[]): Promise<void> {
    await clearTransientAudioCaches(songIds);
  }

  // ==========================================================================
  // Song Reference Operations
  // ==========================================================================

  /**
   * Get references for a song (which albums/playlists reference it)
   */
  async getSongReferences(songId: string): Promise<{ albums: string[]; playlists: string[] }> {
    const ref = await offlineCacheService.getSongReferences(songId);
    if (!ref) {
      return { albums: [], playlists: [] };
    }
    return {
      albums: ref.albumIds || [],
      playlists: ref.playlistIds || [],
    };
  }

  /**
   * Update song references - add a reference from a collection to a song
   */
  async addSongReference(
    songId: string,
    collectionType: 'album' | 'playlist',
    collectionId: string
  ): Promise<void> {
    let ref = await offlineCacheService.getSongReferences(songId);
    
    if (!ref) {
      ref = {
        songId,
        albumIds: [],
        playlistIds: [],
      };
    }

    if (collectionType === 'album') {
      if (!ref.albumIds.includes(collectionId)) {
        ref.albumIds.push(collectionId);
      }
    } else {
      if (!ref.playlistIds.includes(collectionId)) {
        ref.playlistIds.push(collectionId);
      }
    }

    await offlineCacheService.updateSongReferences(ref);
  }

  /**
   * Remove a reference from a collection to a song
   */
  async removeSongReference(
    songId: string,
    collectionType: 'album' | 'playlist',
    collectionId: string
  ): Promise<void> {
    const ref = await offlineCacheService.getSongReferences(songId);
    if (!ref) return;

    if (collectionType === 'album') {
      ref.albumIds = ref.albumIds.filter(id => id !== collectionId);
    } else {
      ref.playlistIds = ref.playlistIds.filter(id => id !== collectionId);
    }

    await offlineCacheService.updateSongReferences(ref);
  }

  /**
   * Check if a song has any remaining references
   */
  async hasSongReferences(songId: string): Promise<boolean> {
    const ref = await offlineCacheService.getSongReferences(songId);
    if (!ref) return false;
    return ref.albumIds.length > 0 || ref.playlistIds.length > 0;
  }

  // ==========================================================================
  // Collection Deletion Operations
  // ==========================================================================

  /**
   * Delete an album cache with proper reference counting
   * Songs that are only referenced by this album will be deleted
   * Songs shared with other collections will be preserved
   */
  async deleteAlbumCache(albumId: string): Promise<DeletionResult> {
    const deletedSongIds: string[] = [];
    const preservedSongIds: string[] = [];
    const errors: string[] = [];
    
    try {
      const album = await offlineCacheService.getCachedAlbum(albumId);
      if (!album) {
        return {
          success: true,
          deletedSongIds: [],
          preservedSongIds: [],
        };
      }

      // Process each song in the album
      for (const songId of album.trackIds) {
        try {
          // Remove this album's reference to the song
          await this.removeSongReference(songId, 'album', albumId);

          // Check if song has any remaining references
          const hasRefs = await this.hasSongReferences(songId);

          if (!hasRefs) {
            // Get the song to check for artist artwork reference before deleting
            const song = await offlineCacheService.getCachedSong(songId);
            
            // Decrement artist artwork reference count if song has primaryArtistId
            if (song?.songDetail?.primaryArtistId) {
              await offlineCacheService.decrementArtistArtworkRef(song.songDetail.primaryArtistId);
            }
            
            // No other collections reference this song, delete it
            await offlineCacheService.deleteCachedSong(songId);
            deletedSongIds.push(songId);
          } else {
            preservedSongIds.push(songId);
          }
        } catch (songError) {
          console.error(`Failed to delete song ${songId}:`, songError);
          errors.push(`Song ${songId}: ${songError instanceof Error ? songError.message : 'Unknown error'}`);
          // Continue with other songs even if one fails
        }
      }

      // Handle motion video reference - decrement reference count
      if (album.motionVideoAlbumId) {
        try {
          await offlineCacheService.decrementMotionVideoRef(album.motionVideoAlbumId);
        } catch (mvError) {
          console.error(`Failed to decrement motion video ref for album ${album.motionVideoAlbumId}:`, mvError);
          // Continue even if motion video cleanup fails
        }
      }

      // Always delete the album metadata, even if some songs failed to delete
      await offlineCacheService.deleteCachedAlbum(albumId);
      await this.clearTransientAudioCaches(deletedSongIds);

      return {
        success: errors.length === 0,
        deletedSongIds,
        preservedSongIds,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (error) {
      console.error('Failed to delete album cache:', error);
      
      // Try to delete album metadata anyway to prevent stuck state
      try {
        await offlineCacheService.deleteCachedAlbum(albumId);
      } catch (deleteError) {
        console.error('Failed to delete album metadata:', deleteError);
      }
      
      return {
        success: false,
        deletedSongIds,
        preservedSongIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Delete a playlist cache with proper reference counting
   * Songs that are only referenced by this playlist will be deleted
   * Songs shared with other collections will be preserved
   */
  async deletePlaylistCache(playlistId: string): Promise<DeletionResult> {
    const deletedSongIds: string[] = [];
    const preservedSongIds: string[] = [];
    const errors: string[] = [];
    
    try {
      const playlist = await offlineCacheService.getCachedPlaylist(playlistId);
      if (!playlist) {
        return {
          success: true,
          deletedSongIds: [],
          preservedSongIds: [],
        };
      }

      // Process each song in the playlist
      for (const songId of playlist.trackIds) {
        try {
          // Remove this playlist's reference to the song
          await this.removeSongReference(songId, 'playlist', playlistId);

          // Check if song has any remaining references
          const hasRefs = await this.hasSongReferences(songId);

          if (!hasRefs) {
            // Get the song to check for artist artwork reference before deleting
            const song = await offlineCacheService.getCachedSong(songId);
            
            // Decrement artist artwork reference count if song has primaryArtistId
            if (song?.songDetail?.primaryArtistId) {
              await offlineCacheService.decrementArtistArtworkRef(song.songDetail.primaryArtistId);
            }
            
            // No other collections reference this song, delete it
            await offlineCacheService.deleteCachedSong(songId);
            deletedSongIds.push(songId);
          } else {
            preservedSongIds.push(songId);
          }
        } catch (songError) {
          console.error(`Failed to delete song ${songId}:`, songError);
          errors.push(`Song ${songId}: ${songError instanceof Error ? songError.message : 'Unknown error'}`);
          // Continue with other songs even if one fails
        }
      }

      // Handle motion video references - decrement reference count for each
      if (playlist.motionVideoAlbumIds && playlist.motionVideoAlbumIds.length > 0) {
        for (const albumId of playlist.motionVideoAlbumIds) {
          try {
            await offlineCacheService.decrementMotionVideoRef(albumId);
          } catch (mvError) {
            console.error(`Failed to decrement motion video ref for album ${albumId}:`, mvError);
            // Continue even if motion video cleanup fails
          }
        }
      }

      // Always delete the playlist metadata, even if some songs failed to delete
      await offlineCacheService.deleteCachedPlaylist(playlistId);
      await this.clearTransientAudioCaches(deletedSongIds);

      return {
        success: errors.length === 0,
        deletedSongIds,
        preservedSongIds,
        error: errors.length > 0 ? errors.join('; ') : undefined,
      };
    } catch (error) {
      console.error('Failed to delete playlist cache:', error);
      
      // Try to delete playlist metadata anyway to prevent stuck state
      try {
        await offlineCacheService.deleteCachedPlaylist(playlistId);
      } catch (deleteError) {
        console.error('Failed to delete playlist metadata:', deleteError);
      }
      
      return {
        success: false,
        deletedSongIds,
        preservedSongIds,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }


  /**
   * Delete a single song from a collection
   * This preserves the collection structure - the song remains in trackIds but is marked as uncached
   * The actual song data is only deleted if no other collections reference it
   */
  async deleteSongFromCollection(
    songId: string,
    collectionType: 'album' | 'playlist',
    collectionId: string
  ): Promise<{ deleted: boolean; preserved: boolean }> {
    try {
      // Remove this collection's reference to the song
      await this.removeSongReference(songId, collectionType, collectionId);

      // Check if song has any remaining references
      const hasRefs = await this.hasSongReferences(songId);

      if (!hasRefs) {
        // Get the song to check for artist artwork reference before deleting
        const song = await offlineCacheService.getCachedSong(songId);
        
        // Decrement artist artwork reference count if song has primaryArtistId
        if (song?.songDetail?.primaryArtistId) {
          await offlineCacheService.decrementArtistArtworkRef(song.songDetail.primaryArtistId);
        }
        
        // No other collections reference this song, delete it
        await offlineCacheService.deleteCachedSong(songId);
        await this.clearTransientAudioCaches([songId]);
        return { deleted: true, preserved: false };
      }

      // Song is still referenced by other collections, preserve it
      return { deleted: false, preserved: true };
    } catch (error) {
      console.error('Failed to delete song from collection:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Storage Quota Management
  // ==========================================================================

  /**
   * Get storage information using the Storage API
   */
  async getStorageInfo(): Promise<StorageInfo> {
    try {
      // Check if Storage API is available
      if (!navigator.storage || !navigator.storage.estimate) {
        return {
          used: await offlineCacheService.getCacheSize(),
          quota: 0,
          available: 0,
          persistent: false,
        };
      }

      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const available = quota - used;

      // Check if storage is persistent
      let persistent = false;
      if (navigator.storage.persisted) {
        persistent = await navigator.storage.persisted();
      }

      return {
        used,
        quota,
        available,
        persistent,
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      // Return fallback values
      return {
        used: await offlineCacheService.getCacheSize(),
        quota: 0,
        available: 0,
        persistent: false,
      };
    }
  }

  /**
   * Request persistent storage from the browser
   * This prevents the browser from automatically clearing the cache
   */
  async requestPersistentStorage(): Promise<boolean> {
    try {
      if (!navigator.storage || !navigator.storage.persist) {
        console.warn('Persistent storage API not available');
        return false;
      }

      const granted = await navigator.storage.persist();
      if (granted) {
        console.log('Persistent storage granted');
      } else {
        console.warn('Persistent storage denied - cache may be cleared by browser');
      }
      return granted;
    } catch (error) {
      console.error('Failed to request persistent storage:', error);
      return false;
    }
  }

  /**
   * Clear all cached data
   */
  async clearAllCache(): Promise<void> {
    await offlineCacheService.clearAllCache();
    await this.clearTransientAudioCaches();
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get detailed cache statistics
   */
  async getCacheStats(): Promise<{
    songCount: number;
    albumCount: number;
    playlistCount: number;
    totalSize: number;
  }> {
    const [songs, albums, playlists, totalSize] = await Promise.all([
      offlineCacheService.getAllCachedSongIds(),
      offlineCacheService.getAllCachedAlbumIds(),
      offlineCacheService.getAllCachedPlaylistIds(),
      offlineCacheService.getCacheSize(),
    ]);

    return {
      songCount: songs.length,
      albumCount: albums.length,
      playlistCount: playlists.length,
      totalSize,
    };
  }

  /**
   * Get motion video storage statistics
   * Calculates unique count, total references, total size, and deduplication savings
   */
  async getMotionVideoStats(): Promise<{
    uniqueCount: number;
    totalReferences: number;
    totalSize: number;
    deduplicationSavings: number;
  }> {
    const motionVideos = await offlineCacheService.getAllCachedMotionVideos();

    const uniqueCount = motionVideos.length;
    let totalReferences = 0;
    let totalSize = 0;

    for (const mv of motionVideos) {
      totalReferences += mv.referenceCount;
      totalSize += mv.video.size;
    }

    // Calculate savings: (totalReferences - uniqueCount) * averageSize
    // This represents the space saved by not storing duplicate copies
    const averageSize = uniqueCount > 0 ? totalSize / uniqueCount : 0;
    const deduplicationSavings = (totalReferences - uniqueCount) * averageSize;

    return {
      uniqueCount,
      totalReferences,
      totalSize,
      deduplicationSavings,
    };
  }

  /**
   * Get artist artwork storage statistics
   * Calculates unique count, total references, total size, and deduplication savings
   */
  async getArtistArtworkStats(): Promise<{
    uniqueCount: number;
    totalReferences: number;
    totalSize: number;
    deduplicationSavings: number;
  }> {
    const artistArtworks = await offlineCacheService.getAllCachedArtistArtworks();

    const uniqueCount = artistArtworks.length;
    let totalReferences = 0;
    let totalSize = 0;

    for (const aa of artistArtworks) {
      totalReferences += aa.referenceCount;
      totalSize += aa.artwork.size;
    }

    // Calculate savings: (totalReferences - uniqueCount) * averageSize
    // This represents the space saved by not storing duplicate copies
    const averageSize = uniqueCount > 0 ? totalSize / uniqueCount : 0;
    const deduplicationSavings = (totalReferences - uniqueCount) * averageSize;

    return {
      uniqueCount,
      totalReferences,
      totalSize,
      deduplicationSavings,
    };
  }

  /**
   * Initialize references for a newly cached album
   * Call this after caching all songs in an album
   */
  async initializeAlbumReferences(albumId: string, songIds: string[]): Promise<void> {
    for (const songId of songIds) {
      await this.addSongReference(songId, 'album', albumId);
    }
  }

  /**
   * Initialize references for a newly cached playlist
   * Call this after caching all songs in a playlist
   */
  async initializePlaylistReferences(playlistId: string, songIds: string[]): Promise<void> {
    for (const songId of songIds) {
      await this.addSongReference(songId, 'playlist', playlistId);
    }
  }

  /**
   * Update collection trackIds after a song is removed
   * Note: This does NOT remove the song from trackIds - the song remains listed but uncached
   * This preserves the collection structure per Requirements 4.3, 4.4
   */
  async getCollectionWithUpdatedCacheStatus(
    collectionType: 'album' | 'playlist',
    collectionId: string
  ): Promise<{ trackIds: string[]; cachedTrackIds: string[] }> {
    let trackIds: string[] = [];

    if (collectionType === 'album') {
      const album = await offlineCacheService.getCachedAlbum(collectionId);
      trackIds = album?.trackIds || [];
    } else {
      const playlist = await offlineCacheService.getCachedPlaylist(collectionId);
      trackIds = playlist?.trackIds || [];
    }

    // Check which tracks are actually cached
    const cachedTrackIds: string[] = [];
    for (const trackId of trackIds) {
      const isCached = await offlineCacheService.isSongCached(trackId);
      if (isCached) {
        cachedTrackIds.push(trackId);
      }
    }

    return { trackIds, cachedTrackIds };
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();

// Export class for testing
export { CacheManager };
