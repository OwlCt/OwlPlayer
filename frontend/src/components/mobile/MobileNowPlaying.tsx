import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { useNavigate } from "react-router-dom";
import { motion, usePresence, AnimatePresence } from "framer-motion";
import {
  FiChevronDown,
  FiPlay,
  FiPause,
  FiSkipBack,
  FiSkipForward,
  FiRepeat,
  FiMoreHorizontal,
} from "react-icons/fi";
import { HiOutlineQueueList } from "react-icons/hi2";
import { TbMicrophone2 } from "react-icons/tb";
import { usePlayerStore } from "../../store/playerStore";
import type { AlbumDetail, SongDetail } from "../../types";
import { ShuffleButton } from "../ShuffleButton";
import { getProxiedImageUrl } from "../../utils/image";
import { getAlbumDetail, getSongDetail } from "../../api";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { offlineCacheService } from "../../services/offlineCacheService";
import { getCacheFirstArtworkUrl } from "../../utils/cacheFirstImage";
import CachedImage from "../CachedImage";
import MotionArtwork from "../MotionArtwork";
import ScrollingText from "../ScrollingText";
import { useArtworkColor } from "../../hooks/useArtworkColor";
import MobileSongMenu from "./MobileSongMenu";
import MobileQueueSheet from "./MobileQueueSheet";
import MobileLyricsPage from "./MobileLyricsPage";
import { LikeButton } from "../LikeButton";
import { MobileDebugPanel, useDebugTrigger } from "./MobileDebugPanel";
import { getSongDetailFromCache } from "../../utils/offlineCacheConverter";
import { useOfflineCacheStore } from "../../store/offlineCacheStore";
import { resolveNowPlayingSongData } from "../../utils/nowPlayingDetails";
import { getManagedAudioSourceUrl } from "../../utils/audioElementSource";
import { getPlatformInfo } from "../../utils/audioSession";
import {
  resolvePlaybackOriginalSourceSummaryLabel,
  resolvePlaybackSummaryLabel,
} from "../../utils/playbackQuality";

/**
 * Validates that the Now Playing artwork is displayed large and centered.
 * Returns true if artwork dimensions meet the requirements.
 *
 * @param artworkSize - The size of the artwork in pixels
 * @param containerWidth - The width of the container
 * @returns boolean - true if artwork is large (>= 60% of container) and centered
 */
export function isArtworkLargeAndCentered(
  artworkSize: number,
  containerWidth: number,
): boolean {
  // Artwork should be at least 60% of container width to be considered "large"
  const minSizeRatio = 0.6;
  return artworkSize >= containerWidth * minSizeRatio;
}

/**
 * Validates that a touch target meets the minimum size requirement.
 * Per Apple HIG and Material Design, minimum touch target should be 44px.
 *
 * @param width - The width of the touch target in pixels
 * @param height - The height of the touch target in pixels
 * @returns boolean - true if both dimensions are >= 44px
 */
export function isTouchTargetValid(width: number, height: number): boolean {
  const MIN_TOUCH_TARGET = 44;
  return width >= MIN_TOUCH_TARGET && height >= MIN_TOUCH_TARGET;
}

/**
 * Formats time in seconds to mm:ss format
 */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

interface MobileNowPlayingProps {
  onClose?: () => void;
  className?: string;
}

const mobileSongDetailCache = new Map<string, SongDetail | null>();
const mobileAlbumDetailCache = new Map<string, AlbumDetail | null>();

