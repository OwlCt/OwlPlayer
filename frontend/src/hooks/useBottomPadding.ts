import { useOnlineStatus } from './useOnlineStatus';

/**
 * Hook to calculate bottom padding for mobile pages
 * Accounts for MiniPlayer, BottomNavigation, safe area, and offline indicator
 * 
 * Base padding breakdown:
 * - BottomNavigation: 56px
 * - MiniPlayer: ~72px
 * - Safe area: env(safe-area-inset-bottom)
 * - Buffer: ~80px
 * - Total: ~208px (pb-52)
 * 
 * Offline mode adds: 28px (py-1.5 + text-xs)
 */
export function useBottomPadding(): { paddingClass: string; paddingStyle: React.CSSProperties } {
  const { isOnline } = useOnlineStatus();
  
  // Offline indicator height: py-1.5 (12px) + text-xs line height (~16px) = 28px
  const offlineBarHeight = !isOnline ? 28 : 0;
  
  // Base padding is pb-52 (208px), add offline bar height when offline
  const totalPadding = 208 + offlineBarHeight;
  
  return {
    // For inline style usage
    paddingStyle: { paddingBottom: `${totalPadding}px` },
    // For class-based usage (approximate with Tailwind classes)
    paddingClass: isOnline ? 'pb-52' : 'pb-60',
  };
}

/**
 * Get bottom padding value based on online status
 * For use in components that need the raw value
 */
export function getBottomPaddingValue(isOnline: boolean): number {
  const offlineBarHeight = !isOnline ? 28 : 0;
  return 208 + offlineBarHeight;
}
