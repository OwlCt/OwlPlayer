/**
 * Configuration constants for Mobile Lyrics View animations and gestures.
 * These values are tuned for smooth, Apple Music-like experience.
 */

/**
 * Spring animation configuration for open/close transitions.
 * Uses framer-motion spring physics.
 */
export const ANIMATION_CONFIG = {
  /** Open animation - slightly bouncy entrance */
  open: {
    type: 'spring' as const,
    damping: 25,
    stiffness: 300,
    mass: 0.8,
  },
  /** Close animation - faster, less bouncy exit */
  close: {
    type: 'spring' as const,
    damping: 30,
    stiffness: 350,
    mass: 0.6,
  },
  /** Scroll animation for auto-scrolling to active line */
  scroll: {
    damping: 0.8,
    duration: 500, // ms
  },
  /** Background color transition when song changes */
  background: {
    duration: 700, // ms
  },
  /** Line highlight transition */
  lineHighlight: {
    duration: 200, // ms
    easing: 'ease-out',
  },
};

/**
 * Gesture configuration for swipe-to-close and interactions.
 */
export const GESTURE_CONFIG = {
  /** Minimum swipe distance to trigger close (px) */
  swipeCloseThreshold: 100,
  /** Minimum swipe velocity to trigger close regardless of distance (px/s) */
  swipeVelocityThreshold: 200,
  /** Duration to pause auto-scroll after user manual scroll (ms) */
  autoScrollPauseDuration: 5000,
  /** Minimum touch target size for accessibility (px) */
  minTouchTarget: 44,
};

/**
 * Opacity values for lyric lines based on distance from active line.
 * Creates a focus effect where active line is brightest.
 */
export const OPACITY_CONFIG = {
  /** Active line (distance = 0) */
  active: 1.0,
  /** Adjacent lines (distance = ±1) */
  adjacent1: 0.5,
  /** Lines at distance ±2 */
  adjacent2: 0.3,
  /** All other lines */
  other: 0.2,
};

/**
 * Get opacity value for a lyric line based on its distance from active line.
 * @param distance - Absolute distance from active line index
 * @returns Opacity value between 0 and 1
 */
export function getLineOpacity(distance: number): number {
  const absDistance = Math.abs(distance);
  if (absDistance === 0) return OPACITY_CONFIG.active;
  if (absDistance === 1) return OPACITY_CONFIG.adjacent1;
  if (absDistance === 2) return OPACITY_CONFIG.adjacent2;
  return OPACITY_CONFIG.other;
}

/**
 * Virtual scrolling configuration for performance optimization.
 */
export const VIRTUAL_SCROLL_CONFIG = {
  /** Minimum number of lines before enabling virtual scrolling */
  threshold: 50,
  /** Number of lines to render above/below viewport */
  overscan: 5,
  /** Estimated line height for virtual scrolling calculations (px) */
  estimatedLineHeight: 60,
};

/**
 * Typography configuration for lyrics display.
 */
export const TYPOGRAPHY_CONFIG = {
  /** Main lyric line font size (px) */
  mainFontSize: 24,
  /** Translation text font size (px) */
  translationFontSize: 14,
  /** Translation text opacity */
  translationOpacity: 0.6,
  /** Line height multiplier */
  lineHeight: 1.4,
  /** Spacing between lines (px) */
  lineSpacing: 16,
};

/**
 * Default background colors when artwork extraction fails.
 */
export const DEFAULT_COLORS = {
  background: '#151515',
  text: '#ffffff',
};

/**
 * Calculate word fill percentage based on current time and word timestamps.
 * @param currentTime - Current playback time in milliseconds
 * @param wordStart - Word start time in milliseconds
 * @param wordEnd - Word end time in milliseconds
 * @returns Fill percentage (0-100)
 */
export function calculateWordFillPercentage(
  currentTime: number,
  wordStart: number,
  wordEnd: number
): number {
  if (currentTime < wordStart) return 0;
  if (currentTime >= wordEnd) return 100;
  
  const duration = wordEnd - wordStart;
  if (duration <= 0) return 100;
  
  const elapsed = currentTime - wordStart;
  return (elapsed / duration) * 100;
}
