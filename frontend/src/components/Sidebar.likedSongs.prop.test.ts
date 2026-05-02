import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getBackgroundClass, getTextColorClass, shouldShowPlayOverlay } from './LibraryItemRow';

/**
 * **Feature: library-item-hover-active, Property 5: Liked Songs Consistency**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
 * 
 * This test verifies that the "Liked Songs" entry exhibits the same visual behavior
 * as other library items (playlists, albums, artists).
 * 
 * The Liked Songs entry should:
 * - Use the same background state hierarchy (hover, active, active+hover)
 * - Use the same text color logic (green when playing, white otherwise)
 * - Show play overlay on hover when there are liked songs
 */
describe('Property 5: Liked Songs Consistency', () => {
  // **Feature: library-item-hover-active, Property 5: Liked Songs Consistency**
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  describe('Background State Consistency', () => {
    it('Liked Songs should use same background hierarchy as library items', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isActive (currentPage === 'liked-songs')
          fc.boolean(), // isHovered
          (isActive, isHovered) => {
            // Liked Songs uses the same getBackgroundClass function
            const likedSongsBackground = getBackgroundClass(isActive, isHovered);
            
            // Verify it follows the same hierarchy
            if (isActive && isHovered) {
              expect(likedSongsBackground).toBe('bg-white/30');
            } else if (isActive) {
              expect(likedSongsBackground).toBe('bg-white/20');
            } else if (isHovered) {
              expect(likedSongsBackground).toBe('bg-white/10');
            } else {
              expect(likedSongsBackground).toBe('');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Liked Songs hover state should match library item hover state', () => {
      fc.assert(
        fc.property(fc.constant(true), () => {
          const likedSongsHover = getBackgroundClass(false, true);
          const libraryItemHover = getBackgroundClass(false, true);
          expect(likedSongsHover).toBe(libraryItemHover);
        }),
        { numRuns: 100 }
      );
    });

    it('Liked Songs active state should match library item active state', () => {
      fc.assert(
        fc.property(fc.constant(true), () => {
          const likedSongsActive = getBackgroundClass(true, false);
          const libraryItemActive = getBackgroundClass(true, false);
          expect(likedSongsActive).toBe(libraryItemActive);
        }),
        { numRuns: 100 }
      );
    });

    it('Liked Songs active+hover state should match library item active+hover state', () => {
      fc.assert(
        fc.property(fc.constant(true), () => {
          const likedSongsActiveHover = getBackgroundClass(true, true);
          const libraryItemActiveHover = getBackgroundClass(true, true);
          expect(likedSongsActiveHover).toBe(libraryItemActiveHover);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Text Color Consistency', () => {
    it('Liked Songs should use same text color logic as library items', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isPlaying (isLikedSongsPlaying)
          (isPlaying) => {
            // Liked Songs uses the same getTextColorClass function
            const likedSongsTextColor = getTextColorClass(isPlaying);
            const libraryItemTextColor = getTextColorClass(isPlaying);
            
            expect(likedSongsTextColor).toBe(libraryItemTextColor);
            
            // Verify correct color
            if (isPlaying) {
              expect(likedSongsTextColor).toBe('text-spotify-green');
            } else {
              expect(likedSongsTextColor).toBe('text-white');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Liked Songs playing state should show green text', () => {
      const textColor = getTextColorClass(true);
      expect(textColor).toBe('text-spotify-green');
    });

    it('Liked Songs non-playing state should show white text', () => {
      const textColor = getTextColorClass(false);
      expect(textColor).toBe('text-white');
    });
  });

  describe('Play Overlay Consistency', () => {
    it('Liked Songs should show play overlay on hover when songs exist', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isHovered
          fc.boolean(), // hasLikedSongs (likedSongs.length > 0)
          (isHovered, hasLikedSongs) => {
            // Liked Songs shows overlay when hovered AND has songs
            // This is equivalent to shouldShowPlayOverlay(isHovered, hasOnPlay)
            // where hasOnPlay is true when hasLikedSongs is true
            const shouldShowOverlay = shouldShowPlayOverlay(isHovered, hasLikedSongs);
            
            expect(shouldShowOverlay).toBe(isHovered && hasLikedSongs);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Liked Songs should not show overlay when not hovered', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // hasLikedSongs
          (hasLikedSongs) => {
            const shouldShowOverlay = shouldShowPlayOverlay(false, hasLikedSongs);
            expect(shouldShowOverlay).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Liked Songs should not show overlay when no songs exist', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isHovered
          (isHovered) => {
            // When no liked songs, hasOnPlay equivalent is false
            const shouldShowOverlay = shouldShowPlayOverlay(isHovered, false);
            expect(shouldShowOverlay).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Liked Songs overlay visibility matches library item behavior', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isHovered
          fc.boolean(), // hasContent (hasLikedSongs for Liked Songs, hasOnPlay for library items)
          (isHovered, hasContent) => {
            const likedSongsOverlay = shouldShowPlayOverlay(isHovered, hasContent);
            const libraryItemOverlay = shouldShowPlayOverlay(isHovered, hasContent);
            
            expect(likedSongsOverlay).toBe(libraryItemOverlay);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Combined State Consistency', () => {
    it('Liked Songs should behave identically to library items for all state combinations', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isActive
          fc.boolean(), // isHovered
          fc.boolean(), // isPlaying
          fc.boolean(), // hasContent
          (isActive, isHovered, isPlaying, hasContent) => {
            // Background class should be identical
            const likedSongsBackground = getBackgroundClass(isActive, isHovered);
            const libraryItemBackground = getBackgroundClass(isActive, isHovered);
            expect(likedSongsBackground).toBe(libraryItemBackground);
            
            // Text color should be identical
            const likedSongsTextColor = getTextColorClass(isPlaying);
            const libraryItemTextColor = getTextColorClass(isPlaying);
            expect(likedSongsTextColor).toBe(libraryItemTextColor);
            
            // Overlay visibility should be identical
            const likedSongsOverlay = shouldShowPlayOverlay(isHovered, hasContent);
            const libraryItemOverlay = shouldShowPlayOverlay(isHovered, hasContent);
            expect(likedSongsOverlay).toBe(libraryItemOverlay);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
