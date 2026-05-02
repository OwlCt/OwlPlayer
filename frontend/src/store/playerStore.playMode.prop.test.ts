/**
 * Property-based tests for Play Mode and Shuffle state management
 * 
 * **Feature: play-queue-refactor**
 * Tests the correctness properties for play mode cycling and shuffle in playerStore
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore, PlayMode } from './playerStore';
import { Song } from '../types';

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

// Play mode cycle order
const PLAY_MODE_ORDER: PlayMode[] = ['sequential', 'loop', 'single'];

// Helper to get next play mode in cycle
const getNextPlayMode = (current: PlayMode): PlayMode => {
  const currentIndex = PLAY_MODE_ORDER.indexOf(current);
  const nextIndex = (currentIndex + 1) % PLAY_MODE_ORDER.length;
  return PLAY_MODE_ORDER[nextIndex];
};

describe('Play Mode State Management', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePlayerStore.setState({
      playMode: 'sequential',
      isShuffled: false,
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      shuffledQueue: [],
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 1: Play mode cycling**
   * 
   * *For any* current play mode state, clicking the play mode button SHALL cycle 
   * to the next state in the sequence: sequential → loop → single → sequential.
   * 
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: Play mode cycling', () => {
    it('should cycle through play modes in order: sequential → loop → single → sequential', () => {
      fc.assert(
        fc.property(playModeArb, (initialMode) => {
          // Setup: set initial play mode
          usePlayerStore.setState({ playMode: initialMode });
          
          // Action: toggle play mode
          usePlayerStore.getState().togglePlayMode();
          
          // Assert: play mode should be the next in cycle
          const state = usePlayerStore.getState();
          const expectedMode = getNextPlayMode(initialMode);
          expect(state.playMode).toBe(expectedMode);
        }),
        { numRuns: 100 }
      );
    });

    it('should complete full cycle back to original mode after 3 toggles', () => {
      fc.assert(
        fc.property(playModeArb, (initialMode) => {
          // Setup: set initial play mode
          usePlayerStore.setState({ playMode: initialMode });
          
          // Action: toggle play mode 3 times
          usePlayerStore.getState().togglePlayMode();
          usePlayerStore.getState().togglePlayMode();
          usePlayerStore.getState().togglePlayMode();
          
          // Assert: should be back to original mode
          const state = usePlayerStore.getState();
          expect(state.playMode).toBe(initialMode);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 5: Shuffle preserves current song**
   * 
   * *For any* queue with a current song, enabling shuffle SHALL keep the same song 
   * playing (currentSong remains unchanged).
   * 
   * **Validates: Requirements 2.1**
   */
  describe('Property 5: Shuffle preserves current song', () => {
    it('should keep the same song playing when shuffle is enabled', () => {
      fc.assert(
        fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
          const currentSong = queue[queueIndex];
          
          // Setup: set queue with current song
          usePlayerStore.setState({
            queue: queue,
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [],
            shuffledQueue: [],
            isShuffled: false,
          });
          
          // Action: enable shuffle
          usePlayerStore.getState().toggleShuffle();
          
          // Assert: current song should remain the same
          const state = usePlayerStore.getState();
          expect(state.currentSong?.id).toBe(currentSong.id);
          expect(state.isShuffled).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 6: Shuffle toggle round-trip**
   * 
   * *For any* queue, enabling shuffle then disabling shuffle SHALL restore the 
   * original queue order, and the current song SHALL remain the same.
   * 
   * **Validates: Requirements 2.2**
   */
  describe('Property 6: Shuffle toggle round-trip', () => {
    it('should restore original queue order after enabling then disabling shuffle', () => {
      fc.assert(
        fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
          const currentSong = queue[queueIndex];
          const originalQueueIds = queue.map(s => s.id);
          
          // Setup: set queue with current song
          usePlayerStore.setState({
            queue: queue,
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [],
            shuffledQueue: [],
            isShuffled: false,
          });
          
          // Action: enable shuffle then disable shuffle
          usePlayerStore.getState().toggleShuffle();
          usePlayerStore.getState().toggleShuffle();
          
          // Assert: queue should be restored to original order
          const state = usePlayerStore.getState();
          const restoredQueueIds = state.queue.map(s => s.id);
          
          expect(state.isShuffled).toBe(false);
          expect(restoredQueueIds).toEqual(originalQueueIds);
          expect(state.currentSong?.id).toBe(currentSong.id);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 2: Sequential mode stops at queue end**
   * 
   * *For any* queue in sequential mode, when the current song ends at the last position, 
   * playback SHALL stop (isPlaying becomes false).
   * 
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: Sequential mode stops at queue end', () => {
    it('should stop playback when next is called at the last song in sequential mode', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 1, maxLength: 20 }),
          (queue) => {
            const lastIndex = queue.length - 1;
            const lastSong = queue[lastIndex];
            
            // Setup: set queue at last position in sequential mode
            usePlayerStore.setState({
              queue: queue,
              queueIndex: lastIndex,
              currentSong: lastSong,
              playMode: 'sequential',
              isPlaying: true,
              isShuffled: false,
              originalQueue: [],
              shuffledQueue: [],
            });
            
            // Action: call next
            usePlayerStore.getState().next();
            
            // Assert: playback should stop
            const state = usePlayerStore.getState();
            expect(state.isPlaying).toBe(false);
            // Queue index should remain at last position
            expect(state.queueIndex).toBe(lastIndex);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 3: Loop mode wraps to start**
   * 
   * *For any* queue in loop mode, when the current song ends at the last position, 
   * the queue index SHALL wrap to 0 and continue playing.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 3: Loop mode wraps to start', () => {
    it('should wrap to first song when next is called at the last song in loop mode', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 1, maxLength: 20 }),
          (queue) => {
            const lastIndex = queue.length - 1;
            const lastSong = queue[lastIndex];
            const firstSong = queue[0];
            
            // Setup: set queue at last position in loop mode
            usePlayerStore.setState({
              queue: queue,
              queueIndex: lastIndex,
              currentSong: lastSong,
              playMode: 'loop',
              isPlaying: true,
              isShuffled: false,
              originalQueue: [],
              shuffledQueue: [],
            });
            
            // Action: call next
            usePlayerStore.getState().next();
            
            // Assert: should wrap to first song
            const state = usePlayerStore.getState();
            expect(state.queueIndex).toBe(0);
            expect(state.currentSong?.id).toBe(firstSong.id);
            expect(state.isPlaying).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 4: Single loop restarts same song**
   * 
   * *For any* song in single loop mode, when the song ends, the same song SHALL 
   * restart from the beginning (progress resets to 0, same song continues).
   * 
   * **Validates: Requirements 1.4**
   */
  describe('Property 4: Single loop restarts same song', () => {
    it('should restart the same song when next is called in single loop mode', () => {
      fc.assert(
        fc.property(queueWithIndexArb, ({ queue, queueIndex }) => {
          const currentSong = queue[queueIndex];
          
          // Setup: set queue with current song in single loop mode
          usePlayerStore.setState({
            queue: queue,
            queueIndex: queueIndex,
            currentSong: currentSong,
            playMode: 'single',
            isPlaying: true,
            progress: 120, // Some progress into the song
            isShuffled: false,
            originalQueue: [],
            shuffledQueue: [],
          });
          
          // Action: call next
          usePlayerStore.getState().next();
          
          // Assert: same song should restart
          const state = usePlayerStore.getState();
          expect(state.currentSong?.id).toBe(currentSong.id);
          expect(state.queueIndex).toBe(queueIndex);
          expect(state.progress).toBe(0);
          expect(state.isPlaying).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 8: Next in shuffle follows shuffled order**
   * 
   * *For any* position in a shuffled queue, clicking next SHALL advance to 
   * shuffledQueue[currentIndex + 1].
   * 
   * **Validates: Requirements 2.5**
   */
  describe('Property 8: Next in shuffle follows shuffled order', () => {
    it('should advance to the next song in shuffled queue when next is called', () => {
      fc.assert(
        fc.property(
          // Generate a queue with at least 2 songs and index not at the last position
          fc.array(songArb, { minLength: 2, maxLength: 20 })
            .chain(queue => 
              fc.record({
                queue: fc.constant(queue),
                queueIndex: fc.integer({ min: 0, max: queue.length - 2 }), // Not at last position
              })
            ),
          ({ queue, queueIndex }) => {
            const currentSong = queue[queueIndex];
            const expectedNextSong = queue[queueIndex + 1];
            
            // Setup: set shuffled queue with current song
            usePlayerStore.setState({
              queue: queue,
              queueIndex: queueIndex,
              currentSong: currentSong,
              playMode: 'sequential', // Any mode except single
              isPlaying: true,
              isShuffled: true,
              originalQueue: queue, // Original queue (doesn't matter for this test)
              shuffledQueue: queue, // Shuffled queue is the same as queue in this test
            });
            
            // Action: call next
            usePlayerStore.getState().next();
            
            // Assert: should advance to next song in shuffled order
            const state = usePlayerStore.getState();
            expect(state.queueIndex).toBe(queueIndex + 1);
            expect(state.currentSong?.id).toBe(expectedNextSong.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
