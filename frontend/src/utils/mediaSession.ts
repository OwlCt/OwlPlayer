/**
 * Media Session API utility functions
 * Pure functions for creating Media Session objects and handling playback state
 */

import { Song } from '../types';
import { useAuthStore } from '../store/authStore';
import { getArtworkUrl, getProxiedImageUrl } from './image';
import { isIOSPWA } from './iosPwaDetection';
import { offlineCacheService } from '../services/offlineCacheService';

const ARTWORK_SIZES = [512, 256, 128] as const;
type ArtworkImage = NonNullable<MediaMetadataInit["artwork"]>[number];

const addTokenIfPresent = (url: string, token: string | null): string => {
  if (!url || !token) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}token=${encodeURIComponent(token)}`;
};

const toAbsoluteUrl = (url: string): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  // blob: URLs are already absolute
  if (url.startsWith('blob:')) return url;
  if (typeof window === 'undefined') return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
};

// Cache for blob URLs used in Media Session to avoid memory leaks
let currentMediaSessionBlobUrl: string | null = null;

// In-memory cache for fetched artwork blobs (keyed by song ID)
// This prevents repeated network requests from Media Session API
const artworkBlobCache = new Map<string, string>();

// Preloaded MediaMetadata cache to allow instant Media Session updates
const PRELOAD_CACHE_LIMIT = 5;
const preloadedMetadataCache = new Map<string, MediaMetadata>();

const touchPreloadedMetadata = (songId: string, metadata: MediaMetadata): void => {
  if (preloadedMetadataCache.has(songId)) {
    preloadedMetadataCache.delete(songId);
  }
  preloadedMetadataCache.set(songId, metadata);
};

const enforcePreloadedCacheLimit = (): void => {
  while (preloadedMetadataCache.size > PRELOAD_CACHE_LIMIT) {
    const oldestKey = preloadedMetadataCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    preloadedMetadataCache.delete(oldestKey);
  }
};

/**
 * Fetch artwork and convert to blob URL
 * This is used to prevent Firefox Android from repeatedly requesting artwork
 */
async function fetchArtworkAsBlob(song: Song): Promise<string | null> {
  // Check in-memory cache first
  const cachedBlobUrl = artworkBlobCache.get(song.id);
  if (cachedBlobUrl) {
    return cachedBlobUrl;
  }

  try {
    const token = useAuthStore.getState().token;
    // Use 512x512 for best quality in Media Session
    const imageUrl = addTokenIfPresent(getProxiedImageUrl(song.artworkUrl, 512), token);
    const absoluteUrl = toAbsoluteUrl(imageUrl);
    
    const response = await fetch(absoluteUrl, { credentials: 'include' });
    if (!response.ok) {
      console.warn('[MediaSession] Failed to fetch artwork:', response.status);
      return null;
    }
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    // Cache the blob URL
    artworkBlobCache.set(song.id, blobUrl);
    
    // Limit cache size to prevent memory issues (keep last 10 songs)
    if (artworkBlobCache.size > 10) {
      const firstKey = artworkBlobCache.keys().next().value;
      if (firstKey) {
        const oldBlobUrl = artworkBlobCache.get(firstKey);
        if (oldBlobUrl) {
          URL.revokeObjectURL(oldBlobUrl);
        }
        artworkBlobCache.delete(firstKey);
      }
    }
    
    return blobUrl;
  } catch (error) {
    console.warn('[MediaSession] Failed to fetch artwork as blob:', error);
    return null;
  }
}

function isArtworkImage(item: ArtworkImage | null): item is ArtworkImage {
  return item !== null;
}

const buildArtworkImages = (song: Song, cachedBlobUrl?: string): ArtworkImage[] => {
  const token = useAuthStore.getState().token;
  const preferDirectArtwork = isIOSPWA();

  // If we have a cached blob URL (offline mode), use it
  if (cachedBlobUrl) {
    return [{
      src: cachedBlobUrl,
      sizes: '512x512',
      type: 'image/jpeg',
    }];
  }

  const artworkCandidates: Array<ArtworkImage | null> = ARTWORK_SIZES
    .map((size) => {
      const baseUrl = preferDirectArtwork
        ? getArtworkUrl(song.artworkUrl, size)
        : addTokenIfPresent(getProxiedImageUrl(song.artworkUrl, size), token);
      const absoluteUrl = toAbsoluteUrl(baseUrl);
      if (!absoluteUrl) return null;

      return {
        src: absoluteUrl,
        sizes: `${size}x${size}`,
        type: 'image/jpeg',
      };
    });

  return artworkCandidates.filter(isArtworkImage);
};

/**
 * Create MediaMetadata object from a Song
 * @param song - The song to create metadata for
 * @param cachedBlobUrl - Optional blob URL for offline cached artwork
 * @returns MediaMetadata object with title, artist, album, and artwork
 */
export function createMediaMetadata(song: Song, cachedBlobUrl?: string): MediaMetadata {
  return new MediaMetadata({
    title: song.name,
    artist: song.artistName,
    album: song.albumName,
    artwork: buildArtworkImages(song, cachedBlobUrl),
  });
}

/**
 * Preload MediaMetadata (including blob artwork when available) into cache
 * @param song - The song to preload metadata for
 */
export async function preloadMediaMetadata(song: Song): Promise<void> {
  if (!song?.id || !isMediaSessionSupported()) {
    return;
  }

  const cached = preloadedMetadataCache.get(song.id);
  if (cached) {
    touchPreloadedMetadata(song.id, cached);
    console.log('[MediaSession] Preload cache hit for', song.id);
    return;
  }

  try {
    let cachedBlobUrl: string | null = null;

    try {
      const cachedSong = await offlineCacheService.getCachedSong(song.id);
      if (cachedSong?.artwork) {
        cachedBlobUrl = URL.createObjectURL(cachedSong.artwork);
      }
    } catch (error) {
      console.warn('[MediaSession] Failed to get cached artwork for preload:', error);
    }

    if (!cachedBlobUrl) {
      cachedBlobUrl = await fetchArtworkAsBlob(song);
    }

    const metadata = createMediaMetadata(song, cachedBlobUrl ?? undefined);
    touchPreloadedMetadata(song.id, metadata);
    enforcePreloadedCacheLimit();
    console.log('[MediaSession] Preloaded metadata for', song.id);
  } catch (error) {
    console.warn('[MediaSession] Failed to preload metadata:', error);
  }
}

/**
 * Get preloaded MediaMetadata from cache (does not remove entry)
 * @param songId - The song ID to look up
 * @returns MediaMetadata or null if not found
 */
export function getPreloadedMetadata(songId: string): MediaMetadata | null {
  const metadata = preloadedMetadataCache.get(songId);
  if (!metadata) {
    return null;
  }
  touchPreloadedMetadata(songId, metadata);
  return metadata;
}

/**
 * Create MediaMetadata with offline support
 * Always uses blob URL for artwork to:
 * 1. Prevent repeated network requests from Media Session API (Firefox Android issue)
 * 2. Ensure artwork displays correctly in offline mode
 * @param song - The song to create metadata for
 * @returns Promise resolving to MediaMetadata object
 */
export async function createMediaMetadataWithOfflineSupport(song: Song): Promise<MediaMetadata> {
  // Priority 1: Check IndexedDB cache (for downloaded songs)
  try {
    const cachedSong = await offlineCacheService.getCachedSong(song.id);
    if (cachedSong?.artwork) {
      // Revoke previous blob URL to prevent memory leak
      if (currentMediaSessionBlobUrl) {
        URL.revokeObjectURL(currentMediaSessionBlobUrl);
      }
      currentMediaSessionBlobUrl = URL.createObjectURL(cachedSong.artwork);
      return createMediaMetadata(song, currentMediaSessionBlobUrl);
    }
  } catch (error) {
    console.warn('[MediaSession] Failed to get cached artwork:', error);
  }
  
  // Priority 2: Fetch artwork and convert to blob URL
  // This prevents Firefox Android from repeatedly requesting artwork via network
  const blobUrl = await fetchArtworkAsBlob(song);
  if (blobUrl) {
    // Update current blob URL reference (for cleanup)
    if (currentMediaSessionBlobUrl && !artworkBlobCache.has(song.id)) {
      URL.revokeObjectURL(currentMediaSessionBlobUrl);
    }
    currentMediaSessionBlobUrl = blobUrl;
    return createMediaMetadata(song, blobUrl);
  }
  
  // Fallback: use network URLs (will cause repeated requests on Firefox Android)
  return createMediaMetadata(song);
}

/**
 * Synchronously set Media Session metadata using preloaded cache when available
 * @param song - The song to set metadata for
 */
export function setMediaSessionMetadataSync(song: Song): void {
  if (!isMediaSessionSupported()) {
    return;
  }

  try {
    const preloaded = getPreloadedMetadata(song.id);
    if (preloaded) {
      console.log('[MediaSession] Using preloaded metadata for', song.id);
      navigator.mediaSession.metadata = preloaded;
      return;
    }

    console.log('[MediaSession] Using basic metadata for', song.id);
    navigator.mediaSession.metadata = createMediaMetadata(song);
  } catch (error) {
    console.warn('[MediaSession] Failed to set media metadata:', error);
  }
}

/**
 * Create MediaPositionState object from playback progress
 * @param progress - Current playback position in seconds
 * @param duration - Total duration in seconds
 * @param playbackRate - Playback rate (default: 1)
 * @returns MediaPositionState object
 */
export function createPositionState(
  progress: number,
  duration: number,
  playbackRate: number = 1
): MediaPositionState {
  return {
    position: Math.max(0, progress),
    duration: Math.max(0, duration),
    playbackRate,
  };
}

/**
 * Calculate seek position with boundary clamping
 * @param currentPosition - Current playback position in seconds
 * @param seekOffset - Offset to seek (positive for forward, negative for backward)
 * @param duration - Total duration in seconds
 * @returns Clamped seek position between 0 and duration
 */
export function calculateSeekPosition(
  currentPosition: number,
  seekOffset: number,
  duration: number
): number {
  const newPosition = currentPosition + seekOffset;
  // Clamp between 0 and duration
  return Math.max(0, Math.min(duration, newPosition));
}

/**
 * Get MediaSession playback state from boolean isPlaying
 * @param isPlaying - Whether playback is active
 * @returns MediaSessionPlaybackState ('playing' or 'paused')
 */
export function getPlaybackState(isPlaying: boolean): MediaSessionPlaybackState {
  return isPlaying ? 'playing' : 'paused';
}

/**
 * Safely set a Media Session action handler with error handling
 * @param action - The MediaSessionAction to handle
 * @param handler - The handler function or null to remove
 */
export function safeSetActionHandler(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
): void {
  try {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler(action, handler);
    }
  } catch (error) {
    console.warn(`Failed to set ${action} handler:`, error);
  }
}

/**
 * Check if Media Session API is available
 * @returns true if Media Session API is supported
 */
export function isMediaSessionSupported(): boolean {
  return 'mediaSession' in navigator;
}

/**
 * Default seek offset in seconds for seekforward/seekbackward actions
 */
export const DEFAULT_SEEK_OFFSET = 10;
