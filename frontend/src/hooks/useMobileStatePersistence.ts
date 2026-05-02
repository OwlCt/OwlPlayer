import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';

// Local storage keys for mobile state persistence
const MOBILE_NAV_STATE_KEY = 'mobile-navigation-state';
const MOBILE_STATE_VERSION = 1;

/**
 * Mobile navigation state structure for persistence
 */
export interface MobileNavigationState {
  version: number;
  pathname: string;
  timestamp: number;
}

/**
 * Combined mobile state for persistence (navigation + playback position)
 */
export interface MobilePersistentState {
  navigation: MobileNavigationState;
  playbackPosition?: number;
  currentSongId?: string;
}

/**
 * Save mobile navigation state to localStorage
 */
export function saveMobileNavigationState(pathname: string): void {
  try {
    const state: MobileNavigationState = {
      version: MOBILE_STATE_VERSION,
      pathname,
      timestamp: Date.now(),
    };
    localStorage.setItem(MOBILE_NAV_STATE_KEY, JSON.stringify(state));
  } catch {
    // Swallow localStorage errors (quota, privacy mode, etc.)
  }
}

/**
 * Load mobile navigation state from localStorage
 */
export function loadMobileNavigationState(): MobileNavigationState | null {
  try {
    const raw = localStorage.getItem(MOBILE_NAV_STATE_KEY);
    if (!raw) return null;

    const state: MobileNavigationState = JSON.parse(raw);
    
    // Version check for future migrations
    if (state.version !== MOBILE_STATE_VERSION) {
      return null;
    }

    // Expire state after 24 hours to avoid stale navigation
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - state.timestamp > MAX_AGE_MS) {
      localStorage.removeItem(MOBILE_NAV_STATE_KEY);
      return null;
    }

    return state;
  } catch {
    return null;
  }
}

/**
 * Clear mobile navigation state from localStorage
 */
export function clearMobileNavigationState(): void {
  try {
    localStorage.removeItem(MOBILE_NAV_STATE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Check if the app is running in PWA standalone mode
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check display-mode media query (works for most browsers)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  // Check iOS Safari standalone mode
  const isIOSStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  
  return isStandalone || isIOSStandalone;
}

/**
 * Hook to handle automatic mobile state persistence.
 * - Saves navigation state when route changes
 * - Restores navigation state on app restart (PWA standalone mode)
 * - Works with existing playback state persistence
 * 
 * Requirements: 10.2 - State persistence for mobile
 */
export function useMobileStatePersistence() {
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const { progress, currentSong } = usePlayerStore();
  
  const hasRestoredRef = useRef(false);
  const lastSavedPathRef = useRef<string>('');

  // Save navigation state when route changes
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const currentPath = location.pathname + location.search;
    
    // Only save if path actually changed
    if (currentPath !== lastSavedPathRef.current) {
      lastSavedPathRef.current = currentPath;
      saveMobileNavigationState(currentPath);
    }
  }, [location.pathname, location.search, isAuthenticated]);

  // Save state on visibility change (app going to background)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isAuthenticated) {
        const currentPath = location.pathname + location.search;
        saveMobileNavigationState(currentPath);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [location.pathname, location.search, isAuthenticated]);

  // Save state before page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isAuthenticated) {
        const currentPath = location.pathname + location.search;
        saveMobileNavigationState(currentPath);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
    };
  }, [location.pathname, location.search, isAuthenticated]);

  // Return the restore function for use by the app
  const getRestoredPath = useCallback((): string | null => {
    if (hasRestoredRef.current) return null;
    hasRestoredRef.current = true;

    const savedState = loadMobileNavigationState();
    if (!savedState) return null;

    return savedState.pathname;
  }, []);

  return {
    getRestoredPath,
    isStandalone: isStandaloneMode(),
  };
}

/**
 * Serialize mobile state for round-trip testing
 */
export function serializeMobileState(state: MobilePersistentState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize mobile state for round-trip testing
 */
export function deserializeMobileState(serialized: string): MobilePersistentState | null {
  try {
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}
