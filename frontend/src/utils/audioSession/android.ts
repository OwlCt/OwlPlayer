/**
 * Android Audio Session 实现
 * 处理 Android PWA 特有的音频会话管理：
 * - 后台播放支持（解决 Chromium 1分钟限制和 Firefox 下一首问题）
 * - 预加载下一首歌曲
 * - visibility change 监听
 * - 会话恢复逻辑
 * - 支持 Chromium 和 Firefox 浏览器
 *
 * 关键优化：
 * 1. 使用 Web Locks API 防止页面被冻结
 * 2. 预加载下一首歌曲到内存，减少后台切换延迟
 * 3. 监听 audio ended 事件时立即触发下一首，不依赖 JavaScript 定时器
 * 4. 使用 Service Worker 预缓存后续歌曲，确保后台播放时音频可用
 */

import type {
  IAudioSessionManager,
  AudioSessionState,
  AudioSessionEvents,
  AudioSessionConfig,
} from "./types";
import { defaultAudioSessionConfig } from "./types";
import { detectPlatform, type PlatformInfo } from "./detection";
import { prefetchAudioToSWCache, isSWAvailable } from "../swAudioCache";
import { getAuthenticatedStreamUrl } from "../streamUrl";
import {
  buildPlaybackStreamUrl,
  loadDesktopTranscodeQuality,
} from "../playbackQuality";

type EventHandler<K extends keyof AudioSessionEvents> = AudioSessionEvents[K];

/** 等待 canplay 事件的超时时间（毫秒）*/
const CANPLAY_TIMEOUT = 10000;

/** 后台播放检测间隔（毫秒）*/
const BACKGROUND_CHECK_INTERVAL = 5000;

/** Web Lock 名称 */
const AUDIO_LOCK_NAME = "owlplayer-audio-playback";

/** Service Worker 预缓存的歌曲数量 */
const SW_PREFETCH_COUNT = 5;

/** 预加载的音频缓存 */
interface PreloadedAudio {
  songId: string;
  blob: Blob;
  url: string;
}

export class AndroidAudioSession implements IAudioSessionManager {
  readonly platform = "android" as const;
  private _state: AudioSessionState = "closed";
  private _config: AudioSessionConfig;
  private platformInfo: PlatformInfo;
  private eventHandlers: Map<
    keyof AudioSessionEvents,
    Set<EventHandler<keyof AudioSessionEvents>>
  > = new Map();

  // 预加载状态
  private preloadedNextSong: string | null = null;
  private preloadAbortController: AbortController | null = null;

  // 预加载的音频缓存（用于后台快速切换）
  private preloadedAudioCache: PreloadedAudio | null = null;

  // 后台状态
  private backgroundStartTime = 0;
  private backgroundCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastVisibilityState: "visible" | "hidden" = "visible";

  // 可见性监听器清理函数
  private visibilityCleanup: (() => void) | null = null;

  // Web Lock 控制器（用于防止页面被冻结）
  private lockController: AbortController | null = null;
  private hasWebLock = false;

  // 当前播放的音频元素引用
  private currentAudioRef: HTMLAudioElement | null = null;

  // 下一首歌曲回调（由 playerStore 设置）
  private onNextSongCallback: (() => void) | null = null;

  constructor(config?: Partial<AudioSessionConfig>) {
    this._config = { ...defaultAudioSessionConfig, ...config };
    this.platformInfo = detectPlatform();
  }

  get state(): AudioSessionState {
    return this._state;
  }

  get isHlsMode(): boolean {
    return this._config.hlsEnabled;
  }

  get config(): AudioSessionConfig {
    return this._config;
  }

  /**
   * 初始化音频会话
   */
  async initialize(): Promise<void> {
    console.log("[Android] Initializing audio session...");
    console.log("[Android] Browser:", this.platformInfo.browser);
    console.log("[Android] PWA mode:", this.platformInfo.isPWA);

    // 设置可见性监听
    this.setupVisibilityListener();

    // 检查 Web Locks API 支持
    if ("locks" in navigator) {
      console.log(
        "[Android] Web Locks API supported - will use for background playback",
      );
    } else {
      console.log(
        "[Android] Web Locks API not supported - background playback may be limited",
      );
    }

    this._state = "active";
    this.emit("stateChange", "active");

    console.log("[Android] Audio session initialized");
  }

  /**
   * 获取流媒体 URL
   * Android 统一使用 HLS。
   */
  getStreamUrl(songId: string): string {
    return buildPlaybackStreamUrl(
      getAuthenticatedStreamUrl(songId, this.isHlsMode, "aac_256"),
      this.platform,
      loadDesktopTranscodeQuality(),
    );
  }

