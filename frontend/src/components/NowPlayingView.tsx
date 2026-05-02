import { useState, useEffect, useRef, useMemo, useCallback, forwardRef, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayerStore } from '../store/playerStore';
import type { AlbumDetail, SongDetail } from '../types';
import { LyricLine, parseTTML } from '../utils/ttmlParser';
import { calculateWordFillPercentage, getLineOpacity, animateScrollTo, easings } from '../utils/scrollAnimator';
import { getLyrics, getAlbumDetail, getSongDetail } from '../api';
import { FiChevronDown, FiChevronRight, FiGlobe, FiMaximize2, FiMoreHorizontal } from 'react-icons/fi';
import { RiDraggable } from 'react-icons/ri';
import { IoDisc, IoPerson, IoPlaySkipForward, IoTrash } from 'react-icons/io5';
import { clsx } from 'clsx';
import ClickableLink, { getArtistHref } from './ClickableLink';
import SongContextMenu from './SongContextMenu';
import ScrollingText from './ScrollingText';
import { LikeButton } from './LikeButton';
import { useFollowedArtistsStore } from '../store/followedArtistsStore';
import { ContextMenu, MenuItem, MenuDivider, MenuPosition } from './ContextMenu';
import CachedImage from './CachedImage';
import MotionArtwork from './MotionArtwork';
import { useOnlineStatus, getManualOfflineMode } from '../hooks/useOnlineStatus';
import { getSongDetailFromCache, revokeObjectUrls } from '../utils/offlineCacheConverter';
import { useOfflineCacheStore } from '../store/offlineCacheStore';
import { offlineCacheService } from '../services/offlineCacheService';
import { getCacheFirstArtworkUrl } from '../utils/cacheFirstImage';
import { getProxiedImageUrl } from '../utils/image';
import {
  formatAudioBitrate,
  formatAudioChannels,
  formatAudioCodecLabel,
  formatAudioSampleRate,
} from '../utils/audioInfo';
import {
  getMetadataSourceLabels,
} from '../utils/mediaMetadata';
import { getNowPlayingReleaseDate } from '../utils/nowPlayingMetadata';
import { resolveNowPlayingSongData } from '../utils/nowPlayingDetails';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const songDetailCache = new Map<string, any>();
const albumDetailCache = new Map<string, AlbumDetail | null>();
// Track which songs have already shown the artist section animation
const artistAnimationShown = new Set<string>();

// Cache for album motion video URLs
const albumMotionCache = new Map<string, string | null>();

