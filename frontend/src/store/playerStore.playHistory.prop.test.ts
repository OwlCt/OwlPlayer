/**
 * PlayerStore 播放历史记录阈值属性测试
 * 
 * **Property 8: Play History Recording Threshold**
 * *For any* song playback, play history SHALL be recorded if and only if 
 * accumulated play time reaches 30 seconds.
 * 
 * **Validates: Requirements 1.6**
 * 
 * **Feature: playback-control-refactor, Property 8: Play History Recording Threshold**
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

// Track recordPlay calls
const recordPlayMock = vi.fn();

vi.mock('./playHistoryStore', () => ({
  usePlayHistoryStore: {
    getState: vi.fn(() => ({
      recordPlay: recordPlayMock,
    })),
  },
}));

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
  duration: fc.integer({ min: 30000, max: 600000 }), // 30秒到10分钟
  artworkUrl: fc.string({ minLength: 1, maxLength: 200 }),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// 生成进度更新序列（模拟正常播放）
const progressSequenceArbitrary = (maxDuration: number) => 
  fc.array(
    fc.float({ min: 0.5, max: 1.5 }), // 每次更新增量 0.5-1.5 秒
    { minLength: 1, maxLength: 60 }
  ).map(deltas => {
    let current = 0;
    return deltas.map(delta => {
      current += delta;
      return Math.min(current, maxDuration);
    });
  });

describe('PlayerStore Play History Threshold Property Tests', () => {
  beforeEach(() => {
    // 重置 mock
    recordPlayMock.mockClear();
    
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
   * Property 8: 播放历史在累积播放时间达到30秒时记录
   * 验证 Requirements 1.6: 30秒阈值正确工作
   */
  describe('Property 8: Play History Recording Threshold', () => {
    it('should record play history when accumulated time reaches 30 seconds', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 重置状态
          recordPlayMock.mockClear();
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            playHistoryRecorded: false,
            accumulatedPlayTime: 0,
            lastProgressUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 模拟播放到29秒 - 不应该记录
          for (let i = 1; i <= 29; i++) {
            setProgress(i);
          }
          
          expect(recordPlayMock).not.toHaveBeenCalled();
          expect(usePlayerStore.getState().playHistoryRecorded).toBe(false);

          // 播放到30秒 - 应该记录
          setProgress(30);
          
          expect(recordPlayMock).toHaveBeenCalledTimes(1);
          expect(recordPlayMock).toHaveBeenCalledWith(song);
          expect(usePlayerStore.getState().playHistoryRecorded).toBe(true);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should not record play history before 30 seconds', () => {
      fc.assert(
        fc.property(
          songArbitrary,
          fc.integer({ min: 1, max: 29 }),
          (song, maxProgress) => {
            // 重置状态
            recordPlayMock.mockClear();
            usePlayerStore.setState({
              currentSong: song,
              isPlaying: true,
              progress: 0,
              duration: song.duration / 1000,
              playHistoryRecorded: false,
              accumulatedPlayTime: 0,
              lastProgressUpdate: 0,
            });

            const { setProgress } = usePlayerStore.getState();

            // 模拟播放到 maxProgress 秒（小于30秒）
            for (let i = 1; i <= maxProgress; i++) {
              setProgress(i);
            }

            // 不应该记录播放历史
            expect(recordPlayMock).not.toHaveBeenCalled();
            expect(usePlayerStore.getState().playHistoryRecorded).toBe(false);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should only record play history once per song', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 重置状态
          recordPlayMock.mockClear();
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            playHistoryRecorded: false,
            accumulatedPlayTime: 0,
            lastProgressUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 播放到60秒
          for (let i = 1; i <= 60; i++) {
            setProgress(i);
          }

          // 应该只记录一次
          expect(recordPlayMock).toHaveBeenCalledTimes(1);
          expect(usePlayerStore.getState().playHistoryRecorded).toBe(true);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should not count seek operations towards accumulated time', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 重置状态
          recordPlayMock.mockClear();
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            playHistoryRecorded: false,
            accumulatedPlayTime: 0,
            lastProgressUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 播放10秒
          for (let i = 1; i <= 10; i++) {
            setProgress(i);
          }
          
          // Seek 到 50 秒（大跳跃，不应计入累积时间）
          setProgress(50);
          
          // 继续播放10秒（从50到60）
          for (let i = 51; i <= 60; i++) {
            setProgress(i);
          }

          // 累积时间应该是 10 + 10 = 20 秒，不应该记录
          expect(recordPlayMock).not.toHaveBeenCalled();
          expect(usePlayerStore.getState().playHistoryRecorded).toBe(false);
          
          // 累积时间应该约为 20 秒
          const { accumulatedPlayTime } = usePlayerStore.getState();
          expect(accumulatedPlayTime).toBeGreaterThanOrEqual(19);
          expect(accumulatedPlayTime).toBeLessThanOrEqual(21);

          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should reset accumulated time when playing a new song', () => {
      fc.assert(
        fc.property(
          songArbitrary,
          songArbitrary,
          (song1, song2) => {
            // 确保两首歌不同
            if (song1.id === song2.id) return true;

            // 重置状态
            recordPlayMock.mockClear();
            usePlayerStore.setState({
              currentSong: song1,
              isPlaying: true,
              progress: 0,
              duration: song1.duration / 1000,
              playHistoryRecorded: false,
              accumulatedPlayTime: 0,
              lastProgressUpdate: 0,
            });

            const { setProgress } = usePlayerStore.getState();

            // 播放第一首歌20秒
            for (let i = 1; i <= 20; i++) {
              setProgress(i);
            }

            // 切换到第二首歌（模拟 playSong 的状态重置）
            usePlayerStore.setState({
              currentSong: song2,
              isPlaying: true,
              progress: 0,
              duration: song2.duration / 1000,
              playHistoryRecorded: false,
              accumulatedPlayTime: 0,
              lastProgressUpdate: 0,
            });

            // 播放第二首歌15秒
            for (let i = 1; i <= 15; i++) {
              setProgress(i);
            }

            // 不应该记录（第二首歌只播放了15秒）
            expect(recordPlayMock).not.toHaveBeenCalled();

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not count time when paused', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // 重置状态
          recordPlayMock.mockClear();
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            progress: 0,
            duration: song.duration / 1000,
            playHistoryRecorded: false,
            accumulatedPlayTime: 0,
            lastProgressUpdate: 0,
          });

          const { setProgress } = usePlayerStore.getState();

          // 播放15秒
          for (let i = 1; i <= 15; i++) {
            setProgress(i);
          }

          // 暂停
          usePlayerStore.setState({ isPlaying: false });

          // 尝试更新进度（暂停时不应计入）
          for (let i = 16; i <= 35; i++) {
            setProgress(i);
          }

          // 不应该记录（暂停时的进度更新不计入累积时间）
          expect(recordPlayMock).not.toHaveBeenCalled();

          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
});
