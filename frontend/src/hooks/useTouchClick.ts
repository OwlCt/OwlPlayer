import { useRef, useCallback, TouchEvent, MouseEvent } from 'react';

/**
 * Configuration for touch click behavior
 */
export interface TouchClickConfig {
  /** Maximum movement in pixels before touch is considered a scroll (default: 10) */
  moveThreshold?: number;
  /** Maximum time in ms for a touch to be considered a tap (default: 300) */
  tapTimeout?: number;
  /** Callback for long press gesture */
  onLongPress?: () => void;
  /** Time in ms to trigger long press (default: 500) */
  longPressDelay?: number;
}

/**
 * Return type for useTouchClick hook
 */
export interface TouchClickHandlers {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: (e: TouchEvent) => void;
  onClick: (e: MouseEvent) => void;
}

/**
 * Determines if a touch interaction should be considered a tap (click) or a scroll.
 * A tap is valid when:
 * - Total movement is less than the threshold
 * - Touch duration is less than the timeout
 * 
 * @param startX - Starting X coordinate
 * @param startY - Starting Y coordinate
 * @param endX - Ending X coordinate
 * @param endY - Ending Y coordinate
 * @param moveThreshold - Maximum allowed movement in pixels
 * @returns boolean - true if the touch should be treated as a tap
 */
export function isTapGesture(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  moveThreshold: number
): boolean {
  const deltaX = Math.abs(endX - startX);
  const deltaY = Math.abs(endY - startY);
  return deltaX < moveThreshold && deltaY < moveThreshold;
}

/**
 * Hook to handle touch interactions that distinguish between taps and scrolls.
 * Prevents click events from firing when the user is scrolling.
 * 
 * This solves the common mobile UX issue where scrolling through a list
 * accidentally triggers item clicks.
 * 
 * @param onClick - Callback to execute on valid tap
 * @param config - Optional configuration for thresholds
 * @returns Touch and click event handlers to spread on the element
 * 
 * @example
 * ```tsx
 * const handlers = useTouchClick(() => navigate('/item/123'));
 * return <div {...handlers}>Item</div>;
 * ```
 */
export function useTouchClick(
  onClick: () => void,
  config: TouchClickConfig = {}
): TouchClickHandlers {
  const { moveThreshold = 10, tapTimeout = 300, onLongPress, longPressDelay = 500 } = config;
  
  // Track touch state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isTouchMovedRef = useRef(false);
  const isTouchActiveRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressTriggeredRef = useRef(false);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    isTouchMovedRef.current = false;
    isTouchActiveRef.current = true;
    isLongPressTriggeredRef.current = false;
    
    // Start long press timer if callback provided
    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        if (!isTouchMovedRef.current) {
          isLongPressTriggeredRef.current = true;
          onLongPress();
        }
      }, longPressDelay);
    }
  }, [onLongPress, longPressDelay]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.touches[0];
    const isValidTap = isTapGesture(
      touchStartRef.current.x,
      touchStartRef.current.y,
      touch.clientX,
      touch.clientY,
      moveThreshold
    );
    
    if (!isValidTap) {
      isTouchMovedRef.current = true;
      // Cancel long press timer if user moved
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, [moveThreshold]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // If long press was triggered, don't fire click
    if (isLongPressTriggeredRef.current) {
      touchStartRef.current = null;
      isTouchActiveRef.current = false;
      isLongPressTriggeredRef.current = false;
      return;
    }
    
    if (!touchStartRef.current || isTouchMovedRef.current) {
      touchStartRef.current = null;
      isTouchActiveRef.current = false;
      return;
    }

    const touchDuration = Date.now() - touchStartRef.current.time;
    const changedTouch = e.changedTouches[0];
    
    const isValidTap = isTapGesture(
      touchStartRef.current.x,
      touchStartRef.current.y,
      changedTouch.clientX,
      changedTouch.clientY,
      moveThreshold
    ) && touchDuration < tapTimeout;

    if (isValidTap) {
      // Prevent the subsequent click event from firing
      e.preventDefault();
      onClick();
    }

    touchStartRef.current = null;
    isTouchActiveRef.current = false;
  }, [onClick, moveThreshold, tapTimeout]);

  // For desktop, use regular click
  // For mobile, the touch handlers above will handle it
  const handleClick = useCallback((_e: MouseEvent) => {
    // If this click was triggered by a touch event, ignore it
    // (the touch handlers already handled it)
    if (isTouchActiveRef.current) {
      return;
    }
    onClick();
  }, [onClick]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onClick: handleClick,
  };
}

export default useTouchClick;
