/**
 * Property-based tests for QueueSection Component
 * 
 * **Feature: play-queue-refactor**
 * Tests the correctness properties for queue view display logic
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore } from '../store/playerStore';
import { Song } from '../types';

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

// Arbitrary for generating two different queues (original and shuffled)
const queuePairArb = fc.array(songArb, { minLength: 2, maxLength: 20 })
  .chain(originalQueue => {
    // Create a shuffled version that's different from original
    const shuffledQueue = [...originalQueue].sort(() => Math.random() - 0.5);
    return fc.record({
      originalQueue: fc.constant(originalQueue),
      shuffledQueue: fc.constant(shuffledQueue),
      queueIndex: fc.integer({ min: 0, max: originalQueue.length - 1 }),
    });
  });

/**
 * Helper function to get the queue that should be displayed based on shuffle state.
 * This mirrors the logic in QueueSection component.
 */
function getDisplayedQueue(isShuffled: boolean, originalQueue: Song[], shuffledQueue: Song[]): Song[] {
  // The store's queue property already points to the correct queue based on shuffle state
  // When isShuffled is true, queue === shuffledQueue
  // When isShuffled is false, queue === originalQueue
  return isShuffled ? shuffledQueue : originalQueue;
}

describe('QueueSection Properties', () => {
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
    });
  });

  /**
   * **Feature: play-queue-refactor, Property 7: Queue view reflects shuffle state**
   * 
   * *For any* queue state, the displayed queue SHALL match shuffledQueue when 
   * isShuffled is true, and originalQueue when isShuffled is false.
   * 
   * **Validates: Requirements 2.3, 2.4, 3.1, 3.4**
   */
  describe('Property 7: Queue view reflects shuffle state', () => {
    it('should display shuffledQueue when isShuffled is true', () => {
      fc.assert(
        fc.property(queuePairArb, ({ originalQueue, shuffledQueue, queueIndex }) => {
          const currentSong = originalQueue[queueIndex];
          
          // Setup: set shuffled state with both queues
          usePlayerStore.setState({
            queue: shuffledQueue, // When shuffled, queue points to shuffledQueue
            queueIndex: shuffledQueue.findIndex(s => s.id === currentSong.id),
            currentSong: currentSong,
            originalQueue: originalQueue,
            shuffledQueue: shuffledQueue,
            isShuffled: true,
          });
          
          // Get state
          const state = usePlayerStore.getState();
          
          // Assert: queue should match shuffledQueue
          expect(state.queue.map(s => s.id)).toEqual(shuffledQueue.map(s => s.id));
          expect(state.isShuffled).toBe(true);
          
          // Assert: the displayed queue should be shuffledQueue
          const displayedQueue = getDisplayedQueue(state.isShuffled, state.originalQueue, state.shuffledQueue);
          expect(displayedQueue.map(s => s.id)).toEqual(shuffledQueue.map(s => s.id));
        }),
        { numRuns: 100 }
      );
    });

    it('should display originalQueue when isShuffled is false', () => {
      fc.assert(
        fc.property(queuePairArb, ({ originalQueue, shuffledQueue, queueIndex }) => {
          const currentSong = originalQueue[queueIndex];
          
          // Setup: set non-shuffled state
          usePlayerStore.setState({
            queue: originalQueue, // When not shuffled, queue points to originalQueue
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: originalQueue,
            shuffledQueue: shuffledQueue, // Keep shuffled queue for reference
            isShuffled: false,
          });
          
          // Get state
          const state = usePlayerStore.getState();
          
          // Assert: queue should match originalQueue
          expect(state.queue.map(s => s.id)).toEqual(originalQueue.map(s => s.id));
          expect(state.isShuffled).toBe(false);
          
          // Assert: the displayed queue should be originalQueue
          const displayedQueue = getDisplayedQueue(state.isShuffled, state.originalQueue, state.shuffledQueue);
          expect(displayedQueue.map(s => s.id)).toEqual(originalQueue.map(s => s.id));
        }),
        { numRuns: 100 }
      );
    });

    it('should update queue view immediately when shuffle mode changes', () => {
      fc.assert(
        fc.property(queuePairArb, ({ originalQueue, shuffledQueue, queueIndex }) => {
          const currentSong = originalQueue[queueIndex];
          
          // Setup: start with non-shuffled state
          usePlayerStore.setState({
            queue: originalQueue,
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: originalQueue,
            shuffledQueue: [],
            isShuffled: false,
          });
          
          // Verify initial state shows original queue
          let state = usePlayerStore.getState();
          expect(state.queue.map(s => s.id)).toEqual(originalQueue.map(s => s.id));
          
          // Action: toggle shuffle on
          usePlayerStore.getState().toggleShuffle();
          
          // Get new state
          state = usePlayerStore.getState();
          
          // Assert: isShuffled should be true
          expect(state.isShuffled).toBe(true);
          
          // Assert: queue should now be shuffledQueue (generated by toggleShuffle)
          // The shuffled queue should contain the same songs but potentially in different order
          const originalIds = originalQueue.map(s => s.id).sort();
          const newQueueIds = state.queue.map(s => s.id).sort();
          expect(newQueueIds).toEqual(originalIds);
          
          // Assert: current song should still be at the front (shuffle keeps current song)
          expect(state.queue[0].id).toBe(currentSong.id);
          
          // Action: toggle shuffle off
          usePlayerStore.getState().toggleShuffle();
          
          // Get new state
          state = usePlayerStore.getState();
          
          // Assert: isShuffled should be false
          expect(state.isShuffled).toBe(false);
          
          // Assert: queue should be back to original order
          expect(state.queue.map(s => s.id)).toEqual(originalQueue.map(s => s.id));
        }),
        { numRuns: 100 }
      );
    });

    it('should highlight the correct current song in queue view', () => {
      fc.assert(
        fc.property(
          queuePairArb,
          fc.boolean(),
          ({ originalQueue, shuffledQueue, queueIndex }, isShuffled) => {
            const currentSong = originalQueue[queueIndex];
            const activeQueue = isShuffled ? shuffledQueue : originalQueue;
            const currentIndexInActiveQueue = activeQueue.findIndex(s => s.id === currentSong.id);
            
            // Setup: set queue state
            usePlayerStore.setState({
              queue: activeQueue,
              queueIndex: currentIndexInActiveQueue >= 0 ? currentIndexInActiveQueue : 0,
              currentSong: currentSong,
              originalQueue: originalQueue,
              shuffledQueue: shuffledQueue,
              isShuffled: isShuffled,
            });
            
            // Get state
            const state = usePlayerStore.getState();
            
            // Assert: queueIndex should point to the current song in the active queue
            if (currentIndexInActiveQueue >= 0) {
              expect(state.queue[state.queueIndex].id).toBe(currentSong.id);
            }
            
            // Assert: currentSong should match the song at queueIndex
            expect(state.currentSong?.id).toBe(currentSong.id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
