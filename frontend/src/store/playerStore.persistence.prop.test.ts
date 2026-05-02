/**
 * Property-based tests for Playback State Persistence
 * 
 * **Feature: play-queue-refactor**
 * Tests the correctness properties for playback state persistence round-trip
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore, PlayMode } from './playerStore';
import { Song } from '../types';

// Mock the API module
vi.mock('../api', () => ({
  getPlaybackState: vi.fn(),
  savePlaybackState: vi.fn(),
  getAlbumDetail: vi.fn(),
}));

import { getPlaybackState, savePlaybackState } from '../api';

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

// Arbitrary for generating a valid playback state
const playbackStateArb = fc.array(songArb, { minLength: 1, maxLength: 20 })
  .chain(queue => 
    fc.record({
      queue: fc.constant(queue),
      queueIndex: fc.integer({ min: 0, max: queue.length - 1 }),
      progress: fc.float({ min: 0, max: 300, noNaN: true }),
      playMode: playModeArb,
      isShuffled: fc.boolean(),
    })
  );

describe('Playback State Persistence', () => {
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
      progress: 0,
    });
    
    // Reset mocks
    vi.clearAllMocks();
  });

  /**
   * **Feature: play-queue-refactor, Property 16: Playback state persistence round-trip**
   * 
   * *For any* playback state (queue, currentIndex, position, playMode, isShuffled), 
   * saving then loading SHALL restore an equivalent state.
   * 
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
   */
  describe('Property 16: Playback state persistence round-trip', () => {
    it('should restore equivalent state after save and load', async () => {
      await fc.assert(
        fc.asyncProperty(playbackStateArb, async ({ queue, queueIndex, progress, playMode, isShuffled }) => {
          // Capture what would be saved
          let savedState: {
            queue_songs: Array<{
              id: string;
              name: string;
              artist_name: string;
              artist_id?: string;
              album_name: string;
              album_id?: string;
              duration: number;
              artwork_url: string;
              has_lyrics: boolean;
            }>;
            current_index: number;
            position: number;
            play_mode: PlayMode;
            is_shuffled: boolean;
            volume: number;
            queue_source_type?: string | null;
            queue_source_id?: string | null;
            queue_source_name?: string | null;
          } | null = null;
          
          // Mock savePlaybackState to capture the saved state
          vi.mocked(savePlaybackState).mockImplementation(async (state) => {
            savedState = state;
          });
          
          // Mock getPlaybackState to return the saved state
          vi.mocked(getPlaybackState).mockImplementation(async () => {
            if (!savedState) return null;
            return {
              user_id: 'test-user',
              queue_songs: savedState.queue_songs,
              current_index: savedState.current_index,
              position: savedState.position,
              play_mode: savedState.play_mode,
              is_shuffled: savedState.is_shuffled,
              volume: savedState.volume,
              queue_source_type: savedState.queue_source_type,
              queue_source_id: savedState.queue_source_id,
              queue_source_name: savedState.queue_source_name,
              updated_at: new Date().toISOString(),
            };
          });
          
          const currentSong = queue[queueIndex];
          
          // Setup: set initial state
          usePlayerStore.setState({
            queue: [...queue],
            queueIndex: queueIndex,
            currentSong: currentSong,
            originalQueue: [...queue],
            shuffledQueue: isShuffled ? [...queue] : [],
            isShuffled: isShuffled,
            playMode: playMode,
            progress: progress,
            isPlaying: false,
          });
          
          // Action 1: Save playback state
          await usePlayerStore.getState().savePlaybackState();
          
          // Verify save was called
          expect(savePlaybackState).toHaveBeenCalled();
          expect(savedState).not.toBeNull();
          
          // Reset state to simulate app restart
          usePlayerStore.setState({
            queue: [],
            queueIndex: -1,
            currentSong: null,
            originalQueue: [],
            shuffledQueue: [],
            isShuffled: false,
            playMode: 'sequential',
            progress: 0,
            isPlaying: false,
          });
          
          // Action 2: Load playback state
          await usePlayerStore.getState().loadPlaybackState();
          
          // Assert: state should be restored
          const state = usePlayerStore.getState();
          
          // Queue should contain the same songs (order may differ if shuffled)
          const originalQueueIds = queue.map(s => s.id).sort();
          const restoredQueueIds = state.queue.map(s => s.id).sort();
          expect(restoredQueueIds).toEqual(originalQueueIds);
          
          // Queue length should match
          expect(state.queue.length).toBe(queue.length);
          
          // Current song should be the same (by ID)
          const originalCurrentSongId = queue[queueIndex].id;
          expect(state.currentSong?.id).toBe(originalCurrentSongId);
          
          // Progress should match
          expect(state.progress).toBeCloseTo(progress, 2);
          
          // Play mode should match
          expect(state.playMode).toBe(playMode);
          
          // Shuffle state should match
          expect(state.isShuffled).toBe(isShuffled);
          
          // Should not auto-play
          expect(state.isPlaying).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
    
    it('should handle empty queue gracefully', async () => {
      // Mock getPlaybackState to return null (no saved state)
      vi.mocked(getPlaybackState).mockResolvedValue(null);
      
      // Setup: set some initial state
      usePlayerStore.setState({
        queue: [],
        queueIndex: -1,
        currentSong: null,
        playMode: 'loop',
        isShuffled: true,
      });
      
      // Action: Load playback state
      await usePlayerStore.getState().loadPlaybackState();
      
      // Assert: state should remain unchanged (no crash)
      const state = usePlayerStore.getState();
      expect(state.queue).toEqual([]);
      expect(state.queueIndex).toBe(-1);
    });
    
    it('should not save when queue is empty', async () => {
      vi.mocked(savePlaybackState).mockResolvedValue(undefined);
      
      // Setup: empty queue
      usePlayerStore.setState({
        queue: [],
        queueIndex: -1,
        currentSong: null,
      });
      
      // Action: Try to save
      await usePlayerStore.getState().savePlaybackState();
      
      // Assert: savePlaybackState should not be called
      expect(savePlaybackState).not.toHaveBeenCalled();
    });
  });
});
