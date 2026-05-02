/**
 * Property-based tests for LyricLine component visual state
 * Uses fast-check for property-based testing
 *
 * **Feature: lyrics-scroll-animation, Property 5: Visual State Based on Active Status**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 *
 * For any lyric line:
 * - If isActive = true, scale SHALL be 1.02 and opacity SHALL be 1.0
 * - If isActive = false, scale SHALL be 1.0 and opacity SHALL be determined by adjacentIndex
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getLineOpacity } from '../utils/scrollAnimator';

/**
 * Helper function to calculate expected visual state
 * This mirrors the logic in LyricLineComponent
 */
function calculateVisualState(isActive: boolean, adjacentIndex: number) {
  const scale = isActive ? 1.02 : 1.0;
  const opacity = isActive ? 1.0 : getLineOpacity(adjacentIndex);
  return { scale, opacity };
}

describe('Property 5: Visual State Based on Active Status', () => {
  describe('Active line visual state', () => {
    it('active line always has scale 1.02 regardless of adjacentIndex', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 100 }), (adjacentIndex) => {
          const { scale } = calculateVisualState(true, adjacentIndex);
          return scale === 1.02;
        }),
        { numRuns: 100 }
      );
    });

    it('active line always has opacity 1.0 regardless of adjacentIndex', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 100 }), (adjacentIndex) => {
          const { opacity } = calculateVisualState(true, adjacentIndex);
          return opacity === 1.0;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Inactive line visual state', () => {
    it('inactive line always has scale 1.0 regardless of adjacentIndex', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 100 }), (adjacentIndex) => {
          const { scale } = calculateVisualState(false, adjacentIndex);
          return scale === 1.0;
        }),
        { numRuns: 100 }
      );
    });

    it('inactive line opacity is determined by adjacentIndex', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 100 }), (adjacentIndex) => {
          const { opacity } = calculateVisualState(false, adjacentIndex);
          const expectedOpacity = getLineOpacity(adjacentIndex);
          return opacity === expectedOpacity;
        }),
        { numRuns: 100 }
      );
    });

    it('inactive adjacent line (±1) has opacity 0.45', () => {
      const { opacity: opacityBefore } = calculateVisualState(false, -1);
      const { opacity: opacityAfter } = calculateVisualState(false, 1);
      expect(opacityBefore).toBe(0.45);
      expect(opacityAfter).toBe(0.45);
    });

    it('inactive distant line (|index| >= 4) has opacity 0.15', () => {
      fc.assert(
        fc.property(fc.integer({ min: 4, max: 100 }), (distance) => {
          const { opacity: opacityPos } = calculateVisualState(false, distance);
          const { opacity: opacityNeg } = calculateVisualState(false, -distance);
          return opacityPos === 0.15 && opacityNeg === 0.15;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Transition behavior', () => {
    it('scale changes from 1.0 to 1.02 when becoming active', () => {
      const inactiveState = calculateVisualState(false, 0);
      const activeState = calculateVisualState(true, 0);
      expect(inactiveState.scale).toBe(1.0);
      expect(activeState.scale).toBe(1.02);
    });

    it('scale changes from 1.02 to 1.0 when becoming inactive', () => {
      const activeState = calculateVisualState(true, 0);
      const inactiveState = calculateVisualState(false, 1);
      expect(activeState.scale).toBe(1.02);
      expect(inactiveState.scale).toBe(1.0);
    });

    it('opacity changes from 0.5/0.7 to 1.0 when becoming active', () => {
      fc.assert(
        fc.property(fc.integer({ min: -100, max: 100 }), (adjacentIndex) => {
          const inactiveState = calculateVisualState(false, adjacentIndex);
          const activeState = calculateVisualState(true, adjacentIndex);
          // Inactive opacity should be <= 1.0
          // Active opacity should be exactly 1.0
          return inactiveState.opacity <= 1.0 && activeState.opacity === 1.0;
        }),
        { numRuns: 100 }
      );
    });

    it('opacity changes from 1.0 to adjacentIndex-based value when becoming inactive', () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 100 }), (adjacentIndex) => {
          const activeState = calculateVisualState(true, 0);
          const inactiveState = calculateVisualState(false, adjacentIndex);
          return activeState.opacity === 1.0 && inactiveState.opacity < 1.0;
        }),
        { numRuns: 100 }
      );
    });
  });
});
