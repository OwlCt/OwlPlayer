import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { create } from 'zustand';

export type NavigationDirection = 'forward' | 'back';

// Store to track navigation direction across components
interface NavigationDirectionStore {
  direction: NavigationDirection;
  setDirection: (direction: NavigationDirection) => void;
}

export const useNavigationDirectionStore = create<NavigationDirectionStore>((set) => ({
  direction: 'forward',
  setDirection: (direction) => set({ direction }),
}));

/**
 * Custom hook to track navigation direction (forward/back).
 * Uses a combination of browser history state index and our own tracking.
 * 
 * - Forward: navigating to a new page (right to left slide in)
 * - Back: returning to previous page (left to right slide out)
 */
export function useNavigationDirection(): NavigationDirection {
  const location = useLocation();
  const { direction, setDirection } = useNavigationDirectionStore();
  const prevHistoryIdx = useRef<number | null>(null);
  const pathHistoryRef = useRef<string[]>([]);

  useEffect(() => {
    const currentPath = location.pathname;
    const currentIdx = window.history.state?.idx ?? 0;
    
    // Check if we're navigating back to a previously visited path
    const pathHistory = pathHistoryRef.current;
    const prevPathIndex = pathHistory.lastIndexOf(currentPath);
    
    if (prevHistoryIdx.current !== null) {
      // Primary check: use history index
      if (currentIdx > prevHistoryIdx.current) {
        setDirection('forward');
        // Add to path history for forward navigation
        pathHistoryRef.current = [...pathHistory, currentPath];
      } else if (currentIdx < prevHistoryIdx.current) {
        setDirection('back');
        // Trim path history when going back
        if (prevPathIndex >= 0) {
          pathHistoryRef.current = pathHistory.slice(0, prevPathIndex + 1);
        }
      } else {
        // Same index (replace navigation or intercepted back)
        // Check if current path exists earlier in our path history
        if (prevPathIndex >= 0 && prevPathIndex < pathHistory.length - 1) {
          // We're going back to a previously visited path
          setDirection('back');
          pathHistoryRef.current = pathHistory.slice(0, prevPathIndex + 1);
        } else {
          // Keep current direction for replace navigation
          pathHistoryRef.current = [...pathHistory, currentPath];
        }
      }
    } else {
      // First navigation
      pathHistoryRef.current = [currentPath];
    }
    
    prevHistoryIdx.current = currentIdx;
  }, [location.key, location.pathname, setDirection]);

  return direction;
}

/**
 * Manually set navigation direction.
 * Use this when programmatically navigating back to ensure correct direction.
 */
export function setNavigationDirection(direction: NavigationDirection): void {
  useNavigationDirectionStore.getState().setDirection(direction);
}
