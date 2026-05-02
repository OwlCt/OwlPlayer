/**
 * Audio Preloader - 前端音频预加载管理器
 * 
 * 在浏览器端预加载下一首歌曲，实现无缝切歌。
 * 使用 fetch + Blob URL 方式，将音频完整下载到内存中。
 * 
 * 集成 AudioSessionManager 获取正确的 URL 格式
 * 支持 Android PWA 预加载
 * 实现快速切歌时取消预加载
 */

import { getManualOfflineMode } from '../hooks/useOnlineStatus';
import { getAudioSessionManager, getPlatformInfo, isAndroidPWA } from './audioSession';
import { buildPlaybackStreamUrl, loadDesktopTranscodeQuality } from './playbackQuality';
import { getAuthenticatedStreamUrl } from './streamUrl';

interface PreloadedAudio {
  songId: string;
  blobUrl: string;
  blob: Blob;
  timestamp: number;
}

// 预加载缓存，最多保留 2 首歌（当前播放的可能也在里面）
const MAX_CACHE_SIZE = 2;

// 快速切歌检测：如果在此时间内切歌，取消之前的预加载
const RAPID_SWITCH_THRESHOLD_MS = 500;

class AudioPreloader {
  private cache: Map<string, PreloadedAudio> = new Map();
  private loadingPromises: Map<string, Promise<string | null>> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private lastPreloadRequestTime: number = 0;
  private lastPreloadSongId: string | null = null;

  /**
   * 获取已缓存的 Blob URL
   * @param songId 歌曲 ID
   * @returns Blob URL 或 null（如果未缓存）
   */
  getCachedUrl(songId: string): string | null {
    const cached = this.cache.get(songId);
    if (cached) {
      // 更新访问时间
      cached.timestamp = Date.now();
      return cached.blobUrl;
    }
    return null;
  }

  /**
   * 检查歌曲是否已缓存
   */
  isCached(songId: string): boolean {
    return this.cache.has(songId);
  }

  /**
   * 检查歌曲是否正在加载
   */
  isLoading(songId: string): boolean {
    return this.loadingPromises.has(songId);
  }

  /**
   * 检查是否应该启用预加载
   * - 离线模式下不预加载
   * - HLS 模式下不预加载（统一由 HLS 分片与缓存策略处理）
   * - Android PWA 启用预加载（解决后台播放问题）
   */
  private shouldPreload(): boolean {
    // 离线模式下不进行网络预加载
    if (getManualOfflineMode()) {
      return false;
    }

    const sessionManager = getAudioSessionManager();
    if (sessionManager.isHlsMode) {
      return false;
    }

    // 其他情况都启用预加载（包括 Android PWA）
    return true;
  }

  /**
   * 获取预加载使用的 URL
   * 使用 AudioSessionManager 获取正确的 URL 格式
   */
  private getPreloadUrl(songId: string): string {
    try {
      const sessionManager = getAudioSessionManager();
      return buildPlaybackStreamUrl(
        sessionManager.getStreamUrl(songId),
        sessionManager.platform,
        loadDesktopTranscodeQuality()
      );
    } catch {
      // 如果 AudioSessionManager 未初始化，使用默认 URL
      return getAuthenticatedStreamUrl(songId, false);
    }
  }

  /**
   * 预加载歌曲
   * @param songId 歌曲 ID
   * @returns Promise<string | null> - 成功返回 Blob URL，失败返回 null
   */
  async preload(songId: string): Promise<string | null> {
    // 检查是否应该预加载
    if (!this.shouldPreload()) {
      return null;
    }

    const now = Date.now();
    
    // 快速切歌检测：取消之前的预加载
    if (
      this.lastPreloadSongId &&
      this.lastPreloadSongId !== songId &&
      now - this.lastPreloadRequestTime < RAPID_SWITCH_THRESHOLD_MS
    ) {
      console.log(`[AudioPreloader] Rapid switch detected, cancelling preload for ${this.lastPreloadSongId}`);
      this.cancelPreload(this.lastPreloadSongId);
    }

    this.lastPreloadRequestTime = now;
    this.lastPreloadSongId = songId;
    
    // 已缓存，直接返回
    const cached = this.getCachedUrl(songId);
    if (cached) {
      return cached;
    }

    // 正在加载，返回现有的 Promise
    const existingPromise = this.loadingPromises.get(songId);
    if (existingPromise) {
      return existingPromise;
    }

    // 开始新的加载
    const abortController = new AbortController();
    this.abortControllers.set(songId, abortController);

    const loadPromise = this.doPreload(songId, abortController.signal);
    this.loadingPromises.set(songId, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(songId);
      this.abortControllers.delete(songId);
    }
  }

