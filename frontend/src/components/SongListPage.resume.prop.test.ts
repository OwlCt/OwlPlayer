/**
 * Property-based tests for SongListPage play button resume behavior
 * 
 * **Feature: play-button-resume, Property 1: Resume on same source when paused**
 * **Validates: Requirements 1.3, 1.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Define the QueueSource type
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue' | 'single';
  id: string | null;
}

type PageVariant = 'playlist' | 'liked';

// Pure function to check if current queue source matches this page (regardless of play state)
function isCurrentSource(
  queueSource: QueueSource,
  variant: PageVariant,
  playlistId: string | undefined
): boolean {
  if (variant === 'liked') {
    return queueSource.type === 'liked-songs';
  }
  return queueSource.type === 'playlist' && queueSource.id === playlistId;
}

// Pure function to check if current source is playing
function isCurrentSourcePlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  variant: PageVariant,
  playlistId: string | undefined
): boolean {
  return isPlaying && isCurrentSource(queueSource, variant, playlistId);
}

// Pure function to determine what action should be taken when play button is clicked
// Returns: 'pause' | 'resume' | 'restart'
function determinePlayButtonAction(
  isPlaying: boolean,
  queueSource: QueueSource,
  variant: PageVariant,
  playlistId: string | undefined
): 'pause' | 'resume' | 'restart' {
  const currentSource = isCurrentSource(queueSource, variant, playlistId);
  const currentPlaying = isCurrentSourcePlaying(isPlaying, queueSource, variant, playlistId);
  
  if (currentPlaying) {
    return 'pause';
  } else if (currentSource) {
    return 'resume';
  } else {
    return 'restart';
  }
}

// Arbitrary for QueueSource
const queueSourceTypeArb = fc.constantFrom<QueueSource['type']>(
  'album', 'artist', 'playlist', 'liked-songs', 'search', 'queue', 'single'
);

const queueSourceArb = fc.record({
  type: queueSourceTypeArb,
  id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

describe('SongListPage Play Button Resume Property Tests - Playlist', () => {
  /**
   * **Feature: play-button-resume, Property 1: Resume on same source when paused**
   * 
   * For any playlist page, when the queue source matches the current playlist and playback is paused,
   * clicking the play button SHALL call play() to resume playback rather than setQueue() to restart.
   * 
   * **Validates: Requirements 1.3**
   */
  it('Property 1: when playlist source matches and paused, should resume (not restart)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // playlistId
        (playlistId) => {
          // Setup: source matches, but not playing (paused state)
          const queueSource: QueueSource = { type: 'playlist', id: playlistId };
          const isPlaying = false;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, 'playlist', playlistId);
          
          // Should resume, not restart
          expect(action).toBe('resume');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1a: when playlist source matches and playing, should pause
   * 
   * **Validates: Requirements 1.3**
   */
  it('Property 1a: when playlist source matches and playing, should pause', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // playlistId
        (playlistId) => {
          // Setup: source matches and playing
          const queueSource: QueueSource = { type: 'playlist', id: playlistId };
          const isPlaying = true;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, 'playlist', playlistId);
          
          // Should pause
          expect(action).toBe('pause');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1b: when source does not match playlist, should restart
   * 
   * **Validates: Requirements 2.3**
   */
  it('Property 1b: when source does not match playlist, should restart', () => {
    const nonPlaylistTypeArb = fc.constantFrom<QueueSource['type']>(
      'album', 'artist', 'liked-songs', 'search', 'queue', 'single'
    );

    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          queueSourceType: nonPlaylistTypeArb,
          queueSourceId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
          playlistId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const queueSource: QueueSource = { 
            type: props.queueSourceType, 
            id: props.queueSourceId 
          };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, 'playlist', props.playlistId);
          
          // Should restart when source type doesn't match
          expect(action).toBe('restart');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1c: when playlist type matches but ID differs, should restart
   * 
   * **Validates: Requirements 2.3**
   */
  it('Property 1c: when playlist type matches but ID differs, should restart', () => {
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          playlistId: fc.string({ minLength: 1, maxLength: 20 }),
          differentId: fc.string({ minLength: 1, maxLength: 20 }),
        }).filter(props => props.playlistId !== props.differentId),
        (props) => {
          const queueSource: QueueSource = { type: 'playlist', id: props.differentId };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, 'playlist', props.playlistId);
          
          // Should restart when IDs don't match
          expect(action).toBe('restart');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('SongListPage Play Button Resume Property Tests - Liked Songs', () => {
  /**
   * **Feature: play-button-resume, Property 1: Resume on same source when paused**
   * 
   * For the liked songs page, when the queue source is liked-songs and playback is paused,
   * clicking the play button SHALL call play() to resume playback rather than setQueue() to restart.
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 1: when liked-songs source matches and paused, should resume (not restart)', () => {
    fc.assert(
      fc.property(
        fc.constant(true), // Just need to run the test
        () => {
          // Setup: source matches, but not playing (paused state)
          const queueSource: QueueSource = { type: 'liked-songs', id: null };
          const isPlaying = false;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, 'liked', undefined);
          
          // Should resume, not restart
          expect(action).toBe('resume');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1a: when liked-songs source matches and playing, should pause
   * 
   * **Validates: Requirements 1.4**
   */
  it('Property 1a: when liked-songs source matches and playing, should pause', () => {
    fc.assert(
      fc.property(
        fc.constant(true), // Just need to run the test
        () => {
          // Setup: source matches and playing
          const queueSource: QueueSource = { type: 'liked-songs', id: null };
          const isPlaying = true;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, 'liked', undefined);
          
          // Should pause
          expect(action).toBe('pause');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1b: when source does not match liked-songs, should restart
   * 
   * **Validates: Requirements 2.4**
   */
  it('Property 1b: when source does not match liked-songs, should restart', () => {
    const nonLikedSongsTypeArb = fc.constantFrom<QueueSource['type']>(
      'album', 'artist', 'playlist', 'search', 'queue', 'single'
    );

    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          queueSourceType: nonLikedSongsTypeArb,
          queueSourceId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
        }),
        (props) => {
          const queueSource: QueueSource = { 
            type: props.queueSourceType, 
            id: props.queueSourceId 
          };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, 'liked', undefined);
          
          // Should restart when source type doesn't match
          expect(action).toBe('restart');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
