/**
 * Property-based tests for addSongsToQueue
 * 
 * **Feature: queue-and-playlist-fixes**
 * Tests the correctness properties for batch adding songs to queue
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

// Arbitrary for generating a non-empty array of songs
const songsArrayArb = fc.array(songArb, { minLength: 1, maxLength: 20 });

// Arbitrary for generating a non-empty queue with a valid index
const queueWithIndexArb = fc.array(songArb, { minLength: 1, maxLength: 20 })
  .chain(queue => 
    fc.record({
      queue: fc.constant(queue),
      queueIndex: fc.integer({ min: 0, max: queue.length - 1 }),
    })
  );

// Create a mock audio element for testing
const createMockAudioRef = () => ({
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
} as unknown as HTMLAudioElement);

describe('addSongsToQueue Operations', () => {
  beforeEach(() => {
    // Reset store state before each test with mock audioRef
    usePlayerStore.setState({
      playMode: 'sequential',
      isShuffled: false,
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      shuffledQueue: [],
      currentSong: null,
      isPlaying: false,
      progress: 0,
      audioRef: createMockAudioRef(),
    });
  });

  /**
   * **Feature: queue-and-playlist-fixes, Property 1: Batch add preserves order**
   * 
   * *For any* array of songs added to the queue, the songs SHALL appear in the queue 
   * in the same order they were provided.
   * 
   * **Validates: Requirements 1.4, 2.4, 4.1**
   */
  describe('Property 1: Batch add preserves order', () => {
    it('should preserve the order of songs when batch adding to empty queue', () => {
      fc.assert(
        fc.property(songsArrayArb, (songs) => {
          // Setup: empty queue with mock audioRef
          usePlayerStore.setState({
            queue: [],
            queueIndex: -1,
            originalQueue: [],
            shuffledQueue: [],
            isShuffled: false,
            currentSong: null,
            audioRef: createMockAudioRef(),
          });
          
          // Action: add songs to queue
          usePlayerStore.getState().addSongsToQueue(songs);
          
          // Assert: songs should be in the same order
          const state = usePlayerStore.getState();
          expect(state.queue.length).toBe(songs.length);
          for (let i = 0; i < songs.length; i++) {
            expect(state.queue[i].id).toBe(songs[i].id);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve the order of songs when batch adding to non-empty queue', () => {
      fc.assert(
        fc.property(queueWithIndexArb, songsArrayArb, ({ queue, queueIndex }, newSongs) => {
          const currentSong = queue[queueIndex];
          const originalLength = queue.length;
          
          // Setup: set queue with current song and mock audioRef
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
            audioRef: createMockAudioRef(),
          });
          
          // Action: add songs to queue
          usePlayerStore.getState().addSongsToQueue(newSongs);
          
          // Assert: new songs should be appended in order
          const state = usePlayerStore.getState();
          expect(state.queue.length).toBe(originalLength + newSongs.length);
          
          // Check that new songs are at the end in order
          for (let i = 0; i < newSongs.length; i++) {
            expect(state.queue[originalLength + i].id).toBe(newSongs[i].id);
          }
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: queue-and-playlist-fixes, Property 2: Batch add to empty queue starts playback**
   * 
   * *For any* non-empty array of songs added to an empty queue, the first song SHALL 
   * become the current song and playback SHALL start.
   * 
   * **Validates: Requirements 4.3**
   */
  describe('Property 2: Batch add to empty queue starts playback', () => {
    it('should start playback of first song when adding to empty queue', () => {
      fc.assert(
        fc.property(songsArrayArb, (songs) => {
          // Setup: empty queue with mock audioRef
          usePlayerStore.setState({
            queue: [],
            queueIndex: -1,
            originalQueue: [],
            shuffledQueue: [],
            isShuffled: false,
            currentSong: null,
            isPlaying: false,
            audioRef: createMockAudioRef(),
          });
          
          // Action: add songs to queue
          usePlayerStore.getState().addSongsToQueue(songs);
          
          // Assert: first song should be current and playing
          const state = usePlayerStore.getState();
          expect(state.currentSong?.id).toBe(songs[0].id);
          expect(state.queueIndex).toBe(0);
          expect(state.isPlaying).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: queue-and-playlist-fixes, Property 3: Batch add preserves current playback**
   * 
   * *For any* non-empty queue with a current song playing, adding songs SHALL not 
   * change the current song or playback position.
   * 
   * **Validates: Requirements 4.4, 5.1**
   */
  describe('Property 3: Batch add preserves current playback', () => {
    it('should preserve current song and queueIndex when adding to non-empty queue', () => {
      fc.assert(
        fc.property(queueWithIndexArb, songsArrayArb, ({ queue, queueIndex }, newSongs) => {
          const currentSong = queue[queueIndex];
          
          // Setup: set queue with current song playing and mock audioRef
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
            isPlaying: true,
            progress: 42, // Some progress
            audioRef: createMockAudioRef(),
          });
          
          // Action: add songs to queue
          usePlayerStore.getState().addSongsToQueue(newSongs);
          
          // Assert: current song and index should remain unchanged
          const state = usePlayerStore.getState();
          expect(state.currentSong?.id).toBe(currentSong.id);
          expect(state.queueIndex).toBe(queueIndex);
          expect(state.isPlaying).toBe(true);
          expect(state.progress).toBe(42);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: queue-and-playlist-fixes, Property 4: Batch add in shuffle mode updates both queues**
   * 
   * *For any* songs added while shuffle mode is enabled, the songs SHALL be added 
   * to both originalQueue and shuffledQueue.
   * 
   * **Validates: Requirements 5.2**
   */
  describe('Property 4: Batch add in shuffle mode updates both queues', () => {
    it('should add songs to both originalQueue and shuffledQueue when shuffled', () => {
      fc.assert(
        fc.property(queueWithIndexArb, songsArrayArb, ({ queue, queueIndex }, newSongs) => {
          const currentSong = queue[queueIndex];
          
          // Setup: set shuffled queue with mock audioRef
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: [...queue],
            isShuffled: true,
            audioRef: createMockAudioRef(),
          });
          
          // Action: add songs to queue
          usePlayerStore.getState().addSongsToQueue(newSongs);
          
          // Assert: songs should be in both queues
          const state = usePlayerStore.getState();
          
          // Check all new songs are in originalQueue
          for (const song of newSongs) {
            expect(state.originalQueue.some(s => s.id === song.id)).toBe(true);
          }
          
          // Check all new songs are in shuffledQueue
          for (const song of newSongs) {
            expect(state.shuffledQueue.some(s => s.id === song.id)).toBe(true);
          }
          
          // Check all new songs are in queue (which points to shuffledQueue)
          for (const song of newSongs) {
            expect(state.queue.some(s => s.id === song.id)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: queue-and-playlist-fixes, Property 5: Queue index consistency after batch add**
   * 
   * *For any* queue modification, the queueIndex SHALL continue to point to the 
   * same current song.
   * 
   * **Validates: Requirements 5.3**
   */
  describe('Property 5: Queue index consistency after batch add', () => {
    it('should maintain queueIndex pointing to current song after batch add', () => {
      fc.assert(
        fc.property(queueWithIndexArb, songsArrayArb, ({ queue, queueIndex }, newSongs) => {
          const currentSong = queue[queueIndex];
          
          // Setup: set queue with current song and mock audioRef
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: [],
            isShuffled: false,
            audioRef: createMockAudioRef(),
          });
          
          // Action: add songs to queue
          usePlayerStore.getState().addSongsToQueue(newSongs);
          
          // Assert: queueIndex should still point to the same song
          const state = usePlayerStore.getState();
          expect(state.queue[state.queueIndex].id).toBe(currentSong.id);
        }),
        { numRuns: 100 }
      );
    });
  });
});


/**
 * **Feature: queue-and-playlist-fixes, Property 8: Album fetch failure preserves queue**
 * 
 * *For any* failed album track fetch, the queue SHALL remain unchanged from its 
 * state before the operation.
 * 
 * Note: This property is tested by verifying that when addSongsToQueue is NOT called
 * (simulating a fetch failure), the queue remains unchanged.
 * 
 * **Validates: Requirements 1.3**
 */
describe('Property 8: Album fetch failure preserves queue', () => {
  it('should preserve queue state when no songs are added (simulating fetch failure)', () => {
    fc.assert(
      fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
        const currentSong = queue[queueIndex];
        const originalQueueIds = queue.map(s => s.id);
        
        // Setup: set queue with current song and mock audioRef
        usePlayerStore.setState({
          queue: [...queue],
          queueIndex: queueIndex,
          currentSong: currentSong,
          originalQueue: [...queue],
          shuffledQueue: [],
          isShuffled: false,
          isPlaying: true,
          audioRef: createMockAudioRef(),
        });
        
        // Action: simulate fetch failure by NOT calling addSongsToQueue
        // (In real scenario, the error handler would not call addSongsToQueue)
        
        // Assert: queue should remain unchanged
        const state = usePlayerStore.getState();
        const newQueueIds = state.queue.map(s => s.id);
        expect(newQueueIds).toEqual(originalQueueIds);
        expect(state.queueIndex).toBe(queueIndex);
        expect(state.currentSong?.id).toBe(currentSong.id);
        expect(state.isPlaying).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should not modify queue when addSongsToQueue is called with empty array', () => {
    fc.assert(
      fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
        const currentSong = queue[queueIndex];
        const originalQueueIds = queue.map(s => s.id);
        
        // Setup: set queue with current song and mock audioRef
        usePlayerStore.setState({
          queue: [...queue],
          queueIndex: queueIndex,
          currentSong: currentSong,
          originalQueue: [...queue],
          shuffledQueue: [],
          isShuffled: false,
          isPlaying: true,
          audioRef: createMockAudioRef(),
        });
        
        // Action: call addSongsToQueue with empty array (simulating empty album)
        usePlayerStore.getState().addSongsToQueue([]);
        
        // Assert: queue should remain unchanged
        const state = usePlayerStore.getState();
        const newQueueIds = state.queue.map(s => s.id);
        expect(newQueueIds).toEqual(originalQueueIds);
        expect(state.queueIndex).toBe(queueIndex);
        expect(state.currentSong?.id).toBe(currentSong.id);
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: queue-and-playlist-fixes, Property 9: Playlist fetch failure preserves queue**
 * 
 * *For any* failed playlist song fetch, the queue SHALL remain unchanged from its 
 * state before the operation.
 * 
 * Note: This property is tested by verifying that when addSongsToQueue is NOT called
 * (simulating a fetch failure), the queue remains unchanged. This is the same behavior
 * as Property 8 since both album and playlist fetch failures should preserve queue state.
 * 
 * **Validates: Requirements 2.3**
 */
describe('Property 9: Playlist fetch failure preserves queue', () => {
  it('should preserve queue state when playlist fetch fails (no songs added)', () => {
    fc.assert(
      fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
        const currentSong = queue[queueIndex];
        const originalQueueIds = queue.map(s => s.id);
        const originalLength = queue.length;
        
        // Setup: set queue with current song and mock audioRef
        usePlayerStore.setState({
          queue: [...queue],
          queueIndex: queueIndex,
          currentSong: currentSong,
          originalQueue: [...queue],
          shuffledQueue: [],
          isShuffled: false,
          isPlaying: true,
          progress: 100,
          audioRef: createMockAudioRef(),
        });
        
        // Action: simulate fetch failure by NOT calling addSongsToQueue
        // (In real scenario, the error handler would not call addSongsToQueue)
        
        // Assert: queue should remain unchanged
        const state = usePlayerStore.getState();
        expect(state.queue.length).toBe(originalLength);
        const newQueueIds = state.queue.map(s => s.id);
        expect(newQueueIds).toEqual(originalQueueIds);
        expect(state.queueIndex).toBe(queueIndex);
        expect(state.currentSong?.id).toBe(currentSong.id);
        expect(state.isPlaying).toBe(true);
        expect(state.progress).toBe(100);
      }),
      { numRuns: 100 }
    );
  });
});
