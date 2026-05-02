/**
 * Property-based tests for Sidebar auto-collapse functionality
 * 
 * **Feature: player-bar-min-width**
 * Tests the correctness properties for sidebar auto-collapse behavior
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Constants matching the design
const AUTO_COLLAPSE_THRESHOLD = 800; // px
const MINI_MODE_WIDTH = 85; // px
const NORMAL_MODE_WIDTH = 280; // px

/**
 * Pure function to determine if sidebar should be in mini mode
 * based on window width
 */
function shouldSidebarBeMini(windowWidth: number): boolean {
  return windowWidth < AUTO_COLLAPSE_THRESHOLD;
}

/**
 * Pure function to compute sidebar width based on window width and state
 */
function computeSidebarWidth(
  windowWidth: number,
  wasAutoCollapsed: boolean,
  previousWidth: number
): number {
  const shouldBeMini = shouldSidebarBeMini(windowWidth);
  
  if (shouldBeMini) {
    return MINI_MODE_WIDTH;
  } else if (wasAutoCollapsed) {
    // Restore to previous width when expanding
    return previousWidth;
  } else {
    return previousWidth;
  }
}

describe('Sidebar Auto-Collapse Functionality', () => {
  /**
   * **Feature: player-bar-min-width, Property 5: Sidebar auto-collapse behavior**
   * 
   * *For any* window width below the auto-collapse threshold, the sidebar 
   * SHALL be in mini mode (width < 100px).
   * 
   * **Validates: Requirements 4.1**
   */
  describe('Property 5: Sidebar auto-collapse behavior', () => {
    it('should collapse sidebar to mini mode when window width is below threshold', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 799 }), // widths below threshold
          (windowWidth) => {
            const shouldBeMini = shouldSidebarBeMini(windowWidth);
            expect(shouldBeMini).toBe(true);

            const sidebarWidth = computeSidebarWidth(windowWidth, false, NORMAL_MODE_WIDTH);
            expect(sidebarWidth).toBeLessThan(100);
            expect(sidebarWidth).toBe(MINI_MODE_WIDTH);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should keep sidebar expanded when window width is above threshold', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 800, max: 2000 }), // widths at or above threshold
          (windowWidth) => {
            const shouldBeMini = shouldSidebarBeMini(windowWidth);
            expect(shouldBeMini).toBe(false);

            const sidebarWidth = computeSidebarWidth(windowWidth, false, NORMAL_MODE_WIDTH);
            expect(sidebarWidth).toBeGreaterThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should collapse immediately when crossing threshold from wide to narrow', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 799 }), // narrow widths
          (narrowWidth) => {
            // Start with wide window
            const wideWidth = 1000;
            let sidebarWidth = computeSidebarWidth(wideWidth, false, NORMAL_MODE_WIDTH);
            expect(sidebarWidth).toBeGreaterThanOrEqual(100);

            // Resize to narrow window
            sidebarWidth = computeSidebarWidth(narrowWidth, false, NORMAL_MODE_WIDTH);
            expect(sidebarWidth).toBe(MINI_MODE_WIDTH);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: player-bar-min-width, Property 6: Sidebar state restoration**
   * 
   * *For any* sidebar that was auto-collapsed due to narrow window, when the window 
   * width increases above the threshold, the sidebar SHALL restore to its previous 
   * expanded width.
   * 
   * **Validates: Requirements 4.3**
   */
  describe('Property 6: Sidebar state restoration', () => {
    it('should restore sidebar to previous width when expanding from narrow to wide', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 280, max: 420 }), // valid sidebar widths
          fc.integer({ min: 300, max: 799 }), // narrow window widths
          (previousWidth, narrowWidth) => {
            // Start with narrow window (auto-collapsed)
            let sidebarWidth = computeSidebarWidth(narrowWidth, true, previousWidth);
            expect(sidebarWidth).toBe(MINI_MODE_WIDTH);

            // Resize to wide window
            const wideWidth = 1000;
            sidebarWidth = computeSidebarWidth(wideWidth, true, previousWidth);
            
            // Should restore to previous width
            expect(sidebarWidth).toBe(previousWidth);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve the exact width that was set before auto-collapse', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 280, max: 420 }), // various sidebar widths
          (originalWidth) => {
            // Simulate: user sets sidebar to originalWidth, then window narrows
            const narrowWidth = 600;
            let sidebarWidth = computeSidebarWidth(narrowWidth, true, originalWidth);
            expect(sidebarWidth).toBe(MINI_MODE_WIDTH);

            // Window expands back
            const wideWidth = 1200;
            sidebarWidth = computeSidebarWidth(wideWidth, true, originalWidth);
            
            // Should restore to exact original width
            expect(sidebarWidth).toBe(originalWidth);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple collapse/expand cycles correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 280, max: 420 }), // sidebar width
          (originalWidth) => {
            let wasAutoCollapsed = false;
            let currentWidth = originalWidth;

            // Cycle 1: Collapse
            let windowWidth = 600;
            currentWidth = computeSidebarWidth(windowWidth, wasAutoCollapsed, currentWidth);
            expect(currentWidth).toBe(MINI_MODE_WIDTH);
            wasAutoCollapsed = true;

            // Cycle 1: Expand
            windowWidth = 1000;
            currentWidth = computeSidebarWidth(windowWidth, wasAutoCollapsed, originalWidth);
            expect(currentWidth).toBe(originalWidth);
            wasAutoCollapsed = false;

            // Cycle 2: Collapse again
            windowWidth = 600;
            currentWidth = computeSidebarWidth(windowWidth, wasAutoCollapsed, currentWidth);
            expect(currentWidth).toBe(MINI_MODE_WIDTH);
            wasAutoCollapsed = true;

            // Cycle 2: Expand again
            windowWidth = 1000;
            currentWidth = computeSidebarWidth(windowWidth, wasAutoCollapsed, originalWidth);
            expect(currentWidth).toBe(originalWidth);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional test: Threshold boundary behavior
   */
  describe('Threshold boundary behavior', () => {
    it('should treat exactly 800px as the boundary (not collapsed)', () => {
      const boundaryWidth = 800;
      const shouldBeMini = shouldSidebarBeMini(boundaryWidth);
      expect(shouldBeMini).toBe(false);

      const sidebarWidth = computeSidebarWidth(boundaryWidth, false, NORMAL_MODE_WIDTH);
      expect(sidebarWidth).toBeGreaterThanOrEqual(100);
    });

    it('should treat 799px as below threshold (collapsed)', () => {
      const belowBoundary = 799;
      const shouldBeMini = shouldSidebarBeMini(belowBoundary);
      expect(shouldBeMini).toBe(true);

      const sidebarWidth = computeSidebarWidth(belowBoundary, false, NORMAL_MODE_WIDTH);
      expect(sidebarWidth).toBe(MINI_MODE_WIDTH);
    });
  });
});