const NowPlayingView = () => {
  const { 
    currentSong, 
    seek, 
    queue, 
    queueIndex, 
    toggleNowPlaying, 
    showTranslation, 
    toggleTranslation,
    nowPlayingSection,
    setNowPlayingSection,
    queueSource,
    activateExpandedLyrics,
    expandedLyricsMode,
  } = usePlayerStore();
  // Use store section state directly
  const section = nowPlayingSection;
  const setSection = setNowPlayingSection;
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string>('');
  const [songMenuOpen, setSongMenuOpen] = useState(false);
  const [songMenuPosition, setSongMenuPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [songDetail, setSongDetail] = useState<SongDetail | null>(null);
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const navigate = useNavigate();
  const { setLyricsVisible } = usePlayerStore();
  const { isOnline } = useOnlineStatus();
  const { cachedSongIds } = useOfflineCacheStore();

  const resolvedNowPlaying = useMemo(() => {
    if (!currentSong) {
      return null;
    }
    return resolveNowPlayingSongData(currentSong, songDetail, albumDetail);
  }, [currentSong, songDetail, albumDetail]);

  const displaySong = resolvedNowPlaying?.song ?? currentSong;
  const effectiveArtworkUrl = resolvedNowPlaying?.artworkUrl ?? currentSong?.artworkUrl ?? '';
  const effectiveArtistArtworkUrl = resolvedNowPlaying?.artistArtworkUrl;

  const handleSongMenuToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!songMenuOpen) {
      const rect = e.currentTarget.getBoundingClientRect();
      setSongMenuPosition({ x: rect.left, y: rect.bottom + 4 });
    }
    setSongMenuOpen((open) => !open);
  }, [songMenuOpen]);

  // 点击专辑图片切换到艺术家界面
  const handleArtworkClick = () => {
    setSection('artist');
    // 同时关闭歌词可见状态，使底部歌词按钮显示为关闭状态
    setLyricsVisible(false);
  };
  
  // 点击歌手名跳转到歌手详情页
  const handleArtistClick = () => {
    if (displaySong?.artistId) {
      toggleNowPlaying();
      navigate(`/artist/${displaySong.artistId}`);
    }
  };
  
  // Check if any lyric line has translation
  const hasTranslation = useMemo(() => {
    return lyrics.some(line => line.translation && line.translation.trim() !== '');
  }, [lyrics]);

  useEffect(() => {
    if (!currentSong) {
      setSongDetail(null);
      return;
    }

    const cachedDetail = songDetailCache.get(currentSong.id) ?? null;
    setSongDetail(cachedDetail);

    let cancelled = false;
    const fetchNowPlayingSongDetail = async () => {
      try {
        if (!isOnline && cachedSongIds.has(currentSong.id)) {
          const cached = await getSongDetailFromCache(currentSong.id);
          if (!cancelled && cached?.songDetail) {
            songDetailCache.set(currentSong.id, cached.songDetail as SongDetail);
            setSongDetail(cached.songDetail as SongDetail);
          }
          return;
        }

        if (!isOnline) {
          return;
        }

        const detail = await getSongDetail(currentSong.id);
        if (!cancelled) {
          songDetailCache.set(currentSong.id, detail);
          setSongDetail(detail);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load now playing song detail', error);
        }
      }
    };

    fetchNowPlayingSongDetail();
    return () => {
      cancelled = true;
    };
  }, [currentSong, isOnline, cachedSongIds]);

  useEffect(() => {
    const albumId = currentSong?.albumId;
    if (!albumId) {
      setAlbumDetail(null);
      return;
    }

    const cachedDetail = albumDetailCache.get(albumId) ?? null;
    setAlbumDetail(cachedDetail);

    if (!isOnline) {
      return;
    }

    let cancelled = false;
    const fetchNowPlayingAlbumDetail = async () => {
      try {
        const detail = await getAlbumDetail(albumId);
        if (!cancelled) {
          albumDetailCache.set(albumId, detail);
          setAlbumDetail(detail);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load now playing album detail', error);
        }
      }
    };

    fetchNowPlayingAlbumDetail();
    return () => {
      cancelled = true;
    };
  }, [currentSong?.albumId, isOnline]);
  
  // Load background image URL with cache-first support for offline mode
  useEffect(() => {
    if (!currentSong || !effectiveArtworkUrl) {
      setBackgroundUrl('');
      return;
    }
    
    const loadBackgroundUrl = async () => {
      const fallbackUrl = getProxiedImageUrl(effectiveArtworkUrl, 600);
      const url = await getCacheFirstArtworkUrl(currentSong.id, fallbackUrl);
      setBackgroundUrl(url);
    };
    
    loadBackgroundUrl();
  }, [currentSong?.id, effectiveArtworkUrl]);
  
  // Preload images for all sections to avoid reload on section switch
  useEffect(() => {
    if (!currentSong) return;
    
    // Preload artwork in different sizes used across sections
    if (effectiveArtworkUrl) {
      const sizesToPreload = [160, 400, 600]; // LyricsSection: 160, ArtistSection: 400, Background: 600
      sizesToPreload.forEach(size => {
        const img = new Image();
        img.src = getProxiedImageUrl(effectiveArtworkUrl, size);
      });
    }
    
    if (effectiveArtistArtworkUrl) {
      const img = new Image();
      img.src = getProxiedImageUrl(effectiveArtistArtworkUrl, 256);
    }
  }, [currentSong?.id, effectiveArtworkUrl, effectiveArtistArtworkUrl]);

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
  }, [currentSong?.id]);

  if (!currentSong) return null;

  return (
    <div className="h-full w-[calc(100%-2px)] relative overflow-hidden bg-black text-white flex flex-col select-none">
      {/* Blurred Background - GPU composited for Safari/Firefox */}
      <div 
        className="absolute inset-0 z-0 opacity-40 pointer-events-none transition-all duration-1000"
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(60px) saturate(1.5)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
      <div className="absolute inset-0 z-0 bg-black/30 pointer-events-none" />

      {/* Header with playing source and close button */}
      <div className="relative z-10 flex items-center justify-between px-6 py-2 bg-transparent">
        <div className="flex-1 min-w-0 max-w-[75%]">
          {(() => {
            // Determine display text and navigation based on queue source
            const getSourceInfo = () => {
              if (!queueSource || !queueSource.type) {
                return { text: displaySong.albumName, href: displaySong.albumId ? `/album/${displaySong.albumId}` : null };
              }
              switch (queueSource.type) {
                case 'playlist':
                  return { 
                    text: queueSource.name || '播放列表', 
                    href: queueSource.id ? `/playlist/${queueSource.id}` : null 
                  };
                case 'album':
                  return { 
                    text: queueSource.name || displaySong.albumName, 
                    href: queueSource.id ? `/album/${queueSource.id}` : (displaySong.albumId ? `/album/${displaySong.albumId}` : null)
                  };
                case 'artist':
                  return { 
                    text: queueSource.name || displaySong.artistName, 
                    href: queueSource.id ? `/artist/${queueSource.id}` : (displaySong.artistId ? `/artist/${displaySong.artistId}` : null)
                  };
                case 'liked-songs':
                  return { text: '喜欢的歌曲', href: '/liked-songs' };
                case 'search':
                  return { text: '搜索结果', href: null };
                case 'single':
                  return { text: displaySong.albumName, href: displaySong.albumId ? `/album/${displaySong.albumId}` : null };
                default:
                  return { text: displaySong.albumName, href: displaySong.albumId ? `/album/${displaySong.albumId}` : null };
              }
            };
            const sourceInfo = getSourceInfo();
            return (
              <ScrollingText 
                text={sourceInfo.text}
                className="text-sm font-bold text-white/70 hover:underline cursor-pointer"
                onClick={sourceInfo.href ? () => navigate(sourceInfo.href!) : undefined}
              />
            );
          })()}
        </div>
        <div className="flex items-center gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleSongMenuToggle}
            className="p-1.5 rounded-full transition-all duration-200 bg-transparent text-white/70 opacity-50 scale-90 hover:bg-white/10 hover:text-white hover:opacity-100 hover:scale-100"
            title="更多选项"
            aria-haspopup="menu"
            aria-expanded={songMenuOpen}
          >
            <FiMoreHorizontal size={22} />
          </button>
          <button 
            onClick={toggleNowPlaying} 
            className="p-1.5 rounded-full transition-all duration-200 bg-transparent text-white/70 opacity-50 scale-90 hover:bg-white/10 hover:text-white hover:opacity-100 hover:scale-100"
          >
            <FiChevronDown size={22} />
          </button>
        </div>
      </div>



      {/* Main Content Area */}
      <div className="flex-1 relative z-10 overflow-hidden">
        <AnimatePresence mode="popLayout">
          {section === 'lyrics' && !expandedLyricsMode && (
            <LyricsSection
              key="lyrics"
              song={displaySong}
              lyrics={lyrics}
              loading={loadingLyrics}
              onSeek={seek}
              showTranslation={showTranslation}
              hasTranslation={hasTranslation}
              onToggleTranslation={toggleTranslation}
              onArtworkClick={handleArtworkClick}
              onArtistClick={handleArtistClick}
              onExpand={activateExpandedLyrics}
            />
          )}
          {section === 'artist' && (
            <ArtistSection key="artist" song={displaySong} prefetchedSongDetail={songDetail} prefetchedAlbumDetail={albumDetail} />
          )}
          {section === 'queue' && (
            <QueueSection key="queue" queue={queue} currentIndex={queueIndex} />
          )}
        </AnimatePresence>
      </div>

      {/* Song context menu */}
      <SongContextMenu
        song={displaySong}
        isOpen={songMenuOpen}
        position={songMenuPosition}
        onClose={() => setSongMenuOpen(false)}
        closeOnScroll={false}
      />
    </div>
  );
};

// --- Sub Components ---

// Component for rendering a single word with fill-style progress animation
// Uses ref-based updates to avoid React re-renders on every frame
const SyllableWord = memo(({ word, currentTimeMsRef, registerUpdater, unregisterUpdater, wordKey }: {
  word: { timestamp: number; endTime: number; text: string };
  currentTimeMsRef: React.MutableRefObject<number>;
  registerUpdater: (key: string, updater: () => void) => void;
  unregisterUpdater: (key: string) => void;
  wordKey: string;
}) => {
  const fillRef = useRef<HTMLSpanElement>(null);
  const text = word.text || '';

  // Register for updates from parent RAF loop
  useEffect(() => {
    const update = () => {
      if (!fillRef.current) return;
      const fillPercent = calculateWordFillPercentage(
        currentTimeMsRef.current,
        word.timestamp,
        word.endTime
      );
      fillRef.current.style.width = `${fillPercent}%`;
    };

    registerUpdater(wordKey, update);
    update(); // Initial update

    return () => unregisterUpdater(wordKey);
  }, [word.timestamp, word.endTime, wordKey, currentTimeMsRef, registerUpdater, unregisterUpdater]);

  return (
    <span className="relative inline-block" style={{ whiteSpace: 'pre' }}>
      {/* Base layer - dim text */}
      <span className="text-white/40">{text}</span>
      {/* Fill layer - bright text with width clipping */}
      <span
        ref={fillRef}
        className="absolute left-0 top-0 overflow-hidden text-white"
        style={{
          width: '0%',
          whiteSpace: 'pre',
        }}
        aria-hidden="true"
      >
        {text}
      </span>
    </span>
  );
});
SyllableWord.displayName = 'SyllableWord';

// ─── NowPlaying Centralized Animation Coordinator ───────────────────
// Same pattern as LyricLine.tsx — one shared RAF loop for all lines.
const NP_TRANSITION_MS = 600;

interface NpLineAnim {
  el: HTMLDivElement;
  t0: number;
  fromO: number; fromS: number;
  toO: number; toS: number;
}
const npAnims = new Map<string, NpLineAnim>();
let npRafId: number | null = null;

