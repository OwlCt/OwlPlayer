/**
 * Scroll Animation Utility Functions
 * Provides smooth scroll animations with easing functions for the lyrics panel
 */

export interface ScrollAnimatorOptions {
  container: HTMLElement;
  targetElement: HTMLElement;
  duration?: number;
  easing?: (t: number) => number;
  offset?: number;
  onComplete?: () => void;
}

export interface ScrollAnimatorState {
  isAnimating: boolean;
  cancel: () => void;
}

/**
 * Easing functions for smooth animations
 * All functions take t in [0, 1] and return a value in [0, 1]
 */
export const easings = {
  /**
   * Ease out cubic - fast start, slow end
   * f(t) = 1 - (1 - t)^3
   */
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),

  /**
   * Ease out quart - faster start, slower end than cubic
   * f(t) = 1 - (1 - t)^4
   */
  easeOutQuart: (t: number): number => 1 - Math.pow(1 - t, 4),

  /**
   * Ease in-out cubic - slow start, fast middle, slow end
   * f(t) = 4t^3 for t < 0.5, 1 - (-2t + 2)^3 / 2 for t >= 0.5
   */
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,

  /**
   * Ease out expo - exponential decay
   * f(t) = 1 - 2^(-10t) for t < 1, 1 for t = 1
   */
  easeOutExpo: (t: number): number =>
    t === 1 ? 1 : 1 - Math.pow(2, -10 * t),

  /**
   * Ease out quint - similar to Apple's default animation curve
   * f(t) = 1 - (1 - t)^5
   */
  easeOutQuint: (t: number): number => 1 - Math.pow(1 - t, 5),

  /**
   * iOS-style critically-damped spring approximation.
   * This is the PRIMARY easing for lyrics scroll animations.
   *
   * Unlike easeOutExpo which front-loads 80% of movement into the first 20% of time,
   * this curve has:
   * - A gentle ease-in at the start (doesn't jerk into motion)
   * - Smooth acceleration through the middle
   * - A long, visible deceleration tail (the "silk" feeling)
   *
   * Approximates CASpringAnimation with damping ratio ≈ 1.0 (critically damped).
   * Uses a combination of exponential decay and polynomial shaping.
   */
  iosSpring: (t: number): number => {
    if (t === 0) return 0;
    if (t >= 1) return 1;
    // Critically-damped spring: 1 - (1 + ωt) * e^(-ωt)
    // ω chosen so the curve reaches ~0.99 at t=1
    const omega = 6.5;
    return 1 - (1 + omega * t) * Math.exp(-omega * t);
  },

  /**
   * Spring-like easing with slight overshoot
   * Mimics iOS spring animation feel
   * Uses a damped sine wave for natural bounce
   */
  spring: (t: number): number => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0
      ? 0
      : t === 1
      ? 1
      : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },

  /**
   * Gentle spring - less bounce than spring, more elegant
   * Good for lyric scrolling where overshoot should be subtle
   */
  gentleSpring: (t: number): number => {
    // Attempt slight overshoot then settle
    if (t === 0) return 0;
    if (t === 1) return 1;
    const p = 0.4; // period
    return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
  },
};

/**
 * Calculate optimal animation duration based on scroll distance.
 * Tuned to match iOS Apple Music lyrics scrolling feel:
 * - Short distances (one line ~50-80px) get 550-650ms for a gentle, unhurried slide
 * - Medium distances get 650-800ms
 * - Large distances cap at ~900ms to avoid feeling sluggish
 *
 * The key insight from iOS: even small scrolls take a noticeable amount of time.
 * This creates the "silk" feeling — the animation is always visible, never instant.
 */
export function calculateDuration(distance: number): number {
  const absDistance = Math.abs(distance);

  if (absDistance < 100) {
    // Short scroll (typical line-to-line): 550ms → 650ms
    return 550 + (absDistance / 100) * 100;
  } else if (absDistance < 400) {
    // Medium scroll (skipping 2-4 lines): 650ms → 800ms
    return 650 + ((absDistance - 100) / 300) * 150;
  } else {
    // Long scroll: 800ms → 900ms cap
    const extra = Math.min(absDistance - 400, 600);
    return 800 + (extra / 600) * 100;
  }
}


/**
 * Opacity values for lyric lines based on distance from active line.
 * Creates a focus effect where active line is brightest.
 * Since scale differentiation is minimal (1.0 vs 1.02), opacity carries
 * the primary visual hierarchy — values tuned for strong contrast.
 */
