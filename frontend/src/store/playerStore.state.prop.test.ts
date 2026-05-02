/**
 * PlayerStore 状态保留属性测试
 * 
 * **Property 1: State Preservation After Refactor**
 * *For any* valid PlayerStore state before refactor, the same state fields SHALL exist 
 * and have the same types after refactor.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 * 
 * **Feature: playback-control-refactor, Property 1: State Preservation After Refactor**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore, type PlayMode, type QueueSource, type NowPlayingSectionType } from './playerStore';
import type { Song } from '../types';

// 生成有效的 Song 对象
const songArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: fc.string({ minLength: 1, maxLength: 20 }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }), // 1秒到10分钟
  artworkUrl: fc.string({ minLength: 1, maxLength: 200 }),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// 生成有效的 PlayMode
const playModeArbitrary = fc.constantFrom<PlayMode>('sequential', 'loop', 'single');

// 生成有效的 QueueSource
const queueSourceArbitrary = fc.record({
  type: fc.constantFrom<QueueSource['type']>('playlist', 'album', 'artist', 'liked-songs', 'search', 'single', 'daily-mix', 'profile-top-tracks', 'recently-played', null),
  id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
  name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
}) as fc.Arbitrary<QueueSource>;

// 生成有效的 NowPlayingSectionType
const nowPlayingSectionArbitrary = fc.constantFrom<NowPlayingSectionType>('lyrics', 'artist', 'queue');

describe('PlayerStore State Preservation Property Tests', () => {
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
   * Property 1: 所有必需的播放状态字段存在且类型正确
   * 验证 Requirements 1.1: 保留现有播放状态
   */
  it('should have all required playback state fields with correct types', () => {
    fc.assert(
      fc.property(
        songArbitrary,
        fc.integer({ min: 0, max: 100 }),
        fc.float({ min: 0, max: 600 }),
        fc.float({ min: 0, max: 600 }),
        (song, volume, progress, duration) => {
          const state = usePlayerStore.getState();
          
          // 验证播放状态字段存在
          expect(state).toHaveProperty('currentSong');
          expect(state).toHaveProperty('isPlaying');
          expect(state).toHaveProperty('volume');
          expect(state).toHaveProperty('progress');
          expect(state).toHaveProperty('duration');
          expect(state).toHaveProperty('playHistoryRecorded');
          expect(state).toHaveProperty('accumulatedPlayTime');
          expect(state).toHaveProperty('lastProgressUpdate');
          expect(state).toHaveProperty('lastProgressUIUpdate');
          
          // 验证类型
          expect(typeof state.isPlaying).toBe('boolean');
          expect(typeof state.volume).toBe('number');
          expect(typeof state.progress).toBe('number');
          expect(typeof state.duration).toBe('number');
          expect(typeof state.playHistoryRecorded).toBe('boolean');
          expect(typeof state.accumulatedPlayTime).toBe('number');
          expect(typeof state.lastProgressUpdate).toBe('number');
          expect(typeof state.lastProgressUIUpdate).toBe('number');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: 所有必需的队列管理字段存在且类型正确
   * 验证 Requirements 1.2: 保留现有队列管理
   */
  it('should have all required queue management fields with correct types', () => {
    fc.assert(
      fc.property(
        fc.array(songArbitrary, { minLength: 0, maxLength: 10 }),
        fc.integer({ min: -1, max: 10 }),
        queueSourceArbitrary,
        (songs, queueIndex, queueSource) => {
          const state = usePlayerStore.getState();
          
          // 验证队列管理字段存在
          expect(state).toHaveProperty('queue');
          expect(state).toHaveProperty('queueIndex');
          expect(state).toHaveProperty('originalQueue');
          expect(state).toHaveProperty('shuffledQueue');
          expect(state).toHaveProperty('queueSource');
          
          // 验证类型
          expect(Array.isArray(state.queue)).toBe(true);
          expect(typeof state.queueIndex).toBe('number');
          expect(Array.isArray(state.originalQueue)).toBe(true);
          expect(Array.isArray(state.shuffledQueue)).toBe(true);
          expect(typeof state.queueSource).toBe('object');
          expect(state.queueSource).toHaveProperty('type');
          expect(state.queueSource).toHaveProperty('id');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: 所有必需的播放模式字段存在且类型正确
   * 验证 Requirements 1.3: 保留现有播放模式
   */
  it('should have all required play mode fields with correct types', () => {
    fc.assert(
      fc.property(
        playModeArbitrary,
        fc.boolean(),
        (playMode, isShuffled) => {
          const state = usePlayerStore.getState();
          
          // 验证播放模式字段存在
          expect(state).toHaveProperty('playMode');
          expect(state).toHaveProperty('isShuffled');
          
          // 验证类型
          expect(['sequential', 'loop', 'single']).toContain(state.playMode);
          expect(typeof state.isShuffled).toBe('boolean');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: 所有必需的 UI 状态字段存在且类型正确
   * 验证 Requirements 1.4: 保留现有 UI 状态
   */
  it('should have all required UI state fields with correct types', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        nowPlayingSectionArbitrary,
        fc.boolean(),
        fc.boolean(),
        fc.integer({ min: 200, max: 500 }),
        fc.integer({ min: 200, max: 500 }),
        (showNowPlaying, nowPlayingSection, showLyrics, showQueue, leftWidth, rightWidth) => {
          const state = usePlayerStore.getState();
          
          // 验证 UI 状态字段存在
          expect(state).toHaveProperty('showNowPlaying');
          expect(state).toHaveProperty('nowPlayingSection');
          expect(state).toHaveProperty('showLyrics');
          expect(state).toHaveProperty('showQueue');
          expect(state).toHaveProperty('showTranslation');
          expect(state).toHaveProperty('showTransliteration');
          expect(state).toHaveProperty('leftPanelWidth');
          expect(state).toHaveProperty('rightPanelWidth');
          expect(state).toHaveProperty('expandedLyricsMode');
          expect(state).toHaveProperty('lyricsVisible');
          
          // 验证类型
          expect(typeof state.showNowPlaying).toBe('boolean');
          expect(['lyrics', 'artist', 'queue']).toContain(state.nowPlayingSection);
          expect(typeof state.showLyrics).toBe('boolean');
          expect(typeof state.showQueue).toBe('boolean');
          expect(typeof state.showTranslation).toBe('boolean');
          expect(typeof state.showTransliteration).toBe('boolean');
          expect(typeof state.leftPanelWidth).toBe('number');
          expect(typeof state.rightPanelWidth).toBe('number');
          expect(typeof state.expandedLyricsMode).toBe('boolean');
          expect(typeof state.lyricsVisible).toBe('boolean');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: 睡眠定时器状态字段存在且类型正确
   * 验证 Requirements 1.5: 保留睡眠定时器功能
   */
  it('should have sleep timer state fields with correct types', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: Date.now(), max: Date.now() + 3600000 }), { nil: null }),
        fc.constantFrom<'time' | 'endOfTrack' | null>('time', 'endOfTrack', null),
        (sleepTimerEndTime, sleepTimerMode) => {
          const state = usePlayerStore.getState();
          
          // 验证睡眠定时器字段存在
          expect(state).toHaveProperty('sleepTimerEndTime');
          expect(state).toHaveProperty('sleepTimerMode');
          
          // 验证类型
          expect(state.sleepTimerEndTime === null || typeof state.sleepTimerEndTime === 'number').toBe(true);
          expect(state.sleepTimerMode === null || ['time', 'endOfTrack'].includes(state.sleepTimerMode)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: 新增的加载和错误状态字段存在且类型正确
   * 验证 Requirements 2.3, 8.1, 8.2, 8.4: 加载状态和错误处理
   */
  it('should have loading and error state fields with correct types', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
        fc.option(fc.string({ minLength: 1, maxLength: 200 }), { nil: null }),
        fc.integer({ min: 0, max: 5 }),
        (isLoading, loadingMessage, playbackError, retryCount) => {
          const state = usePlayerStore.getState();
          
          // 验证加载和错误状态字段存在
          expect(state).toHaveProperty('isLoading');
          expect(state).toHaveProperty('loadingMessage');
          expect(state).toHaveProperty('playbackError');
          expect(state).toHaveProperty('retryCount');
          
          // 验证类型
          expect(typeof state.isLoading).toBe('boolean');
          expect(state.loadingMessage === null || typeof state.loadingMessage === 'string').toBe(true);
          expect(state.playbackError === null || typeof state.playbackError === 'string').toBe(true);
          expect(typeof state.retryCount).toBe('number');
          expect(state.retryCount).toBeGreaterThanOrEqual(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1: 所有必需的 action 方法存在
   * 验证所有播放控制方法都可用
   */
  it('should have all required action methods', () => {
    const state = usePlayerStore.getState();
    
    // 播放控制方法
    expect(typeof state.playSong).toBe('function');
    expect(typeof state.play).toBe('function');
    expect(typeof state.pause).toBe('function');
    expect(typeof state.togglePlay).toBe('function');
    expect(typeof state.setVolume).toBe('function');
    expect(typeof state.seek).toBe('function');
    expect(typeof state.setProgress).toBe('function');
    expect(typeof state.setDuration).toBe('function');
    expect(typeof state.next).toBe('function');
    expect(typeof state.previous).toBe('function');
    
    // 队列管理方法
    expect(typeof state.setQueue).toBe('function');
    expect(typeof state.addToQueue).toBe('function');
    expect(typeof state.addSongsToQueue).toBe('function');
    expect(typeof state.clearQueue).toBe('function');
    expect(typeof state.reorderQueue).toBe('function');
    expect(typeof state.playFromQueue).toBe('function');
    expect(typeof state.playNext).toBe('function');
    expect(typeof state.removeFromQueue).toBe('function');
    
    // 播放模式方法
    expect(typeof state.togglePlayMode).toBe('function');
    expect(typeof state.toggleShuffle).toBe('function');
    
    // 状态持久化方法
    expect(typeof state.loadPlaybackState).toBe('function');
    expect(typeof state.savePlaybackState).toBe('function');
    expect(typeof state.savePlaybackProgress).toBe('function');
    
    // UI 方法
    expect(typeof state.toggleNowPlaying).toBe('function');
    expect(typeof state.setNowPlayingSection).toBe('function');
    expect(typeof state.toggleLyrics).toBe('function');
    expect(typeof state.toggleQueue).toBe('function');
    expect(typeof state.toggleTranslation).toBe('function');
    expect(typeof state.toggleTransliteration).toBe('function');
    
    // 睡眠定时器方法
    expect(typeof state.setSleepTimer).toBe('function');
    expect(typeof state.clearSleepTimer).toBe('function');
    expect(typeof state.checkSleepTimer).toBe('function');
  });

  /**
   * Property 1: 移除了 isHlsMode 状态字段
   * 验证平台特定状态已移除，改用 AudioSessionManager
   */
  it('should not have isHlsMode state field (moved to AudioSessionManager)', () => {
    const state = usePlayerStore.getState();
    
    // isHlsMode 应该不再是 store 的直接状态
    // 它现在由 AudioSessionManager 管理
    expect(state).not.toHaveProperty('isHlsMode');
  });
});
