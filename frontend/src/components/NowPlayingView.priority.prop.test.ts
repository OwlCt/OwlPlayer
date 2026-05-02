/**
 * Property-based tests for main content area priority in responsive layout
 * 
 * **Feature: player-bar-min-width**
 * Tests the correctness properties for layout priority when NowPlayingView is open
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Constants for layout
const MAIN_CONTENT_MIN_WIDTH = 300; // px, minimum usable width for main content
const NOW_PLAYING_MIN_WIDTH = 280; // px, minimum width for NowPlayingView
const SIDEBAR_MIN_WIDTH = 280; // px, minimum width for sidebar
const SIDEBAR_MINI_WIDTH = 85; // px, mini mode width

/**
 * Pure function to compute layout widths based on window width
 * Returns { sidebar, mainContent, nowPlaying }
 */
function computeLayoutWidths(
  windowWidth: number,
  showNowPlaying: boolean,
  sidebarAutoCollapsed: boolean
): { sidebar: number; mainContent: number; nowPlaying: number } {
  // Sidebar width
  const sidebarWidth = sidebarAutoCollapsed ? SIDEBAR_MINI_WIDTH : SIDEBAR_MIN_WIDTH;
  
  // Available width after sidebar
  let availableWidth = windowWidth - sidebarWidth;
  
  if (!showNowPlaying) {
    // No NowPlayingView, all available width goes to main content
    return {
      sidebar: sidebarWidth,
      mainContent: availableWidth,
      nowPlaying: 0,
    };
  }
  
  // NowPlayingView is open
  // Priority: main content gets minimum usable width first
  if (availableWidth <= MAIN_CONTENT_MIN_WIDTH + NOW_PLAYING_MIN_WIDTH) {
    // Very narrow: main content gets priority, NowPlayingView can overflow
    const mainContentWidth = Math.max(MAIN_CONTENT_MIN_WIDTH, availableWidth - NOW_PLAYING_MIN_WIDTH);
    return {
      sidebar: sidebarWidth,
      mainContent: mainContentWidth,
      nowPlaying: NOW_PLAYING_MIN_WIDTH, // Can overflow beyond window
    };
  }
  
  // Normal case: both get space, but main content is prioritized
  const mainContentWidth = Math.max(
    MAIN_CONTENT_MIN_WIDTH,
    availableWidth - NOW_PLAYING_MIN_WIDTH
  );
  const nowPlayingWidth = availableWidth - mainContentWidth;
  
  return {
    sidebar: sidebarWidth,
    mainContent: mainContentWidth,
    nowPlaying: Math.max(nowPlayingWidth, NOW_PLAYING_MIN_WIDTH),
  };
}

describe('Main Content Area Priority in Responsive Layout', () => {
  /**
   * **Feature: player-bar-min-width, Property 7: Main content area priority**
   * 
   * *For any* window width where NowPlayingView is open, the main content area 
   * SHALL maintain a minimum usable width before NowPlayingView is allowed to overflow.
   * 
   * **Validates: Requirements 5.2, 5.3**
   */
  describe('Property 7: Main content area priority', () => {
    it('should maintain main content minimum width when NowPlayingView is open', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 800, max: 2000 }), // various window widths (wide enough)
          fc.boolean(), // sidebar auto-collapsed or not
          (windowWidth, sidebarAutoCollapsed) => {
            const layout = computeLayoutWidths(windowWidth, true, sidebarAutoCollapsed);
            
            // Main content should have at least minimum usable width
            expect(layout.mainContent).toBeGreaterThanOrEqual(MAIN_CONTENT_MIN_WIDTH);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allow NowPlayingView to overflow when space is limited', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 600, max: 800 }), // narrow windows
          (windowWidth) => {
            const layout = computeLayoutWidths(windowWidth, true, false);
            
            // In narrow windows, NowPlayingView should maintain minimum width
            // even if it means overflowing
            expect(layout.nowPlaying).toBeGreaterThanOrEqual(NOW_PLAYING_MIN_WIDTH);
            
            // Main content should still have usable width (but may be less than ideal)
            expect(layout.mainContent).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should give more space to main content than NowPlayingView in normal windows', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1200, max: 2000 }), // wide windows
          (windowWidth) => {
            const layout = computeLayoutWidths(windowWidth, true, false);
            
            // In wide windows, main content should get more space
            expect(layout.mainContent).toBeGreaterThanOrEqual(layout.nowPlaying);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should allocate all available space to main content when NowPlayingView is closed', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 600, max: 2000 }), // various window widths
          fc.boolean(), // sidebar auto-collapsed or not
          (windowWidth, sidebarAutoCollapsed) => {
            const layout = computeLayoutWidths(windowWidth, false, sidebarAutoCollapsed);
            
            // When NowPlayingView is closed, it should get no width
            expect(layout.nowPlaying).toBe(0);
            
            // Main content should get all available space
            const sidebarWidth = sidebarAutoCollapsed ? SIDEBAR_MINI_WIDTH : SIDEBAR_MIN_WIDTH;
            const expectedMainContentWidth = windowWidth - sidebarWidth;
            expect(layout.mainContent).toBe(expectedMainContentWidth);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle sidebar auto-collapse affecting available space', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 600, max: 2000 }), // various window widths
          (windowWidth) => {
            // With normal sidebar
            const layoutNormal = computeLayoutWidths(windowWidth, true, false);
            
            // With auto-collapsed sidebar
            const layoutCollapsed = computeLayoutWidths(windowWidth, true, true);
            
            // Auto-collapsed sidebar should free up space
            const sidebarSpaceSaved = SIDEBAR_MIN_WIDTH - SIDEBAR_MINI_WIDTH;
            expect(layoutCollapsed.mainContent + layoutCollapsed.nowPlaying)
              .toBeGreaterThanOrEqual(layoutNormal.mainContent + layoutNormal.nowPlaying);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain layout consistency across window resize', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 800, max: 1000 }), // starting width
          fc.integer({ min: 1000, max: 2000 }), // ending width
          (startWidth, endWidth) => {
            const layoutStart = computeLayoutWidths(startWidth, true, false);
            const layoutEnd = computeLayoutWidths(endWidth, true, false);
            
            // Both should maintain main content minimum
            expect(layoutStart.mainContent).toBeGreaterThanOrEqual(MAIN_CONTENT_MIN_WIDTH);
            expect(layoutEnd.mainContent).toBeGreaterThanOrEqual(MAIN_CONTENT_MIN_WIDTH);
            
            // Wider window should give more space to main content
            expect(layoutEnd.mainContent).toBeGreaterThanOrEqual(layoutStart.mainContent);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional test: Layout totals
   */
  describe('Layout total width consistency', () => {
    it('should account for all window width in layout', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 600, max: 2000 }), // various window widths
          fc.boolean(), // NowPlayingView open or closed
          fc.boolean(), // sidebar auto-collapsed or not
          (windowWidth, showNowPlaying, sidebarAutoCollapsed) => {
            const layout = computeLayoutWidths(windowWidth, showNowPlaying, sidebarAutoCollapsed);
            
            // When NowPlayingView is closed, total should equal window width
            if (!showNowPlaying) {
              expect(layout.sidebar + layout.mainContent).toBe(windowWidth);
            } else {
              // When NowPlayingView is open, it might overflow
              // But sidebar + mainContent should not exceed window width
              expect(layout.sidebar + layout.mainContent).toBeLessThanOrEqual(windowWidth);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
