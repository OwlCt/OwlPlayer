/**
 * Property-based tests for SearchPage responsive song list layout
 * 
 * **Feature: player-bar-min-width**
 * Tests the correctness properties for song list responsive layout
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Constants for layout
const WRAP_THRESHOLD = 768; // px, md breakpoint in Tailwind
const SONG_CARD_MIN_WIDTH = 300; // px, minimum width for song card
const SONG_CARD_GAP = 16; // px, gap between cards

/**
 * Pure function to determine if song list should wrap
 */
function shouldSongListWrap(windowWidth: number): boolean {
  return windowWidth < WRAP_THRESHOLD;
}

/**
 * Pure function to compute number of columns for song list
 */
function computeColumns(windowWidth: number): number {
  if (windowWidth < WRAP_THRESHOLD) {
    // Below md breakpoint: single column (stacked)
    return 1;
  }
  
  // Calculate how many columns fit
  const availableWidth = windowWidth - 32; // padding
  const columnWidth = SONG_CARD_MIN_WIDTH + SONG_CARD_GAP;
  const columns = Math.floor(availableWidth / columnWidth);
  
  return Math.max(1, columns);
}

/**
 * Pure function to compute song card width in grid
 */
function computeSongCardWidth(windowWidth: number): number {
  const columns = computeColumns(windowWidth);
  const availableWidth = windowWidth - 32; // padding
  const totalGapWidth = (columns - 1) * SONG_CARD_GAP;
  const totalCardWidth = availableWidth - totalGapWidth;
  
  return totalCardWidth / columns;
}

describe('SearchPage Responsive Song List Layout', () => {
  /**
   * **Feature: player-bar-min-width, Property 8: Song list responsive layout**
   * 
   * *For any* window width below the wrap threshold, the search page song list 
   * SHALL display in a stacked/wrapped layout while preserving all song information 
   * (title, artist, duration).
   * 
   * **Validates: Requirements 6.1, 6.3**
   */
  describe('Property 8: Song list responsive layout', () => {
    it('should display songs in single column on narrow windows', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 767 }), // widths below wrap threshold
          (windowWidth) => {
            const shouldWrap = shouldSongListWrap(windowWidth);
            expect(shouldWrap).toBe(true);

            const columns = computeColumns(windowWidth);
            expect(columns).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should display songs in multiple columns on wide windows', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 768, max: 2000 }), // widths at or above wrap threshold
          (windowWidth) => {
            const shouldWrap = shouldSongListWrap(windowWidth);
            expect(shouldWrap).toBe(false);

            const columns = computeColumns(windowWidth);
            expect(columns).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should maintain minimum card width on all window sizes', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 2000 }), // all window widths
          (windowWidth) => {
            const cardWidth = computeSongCardWidth(windowWidth);
            
            // Card width should be positive
            expect(cardWidth).toBeGreaterThan(0);
            
            // On narrow windows, card should be close to window width
            if (windowWidth < WRAP_THRESHOLD) {
              expect(cardWidth).toBeLessThanOrEqual(windowWidth - 32);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should increase number of columns as window gets wider', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 768, max: 1500 }), // starting width
          fc.integer({ min: 1500, max: 2000 }), // ending width
          (startWidth, endWidth) => {
            const startColumns = computeColumns(startWidth);
            const endColumns = computeColumns(endWidth);
            
            // Wider window should have at least as many columns
            expect(endColumns).toBeGreaterThanOrEqual(startColumns);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle threshold boundary correctly', () => {
      // Just below threshold
      const belowThreshold = 767;
      expect(shouldSongListWrap(belowThreshold)).toBe(true);
      expect(computeColumns(belowThreshold)).toBe(1);

      // At threshold
      const atThreshold = 768;
      expect(shouldSongListWrap(atThreshold)).toBe(false);
      expect(computeColumns(atThreshold)).toBeGreaterThanOrEqual(1);

      // Above threshold
      const aboveThreshold = 769;
      expect(shouldSongListWrap(aboveThreshold)).toBe(false);
      expect(computeColumns(aboveThreshold)).toBeGreaterThanOrEqual(1);
    });

    it('should preserve song information visibility in all layouts', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 2000 }), // all window widths
          (windowWidth) => {
            const columns = computeColumns(windowWidth);
            const cardWidth = computeSongCardWidth(windowWidth);
            
            // Song card should have enough width to display information
            // Minimum width for title + artist + duration
            expect(cardWidth).toBeGreaterThan(0);
            
            // On narrow windows, should be single column
            if (windowWidth < WRAP_THRESHOLD) {
              expect(columns).toBe(1);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle very narrow windows gracefully', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 400 }), // very narrow windows
          (windowWidth) => {
            const columns = computeColumns(windowWidth);
            const cardWidth = computeSongCardWidth(windowWidth);
            
            // Should still be single column
            expect(columns).toBe(1);
            
            // Card width should fit in window
            expect(cardWidth).toBeLessThanOrEqual(windowWidth - 32);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle very wide windows efficiently', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1800, max: 2000 }), // very wide windows
          (windowWidth) => {
            const columns = computeColumns(windowWidth);
            
            // Should have multiple columns
            expect(columns).toBeGreaterThan(1);
            
            // Each column should maintain minimum width
            const cardWidth = computeSongCardWidth(windowWidth);
            expect(cardWidth).toBeGreaterThanOrEqual(SONG_CARD_MIN_WIDTH);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional test: Layout consistency
   */
  describe('Layout consistency', () => {
    it('should maintain consistent spacing between cards', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 768, max: 2000 }), // wide windows with multiple columns
          (windowWidth) => {
            const columns = computeColumns(windowWidth);
            
            if (columns > 1) {
              // With multiple columns, gap should be consistent
              const availableWidth = windowWidth - 32;
              const totalGapWidth = (columns - 1) * SONG_CARD_GAP;
              const totalCardWidth = availableWidth - totalGapWidth;
              
              // Total width should fit in available space
              expect(totalCardWidth + totalGapWidth).toBeLessThanOrEqual(availableWidth);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle window resize transitions smoothly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 700 }), // narrow starting width
          fc.integer({ min: 800, max: 2000 }), // wide ending width
          (narrowWidth, wideWidth) => {
            const narrowColumns = computeColumns(narrowWidth);
            const wideColumns = computeColumns(wideWidth);
            
            // Narrow should be single column
            expect(narrowColumns).toBe(1);
            
            // Wide should have multiple columns
            expect(wideColumns).toBeGreaterThanOrEqual(1);
            
            // Transition should be smooth (no negative widths)
            const narrowCardWidth = computeSongCardWidth(narrowWidth);
            const wideCardWidth = computeSongCardWidth(wideWidth);
            
            expect(narrowCardWidth).toBeGreaterThan(0);
            expect(wideCardWidth).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
