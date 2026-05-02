import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: artist-view-more-pages, Property 7: Preview Limit Enforcement**
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

const PREVIEW_LIMIT = 5;

// Helper to generate random Song
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
});

// Generate valid date strings directly to avoid Invalid Date issues
const releaseDateArbitrary = fc.tuple(
  fc.integer({ min: 1950, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([year, month, day]) => 
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

// Helper to generate random Album
const albumArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
  releaseDate: releaseDateArbitrary,
  trackCount: fc.integer({ min: 1, max: 20 }),
});

// Pure function that mimics the preview logic in ArtistDetailPage
function getPreviewItems<T>(items: T[] | undefined): T[] {
  return items?.slice(0, PREVIEW_LIMIT) || [];
}

// Pure function that determines if "View More" button should be shown
function shouldShowViewMore<T>(items: T[] | undefined): boolean {
  return items !== undefined && items.length > PREVIEW_LIMIT;
}

// **Feature: library-play-button-style, Property 5: 艺术家详情页播放/暂停图标显示一致性**
// **Validates: Requirements 5.1, 5.2**

// QueueSource type for testing
interface QueueSource {
  type: 'album' | 'artist' | 'playlist' | 'liked-songs' | 'search' | 'queue';
  id: string | null;
}

// Pure function that determines if current artist is playing
function isCurrentArtistPlaying(
  isPlaying: boolean,
  queueSource: QueueSource,
  artistId: string
): boolean {
  return isPlaying && queueSource.type === 'artist' && queueSource.id === artistId;
}

// Pure function that determines which icon to show
function getPlayButtonIcon(isCurrentlyPlaying: boolean): 'pause' | 'play' {
  return isCurrentlyPlaying ? 'pause' : 'play';
}

describe('ArtistDetailPage Preview Logic', () => {
  // **Feature: artist-view-more-pages, Property 7: Preview Limit Enforcement**
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  describe('Property 7: Preview Limit Enforcement', () => {
    it('should display at most PREVIEW_LIMIT items for top songs', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 0, maxLength: 50 }),
          (songs) => {
            const preview = getPreviewItems(songs);
            expect(preview.length).toBeLessThanOrEqual(PREVIEW_LIMIT);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display at most PREVIEW_LIMIT items for albums', () => {
      fc.assert(
        fc.property(
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          (albums) => {
            const preview = getPreviewItems(albums);
            expect(preview.length).toBeLessThanOrEqual(PREVIEW_LIMIT);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display at most PREVIEW_LIMIT items for singles/EPs', () => {
      fc.assert(
        fc.property(
          fc.array(albumArbitrary, { minLength: 0, maxLength: 50 }),
          (singles) => {
            const preview = getPreviewItems(singles);
            expect(preview.length).toBeLessThanOrEqual(PREVIEW_LIMIT);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show View More button if and only if total count exceeds PREVIEW_LIMIT', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 0, maxLength: 50 }),
          (songs) => {
            const showButton = shouldShowViewMore(songs);
            const expectedShowButton = songs.length > PREVIEW_LIMIT;
            expect(showButton).toBe(expectedShowButton);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should hide View More button when items count is 5 or fewer', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 0, maxLength: 5 }),
          (songs) => {
            const showButton = shouldShowViewMore(songs);
            expect(showButton).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show View More button when items count is more than 5', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 6, maxLength: 50 }),
          (songs) => {
            const showButton = shouldShowViewMore(songs);
            expect(showButton).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve first PREVIEW_LIMIT items in preview', () => {
      fc.assert(
        fc.property(
          fc.array(songArbitrary, { minLength: 6, maxLength: 50 }),
          (songs) => {
            const preview = getPreviewItems(songs);
            // Preview should contain exactly the first PREVIEW_LIMIT items
            for (let i = 0; i < PREVIEW_LIMIT; i++) {
              expect(preview[i]).toEqual(songs[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: library-play-button-style, Property 5: 艺术家详情页播放/暂停图标显示一致性**
  // **Validates: Requirements 5.1, 5.2**
  describe('Property 5: Artist Detail Page Play/Pause Icon Consistency', () => {
    const queueSourceTypeArbitrary = fc.constantFrom(
      'album', 'artist', 'playlist', 'liked-songs', 'search', 'queue'
    ) as fc.Arbitrary<QueueSource['type']>;

    const queueSourceArbitrary = fc.record({
      type: queueSourceTypeArbitrary,
      id: fc.oneof(fc.uuid(), fc.constant(null)),
    });

    it('should show pause icon when isPlaying=true, queueSource.type=artist, and queueSource.id matches artistId', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (artistId) => {
            const queueSource: QueueSource = { type: 'artist', id: artistId };
            const result = isCurrentArtistPlaying(true, queueSource, artistId);
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
          fc.uuid(),
          (queueSource, artistId) => {
            const result = isCurrentArtistPlaying(false, queueSource, artistId);
            expect(result).toBe(false);
            expect(getPlayButtonIcon(result)).toBe('play');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show play icon when queueSource.type is not artist', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('album', 'playlist', 'liked-songs', 'search', 'queue') as fc.Arbitrary<QueueSource['type']>,
          fc.oneof(fc.uuid(), fc.constant(null)),
          fc.uuid(),
          (type, id, artistId) => {
            const queueSource: QueueSource = { type, id };
            const result = isCurrentArtistPlaying(true, queueSource, artistId);
            expect(result).toBe(false);
            expect(getPlayButtonIcon(result)).toBe('play');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show play icon when queueSource.id does not match artistId', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.uuid(),
          (artistId, differentId) => {
            fc.pre(artistId !== differentId);
            const queueSource: QueueSource = { type: 'artist', id: differentId };
            const result = isCurrentArtistPlaying(true, queueSource, artistId);
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
          fc.uuid(),
          (isPlaying, queueSource, artistId) => {
            const result = isCurrentArtistPlaying(isPlaying, queueSource, artistId);
            const expectedResult = isPlaying && queueSource.type === 'artist' && queueSource.id === artistId;
            expect(result).toBe(expectedResult);
            
            const icon = getPlayButtonIcon(result);
            expect(icon).toBe(expectedResult ? 'pause' : 'play');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
