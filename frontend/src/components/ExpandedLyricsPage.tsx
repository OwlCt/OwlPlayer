import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FiMinimize2, FiGlobe } from 'react-icons/fi';
import { motion } from 'framer-motion';
import { usePlayerStore } from '../store/playerStore';
import { getLyrics } from '../api';
import { parseTTML, LyricLine, getCurrentLineIndex } from '../utils/ttmlParser';
import { LyricLineComponent } from './LyricLine';
import { useOverlayScrollbar } from '../hooks/useOverlayScrollbar';
import ScrollingText from './ScrollingText';
import CachedImage from './CachedImage';
import { getManualOfflineMode } from '../hooks/useOnlineStatus';
import { offlineCacheService } from '../services/offlineCacheService';
import { getCacheFirstArtworkUrl } from '../utils/cacheFirstImage';
import { animateScrollTo, easings } from '../utils/scrollAnimator';
import { getProxiedImageUrl } from '../utils/image';
import { useResolvedCurrentSong } from '../hooks/useResolvedCurrentSong';

interface ExpandedLyricsPageProps {
  onMinimize: () => void;
  /** When provided (fullscreen mode), controls button visibility based on mouse activity */
  controlsVisible?: boolean;
}

export default function ExpandedLyricsPage({ onMinimize, controlsVisible }: ExpandedLyricsPageProps) {
  const { 
    currentSong, 
    progress, 
    seek, 
    showTranslation, 
    toggleTranslation,
    audioRef 
  } = usePlayerStore();
  const resolvedCurrentSong = useResolvedCurrentSong(currentSong);
  const displaySong = resolvedCurrentSong?.song ?? currentSong;
  const displayArtworkUrl = resolvedCurrentSong?.artworkUrl ?? currentSong?.artworkUrl ?? '';
  
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const [userScrolling, setUserScrolling] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string>('');

  // Ref-based time — updated every RAF frame WITHOUT triggering re-renders
  const currentTimeRef = useRef(0);

  // Word fill updater registry — child Word components register callbacks
  const wordUpdatersRef = useRef<Map<string, () => void>>(new Map());
  const registerUpdater = useCallback((key: string, fn: () => void) => {
    wordUpdatersRef.current.set(key, fn);
  }, []);
  const unregisterUpdater = useCallback((key: string) => {
    wordUpdatersRef.current.delete(key);
  }, []);
  // In fullscreen mode, controlsVisible drives button visibility;
  // in standalone expanded mode, use local isHovering state
  const showButtons = controlsVisible !== undefined ? controlsVisible : isHovering;  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const { handleMouseEnter, handleMouseLeave, scrollbarClassName } = useOverlayScrollbar();

  // Load background image URL with cache-first support for offline mode
  useEffect(() => {
    if (!currentSong || !displayArtworkUrl) {
      setBackgroundUrl('');
      return;
    }
    
    const loadBackgroundUrl = async () => {
      const fallbackUrl = getProxiedImageUrl(displayArtworkUrl, 800);
      const url = await getCacheFirstArtworkUrl(currentSong.id, fallbackUrl);
      setBackgroundUrl(url);
    };
    
    loadBackgroundUrl();
  }, [currentSong?.id, displayArtworkUrl]);

  // Preload images to avoid reload delay
  useEffect(() => {
    if (!displayArtworkUrl) return;

    // Preload different sizes used in this page
    const sizesToPreload = [160, 800]; // Thumbnail: 160 (same as NowPlayingView), Background: 800
    sizesToPreload.forEach(size => {
      const img = new Image();
      img.src = getProxiedImageUrl(displayArtworkUrl, size);
    });
  }, [displayArtworkUrl]);

  // Check if any lyric line has translation
  const hasTranslation = useMemo(() => {
    return lyrics.some(line => line.translation && line.translation.trim() !== '');
  }, [lyrics]);

  // Whether any line has word-level timing (main/translation/transliteration)
  const hasWordTiming = useMemo(() => {
    return lyrics.some(
      (line) =>
        (line.words && line.words.length > 0) ||
        (line.translationWords && line.translationWords.length > 0) ||
        (line.transliterationWords && line.transliterationWords.length > 0)
    );
  }, [lyrics]);

  // currentLineIndex is now driven by the RAF loop (setState only when line changes)
  // — no useMemo dependency on time state

  // Load lyrics when song changes
  useEffect(() => {
    if (!currentSong) return;
    
    const fetchLyrics = async () => {
      setLoadingLyrics(true);
      try {
        // Check if in offline mode - try cache first
        if (getManualOfflineMode()) {
          const cachedSong = await offlineCacheService.getCachedSong(currentSong.id);
          if (cachedSong?.lyrics?.ttml) {
            // Use the same parser as online mode
            const parsed = parseTTML(cachedSong.lyrics.ttml);
            setLyrics(parsed.lines);
            setLoadingLyrics(false);
            return;
          }
        }
        
        // Online mode or cache miss - fetch from API
        const data = await getLyrics(currentSong.id);
        if (data.available && data.ttml) {
          const parsed = parseTTML(data.ttml);
          setLyrics(parsed.lines);
        } else {
          setLyrics([]);
        }
      } catch (error) {
        console.error("Failed to load lyrics", error);
        // Try cache as fallback on error
        try {
          const cachedSong = await offlineCacheService.getCachedSong(currentSong.id);
          if (cachedSong?.lyrics?.ttml) {
            const parsed = parseTTML(cachedSong.lyrics.ttml);
            setLyrics(parsed.lines);
          } else {
            setLyrics([]);
          }
        } catch {
          setLyrics([]);
        }
      } finally {
        setLoadingLyrics(false);
      }
    };
    
    fetchLyrics();
    lineRefs.current = [];
  }, [currentSong?.id]);

  // Time update — ref-based, no React state per frame.
  // Only setState for currentLineIndex when the active line actually changes.
  // Word fill updates are pushed to registered updater callbacks (no re-render).
  useEffect(() => {
    if (!audioRef) return;

    let animationFrameId: number | null = null;
    let lastLineIndex = -1;

    const updateTime = () => {
      const timeMs = audioRef.currentTime * 1000;
      currentTimeRef.current = timeMs;

      // Check if line changed
      const newIndex = lyrics.length > 0 ? getCurrentLineIndex(lyrics, timeMs) : -1;
      if (newIndex !== lastLineIndex) {
        lastLineIndex = newIndex;
        setCurrentLineIndex(newIndex);
      }

      // Push word fill updates (no React re-render)
      wordUpdatersRef.current.forEach(fn => fn());
    };

    if (hasWordTiming) {
      const tick = () => {
        updateTime();
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
      return () => {
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      };
    } else {
      audioRef.addEventListener('timeupdate', updateTime);
      updateTime();
      return () => {
        audioRef.removeEventListener('timeupdate', updateTime);
        if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
      };
    }
  }, [audioRef, hasWordTiming, lyrics]);

  // Track user interaction state
  const isUserInteractingRef = useRef(false);
  // Track current scroll animation for cancellation
  const cancelAnimationRef = useRef<(() => void) | null>(null);

  // Handle wheel scroll - pause immediately on wheel
  const handleWheel = useCallback(() => {
    // Cancel any ongoing programmatic scroll animation
    if (cancelAnimationRef.current) {
      cancelAnimationRef.current();
      cancelAnimationRef.current = null;
    }

    if (!userScrolling) {
      setUserScrolling(true);
    }
    isUserInteractingRef.current = true;

    // Start countdown after wheel stops
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
      // Start 5 second countdown
      scrollTimeoutRef.current = setTimeout(() => {
        setUserScrolling(false);
      }, 5000);
    }, 150);
  }, [userScrolling]);

  // Auto-scroll to active lyric - position at upper 1/3 of container
  // Uses custom eased animation for smooth, Apple Music-style transitions
  useEffect(() => {
    if (userScrolling || currentLineIndex < 0 || !containerRef.current) return;

    const lineEl = lineRefs.current[currentLineIndex];
    if (lineEl) {
      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const elementRect = lineEl.getBoundingClientRect();
      const containerHeight = containerRect.height;

      // Calculate current element position relative to container's scroll
      const elementTopRelative = elementRect.top - containerRect.top + container.scrollTop;

      // Position active line at upper 1/3 of container
      const targetPosition = containerHeight / 3;
      const targetScrollTop = Math.max(0, elementTopRelative - targetPosition);

      // Skip if already at target (within 5px tolerance)
      if (Math.abs(container.scrollTop - targetScrollTop) < 5) return;

      // Cancel previous animation before starting new one
      if (cancelAnimationRef.current) {
        cancelAnimationRef.current();
      }

      cancelAnimationRef.current = animateScrollTo({
        container,
        targetScrollTop,
        easing: easings.iosSpring,
      });
    }
  }, [currentLineIndex, userScrolling]);

  // Cleanup timeout and animation on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (cancelAnimationRef.current) {
        cancelAnimationRef.current();
      }
    };
  }, []);

  const handleLyricClick = (timestamp: number) => {
    seek(timestamp / 1000);
    setUserScrolling(false);
  };

  if (!currentSong) return null;

  return (
    <div
      className="h-full w-full bg-black overflow-hidden flex flex-col rounded-lg"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Blurred Background - separate layer for scale animation
           Safari/Firefox optimization: use transform: translateZ(0) to force GPU compositing
           for the blur filter, preventing main-thread paint storms */}
      <motion.div
        className="absolute inset-0 z-0 opacity-50 pointer-events-none"
        initial={false}
        animate={{ scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 0.7, 0.36, 1] }}
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(80px) saturate(1.5)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
      <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />

      {/* Header with song metadata and minimize button - always rendered for layout animation */}
      <div className="relative z-10 flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-5 flex-1 min-w-0">
          {/* Album artwork thumbnail - no layoutId to avoid animation delay */}
          <div className="w-16 h-16 rounded-lg shadow-xl overflow-hidden flex-shrink-0">
            {displayArtworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(displayArtworkUrl, 160)}
                alt={displaySong?.name}
                className="w-full h-full object-cover"
                songId={currentSong.id}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/40">
                ♪
              </div>
            )}
          </div>
          {/* Song info - no layoutId to avoid animation delay */}
          <div className="min-w-0 flex-1">
            <div className="w-full">
              <ScrollingText
                text={displaySong?.name || '未知歌曲'}
                className="text-2xl font-bold text-white"
              />
            </div>
            <div className="w-full text-lg text-white/70">
              <ScrollingText
                text={displaySong?.artistName || '未知艺术家'}
                className="text-white/70"
              />
            </div>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Translation Toggle */}
          <button
            onClick={hasTranslation ? toggleTranslation : undefined}
            disabled={!hasTranslation}
            className={`p-2 rounded-full transition-all duration-200 ${
              !showButtons
                ? "opacity-0 pointer-events-none"
                : !hasTranslation
                  ? "text-white/20 cursor-not-allowed opacity-50 scale-90"
                  : showTranslation
                    ? "bg-transparent text-green-500 opacity-50 scale-90 hover:bg-green-500 hover:text-black hover:opacity-100 hover:scale-100"
                    : "bg-transparent text-white/70 opacity-50 scale-90 hover:bg-white/10 hover:text-white hover:opacity-100 hover:scale-100"
            }`}
            title={!hasTranslation ? '无翻译' : showTranslation ? '隐藏翻译' : '显示翻译'}
          >
            <FiGlobe size={20} />
          </button>
          
          {/* Minimize Button */}
          <button
            onClick={onMinimize}
            className={`p-2 rounded-full transition-all duration-200 ${
              !showButtons
                ? "opacity-0 pointer-events-none"
                : "bg-transparent text-white/70 opacity-50 scale-90 hover:bg-white/10 hover:text-white hover:opacity-100 hover:scale-100"
            }`}
            title="收起歌词"
          >
            <FiMinimize2 size={20} />
          </button>
        </div>
      </div>

      {/* Lyrics Content */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`flex-1 relative z-10 px-8 overflow-y-auto overflow-x-hidden ${scrollbarClassName}`}
        style={{
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 8%, black 92%, transparent 100%)'
        }}
      >
        {loadingLyrics ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-white" />
          </div>
        ) : lyrics.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/40 text-xl">
            暂无歌词
          </div>
        ) : (
          <div className="pt-[33vh] pb-[67vh] max-w-4xl mx-auto">
            {lyrics.map((line, index) => {
              const adjacentIndex = currentLineIndex >= 0 ? index - currentLineIndex : index;
              
              return (
                <div
                  key={line.key || index}
                  ref={(el) => (lineRefs.current[index] = el)}
                  onClick={() => handleLyricClick(line.timestamp)}
                  className="cursor-pointer py-3"
                >
                  <LyricLineComponent
                    line={line}
                    isActive={index === currentLineIndex}
                    adjacentIndex={adjacentIndex}
                    showTranslation={showTranslation}
                    variant="expanded"
                    currentTimeRef={currentTimeRef}
                    registerUpdater={registerUpdater}
                    unregisterUpdater={unregisterUpdater}
                    lineKey={line.key || `exp-${index}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
