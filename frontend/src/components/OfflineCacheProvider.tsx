/**
 * OfflineCacheProvider - Initializes offline cache store early in the app lifecycle
 * 
 * This component ensures the offline cache is initialized before other components
 * try to access cached data. It also provides offline-aware error handling.
 * 
 * Requirements: 10.3 - Display cached content when offline
 */

import { useEffect, ReactNode } from 'react';
import { useOfflineCacheStore } from '../store/offlineCacheStore';

interface OfflineCacheProviderProps {
  children: ReactNode;
}

export default function OfflineCacheProvider({ children }: OfflineCacheProviderProps) {
  const { init, isInitialized } = useOfflineCacheStore();

  // Initialize offline cache store as early as possible
  useEffect(() => {
    if (!isInitialized) {
      init().catch((error) => {
        console.error('[OfflineCacheProvider] Failed to initialize offline cache:', error);
      });
    }
  }, [init, isInitialized]);

  return <>{children}</>;
}
