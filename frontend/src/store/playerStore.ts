import { create } from "zustand";
import { Song } from "../types";
import {
  getPlaybackState,
  savePlaybackState as savePlaybackStateAPI,
  savePlaybackProgress as savePlaybackProgressAPI,
  DownloadStatus,
} from "../api";
import { audioPreloader } from "../utils/audioPreloader";
import { useOfflineCacheStore } from "./offlineCacheStore";
import { usePlayHistoryStore } from "./playHistoryStore";
import { useToastStore } from "./toastStore";
import {
  getAudioSessionManager,
  getHlsPlaybackPreference,
  resetAudioSessionManager,
  setHlsPlaybackPreference,
  type IAudioSessionManager,
} from "../utils/audioSession";
import { AndroidAudioSession } from "../utils/audioSession/android";
import { iOSAudioSession } from "../utils/audioSession/ios";
import { debugLog, debugError } from "../components/mobile/MobileDebugPanel";
import { offlineCacheService } from "../services/offlineCacheService";
import { getManualOfflineMode } from "../hooks/useOnlineStatus";
import {
  startKeepAlive,
  stopKeepAlive,
  initKeepAliveOnUserGesture,
} from "../utils/audioKeepAlive";
import { hlsPrefetchService } from "../services/hlsPrefetchService";
import { preloadMediaMetadata } from "../utils/mediaSession";
import {
  buildPlaybackStreamUrl,
  loadIOSHLSQuality,
  loadDesktopTranscodeQuality,
  normalizePlaybackStreamUrl,
  saveIOSHLSQuality,
  saveDesktopTranscodeQuality,
  type IOSHLSQuality,
  type DesktopTranscodeQuality,
} from "../utils/playbackQuality";
import {
  clearManagedAudioSource,
  getManagedAudioSourceUrl,
  setManagedAudioSource,
} from "../utils/audioElementSource";

// AudioSessionManager 单例实例
let sessionManager: IAudioSessionManager | null = null;

// 是否已设置后台事件监听
let backgroundListenerSetup = false;

/**
 * 获取 AudioSessionManager 实例
 * 延迟初始化，确保在浏览器环境中使用
 */
function getSessionManager(): IAudioSessionManager {
  if (!sessionManager) {
    sessionManager = getAudioSessionManager();
    // 初始化会话管理器
    sessionManager.initialize().catch((err) => {
      console.error(
        "[PlayerStore] Failed to initialize AudioSessionManager:",
        err,
      );
    });

    // 为 Android 平台设置后台事件监听
    if (sessionManager.platform === "android" && !backgroundListenerSetup) {
      setupAndroidBackgroundListener(sessionManager as AndroidAudioSession);
      backgroundListenerSetup = true;
    }

    // 为 iOS 平台设置 HLS 预缓存服务
    // Requirements: 1.1, 1.7
    if (sessionManager.platform === "ios" && !backgroundListenerSetup) {
      setupIOSHLSPrefetch(sessionManager as iOSAudioSession);
      backgroundListenerSetup = true;
    }
  }
  return sessionManager;
}

/**
 * 设置 Android 后台事件监听
 * 当进入后台时，预缓存队列中的歌曲到 Service Worker
 */
function setupAndroidBackgroundListener(manager: AndroidAudioSession): void {
  manager.on("backgroundEnter", () => {
    console.log(
      "[PlayerStore] Android entering background, triggering SW prefetch...",
    );

    // 获取当前播放状态
    const state = usePlayerStore.getState();
    const { queue, queueIndex } = state;

    // 获取接下来要播放的歌曲 ID
    const upcomingSongIds = queue
      .slice(queueIndex + 1, queueIndex + 6) // 预缓存接下来 5 首
      .map((song) => song.id);

    if (upcomingSongIds.length > 0) {
      // 触发 Service Worker 预缓存
      manager.onEnterBackground(upcomingSongIds);
    }
  });

  console.log("[PlayerStore] Android background listener setup complete");
}

/**
 * 设置 iOS HLS 预缓存服务
 * 将 HLSPrefetchService 注入到 iOSAudioSession
 * Requirements: 1.1, 1.7
 */
function setupIOSHLSPrefetch(manager: iOSAudioSession): void {
  // 将 HLS 预缓存服务注入到 iOS 音频会话管理器
  manager.setHLSPrefetchService(hlsPrefetchService);
  console.log("[PlayerStore] iOS HLS prefetch service setup complete");
}

/**
 * 检查音频会话是否处于冻结状态
 * 通过 AudioSessionManager 的状态来判断
 */
export function isAudioSessionFrozen(): boolean {
  const manager = getSessionManager();
  return manager.state === "interrupted" || manager.state === "suspended";
}

// 向后兼容的导出（已废弃，使用 AudioSessionManager 事件代替）
/** @deprecated 使用 isAudioSessionFrozen() 代替 */
export function isIOSAudioSessionFrozen(): boolean {
  return isAudioSessionFrozen();
}

/** @deprecated 由 AudioSessionManager 内部管理 */
export function markIOSAudioSessionFrozen(): void {
  // 由 AudioSessionManager 内部管理，此函数保留用于向后兼容
  debugLog("[PlayerStore] markIOSAudioSessionFrozen called (deprecated)");
}

/** @deprecated 由 AudioSessionManager 内部管理 */
export function clearIOSAudioSessionFrozen(): void {
  // 由 AudioSessionManager 内部管理，此函数保留用于向后兼容
  debugLog("[PlayerStore] clearIOSAudioSessionFrozen called (deprecated)");
}

// Default prefetch count (can be overridden by server settings)
const DEFAULT_PREFETCH_COUNT = 3;

// Frontend preload count (how many songs to preload in browser memory)
const FRONTEND_PRELOAD_COUNT = 1;

// Cache-busting helper to force fresh audio requests (helps PWA resume)
const withCacheBust = (url: string): string => {
  try {
    const parsed = new URL(url, "http://localhost");
    if (
      parsed.pathname.endsWith(".m3u8") ||
      parsed.pathname.includes("playlist.m3u8")
    ) {
      return url;
    }
  } catch {
    // Ignore parse failures and fall back to the raw URL.
  }

  return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
};

// Fade out duration in milliseconds (prevents audio pop/click when switching tracks)
const FADE_OUT_DURATION = 50;
const FADE_STEPS = 10;

/**
 * Fade out audio volume to prevent pop/click sound when switching tracks
 * @param audioRef The audio element to fade out
 * @returns The original volume before fade out
 */
async function fadeOutAudio(audioRef: HTMLAudioElement): Promise<number> {
  const originalVolume = audioRef.volume;
  if (originalVolume === 0 || audioRef.paused) {
    return originalVolume;
  }

  const stepDuration = FADE_OUT_DURATION / FADE_STEPS;
  for (let i = FADE_STEPS - 1; i >= 0; i--) {
    audioRef.volume = originalVolume * (i / FADE_STEPS);
    await new Promise((resolve) => setTimeout(resolve, stepDuration));
  }
  audioRef.volume = 0;
  return originalVolume;
}

/**
 * Fade in audio volume after switching tracks
 * @param audioRef The audio element to fade in
 * @param targetVolume The target volume to fade in to
 */
async function fadeInAudio(
  audioRef: HTMLAudioElement,
  targetVolume: number,
): Promise<void> {
  if (targetVolume === 0) {
    return;
  }

  const stepDuration = FADE_OUT_DURATION / FADE_STEPS;
  for (let i = 1; i <= FADE_STEPS; i++) {
    audioRef.volume = targetVolume * (i / FADE_STEPS);
    await new Promise((resolve) => setTimeout(resolve, stepDuration));
  }
  audioRef.volume = targetVolume;
}

// Type for NowPlayingView section
export type NowPlayingSectionType = "lyrics" | "artist" | "queue";

// Play mode type: sequential (stop at end), loop (repeat queue), single (repeat one song)
export type PlayMode = "sequential" | "loop" | "single";

// Queue source type: tracks where the current queue originated from
export interface QueueSource {
  type:
    | "playlist"
    | "album"
    | "artist"
    | "liked-songs"
    | "search"
    | "single"
    | "daily-mix"
    | "profile-top-tracks"
    | "recently-played"
    | "nostalgic"
    | null;
  id: string | null;
  name?: string; // Display name of the source (playlist name, album name, etc.)
  variant?: "featured" | "library";
}

// localStorage keys for preferences
const TRANSLATION_PREFERENCE_KEY = "lyrics-translation-enabled";
const TRANSLITERATION_PREFERENCE_KEY = "lyrics-transliteration-enabled";
const LEFT_PANEL_WIDTH_KEY = "left-panel-width";
const RIGHT_PANEL_WIDTH_KEY = "right-panel-width";
const SHOW_NOW_PLAYING_KEY = "show-now-playing";
const EXPANDED_LYRICS_KEY = "owl_expanded_lyrics";

// Helper functions for localStorage
const loadTranslationPreference = (): boolean => {
  try {
    const saved = localStorage.getItem(TRANSLATION_PREFERENCE_KEY);
    if (saved === null) return true; // Default to enabled
    return saved === "true";
  } catch {
    return true; // Default to enabled if localStorage unavailable
  }
};

const saveTranslationPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(TRANSLATION_PREFERENCE_KEY, String(enabled));
  } catch {
    // Ignore if localStorage unavailable
  }
};

const loadTransliterationPreference = (): boolean => {
  try {
    const saved = localStorage.getItem(TRANSLITERATION_PREFERENCE_KEY);
    if (saved === null) return false; // Default to disabled
    return saved === "true";
  } catch {
    return false; // Default to disabled if localStorage unavailable
  }
};

const saveTransliterationPreference = (enabled: boolean): void => {
  try {
    localStorage.setItem(TRANSLITERATION_PREFERENCE_KEY, String(enabled));
  } catch {
    // Ignore if localStorage unavailable
  }
};

// Panel width persistence helpers
const loadLeftPanelWidth = (): number => {
  try {
    const saved = localStorage.getItem(LEFT_PANEL_WIDTH_KEY);
    if (saved === null) return 280; // Default width
    const width = parseInt(saved, 10);
    return isNaN(width) ? 280 : width;
  } catch {
    return 280;
  }
};

