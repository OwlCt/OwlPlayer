/**
 * Property-based tests for Queue Operations
 * 
 * **Feature: play-queue-refactor**
 * Tests the correctness properties for queue reordering, playFromQueue, and addToQueue
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore, PlayMode } from './playerStore';
import { Song } from '../types';

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
  getManualOfflineMode: vi.fn(() => false),
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

// Mock window.matchMedia before any tests run
beforeAll(() => {
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
});

// Arbitrary for generating play mode types
const playModeArb = fc.constantFrom<PlayMode>('sequential', 'loop', 'single');

// Arbitrary for generating a song
const songArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// Arbitrary for generating a non-empty queue with a valid index
const queueWithIndexArb = fc.array(songArb, { minLength: 1, maxLength: 20 })
  .chain(queue => 
    fc.record({
      queue: fc.constant(queue),
      queueIndex: fc.integer({ min: 0, max: queue.length - 1 }),
    })
  );

const queueWithAlternateIndexArb = fc.array(songArb, { minLength: 2, maxLength: 20 })
  .chain(queue =>
    fc.record({
      queue: fc.constant(queue),
      queueIndex: fc.integer({ min: 0, max: queue.length - 1 }),
    })
  );

// Arbitrary for generating a queue with valid from/to indices for reordering
const queueWithReorderIndicesArb = fc.array(songArb, { minLength: 2, maxLength: 20 })
  .chain(queue => 
    fc.record({
      queue: fc.constant(queue),
      queueIndex: fc.integer({ min: 0, max: queue.length - 1 }),
      fromIndex: fc.integer({ min: 0, max: queue.length - 1 }),
      toIndex: fc.integer({ min: 0, max: queue.length - 1 }),
    })
  )
  .filter(({ fromIndex, toIndex }) => fromIndex !== toIndex);

describe('Queue Operations', () => {
  const originalPlaySong = usePlayerStore.getState().playSong;

  beforeEach(() => {
    // Reset store state before each test
    usePlayerStore.setState({
      playMode: 'sequential',
      isShuffled: false,
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      shuffledQueue: [],
      currentSong: null,
      isPlaying: false,
      isLoading: false,
      loadingMessage: null,
      audioRef: {
        src: '',
        currentTime: 0,
        volume: 0.7,
        paused: true,
        readyState: 4,
        load: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      } as unknown as HTMLAudioElement,
      playSong: originalPlaySong,
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 9: Reorder updates queue position**
   * 
   * *For any* queue and valid from/to indices, reordering SHALL move the song 
   * from fromIndex to toIndex, shifting other songs accordingly.
   * 
   * **Validates: Requirements 4.2**
   */
  describe('Property 9: Reorder updates queue position', () => {
    it('should move song from fromIndex to toIndex', () => {
      fc.assert(
        fc.property(queueWithReorderIndicesArb, ({ queue, queueIndex, fromIndex, toIndex }) => {
          const currentSong = queue[queueIndex];
          const movedSong = queue[fromIndex];
          
          // Setup: set queue with current song
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
          });
          
          // Action: reorder queue
          usePlayerStore.getState().reorderQueue(fromIndex, toIndex);
          
          // Assert: the moved song should be at toIndex
          const state = usePlayerStore.getState();
          expect(state.queue[toIndex].id).toBe(movedSong.id);
          
          // Assert: queue length should remain the same
          expect(state.queue.length).toBe(queue.length);
          
          // Assert: all songs should still be in the queue
          const originalIds = queue.map(s => s.id).sort();
          const newIds = state.queue.map(s => s.id).sort();
          expect(newIds).toEqual(originalIds);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 10: Reorder preserves current song**
   * 
   * *For any* reorder operation, the currently playing song SHALL remain the same 
   * (currentSong unchanged), only the index may change.
   * 
   * **Validates: Requirements 4.4**
   */
  describe('Property 10: Reorder preserves current song', () => {
    it('should preserve the currently playing song after reorder', () => {
      fc.assert(
        fc.property(queueWithReorderIndicesArb, ({ queue, queueIndex, fromIndex, toIndex }) => {
          const currentSong = queue[queueIndex];
          
          // Setup: set queue with current song
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
          });
          
          // Action: reorder queue
          usePlayerStore.getState().reorderQueue(fromIndex, toIndex);
          
          // Assert: current song should remain the same
          const state = usePlayerStore.getState();
          expect(state.currentSong?.id).toBe(currentSong.id);
          
          // Assert: queueIndex should point to the current song
          expect(state.queue[state.queueIndex].id).toBe(currentSong.id);
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: play-queue-refactor, Property 11: Double-click plays selected song**
   * 
   * *For any* queue and valid index, double-clicking a song SHALL set that song 
   * as currentSong and update queueIndex to match.
   * 
   * **Validates: Requirements 5.1, 5.2**
   */
  describe('Property 11: Double-click plays selected song', () => {
    it('should play the selected song and update queueIndex', () => {
      fc.assert(
        fc.property(queueWithAlternateIndexArb, ({ queue, queueIndex }) => {
          const initialSong = queue[queueIndex];
          
          // Generate a different index to click on
          const clickIndex = (queueIndex + 1) % queue.length;
          const clickedSong = queue[clickIndex];
          const playSongMock = vi.fn((song: Song) => {
            usePlayerStore.setState({
              currentSong: song,
              isPlaying: true,
              isLoading: false,
              loadingMessage: null,
            });
          });
          
          // Setup: set queue with current song
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: initialSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
            isPlaying: false,
            isLoading: false,
            loadingMessage: null,
            playSong: playSongMock as typeof originalPlaySong,
          });
          
          // Action: play from queue (double-click)
          usePlayerStore.getState().playFromQueue(clickIndex);
          
          // Assert: clicked song should be current song
          const state = usePlayerStore.getState();
          expect(state.currentSong?.id).toBe(clickedSong.id);
          expect(state.queueIndex).toBe(clickIndex);
          expect(state.isPlaying).toBe(true);
          expect(playSongMock).toHaveBeenCalledWith(clickedSong);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 12: Double-click preserves mode and shuffle**
   * 
   * *For any* double-click operation, playMode and isShuffled SHALL remain unchanged.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 12: Double-click preserves mode and shuffle', () => {
    it('should preserve playMode and isShuffled after double-click', () => {
      fc.assert(
        fc.property(
          queueWithIndexArb,
          playModeArb,
          fc.boolean(),
          ({ queue, queueIndex }, playMode, isShuffled) => {
            const initialSong = queue[queueIndex];
            const clickIndex = (queueIndex + 1) % queue.length;
            const playSongMock = vi.fn((song: Song) => {
              usePlayerStore.setState({
                currentSong: song,
                isPlaying: true,
                isLoading: false,
                loadingMessage: null,
              });
            });
            
            // Setup: set queue with current song, playMode, and shuffle state
            usePlayerStore.setState({
              queue: [...queue],
              queueIndex: queueIndex,
              currentSong: initialSong,
              originalQueue: [...queue],
              shuffledQueue: isShuffled ? [...queue] : [],
              isShuffled: isShuffled,
              playMode: playMode,
              isPlaying: false,
              isLoading: false,
              loadingMessage: null,
              playSong: playSongMock as typeof originalPlaySong,
            });
            
            // Action: play from queue (double-click)
            usePlayerStore.getState().playFromQueue(clickIndex);
            
            // Assert: playMode and isShuffled should remain unchanged
            const state = usePlayerStore.getState();
            expect(state.playMode).toBe(playMode);
            expect(state.isShuffled).toBe(isShuffled);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 13: Add to queue appends to end**
   * 
   * *For any* queue and new song, addToQueue SHALL append the song to the end 
   * of the queue (queue.length increases by 1, last element is the new song).
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 13: Add to queue appends to end', () => {
    it('should append new song to the end of the queue', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 0, maxLength: 19 }),
          songArb,
          (queue, newSong) => {
            // Ensure newSong is not already in queue
            const filteredQueue = queue.filter(s => s.id !== newSong.id);
            const originalLength = filteredQueue.length;
            
            // Setup: set queue
            usePlayerStore.setState({
              queue: [...filteredQueue],
              queueIndex: filteredQueue.length > 0 ? 0 : -1,
              currentSong: filteredQueue.length > 0 ? filteredQueue[0] : null,
              originalQueue: [...filteredQueue],
              shuffledQueue: [],
              isShuffled: false,
            });
            
            // Action: add song to queue
            usePlayerStore.getState().addToQueue(newSong);
            
            // Assert: queue length should increase by 1
            const state = usePlayerStore.getState();
            expect(state.queue.length).toBe(originalLength + 1);
            
            // Assert: last element should be the new song
            expect(state.queue[state.queue.length - 1].id).toBe(newSong.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 14: No duplicate songs in queue**
   * 
   * *For any* queue containing a song, calling addToQueue with the same song 
   * SHALL not change the queue (queue remains identical).
   * 
   * **Validates: Requirements 6.2**
   */
  describe('Property 14: No duplicate songs in queue', () => {
    it('should not add duplicate songs to the queue', () => {
      fc.assert(
        fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
          const existingSong = queue[queueIndex];
          const originalQueueIds = queue.map(s => s.id);
          
          // Setup: set queue with existing song
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: existingSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
          });
          
          // Action: try to add existing song to queue
          usePlayerStore.getState().addToQueue(existingSong);
          
          // Assert: queue should remain unchanged
          const state = usePlayerStore.getState();
          const newQueueIds = state.queue.map(s => s.id);
          expect(newQueueIds).toEqual(originalQueueIds);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 15: Add in shuffle affects both queues**
   * 
   * *For any* shuffled queue, adding a song SHALL add it to both originalQueue 
   * and shuffledQueue.
   * 
   * **Validates: Requirements 6.4**
   */
  describe('Property 15: Add in shuffle affects both queues', () => {
    it('should add song to both originalQueue and shuffledQueue when shuffled', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 1, maxLength: 19 }),
          songArb,
          (queue, newSong) => {
            // Ensure newSong is not already in queue
            const filteredQueue = queue.filter(s => s.id !== newSong.id);
            
            // Setup: set shuffled queue
            usePlayerStore.setState({
              queue: [...filteredQueue],
              queueIndex: 0,
              currentSong: filteredQueue[0],
              originalQueue: [...filteredQueue],
              shuffledQueue: [...filteredQueue],
              isShuffled: true,
            });
            
            // Action: add song to queue
            usePlayerStore.getState().addToQueue(newSong);
            
            // Assert: song should be in both queues
            const state = usePlayerStore.getState();
            expect(state.originalQueue.some(s => s.id === newSong.id)).toBe(true);
            expect(state.shuffledQueue.some(s => s.id === newSong.id)).toBe(true);
            expect(state.queue.some(s => s.id === newSong.id)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
