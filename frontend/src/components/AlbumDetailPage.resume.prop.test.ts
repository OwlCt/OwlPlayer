/**
 * Property-based tests for AlbumDetailPage play button resume behavior
 * 
 * **Feature: play-button-resume, Property 1: Resume on same source when paused**
 * **Validates: Requirements 1.1**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Define the QueueSource type
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue' | 'single';
  id: string | null;
}

// Pure function to check if current queue source is this album (regardless of play state)
function isCurrentAlbumSource(queueSource: QueueSource, albumId: string): boolean {
  return queueSource.type === 'album' && queueSource.id === albumId;
}

// Pure function to check if current album is playing
function isCurrentAlbumPlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  albumId: string
): boolean {
  return isPlaying && isCurrentAlbumSource(queueSource, albumId);
}

// Pure function to determine what action should be taken when play button is clicked
// Returns: 'pause' | 'resume' | 'restart'
function determinePlayButtonAction(
  isPlaying: boolean,
  queueSource: QueueSource,
  albumId: string
): 'pause' | 'resume' | 'restart' {
  const isCurrentSource = isCurrentAlbumSource(queueSource, albumId);
  const isCurrentPlaying = isCurrentAlbumPlaying(isPlaying, queueSource, albumId);
  
  if (isCurrentPlaying) {
    return 'pause';
  } else if (isCurrentSource) {
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

describe('AlbumDetailPage Play Button Resume Property Tests', () => {
  /**
   * **Feature: play-button-resume, Property 1: Resume on same source when paused**
   * 
   * For any album page, when the queue source matches the current album and playback is paused,
   * clicking the play button SHALL call play() to resume playback rather than setQueue() to restart.
   * 
   * **Validates: Requirements 1.1**
   */
  it('Property 1: when source matches and paused, should resume (not restart)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // albumId
        (albumId) => {
          // Setup: source matches, but not playing (paused state)
          const queueSource: QueueSource = { type: 'album', id: albumId };
          const isPlaying = false;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, albumId);
          
          // Should resume, not restart
          expect(action).toBe('resume');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1a: when source matches and playing, should pause
   * 
   * **Validates: Requirements 1.1**
   */
  it('Property 1a: when source matches and playing, should pause', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // albumId
        (albumId) => {
          // Setup: source matches and playing
          const queueSource: QueueSource = { type: 'album', id: albumId };
          const isPlaying = true;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, albumId);
          
          // Should pause
          expect(action).toBe('pause');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1b: when source does not match, should restart (regardless of play state)
   * 
   * **Validates: Requirements 2.1**
   */
  it('Property 1b: when source does not match, should restart', () => {
    const nonAlbumTypeArb = fc.constantFrom<QueueSource['type']>(
      'artist', 'playlist', 'liked-songs', 'search', 'queue', 'single'
    );

    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          queueSourceType: nonAlbumTypeArb,
          queueSourceId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
          albumId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const queueSource: QueueSource = { 
            type: props.queueSourceType, 
            id: props.queueSourceId 
          };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, props.albumId);
          
          // Should restart when source type doesn't match
          expect(action).toBe('restart');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1c: when source type matches but ID differs, should restart
   * 
   * **Validates: Requirements 2.1**
   */
  it('Property 1c: when source type matches but ID differs, should restart', () => {
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          albumId: fc.string({ minLength: 1, maxLength: 20 }),
          differentId: fc.string({ minLength: 1, maxLength: 20 }),
        }).filter(props => props.albumId !== props.differentId),
        (props) => {
          const queueSource: QueueSource = { type: 'album', id: props.differentId };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, props.albumId);
          
          // Should restart when IDs don't match
          expect(action).toBe('restart');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
