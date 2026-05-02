import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { HiOutlineWifi } from 'react-icons/hi';
import { useOnlineStatus, useManualOfflineMode } from '../../hooks/useOnlineStatus';
import OfflineModeIcon from '../icons/OfflineModeIcon';

/**
 * OfflineIndicator component - Shows network connectivity status
 * Shows "back online" banner when network is restored (swipe up to dismiss)
 * Shows "offline mode" banner when manual offline mode is enabled (swipe up to dismiss)
 * Both banners cover the header area for better visibility
 * 
 * Requirements: 10.3 - Display cached content and indicate offline status
 * Requirements: 10.4 - Indicate when connectivity is restored
 */
export default function OfflineIndicator() {
  const { isOnline, wasOffline, networkOnline } = useOnlineStatus();
  const { isManualOffline } = useManualOfflineMode();
  
  // Track dismissed state for each banner type
  const [onlineBannerDismissed, setOnlineBannerDismissed] = useState(false);
  const [offlineBannerDismissed, setOfflineBannerDismissed] = useState(false);
  
  // Track previous manual offline state to detect changes
  const prevManualOfflineRef = useRef(isManualOffline);
  
  // Reset online banner dismissed state when going offline again
  useEffect(() => {
    if (!isOnline) {
      setOnlineBannerDismissed(false);
    }
  }, [isOnline]);
  
  // Reset offline banner dismissed state when:
  // 1. Manual offline mode changes
  // 2. Network goes offline (real disconnection)
  useEffect(() => {
    if (isManualOffline !== prevManualOfflineRef.current) {
      setOfflineBannerDismissed(false);
      prevManualOfflineRef.current = isManualOffline;
    }
  }, [isManualOffline]);
  
  // Track previous network online state
  const prevNetworkOnlineRef = useRef(networkOnline);
  
  useEffect(() => {
    // Reset offline banner when network goes offline
    if (!networkOnline && prevNetworkOnlineRef.current) {
      setOfflineBannerDismissed(false);
    }
    prevNetworkOnlineRef.current = networkOnline;
  }, [networkOnline]);

  // Auto-dismiss offline banner after timeout (3 seconds)
  useEffect(() => {
    const shouldShowOffline = !offlineBannerDismissed && (
      (isManualOffline && networkOnline) || !networkOnline
    );
    
    if (shouldShowOffline) {
      const timer = setTimeout(() => {
        setOfflineBannerDismissed(true);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [isManualOffline, networkOnline, offlineBannerDismissed]);

  // Show "back online" banner when network is restored (and not dismissed)
  const showOnlineBanner = wasOffline && isOnline && !onlineBannerDismissed;
  
  // Show "offline mode" banner when:
  // 1. Manual offline mode is enabled (and network is actually online)
  // 2. Network is actually offline (real disconnection)
  const showOfflineBanner = !offlineBannerDismissed && (
    (isManualOffline && networkOnline) || // Manual offline mode
    !networkOnline // Real network disconnection
  );
  
  // Determine if it's manual offline or real network offline for display
  const isRealNetworkOffline = !networkOnline;

  // Handle swipe up to dismiss
  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
    type: 'online' | 'offline'
  ) => {
    // If swiped up more than 30px, dismiss the banner
    if (info.offset.y < -30) {
      if (type === 'online') {
        setOnlineBannerDismissed(true);
      } else {
        setOfflineBannerDismissed(true);
      }
    }
  };

  // Banner height: covers header (56px) + safe area
  const bannerStyle = {
    paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)',
    paddingBottom: '12px',
    minHeight: 'calc(56px + env(safe-area-inset-top, 0px))',
  };

  return (
    <AnimatePresence>
      {/* Back online banner */}
      {showOnlineBanner && (
        <motion.div
          key="online-banner"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.5, bottom: 0 }}
          onDragEnd={(e, info) => handleDragEnd(e, info, 'online')}
          className="fixed top-0 left-0 right-0 z-[70] flex items-end justify-center gap-2 px-4 bg-green-600 text-white cursor-grab active:cursor-grabbing"
          style={bannerStyle}
          role="status"
          aria-live="polite"
        >
          <HiOutlineWifi className="w-5 h-5" />
          <span className="text-base font-medium">已恢复网络连接</span>
        </motion.div>
      )}
      
      {/* Offline mode banner (manual or real network offline) */}
      {showOfflineBanner && (
        <motion.div
          key="offline-banner"
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-100%', opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.5, bottom: 0 }}
          onDragEnd={(e, info) => handleDragEnd(e, info, 'offline')}
          className={`fixed top-0 left-0 right-0 z-[70] flex items-end justify-center gap-2 px-4 text-white cursor-grab active:cursor-grabbing ${
            isRealNetworkOffline ? 'bg-red-600' : 'bg-amber-600'
          }`}
          style={bannerStyle}
          role="status"
          aria-live="polite"
        >
          <OfflineModeIcon size={20} className="flex-shrink-0" />
          <span className="text-base font-medium">
            {isRealNetworkOffline ? '网络已断开' : '已切换到离线模式'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
