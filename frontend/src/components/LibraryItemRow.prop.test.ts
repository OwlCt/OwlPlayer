import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getBackgroundClass, getTextColorClass, shouldShowPlayOverlay } from './LibraryItemRow';

// **Feature: library-item-hover-active, Property 1: Background State Hierarchy**
// **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3**

describe('LibraryItemRow Visual States', () => {
  describe('Property 1: Background State Hierarchy', () => {
    // **Feature: library-item-hover-active, Property 1: Background State Hierarchy**
    // **Validates: Requirements 1.1, 1.2, 2.1, 2.2, 2.3**

    it('should return correct background class for all state combinations', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isActive
          fc.boolean(), // isHovered
          (isActive, isHovered) => {
            const result = getBackgroundClass(isActive, isHovered);

            if (isActive && isHovered) {
              expect(result).toBe('bg-white/30');
            } else if (isActive) {
              expect(result).toBe('bg-white/20');
            } else if (isHovered) {
              expect(result).toBe('bg-white/10');
            } else {
              expect(result).toBe('');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('active+hovered should be brighter than active alone', () => {
      fc.assert(
        fc.property(fc.constant(true), () => {
          const activeHovered = getBackgroundClass(true, true);
          const activeOnly = getBackgroundClass(true, false);
          
          // bg-white/30 is brighter than bg-white/20
          const activeHoveredOpacity = parseInt(activeHovered.split('/')[1]) || 0;
          const activeOnlyOpacity = parseInt(activeOnly.split('/')[1]) || 0;
          
          expect(activeHoveredOpacity).toBeGreaterThan(activeOnlyOpacity);
        }),
        { numRuns: 100 }
      );
    });

    it('active should be brighter than hovered alone', () => {
      fc.assert(
        fc.property(fc.constant(true), () => {
          const activeOnly = getBackgroundClass(true, false);
          const hoveredOnly = getBackgroundClass(false, true);
          
          // bg-white/20 is brighter than bg-white/10
          const activeOnlyOpacity = parseInt(activeOnly.split('/')[1]) || 0;
          const hoveredOnlyOpacity = parseInt(hoveredOnly.split('/')[1]) || 0;
          
          expect(activeOnlyOpacity).toBeGreaterThan(hoveredOnlyOpacity);
        }),
        { numRuns: 100 }
      );
    });

    it('hovered should be brighter than default (transparent)', () => {
      fc.assert(
        fc.property(fc.constant(true), () => {
          const hoveredOnly = getBackgroundClass(false, true);
          const defaultState = getBackgroundClass(false, false);
          
          // bg-white/10 has opacity, empty string has none
          const hoveredOpacity = parseInt(hoveredOnly.split('/')[1]) || 0;
          const defaultOpacity = defaultState === '' ? 0 : parseInt(defaultState.split('/')[1]) || 0;
          
          expect(hoveredOpacity).toBeGreaterThan(defaultOpacity);
        }),
        { numRuns: 100 }
      );
    });

    it('default state should return empty string (transparent)', () => {
      const result = getBackgroundClass(false, false);
      expect(result).toBe('');
    });
  });

  // **Feature: library-item-hover-active, Property 2: Playing State Text Color**
  // **Validates: Requirements 3.1, 3.2, 3.3**
  describe('Property 2: Playing State Text Color', () => {
    it('should return spotify-green when isPlaying is true, white otherwise', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isPlaying
          (isPlaying) => {
            const result = getTextColorClass(isPlaying);

            if (isPlaying) {
              expect(result).toBe('text-spotify-green');
            } else {
              expect(result).toBe('text-white');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('playing state should always return green text color', () => {
      const result = getTextColorClass(true);
      expect(result).toBe('text-spotify-green');
    });

    it('non-playing state should always return white text color', () => {
      const result = getTextColorClass(false);
      expect(result).toBe('text-white');
    });

    it('text color should be independent of other states', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isPlaying
          fc.boolean(), // isActive (should not affect text color)
          fc.boolean(), // isHovered (should not affect text color)
          (isPlaying, _isActive, _isHovered) => {
            // Text color only depends on isPlaying
            const result = getTextColorClass(isPlaying);
            const expected = isPlaying ? 'text-spotify-green' : 'text-white';
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: library-item-hover-active, Property 3: Play Overlay Visibility**
  // **Validates: Requirements 4.1, 4.5**
  describe('Property 3: Play Overlay Visibility', () => {
    it('should show overlay only when hovered AND has onPlay callback', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isHovered
          fc.boolean(), // hasOnPlay
          (isHovered, hasOnPlay) => {
            const result = shouldShowPlayOverlay(isHovered, hasOnPlay);
            const expected = isHovered && hasOnPlay;
            expect(result).toBe(expected);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not show overlay when not hovered', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // hasOnPlay
          (hasOnPlay) => {
            const result = shouldShowPlayOverlay(false, hasOnPlay);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not show overlay when no onPlay callback', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isHovered
          (isHovered) => {
            const result = shouldShowPlayOverlay(isHovered, false);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should show overlay only when both conditions are true', () => {
      const result = shouldShowPlayOverlay(true, true);
      expect(result).toBe(true);
    });

    it('overlay visibility is symmetric with respect to conditions', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          (a, b) => {
            // Both conditions must be true for overlay to show
            const result = shouldShowPlayOverlay(a, b);
            expect(result).toBe(a && b);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
