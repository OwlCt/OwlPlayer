/**
 * DownloadManager - Service for batch downloading albums and playlists
 * 
 * This service handles:
 * - Batch downloading of songs with progress tracking
 * - Individual song download with progress
 * - Download cancellation
 * - Failure handling and resilience
 * - Auto-adding cached albums/playlists to library
 */

import { getAlbumDetail, getPlaylist, getLyrics, getSongDetail } from '../api';
import { 
  offlineCacheService, 
  CachedSong, 
  CachedAlbum, 
  CachedPlaylist,
  SongMetadata,
  LyricsData,
  CachedSongDetail
} from './offlineCacheService';
import { cacheManager } from './cacheManager';
import { Song, Album, SongDetail } from '../types';
import { useLibraryAlbumsStore } from '../store/libraryAlbumsStore';
import { getManualOfflineMode } from '../hooks/useOnlineStatus';
import { getAuthenticatedDownloadStreamUrl } from '../utils/streamUrl';
import {
  loadDownloadAudioQuality,
  resolveDownloadAudioTranscode,
} from '../utils/playbackQuality';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Download progress state
 */
export interface DownloadProgress {
  totalSongs: number;
  completedSongs: number;
  currentSongId: string | null;
  currentSongProgress: number; // 0-100
  failedSongs: string[];
  status: 'idle' | 'downloading' | 'completed' | 'cancelled' | 'error';
  collectionType?: 'album' | 'playlist';
  collectionId?: string;
}

/**
 * Progress callback type
 */
type ProgressCallback = (progress: DownloadProgress) => void;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch image as Blob
 */
async function fetchImageAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  return response.blob();
}

/**
 * Fetch video as Blob (for motion artwork)
 */
