/**
 * iOS Audio Session 实现
 * 处理 iOS PWA 特有的音频会话管理：
 * - HLS 模式支持
 * - AudioContext 管理和保活
 * - 会话冻结检测和恢复
 * - 后台/前台切换处理
 * - HLS 预缓存集成（后台连续播放）
 */

import type {
  IAudioSessionManager,
  AudioSessionState,
  AudioSessionEvents,
  AudioSessionConfig,
} from "./types";
import { defaultAudioSessionConfig } from "./types";
import { detectPlatform, type PlatformInfo } from "./detection";
import type { HLSPrefetchService } from "../../services/hlsPrefetchService";
import type { Song } from "../../types";
import {
  createMediaMetadataWithOfflineSupport,
  createPositionState,
  getPlaybackState,
  isMediaSessionSupported,
} from "../mediaSession";
import { getAuthenticatedStreamUrl } from "../streamUrl";
import { loadIOSHLSQuality, mapIOSHLSQualityToQuery } from "../playbackQuality";

type EventHandler<K extends keyof AudioSessionEvents> = AudioSessionEvents[K];

/** 判断是否被杀后台的阈值（毫秒）*/
const BACKGROUND_KILL_THRESHOLD = 30000; // 30 秒

/** 播放验证等待时间（毫秒）*/
const PLAYBACK_VERIFY_DELAY = 300;

export class iOSAudioSession implements IAudioSessionManager {
  readonly platform = "ios" as const;
  private _state: AudioSessionState = "closed";
  private _config: AudioSessionConfig;
  private platformInfo: PlatformInfo;
  private eventHandlers: Map<
    keyof AudioSessionEvents,
    Set<EventHandler<keyof AudioSessionEvents>>
  > = new Map();

  // AudioContext 管理
  private audioContext: AudioContext | null = null;
  private audioContextMayBeInvalid = false;

  // 会话状态
  private sessionFrozen = false;
  private lastHiddenTimestamp = 0;

  // 可见性监听器清理函数
  private visibilityCleanup: (() => void) | null = null;

  // HLS 预缓存服务引用
  private hlsPrefetchService: HLSPrefetchService | null = null;

  // 当前歌曲和下一首歌曲 ID（用于预缓存）
  private currentSongId: string | null = null;
  private nextSongId: string | null = null;

  // Media Session 状态同步
  private currentSong: Song | null = null;
  private lastPositionUpdateTime: number = 0;
  private lastMetadataUpdateTime: number = 0;

  // 音频会话中断处理
  private audioInterruptionHandler: ((event: Event) => void) | null = null;
  private wasPlayingBeforeInterruption: boolean = false;

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
    console.log("[iOS] Initializing audio session...");

    // 设置可见性监听
    this.setupVisibilityListener();

    // 监听第一次用户交互来创建 AudioContext
    this.setupFirstInteractionListener();

    this._state = "active";
    this.emit("stateChange", "active");

