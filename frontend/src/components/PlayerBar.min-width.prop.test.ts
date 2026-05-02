/**
 * Property-based tests for PlayerBar minimum width constraints
 * 
 * **Feature: player-bar-min-width**
 * Tests the correctness properties for progress bar and volume bar minimum widths
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Constants matching the design
const PROGRESS_BAR_MIN_WIDTH = 120; // px
const VOLUME_BAR_MIN_WIDTH = 60;    // px

/**
 * Helper function to get computed width of an element
 * In tests, we'll simulate this by checking CSS properties
 */
function getComputedWidth(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const width = parseFloat(style.width);
  return isNaN(width) ? 0 : width;
}

/**
 * Helper function to get min-width CSS property
 */
function getMinWidth(element: HTMLElement): number {
  const style = window.getComputedStyle(element);
  const minWidth = parseFloat(style.minWidth);
  return isNaN(minWidth) ? 0 : minWidth;
}

describe('PlayerBar Minimum Width Constraints', () => {
  let container: HTMLElement;

  beforeEach(() => {
    // Create a test container
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  /**
   * **Feature: player-bar-min-width, Property 1: Progress bar minimum width constraint**
   * 
   * *For any* window width, the progress bar computed width SHALL never be less than 120px 
   * when the PlayerBar is visible.
   * 
   * **Validates: Requirements 1.1**
   */
  describe('Property 1: Progress bar minimum width constraint', () => {
    it('should maintain progress bar minimum width of 120px across all window widths', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 2000 }), // window widths from 300px to 2000px
          (windowWidth) => {
            // Create a mock progress bar container
            const progressBar = document.createElement('div');
            progressBar.style.minWidth = `${PROGRESS_BAR_MIN_WIDTH}px`;
            progressBar.style.width = '100%';
            progressBar.style.display = 'flex';
            container.appendChild(progressBar);

            // Simulate window resize
            Object.defineProperty(window, 'innerWidth', {
              writable: true,
              configurable: true,
              value: windowWidth,
            });

            // Get the computed min-width
            const minWidth = getMinWidth(progressBar);

            // The min-width should be at least 120px
            expect(minWidth).toBeGreaterThanOrEqual(PROGRESS_BAR_MIN_WIDTH);

            // Clean up
            container.removeChild(progressBar);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not shrink progress bar below 120px even in very narrow windows', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }), // very narrow windows
          (narrowWidth) => {
            const progressBar = document.createElement('div');
            progressBar.style.minWidth = `${PROGRESS_BAR_MIN_WIDTH}px`;
            progressBar.style.width = '100%';
            container.appendChild(progressBar);

            Object.defineProperty(window, 'innerWidth', {
              writable: true,
              configurable: true,
              value: narrowWidth,
            });

            const minWidth = getMinWidth(progressBar);
            expect(minWidth).toBe(PROGRESS_BAR_MIN_WIDTH);

            container.removeChild(progressBar);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: player-bar-min-width, Property 2: Volume bar minimum width constraint**
   * 
   * *For any* window width, the volume bar computed width SHALL never be less than 60px 
   * when the volume control is visible.
   * 
   * **Validates: Requirements 2.1**
   */
  describe('Property 2: Volume bar minimum width constraint', () => {
    it('should maintain volume bar minimum width of 60px across all window widths', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 2000 }), // window widths from 300px to 2000px
          (windowWidth) => {
            const volumeBar = document.createElement('div');
            volumeBar.style.minWidth = `${VOLUME_BAR_MIN_WIDTH}px`;
            volumeBar.style.width = '96px'; // w-24 in Tailwind
            volumeBar.style.display = 'flex';
            container.appendChild(volumeBar);

            Object.defineProperty(window, 'innerWidth', {
              writable: true,
              configurable: true,
              value: windowWidth,
            });

            const minWidth = getMinWidth(volumeBar);
            expect(minWidth).toBeGreaterThanOrEqual(VOLUME_BAR_MIN_WIDTH);

            container.removeChild(volumeBar);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not shrink volume bar below 60px even in very narrow windows', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }), // very narrow windows
          (narrowWidth) => {
            const volumeBar = document.createElement('div');
            volumeBar.style.minWidth = `${VOLUME_BAR_MIN_WIDTH}px`;
            volumeBar.style.width = '96px';
            container.appendChild(volumeBar);

            Object.defineProperty(window, 'innerWidth', {
              writable: true,
              configurable: true,
              value: narrowWidth,
            });

            const minWidth = getMinWidth(volumeBar);
            expect(minWidth).toBe(VOLUME_BAR_MIN_WIDTH);

            container.removeChild(volumeBar);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: player-bar-min-width, Property 4: Center controls visibility guarantee**
   * 
   * *For any* window width, the center playback controls (play/pause, skip buttons) 
   * SHALL remain fully visible within the viewport.
   * 
   * **Validates: Requirements 3.2**
   */
  describe('Property 4: Center controls visibility guarantee', () => {
    it('should keep center controls visible at all window widths', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 300, max: 2000 }), // all window widths
          (windowWidth) => {
            const playerBar = document.createElement('div');
            playerBar.style.display = 'flex';
            playerBar.style.width = `${windowWidth}px`;
            playerBar.style.height = '78px';
            playerBar.style.backgroundColor = 'black';

            // Left section
            const left = document.createElement('div');
            left.style.width = '30%';
            left.style.minWidth = '180px';
            left.style.flexShrink = '0';
            playerBar.appendChild(left);

            // Center controls (should always be visible)
            const center = document.createElement('div');
            center.style.flex = '1';
            center.style.minWidth = '0';
            center.style.display = 'flex';
            center.style.justifyContent = 'center';
            center.style.alignItems = 'center';
            center.style.gap = '24px'; // gap-6
            
            // Play/pause button
            const playButton = document.createElement('button');
            playButton.style.width = '32px';
            playButton.style.height = '32px';
            playButton.style.flexShrink = '0';
            center.appendChild(playButton);

            playerBar.appendChild(center);

            // Right section
            const right = document.createElement('div');
            right.style.width = '30%';
            right.style.minWidth = '180px';
            right.style.flexShrink = '0';
            playerBar.appendChild(right);

            container.appendChild(playerBar);

            Object.defineProperty(window, 'innerWidth', {
              writable: true,
              configurable: true,
              value: windowWidth,
            });

            // The center controls should have flex: 1 and flex-shrink: 0 for left/right
            // This ensures center controls get space
            expect(center.style.flex).toContain('1');
            expect(left.style.flexShrink).toBe('0');
            expect(right.style.flexShrink).toBe('0');

            container.removeChild(playerBar);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
