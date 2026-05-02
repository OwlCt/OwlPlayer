import { useState, useEffect, useSyncExternalStore } from 'react';

// ============================================================================
// Manual Offline Mode Storage
// ============================================================================

const MANUAL_OFFLINE_KEY = 'manual_offline_mode';

// Global state for manual offline mode
let manualOfflineMode = typeof localStorage !== 'undefined' 
  ? localStorage.getItem(MANUAL_OFFLINE_KEY) === 'true' 
  : false;

// Subscribers for manual offline mode changes
const manualOfflineSubscribers = new Set<() => void>();

function subscribeManualOffline(callback: () => void) {
  manualOfflineSubscribers.add(callback);
  return () => manualOfflineSubscribers.delete(callback);
}

function getManualOfflineSnapshot() {
  return manualOfflineMode;
}

function notifyManualOfflineChange() {
  manualOfflineSubscribers.forEach(callback => callback());
}

/**
 * Set manual offline mode
 * When enabled, ALL network requests will be blocked to save bandwidth
 * @param enabled - Whether to enable manual offline mode
 */
export function setManualOfflineMode(enabled: boolean) {
  manualOfflineMode = enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MANUAL_OFFLINE_KEY, String(enabled));
  }
  notifyManualOfflineChange();
  
  // Dispatch custom event for non-React listeners (like axios interceptors)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('offlineModeChange', { detail: { enabled } }));
  }
}

/**
 * Get current manual offline mode status
 */
export function getManualOfflineMode(): boolean {
  return manualOfflineMode;
}

/**
 * Check if network requests should be blocked
 * Returns true when in manual offline mode (to save bandwidth)
 */
export function shouldBlockNetworkRequests(): boolean {
  return manualOfflineMode;
}

/**
 * Hook to use manual offline mode with reactive updates
 */
export function useManualOfflineMode() {
  const isManualOffline = useSyncExternalStore(
    subscribeManualOffline,
    getManualOfflineSnapshot,
    () => false // Server snapshot
  );
  
  return {
    isManualOffline,
    setManualOffline: setManualOfflineMode,
  };
}

// ============================================================================
// Online Status Hook
// ============================================================================

// Global subscribers for network recovery events
const networkRecoverySubscribers = new Set<() => void>();

// Global flag to track if we were offline (shared across all hook instances)
let globalWasOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

// Global flag to track if network status listeners are initialized
let networkListenersInitialized = false;

// Global subscribers for network status changes (for React state updates)
const networkStatusSubscribers = new Set<(online: boolean) => void>();

/**
 * Subscribe to network recovery events
 * Callback will be called immediately when network is restored
 */
export function subscribeToNetworkRecovery(callback: () => void): () => void {
  networkRecoverySubscribers.add(callback);
  return () => networkRecoverySubscribers.delete(callback);
}

/**
 * Notify all subscribers that network has been restored
 */
function notifyNetworkRecovery() {
  console.log('[useOnlineStatus] Network recovered, notifying', networkRecoverySubscribers.size, 'subscribers...');
  networkRecoverySubscribers.forEach(callback => {
    try {
      callback();
    } catch (e) {
      console.error('[useOnlineStatus] Error in network recovery callback:', e);
    }
  });
}

/**
 * Initialize global network status listeners (singleton)
 */
function initNetworkListeners() {
  if (networkListenersInitialized || typeof window === 'undefined') return;
  networkListenersInitialized = true;
  
  const handleOnline = () => {
    console.log('[useOnlineStatus] Network online event received, globalWasOffline:', globalWasOffline);
    const wasReallyOffline = globalWasOffline;
    globalWasOffline = false;
    
    // Notify React state subscribers
    networkStatusSubscribers.forEach(cb => cb(true));
    
    // Only notify recovery subscribers if we were really offline and not in manual offline mode
    if (!getManualOfflineMode() && wasReallyOffline) {
      notifyNetworkRecovery();
    }
  };
  
  const handleOffline = () => {
    console.log('[useOnlineStatus] Network offline event received');
    globalWasOffline = true;
    
    // Notify React state subscribers
    networkStatusSubscribers.forEach(cb => cb(false));
  };
  
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      const currentlyOnline = navigator.onLine;
      
      console.log('[useOnlineStatus] Visibility change - online:', currentlyOnline, 'globalWasOffline:', globalWasOffline);
      
      if (currentlyOnline && globalWasOffline) {
        // Network recovered while page was hidden
        console.log('[useOnlineStatus] Network recovered while page was hidden');
        globalWasOffline = false;
        
        // Notify React state subscribers
        networkStatusSubscribers.forEach(cb => cb(true));
        
        // Notify recovery subscribers if not in manual offline mode
        if (!getManualOfflineMode()) {
          notifyNetworkRecovery();
        }
      } else if (!currentlyOnline && !globalWasOffline) {
        // Network went offline while page was hidden
        globalWasOffline = true;
        
        // Notify React state subscribers
        networkStatusSubscribers.forEach(cb => cb(false));
      }
    }
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

/**
 * Hook to track online/offline status
 * 
 * Requirements: 10.3 - Indicate offline status
 * Requirements: 10.4 - Indicate when connectivity is restored
 * 
 * Now also considers manual offline mode - if manual offline is enabled,
 * the app will behave as if it's offline even when network is available.
 * 
 * @returns Object with isOnline status and wasOffline flag (for showing "back online" message)
 */
export function useOnlineStatus() {
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState(false);
  
  // Subscribe to manual offline mode
  const { isManualOffline } = useManualOfflineMode();

  useEffect(() => {
    // Initialize global listeners (singleton, only runs once)
    initNetworkListeners();
    
    // Subscribe to network status changes
    const handleStatusChange = (online: boolean) => {
      setNetworkOnline(online);
      if (online && !getManualOfflineMode()) {
        setWasOffline(true);
        setTimeout(() => {
          setWasOffline(false);
        }, 3000);
      } else if (!online) {
        setWasOffline(false);
      }
    };
    
    networkStatusSubscribers.add(handleStatusChange);
    
    return () => {
      networkStatusSubscribers.delete(handleStatusChange);
    };
  }, []);

  // Effective online status: must be network online AND not in manual offline mode
  const isOnline = networkOnline && !isManualOffline;

  return { isOnline, wasOffline, isManualOffline, networkOnline };
}

/**
 * Utility function to check if the app is running in standalone PWA mode
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for iOS standalone mode
  const isIOSStandalone = (window.navigator as any).standalone === true;
  
  // Check for other browsers' standalone mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  
  return isIOSStandalone || isStandalone;
}