  /**
   * 实际执行预加载
   */
  private async doPreload(songId: string, signal: AbortSignal): Promise<string | null> {
    // 再次检查是否应该预加载（防止在等待期间状态改变）
    if (!this.shouldPreload()) {
      return null;
    }
    
    try {
      const url = this.getPreloadUrl(songId);
      const platformInfo = getPlatformInfo();
      
      console.log(`[AudioPreloader] Starting preload for ${songId} on ${platformInfo.platform}${platformInfo.isPWA ? ' PWA' : ''}`);
      
      const response = await fetch(url, {
        signal,
        credentials: 'include',
      });

      if (!response.ok) {
        console.warn(`[AudioPreloader] Failed to preload ${songId}: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      
      // 检查是否被取消
      if (signal.aborted) {
        return null;
      }

      const blobUrl = URL.createObjectURL(blob);

      // 清理旧缓存
      this.cleanupCache();

      // 存入缓存
      this.cache.set(songId, {
        songId,
        blobUrl,
        blob,
        timestamp: Date.now(),
      });

      console.log(`[AudioPreloader] Preloaded ${songId}, cache size: ${this.cache.size}`);
      return blobUrl;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.log(`[AudioPreloader] Preload cancelled for ${songId}`);
      } else {
        console.error(`[AudioPreloader] Error preloading ${songId}:`, error);
      }
      return null;
    }
  }

  /**
   * 清理旧缓存，保持缓存大小在限制内
   */
  private cleanupCache(): void {
    if (this.cache.size < MAX_CACHE_SIZE) {
      return;
    }

    // 按时间戳排序，删除最旧的
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    // 删除最旧的，直到缓存大小合适
    while (this.cache.size >= MAX_CACHE_SIZE && entries.length > 0) {
      const oldest = entries.shift();
      if (oldest) {
        const [songId, audio] = oldest;
        URL.revokeObjectURL(audio.blobUrl);
        this.cache.delete(songId);
        console.log(`[AudioPreloader] Evicted ${songId} from cache`);
      }
    }
  }

  /**
   * 取消正在进行的预加载
   */
  cancelPreload(songId: string): void {
    const controller = this.abortControllers.get(songId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(songId);
      this.loadingPromises.delete(songId);
      console.log(`[AudioPreloader] Cancelled preload for ${songId}`);
    }
  }

  /**
   * 取消所有预加载
   */
  cancelAll(): void {
    for (const [songId, controller] of this.abortControllers.entries()) {
      controller.abort();
      console.log(`[AudioPreloader] Cancelled preload for ${songId}`);
    }
    this.abortControllers.clear();
    this.loadingPromises.clear();
    this.lastPreloadSongId = null;
  }

  /**
   * 从缓存中移除指定歌曲
   */
  remove(songId: string): void {
    const cached = this.cache.get(songId);
    if (cached) {
      URL.revokeObjectURL(cached.blobUrl);
      this.cache.delete(songId);
    }
    this.cancelPreload(songId);
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cancelAll();
    for (const audio of this.cache.values()) {
      URL.revokeObjectURL(audio.blobUrl);
    }
    this.cache.clear();
  }

  /**
   * 获取缓存状态（用于调试）
   */
  getStatus(): { cached: string[]; loading: string[]; platform: string; preloadEnabled: boolean } {
    const platformInfo = getPlatformInfo();
    return {
      cached: Array.from(this.cache.keys()),
      loading: Array.from(this.loadingPromises.keys()),
      platform: `${platformInfo.platform}${platformInfo.isPWA ? '-pwa' : ''}`,
      preloadEnabled: this.shouldPreload(),
    };
  }

  /**
   * 为 Android PWA 预加载下一首歌曲
   * 这是 Android 后台播放的关键功能
   */
  async preloadForAndroid(songId: string): Promise<string | null> {
    if (!isAndroidPWA()) {
      return this.preload(songId);
    }

    // Android PWA 强制预加载，即使在某些限制条件下
    console.log(`[AudioPreloader] Android PWA preload for ${songId}`);
    
    // 已缓存，直接返回
    const cached = this.getCachedUrl(songId);
    if (cached) {
      return cached;
    }

    // 正在加载，返回现有的 Promise
    const existingPromise = this.loadingPromises.get(songId);
    if (existingPromise) {
      return existingPromise;
    }

    // 开始新的加载
    const abortController = new AbortController();
    this.abortControllers.set(songId, abortController);

    const loadPromise = this.doPreload(songId, abortController.signal);
    this.loadingPromises.set(songId, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadingPromises.delete(songId);
      this.abortControllers.delete(songId);
    }
  }
}

// 单例导出
export const audioPreloader = new AudioPreloader();