  /**
   * 准备播放
   */
  async preparePlayback(
    audioElement: HTMLAudioElement,
    songId: string,
  ): Promise<void> {
    console.log("[Android] Preparing playback for song:", songId);

    // 保存音频元素引用
    this.currentAudioRef = audioElement;

    // 检查是否有预加载的音频
    if (
      this.preloadedAudioCache &&
      this.preloadedAudioCache.songId === songId
    ) {
      console.log("[Android] Using preloaded audio for:", songId);
      audioElement.src = this.preloadedAudioCache.url;
    } else {
      const url = this.getStreamUrl(songId);
      audioElement.src = url;
    }

    audioElement.preload = "auto"; // Android 需要预加载

    // 获取 Web Lock 以防止页面被冻结
    await this.acquireWebLock();

    this._state = "active";
  }

  /**
   * 恢复播放 (用户交互后)
   */
  async resumePlayback(audioElement: HTMLAudioElement): Promise<boolean> {
    console.log("[Android] Resuming playback...");

    // 保存音频元素引用
    this.currentAudioRef = audioElement;

    try {
      // 获取 Web Lock 以防止页面被冻结
      await this.acquireWebLock();

      // Android 后台恢复：检查音频元素状态
      if (audioElement.readyState === 0) {
        console.log("[Android] Audio element not ready, reloading...");
        // 音频被系统回收，需要重新加载
        audioElement.load();
        await this.waitForCanPlay(audioElement);
      }

      await audioElement.play();
      this._state = "active";
      return true;
    } catch (error) {
      if ((error as Error).name === "NotAllowedError") {
        console.log("[Android] NotAllowedError - needs user interaction");
        return false;
      }
      this.emit("error", error as Error);
      throw error;
    }
  }

  /**
   * 处理播放错误
   */
  async handlePlaybackError(
    error: Error,
    audioElement: HTMLAudioElement,
  ): Promise<boolean> {
    console.error("[Android] Playback error:", error);

    try {
      // 尝试重新加载音频
      if (audioElement.src) {
        console.log("[Android] Attempting to reload audio...");
        audioElement.load();
        await this.waitForCanPlay(audioElement);
        await audioElement.play();
        return true;
      }
    } catch (recoveryError) {
      console.error("[Android] Recovery failed:", recoveryError);
    }

    this.emit("error", error);
    return false;
  }

  /**
   * 同步进度 (后台恢复时)
   */
  syncProgress(audioElement: HTMLAudioElement, savedProgress: number): void {
    if (
      audioElement.duration &&
      savedProgress > 0 &&
      savedProgress < audioElement.duration
    ) {
      audioElement.currentTime = savedProgress;
    }
  }