function npTick(now: number) {
  let hasActive = false;
  npAnims.forEach((a, key) => {
    const p = Math.min((now - a.t0) / NP_TRANSITION_MS, 1);
    const e = easings.iosSpring(p);
    a.el.style.opacity = String(a.fromO + (a.toO - a.fromO) * e);
    a.el.style.transform = `scale(${a.fromS + (a.toS - a.fromS) * e})`;
    if (p >= 1) npAnims.delete(key); else hasActive = true;
  });
  npRafId = hasActive ? requestAnimationFrame(npTick) : null;
}

function npStartAnim(id: string, el: HTMLDivElement, fromO: number, fromS: number, toO: number, toS: number) {
  npAnims.set(id, { el, t0: performance.now(), fromO, fromS, toO, toS });
  if (npRafId === null) npRafId = requestAnimationFrame(npTick);
}

function npStopAnim(id: string) { npAnims.delete(id); }

// Stable ID counter
let npLineIdCounter = 0;

const LyricLineComponent = memo(({
  line,
  index,
  isActive,
  adjacentIndex,
  onClick,
  showTranslation,
  currentTimeMsRef,
  registerUpdater,
  unregisterUpdater
}: {
  line: LyricLine;
  index: number;
  isActive: boolean;
  adjacentIndex: number;
  onClick: () => void;
  showTranslation: boolean;
  currentTimeMsRef: React.MutableRefObject<number>;
  registerUpdater: (key: string, updater: () => void) => void;
  unregisterUpdater: (key: string) => void;
}) => {
  const hasSyllables = line.words && line.words.length > 0;
  const elRef = useRef<HTMLDivElement>(null);
  const animId = useRef(`np-${++npLineIdCounter}`);
  const cur = useRef({ opacity: -1, scale: -1 });

  const targetOpacity = useMemo(() => getLineOpacity(adjacentIndex), [adjacentIndex]);
  const targetScale = isActive ? 1.02 : 1.0;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const prev = cur.current;
    if (prev.opacity < 0) {
      cur.current = { opacity: targetOpacity, scale: targetScale };
      el.style.opacity = String(targetOpacity);
      el.style.transform = `scale(${targetScale})`;
      return;
    }
    if (prev.opacity === targetOpacity && prev.scale === targetScale) return;
    npStartAnim(animId.current, el, prev.opacity, prev.scale, targetOpacity, targetScale);
    cur.current = { opacity: targetOpacity, scale: targetScale };
    return () => npStopAnim(animId.current);
  }, [targetOpacity, targetScale]);

  useEffect(() => { const id = animId.current; return () => npStopAnim(id); }, []);

  const isNearActive = Math.abs(adjacentIndex) <= 1;

  return (
    <div
      ref={elRef}
      data-lyric-index={index}
      onClick={onClick}
      className="cursor-pointer py-2 origin-left break-words"
      style={{
        opacity: targetOpacity,
        transform: `scale(${targetScale})`,
        transformOrigin: 'left center',
        willChange: isNearActive ? 'transform, opacity' : 'auto',
      }}
    >
      <p className="font-semibold text-2xl">
        {hasSyllables ? (
          line.words!.map((word, wordIdx) => (
            <SyllableWord
              key={wordIdx}
              word={word}
              wordKey={`${index}-${wordIdx}`}
              currentTimeMsRef={currentTimeMsRef}
              registerUpdater={registerUpdater}
              unregisterUpdater={unregisterUpdater}
            />
          ))
        ) : (
          <span className="relative inline-block" style={{ whiteSpace: 'pre-wrap' }}>
            <span className="text-white/40">{line.text || '♪'}</span>
            <span
              className="absolute left-0 top-0 overflow-hidden text-white"
              style={{ width: isActive ? '100%' : '0%', whiteSpace: 'pre-wrap' }}
            >
              {line.text || '♪'}
            </span>
          </span>
        )}
      </p>

      {showTranslation && line.translation && (
        <p className="text-sm mt-1.5 text-white" style={{ opacity: 0.6 }}>
          {line.translation}
        </p>
      )}
    </div>
  );
});
LyricLineComponent.displayName = 'LyricLineComponent';

// Shared transition for all layout animations (artwork, title, artist)
const sharedLayoutTransition = {
  layout: { duration: 0.55, ease: [0.22, 0.7, 0.36, 1] }
};

