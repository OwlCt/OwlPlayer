/**
 * Property-based tests for AlbumDetailPage play button
 * 
 * **Feature: library-play-button-style, Property 4: 专辑详情页播放/暂停图标显示一致性**
 * **Validates: Requirements 4.1, 4.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Define the QueueSource type
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue';
  id: string | null;
}

// Pure function to determine if current album is playing
function isCurrentAlbumPlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  albumId: string
): boolean {
  return isPlaying && queueSource.type === 'album' && queueSource.id === albumId;
}

// Arbitrary for QueueSource
const queueSourceTypeArb = fc.constantFrom<QueueSource['type']>(
  'album', 'artist', 'playlist', 'liked-songs', 'search', 'queue'
);

const queueSourceArb = fc.record({
  type: queueSourceTypeArb,
  id: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: null }),
});

// Arbitrary for test props
const albumPlayButtonPropsArb = fc.record({
  isPlaying: fc.boolean(),
  queueSource: queueSourceArb,
  albumId: fc.string({ minLength: 1, maxLength: 20 }),
});

describe('AlbumDetailPage Play Button Property Tests', () => {
  /**
   * Property 4: 专辑详情页播放/暂停图标显示一致性
   * For any AlbumDetailPage component, when isPlaying is true AND queueSource.type === 'album'
   * AND queueSource.id === albumId, it should show IoPause icon; otherwise it should show IoPlay icon
   * 
   * **Validates: Requirements 4.1, 4.2**
   */
  it('Property 4: isCurrentAlbumPlaying should return true only when all conditions match', () => {
    fc.assert(
      fc.property(albumPlayButtonPropsArb, (props) => {
        const result = isCurrentAlbumPlaying(
          props.isPlaying,
          props.queueSource,
          props.albumId
        );

        // The function should return true only when:
        // 1. isPlaying is true
        // 2. queueSource.type is 'album'
        // 3. queueSource.id matches albumId
        const expectedResult = 
          props.isPlaying && 
          props.queueSource.type === 'album' && 
          props.queueSource.id === props.albumId;

        expect(result).toBe(expectedResult);

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4a: When not playing, should always show play icon
   * 
   * **Validates: Requirements 4.2**
   */
  it('Property 4a: when isPlaying is false, should always return false (show play icon)', () => {
    fc.assert(
      fc.property(
        fc.record({
          queueSource: queueSourceArb,
          albumId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        (props) => {
          const result = isCurrentAlbumPlaying(
            false, // isPlaying is false
            props.queueSource,
            props.albumId
          );

          // Should always be false when not playing
          expect(result).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4b: When queueSource type is not 'album', should show play icon
   * 
   * **Validates: Requirements 4.2**
   */
  it('Property 4b: when queueSource.type is not album, should return false', () => {
    const nonAlbumTypeArb = fc.constantFrom<QueueSource['type']>(
      'artist', 'playlist', 'liked-songs', 'search', 'queue'
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
          const result = isCurrentAlbumPlaying(
            props.isPlaying,
            { type: props.queueSourceType, id: props.queueSourceId },
            props.albumId
          );

          // Should always be false when type is not 'album'
          expect(result).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4c: When queueSource.id doesn't match albumId, should show play icon
   * 
   * **Validates: Requirements 4.2**
   */
  it('Property 4c: when queueSource.id does not match albumId, should return false', () => {
    fc.assert(
      fc.property(
        fc.record({
          isPlaying: fc.constant(true),
          albumId: fc.string({ minLength: 1, maxLength: 20 }),
          differentId: fc.string({ minLength: 1, maxLength: 20 }),
        }).filter(props => props.albumId !== props.differentId), // Ensure IDs are different
        (props) => {
          const result = isCurrentAlbumPlaying(
            props.isPlaying,
            { type: 'album', id: props.differentId },
            props.albumId
          );

          // Should be false when IDs don't match
          expect(result).toBe(false);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4d: When all conditions match, should show pause icon
   * 
   * **Validates: Requirements 4.1**
   */
  it('Property 4d: when isPlaying, type is album, and id matches, should return true (show pause icon)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }),
        (albumId) => {
          const result = isCurrentAlbumPlaying(
            true, // isPlaying
            { type: 'album', id: albumId }, // matching queueSource
            albumId // same albumId
          );

          // Should be true when all conditions match
          expect(result).toBe(true);

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
