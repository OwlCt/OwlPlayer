import { useState, useEffect, useCallback, RefObject } from 'react';
import { calculateOverlayOpacity, isHeaderVisible } from '../utils/scrollHeader';

export interface ScrollHeaderState {
  /** Overlay opacity (0-1) */
  overlayOpacity: number;
  /** Whether the fixed header is visible (action bar fully covered) */
  isHeaderVisible: boolean;
  /** Header opacity based on scroll progress (0-1) */
  headerOpacity: number;
}

/**
 * Hook for managing sticky header scroll behavior
 * @param actionBarRef Reference to the action bar element
 * @param containerRef Reference to the scrollable container element
 * @param startOffset Offset from top where overlay fade starts (default: 0)
 * @param triggerOffset Extra offset to trigger header earlier (positive = earlier trigger)
 * @returns ScrollHeaderState with overlayOpacity, isHeaderVisible, and headerOpacity
 */
export function useScrollHeader(
  actionBarRef: RefObject<HTMLElement>,
  containerRef: RefObject<HTMLElement> | HTMLElement | null,
  startOffset: number = 0,
  triggerOffset: number = 0
): ScrollHeaderState {
  const [state, setState] = useState<ScrollHeaderState>({
    overlayOpacity: 0,
    isHeaderVisible: false,
    headerOpacity: 0,
  });

  const getContainer = useCallback(() => {
    if (!containerRef) return null;
    if ('current' in containerRef) return containerRef.current;
    return containerRef;
  }, [containerRef]);

  const handleScroll = useCallback(() => {
    const container = getContainer();
    if (!container) return;

    const scrollY = container.scrollTop;
    const actionBarTop = actionBarRef.current?.offsetTop ?? 0;
    const actionBarHeight = actionBarRef.current?.offsetHeight ?? 56;
    
    // Calculate overlay opacity
    // Start fading in from startOffset, reach full opacity at actionBarTop
    const overlayOpacity = calculateOverlayOpacity(
      scrollY,
      startOffset,
      actionBarTop
    );

    // Calculate header opacity - starts fading in and completes when reaching action bar top
    // Fade starts at startOffset and completes at actionBarTop (when play button starts to be covered)
    const fadeEndPoint = actionBarTop;
    const headerOpacity = calculateOverlayOpacity(
      scrollY,
      startOffset,
      fadeEndPoint
    );

    // Header is fully visible when action bar is completely covered
    // triggerOffset allows triggering earlier (positive value = earlier trigger)
    const headerVisible = isHeaderVisible(scrollY, actionBarTop + actionBarHeight - triggerOffset);

    setState({
      overlayOpacity,
      isHeaderVisible: headerVisible,
      headerOpacity,
    });
  }, [actionBarRef, containerRef, startOffset, triggerOffset]);

  useEffect(() => {
    const container = getContainer();
    if (!container) return;

    let rafId: number | null = null;

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        handleScroll();
        rafId = null;
      });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    
    // Initial calculation
    handleScroll();

    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [containerRef, handleScroll]);

  return state;
}
