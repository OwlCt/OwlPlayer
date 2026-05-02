/**
 * HLSPrefetchService - Service for prefetching HLS resources for iOS PWA background playback
 * 
 * This service handles:
 * - Prefetching next song's m3u8 playlist and HLS segments to Service Worker cache
 * - Managing prefetch timing based on playback progress
 * - Communicating with Service Worker for cache operations
 * - Handling queue changes and updating prefetch targets
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 5.1, 5.3, 5.5
 */

import { detectPlatform } from '../utils/audioSession/detection';
import { getAuthenticatedStreamUrl } from '../utils/streamUrl';
import { loadIOSHLSQuality, mapIOSHLSQualityToQuery } from '../utils/playbackQuality';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Configuration for HLS prefetch service
 */
export interface HLSPrefetchConfig {
  /** Whether prefetch is enabled */
  enabled: boolean;
  /** Number of HLS segments to prefetch (default: 2) */
  segmentsToPrefetch: number;
  /** Seconds after song start to begin prefetch (default: 30) */
  triggerAfterSeconds: number;
  /** Maximum retry attempts for failed prefetch (default: 2) */
  retryAttempts: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelayMs: number;
}

/**
 * Status of a prefetch operation
 */
export interface HLSPrefetchStatus {
  songId: string;
  status: 'pending' | 'fetching' | 'cached' | 'failed';
  playlistCached: boolean;
  segmentsCached: number;
  totalSegments: number;
  error?: string;
  retryCount?: number;
}

/**
 * Result from Service Worker prefetch operation
 */
export interface HLSPrefetchResult {
  success: boolean;
  songId: string;
  playlistCached: boolean;
  segmentsCached: number;
  totalSegments: number;
  error?: string;
}

/**
 * Result from Service Worker cache check
 */
export interface HLSCacheCheckResult {
  songId: string;
  playlistCached: boolean;
  segmentsCached: number;
  totalSegments: number;
  isFullyCached: boolean;
  error?: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const defaultConfig: HLSPrefetchConfig = {
  enabled: true,
  segmentsToPrefetch: 2,
  triggerAfterSeconds: 30,
  retryAttempts: 2,
  retryDelayMs: 1000,
};

// ============================================================================
// HLSPrefetchService Class
// ============================================================================

export class HLSPrefetchService {
  private config: HLSPrefetchConfig;
  private currentPrefetchSongId: string | null = null;
  private prefetchStatus: Map<string, HLSPrefetchStatus> = new Map();
  private prefetchTimer: ReturnType<typeof setTimeout> | null = null;
  private currentSongId: string | null = null;
  private nextSongId: string | null = null;
  private prefetchStarted: boolean = false;