const LyricsSection = ({ song, lyrics, loading, onSeek, showTranslation, hasTranslation, onToggleTranslation, onArtworkClick, onArtistClick, onExpand }: {
  song: any,
  lyrics: LyricLine[],
  loading: boolean,
  onSeek: (t: number) => void,
  showTranslation: boolean,
  hasTranslation: boolean,
  onToggleTranslation: () => void,
  onArtworkClick: () => void,
  onArtistClick?: () => void,
  onExpand?: () => void
}) => {
  const { audioRef } = usePlayerStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Use ref for currentTimeMs to avoid triggering re-renders on every RAF tick
  // Only activeIndex state triggers re-renders (when line changes)
  const currentTimeMsRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(-1);

  // Refs for syllable components to update without re-rendering parent
  const syllableUpdatersRef = useRef<Map<string, () => void>>(new Map());

  // Callbacks for syllable components to register/unregister their updaters
  const registerUpdater = useCallback((key: string, updater: () => void) => {
    syllableUpdatersRef.current.set(key, updater);
  }, []);

  const unregisterUpdater = useCallback((key: string) => {
    syllableUpdatersRef.current.delete(key);
  }, []);

  // Check if any line has word-level timing
  const hasWordTiming = useMemo(() => {
    return lyrics.some(line => line.words && line.words.length > 0);
  }, [lyrics]);

  // Ref to track if component is still active (for stopping RAF on unmount/exit)
  const isActiveRef = useRef(true);
  useEffect(() => {
    isActiveRef.current = true;
    return () => {
      isActiveRef.current = false;
    };
  }, []);

  // Time update using RAF for smooth animation
  // Uses ref to avoid state updates, only updates activeIndex when line changes
  useEffect(() => {
    if (!audioRef) return;

    let animationFrameId: number | null = null;
    let lastActiveIndex = -1;

    const updateTime = () => {
      if (!isActiveRef.current) return;

      const timeMs = audioRef.currentTime * 1000;
      currentTimeMsRef.current = timeMs;

      // Calculate active index
      let newActiveIndex = -1;
      for (let i = 0; i < lyrics.length; i++) {
        if (lyrics[i].timestamp <= timeMs) newActiveIndex = i;
        else break;
      }

      // Only trigger state update when active line changes
      if (newActiveIndex !== lastActiveIndex) {
        lastActiveIndex = newActiveIndex;
        setActiveIndex(newActiveIndex);
      }

      // Notify syllable components to update (without React re-render)
      syllableUpdatersRef.current.forEach(updater => updater());
    };

    if (hasWordTiming) {
      const tick = () => {
        if (!isActiveRef.current) return;
        updateTime();
        animationFrameId = requestAnimationFrame(tick);
      };
      animationFrameId = requestAnimationFrame(tick);
    } else {
      audioRef.addEventListener('timeupdate', updateTime);
      updateTime();
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      audioRef.removeEventListener('timeupdate', updateTime);
    };
  }, [audioRef, hasWordTiming, lyrics]);

  const handleScrollbarMouseEnter = useCallback(() => {
    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = null;
    }
    setShowScrollbar(true);
  }, []);

  const handleScrollbarMouseLeave = useCallback(() => {
    scrollbarTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false);
    }, 1800);
  }, []);

  // Track user interaction state
  const isUserInteractingRef = useRef(false);

  // Handle wheel scroll - pause immediately on wheel (like mobile touch)
  const handleWheel = useCallback(() => {
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

  // Scroll animation using shared utility for consistent iOS-style feel
  const scrollCancelRef = useRef<(() => void) | null>(null);

  // Auto-scroll to active lyric - position at upper 1/3 of container
  useEffect(() => {
    if (userScrolling || activeIndex < 0 || !containerRef.current) return;

    const container = containerRef.current;
    const activeEl = container.querySelector(`[data-lyric-index="${activeIndex}"]`) as HTMLElement;

    if (activeEl) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = activeEl.getBoundingClientRect();
      const containerHeight = containerRect.height;

      // Calculate current element position relative to container's scroll
      const elementTopRelative = elementRect.top - containerRect.top + container.scrollTop;

      // Position active line at upper 1/3 of container
      const targetPosition = containerHeight / 3;
      const scrollTo = Math.max(0, elementTopRelative - targetPosition);

      // Skip if already at target (within 5px tolerance)
      if (Math.abs(container.scrollTop - scrollTo) < 5) return;

      // Cancel previous animation
      if (scrollCancelRef.current) {
        scrollCancelRef.current();
      }

      scrollCancelRef.current = animateScrollTo({
        container,
        targetScrollTop: scrollTo,
        easing: easings.iosSpring,
      });
    }
  }, [activeIndex, userScrolling]);

  // Cleanup scroll animation on unmount
  useEffect(() => {
    return () => {
      if (scrollCancelRef.current) {
        scrollCancelRef.current();
      }
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Cleanup scrollbar timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);

  const handleLyricClick = (timestamp: number) => {
    onSeek(timestamp / 1000);
    setUserScrolling(false); // Resume auto-scroll after clicking
  };

  return (
    <motion.div
      layout="position"
      className="h-full flex flex-col px-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.25, ease: 'easeOut' } }}
      exit={{ opacity: 1 }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Album Art & Header */}
      <div className="flex-shrink-0 mb-6 flex gap-4 items-center">
        <motion.div
          layoutId="nowplaying-artwork"
          className="w-20 h-20 rounded shadow-lg cursor-pointer overflow-hidden"
          onClick={onArtworkClick}
          whileTap={{ scale: 0.9 }}
          transition={sharedLayoutTransition}
        >
          <CachedImage
            src={getProxiedImageUrl(song.artworkUrl, 160)}
            alt={song.name}
            className="w-full h-full object-cover"
            songId={song.id}
          />
        </motion.div>
        <motion.div
          layoutId="nowplaying-meta"
          className="min-w-0 flex-1 overflow-hidden"
          transition={sharedLayoutTransition}
        >
          <motion.div layoutId="nowplaying-title" className="w-full" transition={sharedLayoutTransition}>
            <ScrollingText text={song.name} className="text-2xl font-bold" />
          </motion.div>
          <motion.div layoutId="nowplaying-artist" className="w-full text-white/60 text-lg" transition={sharedLayoutTransition}>
            <ScrollingText
              text={song.artistName}
              className="text-white/60 hover:underline cursor-pointer"
              onClick={song.artistId ? onArtistClick : undefined}
            />
          </motion.div>
        </motion.div>
      </div>

      {/* Lyrics area wrapper - relative for floating buttons */}
      <div className="flex-1 min-h-0 relative">
        {/* Floating action buttons - outside mask layer */}
        <div className={clsx(
          "absolute right-0 top-0 z-20 flex items-center gap-1 transition-all duration-150",
          !isHovering && "opacity-0 pointer-events-none",
          isHovering && "opacity-100"
        )}>
          <button
            onClick={hasTranslation ? onToggleTranslation : undefined}
            disabled={!hasTranslation}
            className={clsx(
              "p-1.5 rounded-full transition-all duration-150",
              !hasTranslation
                ? "text-white/20 cursor-not-allowed"
                : showTranslation
                  ? "text-green-400 hover:bg-white/10"
                  : "text-white/50 hover:bg-white/10 hover:text-white"
            )}
            title={!hasTranslation ? '无翻译' : showTranslation ? '隐藏翻译' : '显示翻译'}
          >
            <FiGlobe size={18} />
          </button>
          <button
            onClick={onExpand}
            disabled={!song}
            className={clsx(
              "p-1.5 rounded-full transition-all duration-150",
              !song
                ? "text-white/20 cursor-not-allowed"
                : "text-white/50 hover:bg-white/10 hover:text-white"
            )}
            title="放大歌词"
          >
            <FiMaximize2 size={18} />
          </button>
        </div>

        {/* Lyrics Scroll Area */}
        <motion.div 
          className="h-full overflow-hidden"
        style={{ 
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)'
        }}
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 28, transition: { duration: 0.25, ease: 'easeInOut' } }}
      >
        <OverlayScrollbarsComponent
          className={`h-full ${showScrollbar ? 'scrollbar-visible' : ''}`}
          onMouseEnter={handleScrollbarMouseEnter}
          onMouseLeave={handleScrollbarMouseLeave}
          options={{ 
            scrollbars: { 
              theme: 'os-theme-light',
              autoHide: 'move',
              clickScroll: true
            } 
          }}
          events={{
            initialized: (instance) => {
              const viewport = instance.elements().viewport;
              (containerRef as any).current = viewport;
              // Add wheel event listener for user scroll detection
              viewport.addEventListener('wheel', handleWheel, { passive: true });
            },
            destroyed: (instance) => {
              const viewport = instance.elements().viewport;
              viewport.removeEventListener('wheel', handleWheel);
            }
          }}
        >
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-white" />
            </div>
          ) : lyrics.length === 0 ? (
            <div className="h-full flex items-center justify-center text-white/40">
              暂无歌词
            </div>
          ) : (
            <div className="pt-[33%] pb-[67%] space-y-4">
              {lyrics.map((line, i) => {
                const isActive = i === activeIndex;
                const adjacentIndex = activeIndex >= 0 ? i - activeIndex : i;
                return (
                  <LyricLineComponent
                    key={i}
                    line={line}
                    index={i}
                    isActive={isActive}
                    adjacentIndex={adjacentIndex}
                    onClick={() => handleLyricClick(line.timestamp)}
                    showTranslation={showTranslation}
                    currentTimeMsRef={currentTimeMsRef}
                    registerUpdater={registerUpdater}
                    unregisterUpdater={unregisterUpdater}
                  />
                );
              })}
            </div>
          )}
        </OverlayScrollbarsComponent>
        </motion.div>
      </div>
    </motion.div>
  );
};

