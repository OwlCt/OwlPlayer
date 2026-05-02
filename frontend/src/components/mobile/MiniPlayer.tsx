import React, { useCallback, useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { IoPlay, IoPause } from 'react-icons/io5';
import { usePlayerStore } from '../../store/playerStore';
import { getProxiedImageUrl } from '../../utils/image';
import { getCacheFirstArtworkUrl } from '../../utils/cacheFirstImage';
import { isTapGesture } from '../../hooks/useTouchClick';
import { useArtworkColor } from '../../hooks/useArtworkColor';
import { useResolvedCurrentSong } from '../../hooks/useResolvedCurrentSong';

/**
 * Determines if the MiniPlayer should be visible based on playback state.
 * The MiniPlayer is visible when a song is loaded (currentSong is not null).
 * 
 * @param currentSong - The currently loaded song or null
 * @returns boolean - true if MiniPlayer should be visible
 */
export function shouldShowMiniPlayer(currentSong: unknown): boolean {
  return currentSong !== null && currentSong !== undefined;
}

/**
 * Handles play/pause toggle without triggering expand behavior.
 * Returns the new playing state after toggle.
 * 
 * @param isPlaying - Current playing state
 * @param togglePlay - Function to toggle playback
 * @param event - Click event to stop propagation
 * @returns void (toggles state via callback)
 */
export function handlePlayPauseClick(
  togglePlay: () => void,
  event: React.MouseEvent
): void {
  // Stop propagation to prevent triggering the expand behavior
  event.stopPropagation();
  togglePlay();
}

interface MiniPlayerProps {
  onExpand?: () => void;
  className?: string;
}

/**
 * MiniPlayer component for mobile UI.
 * Displays current song info with play/pause control and progress bar.
 * Supports tap to expand and swipe up gesture.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */
export default function MiniPlayer({ onExpand, className = '' }: MiniPlayerProps) {
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    togglePlay,
  } = usePlayerStore();

  // Swipe gesture state
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isTouchMovedRef = useRef(false);
  
  // Artwork URL state for offline support
  const [artworkUrl, setArtworkUrl] = useState<string>('');
  const resolvedCurrentSong = useResolvedCurrentSong(currentSong);
  const displaySong = resolvedCurrentSong?.song ?? currentSong;
  const displayArtworkUrl = resolvedCurrentSong?.artworkUrl ?? currentSong?.artworkUrl ?? '';
  
  // Load artwork URL with cache-first support for offline mode
  useEffect(() => {
    if (!currentSong || !displayArtworkUrl) {
      setArtworkUrl('');
      return;
    }
    
    const loadArtworkUrl = async () => {
      const fallbackUrl = getProxiedImageUrl(displayArtworkUrl, 80);
      const url = await getCacheFirstArtworkUrl(currentSong.id, fallbackUrl);
      setArtworkUrl(url);
    };
    
    loadArtworkUrl();
  }, [currentSong?.id, displayArtworkUrl]);
  
  // Extract colors from artwork
  const artworkColors = useArtworkColor(displayArtworkUrl || currentSong?.artworkUrl);
  
  // Calculate progress percentage
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  // Handle expand
  const handleExpand = useCallback(() => {
    if (onExpand) {
      onExpand();
    }
  }, [onExpand]);

  // Handle play/pause button click
  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    handlePlayPauseClick(togglePlay, e);
  }, [togglePlay]);

  // Swipe gesture handlers with scroll detection
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    setIsDragging(false);
    isTouchMovedRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.touches[0];
    const deltaY = touchStartRef.current.y - touch.clientY;
    
    // Check if user has moved enough to be considered scrolling
    if (!isTapGesture(touchStartRef.current.x, touchStartRef.current.y, touch.clientX, touch.clientY, 10)) {
      isTouchMovedRef.current = true;
    }
    
    // If swiping up more than 30px, mark as dragging (for expand gesture)
    if (deltaY > 30) {
      setIsDragging(true);
    }
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    // If swiping up, expand
    if (isDragging && onExpand) {
      handleExpand();
    } 
    // If it's a valid tap (not scrolling), expand
    else if (!isTouchMovedRef.current && touchStartRef.current && onExpand) {
      const touch = e.changedTouches[0];
      if (isTapGesture(touchStartRef.current.x, touchStartRef.current.y, touch.clientX, touch.clientY, 10)) {
        handleExpand();
      }
    }
    
    touchStartRef.current = null;
    setIsDragging(false);
    isTouchMovedRef.current = false;
  }, [isDragging, onExpand, handleExpand]);

  // Don't render if no song is loaded (Requirement 2.5)
  if (!shouldShowMiniPlayer(currentSong)) {
    return null;
  }

  return (
    <div
      className={`relative border-t border-white/5 transition-colors duration-500 ${className}`}
      style={{
        backgroundColor: artworkColors.darkMuted,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="button"
      aria-label="Expand now playing"
      tabIndex={0}
      data-testid="mini-player"
    >
      {/* Main content area */}
      <div className="flex items-center h-14 px-3 gap-3">
        {/* Album artwork - with shared element transition (Requirement 8.2, 8.3) */}
        {/* Unified layoutId animation */}
        <motion.div 
          className="w-10 h-10 bg-white/10 rounded-lg overflow-hidden flex-shrink-0 shadow-lg"
          layoutId="mini-player-artwork"
          transition={{ type: 'spring', stiffness: 350, damping: 35 }}
          style={{ 
            willChange: 'transform',
            transform: 'translateZ(0)',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          }}
        >
          {artworkUrl ? (
            <img
              src={artworkUrl}
              alt={displaySong?.name}
              className="w-full h-full object-cover"
              style={{
                WebkitTouchCallout: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40">
              ♪
            </div>
          )}
        </motion.div>

        {/* Song info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-white truncate">
            {displaySong?.name || '未知歌曲'}
          </h4>
          <p className="text-xs text-white/60 truncate">
            {displaySong?.artistName || '未知艺术家'}
          </p>
        </div>

        {/* Play/Pause button - isolated click handler (Requirement 2.3) */}
        <button
          onClick={handlePlayPause}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          className="w-11 h-11 flex items-center justify-center text-white hover:text-white/80 transition-colors"
          aria-label={isPlaying ? '暂停' : '播放'}
          data-testid="mini-player-play-pause"
        >
          {isPlaying ? (
            <IoPause size={24} />
          ) : (
            <IoPlay size={24} className="ml-0.5" />
          )}
        </button>
      </div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
        <div
          className="h-full bg-white transition-all duration-100"
          style={{ width: `${progressPercent}%` }}
          data-testid="mini-player-progress"
        />
      </div>
    </div>
  );
}