const saveLeftPanelWidth = (width: number): void => {
  try {
    localStorage.setItem(LEFT_PANEL_WIDTH_KEY, String(width));
  } catch {
    // Ignore if localStorage unavailable
  }
};

const loadRightPanelWidth = (): number => {
  try {
    const saved = localStorage.getItem(RIGHT_PANEL_WIDTH_KEY);
    if (saved === null) return 320; // Default width
    const width = parseInt(saved, 10);
    return isNaN(width) ? 320 : width;
  } catch {
    return 320;
  }
};

const saveRightPanelWidth = (width: number): void => {
  try {
    localStorage.setItem(RIGHT_PANEL_WIDTH_KEY, String(width));
  } catch {
    // Ignore if localStorage unavailable
  }
};

const loadShowNowPlaying = (): boolean => {
  try {
    const saved = localStorage.getItem(SHOW_NOW_PLAYING_KEY);
    if (saved === null) return false; // Default to hidden
    return saved === "true";
  } catch {
    return false;
  }
};

const saveShowNowPlaying = (show: boolean): void => {
  try {
    localStorage.setItem(SHOW_NOW_PLAYING_KEY, String(show));
  } catch {
    // Ignore if localStorage unavailable
  }
};

// Expanded lyrics mode persistence helpers
const loadExpandedLyricsMode = (): boolean => {
  try {
    const saved = localStorage.getItem(EXPANDED_LYRICS_KEY);
    return saved === "true";
  } catch {
    return false;
  }
};

const saveExpandedLyricsMode = (expanded: boolean): void => {
  try {
    localStorage.setItem(EXPANDED_LYRICS_KEY, String(expanded));
  } catch {
    // Ignore if localStorage unavailable
  }
};

interface PlayerState {
  // Current playback state
  currentSong: Song | null;
  isPlaying: boolean;
  volume: number; // 0-100
  progress: number; // current time in seconds
  duration: number; // total duration in seconds
  playHistoryRecorded: boolean; // Whether play history has been recorded for current song
  accumulatedPlayTime: number; // Accumulated actual play time in seconds (for play history threshold)
  lastProgressUpdate: number; // Last progress value for calculating delta
  lastProgressUIUpdate: number; // Last time progress was updated for UI (for debouncing)

  // Play mode and shuffle state
  playMode: PlayMode;
  isShuffled: boolean;

  // Queue management
  queue: Song[]; // Current display queue (points to original or shuffled)
  queueIndex: number;
  originalQueue: Song[]; // Original order queue
  shuffledQueue: Song[]; // Shuffled order queue
  queueSource: QueueSource; // Source of the current queue (playlist, album, artist, etc.)

  // Playback state hydration
  // Used by persistence hook to avoid immediately saving back server-hydrated state.
  skipNextPlaybackStateSave: boolean;

  // Prefetch state
  prefetchStatuses: Record<string, DownloadStatus>;
  prefetchCount: number;
  hlsModeEnabled: boolean;
  iosHlsQuality: IOSHLSQuality;
  desktopTranscodeQuality: DesktopTranscodeQuality;

  // Mini player state
  isMiniPlayerActive: boolean;

  // UI State
  showNowPlaying: boolean;
  nowPlayingSection: NowPlayingSectionType;
  showLyrics: boolean;
  showQueue: boolean;
  showTranslation: boolean;
  showTransliteration: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;

  // Expanded lyrics mode state
  expandedLyricsMode: boolean;
  previousNowPlayingSection: NowPlayingSectionType | null;
  lyricsVisible: boolean; // Whether lyrics (expanded or normal) is currently visible

  // Fullscreen now-playing overlay state
  showFullscreenView: boolean;
  fullscreenLyricsMode: boolean; // true = lyrics view, false = artwork/info view

  // Sleep timer state
  sleepTimerEndTime: number | null; // Unix timestamp when timer should trigger, null if not set
  sleepTimerMode: "time" | "endOfTrack" | null; // Timer mode: time-based or end of current track

  // Loading and error state (新增)
  isLoading: boolean;
  loadingMessage: string | null;
  playbackError: string | null;
  retryCount: number;

  // Audio element reference
  audioRef: HTMLAudioElement | null;

  // Actions
  setAudioRef: (ref: HTMLAudioElement | null) => void;
  syncProgressFromAudio: () => void;
  restoreAudioAfterResume: () => void;
  playSong: (song: Song) => Promise<void>;
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  seek: (position: number) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  next: () => void;
  previous: () => void;
  setQueue: (songs: Song[], startIndex?: number, source?: QueueSource) => void;
  addToQueue: (song: Song) => void;
  addSongsToQueue: (songs: Song[]) => void;
  clearQueue: () => void;

  // Play mode and shuffle actions
  togglePlayMode: () => void;
  toggleShuffle: () => void;

  // Queue operation actions
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  playFromQueue: (index: number) => void;
  playNext: (song: Song) => void;
  removeFromQueue: (index: number) => void;

  // Playback state persistence actions
  loadPlaybackState: () => Promise<void>;
  savePlaybackState: () => Promise<void>;
  savePlaybackProgress: () => Promise<void>;

  // Prefetch actions (backend)
  triggerPrefetch: () => void;
  updatePrefetchStatuses: (statuses: Record<string, DownloadStatus>) => void;
  refreshPrefetchStatuses: () => Promise<void>;
  setPrefetchCount: (count: number) => void;
  setHlsModeEnabled: (enabled: boolean) => Promise<void>;
  setIOSHLSQuality: (
    quality: IOSHLSQuality,
    options?: { reloadCurrent?: boolean },
  ) => Promise<void>;
  setDesktopTranscodeQuality: (
    quality: DesktopTranscodeQuality,
  ) => Promise<void>;

  // Frontend preload actions
  triggerFrontendPreload: () => void;

  // UI Actions
  toggleNowPlaying: () => void;
  setNowPlayingSection: (section: NowPlayingSectionType) => void;
  openNowPlayingSection: (section: NowPlayingSectionType) => void;
  toggleLyrics: () => void;
  toggleQueue: () => void;
  toggleTranslation: () => void;
  setShowTranslation: (show: boolean) => void;
  toggleTransliteration: () => void;
  setShowTransliteration: (show: boolean) => void;
  setLeftPanelWidth: (w: number) => void;
  setRightPanelWidth: (w: number) => void;

  // Mini player actions
  setMiniPlayerActive: (active: boolean) => void;

  // Expanded lyrics mode actions
  activateExpandedLyrics: () => void;

  // Sleep timer actions
  setSleepTimer: (minutes: number | "endOfTrack") => void;
  clearSleepTimer: () => void;
  checkSleepTimer: () => void; // Called on progress update to check if timer should trigger
  deactivateExpandedLyrics: () => void;
  toggleLyricsVisibility: () => void;
  setLyricsVisible: (visible: boolean) => void;

  // Fullscreen view actions
  toggleFullscreenView: () => void;
  setFullscreenLyricsMode: (lyrics: boolean) => void;
  closeFullscreenView: () => void;
}

// Clamp volume between 0 and 100
const clampVolume = (v: number): number => Math.max(0, Math.min(100, v));

// Clamp seek position between 0 and duration
const clampSeek = (pos: number, duration: number): number =>
  Math.max(0, Math.min(duration, pos));

const getPlaybackStreamUrl = (
  manager: IAudioSessionManager,
  songId: string,
  desktopTranscodeQuality: DesktopTranscodeQuality,
): string =>
  buildPlaybackStreamUrl(
    manager.getStreamUrl(songId),
    manager.platform,
    desktopTranscodeQuality,
  );

