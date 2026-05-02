/**
 * Offline Cache Converter - Utilities for converting cached data to API format
 * 
 * This module provides functions to convert IndexedDB cached data structures
 * to the same format as online API responses, enabling seamless offline access.
 */

import { Song, AlbumDetail, Playlist } from '../types';
import {
  CachedAlbum,
  CachedPlaylist,
  CachedSong,
  CachedSongDetail,
  offlineCacheService,
} from '../services/offlineCacheService';

// ============================================================================
// Extended Types with Object URL tracking
// ============================================================================

/**
 * AlbumDetail with Object URL tracking for cleanup
 */
export interface ConvertedAlbumDetail extends AlbumDetail {
  _objectUrls: string[];
}

/**
 * Playlist with Object URL tracking for cleanup
 */
export interface ConvertedPlaylist extends Playlist {
  _objectUrls: string[];
  artworkUrl?: string;  // Playlist artwork URL (blob URL from cache)
  curatorName?: string; // Curator name for Apple Music playlists
}

/**
 * Song conversion result with Object URL
 */
export interface ConvertedSongResult {
  song: Song;
  objectUrl: string;
}

/**
 * Song detail result from cache for NowPlaying view
 */
export interface CachedSongDetailResult {
  songDetail: CachedSongDetail | null;
  artistArtworkUrl: string | null;
  objectUrls: string[];  // For cleanup
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert CachedSong to Song format
 * Creates Object URL for artwork Blob
 * 
 * @param cachedSong - The cached song data from IndexedDB
 * @returns Object containing the converted Song and its artwork Object URL
 */
export function convertCachedSongToSong(
  cachedSong: CachedSong
): ConvertedSongResult {
  const objectUrl = URL.createObjectURL(cachedSong.artwork);
  
  const song: Song = {
    id: cachedSong.metadata.id,
    name: cachedSong.metadata.name,
    artistName: cachedSong.metadata.artistName,
    artistId: cachedSong.metadata.artistId,
    albumName: cachedSong.metadata.albumName,
    albumId: cachedSong.metadata.albumId,
    duration: cachedSong.metadata.duration,
    artworkUrl: objectUrl,
    hasLyrics: cachedSong.metadata.hasLyrics,
  };
  
  return { song, objectUrl };
}


/**
 * Convert CachedAlbum to AlbumDetail format
 * Requires cached songs to build track list
 * Loads motion video from motionVideos store if referenced
 * 
 * @param cachedAlbum - The cached album data from IndexedDB
 * @param cachedSongs - Array of cached songs belonging to this album
 * @returns Promise<ConvertedAlbumDetail> with Object URLs for cleanup
 */
export async function convertCachedAlbumToAlbumDetail(
  cachedAlbum: CachedAlbum,
  cachedSongs: CachedSong[]
): Promise<ConvertedAlbumDetail> {
  const objectUrls: string[] = [];
  
  // Create Object URL for album artwork
  const albumArtworkUrl = URL.createObjectURL(cachedAlbum.artwork);
  objectUrls.push(albumArtworkUrl);
  
  // Load motion video from motionVideos store if referenced
  let motionVideoUrl: string | undefined;
  if (cachedAlbum.motionVideoAlbumId) {
    const motionVideo = await offlineCacheService.getCachedMotionVideo(
      cachedAlbum.motionVideoAlbumId
    );
    if (motionVideo) {
      motionVideoUrl = URL.createObjectURL(motionVideo.video);
      objectUrls.push(motionVideoUrl);
    }
  }
  
  // Convert songs and collect Object URLs, maintaining track order
  const tracks: Song[] = [];
  for (const trackId of cachedAlbum.trackIds) {
    const cachedSong = cachedSongs.find(s => s.id === trackId);
    if (cachedSong) {
      const { song, objectUrl } = convertCachedSongToSong(cachedSong);
      tracks.push(song);
      objectUrls.push(objectUrl);
    }
  }
  
  return {
    id: cachedAlbum.metadata.id,
    name: cachedAlbum.metadata.name,
    artistName: cachedAlbum.metadata.artistName,
    artistId: cachedAlbum.metadata.artistId,
    artworkUrl: albumArtworkUrl,
    releaseDate: cachedAlbum.metadata.releaseDate,
    trackCount: cachedAlbum.metadata.trackCount,
    tracks,
    genres: cachedAlbum.metadata.genre ? [cachedAlbum.metadata.genre] : [],
    motionVideoUrl,
    _objectUrls: objectUrls,
  };
}

/**
 * Convert CachedPlaylist to Playlist format
 * 
 * @param cachedPlaylist - The cached playlist data from IndexedDB
 * @param cachedSongs - Array of cached songs belonging to this playlist
 * @returns ConvertedPlaylist with Object URLs for cleanup
 */
export function convertCachedPlaylistToPlaylist(
  cachedPlaylist: CachedPlaylist,
  cachedSongs: CachedSong[]
): ConvertedPlaylist {
  const objectUrls: string[] = [];
  
  // Create Object URL for playlist artwork
  const artworkUrl = URL.createObjectURL(cachedPlaylist.artwork);
  objectUrls.push(artworkUrl);
  
  // Convert songs and collect Object URLs, maintaining track order
  const songs: Song[] = [];
  for (const trackId of cachedPlaylist.trackIds) {
    const cachedSong = cachedSongs.find(s => s.id === trackId);
    if (cachedSong) {
      const { song, objectUrl } = convertCachedSongToSong(cachedSong);
      songs.push(song);
      objectUrls.push(objectUrl);
    }
  }
  
  return {
    id: cachedPlaylist.metadata.id,
    name: cachedPlaylist.metadata.name,
    songs,
    createdAt: cachedPlaylist.metadata.createdAt,
    artworkUrl,
    curatorName: cachedPlaylist.metadata.curatorName,
    _objectUrls: objectUrls,
  };
}

// ============================================================================
// Song Detail Functions for NowPlaying View
// ============================================================================

/**
 * Get song detail from cache for NowPlaying view
 * Loads songDetail from CachedSong and artist artwork from artistArtworks store
 * Creates Object URLs for artworks that need to be cleaned up
 * 
 * Fallback behavior:
 * - If artist artwork is not cached, artistArtworkUrl will be null
 * - UI layer should use album/song artwork as fallback when artistArtworkUrl is null
 * 
 * @param songId - The ID of the song to load details for
 * @returns CachedSongDetailResult with songDetail, artistArtworkUrl, and objectUrls for cleanup
 *          Returns null if song is not cached
 */
export async function getSongDetailFromCache(
  songId: string
): Promise<CachedSongDetailResult | null> {
  try {
    // Get cached song
    const cachedSong = await offlineCacheService.getCachedSong(songId);
    if (!cachedSong) {
      return null;
    }

    const objectUrls: string[] = [];
    let artistArtworkUrl: string | null = null;

    // Get song detail from cached song
    const songDetail = cachedSong.songDetail || null;

    // Load artist artwork if primaryArtistId is available
    // If artist artwork is not cached, artistArtworkUrl remains null
    // UI layer should fallback to album/song artwork in this case
    if (songDetail?.primaryArtistId) {
      const artistArtwork = await offlineCacheService.getCachedArtistArtwork(
        songDetail.primaryArtistId
      );
      if (artistArtwork) {
        artistArtworkUrl = URL.createObjectURL(artistArtwork.artwork);
        objectUrls.push(artistArtworkUrl);
      }
    }

    return {
      songDetail,
      artistArtworkUrl,
      objectUrls,
    };
  } catch (error) {
    console.error('Failed to get song detail from cache:', error);
    return null;
  }
}

/**
 * Get artist artwork URL with fallback support
 * Returns the artist artwork URL if available, otherwise returns the fallback URL
 * 
 * @param artistArtworkUrl - The artist artwork URL from cache (may be null)
 * @param fallbackUrl - The fallback URL to use (typically album/song artwork)
 * @returns The artist artwork URL or fallback URL
 */
export function getArtistArtworkWithFallback(
  artistArtworkUrl: string | null,
  fallbackUrl: string
): string {
  return artistArtworkUrl || fallbackUrl;
}

// ============================================================================
// Cleanup Functions
// ============================================================================

/**
 * Revoke all Object URLs to prevent memory leaks
 * Should be called when component unmounts or data is no longer needed
 * 
 * @param urls - Array of Object URLs to revoke
 */
export function revokeObjectUrls(urls: string[]): void {
  urls.forEach(url => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore errors from already revoked URLs
    }
  });
}
