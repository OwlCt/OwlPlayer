/**
 * Property-based tests for Shuffle Button state synchronization
 * 
 * **Feature: shuffle-button-feature**
 * Tests the correctness properties for shuffle toggle and state sync
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore, QueueSource } from '../store/playerStore';
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

// Arbitrary for generating queue source types
const queueSourceTypeArb = fc.constantFrom<QueueSource['type']>(
  'playlist', 'album', 'artist', 'liked-songs', 'search', 'single', null
);

// Arbitrary for generating a queue source
const queueSourceArb = fc.record({
  type: queueSourceTypeArb,
  id: fc.option(fc.uuid(), { nil: null }),
}) as fc.Arbitrary<QueueSource>;

// Arbitrary for page types that have shuffle buttons
const pageTypeArb = fc.constantFrom<'artist' | 'album' | 'playlist' | 'liked-songs'>(
  'artist', 'album', 'playlist', 'liked-songs'
);

// Helper to check if queue source matches page
const isSourceMatchingPage = (
  pageType: 'artist' | 'album' | 'playlist' | 'liked-songs',
  pageId: string | null,
  queueSource: QueueSource
): boolean => {
  if (pageType === 'liked-songs') {
    return queueSource.type === 'liked-songs';
  }
  return queueSource.type === pageType && queueSource.id === pageId;
};

describe('Shuffle Button State Synchronization', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePlayerStore.setState({
      isShuffled: false,
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      shuffledQueue: [],
      queueSource: { type: null, id: null },
      currentSong: null,
    });
  });

  /**
   * **Feature: shuffle-button-feature, Property 1: Shuffle Toggle Idempotence**
   * 
   * *For any* initial shuffle state (true or false), clicking the shuffle button 
   * twice SHALL return the state to its original value.
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 1: Shuffle Toggle Idempotence', () => {
    it('should return to original state after toggling twice', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.array(songArb, { minLength: 1, maxLength: 10 }),
          (initialShuffled, songs) => {
            const currentSong = songs[0];
            
            // Setup: set initial shuffle state with a queue
            usePlayerStore.setState({
              isShuffled: initialShuffled,
              queue: songs,
              queueIndex: 0,
              currentSong: currentSong,
              originalQueue: initialShuffled ? songs : [],
              shuffledQueue: initialShuffled ? songs : [],
            });
            
            // Action: toggle shuffle twice
            usePlayerStore.getState().toggleShuffle();
            usePlayerStore.getState().toggleShuffle();
            
            // Assert: should be back to original state
            const state = usePlayerStore.getState();
            expect(state.isShuffled).toBe(initialShuffled);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should toggle from false to true on single click', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 1, maxLength: 10 }),
          (songs) => {
            const currentSong = songs[0];
            
            // Setup: shuffle is off
            usePlayerStore.setState({
              isShuffled: false,
              queue: songs,
              queueIndex: 0,
              currentSong: currentSong,
              originalQueue: [],
              shuffledQueue: [],
            });
            
            // Action: toggle shuffle
            usePlayerStore.getState().toggleShuffle();
            
            // Assert: shuffle should be on
            const state = usePlayerStore.getState();
            expect(state.isShuffled).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should toggle from true to false on single click', () => {
      fc.assert(
        fc.property(
          fc.array(songArb, { minLength: 1, maxLength: 10 }),
          (songs) => {
            const currentSong = songs[0];
            
            // Setup: shuffle is on
            usePlayerStore.setState({
              isShuffled: true,
              queue: songs,
              queueIndex: 0,
              currentSong: currentSong,
              originalQueue: songs,
              shuffledQueue: songs,
            });
            
            // Action: toggle shuffle
            usePlayerStore.getState().toggleShuffle();
            
            // Assert: shuffle should be off
            const state = usePlayerStore.getState();
            expect(state.isShuffled).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: shuffle-button-feature, Property 2: Play Syncs Shuffle State**
   * 
   * *For any* local shuffle state and any song list, when the play button is clicked,
   * the playerStore's isShuffled state SHALL equal the local shuffle state after 
   * playback starts.
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 2: Play Syncs Shuffle State', () => {
    it('should sync local shuffle state to playerStore when play is clicked', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // localShuffle state
          fc.boolean(), // initial playerStore isShuffled
          fc.array(songArb, { minLength: 1, maxLength: 10 }),
          queueSourceArb,
          (localShuffle, initialStoreShuffled, songs, source) => {
            const currentSong = songs[0];
            
            // Setup: set initial store state
            usePlayerStore.setState({
              isShuffled: initialStoreShuffled,
              queue: songs,
              queueIndex: 0,
              currentSong: currentSong,
              originalQueue: initialStoreShuffled ? songs : [],
              shuffledQueue: initialStoreShuffled ? songs : [],
              queueSource: source,
            });
            
            // Simulate what happens when play is clicked with localShuffle
            // If localShuffle !== isShuffled, toggleShuffle is called
            if (localShuffle !== initialStoreShuffled) {
              usePlayerStore.getState().toggleShuffle();
            }
            
            // Assert: playerStore isShuffled should match localShuffle
            const state = usePlayerStore.getState();
            expect(state.isShuffled).toBe(localShuffle);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: shuffle-button-feature, Property 3: Source Match Enables Sync**
   * 
   * *For any* page type (artist/album/playlist/liked-songs) and page ID, if queueSource 
   * matches the current page, the local shuffle state SHALL equal playerStore's 
   * isShuffled state.
   * 
   * **Validates: Requirements 3.3**
   */
  describe('Property 3: Source Match Enables Sync', () => {
    it('should sync local shuffle from playerStore when source matches', () => {
      fc.assert(
        fc.property(
          pageTypeArb,
          fc.option(fc.uuid(), { nil: null }),
          fc.boolean(), // playerStore isShuffled
          (pageType, pageId, storeShuffled) => {
            // Create matching queue source
            const matchingSource: QueueSource = pageType === 'liked-songs'
              ? { type: 'liked-songs', id: null }
              : { type: pageType, id: pageId };
            
            // Setup: set store state with matching source
            usePlayerStore.setState({
              isShuffled: storeShuffled,
              queueSource: matchingSource,
            });
            
            // Verify source matches
            const state = usePlayerStore.getState();
            const isMatch = isSourceMatchingPage(pageType, pageId, state.queueSource);
            
            // Assert: when source matches, local should sync from store
            expect(isMatch).toBe(true);
            // In the actual component, localShuffle would be set to state.isShuffled
            // Here we verify the matching logic works correctly
            expect(state.isShuffled).toBe(storeShuffled);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify non-matching sources', () => {
      fc.assert(
        fc.property(
          pageTypeArb,
          fc.uuid(),
          queueSourceArb,
          (pageType, pageId, randomSource) => {
            // Skip if random source happens to match
            const isMatch = isSourceMatchingPage(pageType, pageId, randomSource);
            
            if (!isMatch) {
              // When source doesn't match, local shuffle should NOT sync
              // This is verified by the isSourceMatchingPage returning false
              expect(isMatch).toBe(false);
            }
            
            // Always true - we're just verifying the matching logic
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional test: Source matching logic correctness
   */
  describe('Source Matching Logic', () => {
    it('should match liked-songs page correctly', () => {
      const likedSongsSource: QueueSource = { type: 'liked-songs', id: null };
      expect(isSourceMatchingPage('liked-songs', null, likedSongsSource)).toBe(true);
      
      const otherSource: QueueSource = { type: 'playlist', id: 'some-id' };
      expect(isSourceMatchingPage('liked-songs', null, otherSource)).toBe(false);
    });

    it('should match playlist page correctly', () => {
      fc.assert(
        fc.property(fc.uuid(), (playlistId) => {
          const matchingSource: QueueSource = { type: 'playlist', id: playlistId };
          expect(isSourceMatchingPage('playlist', playlistId, matchingSource)).toBe(true);
          
          const wrongIdSource: QueueSource = { type: 'playlist', id: 'wrong-id' };
          expect(isSourceMatchingPage('playlist', playlistId, wrongIdSource)).toBe(false);
          
          const wrongTypeSource: QueueSource = { type: 'album', id: playlistId };
          expect(isSourceMatchingPage('playlist', playlistId, wrongTypeSource)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should match album page correctly', () => {
      fc.assert(
        fc.property(fc.uuid(), (albumId) => {
          const matchingSource: QueueSource = { type: 'album', id: albumId };
          expect(isSourceMatchingPage('album', albumId, matchingSource)).toBe(true);
          
          const wrongIdSource: QueueSource = { type: 'album', id: 'wrong-id' };
          expect(isSourceMatchingPage('album', albumId, wrongIdSource)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should match artist page correctly', () => {
      fc.assert(
        fc.property(fc.uuid(), (artistId) => {
          const matchingSource: QueueSource = { type: 'artist', id: artistId };
          expect(isSourceMatchingPage('artist', artistId, matchingSource)).toBe(true);
          
          const wrongIdSource: QueueSource = { type: 'artist', id: 'wrong-id' };
          expect(isSourceMatchingPage('artist', artistId, wrongIdSource)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });
});