  /**
   * 预加载下一首歌曲
   * Android 后台播放关键：预加载到浏览器缓存和内存
   * 这样在后台切换歌曲时可以立即使用，不需要等待网络请求
   */
  async preloadNextSong(songId: string): Promise<void> {
    if (this.preloadedNextSong === songId) {
      console.log("[Android] Song already preloaded:", songId);
      return;
    }

    // 取消之前的预加载
    this.cancelPreload();

    console.log("[Android] Preloading song:", songId);

    try {
      this.preloadAbortController = new AbortController();

      // 使用 fetch 预加载到浏览器缓存
      const response = await fetch(this.getStreamUrl(songId), {
        credentials: "include",
        signal: this.preloadAbortController.signal,
      });

      if (response.ok) {
        // 读取响应为 Blob 并缓存到内存
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        // 清理之前的预加载缓存
        if (this.preloadedAudioCache) {
          URL.revokeObjectURL(this.preloadedAudioCache.url);
        }

        this.preloadedAudioCache = {
          songId,
          blob,
          url,
        };

        this.preloadedNextSong = songId;
        console.log("[Android] Preloaded song to memory:", songId);
      } else {
        console.warn("[Android] Preload failed with status:", response.status);
      }
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        console.log("[Android] Preload cancelled for:", songId);
      } else {
        console.warn("[Android] Preload failed for", songId, ":", error);
      }
    } finally {
      this.preloadAbortController = null;
    }
  }

  /**
   * 取消预加载
   */
  cancelPreload(): void {
    if (this.preloadAbortController) {
      this.preloadAbortController.abort();
      this.preloadAbortController = null;
      console.log("[Android] Preload cancelled");
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log("[Android] Cleaning up audio session...");

    // 取消预加载
    this.cancelPreload();

    // 清理预加载的音频缓存
    if (this.preloadedAudioCache) {
      URL.revokeObjectURL(this.preloadedAudioCache.url);
      this.preloadedAudioCache = null;
    }

    // 释放 Web Lock
    this.releaseWebLock();

    // 清除后台检测定时器
    if (this.backgroundCheckTimer) {
      clearInterval(this.backgroundCheckTimer);
      this.backgroundCheckTimer = null;
    }

    // 移除可见性监听
    if (this.visibilityCleanup) {
      this.visibilityCleanup();
      this.visibilityCleanup = null;
    }

    this.currentAudioRef = null;
    this.onNextSongCallback = null;
    this._state = "closed";
    this.eventHandlers.clear();
    this.emit("stateChange", "closed");
  }

  /**
   * 添加事件监听
   */
  on<K extends keyof AudioSessionEvents>(
    event: K,
    handler: AudioSessionEvents[K],
  ): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers
      .get(event)!
      .add(handler as EventHandler<keyof AudioSessionEvents>);
  }

  /**
   * 移除事件监听
   */
  off<K extends keyof AudioSessionEvents>(
    event: K,
    handler: AudioSessionEvents[K],
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<keyof AudioSessionEvents>);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 触发事件
   */
  private emit<K extends keyof AudioSessionEvents>(
    event: K,
    ...args: Parameters<AudioSessionEvents[K]>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          (handler as (...args: Parameters<AudioSessionEvents[K]>) => void)(
            ...args,
          );
        } catch (error) {
          console.error(
            `[Android] Error in event handler for ${event}:`,
            error,
          );
        }
      });
    }
  }

  /**
   * 等待 canplay 事件
   */
  private waitForCanPlay(audioElement: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        audioElement.removeEventListener("canplay", onCanPlay);
        audioElement.removeEventListener("error", onError);
        reject(new Error("Timeout waiting for canplay"));
      }, CANPLAY_TIMEOUT);

      const onCanPlay = () => {
        clearTimeout(timeout);
        audioElement.removeEventListener("canplay", onCanPlay);
        audioElement.removeEventListener("error", onError);
        resolve();
      };

      const onError = () => {
        clearTimeout(timeout);
        audioElement.removeEventListener("canplay", onCanPlay);
        audioElement.removeEventListener("error", onError);
        reject(new Error("Audio load error"));
      };

      audioElement.addEventListener("canplay", onCanPlay, { once: true });
      audioElement.addEventListener("error", onError, { once: true });
    });
  }

  /**
   * 设置可见性监听器
   */
  private setupVisibilityListener(): void {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      const newState = document.visibilityState as "visible" | "hidden";

      // 只有状态真正改变时才触发事件
      if (newState === this.lastVisibilityState) {
        return;
      }

      this.lastVisibilityState = newState;

      if (newState === "hidden") {
        this.backgroundStartTime = Date.now();
        console.log("[Android] Page hidden at:", this.backgroundStartTime);

        // 启动后台检测
        this.startBackgroundCheck();

        this.emit("backgroundEnter");
      } else if (newState === "visible") {
        const backgroundDuration = Date.now() - this.backgroundStartTime;
        console.log(
          "[Android] Page visible, background duration:",
          backgroundDuration,
          "ms",
        );

        // 停止后台检测
        this.stopBackgroundCheck();

        this.emit("backgroundExit");

        // 如果后台时间较长，可能需要恢复会话
        if (backgroundDuration > 60000) {
          // 超过1分钟
          console.log(
            "[Android] Long background duration, may need session recovery",
          );
          this.emit("sessionRestored");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    this.visibilityCleanup = () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }

  /**
   * 启动后台检测
   * 用于监控后台播放状态
   */
  private startBackgroundCheck(): void {
    if (this.backgroundCheckTimer) return;

    this.backgroundCheckTimer = setInterval(() => {
      const duration = Date.now() - this.backgroundStartTime;
      console.log("[Android] Background check - duration:", duration, "ms");

      // 可以在这里添加额外的后台状态检测逻辑
    }, BACKGROUND_CHECK_INTERVAL);
  }

  /**
   * 停止后台检测
   */
  private stopBackgroundCheck(): void {
    if (this.backgroundCheckTimer) {
      clearInterval(this.backgroundCheckTimer);
      this.backgroundCheckTimer = null;
    }
  }

  /**
   * 获取 Web Lock 以防止页面被冻结
   * Web Locks API 可以防止浏览器在后台冻结页面
   * 这是解决 Chromium 1分钟后台限制的关键
   */
  private async acquireWebLock(): Promise<void> {
    if (this.hasWebLock) {
      return;
    }

    if (!("locks" in navigator)) {
      console.log("[Android] Web Locks API not available");
      return;
    }

    try {
      this.lockController = new AbortController();

      // 请求一个永不释放的锁，这会阻止浏览器冻结页面
      // 使用 ifAvailable: false 确保我们等待获取锁
      navigator.locks
        .request(
          AUDIO_LOCK_NAME,
          { mode: "exclusive", signal: this.lockController.signal },
          async () => {
            console.log(
              "[Android] Web Lock acquired - page will not be frozen",
            );
            this.hasWebLock = true;

            // 返回一个永不 resolve 的 Promise，保持锁
            return new Promise<void>(() => {
              // 这个 Promise 永远不会 resolve，锁会一直保持
              // 直到 lockController.abort() 被调用
            });
          },
        )
        .catch((error) => {
          if (error.name === "AbortError") {
            console.log("[Android] Web Lock released");
          } else {
            console.warn("[Android] Web Lock error:", error);
          }
          this.hasWebLock = false;
        });

      // 等待一小段时间确保锁被获取
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch (error) {
      console.warn("[Android] Failed to acquire Web Lock:", error);
    }
  }

  /**
   * 释放 Web Lock
   */
  private releaseWebLock(): void {
    if (this.lockController) {
      this.lockController.abort();
      this.lockController = null;
      this.hasWebLock = false;
      console.log("[Android] Web Lock released");
    }
  }

  /**
   * 设置下一首歌曲回调
   * 由 playerStore 调用，用于在后台自动切换歌曲
   */
  setNextSongCallback(callback: (() => void) | null): void {
    this.onNextSongCallback = callback;
  }

  /**
   * 获取预加载的音频 URL（如果匹配）
   */
  getPreloadedAudioUrl(songId: string): string | null {
    if (
      this.preloadedAudioCache &&
      this.preloadedAudioCache.songId === songId
    ) {
      return this.preloadedAudioCache.url;
    }
    return null;
  }

  /**
   * 消费预加载的音频（使用后清除缓存）
   */
  consumePreloadedAudio(songId: string): string | null {
    if (
      this.preloadedAudioCache &&
      this.preloadedAudioCache.songId === songId
    ) {
      const url = this.preloadedAudioCache.url;
      // 不立即清除，让调用者使用完后再清除
      this.preloadedNextSong = null;
      return url;
    }
    return null;
  }

  /**
   * 清除已消费的预加载音频
   */
  clearConsumedPreload(): void {
    if (this.preloadedAudioCache && !this.preloadedNextSong) {
      URL.revokeObjectURL(this.preloadedAudioCache.url);
      this.preloadedAudioCache = null;
    }
  }

  // ==================== 公共辅助方法 ====================

  /**
   * 获取后台持续时间
   */
  getBackgroundDuration(): number {
    if (this.backgroundStartTime === 0) return 0;
    return Date.now() - this.backgroundStartTime;
  }

  /**
   * 检查是否在后台
   */
  isInBackground(): boolean {
    return (
      typeof document !== "undefined" && document.visibilityState === "hidden"
    );
  }

  /**
   * 获取预加载的歌曲 ID
   */
  getPreloadedSongId(): string | null {
    return this.preloadedNextSong;
  }

  /**
   * 清除预加载缓存
   */
  clearPreloadCache(): void {
    this.preloadedNextSong = null;
    if (this.preloadedAudioCache) {
      URL.revokeObjectURL(this.preloadedAudioCache.url);
      this.preloadedAudioCache = null;
    }
  }

  /**
   * 检查是否持有 Web Lock
   */
  hasActiveWebLock(): boolean {
    return this.hasWebLock;
  }

  /**
   * 预缓存队列中的歌曲到 Service Worker
   * 这是解决后台播放到未加载音频问题的关键
   * Service Worker 可以在主线程被节流时继续工作
   *
   * @param songIds - 要预缓存的歌曲 ID 列表（通常是队列中接下来的几首歌）
   */
  async prefetchQueueToSWCache(songIds: string[]): Promise<void> {
    if (!isSWAvailable()) {
      console.log(
        "[Android] Service Worker not available, skipping SW prefetch",
      );
      return;
    }

    if (songIds.length === 0) {
      return;
    }

    // 只预缓存前 N 首歌曲
    const songsToCache = songIds.slice(0, SW_PREFETCH_COUNT);

    console.log(
      "[Android] Prefetching",
      songsToCache.length,
      "songs to SW cache",
    );

    try {
      const result = await prefetchAudioToSWCache(songsToCache);
      console.log("[Android] SW prefetch result:", result);
    } catch (error) {
      console.warn("[Android] SW prefetch failed:", error);
    }
  }

  /**
   * 在进入后台时预缓存队列
   * 由 playerStore 调用
   */
  onEnterBackground(upcomingSongIds: string[]): void {
    console.log("[Android] Entering background, prefetching queue...");

    // 预缓存接下来的歌曲到 Service Worker
    this.prefetchQueueToSWCache(upcomingSongIds);
  }
}
