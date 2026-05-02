/**
 * Cache-first image URL utility
 * 
 * Provides functions to get image URLs with cache priority.
 * When a song's artwork is cached, returns a blob URL from IndexedDB.
 * Otherwise, returns the original URL for network fetching.
 */

import { offlineCacheService } from '../services/offlineCacheService';

// Cache for blob URLs to avoid creating duplicates
const blobUrlCache = new Map<string, string>();

/**
 * Get a cache-first image URL for a song's artwork
 * 
 * @param songId - The song ID to get artwork for
 * @param fallbackUrl - The URL to use if not cached
 * @returns Promise resolving to the image URL (blob URL if cached, fallback otherwise)
 */
export async function getCacheFirstArtworkUrl(
  songId: string,
  fallbackUrl: string
): Promise<string> {
  // Check if we already have a blob URL for this song
  const cachedBlobUrl = blobUrlCache.get(`song:${songId}`);
  if (cachedBlobUrl) {
    return cachedBlobUrl;
  }
  
  try {
    const cachedSong = await offlineCacheService.getCachedSong(songId);
    if (cachedSong?.artwork) {
      const blobUrl = URL.createObjectURL(cachedSong.artwork);
      blobUrlCache.set(`song:${songId}`, blobUrl);
      return blobUrl;
    }
  } catch (error) {
    console.warn('[CacheFirstImage] Failed to get cached artwork:', error);
  }
  
  return fallbackUrl;
}

/**
 * Get a cache-first image URL for an album's artwork
 * 
 * @param albumId - The album ID to get artwork for
 * @param fallbackUrl - The URL to use if not cached
 * @returns Promise resolving to the image URL (blob URL if cached, fallback otherwise)
 */
export async function getCacheFirstAlbumArtworkUrl(
  albumId: string,
  fallbackUrl: string
): Promise<string> {
  // Check if we already have a blob URL for this album
  const cachedBlobUrl = blobUrlCache.get(`album:${albumId}`);
  if (cachedBlobUrl) {
    return cachedBlobUrl;
  }
  
  try {
    const cachedAlbum = await offlineCacheService.getCachedAlbum(albumId);
    if (cachedAlbum?.artwork) {
      const blobUrl = URL.createObjectURL(cachedAlbum.artwork);
      blobUrlCache.set(`album:${albumId}`, blobUrl);
      return blobUrl;
    }
  } catch (error) {
    console.warn('[CacheFirstImage] Failed to get cached album artwork:', error);
  }
  
  return fallbackUrl;
}

/**
 * Get a cache-first image URL for a playlist's artwork
 * 
 * @param playlistId - The playlist ID to get artwork for
 * @param fallbackUrl - The URL to use if not cached
 * @returns Promise resolving to the image URL (blob URL if cached, fallback otherwise)
 */
export async function getCacheFirstPlaylistArtworkUrl(
  playlistId: string,
  fallbackUrl: string
): Promise<string> {
  // Check if we already have a blob URL for this playlist
  const cachedBlobUrl = blobUrlCache.get(`playlist:${playlistId}`);
  if (cachedBlobUrl) {
    return cachedBlobUrl;
  }
  
  try {
    const cachedPlaylist = await offlineCacheService.getCachedPlaylist(playlistId);
    if (cachedPlaylist?.artwork) {
      const blobUrl = URL.createObjectURL(cachedPlaylist.artwork);
      blobUrlCache.set(`playlist:${playlistId}`, blobUrl);
      return blobUrl;
    }
  } catch (error) {
    console.warn('[CacheFirstImage] Failed to get cached playlist artwork:', error);
  }
  
  return fallbackUrl;
}

/**
 * Clear a specific blob URL from the cache
 * Should be called when the cached content is deleted
 */
export function clearCachedBlobUrl(type: 'song' | 'album' | 'playlist', id: string): void {
  const key = `${type}:${id}`;
  const blobUrl = blobUrlCache.get(key);
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrlCache.delete(key);
  }
}

/**
 * Clear all cached blob URLs
 * Should be called when all cache is cleared
 */
export function clearAllCachedBlobUrls(): void {
  for (const blobUrl of blobUrlCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  blobUrlCache.clear();
}

/**
 * React hook for cache-first artwork URL
 * Returns the URL and a loading state
 */
import { useState, useEffect } from 'react';

export function useCacheFirstArtwork(
  songId: string | undefined,
  fallbackUrl: string
): { url: string; isLoading: boolean } {
  const [url, setUrl] = useState(fallbackUrl);
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    if (!songId) {
      setUrl(fallbackUrl);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    getCacheFirstArtworkUrl(songId, fallbackUrl)
      .then(resolvedUrl => {
        setUrl(resolvedUrl);
        setIsLoading(false);
      })
      .catch(() => {
        setUrl(fallbackUrl);
        setIsLoading(false);
      });
  }, [songId, fallbackUrl]);
  
  return { url, isLoading };
}
