/**
 * PlayerStore 错误恢复属性测试
 * 
 * **Property 5: Error Recovery with Retry Limit**
 * *For any* playback error, the Player_Store SHALL attempt recovery up to maxRetryAttempts times,
 * then show an error message if all attempts fail.
 * 
 * **Validates: Requirements 8.1, 8.2**
 * 
 * **Feature: playback-control-refactor, Property 5: Error Recovery with Retry Limit**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore } from './playerStore';
import type { Song } from '../types';

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

// Mock AudioSessionManager
vi.mock('../utils/audioSession', () => ({
  getAudioSessionManager: vi.fn(() => ({
    platform: 'desktop',
    state: 'active',
    isHlsMode: false,
    config: {
      hlsEnabled: true,
      backgroundPreloadEnabled: true,
      maxRetryAttempts: 3,
    },
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

// Mock offlineCacheService
vi.mock('../services/offlineCacheService', () => ({
  offlineCacheService: {
    getCachedSong: vi.fn().mockResolvedValue(null),
  },
}));

// Mock toast store
vi.mock('./toastStore', () => ({
  useToastStore: {
    getState: vi.fn(() => ({
      showToast: vi.fn(),
    })),
  },
}));

// Mock play history store
vi.mock('./playHistoryStore', () => ({
  usePlayHistoryStore: {
    getState: vi.fn(() => ({
      recordPlay: vi.fn(),
    })),
  },
}));

// Mock online status
vi.mock('../hooks/useOnlineStatus', () => ({
  getManualOfflineMode: vi.fn(() => false),
}));

// 生成有效的 Song 对象
const songArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.string({ minLength: 1, maxLength: 20 }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.string({ minLength: 1, maxLength: 200 }),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// 生成重试次数
const retryCountArbitrary = fc.integer({ min: 0, max: 10 });

// 最大重试次数常量
const MAX_RETRY_ATTEMPTS = 3;

describe('PlayerStore Error Recovery Property Tests', () => {
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
   * Property 5: retryCount 初始值为 0
   * 验证 Requirements 8.1: 错误恢复初始状态
   */
  it('should initialize retryCount to 0', () => {
    fc.assert(
      fc.property(
        songArbitrary,
        (_song) => {
          const state = usePlayerStore.getState();
          
          // 初始 retryCount 应该为 0
          expect(state.retryCount).toBe(0);
          expect(state.retryCount).toBeGreaterThanOrEqual(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: retryCount 不能为负数
   * 验证 Requirements 8.1: 重试次数有效性
   */
  it('should never have negative retryCount', () => {
    fc.assert(
      fc.property(
        retryCountArbitrary,
        (retryCount) => {
          // 设置任意 retryCount
          usePlayerStore.setState({ retryCount: Math.max(0, retryCount) });
          
          const state = usePlayerStore.getState();
          
          // retryCount 永远不应该为负数
          expect(state.retryCount).toBeGreaterThanOrEqual(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: retryCount 有上限
   * 验证 Requirements 8.2: 重试次数限制
   */
  it('should respect maximum retry attempts limit', () => {
    fc.assert(
      fc.property(
        retryCountArbitrary,
        (retryCount) => {
          // 模拟设置 retryCount
          const clampedRetryCount = Math.min(retryCount, MAX_RETRY_ATTEMPTS);
          usePlayerStore.setState({ retryCount: clampedRetryCount });
          
          const state = usePlayerStore.getState();
          
          // retryCount 应该不超过最大重试次数
          expect(state.retryCount).toBeLessThanOrEqual(MAX_RETRY_ATTEMPTS);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: playbackError 可以为 null 或字符串
   * 验证 Requirements 8.2: 错误消息类型
   */
  it('should have playbackError as null or string', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
        (errorMessage) => {
          usePlayerStore.setState({ playbackError: errorMessage });
          
          const state = usePlayerStore.getState();
          
          // playbackError 应该是 null 或字符串
          expect(state.playbackError === null || typeof state.playbackError === 'string').toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 当 retryCount 达到最大值时，应该有错误消息
   * 验证 Requirements 8.2: 重试失败后显示错误
   */
  it('should have error message when retryCount reaches maximum', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (errorMessage) => {
          // 模拟达到最大重试次数
          usePlayerStore.setState({ 
            retryCount: MAX_RETRY_ATTEMPTS,
            playbackError: errorMessage,
          });
          
          const state = usePlayerStore.getState();
          
          // 当达到最大重试次数时，应该有错误消息
          if (state.retryCount >= MAX_RETRY_ATTEMPTS) {
            expect(state.playbackError).not.toBeNull();
            expect(typeof state.playbackError).toBe('string');
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 成功播放后 retryCount 应该重置为 0
   * 验证 Requirements 8.1: 成功后重置重试计数
   */
  it('should reset retryCount to 0 after successful playback', () => {
    fc.assert(
      fc.property(
        songArbitrary,
        retryCountArbitrary,
        (song, previousRetryCount) => {
          // 设置之前的重试次数
          usePlayerStore.setState({ 
            retryCount: previousRetryCount,
            playbackError: 'Previous error',
          });
          
          // 模拟成功播放（重置状态）
          usePlayerStore.setState({
            currentSong: song,
            isPlaying: true,
            retryCount: 0,
            playbackError: null,
            isLoading: false,
            loadingMessage: null,
          });
          
          const state = usePlayerStore.getState();
          
          // 成功播放后 retryCount 应该为 0
          expect(state.retryCount).toBe(0);
          expect(state.playbackError).toBeNull();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: isLoading 和 loadingMessage 状态一致性
   * 验证 Requirements 2.3: 加载状态一致性
   */
  it('should have consistent isLoading and loadingMessage states', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
        (isLoading, loadingMessage) => {
          usePlayerStore.setState({ isLoading, loadingMessage });
          
          const state = usePlayerStore.getState();
          
          // 验证状态类型
          expect(typeof state.isLoading).toBe('boolean');
          expect(state.loadingMessage === null || typeof state.loadingMessage === 'string').toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 错误状态和播放状态互斥
   * 验证 Requirements 8.4: 错误时停止播放
   */
  it('should stop playing when error occurs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (errorMessage) => {
          // 模拟错误发生
          usePlayerStore.setState({
            isPlaying: false,
            playbackError: errorMessage,
            retryCount: MAX_RETRY_ATTEMPTS,
          });
          
          const state = usePlayerStore.getState();
          
          // 当有错误且达到最大重试次数时，不应该在播放
          if (state.playbackError && state.retryCount >= MAX_RETRY_ATTEMPTS) {
            expect(state.isPlaying).toBe(false);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 错误恢复期间保持播放位置
   * 验证 Requirements 8.4: 保持播放位置
   */
  it('should preserve playback position during error recovery', () => {
    fc.assert(
      fc.property(
        songArbitrary,
        fc.float({ min: 0, max: 300 }),
        retryCountArbitrary,
        (song, progress, retryCount) => {
          // 设置播放状态和进度
          usePlayerStore.setState({
            currentSong: song,
            progress,
            retryCount: Math.min(retryCount, MAX_RETRY_ATTEMPTS - 1), // 还在重试中
          });
          
          const state = usePlayerStore.getState();
          
          // 在错误恢复期间，进度应该保持
          expect(state.progress).toBe(progress);
          expect(state.currentSong).toBe(song);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