const ArtistSection = forwardRef<HTMLDivElement, {
  song: any;
  prefetchedSongDetail?: SongDetail | null;
  prefetchedAlbumDetail?: AlbumDetail | null;
}>(({ song, prefetchedSongDetail = null, prefetchedAlbumDetail = null }, _ref) => {
  const navigate = useNavigate();
  const [songDetail, setSongDetail] = useState<any>(() => songDetailCache.get(song.id) || prefetchedSongDetail || null);
  const [loading, setLoading] = useState(!songDetailCache.has(song.id) && !prefetchedSongDetail);
  const [albumMotionUrl, setAlbumMotionUrl] = useState<string | null>(() => 
    prefetchedAlbumDetail?.motionVideoUrl || (song.albumId ? albumMotionCache.get(song.albumId) || null : null)
  );
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isFollowed, followArtist, unfollowArtist } = useFollowedArtistsStore();
  const [followLoading, setFollowLoading] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Offline cache support
  const { isOnline } = useOnlineStatus();
  const { cachedSongIds } = useOfflineCacheStore();
  const [offlineArtistArtworkUrl, setOfflineArtistArtworkUrl] = useState<string | null>(null);
  const offlineObjectUrlsRef = useRef<string[]>([]);

  const handleScrollbarMouseEnter = useCallback(() => {
    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = null;
    }
    setShowScrollbar(true);
  }, []);

  const handleScrollbarMouseLeave = useCallback(() => {
    scrollbarTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false);
    }, 1800);
  }, []);

  // Cleanup scrollbar timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);
  
  // Cleanup offline object URLs on unmount or song change
  useEffect(() => {
    return () => {
      if (offlineObjectUrlsRef.current.length > 0) {
        revokeObjectUrls(offlineObjectUrlsRef.current);
        offlineObjectUrlsRef.current = [];
      }
    };
  }, [song.id]);

  useEffect(() => {
    // If already cached in memory, use it
    if (songDetailCache.has(song.id)) {
      setSongDetail(songDetailCache.get(song.id));
      setLoading(false);
      return;
    }

    if (prefetchedSongDetail) {
      songDetailCache.set(song.id, prefetchedSongDetail);
      setSongDetail(prefetchedSongDetail);
      setLoading(false);
      return;
    }
    
    const fetchDetail = async () => {
      setLoading(true);
      
      // Check if offline and song is cached
      const isSongCached = cachedSongIds.has(song.id);
      
      if (!isOnline && isSongCached) {
        // Load from offline cache
        try {
          const cachedResult = await getSongDetailFromCache(song.id);
          if (cachedResult && cachedResult.songDetail) {
            // Convert cached song detail to the format expected by the component
            const detail = {
              composerName: cachedResult.songDetail.composerName,
              genres: cachedResult.songDetail.genres,
              isrc: cachedResult.songDetail.isrc,
              audioInfo: cachedResult.songDetail.audioInfo,
              credits: cachedResult.songDetail.credits,
              album: cachedResult.songDetail.album,
              artists: cachedResult.songDetail.artists?.map(a => ({
                id: a.id,
                name: a.name,
                // artworkUrl will be handled separately via offlineArtistArtworkUrl
                artworkUrl: undefined,
              })),
            };
            songDetailCache.set(song.id, detail);
            setSongDetail(detail);
            
            // Set offline artist artwork URL
            if (cachedResult.artistArtworkUrl) {
              setOfflineArtistArtworkUrl(cachedResult.artistArtworkUrl);
              offlineObjectUrlsRef.current = cachedResult.objectUrls;
            }
            setLoading(false);
            return;
          }
        } catch (error) {
          console.error("Failed to load song detail from cache", error);
        }
      }
      
      // Online: fetch from API
      if (isOnline) {
        try {
          const detail = await getSongDetail(song.id);
          songDetailCache.set(song.id, detail);
          setSongDetail(detail);
        } catch (error) {
          console.error("Failed to load song detail", error);
        }
      }
      
      setLoading(false);
    };
    fetchDetail();
  }, [song.id, isOnline, cachedSongIds, prefetchedSongDetail]);

  // Fetch album motion video URL
  useEffect(() => {
    const albumId = song.albumId;
    if (!albumId) return;

    if (prefetchedAlbumDetail?.motionVideoUrl) {
      albumDetailCache.set(albumId, prefetchedAlbumDetail);
      albumMotionCache.set(albumId, prefetchedAlbumDetail.motionVideoUrl);
      setAlbumMotionUrl(prefetchedAlbumDetail.motionVideoUrl);
      return;
    }
    
    // Check cache first
    if (albumMotionCache.has(albumId)) {
      setAlbumMotionUrl(albumMotionCache.get(albumId) || null);
      return;
    }
    
    const fetchAlbumMotion = async () => {
      try {
        const albumDetail = await getAlbumDetail(albumId);
        albumDetailCache.set(albumId, albumDetail);
        const motionUrl = albumDetail?.motionVideoUrl || null;
        albumMotionCache.set(albumId, motionUrl);
        setAlbumMotionUrl(motionUrl);
      } catch (error) {
        console.error("Failed to load album motion video", error);
        albumMotionCache.set(albumId, null);
      }
    };
    fetchAlbumMotion();
  }, [song.albumId, prefetchedAlbumDetail]);

  const composer = songDetail?.credits?.composer || songDetail?.composerName || '未知';
  const genres = songDetail?.genres?.join(', ') || '未知';
  const artists = songDetail?.artists?.map((a: any) => a.name).join(', ') || song.artistName;
  const audioCodec = formatAudioCodecLabel(songDetail?.audioInfo?.codec, songDetail?.audioInfo?.container);
  const audioBitrate = formatAudioBitrate(songDetail?.audioInfo?.bitrate);
  const audioSampleRate = formatAudioSampleRate(songDetail?.audioInfo?.sampleRate);
  const audioChannels = formatAudioChannels(songDetail?.audioInfo?.channels);
  const releaseDate = getNowPlayingReleaseDate(songDetail, prefetchedAlbumDetail);
  const metadataSourceSummary = getMetadataSourceLabels(
    song.fieldSources,
    songDetail?.artists?.[0]?.fieldSources ?? prefetchedAlbumDetail?.artists?.[0]?.fieldSources,
    songDetail?.album?.fieldSources ?? prefetchedAlbumDetail?.fieldSources
  ).join(' · ');

  // Get first artist ID for navigation
  const firstArtistId = songDetail?.artists?.[0]?.id || song.artistId;
  
  // Get artist artwork - use first artist's artwork if available, fallback to album/song artwork
  const firstArtistArtwork = songDetail?.artists?.[0]?.artworkUrl || prefetchedAlbumDetail?.artists?.[0]?.artworkUrl;
  
  const handleArtistClick = () => {
    if (firstArtistId) {
      navigate(`/artist/${firstArtistId}`);
    }
  };

  const handleAlbumClick = () => {
    if (song.albumId) {
      navigate(`/album/${song.albumId}`);
    }
  };

  // Handle follow/unfollow artist
  const handleFollowClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (followLoading || !firstArtistId) return;
    
    setFollowLoading(true);
    try {
      if (isFollowed(firstArtistId)) {
        await unfollowArtist(firstArtistId);
      } else {
        await followArtist({
          id: firstArtistId,
          name: song.artistName,
          artworkUrl: firstArtistArtwork,
        });
      }
    } catch (err) {
      console.error('Follow/unfollow failed:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  const artistIsFollowed = firstArtistId ? isFollowed(firstArtistId) : false;
  
  // Try artist artwork first, then album artwork, then song artwork
  // Use proxied URL to go through our server (avoids CORS and caches images)
  // For offline mode, use cached artist artwork URL if available
  let artistDisplayArtwork = '';
  if (offlineArtistArtworkUrl) {
    // Use offline cached artist artwork (Object URL)
    artistDisplayArtwork = offlineArtistArtworkUrl;
  } else if (firstArtistArtwork && firstArtistArtwork.trim() !== '') {
    artistDisplayArtwork = getProxiedImageUrl(firstArtistArtwork, 256);
  } else if (songDetail?.album?.artworkUrl) {
    artistDisplayArtwork = getProxiedImageUrl(songDetail.album.artworkUrl, 256);
  } else if (song.artworkUrl) {
    artistDisplayArtwork = getProxiedImageUrl(song.artworkUrl, 256);
  }

  // Track if this is the first render with data (for animation)
  // Use external Set to persist across component remounts (e.g., when switching from expanded lyrics)
  const shouldAnimate = !artistAnimationShown.has(song.id) && !loading && songDetail;
  
  useEffect(() => {
    if (!loading && songDetail && !artistAnimationShown.has(song.id)) {
      artistAnimationShown.add(song.id);
    }
  }, [loading, songDetail, song.id]);

  // 监听容器宽度变化，决定是否使用紧凑模式的关注按钮
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // 当容器宽度小于 380px 时切换为紧凑模式
        setIsCompact(entry.contentRect.width < 380);
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 容器动画变体 - 只控制进入时的交错动画
  const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: shouldAnimate ? { staggerChildren: 0.1, delayChildren: 0.1 } : { duration: 0 }
    }
  };

  // 卡片动画变体 - 只有进入动画，退出时跟随父容器淡出
  const cardVariants = {
    hidden: shouldAnimate ? { x: 40, opacity: 0 } : { x: 0, opacity: 1 },
    visible: { 
      x: 0, 
      opacity: 1,
      transition: shouldAnimate ? { type: 'spring', stiffness: 260, damping: 28 } : { duration: 0 }
    }
  };

  return (
    <motion.div
      ref={containerRef}
      layout="position"
      className="h-full flex flex-col"
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: 'easeInOut' } }}
    >
      <OverlayScrollbarsComponent
        className={`h-full ${showScrollbar ? 'scrollbar-visible' : ''}`}
        onMouseEnter={handleScrollbarMouseEnter}
        onMouseLeave={handleScrollbarMouseLeave}
        options={{ 
          scrollbars: { 
            theme: 'os-theme-light',
            autoHide: 'move',
            clickScroll: true
          } 
        }}
      >
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/20 border-t-white" />
        </div>
      ) : (
        <motion.div 
          className="space-y-4 w-full px-6 pb-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Album Art Header - 专辑封面、歌曲名、艺术家名 */}
          <div className="flex flex-col mb-2 w-full">
            <motion.div
              layoutId="nowplaying-artwork"
              className="w-full aspect-square rounded-lg shadow-2xl mb-4 overflow-hidden"
              transition={sharedLayoutTransition}
            >
              {albumMotionUrl ? (
                <MotionArtwork
                  videoUrl={albumMotionUrl}
                  fallbackImage={getProxiedImageUrl(song.artworkUrl, 400)}
                  alt={song.name}
                  songId={song.id}
                />
              ) : (
                <CachedImage
                  src={getProxiedImageUrl(song.artworkUrl, 400)}
                  alt={song.name}
                  className="w-full h-full object-cover"
                  songId={song.id}
                />
              )}
            </motion.div>
            <div className="flex items-center gap-3 w-full">
              <motion.div layoutId="nowplaying-meta" className="space-y-1 overflow-hidden flex-1 min-w-0" transition={sharedLayoutTransition}>
                <motion.div layoutId="nowplaying-title" className="w-full" transition={sharedLayoutTransition}>
                  <ScrollingText text={song.name} className="text-2xl font-bold" />
                </motion.div>
                <motion.div layoutId="nowplaying-artist" className="w-full text-white/60 text-lg" transition={sharedLayoutTransition}>
                  <ScrollingText
                    text={song.artistName}
                    className="text-white/60 hover:underline cursor-pointer"
                    onClick={firstArtistId ? handleArtistClick : undefined}
                  />
                </motion.div>
              </motion.div>
              <LikeButton song={song} size="md" showOnHover={false} />
            </div>
          </div>

          {/* Artist Card */}
          <motion.div 
            className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm cursor-pointer hover:bg-white/10 transition-colors"
            onClick={handleArtistClick}
            variants={cardVariants}
          >
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4 flex items-center justify-between">
              <span className="shrink-0">主要艺人</span>
              <FiChevronRight className="text-white/30 flex-shrink-0" size={20} />
            </h3>
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-white/10 flex-shrink-0 shadow-lg">
                {artistDisplayArtwork ? (
                  <CachedImage 
                    src={artistDisplayArtwork} 
                    alt={song.artistName} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="text-3xl text-white/40">♪</span>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <ScrollingText text={song.artistName} className="font-semibold text-xl" />
                <div className="mt-1">
                  <ScrollingText text={genres} className="text-white/40 text-sm" />
                </div>
              </div>
              {/* Follow Button */}
              {firstArtistId && (
                isCompact ? (
                  // 紧凑模式：图标按钮（类似 LikeButton 的加号/对号样式）
                  <button
                    onClick={handleFollowClick}
                    disabled={followLoading}
                    className="flex-shrink-0 flex items-center justify-center transition-all duration-150"
                    title={artistIsFollowed ? '取消关注' : '关注'}
                  >
                    <div className="relative w-5 h-5">
                      {/* 未关注：灰色圆圈加号 */}
                      <svg
                        className={clsx(
                          "w-5 h-5 transition-all duration-300 ease-out absolute inset-0",
                          artistIsFollowed ? "opacity-0 scale-50 rotate-90" : "opacity-100 scale-100 rotate-0"
                        )}
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                          className="text-gray-400"
                        />
                        <line
                          x1="12"
                          y1="8"
                          x2="12"
                          y2="16"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          className="text-gray-400"
                        />
                        <line
                          x1="8"
                          y1="12"
                          x2="16"
                          y2="12"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          className="text-gray-400"
                        />
                      </svg>
                      {/* 已关注：绿色圆圈对号 */}
                      <svg
                        className={clsx(
                          "w-5 h-5 transition-all duration-300 ease-out",
                          artistIsFollowed ? "opacity-100 scale-100 rotate-0" : "opacity-0 scale-50 -rotate-90"
                        )}
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <defs>
                          <mask id="checkmark-mask-follow">
                            <rect width="24" height="24" fill="white" />
                            <polyline
                              points="7 12 10.5 15.5 17 9"
                              stroke="black"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                            />
                          </mask>
                        </defs>
                        <circle cx="12" cy="12" r="11" fill="#1DB954" mask="url(#checkmark-mask-follow)" />
                      </svg>
                      {followLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  </button>
                ) : (
                  // 正常模式：文字按钮
                  <button
                    onClick={handleFollowClick}
                    disabled={followLoading}
                    className={clsx(
                      "flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 border",
                      artistIsFollowed
                        ? "bg-white/10 border-white/30 text-white/80 hover:bg-white/20"
                        : "bg-transparent border-white/50 text-white hover:border-white hover:scale-105"
                    )}
                  >
                    {followLoading ? (
                      <span className="animate-pulse">...</span>
                    ) : artistIsFollowed ? (
                      "关注中"
                    ) : (
                      "关注"
                    )}
                  </button>
                )
              )}
            </div>
          </motion.div>

          {/* Album Info Section */}
          <motion.div 
            className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm cursor-pointer hover:bg-white/10 transition-colors"
            onClick={handleAlbumClick}
            variants={cardVariants}
          >
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4 flex items-center justify-between">
              <span className="shrink-0">专辑信息</span>
              <FiChevronRight className="text-white/30 flex-shrink-0" size={20} />
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-white/40 mb-1">专辑</p>
                <p className="font-medium">{song.albumName}</p>
              </div>
              <div>
                <p className="text-white/40 mb-1">流派</p>
                <p className="font-medium">{genres}</p>
              </div>
              <div>
                <p className="text-white/40 mb-1">发行日期</p>
                <p className="font-medium">{releaseDate}</p>
              </div>
              {songDetail?.album?.trackCount && (
                <div>
                  <p className="text-white/40 mb-1">专辑曲目</p>
                  <p className="font-medium">{songDetail.album.trackCount} 首</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Song Info Section */}
          <motion.div
            className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm"
            variants={cardVariants}
          >
            <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">歌曲信息</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-white/40 mb-1">演唱</p>
                <p className="font-medium">{artists}</p>
              </div>
              <div>
                <p className="text-white/40 mb-1">作曲</p>
                <p className="font-medium">{composer}</p>
              </div>
              {audioCodec && (
                <div>
                  <p className="text-white/40 mb-1">编码</p>
                  <p className="font-medium">{audioCodec}</p>
                </div>
              )}
              {audioBitrate && (
                <div>
                  <p className="text-white/40 mb-1">码率</p>
                  <p className="font-medium">{audioBitrate}</p>
                </div>
              )}
              {audioSampleRate && (
                <div>
                  <p className="text-white/40 mb-1">采样率</p>
                  <p className="font-medium">{audioSampleRate}</p>
                </div>
              )}
              {audioChannels && (
                <div>
                  <p className="text-white/40 mb-1">声道</p>
                  <p className="font-medium">{audioChannels}</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Label & Copyright Section */}
          {(songDetail?.credits?.recordLabel || songDetail?.credits?.copyright) && (
            <motion.div 
              className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm"
              variants={cardVariants}
            >
              <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">版权信息</h3>
              <div className="space-y-3 text-sm">
                {songDetail?.credits?.recordLabel && (
                  <div>
                    <p className="text-white/40 mb-1">唱片公司</p>
                    <p className="font-medium">{songDetail.credits.recordLabel}</p>
                  </div>
                )}
                {songDetail?.credits?.copyright && (
                  <div>
                    <p className="text-white/40 mb-1">版权</p>
                    <p className="font-medium text-white/70 text-xs">{songDetail.credits.copyright}</p>
                  </div>
                )}
                {songDetail?.isrc && (
                  <div>
                    <p className="text-white/40 mb-1">ISRC</p>
                    <p className="font-medium font-mono text-xs">{songDetail.isrc}</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {metadataSourceSummary && (
            <motion.p
              className="w-full px-1 text-[11px] leading-5 text-white/30"
              variants={cardVariants}
            >
              元数据来源：{metadataSourceSummary}
            </motion.p>
          )}
        </motion.div>
      )}
      </OverlayScrollbarsComponent>
    </motion.div>
  );
});

ArtistSection.displayName = 'ArtistSection';

// Format duration from milliseconds to mm:ss
const formatDuration = (ms: number) => {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// Sortable queue item component
interface SortableQueueItemProps {
  song: any;
  index: number;
  queueIndex: number;
  isCurrentSong: boolean;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent, song: any, queueIndex: number) => void;
}

const SortableQueueItem = ({ song, index, queueIndex, isCurrentSong, onDoubleClick, onContextMenu }: SortableQueueItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${song.id}-${queueIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, song, queueIndex);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-queue-index={queueIndex}
      className={clsx(
        "flex items-center gap-3 p-2 rounded-lg transition-colors group",
        isCurrentSong ? "bg-white/10" : "hover:bg-white/10",
        isDragging && "z-50"
      )}
      onDoubleClick={onDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-white/30 hover:text-white/60 transition-colors"
      >
        <RiDraggable size={16} />
      </div>
      <span className="w-6 text-center text-white/40 text-sm">{index + 1}</span>
      <CachedImage 
        src={getProxiedImageUrl(song.artworkUrl, 80)} 
        alt={song.name} 
        className="w-10 h-10 rounded object-cover"
        songId={song.id}
      />
      <div className="flex-1 min-w-0">
        <h4 className={clsx(
          "font-medium truncate text-sm",
          isCurrentSong && "text-green-400"
        )}>{song.name}</h4>
        <p className="text-xs text-white/60 truncate">
          <ClickableLink
            text={song.artistName}
            href={getArtistHref(song.artistId)}
            className="text-white/60 hover:text-white"
          />
        </p>
      </div>
      <div className="text-xs text-white/40">
        {formatDuration(song.duration)}
      </div>
    </div>
  );
};

// Queue item for drag overlay (non-sortable version)
const QueueItemOverlay = ({ song }: { song: any }) => {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/20 backdrop-blur-sm shadow-lg">
      <div className="p-1 text-white/60">
        <RiDraggable size={16} />
      </div>
      <span className="w-6 text-center text-white/40 text-sm">•</span>
      <CachedImage 
        src={getProxiedImageUrl(song.artworkUrl, 80)} 
        alt={song.name} 
        className="w-10 h-10 rounded object-cover"
        songId={song.id}
      />
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate text-sm">{song.name}</h4>
        <p className="text-xs text-white/60 truncate">{song.artistName}</p>
      </div>
      <div className="text-xs text-white/40">
        {formatDuration(song.duration)}
      </div>
    </div>
  );
};

const QUEUE_PAGE_SIZE = 50; // Number of items to render per page

const QueueSection = ({ queue, currentIndex }: { queue: any[], currentIndex: number }) => {
  const navigate = useNavigate();
  const { reorderQueue, playFromQueue, removeFromQueue, isShuffled } = usePlayerStore();
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(QUEUE_PAGE_SIZE);
  const loaderRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolling, setUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIndexRef = useRef<number>(currentIndex);

  const handleScrollbarMouseEnter = useCallback(() => {
    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = null;
    }
    setShowScrollbar(true);
  }, []);

  const handleScrollbarMouseLeave = useCallback(() => {
    scrollbarTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false);
    }, 1800);
  }, []);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    position: MenuPosition;
    song: any;
    queueIndex: number;
  }>({ isOpen: false, position: { x: 0, y: 0 }, song: null, queueIndex: -1 });

  // Reset display count when queue changes significantly
  useEffect(() => {
    // Ensure current song is always visible
    const minDisplay = Math.min(queue.length, Math.max(QUEUE_PAGE_SIZE, currentIndex + 10));
    if (displayCount < minDisplay) {
      setDisplayCount(minDisplay);
    }
  }, [currentIndex, queue.length]);

  // Handle user scroll - pause auto-scroll temporarily
  const handleScroll = useCallback(() => {
    setUserScrolling(true);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setUserScrolling(false);
    }, 5000); // Resume auto-scroll after 5 seconds of no user interaction
  }, []);

  // Scroll to current song helper
  const scrollToCurrentSong = useCallback((smooth: boolean = true) => {
    if (currentIndex < 0 || !containerRef.current) return;
    
    const container = containerRef.current;
    const currentEl = container.querySelector(`[data-queue-index="${currentIndex}"]`) as HTMLElement;
    
    if (currentEl) {
      // Scroll to position the current song near the top (with some padding)
      const scrollTo = currentEl.offsetTop - 60;
      
      container.scrollTo({
        top: Math.max(0, scrollTo),
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }, [currentIndex]);

  // Scroll to current song on mount (when queue panel opens)
  useEffect(() => {
    // Use a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      scrollToCurrentSong(false); // No animation on initial open
    }, 50);
    return () => clearTimeout(timer);
  }, []); // Empty deps - only run on mount

  // Auto-scroll to current song when it changes
  useEffect(() => {
    // Only auto-scroll when song changes (not on user scroll)
    if (userScrolling || currentIndex < 0) return;
    if (prevIndexRef.current === currentIndex) return;
    
    prevIndexRef.current = currentIndex;
    scrollToCurrentSong(true);
  }, [currentIndex, userScrolling, scrollToCurrentSong]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < queue.length) {
          setDisplayCount(prev => Math.min(prev + QUEUE_PAGE_SIZE, queue.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [displayCount, queue.length]);

  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before starting drag
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Create sortable items with unique IDs (only for displayed items)
  const displayedQueue = queue.slice(0, displayCount);
  const sortableItems = displayedQueue.map((song, idx) => ({
    id: `${song.id}-${idx}`,
    song,
    queueIndex: idx,
  }));
  
  const hasMore = displayCount < queue.length;

  // Find the active song for drag overlay
  const activeSong = activeId 
    ? sortableItems.find(item => item.id === activeId)?.song 
    : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const oldIndex = sortableItems.findIndex(item => item.id === active.id);
      const newIndex = sortableItems.findIndex(item => item.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderQueue(oldIndex, newIndex);
      }
    }
  };

  const handleDoubleClick = (queueIndex: number) => {
    playFromQueue(queueIndex);
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, song: any, queueIndex: number) => {
    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      song,
      queueIndex,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  };

  const handleGoToAlbum = () => {
    if (contextMenu.song?.albumId) {
      navigate(`/album/${contextMenu.song.albumId}`);
    }
    closeContextMenu();
  };

  const handleGoToArtist = () => {
    if (contextMenu.song?.artistId) {
      navigate(`/artist/${contextMenu.song.artistId}`);
    }
    closeContextMenu();
  };

  const handlePlayNext = () => {
    if (contextMenu.song && contextMenu.queueIndex !== currentIndex) {
      // Move the song to play next (right after current song)
      const targetIndex = currentIndex + 1;
      if (contextMenu.queueIndex !== targetIndex) {
        reorderQueue(contextMenu.queueIndex, targetIndex);
      }
    }
    closeContextMenu();
  };

  const handleRemoveFromQueue = () => {
    if (contextMenu.queueIndex >= 0) {
      removeFromQueue(contextMenu.queueIndex);
    }
    closeContextMenu();
  };

  return (
    <motion.div
      layout="position"
      className="h-full px-6 flex flex-col overflow-hidden"
      initial={{ opacity: 0, x: 26, scale: 0.99 }}
      animate={{ opacity: 1, x: 0, scale: 1, transition: { duration: 0.28, ease: 'easeOut' } }}
      exit={{ opacity: 0, x: 14, transition: { duration: 0.2, ease: 'easeInOut' } }}
    >
      {/* Header with shuffle indicator */}
      <motion.div 
        className="flex items-center justify-between mb-4"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0, transition: { delay: 0.05, duration: 0.2 } }}
      >
        <h3 className="text-sm font-semibold text-white/60">
          播放队列 ({queue.length})
        </h3>
        {isShuffled && (
          <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded">
            随机播放
          </span>
        )}
      </motion.div>

      {queue.length === 0 ? (
        <motion.div 
          className="flex-1 flex items-center justify-center text-white/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2 } }}
        >
          队列为空
        </motion.div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <motion.div
            className="flex-1 min-h-0 overflow-hidden"
            layout="position"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.2 } }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.18 } }}
          >
            <OverlayScrollbarsComponent
              className={`h-full ${showScrollbar ? 'scrollbar-visible' : ''}`}
              onMouseEnter={handleScrollbarMouseEnter}
              onMouseLeave={handleScrollbarMouseLeave}
              options={{ 
                scrollbars: { 
                  theme: 'os-theme-light',
                  autoHide: 'move',
                  clickScroll: true
                } 
              }}
              events={{
                initialized: (instance) => {
                  (containerRef as any).current = instance.elements().viewport;
                },
                scroll: () => {
                  handleScroll();
                }
              }}
            >
              <div className="space-y-1 pb-4">
                <SortableContext
                  items={sortableItems.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortableItems.map((item, displayIndex) => (
                    <SortableQueueItem
                      key={item.id}
                      song={item.song}
                      index={displayIndex}
                      queueIndex={item.queueIndex}
                      isCurrentSong={item.queueIndex === currentIndex}
                      onDoubleClick={() => handleDoubleClick(item.queueIndex)}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                </SortableContext>
                {/* Load more trigger */}
                {hasMore && (
                  <div ref={loaderRef} className="py-4 text-center">
                    <span className="text-white/30 text-xs">
                      已显示 {displayCount} / {queue.length} 首
                    </span>
                  </div>
                )}
              </div>
            </OverlayScrollbarsComponent>
          </motion.div>
          <DragOverlay>
            {activeSong ? <QueueItemOverlay song={activeSong} /> : null}
          </DragOverlay>
        </DndContext>
      )}
      
      {/* Context Menu */}
      <ContextMenu 
        isOpen={contextMenu.isOpen} 
        position={contextMenu.position} 
        onClose={closeContextMenu}
      >
        <MenuItem
          icon={<IoPlaySkipForward />}
          label="插播"
          onClick={handlePlayNext}
          disabled={contextMenu.queueIndex === currentIndex}
        />
        
        <MenuDivider />
        
        <MenuItem
          icon={<IoPerson />}
          label="转至艺术家"
          onClick={handleGoToArtist}
          disabled={!contextMenu.song?.artistId}
        />
        <MenuItem
          icon={<IoDisc />}
          label="转至专辑"
          onClick={handleGoToAlbum}
          disabled={!contextMenu.song?.albumId}
        />
        
        <MenuDivider />
        
        <MenuItem
          icon={<IoTrash />}
          label="从播放队列中删除"
          onClick={handleRemoveFromQueue}
          danger
        />
      </ContextMenu>
    </motion.div>
  );
};

export default NowPlayingView;
