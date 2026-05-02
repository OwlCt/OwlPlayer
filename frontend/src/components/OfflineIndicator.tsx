/**
 * OfflineIndicator - Shows offline status indicator
 * 
 * Requirements: 10.3 - Indicate offline status
 * Requirements: 10.4 - Indicate when connectivity is restored
 * 
 * Note: Offline status is now shown via UserAvatar indicator instead of banner
 * to avoid blocking user interactions
 * Note: Only shown on desktop - mobile has its own OfflineIndicator in MobileLayout
 */

import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useIsMobile } from '../hooks/useIsMobile';
import { FiWifi } from 'react-icons/fi';

export default function OfflineIndicator() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const isMobile = useIsMobile();

  // Don't show on mobile - mobile has its own OfflineIndicator
  if (isMobile) {
    return null;
  }

  // Only show "back online" message briefly after reconnecting
  if (wasOffline && isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-green-600 text-white text-center py-2 px-4 flex items-center justify-center gap-2 animate-slide-down">
        <FiWifi className="w-4 h-4" />
        <span className="text-sm font-medium">已恢复网络连接</span>
      </div>
    );
  }

  // Offline status is shown in UserAvatar instead
  return null;
}
