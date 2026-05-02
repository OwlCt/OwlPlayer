import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, usePresence } from 'framer-motion';
import { usePlayerStore } from '../../store/playerStore';
import { getLyrics } from '../../api';
import { parseTTML, LyricLine, getCurrentLineIndex } from '../../utils/ttmlParser';
import { useArtworkColor } from '../../hooks/useArtworkColor';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLyricsSettings } from '../../hooks/useLyricsSettings';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { offlineCacheService } from '../../services/offlineCacheService';
import { getCacheFirstArtworkUrl } from '../../utils/cacheFirstImage';
import { MobileLyricsHeader } from './MobileLyricsHeader';
import { MobileLyricsContent } from './MobileLyricsContent';
import { 
  ANIMATION_CONFIG, 
  GESTURE_CONFIG, 
  DEFAULT_COLORS 
} from './MobileLyricsConfig';
import { getProxiedImageUrl } from '../../utils/image';

export interface MobileLyricsPageProps {
  /** Callback when the lyrics view should close */
  onClose: () => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Finds the active line index based on current playback time.
 * Property 8: Active line updates after seek
 * The active line is the line whose timestamp is <= currentTime and is the latest such line.
 * 
 * @param lines - Array of lyric lines
 * @param currentTimeMs - Current playback time in milliseconds
 * @returns Index of the active line, or -1 if no line is active
 */
export function findActiveLineIndex(lines: LyricLine[], currentTimeMs: number): number {
  return getCurrentLineIndex(lines, currentTimeMs);
}

/**
 * Determines if a swipe gesture should trigger close based on velocity.
 * Property 3: Swipe velocity triggers close
 * 
 * @param velocityY - Vertical velocity in px/s
 * @param offsetY - Vertical offset in px
 * @returns true if the gesture should trigger close
 */
export function shouldTriggerClose(velocityY: number, offsetY: number): boolean {
  // Close if velocity exceeds threshold (regardless of distance)
  if (velocityY > GESTURE_CONFIG.swipeVelocityThreshold) {
    return true;
  }
  // Also close if dragged far enough with some velocity
  if (offsetY > GESTURE_CONFIG.swipeCloseThreshold && velocityY > 50) {
    return true;
  }
  return false;
}

/**
 * MobileLyricsPage - Full-screen lyrics view for mobile devices.
 * 
 * Features:
 * - Full-screen overlay with spring-based open/close animations
 * - Karaoke-style word fill for word-timed lyrics
 * - Smooth line highlighting for line-timed lyrics
 * - Auto-scrolling with user scroll detection
 * - Dynamic background colors from artwork
 * - Swipe-to-close gesture
 * - Translation toggle support
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.3, 2.4, 5.1, 5.2, 9.1, 9.2, 9.5
 */
export const MobileLyricsPage: React.FC<MobileLyricsPageProps> = ({
  onClose,
  className = '',
}) => {
  // Use presence hook for proper exit animation handling (iOS optimization)
  const [isPresent, safeToRemove] = usePresence();
  
  const {
    currentSong,
    audioRef,
    seek,
  } = usePlayerStore();

  // Lyrics settings (translation preference)
  const { settings, toggleTranslation } = useLyricsSettings();
  const showTranslation = settings.showTranslation;

  // Reduced motion preference
  const reducedMotion = useReducedMotion();
  
  // Online status for offline mode support
  const { isOnline } = useOnlineStatus();

  // Extract colors from artwork (Requirement 9.1)
  const artworkColors = useArtworkColor(currentSong?.artworkUrl);
  const backgroundColor = artworkColors.darkMuted || DEFAULT_COLORS.background;

  // Lyrics state
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [hasTranslation, setHasTranslation] = useState(false);
  const [hasWordTiming, setHasWordTiming] = useState(false);
  
  // Background image URL for offline support
  const [backgroundUrl, setBackgroundUrl] = useState<string>('');

  // Playback time state
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // Auto-scroll state
  const [isAutoScrollPaused, setIsAutoScrollPaused] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Swipe-to-close gesture state (follow-finger effect)
  const headerTouchStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate current line index
  // Property 1: Active line scroll positioning
  // Property 8: Active line updates after seek
  const currentLineIndex = useMemo(() => {
    if (!lyrics.length) return -1;
    return findActiveLineIndex(lyrics, currentTimeMs);
  }, [lyrics, currentTimeMs]);

  // Load lyrics when song changes
  useEffect(() => {
    if (!currentSong) {
      setLyrics([]);
      return;
    }

    const fetchLyrics = async () => {
      setLoadingLyrics(true);
      try {
        if (isOnline) {
          // Online: fetch from API
          const data = await getLyrics(currentSong.id);
          if (data.available && data.ttml) {
            const parsed = parseTTML(data.ttml);
            setLyrics(parsed.lines);
            setHasTranslation(parsed.hasTranslation);
            setHasWordTiming(parsed.timing === 'Word');
          } else {
            setLyrics([]);
            setHasTranslation(false);
            setHasWordTiming(false);
          }
        } else {
          // Offline: load from IndexedDB cache - use same parser as online
          const cachedSong = await offlineCacheService.getCachedSong(currentSong.id);
          if (cachedSong?.lyrics?.ttml) {
            const parsed = parseTTML(cachedSong.lyrics.ttml);
            setLyrics(parsed.lines);
            setHasTranslation(parsed.hasTranslation);
            setHasWordTiming(parsed.timing === 'Word');
          } else {
            setLyrics([]);
            setHasTranslation(false);
            setHasWordTiming(false);
          }
        }
      } catch (error) {
        console.error('Failed to load lyrics:', error);
        setLyrics([]);
        setHasTranslation(false);
        setHasWordTiming(false);
      } finally {
        setLoadingLyrics(false);
      }
    };

    fetchLyrics();
  }, [currentSong?.id, isOnline]);

  // Load background image URL with cache-first support for offline mode
  useEffect(() => {
    if (!currentSong?.artworkUrl) {
      setBackgroundUrl('');
      return;
    }
    
    const loadBackgroundUrl = async () => {
      const fallbackUrl = getProxiedImageUrl(currentSong.artworkUrl, 400);
      const url = await getCacheFirstArtworkUrl(currentSong.id, fallbackUrl);
      setBackgroundUrl(url);
    };
    
    loadBackgroundUrl();
  }, [currentSong?.id, currentSong?.artworkUrl]);

  // Time update using RAF for smooth animation
  // Requirement 3.4: Use requestAnimationFrame for smooth 60fps animation
  useEffect(() => {
    if (!audioRef) return;

    let animationFrameId: number | null = null;

    const updateTime = () => {
      setCurrentTimeMs(audioRef.currentTime * 1000);
    };

    if (hasWordTiming) {
      // Use RAF for word-timed lyrics (smooth fill animation)
      const tick = () => {
        updateTime();
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
    } else {
      // Use timeupdate event for line-timed lyrics
      audioRef.addEventListener('timeupdate', updateTime);
      updateTime();
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      audioRef.removeEventListener('timeupdate', updateTime);
    };
  }, [audioRef, hasWordTiming]);


  // Auto-scroll to active line
  // Property 1: Active line scroll positioning
  // Requirement 5.1, 5.2: Smooth scroll to center active line
  useEffect(() => {
    if (isAutoScrollPaused || currentLineIndex < 0 || !scrollContainerRef.current) {
      return;
    }

    const container = scrollContainerRef.current;
    const activeLineEl = container.querySelector(`[data-line-index="${currentLineIndex}"]`) as HTMLElement | undefined;

    if (activeLineEl) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = activeLineEl.getBoundingClientRect();
      const containerHeight = containerRect.height;
      
      // Calculate current element position relative to container
      const elementTopRelative = elementRect.top - containerRect.top + container.scrollTop;
      
      // Position active line at upper 1/3 of the container
      const targetPosition = containerHeight / 3;
      const scrollTo = elementTopRelative - targetPosition;

      container.scrollTo({
        top: Math.max(0, scrollTo),
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
  }, [currentLineIndex, isAutoScrollPaused, reducedMotion]);

  // Handle user scroll - pause auto-scroll
  // The timeout is managed by MobileLyricsContent based on touch events
  const handleUserScroll = useCallback((paused: boolean) => {
    setIsAutoScrollPaused(paused);
  }, []);

  // Handle line click for seeking
  // Property 7: Line tap seeks to timestamp
  // Requirement 5.5: Resume auto-scrolling immediately after tap
  const handleLineClick = useCallback((line: LyricLine) => {
    // Seek to line timestamp
    seek(line.timestamp / 1000);

    // Resume auto-scroll immediately
    setIsAutoScrollPaused(false);

    // Provide haptic feedback if available (Requirement 6.2)
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }, [seek]);

  // Animation variants
  const overlayVariants = {
    hidden: { y: '100%', opacity: 0 },
    visible: { y: 0, opacity: 1 },
    exit: { y: '100%', opacity: 0 },
  };

  // Spring transition config
  const springTransition = reducedMotion
    ? { duration: 0 }
    : {
        type: 'spring',
        damping: ANIMATION_CONFIG.open.damping,
        stiffness: ANIMATION_CONFIG.open.stiffness,
        mass: ANIMATION_CONFIG.open.mass,
      };

  const exitTransition = reducedMotion
    ? { duration: 0 }
    : {
        type: 'spring',
        damping: ANIMATION_CONFIG.close.damping,
        stiffness: ANIMATION_CONFIG.close.stiffness,
        mass: ANIMATION_CONFIG.close.mass,
      };

  // Stop all touch events from bubbling to parent (MobileNowPlaying)
  const handleTouchEvent = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  // Header swipe down to close with follow-finger effect
  const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
    headerTouchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleHeaderTouchMove = useCallback((e: React.TouchEvent) => {
    if (headerTouchStartY.current === null) return;
    
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - headerTouchStartY.current;
    
    // Only allow dragging down, with elastic resistance
    if (deltaY > 0) {
      setDragOffsetY(deltaY * 0.8); // Add some resistance
    }
  }, []);

  const handleHeaderTouchEnd = useCallback((e: React.TouchEvent) => {
    if (headerTouchStartY.current === null) return;
    
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - headerTouchStartY.current;
    
    // If swiped down more than 100px, trigger close
    if (deltaY > 100) {
      onClose();
    } else {
      // Spring back
      setDragOffsetY(0);
    }
    
    setIsDragging(false);
    headerTouchStartY.current = null;
  }, [onClose]);

  if (!currentSong) return null;

  return (
    <motion.div
      className={`fixed inset-0 z-[200] flex flex-col safe-area-all ${className}`}
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: dragOffsetY, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={isDragging ? { duration: 0 } : springTransition}
      onAnimationComplete={() => !isPresent && safeToRemove?.()}
      style={{
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        overflow: 'hidden',
      }}
      onTouchStart={handleTouchEvent}
      onTouchMove={handleTouchEvent}
      onTouchEnd={handleTouchEvent}
      data-testid="mobile-lyrics-page"
    >
      {/* Background with dynamic color (Requirement 9.1) */}
      <motion.div
        className="absolute inset-0 z-0"
        style={{ 
          backgroundColor,
          transform: 'translateZ(0)',
        }}
        animate={{ backgroundColor }}
        transition={{ duration: ANIMATION_CONFIG.background.duration / 1000 }}
      />

      {/* Blurred artwork overlay (Requirement 9.2) */}
      {backgroundUrl && (
        <div
          className="absolute inset-0 z-0 opacity-40"
          style={{
            backgroundImage: `url(${backgroundUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(60px) saturate(1.2)',
            transform: 'translateZ(0)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Gradient overlay for readability */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background: `linear-gradient(to bottom, ${backgroundColor}99 0%, ${backgroundColor}cc 30%, ${backgroundColor} 100%)`,
        }}
        aria-hidden="true"
      />

      {/* Header (Requirement 1.4, 2.2, 8.1) */}
      <MobileLyricsHeader
        songName={currentSong.name || '未知歌曲'}
        artistName={currentSong.artistName || '未知艺术家'}
        onClose={onClose}
        hasTranslation={hasTranslation}
        showTranslation={showTranslation}
        onToggleTranslation={toggleTranslation}
        onTouchStart={handleHeaderTouchStart}
        onTouchMove={handleHeaderTouchMove}
        onTouchEnd={handleHeaderTouchEnd}
      />

      {/* Lyrics content */}
      <div className="relative z-10 flex-1 min-h-0 overflow-hidden">
        {loadingLyrics ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-white" />
          </div>
        ) : lyrics.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/40 text-xl">
            暂无歌词
          </div>
        ) : (
          <MobileLyricsContent
            lines={lyrics}
            currentLineIndex={currentLineIndex}
            currentTimeMs={currentTimeMs}
            hasWordTiming={hasWordTiming}
            showTranslation={showTranslation}
            onLineClick={handleLineClick}
            isPaused={isAutoScrollPaused}
            onUserScroll={handleUserScroll}
            reducedMotion={reducedMotion}
            scrollContainerRef={scrollContainerRef}
          />
        )}
      </div>
    </motion.div>
  );
};

export default MobileLyricsPage;
