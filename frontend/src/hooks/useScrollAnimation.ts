/**
 * useScrollAnimation Hook
 * Mobile-style scroll animation for lyrics panel
 * - Positions active line at upper 1/3 of container
 * - Uses touch/wheel detection to distinguish user scroll from programmatic scroll
 * - Apple-style smooth animation with easeOutExpo curve
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { animateScrollTo, easings } from '../utils/scrollAnimator';

export interface UseScrollAnimationOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  lineRefs: React.MutableRefObject<(HTMLElement | null)[]>;
  currentLineIndex: number;
  enabled?: boolean;
  /** How long to pause auto-scroll after user scrolls (ms) */
  pauseDuration?: number;
  /** Offset to position active line above center (positive = higher) */
  scrollOffset?: number;
}

export interface UseScrollAnimationReturn {
  isPaused: boolean;
  scrollToLine: (index: number, immediate?: boolean) => void;
  resumeAutoScroll: () => void;
}

const DEFAULT_PAUSE_DURATION = 5000; // 5 seconds like mobile
export const DEFAULT_SCROLL_OFFSET = 0;

/**
 * Mobile-style scroll animation hook
 * - Auto-scrolls to position current line at upper 1/3
 * - Pauses immediately on user interaction (wheel/touch)
 * - Resumes after timeout or when user clicks a line
 * - Uses Apple-style easeOutExpo animation curve
 */
export function useScrollAnimation(
  options: UseScrollAnimationOptions
): UseScrollAnimationReturn {
  const {
    containerRef,
    lineRefs,
    currentLineIndex,
    enabled = true,
    pauseDuration = DEFAULT_PAUSE_DURATION,
    scrollOffset = DEFAULT_SCROLL_OFFSET,
  } = options;

  const [isPaused, setIsPaused] = useState(false);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track if user is actively interacting (wheel or touch)
  const isUserInteractingRef = useRef(false);
  // Track current animation cancel function
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  // Clear pause timer
  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  // Resume auto-scroll immediately
  const resumeAutoScroll = useCallback(() => {
    clearPauseTimer();
    setIsPaused(false);
  }, [clearPauseTimer]);

  // Start resume countdown (called when user stops interacting)
  const startResumeCountdown = useCallback(() => {
    clearPauseTimer();
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(false);
    }, pauseDuration);
  }, [clearPauseTimer, pauseDuration]);

  // Cancel any ongoing animation
  const cancelCurrentAnimation = useCallback(() => {
    if (cancelAnimationRef.current) {
      cancelAnimationRef.current();
      cancelAnimationRef.current = null;
    }
  }, []);

  // Scroll to a specific line - using getBoundingClientRect for accurate positioning
  // Apple-style smooth animation with easeOutExpo curve
  const scrollToLine = useCallback(
    (index: number, immediate: boolean = false) => {
      const container = containerRef.current;
      const targetElement = lineRefs.current[index];

      if (!container || !targetElement || !enabled) return;
      if (isPaused && !immediate) return;

      // Cancel any ongoing animation before starting a new one
      cancelCurrentAnimation();

      // Use getBoundingClientRect for accurate positioning (like mobile)
      const containerRect = container.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();
      const containerHeight = containerRect.height;

      // Calculate current element position relative to container's scroll
      const elementTopRelative = elementRect.top - containerRect.top + container.scrollTop;

      // Position active line at upper 1/3 of container
      const targetPosition = containerHeight / 3;
      const targetScrollTop = Math.max(0, elementTopRelative - targetPosition + scrollOffset);

      // Skip if already at target (within 5px tolerance)
      const scrollDelta = Math.abs(container.scrollTop - targetScrollTop);
      if (scrollDelta < 5) return;

      if (immediate) {
        container.scrollTop = targetScrollTop;
        return;
      }

      // Apple-style smooth scroll with iOS spring easing
      cancelAnimationRef.current = animateScrollTo({
        container,
        targetScrollTop,
        easing: easings.iosSpring,
      });
    },
    [containerRef, lineRefs, enabled, isPaused, scrollOffset, cancelCurrentAnimation]
  );

  // Detect user scroll - wheel events (desktop)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Wheel start - pause immediately and cancel ongoing animation
    const handleWheel = () => {
      // Cancel any ongoing programmatic scroll animation
      cancelCurrentAnimation();

      if (!isPaused) {
        setIsPaused(true);
      }
      isUserInteractingRef.current = true;

      // Reset interaction flag and start countdown after wheel stops
      clearPauseTimer();
      pauseTimerRef.current = setTimeout(() => {
        isUserInteractingRef.current = false;
        startResumeCountdown();
      }, 150); // Wait 150ms after last wheel event
    };

    container.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef, enabled, isPaused, clearPauseTimer, startResumeCountdown, cancelCurrentAnimation]);

  // Detect user scroll - touch events (tablet/touch screen)
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Touch start - pause immediately and cancel ongoing animation
    const handleTouchStart = () => {
      // Cancel any ongoing programmatic scroll animation
      cancelCurrentAnimation();

      isUserInteractingRef.current = true;
      clearPauseTimer();
      if (!isPaused) {
        setIsPaused(true);
      }
    };

    // Touch end - start countdown
    const handleTouchEnd = () => {
      isUserInteractingRef.current = false;
      startResumeCountdown();
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, enabled, isPaused, clearPauseTimer, startResumeCountdown, cancelCurrentAnimation]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearPauseTimer();
      cancelCurrentAnimation();
    };
  }, [clearPauseTimer, cancelCurrentAnimation]);

  return {
    isPaused,
    scrollToLine,
    resumeAutoScroll,
  };
}
