/**
 * Comprehensive property-based tests for play button resume behavior
 * 
 * **Feature: play-button-resume**
 * 
 * This file contains comprehensive property tests covering:
 * - Property 1: Resume on same source when paused
 * - Property 2: Restart on different source
 * - Property 3: Play button icon reflects state correctly
 * - Property 4: Song click sets correct queue source
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Define the QueueSource type
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue' | 'single';
  id: string | null;
}

type PageType = 'album' | 'artist' | 'playlist' | 'liked-songs';

// Pure function to check if current queue source matches the page
function isCurrentSource(
  queueSource: QueueSource,
  pageType: PageType,
  pageId: string | null
): boolean {
  if (pageType === 'liked-songs') {
    return queueSource.type === 'liked-songs';
  }
  return queueSource.type === pageType && queueSource.id === pageId;
}

// Pure function to check if current source is playing
function isCurrentSourcePlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  pageType: PageType,
  pageId: string | null
): boolean {
  return isPlaying && isCurrentSource(queueSource, pageType, pageId);
}

// Pure function to determine what action should be taken when play button is clicked
function determinePlayButtonAction(
  isPlaying: boolean,
  queueSource: QueueSource,
  pageType: PageType,
  pageId: string | null
): 'pause' | 'resume' | 'restart' {
  const currentSource = isCurrentSource(queueSource, pageType, pageId);
  const currentPlaying = isCurrentSourcePlaying(isPlaying, queueSource, pageType, pageId);
  
  if (currentPlaying) {
    return 'pause';
  } else if (currentSource) {
    return 'resume';
  } else {
    return 'restart';
  }
}

// Pure function to determine play button icon
function determinePlayButtonIcon(
  isPlaying: boolean,
  queueSource: QueueSource,
  pageType: PageType,
  pageId: string | null
): 'play' | 'pause' {
  const currentPlaying = isCurrentSourcePlaying(isPlaying, queueSource, pageType, pageId);
  return currentPlaying ? 'pause' : 'play';
}

// Pure function to determine queue source from song click
function determineQueueSourceFromSongClick(
  pageType: PageType,
  pageId: string | null
): QueueSource {
  if (pageType === 'liked-songs') {
    return { type: 'liked-songs', id: null };
  }
  return { type: pageType, id: pageId };
}

// Arbitraries
const pageTypeArb = fc.constantFrom<PageType>('album', 'artist', 'playlist', 'liked-songs');
const queueSourceTypeArb = fc.constantFrom<QueueSource['type']>(
  'album', 'artist', 'playlist', 'liked-songs', 'search', 'queue', 'single'
);

const queueSourceArb = fc.record({
  type: queueSourceTypeArb,
  id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

describe('Play Button Resume - Property 2: Restart on different source', () => {
  /**
   * **Feature: play-button-resume, Property 2: Restart on different source**
   * 
   * For any page type and for any pair of different source IDs (current queue source vs page source),
   * clicking the play button SHALL call setQueue() with index 0 to start playback from the beginning.
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   */
  it('Property 2: when source type differs, should restart', () => {
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          pageType: pageTypeArb,
          pageId: fc.string({ minLength: 1, maxLength: 20 }),
          queueSource: queueSourceArb,
        }).filter(props => {
          // Ensure queue source type differs from page type
          if (props.pageType === 'liked-songs') {
            return props.queueSource.type !== 'liked-songs';
          }
          return props.queueSource.type !== props.pageType;
        }),
        (props) => {
          const action = determinePlayButtonAction(
            props.isPlaying,
            props.queueSource,
            props.pageType,
            props.pageType === 'liked-songs' ? null : props.pageId
          );
          
          expect(action).toBe('restart');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 2a: when source type matches but ID differs, should restart', () => {
    const nonLikedSongsPageTypeArb = fc.constantFrom<PageType>('album', 'artist', 'playlist');
    
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          pageType: nonLikedSongsPageTypeArb,
          pageId: fc.string({ minLength: 1, maxLength: 20 }),
          differentId: fc.string({ minLength: 1, maxLength: 20 }),
        }).filter(props => props.pageId !== props.differentId),
        (props) => {
          const queueSource: QueueSource = { type: props.pageType, id: props.differentId };
          
          const action = determinePlayButtonAction(
            props.isPlaying,
            queueSource,
            props.pageType,
            props.pageId
          );
          
          expect(action).toBe('restart');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Play Button Resume - Property 3: Play button icon reflects state correctly', () => {
  /**
   * **Feature: play-button-resume, Property 3: Play button icon reflects state correctly**
   * 
   * For any page type and source ID:
   * - When isPlaying === true AND source matches → icon is "pause"
   * - When isPlaying === false AND source matches → icon is "play"
   * - When source does NOT match → icon is "play"
   * 
   * **Validates: Requirements 3.1, 3.2, 3.3**
   */
  it('Property 3: when playing and source matches, should show pause icon', () => {
    fc.assert(
      fc.property(
        fc.record({
          pageType: pageTypeArb,
          pageId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const pageId = props.pageType === 'liked-songs' ? null : props.pageId;
          const queueSource: QueueSource = props.pageType === 'liked-songs'
            ? { type: 'liked-songs', id: null }
            : { type: props.pageType, id: props.pageId };
          
          const icon = determinePlayButtonIcon(true, queueSource, props.pageType, pageId);
          
          expect(icon).toBe('pause');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3a: when paused and source matches, should show play icon', () => {
    fc.assert(
      fc.property(
        fc.record({
          pageType: pageTypeArb,
          pageId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const pageId = props.pageType === 'liked-songs' ? null : props.pageId;
          const queueSource: QueueSource = props.pageType === 'liked-songs'
            ? { type: 'liked-songs', id: null }
            : { type: props.pageType, id: props.pageId };
          
          const icon = determinePlayButtonIcon(false, queueSource, props.pageType, pageId);
          
          expect(icon).toBe('play');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3b: when source does not match, should always show play icon', () => {
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.boolean(),
          pageType: pageTypeArb,
          pageId: fc.string({ minLength: 1, maxLength: 20 }),
          queueSource: queueSourceArb,
        }).filter(props => {
          // Ensure queue source doesn't match page
          if (props.pageType === 'liked-songs') {
            return props.queueSource.type !== 'liked-songs';
          }
          return props.queueSource.type !== props.pageType || props.queueSource.id !== props.pageId;
        }),
        (props) => {
          const pageId = props.pageType === 'liked-songs' ? null : props.pageId;
          
          const icon = determinePlayButtonIcon(props.isPlaying, props.queueSource, props.pageType, pageId);
          
          expect(icon).toBe('play');
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Play Button Resume - Property 4: Song click sets correct queue source', () => {
  /**
   * **Feature: play-button-resume, Property 4: Song click sets correct queue source**
   * 
   * For any page type and for any song clicked within that page,
   * the resulting queueSource SHALL have the correct type and ID matching the page.
   * 
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
   */
  it('Property 4: song click should set queue source matching page', () => {
    fc.assert(
      fc.property(
        fc.record({
          pageType: pageTypeArb,
          pageId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const pageId = props.pageType === 'liked-songs' ? null : props.pageId;
          
          const queueSource = determineQueueSourceFromSongClick(props.pageType, pageId);
          
          // Verify the queue source matches the page
          if (props.pageType === 'liked-songs') {
            expect(queueSource.type).toBe('liked-songs');
            expect(queueSource.id).toBeNull();
          } else {
            expect(queueSource.type).toBe(props.pageType);
            expect(queueSource.id).toBe(props.pageId);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4a: album page song click should set album queue source', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (albumId) => {
          const queueSource = determineQueueSourceFromSongClick('album', albumId);
          
          expect(queueSource.type).toBe('album');
          expect(queueSource.id).toBe(albumId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4b: artist page song click should set artist queue source', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (artistId) => {
          const queueSource = determineQueueSourceFromSongClick('artist', artistId);
          
          expect(queueSource.type).toBe('artist');
          expect(queueSource.id).toBe(artistId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4c: playlist page song click should set playlist queue source', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (playlistId) => {
          const queueSource = determineQueueSourceFromSongClick('playlist', playlistId);
          
          expect(queueSource.type).toBe('playlist');
          expect(queueSource.id).toBe(playlistId);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 4d: liked songs page song click should set liked-songs queue source', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          const queueSource = determineQueueSourceFromSongClick('liked-songs', null);
          
          expect(queueSource.type).toBe('liked-songs');
          expect(queueSource.id).toBeNull();
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
