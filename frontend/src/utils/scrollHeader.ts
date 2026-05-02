/**
 * Scroll header utility functions for sticky header behavior
 */

/**
 * Calculate overlay opacity based on scroll position
 * @param scrollY Current scroll position
 * @param startThreshold Scroll position where fade-in starts
 * @param endThreshold Scroll position where opacity reaches maximum
 * @returns Opacity value clamped to [0, 1]
 */
export function calculateOverlayOpacity(
  scrollY: number,
  startThreshold: number,
  endThreshold: number
): number {
  if (scrollY <= startThreshold) {
    return 0;
  }
  if (scrollY >= endThreshold) {
    return 1;
  }
  const range = endThreshold - startThreshold;
  if (range <= 0) {
    return scrollY >= startThreshold ? 1 : 0;
  }
  return (scrollY - startThreshold) / range;
}

/**
 * Determine if the fixed header should be visible
 * @param scrollY Current scroll position
 * @param actionBarTop Top position of the action bar
 * @returns Whether the fixed header should be visible
 */
export function isHeaderVisible(
  scrollY: number,
  actionBarTop: number
): boolean {
  return scrollY >= actionBarTop;
}