  constructor(config?: Partial<HLSPrefetchConfig>) {
    this.config = { ...defaultConfig, ...config };
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Check if HLS prefetch should be enabled
   * Only enabled in iOS PWA mode with HLS support
   * Requirement: 1.5
   */
  isEnabled(): boolean {
    if (!this.config.enabled) {
      return false;
    }

    // Only enable for iOS PWA with HLS mode
    const platformInfo = detectPlatform();
    return platformInfo.platform === 'ios' && platformInfo.isPWA && platformInfo.supportsHLS;
  }

  /**
   * Called when a song starts playing
   * Sets up timer to trigger prefetch after configured delay
   * Requirements: 1.1, 1.7, 5.1
   * 
   * @param currentSongId - ID of the currently playing song
   * @param nextSongId - ID of the next song in queue (null if none)
   */
  onSongStart(currentSongId: string, nextSongId: string | null): void {
    if (!this.isEnabled()) {
      return;
    }

    console.log('[HLSPrefetch] Song started:', currentSongId, 'next:', nextSongId);

    // Clear any existing timer
    this.cancelPrefetch();

    // Update state
    this.currentSongId = currentSongId;
    this.nextSongId = nextSongId;
    this.prefetchStarted = false;

    // If no next song, nothing to prefetch
    if (!nextSongId) {
      console.log('[HLSPrefetch] No next song to prefetch');
      return;
    }

    // Set timer to start prefetch after configured delay
    // Requirement: 5.1 - Start prefetch after 30 seconds
    this.prefetchTimer = setTimeout(() => {
      this.startPrefetch(nextSongId);
    }, this.config.triggerAfterSeconds * 1000);

    console.log('[HLSPrefetch] Prefetch scheduled in', this.config.triggerAfterSeconds, 'seconds');
  }

  /**
   * Called when playback progress updates
   * Can trigger early prefetch if song is short
   * Requirements: 1.1, 5.1
   * 
   * @param progress - Current playback position in seconds
   * @param duration - Total song duration in seconds
   * @param nextSongId - ID of the next song in queue
   */
  onProgressUpdate(progress: number, duration: number, nextSongId: string | null): void {
    if (!this.isEnabled() || this.prefetchStarted || !nextSongId) {
      return;
    }

    // Update next song ID if changed
    if (nextSongId !== this.nextSongId) {
      this.nextSongId = nextSongId;
    }

    // For short songs (duration <= 90s), start prefetch immediately
    // For longer songs, start after 30 seconds of playback
    const shouldStartNow = 
      (duration <= 90 && progress >= 1) || // Short song: start after 1 second
      (duration > 90 && progress >= this.config.triggerAfterSeconds);

    if (shouldStartNow && !this.prefetchStarted) {
      // Cancel timer if set
      if (this.prefetchTimer) {
        clearTimeout(this.prefetchTimer);
        this.prefetchTimer = null;
      }
      this.startPrefetch(nextSongId);
    }
  }

  /**
   * Called when queue changes (add, remove, reorder)
   * Updates prefetch target to new next song
   * Requirement: 1.6
   * 
   * @param newNextSongId - ID of the new next song in queue
   */
  onQueueChange(newNextSongId: string | null): void {
    if (!this.isEnabled()) {
      return;
    }

    console.log('[HLSPrefetch] Queue changed, new next song:', newNextSongId);

    // If next song changed, update target
    if (newNextSongId !== this.nextSongId) {
      this.nextSongId = newNextSongId;

      // If we were prefetching a different song, cancel and restart
      if (this.currentPrefetchSongId && this.currentPrefetchSongId !== newNextSongId) {
        console.log('[HLSPrefetch] Prefetch target changed, updating...');
        // Don't cancel ongoing prefetch, just update target for next prefetch
      }

      // If prefetch already started and we have a new target, prefetch it
      if (this.prefetchStarted && newNextSongId) {
        this.startPrefetch(newNextSongId);
      }
    }
  }

  /**
   * Prefetch HLS resources for a specific song
   * Sends message to Service Worker to fetch and cache resources
   * Requirements: 1.2, 1.3, 2.5, 2.6, 5.3
   * 
   * @param songId - ID of the song to prefetch
   * @returns Promise resolving to prefetch status
   */
  async prefetchSong(songId: string): Promise<HLSPrefetchStatus> {
    if (!this.isEnabled()) {
      return {
        songId,
        status: 'failed',
        playlistCached: false,
        segmentsCached: 0,
        totalSegments: 0,
        error: 'HLS prefetch not enabled',
      };
    }

    // Check if already cached
    // Requirement: 5.5
    const isCached = await this.isCached(songId);
    if (isCached) {
      console.log('[HLSPrefetch] Song already cached:', songId);
      const status: HLSPrefetchStatus = {
        songId,
        status: 'cached',
        playlistCached: true,
        segmentsCached: this.config.segmentsToPrefetch,
        totalSegments: this.config.segmentsToPrefetch,
      };
      this.prefetchStatus.set(songId, status);
      return status;
    }

    // Update status to fetching
    const status: HLSPrefetchStatus = {
      songId,
      status: 'fetching',
      playlistCached: false,
      segmentsCached: 0,
      totalSegments: 0,
      retryCount: 0,
    };
    this.prefetchStatus.set(songId, status);
    this.currentPrefetchSongId = songId;

    // Try prefetch with retries
    // Requirement: 5.3 - Retry up to 2 times with exponential backoff
    return this.prefetchWithRetry(songId, 0);
  }

  /**
   * Check if a song's HLS resources are cached
   * Requirement: 5.5
   * 
   * @param songId - ID of the song to check
   * @returns Promise resolving to true if cached
   */
  async isCached(songId: string): Promise<boolean> {
    if (!this.isServiceWorkerAvailable()) {
      return false;
    }

    try {
      const playlistUrl = this.buildPlaylistUrl(songId);
      const result = await this.sendMessageToServiceWorker<HLSCacheCheckResult>({
        type: 'CHECK_HLS_CACHED',
        songId,
        playlistUrl,
      });

      return result.isFullyCached || (result.playlistCached && result.segmentsCached > 0);
    } catch (error) {
      console.error('[HLSPrefetch] Error checking cache:', error);
      return false;
    }
  }

  /**
   * Cancel current prefetch operation
   */
  cancelPrefetch(): void {
    if (this.prefetchTimer) {
      clearTimeout(this.prefetchTimer);
      this.prefetchTimer = null;
    }
    this.currentPrefetchSongId = null;
    this.prefetchStarted = false;
  }

  /**
   * Get prefetch status for a song
   * 
   * @param songId - ID of the song
   * @returns Prefetch status or null if not found
   */
  getStatus(songId: string): HLSPrefetchStatus | null {
    return this.prefetchStatus.get(songId) || null;
  }

  /**
   * Clean up old prefetch status entries
   * Keeps only recent entries to prevent memory growth
   */
  cleanup(): void {
    // Keep only the last 10 entries
    const maxEntries = 10;
    if (this.prefetchStatus.size > maxEntries) {
      const entries = Array.from(this.prefetchStatus.entries());
      const toRemove = entries.slice(0, entries.length - maxEntries);
      for (const [key] of toRemove) {
        this.prefetchStatus.delete(key);
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): HLSPrefetchConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HLSPrefetchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Start prefetch for a song
   */
  private async startPrefetch(songId: string): Promise<void> {
    this.prefetchStarted = true;
    console.log('[HLSPrefetch] Starting prefetch for:', songId);

    try {
      const status = await this.prefetchSong(songId);
      console.log('[HLSPrefetch] Prefetch result:', status);
    } catch (error) {
      console.error('[HLSPrefetch] Prefetch failed:', error);
    }
  }

  /**
   * Prefetch with retry logic
   * Requirement: 5.3 - Retry up to 2 times with exponential backoff (1s, 2s)
   */
  private async prefetchWithRetry(songId: string, retryCount: number): Promise<HLSPrefetchStatus> {
    try {
      const result = await this.sendPrefetchRequest(songId);

      if (result.success) {
        const status: HLSPrefetchStatus = {
          songId,
          status: 'cached',
          playlistCached: result.playlistCached,
          segmentsCached: result.segmentsCached,
          totalSegments: result.totalSegments,
        };
        this.prefetchStatus.set(songId, status);
        return status;
      }

      // Prefetch failed, check if we should retry
      if (retryCount < this.config.retryAttempts) {
        const delay = this.config.retryDelayMs * Math.pow(2, retryCount); // Exponential backoff
        console.log('[HLSPrefetch] Retrying in', delay, 'ms (attempt', retryCount + 1, ')');

        await this.sleep(delay);
        return this.prefetchWithRetry(songId, retryCount + 1);
      }

      // Max retries reached
      const status: HLSPrefetchStatus = {
        songId,
        status: 'failed',
        playlistCached: result.playlistCached,
        segmentsCached: result.segmentsCached,
        totalSegments: result.totalSegments,
        error: result.error || 'Prefetch failed after retries',
        retryCount,
      };
      this.prefetchStatus.set(songId, status);
      return status;
    } catch (error) {
      // Network or other error
      if (retryCount < this.config.retryAttempts) {
        const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
        console.log('[HLSPrefetch] Error, retrying in', delay, 'ms:', error);

        await this.sleep(delay);
        return this.prefetchWithRetry(songId, retryCount + 1);
      }

      const status: HLSPrefetchStatus = {
        songId,
        status: 'failed',
        playlistCached: false,
        segmentsCached: 0,
        totalSegments: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
        retryCount,
      };
      this.prefetchStatus.set(songId, status);
      return status;
    }
  }

  /**
   * Send prefetch request to Service Worker
   */
  private async sendPrefetchRequest(songId: string): Promise<HLSPrefetchResult> {
    if (!this.isServiceWorkerAvailable()) {
      throw new Error('Service Worker not available');
    }

    const playlistUrl = this.buildPlaylistUrl(songId);

    return this.sendMessageToServiceWorker<HLSPrefetchResult>({
      type: 'PREFETCH_HLS',
      songId,
      playlistUrl,
      segmentCount: this.config.segmentsToPrefetch,
    });
  }

  private buildPlaylistUrl(songId: string): string {
    const quality = mapIOSHLSQualityToQuery(loadIOSHLSQuality());
    return getAuthenticatedStreamUrl(songId, true, quality);
  }

  /**
   * Send message to Service Worker and wait for response
   */
  private sendMessageToServiceWorker<T>(message: Record<string, unknown>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!navigator.serviceWorker?.controller) {
        reject(new Error('No active Service Worker'));
        return;
      }

      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data as T);
        }
      };

      messageChannel.port1.onmessageerror = () => {
        reject(new Error('Message channel error'));
      };

      navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Service Worker message timeout'));
      }, 30000);
    });
  }

  /**
   * Check if Service Worker is available
   */
  private isServiceWorkerAvailable(): boolean {
    return typeof navigator !== 'undefined' && 
           'serviceWorker' in navigator && 
           navigator.serviceWorker.controller !== null;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const hlsPrefetchService = new HLSPrefetchService();

// Export class for testing
export { HLSPrefetchService as HLSPrefetchServiceClass };
