import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiHome, FiRefreshCw } from 'react-icons/fi';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlayerStore } from '../store/playerStore';
import { useOnlineStatus, subscribeToNetworkRecovery } from '../hooks/useOnlineStatus';
import OfflineModeIcon from './icons/OfflineModeIcon';

interface OfflineFallbackProps {
  /** Custom message to display (default: "离线状态，页面资源未缓存") */
  message?: string;
  /** Custom back handler (default: navigate(-1)) */
  onBack?: () => void;
  /** Whether to show the path info (default: true) */
  showPath?: boolean;
}

/**
 * OfflineFallback - Unified offline state view
 * Shown when offline and the requested content is not cached.
 * Automatically reloads the page when network is restored.
 */
export default function OfflineFallback({ 
  message = '离线状态，页面资源未缓存',
  onBack,
  showPath = true,
}: OfflineFallbackProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { currentSong } = usePlayerStore();
  const { isOnline } = useOnlineStatus();
  const [isRetrying, setIsRetrying] = useState(false);
  
  // 网络恢复时自动刷新页面
  useEffect(() => {
    const unsubscribe = subscribeToNetworkRecovery(() => {
      console.log('[OfflineFallback] Network recovered, reloading...');
      setIsRetrying(true);
      // 延迟一点刷新，让用户看到状态变化
      setTimeout(() => {
        window.location.reload();
      }, 300);
    });
    return unsubscribe;
  }, []);
  
  // Calculate bottom offset for mobile to center content properly
  // BottomNav: 56px + MiniPlayer: ~64px + OfflineIndicator: ~28px + Progress: ~4px + safe-area
  const hasMiniPlayer = currentSong !== null;
  const bottomOffset = isMobile 
    ? 56 + (hasMiniPlayer ? 68 : 0) + (!isOnline ? 28 : 0) 
    : 0;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };
  
  const handleRetry = () => {
    setIsRetrying(true);
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  return (
    <div 
      className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center text-white bg-black/70 backdrop-blur-sm"
      style={isMobile ? { 
        paddingBottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom, 0px))`,
      } : undefined}
    >
      <div className="flex items-center gap-3">
        <OfflineModeIcon size={32} className="text-red-400 flex-shrink-0" />
        <p className="text-lg font-semibold">
          {isRetrying ? '正在重新加载...' : message}
        </p>
      </div>

      {!isRetrying && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-h-[44px]"
          >
            <FiRefreshCw />
            重试
          </button>
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-h-[44px]"
          >
            <FiArrowLeft />
            返回
          </button>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 active:bg-white/30 rounded-full transition-colors min-h-[44px]"
          >
            <FiHome />
            回到首页
          </button>
        </div>
      )}
      
      {isRetrying && (
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      )}

      {showPath && !isRetrying && (
        <p className="text-xs text-white/40">当前路径：{location.pathname}</p>
      )}
    </div>
  );
}
