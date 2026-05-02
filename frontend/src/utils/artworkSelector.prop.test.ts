import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getArtworkType, ArtistArtworkData } from './artworkSelector';

// Generator for non-empty URL strings
const nonEmptyUrlArb = fc.webUrl();

// Generator for empty or whitespace-only strings
const emptyOrWhitespaceArb = fc.constantFrom('', ' ', '  ', '\t', '\n');

// Generator for optional URL (either valid URL or undefined/empty)
const optionalUrlArb = fc.oneof(
  fc.constant(undefined),
  emptyOrWhitespaceArb,
  nonEmptyUrlArb
);

describe('Artwork Selector Property Tests', () => {
  /**
   * **Feature: artist-dynamic-artwork, Property 1: Artwork Priority Selection**
   * 
   * For any artist data with any combination of motionVideoUrl, landscapeUrl, 
   * and artworkUrl availability, the system SHALL display the artwork type 
   * according to priority: motionVideoUrl > landscapeUrl > artworkUrl (circular avatar).
   * 
   * **Validates: Requirements 1.3, 2.1, 2.3, 4.1, 4.2**
   */
  it('Property 1: Artwork type follows priority order (video > landscape > avatar)', () => {
    fc.assert(
      fc.property(
        optionalUrlArb,
        optionalUrlArb,
        optionalUrlArb,
        (motionVideoUrl, landscapeUrl, artworkUrl) => {
          const data: ArtistArtworkData = {
            motionVideoUrl: motionVideoUrl as string | undefined,
            landscapeUrl: landscapeUrl as string | undefined,
            artworkUrl: artworkUrl as string | undefined,
          };

          const result = getArtworkType(data);

          // Check priority: video > landscape > avatar
          const hasValidMotionVideo = motionVideoUrl && motionVideoUrl.trim() !== '';
          const hasValidLandscape = landscapeUrl && landscapeUrl.trim() !== '';

          if (hasValidMotionVideo) {
            expect(result).toBe('video');
          } else if (hasValidLandscape) {
            expect(result).toBe('landscape');
          } else {
            expect(result).toBe('avatar');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sub-property: When motionVideoUrl is present and valid, always return 'video'
   */
  it('should return video when motionVideoUrl is present regardless of other URLs', () => {
    fc.assert(
      fc.property(
        nonEmptyUrlArb,
        optionalUrlArb,
        optionalUrlArb,
        (motionVideoUrl, landscapeUrl, artworkUrl) => {
          const data: ArtistArtworkData = {
            motionVideoUrl,
            landscapeUrl: landscapeUrl as string | undefined,
            artworkUrl: artworkUrl as string | undefined,
          };

          expect(getArtworkType(data)).toBe('video');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sub-property: When only landscapeUrl is present (no motionVideoUrl), return 'landscape'
   */
  it('should return landscape when landscapeUrl is present but motionVideoUrl is not', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceArb,
        nonEmptyUrlArb,
        optionalUrlArb,
        (motionVideoUrl, landscapeUrl, artworkUrl) => {
          const data: ArtistArtworkData = {
            motionVideoUrl: motionVideoUrl || undefined,
            landscapeUrl,
            artworkUrl: artworkUrl as string | undefined,
          };

          expect(getArtworkType(data)).toBe('landscape');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sub-property: When neither motionVideoUrl nor landscapeUrl is present, return 'avatar'
   */
  it('should return avatar when neither motionVideoUrl nor landscapeUrl is present', () => {
    fc.assert(
      fc.property(
        emptyOrWhitespaceArb,
        emptyOrWhitespaceArb,
        optionalUrlArb,
        (motionVideoUrl, landscapeUrl, artworkUrl) => {
          const data: ArtistArtworkData = {
            motionVideoUrl: motionVideoUrl || undefined,
            landscapeUrl: landscapeUrl || undefined,
            artworkUrl: artworkUrl as string | undefined,
          };

          expect(getArtworkType(data)).toBe('avatar');
        }
      ),
      { numRuns: 100 }
    );
  });
});