export const OPACITY_CONFIG = {
  /** Active line (distance = 0) */
  active: 1.0,
  /** Adjacent lines (distance = ±1) */
  adjacent1: 0.45,
  /** Lines at distance ±2 */
  adjacent2: 0.3,
  /** Lines at distance ±3 */
  adjacent3: 0.22,
  /** All other lines */
  other: 0.15,
};

/**
 * Get opacity for a lyric line based on its position relative to the active line
 * Uses a smoother gradient curve for more natural depth perception
 */
export function getLineOpacity(adjacentIndex: number): number {
  const absDistance = Math.abs(adjacentIndex);
  if (absDistance === 0) return OPACITY_CONFIG.active;
  if (absDistance === 1) return OPACITY_CONFIG.adjacent1;
  if (absDistance === 2) return OPACITY_CONFIG.adjacent2;
  if (absDistance === 3) return OPACITY_CONFIG.adjacent3;
  return OPACITY_CONFIG.other;
}

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

/**
 * Check if user prefers reduced motion
 * Returns true if the user has enabled reduced motion in their system settings
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Options for animateScrollTo function
 */
export interface AnimateScrollToOptions {
  container: HTMLElement;
  targetScrollTop: number;
  duration?: number;
  easing?: (t: number) => number;
  onComplete?: () => void;
}

/**
 * Animate scroll to a specific scrollTop position
 * Uses requestAnimationFrame with custom easing for Apple-style smooth animation
 * Returns a cancel function to stop the animation
 */
export function animateScrollTo(options: AnimateScrollToOptions): () => void {
  const {
    container,
    targetScrollTop,
    duration: customDuration,
    easing = easings.easeOutExpo,
    onComplete,
  } = options;

  // Check for reduced motion preference
  if (prefersReducedMotion()) {
    container.scrollTop = targetScrollTop;
    onComplete?.();
    return () => {};
  }

  const startPosition = container.scrollTop;
  const distance = targetScrollTop - startPosition;

  // Skip animation for very small distances
  if (Math.abs(distance) < 1) {
    onComplete?.();
    return () => {};
  }

  // Calculate duration based on distance if not provided
  const duration = customDuration ?? calculateDuration(distance);
  const startTime = performance.now();
  let animationFrameId: number | null = null;
  let cancelled = false;

  const animate = (currentTime: number) => {
    if (cancelled) return;

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);

    container.scrollTop = startPosition + distance * easedProgress;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      animationFrameId = null;
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  // Return cancel function
  return () => {
    cancelled = true;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  };
}

/**
 * Animate scroll to center target element in container
 * Uses requestAnimationFrame for smooth animation
 * Returns a state object with cancel function for interruption
 */
export function animateScrollToCenter(
  options: ScrollAnimatorOptions
): ScrollAnimatorState {
  const {
    container,
    targetElement,
    duration: customDuration,
    easing = easings.easeOutCubic,
    offset = 0,
    onComplete,
  } = options;

  // State for tracking animation
  let isAnimating = true;
  let animationFrameId: number | null = null;

  // Cancel function to stop the animation
  const cancel = () => {
    isAnimating = false;
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };

  // Check for reduced motion preference
  if (prefersReducedMotion()) {
    // Instant scroll without animation
    const targetRect = targetElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const targetCenter = targetRect.top + targetRect.height / 2;
    const containerCenter = containerRect.top + containerRect.height / 2;
    const scrollOffset = targetCenter - containerCenter + offset;
    container.scrollTop += scrollOffset;
    isAnimating = false;
    onComplete?.();
    return { isAnimating: false, cancel: () => {} };
  }

  // Calculate target scroll position to center the element
  const targetRect = targetElement.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const targetCenter = targetRect.top + targetRect.height / 2;
  const containerCenter = containerRect.top + containerRect.height / 2;
  const scrollOffset = targetCenter - containerCenter + offset;

  const startPosition = container.scrollTop;
  const targetPosition = startPosition + scrollOffset;
  const distance = Math.abs(scrollOffset);

  // Calculate duration based on distance if not provided
  const duration = customDuration ?? calculateDuration(distance);

  // Skip animation for very small distances
  if (distance < 1) {
    isAnimating = false;
    onComplete?.();
    return { isAnimating: false, cancel: () => {} };
  }

  const startTime = performance.now();

  // Animation loop using requestAnimationFrame
  const animate = (currentTime: number) => {
    if (!isAnimating) {
      return;
    }

    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easing(progress);

    const currentPosition =
      startPosition + (targetPosition - startPosition) * easedProgress;
    container.scrollTop = currentPosition;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      isAnimating = false;
      animationFrameId = null;
      onComplete?.();
    }
  };

  // Start the animation
  animationFrameId = requestAnimationFrame(animate);

  return {
    get isAnimating() {
      return isAnimating;
    },
    cancel,
  };
}
