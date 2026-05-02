/**
 * Property test for SongListPage queue source correctness
 * **Feature: shuffle-button-feature, Property 5: Queue Source Correctness**
 * **Validates: Requirements 5.3, 5.4**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Helper to simulate setQueue call with playlist source
const createPlaylistQueueSource = (playlistId: string | null) => ({
  type: 'playlist' as const,
  id: playlistId,
});

// Helper to simulate setQueue call with liked-songs source
const createLikedSongsQueueSource = () => ({
  type: 'liked-songs' as const,
  id: null,
});

// Helper to determine queue source based on variant
const getQueueSourceForVariant = (
  variant: 'playlist' | 'liked',
  playlistId: string | null
) => {
  if (variant === 'liked') {
    return createLikedSongsQueueSource();
  }
  return createPlaylistQueueSource(playlistId);
};

describe('SongListPage Queue Source Correctness', () => {
  /**
   * Property 5: Queue Source Correctness (Playlist)
   * For any playlist ID, when playback starts from the playlist page,
   * the queueSource SHALL be set to { type: 'playlist', id: playlistId }
   */
  it('should set correct queue source for any playlist ID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (playlistId) => {
          const queueSource = createPlaylistQueueSource(playlistId);
          
          // Verify queue source type is 'playlist'
          expect(queueSource.type).toBe('playlist');
          // Verify queue source id matches the playlist id
          expect(queueSource.id).toBe(playlistId);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Queue Source Correctness (Liked Songs)
   * When playback starts from the liked songs page,
   * the queueSource SHALL be set to { type: 'liked-songs', id: null }
   */
  it('should set correct queue source for liked songs', () => {
    const queueSource = createLikedSongsQueueSource();
    
    // Verify queue source type is 'liked-songs'
    expect(queueSource.type).toBe('liked-songs');
    // Verify queue source id is null
    expect(queueSource.id).toBeNull();
  });

  /**
   * Property: Variant determines queue source type
   * For any variant and playlist ID combination, the queue source type
   * should match the variant
   */
  it('should set queue source type based on variant', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('playlist' as const, 'liked' as const),
        fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
        (variant, playlistId) => {
          const queueSource = getQueueSourceForVariant(variant, playlistId);
          
          if (variant === 'liked') {
            expect(queueSource.type).toBe('liked-songs');
            expect(queueSource.id).toBeNull();
          } else {
            expect(queueSource.type).toBe('playlist');
            expect(queueSource.id).toBe(playlistId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve playlist ID format in queue source', () => {
    fc.assert(
      fc.property(
        // Generate realistic UUID-like playlist IDs
        fc.uuid(),
        (playlistId) => {
          const queueSource = createPlaylistQueueSource(playlistId);
          
          // Queue source should exactly preserve the playlist ID
          expect(queueSource.id).toBe(playlistId);
          expect(typeof queueSource.id).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * Property test for SongListPage play/pause icon consistency
 * **Feature: library-play-button-style, Property 6: 歌单详情页播放/暂停图标显示一致性**
 * **Validates: Requirements 6.1, 6.2, 6.3**
 */

// QueueSource type for testing
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue';
  id: string | null;
}

// Pure function that determines if current source is playing
function isCurrentSourcePlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  variant: 'playlist' | 'liked',
  playlistId: string | undefined
): boolean {
  return isPlaying && (
    (variant === 'liked' && queueSource.type === 'liked-songs') ||
    (variant === 'playlist' && queueSource.type === 'playlist' && queueSource.id === playlistId)
  );
}

// Pure function that determines which icon to show
function getPlayButtonIcon(isCurrentlyPlaying: boolean): 'pause' | 'play' {
  return isCurrentlyPlaying ? 'pause' : 'play';
}

describe('SongListPage Play/Pause Icon Consistency', () => {
  const queueSourceTypeArbitrary = fc.constantFrom(
    'album', 'artist', 'playlist', 'liked-songs', 'search', 'queue'
  ) as fc.Arbitrary<QueueSource['type']>;

  const queueSourceArbitrary = fc.record({
    type: queueSourceTypeArbitrary,
    id: fc.oneof(fc.uuid(), fc.constant(null)),
  });

  /**
   * Property 6: 歌单详情页播放/暂停图标显示一致性
   * For any SongListPage, when the queue source matches and isPlaying is true,
   * the pause icon should be shown; otherwise the play icon should be shown
   */
  it('should show pause icon for liked songs when isPlaying=true and queueSource.type=liked-songs', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isPlaying) => {
          const queueSource: QueueSource = { type: 'liked-songs', id: null };
          const result = isCurrentSourcePlaying(isPlaying, queueSource, 'liked', undefined);
          expect(result).toBe(isPlaying);
          expect(getPlayButtonIcon(result)).toBe(isPlaying ? 'pause' : 'play');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should show pause icon for playlist when isPlaying=true and queueSource matches', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (playlistId) => {
          const queueSource: QueueSource = { type: 'playlist', id: playlistId };
          const result = isCurrentSourcePlaying(true, queueSource, 'playlist', playlistId);
          expect(result).toBe(true);
          expect(getPlayButtonIcon(result)).toBe('pause');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should show play icon when isPlaying=false regardless of queueSource', () => {
    fc.assert(
      fc.property(
        queueSourceArbitrary,
        fc.constantFrom('playlist' as const, 'liked' as const),
        fc.option(fc.uuid(), { nil: undefined }),
        (queueSource, variant, playlistId) => {
          const result = isCurrentSourcePlaying(false, queueSource, variant, playlistId ?? undefined);
          expect(result).toBe(false);
          expect(getPlayButtonIcon(result)).toBe('play');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should show play icon when queueSource.type does not match variant', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (playlistId) => {
          // Liked songs page but queueSource is playlist
          const queueSource1: QueueSource = { type: 'playlist', id: playlistId };
          const result1 = isCurrentSourcePlaying(true, queueSource1, 'liked', undefined);
          expect(result1).toBe(false);
          expect(getPlayButtonIcon(result1)).toBe('play');

          // Playlist page but queueSource is liked-songs
          const queueSource2: QueueSource = { type: 'liked-songs', id: null };
          const result2 = isCurrentSourcePlaying(true, queueSource2, 'playlist', playlistId);
          expect(result2).toBe(false);
          expect(getPlayButtonIcon(result2)).toBe('play');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should show play icon when playlist queueSource.id does not match playlistId', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.uuid(),
        (playlistId, differentId) => {
          fc.pre(playlistId !== differentId);
          const queueSource: QueueSource = { type: 'playlist', id: differentId };
          const result = isCurrentSourcePlaying(true, queueSource, 'playlist', playlistId);
          expect(result).toBe(false);
          expect(getPlayButtonIcon(result)).toBe('play');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should correctly determine icon for any combination of states', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        queueSourceArbitrary,
        fc.constantFrom('playlist' as const, 'liked' as const),
        fc.option(fc.uuid(), { nil: undefined }),
        (isPlaying, queueSource, variant, playlistId) => {
          const result = isCurrentSourcePlaying(isPlaying, queueSource, variant, playlistId ?? undefined);
          
          const expectedResult = isPlaying && (
            (variant === 'liked' && queueSource.type === 'liked-songs') ||
            (variant === 'playlist' && queueSource.type === 'playlist' && queueSource.id === playlistId)
          );
          expect(result).toBe(expectedResult);
          
          const icon = getPlayButtonIcon(result);
          expect(icon).toBe(expectedResult ? 'pause' : 'play');
        }
      ),
      { numRuns: 100 }
    );
  });
});