// Fisher-Yates shuffle algorithm
const shuffleArray = <T>(array: T[]): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  currentSong: null,
  isPlaying: false,
  volume: 70,
  progress: 0,
  duration: 0,
  playHistoryRecorded: false,
  accumulatedPlayTime: 0,
  lastProgressUpdate: 0,
  lastProgressUIUpdate: 0,

  // Play mode and shuffle state
  playMode: "sequential",
  isShuffled: false,

  // Mini player state
  isMiniPlayerActive: false,

  // Queue management
  queue: [],
  queueIndex: -1,
  originalQueue: [],
  shuffledQueue: [],
  queueSource: { type: null, id: null },
  skipNextPlaybackStateSave: false,

  // Prefetch state
  prefetchStatuses: {},
  prefetchCount: DEFAULT_PREFETCH_COUNT,
  hlsModeEnabled: getHlsPlaybackPreference(),
  iosHlsQuality: loadIOSHLSQuality(),
  desktopTranscodeQuality: loadDesktopTranscodeQuality(),

  // UI State Initial Values
  showNowPlaying: loadShowNowPlaying(),
  nowPlayingSection: "artist",
  showLyrics: false,
  showQueue: false,
  showTranslation: loadTranslationPreference(),
  showTransliteration: loadTransliterationPreference(),
  leftPanelWidth: loadLeftPanelWidth(),
  rightPanelWidth: loadRightPanelWidth(),

  // Expanded lyrics mode initial values
  expandedLyricsMode: loadExpandedLyricsMode(),
  previousNowPlayingSection: null,
  lyricsVisible: false, // Whether lyrics (expanded or normal) is currently visible

  // Fullscreen view initial values
  showFullscreenView: false,
  fullscreenLyricsMode: false,

  // Sleep timer initial values
  sleepTimerEndTime: null,
  sleepTimerMode: null,

  // Loading and error state (新增)
  isLoading: false,
  loadingMessage: null,
  playbackError: null,
  retryCount: 0,

  audioRef: null,

  setAudioRef: (ref) => set({ audioRef: ref }),

  // Snapshot current progress from the audio element (used when backgrounding)
  syncProgressFromAudio: () => {
    const { audioRef } = get();
    if (!audioRef) return;
    const t = audioRef.currentTime;
    if (!Number.isNaN(t) && isFinite(t)) {
      set({ progress: t, lastProgressUpdate: t });
    }
  },

  // Ensure audio element uses stream URL (not blob) and seeks to stored progress after resume
  // iOS/Android PWA: Only reload audio if actually killed in background
  // If audio is still playing normally, skip reload to avoid interruption
  restoreAudioAfterResume: () => {
    const {
      audioRef,
      currentSong,
      progress,
      isPlaying,
      desktopTranscodeQuality,
    } = get();
    if (!audioRef || !currentSong) return;

    const manager = getSessionManager();
    const expectedSrc = getPlaybackStreamUrl(
      manager,
      currentSong.id,
      desktopTranscodeQuality,
    );
    const managedSrc = getManagedAudioSourceUrl(audioRef);
    const effectiveCurrentSrc = managedSrc || audioRef.src || "";

    let currentSrcKey = "";
    try {
      if (effectiveCurrentSrc) {
        currentSrcKey = normalizePlaybackStreamUrl(effectiveCurrentSrc);
      }
    } catch {
      currentSrcKey = effectiveCurrentSrc;
    }

    let expectedSrcKey = "";
    try {
      expectedSrcKey = normalizePlaybackStreamUrl(expectedSrc);
    } catch {
      expectedSrcKey = expectedSrc;
    }

    // Check if audio is still playing normally (not killed in background)
    // readyState >= 2 means HAVE_CURRENT_DATA - audio has enough data to play
    const audioStillHealthy = !audioRef.paused && audioRef.readyState >= 2;

    // For both iOS and Android: if audio is healthy, skip all recovery
    if (audioStillHealthy) {
      console.log("[Player] Audio still playing normally, skipping reload");
      return;
    }

    // Check if audio was actually playing before we went to background
    // If audio is paused but isPlaying is true, AND readyState is 0, it means we were killed
    const wasKilledInBackground =
      isPlaying && audioRef.paused && audioRef.readyState === 0;

    if (wasKilledInBackground) {
      console.log(
        "[Player] Detected PWA was killed in background, resetting play state",
      );
      // Reset isPlaying so UI shows play button - user needs to tap to resume
      set({ isPlaying: false });
    }

    // Only reload if:
    // 1. No src at all
    // 2. Using non-HLS blob URL (which may be evicted)
    // 3. Wrong song loaded
    const needsReload =
      !effectiveCurrentSrc ||
      (!managedSrc && audioRef.src.startsWith("blob:")) ||
      currentSrcKey !== expectedSrcKey;

    if (needsReload) {
      console.log("[Player] Reloading audio source after resume");
      setManagedAudioSource(audioRef, withCacheBust(expectedSrc));
    }

    const seekTo = () => {
      if (progress > 0 && isFinite(progress)) {
        audioRef.currentTime = progress;
      }
    };

    if (audioRef.readyState >= 1) {
      seekTo();
    } else {
      audioRef.addEventListener(
        "loadedmetadata",
        function onLoaded() {
          seekTo();
          audioRef.removeEventListener("loadedmetadata", onLoaded);
        },
        { once: true },
      );
    }
  },

  playSong: async (song) => {
    const {
      audioRef,
      queue,
      triggerPrefetch,
      triggerFrontendPreload,
      volume,
      currentSong,
      isLoading,
      seek,
      desktopTranscodeQuality,
    } = get();
    const manager = getSessionManager();

    // 如果点击的是同一首歌曲
    if (currentSong?.id === song.id) {
      // 正在加载中，忽略点击
      if (isLoading) {
        console.log("[Player] Same song is loading, ignoring click");
        return;
      }
      // 正在播放，从头开始播放
      if (audioRef && !audioRef.paused) {
        console.log("[Player] Same song playing, restarting from beginning");
        seek(0);
        return;
      }
    }

    // 生成新的播放会话 ID，用于取消之前的异步操作
    const playSessionId = Date.now();
    if (audioRef) {
      (
        audioRef as HTMLAudioElement & { _playSessionId?: number }
      )._playSessionId = playSessionId;
      // 立即重置 currentTime，防止 timeupdate 事件读取到旧的进度
      try {
        audioRef.currentTime = 0;
      } catch {
        // 忽略错误（可能 src 还没设置）
      }
    }

    // Fade out current audio to prevent pop/click sound when switching tracks
    // Skip fade out in background to minimize delay for track transition
    let originalVolume = volume / 100;
    const isBackground = document.visibilityState === "hidden";
    if (audioRef && !audioRef.paused) {
      if (isBackground) {
        // In background: DON'T pause! Just set volume to 0.
        // Pausing would end the audio session and require user interaction to restart.
        // The new audio.src will automatically stop the old audio when it starts playing.
        audioRef.volume = 0;
        console.log(
          "[Player] Background mode: keeping audio session alive for seamless transition",
        );
      } else {
        originalVolume = await fadeOutAudio(audioRef);
        audioRef.pause();
      }
    }

    // 检查会话是否仍然有效（用户可能在 fade out 期间点击了其他歌曲）
    if (
      audioRef &&
      (audioRef as HTMLAudioElement & { _playSessionId?: number })
        ._playSessionId !== playSessionId
    ) {
      console.log("[Player] Play session cancelled during fade out");
      return;
    }

    // Android 平台：只在后台时启动保活音频
    // 这可以防止浏览器在后台节流页面，同时不影响前台正常播放
    if (
      manager.platform === "android" &&
      document.visibilityState === "hidden"
    ) {
      startKeepAlive();
    }

    // Find song in queue or add it
    let index = queue.findIndex((s) => s.id === song.id);
    if (index === -1) {
      set({ queue: [...queue, song], queueIndex: queue.length });
      index = queue.length;
    } else {
      set({ queueIndex: index });
    }

    // Reset play history tracking for new song
    // Use song metadata duration as initial value (will be updated by audio loadedmetadata event)
    // This ensures duration is displayed immediately, especially important for offline mode
    const initialDuration = song.duration ? song.duration / 1000 : 0; // Convert ms to seconds
    set({
      currentSong: song,
      isPlaying: true,
      progress: 0,
      duration: initialDuration,
      playHistoryRecorded: false,
      accumulatedPlayTime: 0,
      lastProgressUpdate: 0,
      lastProgressUIUpdate: 0,
      isLoading: true,
      loadingMessage: "正在加载...",
      playbackError: null,
      retryCount: 0,
    });

    // Preload metadata for next songs to enable instant Media Session updates
    const currentQueue = get().queue;
    const currentIndex = get().queueIndex;
    for (let i = 1; i <= 2; i++) {
      const nextSong = currentQueue[currentIndex + i];
      if (nextSong) {
        preloadMediaMetadata(nextSong).catch(() => {});
      }
    }

    if (audioRef) {
      // Cache-first playback: check if song is cached
      let audioUrl: string | undefined;
      let usingCache = false;

      // 检查是否处于手动离线模式
      const isManualOffline = getManualOfflineMode();

      try {
        // Priority 1: Check audioPreloader cache (synchronous, fastest)
        // This is crucial for fast background transitions
        // Skip if song is in offline cache: IndexedDB has M4A faststart (seekable),
        // while audioPreloader may have ADTS stream blobs (not seekable in blob URL context)
        const isInOfflineCache = useOfflineCacheStore
          .getState()
          .isSongCached(song.id);
        if (!isInOfflineCache) {
          const preloadedBlobUrl = audioPreloader.getCachedUrl(song.id);
          if (preloadedBlobUrl) {
            audioUrl = preloadedBlobUrl;
            usingCache = true;
            console.log(`[Player] Using audioPreloader cache for ${song.name}`);
          }
        }

        // Priority 2: Android 平台预加载的音频
        if (!audioUrl && manager.platform === "android") {
          const androidManager =
            manager as import("../utils/audioSession/android").AndroidAudioSession;
          const androidPreloadedUrl = androidManager.consumePreloadedAudio(
            song.id,
          );
          if (androidPreloadedUrl) {
            audioUrl = androidPreloadedUrl;
            usingCache = true;
            console.log(
              `[Player] Using Android preloaded audio for ${song.name}`,
            );
            // 延迟清理预加载缓存，确保音频已经开始播放
            setTimeout(() => androidManager.clearConsumedPreload(), 5000);
          }
        }

        // Priority 3: IndexedDB offline cache (async, slower)
        // Always check IndexedDB if song is known to be in offline cache (ensures M4A faststart is used)
        // In background mode without offline cache, skip this slow check if we're online
        if (
          !audioUrl &&
          (isInOfflineCache || !(isBackground && navigator.onLine && !isManualOffline))
        ) {
          const cachedSong = await offlineCacheService.getCachedSong(song.id);

          // 检查会话是否仍然有效
          if (
            (audioRef as HTMLAudioElement & { _playSessionId?: number })
              ._playSessionId !== playSessionId
          ) {
            console.log("[Player] Play session cancelled during cache check");
            return;
          }

          if (cachedSong && cachedSong.audio) {
            // Use cached audio Blob
            audioUrl = URL.createObjectURL(cachedSong.audio);
            usingCache = true;
            console.log(
              `[Player] Using IndexedDB cached audio for ${song.name}`,
            );
          }
        }

        // Priority 4: Stream from server
        if (!audioUrl) {
          if (!isManualOffline && navigator.onLine) {
            // 使用 AudioSessionManager 获取正确的 URL
            audioUrl = withCacheBust(
              getPlaybackStreamUrl(manager, song.id, desktopTranscodeQuality),
            );
            console.log(
              `[Player] Streaming from server for ${song.name}${isBackground ? " (background fast path)" : ""}`,
            );
          } else {
            // Offline (manual or network) and not cached - show unavailable message
            console.log(`[Player] Song not available offline: ${song.name}`);
            const message = isManualOffline
              ? "离线模式已启用，此歌曲未缓存"
              : "此歌曲未缓存，无法离线播放";
            useToastStore.getState().showToast(message);
            set({ isPlaying: false, isLoading: false, loadingMessage: null });
            return;
          }
        }
      } catch (error) {
        // 检查会话是否仍然有效
        if (
          (audioRef as HTMLAudioElement & { _playSessionId?: number })
            ._playSessionId !== playSessionId
        ) {
          console.log("[Player] Play session cancelled during error handling");
          return;
        }

        // Cache check failed, fall back to streaming if online and not in manual offline mode
        console.error("[Player] Cache check failed:", error);
        if (!isManualOffline && navigator.onLine) {
          audioUrl = withCacheBust(
            getPlaybackStreamUrl(manager, song.id, desktopTranscodeQuality),
          );
        } else {
          const message = isManualOffline
            ? "离线模式已启用，此歌曲未缓存"
            : "此歌曲未缓存，无法离线播放";
          useToastStore.getState().showToast(message);
          set({ isPlaying: false, isLoading: false, loadingMessage: null });
          return;
        }
      }

      // 最终检查会话是否仍然有效
      if (
        (audioRef as HTMLAudioElement & { _playSessionId?: number })
          ._playSessionId !== playSessionId
      ) {
        console.log("[Player] Play session cancelled before setting src");
        return;
      }

      setManagedAudioSource(audioRef, audioUrl);
      audioRef.currentTime = 0;
      // Set volume to 0 before loading, will fade in after play starts
      // In background: set volume immediately; in foreground: start at 0 for fade in
      audioRef.volume = isBackground ? originalVolume : 0;

      // Play the audio - handle autoplay rejection gracefully
      audioRef
        .play()
        .then(async () => {
          // 检查会话是否仍然有效
          if (
            (audioRef as HTMLAudioElement & { _playSessionId?: number })
              ._playSessionId !== playSessionId
          ) {
            console.log("[Player] Play session cancelled after play started");
            audioRef.pause();
            return;
          }

          console.log(
            `[Player] Play started for ${song.name}${usingCache ? " (cached)" : ""}${isBackground ? " (background)" : ""}`,
          );
          // Fade in audio to prevent pop/click sound (skip in background for speed)
          if (!isBackground) {
            await fadeInAudio(audioRef, originalVolume);
          }
          // 歌曲开始播放后，停止保活音频
          stopKeepAlive();
          set({ isLoading: false, loadingMessage: null });
        })
        .catch((err) => {
          // 检查会话是否仍然有效
          if (
            (audioRef as HTMLAudioElement & { _playSessionId?: number })
              ._playSessionId !== playSessionId
          ) {
            console.log("[Player] Play session cancelled during error");
            return;
          }

          console.log(`[Player] Play blocked: ${err.message}`);
          // Restore volume in case of error
          audioRef.volume = originalVolume;
          set({ isLoading: false, loadingMessage: null });
          // Autoplay was blocked - set isPlaying to false so UI shows play button
          if (err.name === "NotAllowedError") {
            console.log(
              "[Player] Autoplay blocked - waiting for user interaction",
            );
            set({ isPlaying: false });
          }
        });
    }

    // Trigger backend prefetch for next songs in queue
    triggerPrefetch();
    // Trigger frontend preload for next song (skip in HLS mode)
    if (!manager.isHlsMode) {
      triggerFrontendPreload();
    }

    // Trigger HLS prefetch for iOS PWA
    // Requirements: 1.1, 5.1, 6.1, 6.2
    if (manager.platform === "ios" && manager.isHlsMode) {
      try {
        const { queue: currentQueue, queueIndex: currentIndex } = get();
        const nextSong =
          currentIndex < currentQueue.length - 1
            ? currentQueue[currentIndex + 1]
            : null;
        hlsPrefetchService.onSongStart(song.id, nextSong?.id || null);

        // Also notify iOS AudioSessionManager
        const iosManager = manager as iOSAudioSession;
        iosManager.onSongStart(song.id, nextSong?.id || null);
      } catch (error) {
        // Graceful degradation: prefetch failure should not affect playback
        // Requirements: 6.1, 6.2
        console.warn(
          "[Player] HLS prefetch trigger failed, continuing with normal playback:",
          error,
        );
      }
    }

    // Play history will be recorded after 30 seconds of playback (in setProgress)
  },

  play: async () => {
    const {
      audioRef,
      currentSong,
      progress,
      accumulatedPlayTime,
      desktopTranscodeQuality,
    } = get();
    const manager = getSessionManager();

    // 在用户交互时初始化保活音频的 AudioContext
    // AudioContext 需要用户交互才能启动
    if (manager.platform === "android") {
      initKeepAliveOnUserGesture();
    }

    debugLog("[Play] Starting", {
      song: currentSong?.name?.slice(0, 15),
      progress: progress?.toFixed(1),
      isHlsMode: manager.isHlsMode,
      platform: manager.platform,
    });

    if (!audioRef || !currentSong) {
      debugLog("[Play] No audioRef or currentSong");
      return;
    }

    // 生成新的播放会话 ID，用于取消之前的异步操作
    const playSessionId = Date.now();
    (
      audioRef as HTMLAudioElement & { _playSessionId?: number }
    )._playSessionId = playSessionId;

    // 立即设置 isPlaying: true
    set({ isPlaying: true });

    // 关键修复：判断这是"恢复播放"还是"开始新歌曲"
    // 如果 accumulatedPlayTime 为 0 且 progress 接近 0，说明是新歌曲，不应该恢复进度
    // 音乐播放器不需要像视频播放器那样记录每首歌的进度
    const isNewSong = accumulatedPlayTime === 0 && progress < 2;
    const savedProgress = isNewSong ? 0 : progress;

    debugLog(
      "[Play] isNewSong:",
      isNewSong,
      "savedProgress:",
      savedProgress.toFixed(1),
    );

    // 检查是否需要设置新的 src
    const managedSrc = getManagedAudioSourceUrl(audioRef);
    const currentSrc = managedSrc || audioRef.src || "";
    // Check if current src is a non-HLS blob URL (cached) or stream URL
    const isBlobUrl = !managedSrc && currentSrc.startsWith("blob:");
    const expectedStreamUrl = getPlaybackStreamUrl(
      manager,
      currentSong.id,
      desktopTranscodeQuality,
    );
    const currentStreamKey = isBlobUrl
      ? ""
      : normalizePlaybackStreamUrl(currentSrc);
    const expectedStreamKey = normalizePlaybackStreamUrl(expectedStreamUrl);
    const shouldForceIOSReload =
      manager.platform === "ios" &&
      manager.isHlsMode &&
      (audioRef.error !== null ||
        audioRef.readyState === 0 ||
        audioRef.networkState === HTMLMediaElement.NETWORK_NO_SOURCE);
    const needsNewSrc =
      isBlobUrl ||
      currentStreamKey !== expectedStreamKey ||
      shouldForceIOSReload;

    if (needsNewSrc) {
      if (shouldForceIOSReload) {
        debugLog("[Play] Forcing iOS HLS reload", {
          errorCode: audioRef.error?.code ?? null,
          readyState: audioRef.readyState,
          networkState: audioRef.networkState,
        });
      }
      // Cache-first: check if song is cached
      let audioUrl: string;

      // 检查是否处于手动离线模式
      const isManualOffline = getManualOfflineMode();

      try {
        const cachedSong = await offlineCacheService.getCachedSong(
          currentSong.id,
        );

        // 检查会话是否仍然有效
        if (
          (audioRef as HTMLAudioElement & { _playSessionId?: number })
            ._playSessionId !== playSessionId
        ) {
          debugLog("[Play] Session cancelled during cache check");
          return;
        }

        if (cachedSong && cachedSong.audio) {
          // Use cached audio Blob
          audioUrl = URL.createObjectURL(cachedSong.audio);
          debugLog("[Play] Using cached audio");
        } else if (!isManualOffline && navigator.onLine) {
          // Stream from server (only if not in manual offline mode)
          // 使用 AudioSessionManager 获取正确的 URL
          let streamUrl = expectedStreamUrl;
          if (manager.isHlsMode && manager.platform === "ios") {
            streamUrl = new URL(streamUrl, window.location.origin).href;
          }
          audioUrl = withCacheBust(streamUrl);
          debugLog("[Play] Setting new src:", audioUrl.slice(-50));
        } else {
          // Offline (manual or network) and not cached
          debugLog("[Play] Song not available offline");
          const message = isManualOffline
            ? "离线模式已启用，此歌曲未缓存"
            : "此歌曲未缓存，无法离线播放";
          useToastStore.getState().showToast(message);
          set({ isPlaying: false });
          return;
        }
      } catch (error) {
        // 检查会话是否仍然有效
        if (
          (audioRef as HTMLAudioElement & { _playSessionId?: number })
            ._playSessionId !== playSessionId
        ) {
          debugLog("[Play] Session cancelled during error handling");
          return;
        }

        // Cache check failed, fall back to streaming if online and not in manual offline mode
        debugLog("[Play] Cache check failed:", error);
        if (!isManualOffline && navigator.onLine) {
          let streamUrl = expectedStreamUrl;
          if (manager.isHlsMode && manager.platform === "ios") {
            streamUrl = new URL(streamUrl, window.location.origin).href;
          }
          audioUrl = withCacheBust(streamUrl);
        } else {
          const message = isManualOffline
            ? "离线模式已启用，此歌曲未缓存"
            : "此歌曲未缓存，无法离线播放";
          useToastStore.getState().showToast(message);
          set({ isPlaying: false });
          return;
        }
      }

      // 检查会话是否仍然有效
      if (
        (audioRef as HTMLAudioElement & { _playSessionId?: number })
          ._playSessionId !== playSessionId
      ) {
        debugLog("[Play] Session cancelled before setting src");
        return;
      }

      setManagedAudioSource(audioRef, audioUrl);
      // 新歌曲始终从头开始
      audioRef.currentTime = 0;

      // 只有在恢复播放时才需要等待 metadata 并设置进度
      if (savedProgress > 1) {
        debugLog(
          "[Play] Waiting for metadata to seek to:",
          savedProgress.toFixed(1),
        );

        // 等待 metadata 加载完成
        await new Promise<void>((resolve) => {
          if (audioRef.readyState >= 1) {
            // metadata 已经加载完成
            resolve();
          } else {
            // 等待 loadedmetadata 事件
            const onLoaded = () => {
              audioRef.removeEventListener("loadedmetadata", onLoaded);
              resolve();
            };
            audioRef.addEventListener("loadedmetadata", onLoaded, {
              once: true,
            });
            // 设置超时，避免无限等待
            setTimeout(() => {
              audioRef.removeEventListener("loadedmetadata", onLoaded);
              resolve();
            }, 5000);
          }
        });

        // 检查会话是否仍然有效
        if (
          (audioRef as HTMLAudioElement & { _playSessionId?: number })
            ._playSessionId !== playSessionId
        ) {
          debugLog("[Play] Session cancelled after metadata loaded");
          return;
        }

        // 设置进度位置（在播放之前）
        try {
          audioRef.currentTime = savedProgress;
          debugLog(
            "[Play] Seeked to:",
            savedProgress.toFixed(1),
            "before playing",
          );
        } catch (e) {
          debugLog("[Play] Seek error:", e);
        }
      }
    } else {
      debugLog("[Play] Reusing existing src");

      // 如果是新歌曲，确保从头开始播放
      if (isNewSong) {
        try {
          audioRef.currentTime = 0;
          debugLog("[Play] New song - reset to beginning");
        } catch (e) {
          debugLog("[Play] Reset error:", e);
        }
      } else if (
        savedProgress > 1 &&
        Math.abs(audioRef.currentTime - savedProgress) > 1
      ) {
        // 恢复播放时，确保进度正确
        try {
          audioRef.currentTime = savedProgress;
          debugLog("[Play] Corrected position to:", savedProgress.toFixed(1));
        } catch (e) {
          debugLog("[Play] Seek error:", e);
        }
      }
    }

    // 检查会话是否仍然有效
    if (
      (audioRef as HTMLAudioElement & { _playSessionId?: number })
        ._playSessionId !== playSessionId
    ) {
      debugLog("[Play] Session cancelled before resumePlayback");
      return;
    }

    // 使用 AudioSessionManager 恢复播放（进度已经设置好了）
    const playSuccess = await manager.resumePlayback(audioRef);

    // 检查会话是否仍然有效
    if (
      (audioRef as HTMLAudioElement & { _playSessionId?: number })
        ._playSessionId !== playSessionId
    ) {
      debugLog("[Play] Session cancelled after resumePlayback");
      audioRef.pause();
      return;
    }

    if (playSuccess) {
      debugLog(
        "[Play] play() OK, paused:",
        audioRef.paused,
        "readyState:",
        audioRef.readyState,
        "currentTime:",
        audioRef.currentTime.toFixed(1),
      );
    } else {
      debugLog("[Play] play() failed or needs user interaction");
      set({ isPlaying: false });
    }
  },

  pause: () => {
    const { audioRef } = get();
    if (audioRef) {
      // 清除播放会话 ID，取消任何正在进行的异步播放操作
      (
        audioRef as HTMLAudioElement & { _playSessionId?: number }
      )._playSessionId = 0;

      audioRef.pause();
      const t = audioRef.currentTime;
      if (!Number.isNaN(t) && isFinite(t)) {
        set({ isPlaying: false, progress: t, lastProgressUpdate: t });
        return;
      }
    }
    set({ isPlaying: false });
  },

  togglePlay: () => {
    const { isPlaying, play, pause } = get();
    debugLog("[togglePlay] isPlaying:", isPlaying);
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  },

  setVolume: (volume) => {
    const { audioRef } = get();
    const clampedVolume = clampVolume(volume);
    if (audioRef) {
      audioRef.volume = clampedVolume / 100;
    }
    set({ volume: clampedVolume });
  },

  seek: (position) => {
    const { audioRef, duration } = get();
    const clampedPosition = clampSeek(position, duration);
    if (audioRef) {
      audioRef.currentTime = clampedPosition;
    }
    set({ progress: clampedPosition, lastProgressUIUpdate: clampedPosition });
  },

  setProgress: (progress) => {
    const {
      currentSong,
      playHistoryRecorded,
      accumulatedPlayTime,
      lastProgressUpdate,
      lastProgressUIUpdate,
      isPlaying,
      checkSleepTimer,
      duration,
      queue,
      queueIndex,
    } = get();
    const manager = getSessionManager();

    // Calculate delta (only count forward progress during playback, not seeks)
    // Normal playback: progress increases by ~1 second per update
    // Seek: progress jumps by a large amount
    const delta = progress - lastProgressUpdate;
    const isNormalPlayback = isPlaying && delta > 0 && delta < 2; // Normal playback is ~1s increments

    const newAccumulatedTime = isNormalPlayback
      ? accumulatedPlayTime + delta
      : accumulatedPlayTime;

    // Debounce: only update UI progress if change is significant (>= 0.5 seconds)
    // This reduces unnecessary state updates while maintaining accurate play history tracking
    const progressDelta = Math.abs(progress - lastProgressUIUpdate);
    const shouldUpdateUI = progressDelta >= 0.5 || !isNormalPlayback; // Always update on seek

    // Record play history after 30 seconds of actual playback
    if (currentSong && !playHistoryRecorded && newAccumulatedTime >= 30) {
      usePlayHistoryStore.getState().recordPlay(currentSong);
      set({
        progress: shouldUpdateUI ? progress : lastProgressUIUpdate,
        playHistoryRecorded: true,
        accumulatedPlayTime: newAccumulatedTime,
        lastProgressUpdate: progress,
        lastProgressUIUpdate: shouldUpdateUI ? progress : lastProgressUIUpdate,
      });
    } else if (shouldUpdateUI) {
      set({
        progress,
        accumulatedPlayTime: newAccumulatedTime,
        lastProgressUpdate: progress,
        lastProgressUIUpdate: progress,
      });
    } else {
      // Only update internal tracking, not UI progress
      set({
        accumulatedPlayTime: newAccumulatedTime,
        lastProgressUpdate: progress,
      });
    }

    // Check sleep timer
    checkSleepTimer();

    // Trigger HLS prefetch progress update for iOS PWA
    // Requirements: 1.1, 5.1, 6.1, 6.2
    if (manager.platform === "ios" && manager.isHlsMode && isNormalPlayback) {
      try {
        const nextSong =
          queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;
        hlsPrefetchService.onProgressUpdate(
          progress,
          duration,
          nextSong?.id || null,
        );
      } catch (error) {
        // Graceful degradation: prefetch failure should not affect playback
        // Requirements: 6.1, 6.2
        console.warn("[Player] HLS prefetch progress update failed:", error);
      }
    }
  },

  setDuration: (duration) => set({ duration }),

  next: () => {
    const {
      queue,
      queueIndex,
      playSong,
      playMode,
      audioRef,
      sleepTimerMode,
      pause,
      clearSleepTimer,
    } = get();
    const manager = getSessionManager();

    // Handle sleep timer "end of track" mode
    if (sleepTimerMode === "endOfTrack") {
      pause();
      clearSleepTimer();
      return;
    }

    // Handle empty queue
    if (queue.length === 0) return;

    // Android 平台：只在后台时启动保活音频
    // 这可以防止浏览器在后台节流页面，同时不影响前台正常播放
    if (
      manager.platform === "android" &&
      document.visibilityState === "hidden"
    ) {
      startKeepAlive();
    }

    // Single loop mode: restart the same song
    if (playMode === "single") {
      if (audioRef) {
        audioRef.currentTime = 0;
        audioRef.play().catch(console.error);
      }
      // Reset play history tracking for the new loop iteration
      set({
        progress: 0,
        isPlaying: true,
        playHistoryRecorded: false,
        accumulatedPlayTime: 0,
        lastProgressUpdate: 0,
        lastProgressUIUpdate: 0,
      });
      return;
    }

    // Check if at the last song
    const isLastSong = queueIndex >= queue.length - 1;

    if (isLastSong) {
      if (playMode === "sequential") {
        // Sequential mode: stop playback at the end
        set({ isPlaying: false });
        if (audioRef) {
          audioRef.pause();
        }
        return;
      } else if (playMode === "loop") {
        // Loop mode: wrap to the first song
        const firstSong = queue[0];
        set({ queueIndex: 0 });
        playSong(firstSong);
        return;
      }
    }

    // Normal case: play next song
    const nextSong = queue[queueIndex + 1];
    set({ queueIndex: queueIndex + 1 });

    // Preload metadata for next songs to enable instant Media Session updates
    const currentQueue = get().queue;
    const currentIndex = get().queueIndex;
    for (let i = 1; i <= 2; i++) {
      const upcomingSong = currentQueue[currentIndex + i];
      if (upcomingSong) {
        preloadMediaMetadata(upcomingSong).catch(() => {});
      }
    }

    playSong(nextSong);
  },

  previous: () => {
    const { queue, queueIndex, playSong, progress, seek } = get();
    // If more than 3 seconds into song, restart it
    if (progress > 3) {
      seek(0);
      return;
    }
    // Otherwise go to previous song
    if (queueIndex > 0) {
      const prevSong = queue[queueIndex - 1];
      set({ queueIndex: queueIndex - 1 });
      playSong(prevSong);
    }
  },

  setQueue: (
    songs,
    startIndex = 0,
    source = { type: null, id: null } as QueueSource,
  ) => {
    const manager = getSessionManager();
    set({ queue: songs, queueIndex: startIndex, queueSource: source });
    if (songs.length > 0 && startIndex < songs.length) {
      get().playSong(songs[startIndex]);
    } else {
      // Queue changed but no song to play - notify HLS prefetch service
      // Requirements: 1.6, 6.1, 6.2
      if (manager.platform === "ios" && manager.isHlsMode) {
        try {
          const nextSong = songs.length > 0 ? songs[0] : null;
          hlsPrefetchService.onQueueChange(nextSong?.id || null);
        } catch (error) {
          // Graceful degradation: prefetch failure should not affect queue operations
          console.warn(
            "[Player] HLS prefetch queue change notification failed:",
            error,
          );
        }
      }
    }
  },

  addToQueue: (song) => {
    const {
      queue,
      queueIndex,
      isShuffled,
      originalQueue,
      shuffledQueue,
      playSong,
      triggerPrefetch,
      triggerFrontendPreload,
    } = get();
    const manager = getSessionManager();

    // Prevent duplicate: check if song already exists in queue
    if (queue.find((s) => s.id === song.id)) {
      return;
    }

    // If queue is empty, add song and start playback (Requirement 6.3)
    if (queue.length === 0) {
      set({
        queue: [song],
        originalQueue: [song],
        shuffledQueue: isShuffled ? [song] : [],
        queueIndex: 0,
      });
      playSong(song);
      return;
    }

    if (isShuffled) {
      // In shuffle mode: add to both original and shuffled queues
      set({
        queue: [...shuffledQueue, song],
        originalQueue: [...originalQueue, song],
        shuffledQueue: [...shuffledQueue, song],
      });
    } else {
      // In normal mode: add to queue and originalQueue
      set({
        queue: [...queue, song],
        originalQueue: [...queue, song],
      });
    }

    // Trigger prefetch update after queue change
    triggerPrefetch();
    triggerFrontendPreload();

    // Notify HLS prefetch service of queue change
    // Requirements: 1.6, 6.1, 6.2
    if (manager.platform === "ios" && manager.isHlsMode) {
      try {
        // If the added song is now the next song, update prefetch target
        const newQueue = isShuffled
          ? [...shuffledQueue, song]
          : [...queue, song];
        const nextSong =
          queueIndex < newQueue.length - 1 ? newQueue[queueIndex + 1] : null;
        hlsPrefetchService.onQueueChange(nextSong?.id || null);
      } catch (error) {
        // Graceful degradation: prefetch failure should not affect queue operations
        console.warn(
          "[Player] HLS prefetch queue change notification failed:",
          error,
        );
      }
    }
  },

  // Add multiple songs to queue (batch add, no duplicate check)
  addSongsToQueue: (songs) => {
    const {
      queue,
      isShuffled,
      originalQueue,
      shuffledQueue,
      playSong,
      triggerFrontendPreload,
    } = get();

    // If no songs to add, do nothing
    if (songs.length === 0) {
      return;
    }

    // If queue is empty, add songs and start playback of first song
    if (queue.length === 0) {
      const firstSong = songs[0];
      set({
        queue: songs,
        originalQueue: songs,
        shuffledQueue: isShuffled ? songs : [],
        queueIndex: 0,
      });

      // Use playSong which handles offline cache properly
      playSong(firstSong);
      return;
    }

    // Non-empty queue: append songs without interrupting playback
    if (isShuffled) {
      // In shuffle mode: add to both original and shuffled queues
      set({
        queue: [...shuffledQueue, ...songs],
        originalQueue: [...originalQueue, ...songs],
        shuffledQueue: [...shuffledQueue, ...songs],
        // queueIndex stays the same to preserve current song position
      });
    } else {
      // In normal mode: add to queue and originalQueue
      set({
        queue: [...queue, ...songs],
        originalQueue: [...originalQueue, ...songs],
        // queueIndex stays the same to preserve current song position
      });
    }

    // Trigger frontend preload for newly added songs if they're next
    triggerFrontendPreload();
  },

  clearQueue: () => {
    // Clear frontend preload cache
    audioPreloader.clear();
    return set({ queue: [], queueIndex: -1 });
  },

  // Play mode action: cycle through sequential → loop → single → sequential
  togglePlayMode: () =>
    set((state) => {
      const modeOrder: PlayMode[] = ["sequential", "loop", "single"];
      const currentIndex = modeOrder.indexOf(state.playMode);
      const nextIndex = (currentIndex + 1) % modeOrder.length;
      return { playMode: modeOrder[nextIndex] };
    }),

  // Shuffle action: toggle shuffle mode
  toggleShuffle: () => {
    const {
      isShuffled,
      originalQueue,
      queue,
      queueIndex,
      currentSong,
      triggerPrefetch,
      triggerFrontendPreload,
    } = get();

    if (!isShuffled) {
      // Enable shuffle: generate shuffled queue, keep current song
      const newOriginalQueue = [...queue];
      const currentSongInQueue = currentSong;

      // Create shuffled queue
      const songsToShuffle = newOriginalQueue.filter(
        (s) => s.id !== currentSongInQueue?.id,
      );
      const shuffled = shuffleArray(songsToShuffle);

      // Put current song at the beginning of shuffled queue
      const newShuffledQueue = currentSongInQueue
        ? [currentSongInQueue, ...shuffled]
        : shuffled;

      set({
        isShuffled: true,
        originalQueue: newOriginalQueue,
        shuffledQueue: newShuffledQueue,
        queue: newShuffledQueue,
        queueIndex: 0, // Current song is now at index 0
      });
    } else {
      // Disable shuffle: restore original queue order
      const currentSongInQueue = currentSong;
      const newQueueIndex = currentSongInQueue
        ? originalQueue.findIndex((s) => s.id === currentSongInQueue.id)
        : 0;

      set({
        isShuffled: false,
        queue: originalQueue,
        queueIndex: newQueueIndex >= 0 ? newQueueIndex : 0,
        shuffledQueue: [],
      });
    }

    // Trigger prefetch update after queue order change
    triggerPrefetch();
    triggerFrontendPreload();
  },

  // Reorder queue: move song from fromIndex to toIndex
  reorderQueue: (fromIndex, toIndex) => {
    const {
      queue,
      queueIndex,
      currentSong,
      isShuffled,
      originalQueue,
      shuffledQueue,
      triggerPrefetch,
      triggerFrontendPreload,
    } = get();
    const manager = getSessionManager();

    // Validate indices
    if (
      fromIndex < 0 ||
      fromIndex >= queue.length ||
      toIndex < 0 ||
      toIndex >= queue.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    // Create new queue with reordered songs
    const newQueue = [...queue];
    const [movedSong] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, movedSong);

    // Calculate new queue index to keep current song playing
    let newQueueIndex = queueIndex;
    if (currentSong) {
      newQueueIndex = newQueue.findIndex((s) => s.id === currentSong.id);
      if (newQueueIndex === -1) newQueueIndex = queueIndex;
    }

    // Update the appropriate queue based on shuffle state
    if (isShuffled) {
      set({
        queue: newQueue,
        shuffledQueue: newQueue,
        queueIndex: newQueueIndex,
      });
    } else {
      set({
        queue: newQueue,
        originalQueue: newQueue,
        queueIndex: newQueueIndex,
      });
    }

    // Trigger prefetch update after queue reorder
    triggerPrefetch();
    triggerFrontendPreload();

    // Notify HLS prefetch service of queue change
    // Requirements: 1.6, 6.1, 6.2
    if (manager.platform === "ios" && manager.isHlsMode) {
      try {
        const nextSong =
          newQueueIndex < newQueue.length - 1
            ? newQueue[newQueueIndex + 1]
            : null;
        hlsPrefetchService.onQueueChange(nextSong?.id || null);
      } catch (error) {
        // Graceful degradation: prefetch failure should not affect queue operations
        console.warn(
          "[Player] HLS prefetch queue change notification failed:",
          error,
        );
      }
    }
  },

  // Play from queue: double-click to play a specific song
  playFromQueue: (index) => {
    const { queue, playSong } = get();

    // Validate index
    if (index < 0 || index >= queue.length) {
      return;
    }

    const song = queue[index];

    // Update queue index first, then use playSong for proper offline cache handling
    set({ queueIndex: index });

    // Use playSong which handles offline cache properly
    playSong(song);
  },

  // Play next: insert song right after current song
  playNext: (song) => {
    const {
      queue,
      queueIndex,
      isShuffled,
      originalQueue,
      shuffledQueue,
      playSong,
      triggerPrefetch,
      triggerFrontendPreload,
    } = get();

    // Prevent duplicate: check if song already exists in queue
    const existingIndex = queue.findIndex((s) => s.id === song.id);
    if (existingIndex !== -1) {
      // If song exists, move it to play next instead of adding duplicate
      // reorderQueue will trigger prefetch internally
      if (existingIndex !== queueIndex + 1) {
        get().reorderQueue(existingIndex, queueIndex + 1);
      }
      return;
    }

    // If queue is empty, just add and play
    if (queue.length === 0) {
      set({
        queue: [song],
        originalQueue: [song],
        shuffledQueue: isShuffled ? [song] : [],
        queueIndex: 0,
      });
      playSong(song);
      return;
    }

    // Insert after current song
    const insertIndex = queueIndex + 1;
    const newQueue = [...queue];
    newQueue.splice(insertIndex, 0, song);

    if (isShuffled) {
      const newOriginalQueue = [...originalQueue, song];
      set({
        queue: newQueue,
        shuffledQueue: newQueue,
        originalQueue: newOriginalQueue,
      });
    } else {
      set({
        queue: newQueue,
        originalQueue: newQueue,
      });
    }

    // Trigger prefetch update - the inserted song is now next to play
    triggerPrefetch();
    triggerFrontendPreload();
  },

  // Remove from queue: remove song at specified index
  removeFromQueue: (index) => {
    const {
      queue,
      queueIndex,
      currentSong,
      isShuffled,
      originalQueue,
      shuffledQueue,
      audioRef,
      isPlaying,
      triggerPrefetch,
      triggerFrontendPreload,
    } = get();
    const manager = getSessionManager();

    // Validate index
    if (index < 0 || index >= queue.length) {
      return;
    }

    const songToRemove = queue[index];
    const newQueue = queue.filter((_, i) => i !== index);

    // If removing the last song, clear everything
    if (newQueue.length === 0) {
      if (audioRef) {
        audioRef.pause();
        clearManagedAudioSource(audioRef);
      }
      audioPreloader.clear();
      set({
        queue: [],
        originalQueue: [],
        shuffledQueue: [],
        queueIndex: -1,
        currentSong: null,
        isPlaying: false,
      });
      return;
    }

    // Calculate new queue index
    let newQueueIndex = queueIndex;
    let newCurrentSong = currentSong;
    let shouldPlayNext = false;

    if (index === queueIndex) {
      // Removing currently playing song
      // Play the next song (which is now at the same index)
      if (index < newQueue.length) {
        newCurrentSong = newQueue[index];
        newQueueIndex = index;
      } else {
        // Was the last song, play the new last song
        newQueueIndex = newQueue.length - 1;
        newCurrentSong = newQueue[newQueueIndex];
      }
      shouldPlayNext = true;
    } else if (index < queueIndex) {
      // Removing a song before current, adjust index
      newQueueIndex = queueIndex - 1;
    }
    // If removing after current, queueIndex stays the same

    // Update original/shuffled queues
    let newOriginalQueue = originalQueue;
    let newShuffledQueue = shuffledQueue;

    if (isShuffled) {
      newShuffledQueue = newQueue;
      newOriginalQueue = originalQueue.filter((s) => s.id !== songToRemove.id);
    } else {
      newOriginalQueue = newQueue;
    }

    // If we need to play the next song, use playSong for proper offline cache handling
    if (shouldPlayNext && newCurrentSong) {
      // First update the state
      set({
        queue: newQueue,
        originalQueue: newOriginalQueue,
        shuffledQueue: newShuffledQueue,
        queueIndex: newQueueIndex,
      });

      // Then use playSong which handles offline cache properly
      get().playSong(newCurrentSong);

      // Trigger prefetch update after queue change
      triggerPrefetch();
      // Trigger frontend preload (skip in HLS mode)
      if (!manager.isHlsMode) {
        triggerFrontendPreload();
      }
      return;
    }

    set({
      queue: newQueue,
      originalQueue: newOriginalQueue,
      shuffledQueue: newShuffledQueue,
      queueIndex: newQueueIndex,
      currentSong: newCurrentSong,
      isPlaying: isPlaying,
    });

    // Trigger prefetch update after queue change
    triggerPrefetch();
    // Trigger frontend preload (skip in HLS mode)
    if (!manager.isHlsMode) {
      triggerFrontendPreload();
    }

    // Notify HLS prefetch service of queue change
    // Requirements: 1.6, 6.1, 6.2
    if (manager.platform === "ios" && manager.isHlsMode) {
      try {
        const nextSong =
          newQueueIndex < newQueue.length - 1
            ? newQueue[newQueueIndex + 1]
            : null;
        hlsPrefetchService.onQueueChange(nextSong?.id || null);
      } catch (error) {
        // Graceful degradation: prefetch failure should not affect queue operations
        console.warn(
          "[Player] HLS prefetch queue change notification failed:",
          error,
        );
      }
    }
  },

  // Load playback state from server
  loadPlaybackState: async () => {
    try {
      const state = await getPlaybackState();
      if (!state || !state.queue_songs || state.queue_songs.length === 0) {
        return;
      }

      // If the user has already started a new session (queue exists), do not clobber it with server state.
      // This avoids a race where the server hydration arrives after the user begins playback.
      if (get().queue.length > 0) {
        return;
      }

      const manager = getSessionManager();

      // Convert queue songs from API format to Song format
      const songs: Song[] = state.queue_songs.map((qs) => ({
        id: qs.id,
        name: qs.name,
        artistName: qs.artist_name,
        artistId: qs.artist_id,
        albumName: qs.album_name,
        albumId: qs.album_id,
        duration: qs.duration,
        artworkUrl: qs.artwork_url,
        hasLyrics: qs.has_lyrics,
      }));

      // Restore the state
      const currentIndex = Math.min(state.current_index, songs.length - 1);
      const currentSong = songs[currentIndex] || null;

      // Restore queue source
      const queueSource: QueueSource = {
        type: (state.queue_source_type as QueueSource["type"]) || null,
        id: state.queue_source_id || null,
        name: state.queue_source_name || undefined,
      };

      // Restore volume (default to 70 if not set)
      const volume = clampVolume(state.volume ?? 70);

      // Calculate initial duration from song metadata (will be updated by audio loadedmetadata event)
      const initialDuration = currentSong?.duration
        ? currentSong.duration / 1000
        : 0;

      set({
        queue: songs,
        originalQueue: songs,
        queueIndex: currentIndex,
        currentSong,
        progress: state.position,
        duration: initialDuration, // Set duration from song metadata for Media Session
        playMode: state.play_mode,
        isShuffled: state.is_shuffled,
        volume,
        queueSource,
        skipNextPlaybackStateSave: true,
        isPlaying: false, // Don't auto-play on load
      });

      // Set audio source and volume so user can click play to resume
      // 优先使用离线缓存，避免不必要的网络请求
      const { audioRef, desktopTranscodeQuality } = get();
      if (audioRef) {
        audioRef.volume = volume / 100;
        if (currentSong) {
          // 检查是否处于手动离线模式
          const isManualOffline = getManualOfflineMode();

          // 检查是否有离线缓存
          let audioUrl: string | null = null;
          try {
            const cachedSong = await offlineCacheService.getCachedSong(
              currentSong.id,
            );
            if (cachedSong && cachedSong.audio) {
              // 使用缓存的音频
              audioUrl = URL.createObjectURL(cachedSong.audio);
              console.log(
                `[loadPlaybackState] Using cached audio for ${currentSong.name}`,
              );
            } else if (!isManualOffline && navigator.onLine) {
              // 只有在非离线模式且有网络时才使用服务器流
              audioUrl = getPlaybackStreamUrl(
                manager,
                currentSong.id,
                desktopTranscodeQuality,
              );
              console.log(
                `[loadPlaybackState] Using server stream for ${currentSong.name}`,
              );
            } else {
              // 离线模式下没有缓存，不设置 URL
              console.log(
                `[loadPlaybackState] Song not cached, skipping audio setup in offline mode`,
              );
            }
          } catch (error) {
            // 缓存检查失败
            console.error("[loadPlaybackState] Cache check failed:", error);
            if (!isManualOffline && navigator.onLine) {
              // 只有在非离线模式且有网络时才回退到服务器流
              audioUrl = getPlaybackStreamUrl(
                manager,
                currentSong.id,
                desktopTranscodeQuality,
              );
            }
          }

          if (audioUrl) {
            setManagedAudioSource(audioRef, audioUrl);
            // Set the playback position after metadata is loaded
            audioRef.addEventListener(
              "loadedmetadata",
              function onLoaded() {
                audioRef.currentTime = state.position;
                audioRef.removeEventListener("loadedmetadata", onLoaded);
              },
              { once: true },
            );
          }
        }
      }

      // If shuffled, we need to regenerate the shuffled queue
      if (state.is_shuffled && currentSong) {
        const songsToShuffle = songs.filter((s) => s.id !== currentSong.id);
        const shuffled = shuffleArray(songsToShuffle);
        const newShuffledQueue = [currentSong, ...shuffled];
        set({
          shuffledQueue: newShuffledQueue,
          queue: newShuffledQueue,
          queueIndex: 0,
        });
      }
    } catch (error) {
      console.error("Failed to load playback state:", error);
    }
  },

  // Save playback state to server (full queue - use when queue changes)
  savePlaybackState: async () => {
    const {
      queue,
      queueIndex,
      progress,
      playMode,
      isShuffled,
      volume,
      queueSource,
    } = get();

    // Don't save if queue is empty
    if (queue.length === 0) {
      return;
    }

    try {
      await savePlaybackStateAPI({
        queue_songs: queue.map((s) => ({
          id: s.id,
          name: s.name,
          artist_name: s.artistName,
          artist_id: s.artistId,
          album_name: s.albumName,
          album_id: s.albumId || "",
          duration: s.duration,
          artwork_url: s.artworkUrl,
          has_lyrics: s.hasLyrics,
        })),
        current_index: queueIndex,
        position: progress,
        play_mode: playMode,
        is_shuffled: isShuffled,
        volume: volume,
        queue_source_type: queueSource.type,
        queue_source_id: queueSource.id,
        queue_source_name: queueSource.name || null,
      });
    } catch (error) {
      console.error("Failed to save playback state:", error);
    }
  },

  // Save playback progress only (lightweight - use for periodic progress updates)
  savePlaybackProgress: async () => {
    const { queue, queueIndex, progress, volume } = get();

    // Don't save if queue is empty
    if (queue.length === 0) {
      return;
    }

    try {
      await savePlaybackProgressAPI({
        current_index: queueIndex,
        position: progress,
        volume: volume,
      });
    } catch (error) {
      // If state not found (404), fall back to full save to create the record
      if (
        error instanceof Error &&
        error.message.includes("Failed to save playback progress")
      ) {
        console.log("No existing playback state, falling back to full save");
        get().savePlaybackState();
      } else {
        console.error("Failed to save playback progress:", error);
      }
    }
  },

  // Prefetch actions (backend)
  triggerPrefetch: () => {
    // Apple Music prefetch was retired for local playback.
  },

  // Frontend preload: preload next song(s) into browser memory
  triggerFrontendPreload: () => {
    const { queue, queueIndex } = get();
    const manager = getSessionManager();

    // Get next song(s) to preload
    const nextSongs = queue.slice(
      queueIndex + 1,
      queueIndex + 1 + FRONTEND_PRELOAD_COUNT,
    );

    if (nextSongs.length === 0) {
      return;
    }

    // Android 平台：使用 AndroidAudioSession 的预加载功能
    // 这会将音频预加载到内存中，以便后台快速切换
    if (manager.platform === "android") {
      const androidManager = manager as AndroidAudioSession;
      const nextSong = nextSongs[0];
      if (nextSong) {
        androidManager.preloadNextSong(nextSong.id).catch((error) => {
          console.error(`[Android] Failed to preload ${nextSong.id}:`, error);
        });
      }

      // 同时预缓存更多歌曲到 Service Worker（用于后台播放）
      const songsForSWCache = queue
        .slice(queueIndex + 1, queueIndex + 6) // 预缓存接下来 5 首
        .map((song) => song.id);

      if (songsForSWCache.length > 0) {
        androidManager
          .prefetchQueueToSWCache(songsForSWCache)
          .catch((error) => {
            console.error("[Android] Failed to prefetch to SW cache:", error);
          });
      }
    }

    // Preload each song asynchronously using audioPreloader
    for (const song of nextSongs) {
      // Skip if already cached or loading
      if (
        audioPreloader.isCached(song.id) ||
        audioPreloader.isLoading(song.id)
      ) {
        continue;
      }

      // Start preloading
      audioPreloader.preload(song.id).catch((error) => {
        console.error(`Failed to preload ${song.id}:`, error);
      });
    }
  },

  updatePrefetchStatuses: (statuses) => {
    set((state) => ({
      prefetchStatuses: { ...state.prefetchStatuses, ...statuses },
    }));
  },

  refreshPrefetchStatuses: async () => {
    // Apple Music prefetch status polling was retired for local playback.
  },

  setPrefetchCount: (count) => {
    set({ prefetchCount: count });
  },

  setHlsModeEnabled: async (_enabled) => {
    const { audioRef, currentSong, isPlaying, progress } = get();
    const nextEnabled = true;

    setHlsPlaybackPreference(nextEnabled);
    resetAudioSessionManager();
    sessionManager = null;
    backgroundListenerSetup = false;

    const manager = getSessionManager();
    set({ hlsModeEnabled: nextEnabled });

    if (!audioRef || !currentSong) {
      return;
    }

    const nextUrl = withCacheBust(manager.getStreamUrl(currentSong.id));
    const resumeTime = Number.isFinite(progress)
      ? progress
      : audioRef.currentTime;
    const shouldResume = isPlaying;

    audioRef.pause();
    setManagedAudioSource(audioRef, nextUrl);

    audioRef.addEventListener(
      "loadedmetadata",
      function onLoaded() {
        if (Number.isFinite(resumeTime) && resumeTime > 0) {
          audioRef.currentTime = resumeTime;
        }
        audioRef.removeEventListener("loadedmetadata", onLoaded);
        if (shouldResume) {
          audioRef.play().catch((error) => {
            console.error(
              "[Player] Failed to resume playback after HLS mode switch:",
              error,
            );
          });
        }
      },
      { once: true },
    );
  },

  setIOSHLSQuality: async (quality, options) => {
    const {
      audioRef,
      currentSong,
      isPlaying,
      progress,
      desktopTranscodeQuality,
    } = get();
    const shouldReloadCurrent = options?.reloadCurrent ?? true;

    saveIOSHLSQuality(quality);
    set({ iosHlsQuality: quality });

    const manager = getSessionManager();
    if (
      manager.platform !== "ios" ||
      !manager.isHlsMode ||
      !shouldReloadCurrent ||
      !audioRef ||
      !currentSong
    ) {
      return;
    }

    const nextUrl = withCacheBust(
      getPlaybackStreamUrl(manager, currentSong.id, desktopTranscodeQuality),
    );
    const resumeTime = Number.isFinite(progress)
      ? progress
      : audioRef.currentTime;
    const shouldResume = isPlaying;

    audioRef.pause();
    setManagedAudioSource(audioRef, nextUrl);

    audioRef.addEventListener(
      "loadedmetadata",
      function onLoaded() {
        if (Number.isFinite(resumeTime) && resumeTime > 0) {
          audioRef.currentTime = resumeTime;
        }
        audioRef.removeEventListener("loadedmetadata", onLoaded);
        if (shouldResume) {
          audioRef.play().catch((error) => {
            console.error(
              "[Player] Failed to resume playback after iOS HLS quality switch:",
              error,
            );
          });
        }
      },
      { once: true },
    );
  },

  setDesktopTranscodeQuality: async (quality) => {
    const { audioRef, currentSong, isPlaying, progress } = get();
    const manager = getSessionManager();

    saveDesktopTranscodeQuality(quality);
    audioPreloader.clear();
    set({ desktopTranscodeQuality: quality });

    if (
      (manager.platform !== "desktop" && manager.platform !== "android") ||
      !audioRef ||
      !currentSong
    ) {
      return;
    }

    const isManualOffline = getManualOfflineMode();
    if (isManualOffline || !navigator.onLine) {
      useToastStore
        .getState()
        .showToast("当前为离线播放，音质切换会在在线流播放时生效");
      return;
    }

    const nextUrl = withCacheBust(
      getPlaybackStreamUrl(manager, currentSong.id, quality),
    );
    const resumeTime = Number.isFinite(progress)
      ? progress
      : audioRef.currentTime;
    const shouldResume = isPlaying;

    audioRef.pause();
    setManagedAudioSource(audioRef, nextUrl);

    audioRef.addEventListener(
      "loadedmetadata",
      function onLoaded() {
        if (Number.isFinite(resumeTime) && resumeTime > 0) {
          audioRef.currentTime = resumeTime;
        }
        audioRef.removeEventListener("loadedmetadata", onLoaded);
        if (shouldResume) {
          audioRef.play().catch((error) => {
            console.error(
              "[Player] Failed to resume playback after playback quality switch:",
              error,
            );
          });
        }
      },
      { once: true },
    );
  },

  // UI Actions Implementation
  toggleNowPlaying: () =>
    set((state) => {
      const newValue = !state.showNowPlaying;
      saveShowNowPlaying(newValue);
      // When closing NowPlayingView:
      // - If expanded lyrics mode is active, keep lyricsVisible so the main content area lyrics stays visible
      // - Otherwise, hide lyrics
      // When opening NowPlayingView, don't automatically show lyrics (user needs to click lyrics button)
      return {
        showNowPlaying: newValue,
        lyricsVisible: newValue
          ? state.lyricsVisible
          : state.expandedLyricsMode
            ? state.lyricsVisible
            : false,
      };
    }),
  setNowPlayingSection: (section) => set({ nowPlayingSection: section }),
  openNowPlayingSection: (section) =>
    set((state) => {
      // If NowPlayingView is open and same section (lyrics/queue) is clicked, go back to artist view
      if (state.showNowPlaying && state.nowPlayingSection === section) {
        return { nowPlayingSection: "artist" };
      }
      // Otherwise, open NowPlayingView with the specified section
      saveShowNowPlaying(true);
      return { showNowPlaying: true, nowPlayingSection: section };
    }),
  toggleLyrics: () => set((state) => ({ showLyrics: !state.showLyrics })),
  toggleQueue: () => set((state) => ({ showQueue: !state.showQueue })),
  toggleTranslation: () =>
    set((state) => {
      const newValue = !state.showTranslation;
      saveTranslationPreference(newValue);
      return { showTranslation: newValue };
    }),
  setShowTranslation: (show) => {
    saveTranslationPreference(show);
    set({ showTranslation: show });
  },
  toggleTransliteration: () =>
    set((state) => {
      const newValue = !state.showTransliteration;
      saveTransliterationPreference(newValue);
      return { showTransliteration: newValue };
    }),
  setShowTransliteration: (show) => {
    saveTransliterationPreference(show);
    set({ showTransliteration: show });
  },
  setLeftPanelWidth: (w) => {
    saveLeftPanelWidth(w);
    set({ leftPanelWidth: w });
  },
  setRightPanelWidth: (w) => {
    saveRightPanelWidth(w);
    set({ rightPanelWidth: w });
  },

  // Mini player actions
  setMiniPlayerActive: (active) => set({ isMiniPlayerActive: active }),

  // Expanded lyrics mode actions
  activateExpandedLyrics: () =>
    set((state) => {
      saveExpandedLyricsMode(true);
      saveShowNowPlaying(true);
      return {
        expandedLyricsMode: true,
        lyricsVisible: true,
        showNowPlaying: true,
        previousNowPlayingSection: state.nowPlayingSection,
        nowPlayingSection: "artist", // Switch to artist section when expanded lyrics is active
      };
    }),

  deactivateExpandedLyrics: () =>
    set((state) => {
      saveExpandedLyricsMode(false);
      saveShowNowPlaying(true);
      return {
        expandedLyricsMode: false,
        showNowPlaying: true, // Open NowPlayingView to show small lyrics
        nowPlayingSection: "lyrics", // Return to lyrics section in NowPlayingView
      };
    }),

  // Toggle lyrics visibility (for PlayerBar lyrics button)
  // When lyrics is visible: hide it (and expanded lyrics if active)
  // When lyrics is hidden: show it (restore expanded mode if it was previously expanded)
  toggleLyricsVisibility: () =>
    set((state) => {
      if (state.lyricsVisible) {
        // Hide lyrics - keep expandedLyricsMode preference
        // If expanded lyrics is active, just hide it but keep NowPlayingView open if it was showing something else
        // If normal lyrics is active (nowPlayingSection === 'lyrics'), switch to artist section
        if (state.expandedLyricsMode) {
          // Just hide expanded lyrics, keep NowPlayingView as is
          return {
            lyricsVisible: false,
          };
        } else {
          // Normal lyrics mode - switch to artist section or close NowPlayingView
          return {
            lyricsVisible: false,
            nowPlayingSection: "artist",
          };
        }
      } else {
        // Show lyrics - restore based on expandedLyricsMode preference
        saveShowNowPlaying(true);
        if (state.expandedLyricsMode) {
          // Restore expanded lyrics mode
          return {
            lyricsVisible: true,
            showNowPlaying: true,
            nowPlayingSection: "artist", // Keep artist section when expanded lyrics is shown
          };
        } else {
          // Show normal lyrics in NowPlayingView
          return {
            lyricsVisible: true,
            showNowPlaying: true,
            nowPlayingSection: "lyrics",
          };
        }
      }
    }),

  // Set lyrics visibility directly
  setLyricsVisible: (visible) => set({ lyricsVisible: visible }),

  // Fullscreen view actions
  toggleFullscreenView: () =>
    set((state) => ({
      showFullscreenView: !state.showFullscreenView,
      fullscreenLyricsMode: false, // Reset to artwork view when toggling
    })),
  setFullscreenLyricsMode: (lyrics) => set({ fullscreenLyricsMode: lyrics }),
  closeFullscreenView: () =>
    set({ showFullscreenView: false, fullscreenLyricsMode: false }),

  // Sleep timer actions
  setSleepTimer: (minutes) => {
    if (minutes === "endOfTrack") {
      set({
        sleepTimerMode: "endOfTrack",
        sleepTimerEndTime: null, // Will trigger at end of current track
      });
    } else {
      const endTime = Date.now() + minutes * 60 * 1000;
      set({
        sleepTimerMode: "time",
        sleepTimerEndTime: endTime,
      });
    }
  },

  clearSleepTimer: () => {
    set({
      sleepTimerMode: null,
      sleepTimerEndTime: null,
    });
  },

  checkSleepTimer: () => {
    const { sleepTimerMode, sleepTimerEndTime, pause, clearSleepTimer } = get();

    if (!sleepTimerMode) return;

    if (sleepTimerMode === "time" && sleepTimerEndTime) {
      if (Date.now() >= sleepTimerEndTime) {
        pause();
        clearSleepTimer();
      }
    }
    // 'endOfTrack' mode is handled in the 'next' function or when song ends
  },
}));

// Export helpers for testing
export {
  TRANSLATION_PREFERENCE_KEY,
  TRANSLITERATION_PREFERENCE_KEY,
  LEFT_PANEL_WIDTH_KEY,
  RIGHT_PANEL_WIDTH_KEY,
  SHOW_NOW_PLAYING_KEY,
  EXPANDED_LYRICS_KEY,
  loadTranslationPreference,
  saveTranslationPreference,
  loadTransliterationPreference,
  saveTransliterationPreference,
  loadLeftPanelWidth,
  saveLeftPanelWidth,
  loadRightPanelWidth,
  saveRightPanelWidth,
  loadShowNowPlaying,
  saveShowNowPlaying,
  loadExpandedLyricsMode,
  saveExpandedLyricsMode,
};