    console.log("[iOS] Audio session initialized, HLS mode:", this.isHlsMode);
  }

  /**
   * 获取流媒体 URL
   * iOS Safari 与 PWA 统一使用 HLS。
   */
  getStreamUrl(songId: string): string {
    const hlsQuality = mapIOSHLSQualityToQuery(loadIOSHLSQuality());
    return getAuthenticatedStreamUrl(songId, this.isHlsMode, hlsQuality);
  }

  /**
   * 准备播放
   */
  async preparePlayback(
    audioElement: HTMLAudioElement,
    songId: string,
  ): Promise<void> {
    console.log("[iOS] Preparing playback for song:", songId);

    // 确保 AudioContext 处于活跃状态
    await this.wakeUpAudioContext();

    const url = this.getStreamUrl(songId);
    const urlWithCacheBust = this.addCacheBust(url);

    audioElement.src = urlWithCacheBust;

    if (this.isHlsMode) {
      // HLS 需要显式 load
      audioElement.load();
    }

    this._state = "active";

    // 更新当前歌曲 ID
    this.currentSongId = songId;

    // 触发 HLS 预缓存（如果有下一首歌）
    if (this.hlsPrefetchService && this.nextSongId) {
      this.hlsPrefetchService.onSongStart(songId, this.nextSongId);
    }
  }

  /**
   * 设置 HLS 预缓存服务引用
   * Requirements: 1.1, 1.7
   */
  setHLSPrefetchService(service: HLSPrefetchService): void {
    this.hlsPrefetchService = service;
    console.log("[iOS] HLS prefetch service set");
  }

  /**
   * 当歌曲开始播放时触发预缓存
   * Requirements: 1.1, 1.7
   *
   * @param currentSongId - 当前播放的歌曲 ID
   * @param nextSongId - 队列中下一首歌的 ID（如果没有则为 null）
   */
  onSongStart(currentSongId: string, nextSongId: string | null): void {
    this.currentSongId = currentSongId;
    this.nextSongId = nextSongId;

    if (this.hlsPrefetchService) {
      this.hlsPrefetchService.onSongStart(currentSongId, nextSongId);
    }
  }

  /**
   * 更新下一首歌曲 ID（队列变化时调用）
   * Requirements: 1.6
   */
  setNextSongId(nextSongId: string | null): void {
    this.nextSongId = nextSongId;

    if (this.hlsPrefetchService) {
      this.hlsPrefetchService.onQueueChange(nextSongId);
    }
  }

  /**
   * 恢复播放 (用户交互后)
   */
  async resumePlayback(audioElement: HTMLAudioElement): Promise<boolean> {
    console.log("[iOS] Resuming playback...");

    // iOS PWA 特殊处理：先唤醒 AudioContext
    await this.wakeUpAudioContext();

    try {
      await audioElement.play();

      // iOS PWA 检测是否真的在播放
      if (this.platformInfo.isPWA) {
        const isActuallyPlaying = await this.verifyPlayback(audioElement);
        if (!isActuallyPlaying) {
          console.warn(
            "[iOS] Playback verification failed - session may be frozen",
          );
          this.sessionFrozen = true;
          this._state = "interrupted";
          this.emit("sessionFrozen");
          return false;
        }
      }

      this.sessionFrozen = false;
      this._state = "active";
      return true;
    } catch (error) {
      if ((error as Error).name === "NotAllowedError") {
        console.log("[iOS] NotAllowedError - needs user interaction");
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
    console.error("[iOS] Playback error:", error);

    // 尝试重新唤醒 AudioContext
    try {
      await this.wakeUpAudioContext();

      // 如果是 HLS 模式，尝试重新加载
      if (this.isHlsMode && audioElement.src) {
        console.log("[iOS] Attempting to reload HLS stream...");
        audioElement.load();
        await audioElement.play();
        return true;
      }
    } catch (recoveryError) {
      console.error("[iOS] Recovery failed:", recoveryError);
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
   * 清理资源
   */
  cleanup(): void {
    console.log("[iOS] Cleaning up audio session...");

    // 移除可见性监听
    if (this.visibilityCleanup) {
      this.visibilityCleanup();
      this.visibilityCleanup = null;
    }

    // 关闭 AudioContext
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // 忽略关闭错误
      }
      this.audioContext = null;
    }

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
          console.error(`[iOS] Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 添加缓存破坏参数
   */
  private addCacheBust(url: string): string {
    try {
      const origin =
        typeof window !== "undefined" && window.location?.origin
          ? window.location.origin
          : "http://localhost";
      const parsed = new URL(url, origin);
      if (
        parsed.pathname.endsWith(".m3u8") ||
        parsed.pathname.includes("playlist.m3u8")
      ) {
        return url;
      }
    } catch {
      // Ignore parse failures and fall back to the raw URL.
    }

    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}_t=${Date.now()}`;
  }

  /**
   * 获取或创建 AudioContext
   */
  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return null;

    // 检查现有的 AudioContext 是否有效
    if (this.audioContext && !this.isAudioContextValid(this.audioContext)) {
      console.log(
        "[iOS] Existing AudioContext is invalid, will create new one",
      );
      this.audioContext = null;
    }

    // 如果标记为可能失效，尝试验证
    if (this.audioContext && this.audioContextMayBeInvalid) {
      console.log(
        "[iOS] AudioContext may be invalid after PWA resume, checking...",
      );
      if (this.audioContext.state === "closed") {
        console.log("[iOS] AudioContext is closed, creating new one");
        this.audioContext = null;
      }
      this.audioContextMayBeInvalid = false;
    }

    if (!this.audioContext) {
      try {
        this.audioContext = new AudioContextClass();
        console.log(
          "[iOS] Created AudioContext, state:",
          this.audioContext.state,
        );
      } catch (e) {
        console.warn("[iOS] Failed to create AudioContext:", e);
        return null;
      }
    }

    return this.audioContext;
  }

  /**
   * 检查 AudioContext 是否有效
   */
  private isAudioContextValid(ctx: AudioContext | null): boolean {
    if (!ctx) return false;
    if (ctx.state === "closed") return false;
    return true;
  }

  /**
   * 唤醒音频上下文 - 必须在用户手势中调用
   */
  private async wakeUpAudioContext(): Promise<boolean> {
    const ctx = this.getAudioContext();
    if (!ctx) return false;

    try {
      // 如果 AudioContext 被挂起，恢复它
      if (ctx.state === "suspended") {
        console.log("[iOS] Resuming suspended AudioContext...");
        await ctx.resume();
        console.log("[iOS] AudioContext resumed, state:", ctx.state);
      }

      // 播放一个静音的短音频来"激活"音频会话
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      console.log("[iOS] Silent buffer played to activate session");
      return true;
    } catch (e) {
      console.warn("[iOS] Failed to wake up audio session:", e);
      return false;
    }
  }

  /**
   * 验证播放是否真的在进行
   * iOS PWA 有时会假装在播放但实际没有声音
   */
  private async verifyPlayback(
    audioElement: HTMLAudioElement,
  ): Promise<boolean> {
    const t1 = audioElement.currentTime;
    await new Promise((resolve) => setTimeout(resolve, PLAYBACK_VERIFY_DELAY));
    const t2 = audioElement.currentTime;

    // 如果时间有进展或者已暂停，认为播放正常
    return t2 - t1 > 0.05 || audioElement.paused;
  }

  /**
   * 设置可见性监听器
   */
  private setupVisibilityListener(): void {
    if (typeof document === "undefined") return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        this.lastHiddenTimestamp = Date.now();
        console.log("[iOS] Page hidden at:", this.lastHiddenTimestamp);
        this.emit("backgroundEnter");
      } else if (document.visibilityState === "visible") {
        console.log("[iOS] Page became visible");

        // 标记 AudioContext 可能已失效
        this.audioContextMayBeInvalid = true;

        // 如果可能被杀后台了，清除音频缓存
        if (this.mayHaveBeenKilled()) {
          console.log(
            "[iOS] PWA may have been killed, clearing audio cache...",
          );
          await this.clearAudioCache();
        }

        // 检查 AudioContext 状态
        const ctx = this.getAudioContext();
        if (ctx && ctx.state === "suspended") {
          console.log(
            "[iOS] AudioContext suspended after resume, will need user interaction",
          );
          this._state = "suspended";
          this.emit("stateChange", "suspended");
        }

        this.emit("backgroundExit");

        // 如果之前会话是冻结的，尝试恢复
        if (this.sessionFrozen) {
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
   * 设置第一次用户交互监听
   */
  private setupFirstInteractionListener(): void {
    if (typeof document === "undefined") return;

    const handleFirstInteraction = () => {
      console.log("[iOS] First user interaction detected");
      this.getAudioContext();

      document.removeEventListener("touchstart", handleFirstInteraction);
      document.removeEventListener("click", handleFirstInteraction);
    };

    document.addEventListener("touchstart", handleFirstInteraction, {
      once: true,
      passive: true,
    });
    document.addEventListener("click", handleFirstInteraction, { once: true });
  }

  /**
   * 检查是否可能被杀后台了
   */
  private mayHaveBeenKilled(): boolean {
    if (this.lastHiddenTimestamp === 0) return false;
    const hiddenDuration = Date.now() - this.lastHiddenTimestamp;
    const maybeKilled = hiddenDuration > BACKGROUND_KILL_THRESHOLD;
    console.log(
      "[iOS] Hidden duration:",
      hiddenDuration,
      "ms, maybeKilled:",
      maybeKilled,
    );
    return maybeKilled;
  }

  /**
   * 清除音频缓存
   */
  private async clearAudioCache(): Promise<void> {
    if (!this.platformInfo.isPWA) return;

    console.log("[iOS] Clearing audio cache...");

    try {
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        for (const cacheName of cacheNames) {
          const cache = await caches.open(cacheName);
          const requests = await cache.keys();

          for (const request of requests) {
            // 只清除音频相关的缓存
            if (
              request.url.includes("/api/stream/") ||
              request.url.includes(".m3u8") ||
              request.url.includes(".ts") ||
              request.url.includes(".m4s") ||
              request.url.includes("/init.mp4")
            ) {
              await cache.delete(request);
              console.log("[iOS] Deleted cache:", request.url.slice(-50));
            }
          }
        }
      }

      console.log("[iOS] Audio cache cleared");
    } catch (e) {
      console.warn("[iOS] Failed to clear audio cache:", e);
    }
  }

  // ==================== 公共辅助方法 ====================

  /**
   * 检查音频会话是否处于活跃状态
   */
  isAudioSessionActive(): boolean {
    const ctx = this.getAudioContext();
    return ctx !== null && ctx.state === "running";
  }

  /**
   * 获取音频会话状态（用于调试）
   */
  getAudioSessionState(): string {
    const ctx = this.getAudioContext();
    if (!ctx) return "no-context";
    return ctx.state;
  }

  /**
   * 强制重新创建 AudioContext
   */
  recreateAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) return null;

    // 关闭旧的 AudioContext
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        // 忽略关闭错误
      }
      this.audioContext = null;
    }

    try {
      this.audioContext = new AudioContextClass();
      console.log(
        "[iOS] Recreated AudioContext, state:",
        this.audioContext.state,
      );
      return this.audioContext;
    } catch (e) {
      console.warn("[iOS] Failed to recreate AudioContext:", e);
      return null;
    }
  }

  // ==================== Media Session 恢复方法 ====================

  /**
   * 处理 Media Session play action
   * 确保从 iOS 控制中心可以正确恢复播放
   * Requirements: 3.1, 3.2, 3.3
   *
   * @param audioElement - 音频元素
   * @returns Promise<boolean> - 是否成功恢复播放
   */
  async handleMediaSessionPlay(
    audioElement: HTMLAudioElement,
  ): Promise<boolean> {
    console.log("[iOS] Handling Media Session play action...");

    // 1. 检查并重新激活音频上下文
    const audioContextActive = await this.ensureAudioContextActive();
    if (!audioContextActive) {
      console.warn("[iOS] Failed to activate audio context");
    }

    // 2. 检查 audio src 是否有效
    const srcValid = this.isAudioSrcValid(audioElement);

    if (!srcValid) {
      console.log("[iOS] Audio src is invalid, attempting to reload...");

      // 3. 无效时重新加载 HLS 流
      if (this.currentSongId) {
        const reloaded = await this.reloadHLSStream(
          audioElement,
          this.currentSongId,
        );
        if (!reloaded) {
          console.error("[iOS] Failed to reload HLS stream");
          return false;
        }
      } else {
        console.error("[iOS] No current song ID to reload");
        return false;
      }
    }

    // 4. 尝试播放
    try {
      await audioElement.play();
      console.log("[iOS] Media Session play successful");
      this._state = "active";
      return true;
    } catch (error) {
      console.error("[iOS] Media Session play failed:", error);

      // 5. 播放失败时尝试恢复
      if ((error as Error).name === "NotAllowedError") {
        console.log("[iOS] NotAllowedError - needs user interaction");
        return false;
      }

      // 尝试重新加载并播放
      if (this.currentSongId) {
        return this.attemptRecovery(audioElement, this.currentSongId);
      }

      return false;
    }
  }

  /**
   * 检查并确保音频上下文处于活跃状态
   * Requirements: 3.2
   *
   * @returns Promise<boolean> - 音频上下文是否活跃
   */
  async ensureAudioContextActive(): Promise<boolean> {
    const ctx = this.getAudioContext();

    if (!ctx) {
      console.log("[iOS] No AudioContext, attempting to create...");
      const newCtx = this.recreateAudioContext();
      return newCtx !== null && newCtx.state === "running";
    }

    if (ctx.state === "suspended") {
      console.log("[iOS] AudioContext suspended, resuming...");
      try {
        await ctx.resume();
        const resumedState = String(ctx.state);
        console.log("[iOS] AudioContext resumed, state:", resumedState);
        return resumedState === "running";
      } catch (e) {
        console.warn("[iOS] Failed to resume AudioContext:", e);
        return false;
      }
    }

    if (ctx.state === "closed") {
      console.log("[iOS] AudioContext closed, recreating...");
      const newCtx = this.recreateAudioContext();
      return newCtx !== null && newCtx.state !== "closed";
    }

    return ctx.state === "running";
  }

  /**
   * 检查 audio src 是否有效
   * Requirements: 3.3
   *
   * @param audioElement - 音频元素
   * @returns boolean - src 是否有效
   */
  private isAudioSrcValid(audioElement: HTMLAudioElement): boolean {
    const src = audioElement.src;

    // 没有 src
    if (!src || src === "") {
      return false;
    }

    // blob URL 可能已失效
    if (src.startsWith("blob:")) {
      // 检查 readyState，如果为 0 说明 blob 可能已失效
      if (audioElement.readyState === 0 && audioElement.networkState === 0) {
        return false;
      }
    }

    // 检查是否是当前歌曲的 URL
    if (this.currentSongId && this.isHlsMode) {
      const expectedPath = `/api/stream/${this.currentSongId}/playlist.m3u8`;
      try {
        const srcUrl = new URL(src, window.location.origin);
        if (
          !srcUrl.pathname.includes(expectedPath.replace("/playlist.m3u8", ""))
        ) {
          return false;
        }
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * 重新加载 HLS 流
   * Requirements: 3.3
   *
   * @param audioElement - 音频元素
   * @param songId - 歌曲 ID
   * @returns Promise<boolean> - 是否成功加载
   */
  private async reloadHLSStream(
    audioElement: HTMLAudioElement,
    songId: string,
  ): Promise<boolean> {
    console.log("[iOS] Reloading HLS stream for song:", songId);

    try {
      const url = this.getStreamUrl(songId);
      const urlWithCacheBust = this.addCacheBust(url);

      audioElement.src = urlWithCacheBust;
      audioElement.load();

      // 等待加载完成
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Load timeout"));
        }, 10000);

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
          reject(new Error("Load error"));
        };

        audioElement.addEventListener("canplay", onCanPlay, { once: true });
        audioElement.addEventListener("error", onError, { once: true });
      });

      console.log("[iOS] HLS stream reloaded successfully");
      return true;
    } catch (error) {
      console.error("[iOS] Failed to reload HLS stream:", error);
      return false;
    }
  }

  /**
   * 尝试恢复播放
   * Requirements: 3.5
   *
   * @param audioElement - 音频元素
   * @param songId - 歌曲 ID
   * @returns Promise<boolean> - 是否成功恢复
   */
  private async attemptRecovery(
    audioElement: HTMLAudioElement,
    songId: string,
  ): Promise<boolean> {
    console.log("[iOS] Attempting playback recovery...");

    // 重新唤醒音频上下文
    await this.wakeUpAudioContext();

    // 重新加载 HLS 流
    const reloaded = await this.reloadHLSStream(audioElement, songId);
    if (!reloaded) {
      return false;
    }

    // 尝试播放
    try {
      await audioElement.play();
      console.log("[iOS] Recovery successful");
      this._state = "active";
      return true;
    } catch (error) {
      console.error("[iOS] Recovery failed:", error);
      return false;
    }
  }

  // ==================== Media Session 状态同步方法 ====================

  /**
   * 更新 Media Session 播放状态
   * Requirements: 4.1
   *
   * @param isPlaying - 是否正在播放
   */
  updatePlaybackState(isPlaying: boolean): void {
    if (!isMediaSessionSupported()) return;

    try {
      navigator.mediaSession.playbackState = getPlaybackState(isPlaying);
      console.log(
        "[iOS] Media Session playback state updated:",
        isPlaying ? "playing" : "paused",
      );
    } catch (error) {
      console.warn(
        "[iOS] Failed to update Media Session playback state:",
        error,
      );
    }
  }

  /**
   * 更新 Media Session 位置状态
   * Requirements: 4.1
   *
   * @param progress - 当前播放位置（秒）
   * @param duration - 总时长（秒）
   * @param playbackRate - 播放速率（默认 1）
   */
  updatePositionState(
    progress: number,
    duration: number,
    playbackRate: number = 1,
  ): void {
    if (!isMediaSessionSupported()) return;

    // 验证参数有效性
    if (!isFinite(progress) || !isFinite(duration) || duration <= 0) {
      return;
    }

    try {
      const positionState = createPositionState(
        progress,
        duration,
        playbackRate,
      );
      navigator.mediaSession.setPositionState(positionState);
      this.lastPositionUpdateTime = Date.now();
    } catch (error) {
      console.warn(
        "[iOS] Failed to update Media Session position state:",
        error,
      );
    }
  }

  /**
   * 更新 Media Session 元数据
   * Requirements: 4.2
   *
   * @param song - 歌曲信息
   */
  async updateMetadata(song: Song): Promise<void> {
    if (!isMediaSessionSupported()) return;

    this.currentSong = song;

    try {
      const metadata = await createMediaMetadataWithOfflineSupport(song);
      navigator.mediaSession.metadata = metadata;
      this.lastMetadataUpdateTime = Date.now();
      console.log("[iOS] Media Session metadata updated for:", song.name);
    } catch (error) {
      console.warn("[iOS] Failed to update Media Session metadata:", error);
    }
  }

  /**
   * 同步 Media Session 状态（播放状态变化时调用）
   * Requirements: 4.1, 4.2
   *
   * 确保 playback state 变化时更新 position state
   *
   * @param isPlaying - 是否正在播放
   * @param progress - 当前播放位置（秒）
   * @param duration - 总时长（秒）
   */
  syncMediaSessionState(
    isPlaying: boolean,
    progress: number,
    duration: number,
  ): void {
    // 更新播放状态
    this.updatePlaybackState(isPlaying);

    // 同时更新位置状态
    this.updatePositionState(progress, duration);
  }

  /**
   * 歌曲变化时同步 Media Session
   * Requirements: 4.1, 4.2
   *
   * 确保歌曲变化时立即更新 metadata 和 position state
   *
   * @param song - 新歌曲信息
   * @param progress - 初始播放位置（秒）
   * @param duration - 总时长（秒）
   */
  async onSongChange(
    song: Song,
    progress: number = 0,
    duration: number = 0,
  ): Promise<void> {
    // 立即更新元数据
    await this.updateMetadata(song);

    // 更新位置状态
    if (duration > 0) {
      this.updatePositionState(progress, duration);
    }

    // 更新当前歌曲 ID
    this.currentSongId = song.id;
  }

  /**
   * 获取上次位置状态更新时间
   * 用于测试验证更新是否在 100ms 内完成
   */
  getLastPositionUpdateTime(): number {
    return this.lastPositionUpdateTime;
  }

  /**
   * 获取上次元数据更新时间
   * 用于测试验证更新是否在 100ms 内完成
   */
  getLastMetadataUpdateTime(): number {
    return this.lastMetadataUpdateTime;
  }

  // ==================== 音频会话中断处理方法 ====================

  /**
   * 设置音频会话中断监听
   * Requirements: 6.5
   *
   * iOS 音频会话中断事件包括：
   * - 来电
   * - 其他应用播放音频
   * - Siri 激活
   *
   * @param audioElement - 音频元素
   */
  setupAudioInterruptionHandler(audioElement: HTMLAudioElement): void {
    if (typeof document === "undefined") return;

    // 移除旧的监听器
    this.removeAudioInterruptionHandler(audioElement);

    // iOS 使用 visibilitychange 和 audio 元素的 pause/play 事件来检测中断
    // 因为 Web Audio API 没有直接的中断事件

    this.audioInterruptionHandler = () => {
      // 当音频被系统暂停时（如来电）
      if (audioElement.paused && this.wasPlayingBeforeInterruption) {
        console.log("[iOS] Audio session interrupted");
        this._state = "interrupted";
        this.emit("stateChange", "interrupted");
      }
    };

    // 监听 pause 事件来检测中断
    audioElement.addEventListener("pause", this.audioInterruptionHandler);

    console.log("[iOS] Audio interruption handler set up");
  }

  /**
   * 移除音频会话中断监听
   *
   * @param audioElement - 音频元素
   */
  removeAudioInterruptionHandler(audioElement: HTMLAudioElement): void {
    if (this.audioInterruptionHandler) {
      audioElement.removeEventListener("pause", this.audioInterruptionHandler);
      this.audioInterruptionHandler = null;
    }
  }

  /**
   * 处理音频会话中断
   * Requirements: 6.5
   *
   * @param interrupted - 是否被中断
   * @param audioElement - 音频元素（可选，用于恢复播放）
   */
  handleAudioInterruption(
    interrupted: boolean,
    audioElement?: HTMLAudioElement,
  ): void {
    if (interrupted) {
      // 记录中断前的播放状态
      if (audioElement) {
        this.wasPlayingBeforeInterruption = !audioElement.paused;
      }

      console.log(
        "[iOS] Audio session interrupted, was playing:",
        this.wasPlayingBeforeInterruption,
      );
      this._state = "interrupted";
      this.emit("stateChange", "interrupted");
    } else {
      // 中断结束
      console.log("[iOS] Audio session interruption ended");

      // 如果中断前正在播放，尝试恢复
      if (this.wasPlayingBeforeInterruption && audioElement) {
        this.attemptResumeAfterInterruption(audioElement);
      }

      this._state = "active";
      this.emit("stateChange", "active");
    }
  }

  /**
   * 中断结束后尝试恢复播放
   * Requirements: 6.5
   *
   * @param audioElement - 音频元素
   */
  private async attemptResumeAfterInterruption(
    audioElement: HTMLAudioElement,
  ): Promise<void> {
    console.log("[iOS] Attempting to resume playback after interruption...");

    try {
      // 先唤醒音频上下文
      await this.wakeUpAudioContext();

      // 尝试播放
      await audioElement.play();

      console.log("[iOS] Playback resumed after interruption");
      this.wasPlayingBeforeInterruption = false;
    } catch (error) {
      console.warn(
        "[iOS] Failed to resume playback after interruption:",
        error,
      );

      // 如果是 NotAllowedError，需要用户交互
      if ((error as Error).name === "NotAllowedError") {
        console.log("[iOS] User interaction required to resume playback");
        this.emit("needsUserInteraction");
      }
    }
  }

  /**
   * 标记播放状态（用于中断恢复）
   *
   * @param isPlaying - 是否正在播放
   */
  setPlayingState(isPlaying: boolean): void {
    this.wasPlayingBeforeInterruption = isPlaying;
  }

  /**
   * 获取中断前是否正在播放
   */
  wasPlayingBeforeInterrupt(): boolean {
    return this.wasPlayingBeforeInterruption;
  }
}