async function fetchVideoAsBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch video: ${response.status}`);
  }
  return response.blob();
}

/**
 * Fetch audio as Blob with progress tracking
 */
async function fetchAudioAsBlob(
  streamUrl: string,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const response = await fetch(streamUrl);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }
  
  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  
  if (!response.body || total === 0) {
    // No streaming support or unknown size, just get the blob
    return response.blob();
  }
  
  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let received = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    chunks.push(value.slice());
    received += value.length;
    
    if (onProgress && total > 0) {
      onProgress(Math.round((received / total) * 100));
    }
  }
  
  const blob = new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream',
  });
  return blob;
}

/**
 * Convert SongDetail to CachedSongDetail for offline storage
 */
function convertToCachedSongDetail(songDetail: SongDetail): CachedSongDetail {
  return {
    composerName: songDetail.composerName,
    genres: songDetail.genres,
    isrc: songDetail.isrc,
    audioInfo: songDetail.audioInfo,
    credits: {
      composer: songDetail.credits?.composer,
      recordLabel: songDetail.credits?.recordLabel,
      copyright: songDetail.credits?.copyright,
    },
    album: songDetail.album ? {
      id: songDetail.album.id,
      name: songDetail.album.name,
      artworkUrl: songDetail.album.artworkUrl,
      recordLabel: songDetail.album.recordLabel,
      copyright: songDetail.album.copyright,
      releaseDate: songDetail.album.releaseDate,
      trackCount: songDetail.album.trackCount,
    } : undefined,
    artists: songDetail.artists?.map(a => ({
      id: a.id,
      name: a.name,
    })),
    primaryArtistId: songDetail.artists?.[0]?.id,
  };
}

// ============================================================================
// DownloadManager Class
// ============================================================================

class DownloadManager {
  private progress: DownloadProgress = {
    totalSongs: 0,
    completedSongs: 0,
    currentSongId: null,
    currentSongProgress: 0,
    failedSongs: [],
    status: 'idle'
  };
  
  private callbacks: Set<ProgressCallback> = new Set();
  private abortController: AbortController | null = null;
  private isCancelled = false;

  /**
   * Get current download progress
   */
  getProgress(): DownloadProgress {
    return { ...this.progress };
  }

  /**
   * Subscribe to progress changes
   * Returns unsubscribe function
   */
  onProgressChange(callback: ProgressCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Notify all subscribers of progress change
   */
  private notifyProgress(): void {
    const progress = this.getProgress();
    this.callbacks.forEach(cb => cb(progress));
  }

  /**
   * Update progress and notify
   */
  private updateProgress(updates: Partial<DownloadProgress>): void {
    this.progress = { ...this.progress, ...updates };
    this.notifyProgress();
  }

  /**
   * Reset progress to idle state
   */
  private resetProgress(): void {
    this.progress = {
      totalSongs: 0,
      completedSongs: 0,
      currentSongId: null,
      currentSongProgress: 0,
      failedSongs: [],
      status: 'idle'
    };
    this.isCancelled = false;
    this.abortController = null;
  }

  /**
   * Cancel current download
   */
  cancelDownload(): void {
    this.isCancelled = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    this.updateProgress({ status: 'cancelled' });
  }

  /**
   * Download a single song with all its data
   */
  private async downloadSong(
    song: Song,
    onProgress?: (progress: number) => void
  ): Promise<CachedSong> {
    // Fetch song detail first so download quality can safely fall back from
    // lossless requests when the source itself is lossy or unknown.
    let songDetailResponse: SongDetail | null = null;
    let songDetail: CachedSongDetail | undefined;
    try {
      songDetailResponse = await getSongDetail(song.id);
      songDetail = convertToCachedSongDetail(songDetailResponse);
      
      // Cache artist artwork if available
      if (songDetailResponse.artists && songDetailResponse.artists.length > 0) {
        const primaryArtist = songDetailResponse.artists[0];
        if (primaryArtist.artworkUrl) {
          try {
            const artistArtworkUrl = primaryArtist.artworkUrl.replace('{w}', '300').replace('{h}', '300');
            const artistArtwork = await fetchImageAsBlob(artistArtworkUrl);
            await offlineCacheService.cacheArtistArtwork(primaryArtist.id, artistArtwork);
          } catch (error) {
            console.warn(`Failed to cache artist artwork for ${primaryArtist.id}`);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to fetch song detail for ${song.id}`);
    }

    const downloadAudioQuality = loadDownloadAudioQuality();
    const directTranscode = resolveDownloadAudioTranscode(
      downloadAudioQuality,
      songDetailResponse?.audioInfo,
    );

    // Fetch audio with progress
    const audio = await fetchAudioAsBlob(
      getAuthenticatedDownloadStreamUrl(song.id, directTranscode),
      onProgress,
    );
    
    // Fetch artwork
    let artwork: Blob;
    try {
      // Use higher resolution artwork for caching
      const artworkUrl = song.artworkUrl.replace('{w}', '600').replace('{h}', '600');
      artwork = await fetchImageAsBlob(artworkUrl);
    } catch (error) {
      console.warn(`Failed to fetch artwork for ${song.id}, using placeholder`);
      // Create a small placeholder blob
      artwork = new Blob([''], { type: 'image/png' });
    }
    
    // Fetch lyrics - store raw TTML to reuse the same parser as online mode
    let lyrics: LyricsData = { ttml: '', type: '' };
    if (song.hasLyrics) {
      try {
        const lyricsResponse = await getLyrics(song.id);
        if (lyricsResponse.available && lyricsResponse.ttml) {
          lyrics = { ttml: lyricsResponse.ttml, type: lyricsResponse.type };
        }
      } catch (error) {
        console.warn(`Failed to fetch lyrics for ${song.id}`);
      }
    }
    
    // Build metadata
    const metadata: SongMetadata = {
      id: song.id,
      name: song.name,
      artistName: song.artistName,
      artistId: song.artistId || '',
      albumName: song.albumName,
      albumId: song.albumId || '',
      duration: song.duration,
      hasLyrics: song.hasLyrics
    };
    
    const cachedSong: CachedSong = {
      id: song.id,
      audio,
      artwork,
      lyrics,
      metadata,
      songDetail,
      cachedAt: Date.now()
    };
    
    return cachedSong;
  }

  /**
   * Download an album with all its songs
   */
  async downloadAlbum(albumId: string): Promise<void> {
    // Block downloads in offline mode to save bandwidth
    if (getManualOfflineMode()) {
      throw new Error('离线模式已启用，无法下载新内容。请先关闭离线模式。');
    }
    
    if (this.progress.status === 'downloading') {
      throw new Error('A download is already in progress');
    }
    
    this.resetProgress();
    this.abortController = new AbortController();
    
    try {
      // Fetch album details
      const album = await getAlbumDetail(albumId);
      const allTracks = album.tracks || [];
      
      // Filter out music videos - they cannot be cached
      const tracks = allTracks.filter(track => !track.isMusicVideo);
      
      if (tracks.length === 0) {
        throw new Error('Album has no downloadable tracks (all tracks are music videos)');
      }
      
      this.updateProgress({
        totalSongs: tracks.length,
        completedSongs: 0,
        failedSongs: [],
        status: 'downloading',
        collectionType: 'album',
        collectionId: albumId
      });
      
      const successfulSongIds: string[] = [];
      
      // Download each song
      for (let i = 0; i < tracks.length; i++) {
        if (this.isCancelled) {
          break;
        }
        
        const track = tracks[i];
        
        // Check if already cached
        const isCached = await offlineCacheService.isSongCached(track.id);
        if (isCached) {
          successfulSongIds.push(track.id);
          this.updateProgress({
            completedSongs: this.progress.completedSongs + 1,
            currentSongId: track.id,
            currentSongProgress: 100
          });
          continue;
        }
        
        this.updateProgress({
          currentSongId: track.id,
          currentSongProgress: 0
        });
        
        try {
          const cachedSong = await this.downloadSong(track, (progress) => {
            this.updateProgress({ currentSongProgress: progress });
          });
          
          // Save to IndexedDB
          await offlineCacheService.cacheSong(cachedSong);
          successfulSongIds.push(track.id);
          
          this.updateProgress({
            completedSongs: this.progress.completedSongs + 1,
            currentSongProgress: 100
          });
        } catch (error) {
          console.error(`Failed to download song ${track.id}:`, error);
          this.updateProgress({
            failedSongs: [...this.progress.failedSongs, track.id],
            completedSongs: this.progress.completedSongs + 1
          });
        }
      }
      
      if (this.isCancelled) {
        this.updateProgress({ status: 'cancelled' });
        return;
      }
      
      // Cache album metadata
      let albumArtwork: Blob;
      try {
        const artworkUrl = album.artworkUrl.replace('{w}', '600').replace('{h}', '600');
        albumArtwork = await fetchImageAsBlob(artworkUrl);
      } catch {
        albumArtwork = new Blob([''], { type: 'image/png' });
      }
      
      // Cache motion video if available (with deduplication)
      let motionVideoAlbumId: string | undefined;
      if (album.motionVideoUrl) {
        try {
          const isMotionCached = await offlineCacheService.isMotionVideoCached(album.id);
          
          if (isMotionCached) {
            // Already cached, just increment reference count
            await offlineCacheService.incrementMotionVideoRef(album.id);
            motionVideoAlbumId = album.id;
          } else {
            // Download and cache with reference count = 1
            const motionVideoBlob = await fetchVideoAsBlob(album.motionVideoUrl);
            await offlineCacheService.cacheMotionVideo(album.id, motionVideoBlob);
            motionVideoAlbumId = album.id;
          }
        } catch (error) {
          console.warn('Failed to cache motion video:', error);
          // Continue without motion video - not critical
        }
      }
      
      const cachedAlbum: CachedAlbum = {
        id: album.id,
        artwork: albumArtwork,
        motionVideoAlbumId,  // Reference to motionVideos store instead of Blob
        metadata: {
          id: album.id,
          name: album.name,
          artistName: album.artistName,
          artistId: album.artistId || '',
          releaseDate: album.releaseDate || '',
          trackCount: album.trackCount,
          genre: album.genres?.[0]
        },
        trackIds: tracks.map(t => t.id),
        cachedAt: Date.now()
      };
      
      await offlineCacheService.cacheAlbum(cachedAlbum);
      
      // Initialize song references
      await cacheManager.initializeAlbumReferences(albumId, successfulSongIds);
      
      // Auto-add album to library if not already saved
      const libraryAlbumsStore = useLibraryAlbumsStore.getState();
      if (!libraryAlbumsStore.isSaved(albumId)) {
        const albumForLibrary: Album = {
          id: album.id,
          name: album.name,
          artistId: album.artistId,
          artistName: album.artistName,
          artworkUrl: album.artworkUrl,
          releaseDate: album.releaseDate,
          trackCount: album.trackCount,
          genres: album.genres,
        };
        await libraryAlbumsStore.saveAlbum(albumForLibrary);
      }
      
      this.updateProgress({
        status: this.progress.failedSongs.length > 0 ? 'completed' : 'completed',
        currentSongId: null
      });
      
    } catch (error) {
      console.error('Failed to download album:', error);
      this.updateProgress({ status: 'error' });
      throw error;
    }
  }

  /**
   * Download a playlist with all its songs
   */
  async downloadPlaylist(playlistId: string): Promise<void> {
    // Block downloads in offline mode to save bandwidth
    if (getManualOfflineMode()) {
      throw new Error('离线模式已启用，无法下载新内容。请先关闭离线模式。');
    }
    
    if (this.progress.status === 'downloading') {
      throw new Error('A download is already in progress');
    }
    
    this.resetProgress();
    this.abortController = new AbortController();
    
    try {
      // Fetch playlist details
      const playlist = await getPlaylist(playlistId);
      const allTracks = playlist.songs || [];
      
      // Filter out music videos - they cannot be cached
      const tracks = allTracks.filter(track => !track.isMusicVideo);
      
      if (tracks.length === 0) {
        throw new Error('Playlist has no downloadable tracks (all tracks are music videos)');
      }
      
      this.updateProgress({
        totalSongs: tracks.length,
        completedSongs: 0,
        failedSongs: [],
        status: 'downloading',
        collectionType: 'playlist',
        collectionId: playlistId
      });
      
      const successfulSongIds: string[] = [];
      
      // Download each song
      for (let i = 0; i < tracks.length; i++) {
        if (this.isCancelled) {
          break;
        }
        
        const track = tracks[i];
        
        // Check if already cached
        const isCached = await offlineCacheService.isSongCached(track.id);
        if (isCached) {
          successfulSongIds.push(track.id);
          this.updateProgress({
            completedSongs: this.progress.completedSongs + 1,
            currentSongId: track.id,
            currentSongProgress: 100
          });
          continue;
        }
        
        this.updateProgress({
          currentSongId: track.id,
          currentSongProgress: 0
        });
        
        try {
          const cachedSong = await this.downloadSong(track, (progress) => {
            this.updateProgress({ currentSongProgress: progress });
          });
          
          // Save to IndexedDB
          await offlineCacheService.cacheSong(cachedSong);
          successfulSongIds.push(track.id);
          
          this.updateProgress({
            completedSongs: this.progress.completedSongs + 1,
            currentSongProgress: 100
          });
        } catch (error) {
          console.error(`Failed to download song ${track.id}:`, error);
          this.updateProgress({
            failedSongs: [...this.progress.failedSongs, track.id],
            completedSongs: this.progress.completedSongs + 1
          });
        }
      }
      
      if (this.isCancelled) {
        this.updateProgress({ status: 'cancelled' });
        return;
      }
      
      // Cache playlist metadata
      let playlistArtwork: Blob;
      try {
        if (playlist.artwork_url) {
          const artworkUrl = playlist.artwork_url.replace('{w}', '600').replace('{h}', '600');
          playlistArtwork = await fetchImageAsBlob(artworkUrl);
        } else if (tracks.length > 0) {
          // Use first track's artwork as fallback
          const artworkUrl = tracks[0].artworkUrl.replace('{w}', '600').replace('{h}', '600');
          playlistArtwork = await fetchImageAsBlob(artworkUrl);
        } else {
          playlistArtwork = new Blob([''], { type: 'image/png' });
        }
      } catch {
        playlistArtwork = new Blob([''], { type: 'image/png' });
      }
      
      // Cache motion videos for unique albums in the playlist (with deduplication)
      const motionVideoAlbumIds: string[] = [];
      const uniqueAlbumIds = [...new Set(tracks.map(t => t.albumId).filter((id): id is string => !!id))];
      
      for (const albumId of uniqueAlbumIds) {
        if (this.isCancelled) break;
        
        try {
          // Check if motion video is already cached for this album
          const isMotionCached = await offlineCacheService.isMotionVideoCached(albumId);
          
          if (isMotionCached) {
            // Already cached, just increment reference count
            await offlineCacheService.incrementMotionVideoRef(albumId);
            motionVideoAlbumIds.push(albumId);
          } else {
            // Fetch album details to check for motion video URL
            const albumDetail = await getAlbumDetail(albumId);
            if (albumDetail.motionVideoUrl) {
              // Download and cache with reference count = 1
              const motionVideoBlob = await fetchVideoAsBlob(albumDetail.motionVideoUrl);
              await offlineCacheService.cacheMotionVideo(albumId, motionVideoBlob);
              motionVideoAlbumIds.push(albumId);
            }
          }
        } catch (error) {
          console.warn(`Failed to cache motion video for album ${albumId}:`, error);
          // Continue without motion video - not critical
        }
      }
      
      const cachedPlaylist: CachedPlaylist = {
        id: playlist.id,
        artwork: playlistArtwork,
        metadata: {
          id: playlist.id,
          name: playlist.name,
          description: playlist.description,
          songCount: tracks.length,
          createdAt: new Date().toISOString(),
        },
        trackIds: tracks.map(t => t.id),
        motionVideoAlbumIds,  // References to motion videos in motionVideos store
        cachedAt: Date.now()
      };
      
      await offlineCacheService.cachePlaylist(cachedPlaylist);
      
      // Initialize song references
      await cacheManager.initializePlaylistReferences(playlistId, successfulSongIds);
      
      this.updateProgress({
        status: 'completed',
        currentSongId: null
      });
      
    } catch (error) {
      console.error('Failed to download playlist:', error);
      this.updateProgress({ status: 'error' });
      throw error;
    }
  }

  /**
   * Download liked songs with all their data
   * Uses a virtual playlist approach - stores as a special playlist with id 'liked-songs'
   */
  async downloadLikedSongs(songs: Song[]): Promise<void> {
    // Block downloads in offline mode to save bandwidth
    if (getManualOfflineMode()) {
      throw new Error('离线模式已启用，无法下载新内容。请先关闭离线模式。');
    }
    
    if (this.progress.status === 'downloading') {
      throw new Error('A download is already in progress');
    }
    
    this.resetProgress();
    this.abortController = new AbortController();
    
    const LIKED_SONGS_ID = 'liked-songs';
    
    try {
      // Filter out music videos - they cannot be cached
      const tracks = songs.filter(track => !track.isMusicVideo);
      
      if (tracks.length === 0) {
        throw new Error('No downloadable liked songs (all songs are music videos)');
      }
      
      this.updateProgress({
        totalSongs: tracks.length,
        completedSongs: 0,
        failedSongs: [],
        status: 'downloading',
        collectionType: 'playlist',
        collectionId: LIKED_SONGS_ID
      });
      
      const successfulSongIds: string[] = [];
      
      // Download each song
      for (let i = 0; i < tracks.length; i++) {
        if (this.isCancelled) {
          break;
        }
        
        const track = tracks[i];
        
        // Check if already cached
        const isCached = await offlineCacheService.isSongCached(track.id);
        if (isCached) {
          successfulSongIds.push(track.id);
          this.updateProgress({
            completedSongs: this.progress.completedSongs + 1,
            currentSongId: track.id,
            currentSongProgress: 100
          });
          continue;
        }
        
        this.updateProgress({
          currentSongId: track.id,
          currentSongProgress: 0
        });
        
        try {
          const cachedSong = await this.downloadSong(track, (progress) => {
            this.updateProgress({ currentSongProgress: progress });
          });
          
          // Save to IndexedDB
          await offlineCacheService.cacheSong(cachedSong);
          successfulSongIds.push(track.id);
          
          this.updateProgress({
            completedSongs: this.progress.completedSongs + 1,
            currentSongProgress: 100
          });
        } catch (error) {
          console.error(`Failed to download song ${track.id}:`, error);
          this.updateProgress({
            failedSongs: [...this.progress.failedSongs, track.id],
            completedSongs: this.progress.completedSongs + 1
          });
        }
      }
      
      if (this.isCancelled) {
        this.updateProgress({ status: 'cancelled' });
        return;
      }
      
      // Cache motion videos for unique albums in liked songs (with deduplication)
      const motionVideoAlbumIds: string[] = [];
      const uniqueAlbumIds = [...new Set(tracks.map(t => t.albumId).filter((id): id is string => !!id))];
      
      for (const albumId of uniqueAlbumIds) {
        if (this.isCancelled) break;
        
        try {
          // Check if motion video is already cached for this album
          const isMotionCached = await offlineCacheService.isMotionVideoCached(albumId);
          
          if (isMotionCached) {
            // Already cached, just increment reference count
            await offlineCacheService.incrementMotionVideoRef(albumId);
            motionVideoAlbumIds.push(albumId);
          } else {
            // Fetch album details to check for motion video URL
            const albumDetail = await getAlbumDetail(albumId);
            if (albumDetail.motionVideoUrl) {
              // Download and cache with reference count = 1
              const motionVideoBlob = await fetchVideoAsBlob(albumDetail.motionVideoUrl);
              await offlineCacheService.cacheMotionVideo(albumId, motionVideoBlob);
              motionVideoAlbumIds.push(albumId);
            }
          }
        } catch (error) {
          console.warn(`Failed to cache motion video for album ${albumId}:`, error);
          // Continue without motion video - not critical
        }
      }
      
      // Create a placeholder artwork for liked songs (purple gradient heart)
      // We'll use a small transparent blob since the UI shows a gradient anyway
      const playlistArtwork = new Blob([''], { type: 'image/png' });
      
      const cachedPlaylist: CachedPlaylist = {
        id: LIKED_SONGS_ID,
        artwork: playlistArtwork,
        metadata: {
          id: LIKED_SONGS_ID,
          name: '已点赞的歌曲',
          description: '你喜欢的所有歌曲',
          songCount: tracks.length,
          createdAt: new Date().toISOString()
        },
        trackIds: tracks.map(t => t.id),
        motionVideoAlbumIds,
        cachedAt: Date.now()
      };
      
      await offlineCacheService.cachePlaylist(cachedPlaylist);
      
      // Initialize song references
      await cacheManager.initializePlaylistReferences(LIKED_SONGS_ID, successfulSongIds);
      
      this.updateProgress({
        status: 'completed',
        currentSongId: null
      });
      
    } catch (error) {
      console.error('Failed to download liked songs:', error);
      this.updateProgress({ status: 'error' });
      throw error;
    }
  }

  /**
   * Check if a download is in progress
   */
  isDownloading(): boolean {
    return this.progress.status === 'downloading';
  }
}

// Export singleton instance
export const downloadManager = new DownloadManager();

// Export class for testing
export { DownloadManager };
