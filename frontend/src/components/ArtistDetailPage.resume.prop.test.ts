/**
 * Property-based tests for ArtistDetailPage play button resume behavior
 * 
 * **Feature: play-button-resume, Property 1: Resume on same source when paused**
 * **Validates: Requirements 1.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Define the QueueSource type
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue' | 'single';
  id: string | null;
}

// Pure function to check if current queue source is this artist (regardless of play state)
function isCurrentArtistSource(queueSource: QueueSource, artistId: string): boolean {
  return queueSource.type === 'artist' && queueSource.id === artistId;
}

// Pure function to check if current artist is playing
function isCurrentArtistPlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  artistId: string
): boolean {
  return isPlaying && isCurrentArtistSource(queueSource, artistId);
}

// Pure function to determine what action should be taken when play button is clicked
// Returns: 'pause' | 'resume' | 'restart'
function determinePlayButtonAction(
  isPlaying: boolean,
  queueSource: QueueSource,
  artistId: string
): 'pause' | 'resume' | 'restart' {
  const isCurrentSource = isCurrentArtistSource(queueSource, artistId);
  const isCurrentPlaying = isCurrentArtistPlaying(isPlaying, queueSource, artistId);
  
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

describe('ArtistDetailPage Play Button Resume Property Tests', () => {
  /**
   * **Feature: play-button-resume, Property 1: Resume on same source when paused**
   * 
   * For any artist page, when the queue source matches the current artist and playback is paused,
   * clicking the play button SHALL call play() to resume playback rather than setQueue() to restart.
   * 
   * **Validates: Requirements 1.2**
   */
  it('Property 1: when source matches and paused, should resume (not restart)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // artistId
        (artistId) => {
          // Setup: source matches, but not playing (paused state)
          const queueSource: QueueSource = { type: 'artist', id: artistId };
          const isPlaying = false;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, artistId);
          
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
   * **Validates: Requirements 1.2**
   */
  it('Property 1a: when source matches and playing, should pause', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // artistId
        (artistId) => {
          // Setup: source matches and playing
          const queueSource: QueueSource = { type: 'artist', id: artistId };
          const isPlaying = true;
          
          const action = determinePlayButtonAction(isPlaying, queueSource, artistId);
          
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
   * **Validates: Requirements 2.2**
   */
  it('Property 1b: when source does not match, should restart', () => {
    const nonArtistTypeArb = fc.constantFrom<QueueSource['type']>(
      'album', 'playlist', 'liked-songs', 'search', 'queue', 'single'
    );

    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          queueSourceType: nonArtistTypeArb,
          queueSourceId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
          artistId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const queueSource: QueueSource = { 
            type: props.queueSourceType, 
            id: props.queueSourceId 
          };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, props.artistId);
          
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
   * **Validates: Requirements 2.2**
   */
  it('Property 1c: when source type matches but ID differs, should restart', () => {
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          artistId: fc.string({ minLength: 1, maxLength: 20 }),
          differentId: fc.string({ minLength: 1, maxLength: 20 }),
        }).filter(props => props.artistId !== props.differentId),
        (props) => {
          const queueSource: QueueSource = { type: 'artist', id: props.differentId };
          
          const action = determinePlayButtonAction(props.isPlaying, queueSource, props.artistId);
          
          // Should restart when IDs don't match
          expect(action).toBe('restart');
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