/**
 * MobileNowPlaying component - Full-screen now playing view for mobile.
 * Displays large album artwork, playback controls, and progress bar.
 * Supports swipe down to minimize gesture.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export default function MobileNowPlaying({
  onClose,
  className = "",
}: MobileNowPlayingProps) {
  const [isPresent, safeToRemove] = usePresence();

  // Lock body scroll when Now Playing is open to prevent background scrolling
  useEffect(() => {
    // Save current overflow style
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    // Lock scrolling
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      // Restore original styles
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, []);

  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    playMode,
    isShuffled,
    togglePlay,
    next,
    previous,
    seek,
    togglePlayMode,
    toggleShuffle,
    toggleLyricsVisibility,
    lyricsVisible,
    queueSource,
    audioRef,
    iosHlsQuality,
    desktopTranscodeQuality,
  } = usePlayerStore();

  const navigate = useNavigate();

  // Debug panel state - 长按播放按钮 3 秒打开
  const { isDebugOpen, closeDebug } = useDebugTrigger();
  const [debugOpen, setDebugOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlayButtonLongPressStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setDebugOpen(true);
    }, 3000); // 长按 3 秒
  }, []);

  const handlePlayButtonLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Progress bar touch scrubbing state
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);

  // Swipe gesture state
  const [dragY, setDragY] = useState(0);

  // Song menu state
  const [menuOpen, setMenuOpen] = useState(false);

  // Queue sheet state
  const [queueOpen, setQueueOpen] = useState(false);

  // Lyrics view state (Requirement 1.1)
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [showOriginalPlaybackSummary, setShowOriginalPlaybackSummary] =
    useState(false);

  // Dynamic cover state
  const [songDetail, setSongDetail] = useState<SongDetail | null>(null);
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [lastAlbumId, setLastAlbumId] = useState<string | undefined>();
  const [cachedMotionVideoUrl, setCachedMotionVideoUrl] = useState<
    string | undefined
  >();

  // Background image URL for offline support
  const [backgroundUrl, setBackgroundUrl] = useState<string>("");

  // Online status for offline mode support
  const { isOnline } = useOnlineStatus();
  const { cachedSongIds } = useOfflineCacheStore();
  const platform = getPlatformInfo().platform;

  const resolvedNowPlaying = useMemo(() => {
    if (!currentSong) {
      return null;
    }
    return resolveNowPlayingSongData(currentSong, songDetail, albumDetail);
  }, [currentSong, songDetail, albumDetail]);

  const displaySong = resolvedNowPlaying?.song ?? currentSong;
  const effectiveArtworkUrl =
    resolvedNowPlaying?.artworkUrl ?? currentSong?.artworkUrl ?? "";
  const effectiveMotionTallVideoUrl = resolvedNowPlaying?.motionTallVideoUrl;
  const effectiveMotionVideoUrl =
    cachedMotionVideoUrl || resolvedNowPlaying?.motionVideoUrl;
  const playbackSummarySourceUrl =
    (audioRef &&
      (getManagedAudioSourceUrl(audioRef) ||
        audioRef.currentSrc ||
        audioRef.src)) ||
    null;
  const playbackQualitySummary = useMemo(() => {
    return resolvePlaybackSummaryLabel({
      sourceUrl: playbackSummarySourceUrl,
      platform,
      desktopTranscodeQuality,
      iosHlsQuality,
      audioInfo: songDetail?.audioInfo,
    });
  }, [
    desktopTranscodeQuality,
    iosHlsQuality,
    platform,
    playbackSummarySourceUrl,
    songDetail?.audioInfo,
  ]);
  const originalPlaybackSummary = useMemo(() => {
    return resolvePlaybackOriginalSourceSummaryLabel({
      sourceUrl: playbackSummarySourceUrl,
      platform,
      desktopTranscodeQuality,
      iosHlsQuality,
      audioInfo: songDetail?.audioInfo,
    });
  }, [
    desktopTranscodeQuality,
    iosHlsQuality,
    platform,
    playbackSummarySourceUrl,
    songDetail?.audioInfo,
  ]);
  const visiblePlaybackSummary =
    showOriginalPlaybackSummary && originalPlaybackSummary
      ? originalPlaybackSummary
      : playbackQualitySummary;

  useEffect(() => {
    setShowOriginalPlaybackSummary(false);
  }, [displaySong?.id]);

  useEffect(() => {
    if (!originalPlaybackSummary && showOriginalPlaybackSummary) {
      setShowOriginalPlaybackSummary(false);
    }
  }, [originalPlaybackSummary, showOriginalPlaybackSummary]);

  const togglePlaybackSummary = useCallback(() => {
    if (!originalPlaybackSummary) {
      return;
    }

    setShowOriginalPlaybackSummary((current) => !current);
  }, [originalPlaybackSummary]);

  const playbackSummaryIsInteractive = Boolean(originalPlaybackSummary);

  const playbackQualitySummaryNode = visiblePlaybackSummary ? (
    playbackSummaryIsInteractive ? (
      <button
        type="button"
        onClick={togglePlaybackSummary}
        className="mt-1 block truncate text-left text-sm text-white/50 transition-colors hover:text-white/70"
        aria-label="切换播放格式摘要"
      >
        {visiblePlaybackSummary}
      </button>
    ) : (
      <div className="mt-1 text-sm text-white/50 truncate">
        {visiblePlaybackSummary}
      </div>
    )
  ) : null;

  // Load background image URL with cache-first support for offline mode
  useEffect(() => {
    if (!currentSong || !effectiveArtworkUrl) {
      setBackgroundUrl("");
      return;
    }

    const loadBackgroundUrl = async () => {
      const fallbackUrl = getProxiedImageUrl(effectiveArtworkUrl, 400);
      const url = await getCacheFirstArtworkUrl(currentSong.id, fallbackUrl);
      setBackgroundUrl(url);
    };

    loadBackgroundUrl();
  }, [currentSong?.id, effectiveArtworkUrl]);

  useEffect(() => {
    if (!currentSong) {
      setSongDetail(null);
      return;
    }

    const cachedDetail = mobileSongDetailCache.get(currentSong.id) ?? null;
    setSongDetail(cachedDetail);

    let cancelled = false;
    const fetchNowPlayingSongDetail = async () => {
      try {
        if (!isOnline && cachedSongIds.has(currentSong.id)) {
          const cached = await getSongDetailFromCache(currentSong.id);
          if (!cancelled && cached?.songDetail) {
            mobileSongDetailCache.set(
              currentSong.id,
              cached.songDetail as SongDetail,
            );
            setSongDetail(cached.songDetail as SongDetail);
          }
          return;
        }

        if (!isOnline) {
          return;
        }

        const detail = await getSongDetail(currentSong.id);
        if (!cancelled) {
          mobileSongDetailCache.set(currentSong.id, detail);
          setSongDetail(detail);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load mobile now playing song detail", error);
        }
      }
    };

    fetchNowPlayingSongDetail();
    return () => {
      cancelled = true;
    };
  }, [currentSong, isOnline, cachedSongIds]);

  // Fetch album detail for dynamic cover and resolved album artwork when song changes
  useEffect(() => {
    const albumId = currentSong?.albumId;
    if (!albumId) {
      setAlbumDetail(null);
      setLastAlbumId(undefined);
      if (cachedMotionVideoUrl) {
        URL.revokeObjectURL(cachedMotionVideoUrl);
        setCachedMotionVideoUrl(undefined);
      }
      return;
    }
    if (albumId === lastAlbumId) return;

    setLastAlbumId(albumId);
    setAlbumDetail(mobileAlbumDetailCache.get(albumId) ?? null);

    // Revoke previous cached motion video URL
    if (cachedMotionVideoUrl) {
      URL.revokeObjectURL(cachedMotionVideoUrl);
      setCachedMotionVideoUrl(undefined);
    }

    if (isOnline) {
      // Online: fetch from API
      getAlbumDetail(albumId)
        .then((album) => {
          mobileAlbumDetailCache.set(albumId, album);
          setAlbumDetail(album);
        })
        .catch(() => {
          // Silently fail - just use static artwork
        });
    } else {
      // Offline: try to load motion video from cache
      offlineCacheService
        .getCachedMotionVideo(albumId)
        .then((cachedVideo) => {
          if (cachedVideo) {
            const blobUrl = URL.createObjectURL(cachedVideo.video);
            setCachedMotionVideoUrl(blobUrl);
          }
        })
        .catch(() => {
          // Silently fail - just use static artwork
        });
    }
  }, [currentSong?.albumId, lastAlbumId, isOnline]);

  // Cleanup cached motion video URL on unmount
  useEffect(() => {
    return () => {
      if (cachedMotionVideoUrl) {
        URL.revokeObjectURL(cachedMotionVideoUrl);
      }
    };
  }, [cachedMotionVideoUrl]);

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const displayProgress = isScrubbing ? scrubPosition : progressPercent;

  // Extract colors from artwork
  const artworkColors = useArtworkColor(
    effectiveArtworkUrl || currentSong?.artworkUrl,
  );

  // Progress bar touch handlers (Requirement 7.4)
  const handleProgressTouch = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!progressBarRef.current || duration <= 0) return;

      const rect = progressBarRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

      setScrubPosition(percent);
      setIsScrubbing(true);
    },
    [duration],
  );

  const handleProgressMove = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      if (!isScrubbing || !progressBarRef.current) return;

      const rect = progressBarRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const x = clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));

      setScrubPosition(percent);
    },
    [isScrubbing],
  );

  const handleProgressEnd = useCallback(() => {
    if (isScrubbing && duration > 0) {
      const newTime = (scrubPosition / 100) * duration;
      seek(newTime);
    }
    setIsScrubbing(false);
  }, [isScrubbing, scrubPosition, duration, seek]);

  // Get play mode icon
  const getPlayModeIcon = () => {
    switch (playMode) {
      case "single":
        return (
          <div className="relative">
            <FiRepeat size={22} />
            <span className="absolute -top-1 -right-1 text-[10px] font-bold">
              1
            </span>
          </div>
        );
      case "loop":
        return <FiRepeat size={22} />;
      default:
        return <FiRepeat size={22} />;
    }
  };

  // Spring config for smooth slide up/down
  const springConfig = {
    type: "spring",
    damping: 30,
    stiffness: 300,
    mass: 0.8,
  };

  // Header swipe down to close with follow-finger effect
  const headerTouchStartY = useRef<number | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

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

  const handleHeaderTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (headerTouchStartY.current === null) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchEndY - headerTouchStartY.current;

      // If swiped down more than 100px, trigger close
      if (deltaY > 100) {
        onClose?.();
      } else {
        // Spring back
        setDragOffsetY(0);
      }

      setIsDragging(false);
      headerTouchStartY.current = null;
    },
    [onClose],
  );

  if (!currentSong) return null;

  return (
    <motion.div
      className={`fixed inset-0 z-[100] flex flex-col safe-area-all ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, y: dragOffsetY }}
      exit={{ opacity: 0, y: "100%" }}
      transition={isDragging ? { duration: 0 } : springConfig}
      onAnimationComplete={() => !isPresent && safeToRemove?.()}
      style={{
        willChange: "transform",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
        overflow: "hidden",
      }}
      data-testid="mobile-now-playing"
    >
      {/* Sliding Background Panel - Provides the "Sheet" effect */}
      <motion.div
        className="absolute inset-0 z-0 transition-colors duration-700"
        style={{ backgroundColor: artworkColors.darkMuted }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={springConfig}
      >
        {/* Blurred Background Image - only for non-tall video */}
        {!effectiveMotionTallVideoUrl && (
          <div
            className="absolute inset-0 z-0 opacity-60"
            style={{
              backgroundImage: backgroundUrl
                ? `url(${backgroundUrl})`
                : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(80px) saturate(1.5)",
              transform: "translateZ(0)",
            }}
          />
        )}

        {/* Gradient Overlay - extends to safe area top for seamless look */}
        {!effectiveMotionTallVideoUrl && (
          <div
            className="absolute inset-0 z-0 transition-colors duration-700"
            style={{
              top: 0, // 从顶部开始，包含状态栏区域
              background: `linear-gradient(to bottom, ${artworkColors.darkMuted}66 0%, ${artworkColors.darkMuted}99 50%, ${artworkColors.darkMuted} 100%)`,
            }}
          />
        )}
      </motion.div>

      {/* Tall motion video - full screen from top, behind header */}
      {effectiveMotionTallVideoUrl && (
        <div className="absolute inset-0 z-[1]">
          {/* Full-screen motion video */}
          <div className="absolute top-0 left-0 right-0 h-[520px] overflow-hidden">
            <MotionArtwork
              videoUrl={isPresent ? effectiveMotionTallVideoUrl : undefined}
              fallbackImage={
                effectiveArtworkUrl
                  ? getProxiedImageUrl(effectiveArtworkUrl, 600)
                  : undefined
              }
              alt={displaySong?.name}
              quality="high"
              songId={currentSong.id}
            />
          </div>
          {/* Gradient overlay for smooth transition */}
          <div
            className="absolute top-[380px] left-0 right-0 h-[140px] pointer-events-none transition-colors duration-700"
            style={{
              background: `linear-gradient(to bottom, transparent 0%, ${artworkColors.darkMuted} 100%)`,
            }}
          />
          {/* Color fill below video */}
          <div
            className="absolute top-[520px] left-0 right-0 bottom-0 transition-colors duration-700"
            style={{ backgroundColor: artworkColors.darkMuted }}
          />
        </div>
      )}

      {/* Swipe down to close overlay - covers area below header and above song title */}
      <div
        className="absolute left-0 right-0 z-[15]"
        style={{ top: "60px", bottom: "320px" }}
        onTouchStart={handleHeaderTouchStart}
        onTouchMove={handleHeaderTouchMove}
        onTouchEnd={handleHeaderTouchEnd}
      />

      {/* Header - Transparent overlay for tall video, normal for others */}
      <motion.div
        className={`relative z-[25] flex items-center justify-between px-4 py-2 -mt-2 ${
          effectiveMotionTallVideoUrl ? "" : ""
        }`}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onTouchStart={handleHeaderTouchStart}
        onTouchMove={handleHeaderTouchMove}
        onTouchEnd={handleHeaderTouchEnd}
        style={{
          // Add text shadow for better visibility on dynamic covers
          textShadow: "0 1px 3px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        <button
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center text-white/80 drop-shadow-lg"
          aria-label="关闭"
          data-testid="now-playing-close"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
        >
          <FiChevronDown size={28} />
        </button>

        <div className="flex-1 text-center min-w-0 px-4 max-w-[70%]">
          {(() => {
            // Determine display text and navigation based on queue source (same logic as desktop)
            const getSourceInfo = () => {
              if (!queueSource || !queueSource.type) {
                return {
                  text: displaySong.albumName || "正在播放",
                  href: displaySong.albumId
                    ? `/album/${displaySong.albumId}`
                    : null,
                };
              }
              switch (queueSource.type) {
                case "playlist":
                  return {
                    text: queueSource.name || "播放列表",
                    href: queueSource.id ? `/playlist/${queueSource.id}` : null,
                  };
                case "album":
                  return {
                    text: queueSource.name || displaySong.albumName,
                    href: queueSource.id
                      ? `/album/${queueSource.id}`
                      : displaySong.albumId
                        ? `/album/${displaySong.albumId}`
                        : null,
                  };
                case "artist":
                  return {
                    text: queueSource.name || displaySong.artistName,
                    href: queueSource.id
                      ? `/artist/${queueSource.id}`
                      : displaySong.artistId
                        ? `/artist/${displaySong.artistId}`
                        : null,
                  };
                case "liked-songs":
                  return { text: "已点赞的歌曲", href: "/liked-songs" };
                case "search":
                  return { text: "搜索结果", href: null };
                case "single":
                  return {
                    text: displaySong.albumName || "正在播放",
                    href: displaySong.albumId
                      ? `/album/${displaySong.albumId}`
                      : null,
                  };
                default:
                  return {
                    text: displaySong.albumName || "正在播放",
                    href: displaySong.albumId
                      ? `/album/${displaySong.albumId}`
                      : null,
                  };
              }
            };
            const sourceInfo = getSourceInfo();
            return (
              <ScrollingText
                text={sourceInfo.text}
                className="text-sm font-medium text-white/80 uppercase tracking-wider"
                onClick={
                  sourceInfo.href
                    ? () => {
                        onClose?.();
                        navigate(sourceInfo.href!);
                      }
                    : undefined
                }
              />
            );
          })()}
        </div>

        <button
          onClick={() => setMenuOpen(true)}
          className="w-11 h-11 flex items-center justify-center text-white/80"
          aria-label="更多选项"
          data-testid="now-playing-more"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
        >
          <FiMoreHorizontal size={24} />
        </button>
      </motion.div>

      {/* Main content - Artwork (Requirement 7.1) */}
      {/* For tall motion video, this is just a spacer; for others, show artwork */}
      {effectiveMotionTallVideoUrl ? (
        /* Spacer for tall motion video - video is shown as absolute positioned background */
        <div className="relative z-10 flex-1" style={{ minHeight: "300px" }} />
      ) : (
        /* Standard centered artwork for square motion video or static image */
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-8">
          {/* Large centered album artwork */}
          {/* layoutId animation independent of background slide */}
          <motion.div
            className="w-full max-w-[320px] aspect-square rounded-lg shadow-2xl overflow-hidden"
            layoutId="mini-player-artwork"
            transition={springConfig}
            style={{
              willChange: "transform",
              transformOrigin: "center center",
              backfaceVisibility: "hidden",
              WebkitBackfaceVisibility: "hidden",
              borderRadius: "8px",
            }}
            data-testid="now-playing-artwork"
          >
            {effectiveMotionVideoUrl ? (
              /* Square motion video */
              <MotionArtwork
                videoUrl={isPresent ? effectiveMotionVideoUrl : undefined}
                fallbackImage={
                  effectiveArtworkUrl
                    ? getProxiedImageUrl(effectiveArtworkUrl, 640)
                    : undefined
                }
                alt={displaySong?.name}
                quality="high"
                songId={currentSong.id}
              />
            ) : effectiveArtworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(effectiveArtworkUrl, 640)}
                alt={displaySong?.name}
                className="w-full h-full object-cover"
                songId={currentSong.id}
              />
            ) : (
              <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/40 text-6xl">
                ♪
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Song info and controls - Slide Up with Background */}
      <motion.div
        className="relative z-10 px-6 pb-4"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={springConfig}
      >
        {/* Song title and artist with like button */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <ScrollingText
              text={displaySong.name || "未知歌曲"}
              className="text-xl font-bold text-white mb-1"
            />
            <ScrollingText
              text={displaySong.artistName || "未知艺术家"}
              className="text-base text-white/70"
              onClick={
                displaySong.artistId
                  ? () => {
                      onClose?.();
                      navigate(`/artist/${displaySong.artistId}`);
                    }
                  : undefined
              }
            />
            {playbackQualitySummaryNode}
          </div>
          <LikeButton song={displaySong} size="md" showOnHover={false} />
        </div>

        {/* Progress bar with touch scrubbing (Requirement 7.4) */}
        <div className="mb-4">
          {/* Enlarged touch area wrapper - 44px height for better touch target */}
          <div
            ref={progressBarRef}
            className="relative h-11 flex items-center cursor-pointer touch-none"
            onTouchStart={handleProgressTouch}
            onTouchMove={handleProgressMove}
            onTouchEnd={handleProgressEnd}
            onMouseDown={handleProgressTouch}
            onMouseMove={handleProgressMove}
            onMouseUp={handleProgressEnd}
            onMouseLeave={handleProgressEnd}
            data-testid="now-playing-progress"
          >
            {/* Visual progress track - use transform for better mobile performance */}
            <div className="absolute left-0 right-0 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full w-full bg-white rounded-full origin-left"
                style={{
                  transform: `scaleX(${displayProgress / 100})`,
                  transition: isScrubbing ? "none" : "transform 100ms linear",
                  willChange: "transform",
                }}
              />
            </div>
            {/* Scrubber thumb - positioned using left percentage */}
            <div
              className="absolute top-1/2 w-4 h-4 bg-white rounded-full shadow-lg -translate-y-1/2"
              style={{
                left: `${displayProgress}%`,
                marginLeft: "-8px",
                transform: `translateY(-50%) scale(${isScrubbing ? 1.3 : 1})`,
                transition: isScrubbing
                  ? "none"
                  : "left 100ms linear, transform 100ms linear",
                willChange: "left, transform",
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/60">
            <span>
              {formatTime(
                isScrubbing ? (scrubPosition / 100) * duration : progress,
              )}
            </span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback controls with 44px minimum touch targets (Requirement 7.2) */}
        <div className="flex items-center justify-between mb-6">
          {/* Shuffle button - reuse web component */}
          <ShuffleButton
            isActive={isShuffled}
            onClick={toggleShuffle}
            size="md"
            disableHover
          />

          {/* Previous button */}
          <button
            onClick={previous}
            className="w-12 h-12 flex items-center justify-center text-white"
            aria-label="上一首"
            data-testid="now-playing-previous"
          >
            <FiSkipBack size={28} fill="currentColor" />
          </button>

          {/* Play/Pause button - larger for primary action */}
          {/* 长按 3 秒打开调试面板 */}
          <button
            onClick={togglePlay}
            onTouchStart={handlePlayButtonLongPressStart}
            onTouchEnd={handlePlayButtonLongPressEnd}
            onTouchCancel={handlePlayButtonLongPressEnd}
            onMouseDown={handlePlayButtonLongPressStart}
            onMouseUp={handlePlayButtonLongPressEnd}
            onMouseLeave={handlePlayButtonLongPressEnd}
            className="w-16 h-16 flex items-center justify-center bg-white rounded-full text-black active:scale-95 transition-transform"
            aria-label={isPlaying ? "暂停" : "播放"}
            data-testid="now-playing-play-pause"
          >
            {isPlaying ? (
              <FiPause size={32} fill="currentColor" />
            ) : (
              <FiPlay size={32} fill="currentColor" className="ml-1" />
            )}
          </button>

          {/* Next button */}
          <button
            onClick={next}
            className="w-12 h-12 flex items-center justify-center text-white"
            aria-label="下一首"
            data-testid="now-playing-next"
          >
            <FiSkipForward size={28} fill="currentColor" />
          </button>

          {/* Play mode button */}
          <button
            onClick={togglePlayMode}
            className={`w-11 h-11 flex items-center justify-center ${
              playMode !== "sequential" ? "text-green-500" : "text-white/60"
            }`}
            aria-label={
              playMode === "single"
                ? "单曲循环"
                : playMode === "loop"
                  ? "列表循环"
                  : "顺序播放"
            }
            data-testid="now-playing-repeat"
          >
            {getPlayModeIcon()}
          </button>
        </div>

        {/* Bottom action buttons - Lyrics and Queue */}
        <div className="flex items-center justify-between pb-2">
          {/* Lyrics button - opens MobileLyricsPage (Requirement 1.1, 2.2) */}
          <button
            onClick={() => setLyricsOpen(true)}
            className={`w-11 h-11 flex items-center justify-center ${
              lyricsOpen ? "text-green-500" : "text-white/60"
            }`}
            aria-label="歌词"
            data-testid="now-playing-lyrics"
          >
            <TbMicrophone2 size={24} />
          </button>

          {/* Queue button */}
          <button
            onClick={() => setQueueOpen(true)}
            className="w-11 h-11 flex items-center justify-center text-white/60"
            aria-label="播放队列"
            data-testid="now-playing-queue"
          >
            <HiOutlineQueueList size={24} />
          </button>
        </div>
      </motion.div>

      {/* Song context menu */}
      <MobileSongMenu
        song={displaySong}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        pageContext="now-playing"
      />

      {/* Queue sheet */}
      <MobileQueueSheet
        isOpen={queueOpen}
        onClose={() => setQueueOpen(false)}
      />

      {/* Lyrics view (Requirement 1.1) */}
      <AnimatePresence>
        {lyricsOpen && (
          <MobileLyricsPage onClose={() => setLyricsOpen(false)} />
        )}
      </AnimatePresence>

      {/* Debug panel - 长按播放按钮 3 秒打开 */}
      <MobileDebugPanel
        isOpen={debugOpen || isDebugOpen}
        onClose={() => {
          setDebugOpen(false);
          closeDebug();
        }}
      />
    </motion.div>
  );
}
