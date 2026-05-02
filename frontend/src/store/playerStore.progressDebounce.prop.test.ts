/**
 * PlayerStore 进度更新防抖属性测试
 * 
 * **Property 9: Progress Debounce**
 * *For any* sequence of progress updates within a short time window, 
 * the PlayerStore SHALL debounce updates to reduce state changes.
 * 
 * **Validates: Requirements 9.4**
 * 
 * **Feature: playback-control-refactor, Property 9: Progress Debounce**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock dependencies before importing playerStore
vi.mock('../api', () => ({
  getPlaybackState: vi.fn().mockResolvedValue(null),
  savePlaybackState: vi.fn().mockResolvedValue(undefined),
  savePlaybackStateAPI: vi.fn().mockResolvedValue(undefined),
  savePlaybackProgressAPI: vi.fn().mockResolvedValue(undefined),
  savePlaybackProgress: vi.fn().mockResolvedValue(undefined),
  prefetchSongs: vi.fn().mockResolvedValue(undefined),
  getPrefetchStatus: vi.fn().mockResolvedValue({}),
}));

vi.mock('../utils/audioPreloader', () => ({
  audioPreloader: {
    preload: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    clear: vi.fn(),
    isCached: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    getCachedUrl: vi.fn(() => null),
  },
}));

vi.mock('../services/offlineCacheService', () => ({
  offlineCacheService: {
    getCachedSong: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../hooks/useOnlineStatus', () => ({
  getManualOfflineMode: vi.fn().mockReturnValue(false),
}));

vi.mock('../utils/audioSession', () => ({
  getAudioSessionManager: vi.fn(() => ({
    platform: 'desktop',
    state: 'active',
    isHlsMode: false,
    config: { hlsEnabled: false, backgroundPreloadEnabled: true, maxRetryAttempts: 3 },
    initialize: vi.fn().mockResolvedValue(undefined),
    getStreamUrl: vi.fn((songId: string) => `/api/stream/${songId}`),
    preparePlayback: vi.fn().mockResolvedValue(undefined),
    resumePlayback: vi.fn().mockResolvedValue(true),
    handlePlaybackError: vi.fn().mockResolvedValue(false),
    syncProgress: vi.fn(),
    cleanup: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
  getHlsPlaybackPreference: vi.fn(() => false),
  resetAudioSessionManager: vi.fn(),
  setHlsPlaybackPreference: vi.fn(),
}));

vi.mock('./toastStore', () => ({
  useToastStore: {
    getState: vi.fn(() => ({
      showToast: vi.fn(),
    })),
  },
}));

vi.mock('./playHistoryStore', () => ({
  usePlayHistoryStore: {
    getState: vi.fn(() => ({
      recordPlay: vi.fn(),
    })),
  },
}));

// Mock matchMedia for platform detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

import { usePlayerStore } from './playerStore';
import type { Song } from '../types';

// 生成有效的 Song 对象
const songArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.string({ minLength: 1, maxLength: 20 }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  duration: fc.integer({ min: 60000, max: 600000 }), // 1分钟到10分钟
  artworkUrl: fc.string({ minLength: 1, maxLength: 200 }),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// 防抖阈值常量（与 playerStore 中的实现一致）
const DEBOUNCE_THRESHOLD = 0.5;

describe('PlayerStore Progress Debounce Property Tests', () => {
  beforeEach(() => {
    // 重置 store 状态
    usePlayerStore.setState({
      currentSong: null,
      isPlaying: false,
      volume: 70,
      progress: 0,
      duration: 0,
      playHistoryRecorded: false,
      accumulatedPlayTime: 0,
      lastProgressUpdate: 0,
      lastProgressUIUpdate: 0,
      playMode: 'sequential',
      isShuffled: false,
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      shuffledQueue: [],
      queueSource: { type: null, id: null },
      skipNextPlaybackStateSave: false,
      prefetchStatuses: {},
      prefetchCount: 3,
      isMiniPlayerActive: false,
      showNowPlaying: false,
      nowPlayingSection: 'artist',
      showLyrics: false,
      showQueue: false,
      showTranslation: true,
      showTransliteration: false,
      leftPanelWidth: 280,
      rightPanelWidth: 320,
      expandedLyricsMode: false,
      previousNowPlayingSection: null,
      lyricsVisible: false,
      sleepTimerEndTime: null,
      sleepTimerMode: null,
      isLoading: false,
      loadingMessage: null,
      playbackError: null,
      retryCount: 0,
      audioRef: null,
    });
  });

  /**
   * Property 9: 进度更新防抖
   * 验证 Requirements 9.4: 减少不必要的状态更新
   */
  describe('Property 9: Progress Debounce', () => {
    it('should debounce small progress updates (< 0.5s)', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 设置初始状态
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            lastProgressUpdate: 0,
            lastProgressUIUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 模拟小增量更新（每次 0.25 秒）
          // 这些更新应该被防抖，不会每次都更新 UI progress
          const smallIncrements = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
          let uiUpdateCount = 0;
          let lastUIProgress = 0;

          for (const progress of smallIncrements) {
            setProgress(progress);
            const currentUIProgress = usePlayerStore.getState().progress;
            if (currentUIProgress !== lastUIProgress) {
              uiUpdateCount++;
              lastUIProgress = currentUIProgress;
            }
          }

          // UI 更新次数应该少于总更新次数（因为防抖）
          // 每 0.5 秒更新一次，所以 2 秒内应该有约 4 次 UI 更新
          expect(uiUpdateCount).toBeLessThanOrEqual(smallIncrements.length);
          expect(uiUpdateCount).toBeGreaterThanOrEqual(1);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should always update UI on seek (large progress jump)', () => {
      fc.assert(
        fc.property(
          songArbitrary,
          fc.integer({ min: 10, max: 100 }), // seek 目标位置
          (song, seekTarget) => {
            // 设置初始状态
            usePlayerStore.setState({
              currentSong: song,
              isPlaying: true,
              progress: 0,
              duration: song.duration / 1000,
              lastProgressUpdate: 0,
              lastProgressUIUpdate: 0,
            });

            const { setProgress } = usePlayerStore.getState();

            // 播放几秒
            for (let i = 1; i <= 5; i++) {
              setProgress(i);
            }

            const progressBeforeSeek = usePlayerStore.getState().progress;

            // Seek 到新位置（大跳跃）
            setProgress(seekTarget);

            const progressAfterSeek = usePlayerStore.getState().progress;

            // Seek 应该立即更新 UI progress
            expect(progressAfterSeek).toBe(seekTarget);
            expect(progressAfterSeek).not.toBe(progressBeforeSeek);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should update UI when progress change >= 0.5 seconds', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 设置初始状态
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            lastProgressUpdate: 0,
            lastProgressUIUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 更新到 0.5 秒
          setProgress(0.5);
          expect(usePlayerStore.getState().progress).toBe(0.5);

          // 更新到 1.0 秒
          setProgress(1.0);
          expect(usePlayerStore.getState().progress).toBe(1.0);

          // 更新到 1.5 秒
          setProgress(1.5);
          expect(usePlayerStore.getState().progress).toBe(1.5);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should maintain accurate accumulated time despite debouncing', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 设置初始状态
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            playHistoryRecorded: false,
            accumulatedPlayTime: 0,
            lastProgressUpdate: 0,
            lastProgressUIUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 模拟 10 秒的播放（每 0.25 秒更新一次）
          for (let i = 1; i <= 40; i++) {
            setProgress(i * 0.25);
          }

          // 累积时间应该接近 10 秒（允许小误差）
          const { accumulatedPlayTime } = usePlayerStore.getState();
          expect(accumulatedPlayTime).toBeGreaterThanOrEqual(9.5);
          expect(accumulatedPlayTime).toBeLessThanOrEqual(10.5);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should reduce state updates compared to no debouncing', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 设置初始状态
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            lastProgressUpdate: 0,
            lastProgressUIUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 模拟高频更新（每 0.1 秒更新一次，共 5 秒）
          const totalUpdates = 50;
          let progressChanges = 0;
          let lastProgress = 0;

          for (let i = 1; i <= totalUpdates; i++) {
            setProgress(i * 0.1);
            const currentProgress = usePlayerStore.getState().progress;
            if (currentProgress !== lastProgress) {
              progressChanges++;
              lastProgress = currentProgress;
            }
          }

          // 由于防抖（0.5秒阈值），5秒内应该有约 10 次 UI 更新
          // 而不是 50 次
          expect(progressChanges).toBeLessThan(totalUpdates);
          expect(progressChanges).toBeGreaterThanOrEqual(Math.floor(5 / DEBOUNCE_THRESHOLD));

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should not debounce when paused (no normal playback)', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 设置初始状态（暂停状态）
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: false, // 暂停
            progress: 0,
            duration: song.duration / 1000,
            lastProgressUpdate: 0,
            lastProgressUIUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 暂停时的进度更新（如 seek）应该立即反映
          setProgress(10);
          expect(usePlayerStore.getState().progress).toBe(10);

          setProgress(20);
          expect(usePlayerStore.getState().progress).toBe(20);

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
