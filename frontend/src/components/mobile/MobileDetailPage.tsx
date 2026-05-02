import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FiPlay, FiPause, FiHeart, FiMoreHorizontal } from "react-icons/fi";
import { IoVideocam } from "react-icons/io5";
import { useGoBack } from "../../hooks/useNavigationHistory";
import { useBottomPadding } from "../../hooks/useBottomPadding";
import { Song, Album, AlbumDetail } from "../../types";
import { ShuffleButton } from "../ShuffleButton";
import {
  getAlbumDetail,
  getPlaylist,
  getAlbumOtherVersions,
  getAlbumMoreByArtist,
  AlbumVersion,
  AlbumRelatedResult,
  OfflineModeError,
} from "../../api";
import ScrollableCardRow from "../ScrollableCardRow";
import AlbumCard from "../AlbumCard";
import {
  useLikedSongsStore,
  likedSongToSong,
  LikedSong,
} from "../../store/likedSongsStore";
import { usePlayerStore, QueueSource } from "../../store/playerStore";
import { useRecentlyPlayedStore } from "../../store/recentlyPlayedStore";
import { useAuthStore } from "../../store/authStore";
import { useToastStore } from "../../store/toastStore";
import { getProxiedImageUrl } from "../../utils/image";
import { extractDominantColor } from "../../utils/colorExtractor";
import CachedImage from "../CachedImage";
import MotionArtwork from "../MotionArtwork";
import MobileSongMenu from "./MobileSongMenu";
import MobileAlbumMenu from "./MobileAlbumMenu";
import MobilePlaylistMenu from "./MobilePlaylistMenu";
import {
  MobileAlbumDownloadButton,
  MobilePlaylistDownloadButton,
} from "./MobileDownloadButton";
import { AlbumSaveButton } from "../AlbumSaveButton";
import { LikeButton } from "../LikeButton";
import {
  MiniDownloadedIcon,
  MiniDownloadingIcon,
} from "../CacheStatusIndicator";
import { MobileNowPlayingIcon } from "../icons/MobileNowPlayingIcon";
import { useOfflineCacheStore } from "../../store/offlineCacheStore";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import {
  offlineCacheService,
  CachedSong,
} from "../../services/offlineCacheService";
import {
  convertCachedAlbumToAlbumDetail,
  convertCachedPlaylistToPlaylist,
  revokeObjectUrls,
} from "../../utils/offlineCacheConverter";
import MobileHeader from "./MobileHeader";
import { isTapGesture } from "../../hooks/useTouchClick";
import OfflineFallback from "../OfflineFallback";
import {
  getLocalAlbumRelatedShelves,
  isLocalAlbumDetail,
  LOCAL_RELATED_ALBUM_PREVIEW_LIMIT,
} from "../../utils/albumLocalRelatedContent";

/**
 * Detail page variant type
 */
export type DetailPageVariant = "album" | "playlist" | "liked";

const EMPTY_RELATED_RESULT: AlbumRelatedResult = { albums: [], hasMore: false };
const LIKED_SONGS_COLLECTION_ID = "liked-songs";

/**
 * Hero section display info for property testing
 * **Feature: spotify-mobile-ui, Property 10: Detail Page Hero Section**
 * **Validates: Requirements 6.1**
 */
export interface HeroSectionInfo {
  hasArtwork: boolean;
  hasTitle: boolean;
  hasMetadata: boolean;
  artworkUrl?: string;
  title: string;
  metadata: string;
}

/**
 * Extract hero section information from detail page data
 * Used for property testing to verify hero section contains required elements
 */
export function getHeroSectionInfo(
  variant: DetailPageVariant,
  data: {
    name: string;
    artworkUrl?: string;
    artistName?: string;
    trackCount?: number;
  },
): HeroSectionInfo {
  const metadata =
    variant === "album"
      ? `${data.artistName || "未知艺术家"} · ${data.trackCount || 0} 首歌曲`
      : `${data.trackCount || 0} 首歌曲`;

  return {
    hasArtwork:
      data.artworkUrl !== undefined &&
      data.artworkUrl !== null &&
      data.artworkUrl !== "",
    hasTitle:
      data.name !== undefined && data.name !== null && data.name.trim() !== "",
    hasMetadata: metadata.trim() !== "",
    artworkUrl: data.artworkUrl,
    title: data.name,
    metadata,
  };
}

/**
 * Track tap handler result for property testing
 * **Feature: spotify-mobile-ui, Property 11: Track Playback on Tap**
 * **Validates: Requirements 6.3**
 */
export interface TrackTapResult {
  trackId: string;
  shouldStartPlayback: boolean;
  queueIndex: number;
}

/**
 * Simulate track tap and return expected result
 * Used for property testing to verify track playback behavior
 */
export function simulateTrackTap(
  tracks: Song[],
  tappedIndex: number,
): TrackTapResult {
  if (tappedIndex < 0 || tappedIndex >= tracks.length) {
    return {
      trackId: "",
      shouldStartPlayback: false,
      queueIndex: -1,
    };
  }

  return {
    trackId: tracks[tappedIndex].id,
    shouldStartPlayback: true,
    queueIndex: tappedIndex,
  };
}

interface ResolveSongCachedForDetailRowInput {
  songId: string;
  variant: DetailPageVariant;
  collectionId?: string;
  cachedSongIds: Set<string>;
  isSongCachedForAlbum: (songId: string, albumId: string) => boolean;
  isSongCachedForPlaylist: (songId: string, playlistId: string) => boolean;
}

export function resolveSongCachedForDetailRow({
  songId,
  variant,
  collectionId,
  cachedSongIds,
  isSongCachedForAlbum,
  isSongCachedForPlaylist,
}: ResolveSongCachedForDetailRowInput): boolean {
  if (variant === "album" && collectionId) {
    return isSongCachedForAlbum(songId, collectionId);
  }

  if (variant === "playlist" && collectionId) {
    return isSongCachedForPlaylist(songId, collectionId);
  }

  if (variant === "liked") {
    return isSongCachedForPlaylist(songId, LIKED_SONGS_COLLECTION_ID);
  }

  return cachedSongIds.has(songId);
}

/**
 * Props for MobileDetailPage
 */
interface MobileDetailPageProps {
  variant: DetailPageVariant;
  id?: string;
}

/**
 * MobileTrackRow component
 * Touch-optimized track row with minimum 44px height
 * Requirements: 6.2, 6.3
 */
interface MobileTrackRowProps {
  track: Song;
  index: number;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  onTap: () => void;
  onLongPress: () => void;
  showArtwork?: boolean; // Show album artwork on the left
  secondaryText?: string;
  isCached?: boolean; // Whether the track is cached for offline playback
  isDownloading?: boolean; // Whether the track is currently being downloaded
  downloadProgress?: number; // Download progress percentage (0-100)
  isMV?: boolean; // Whether the track is a music video
  onMVClick?: () => void; // Callback when MV track is clicked
}

export function MobileTrackRow({
  track,
  index: _index,
  isPlaying,
  isCurrentTrack,
  onTap,
  onLongPress,
  showArtwork = false,
  secondaryText,
  isCached = false,
  isDownloading = false,
  downloadProgress = 0,
  isMV = false,
  onMVClick,
}: MobileTrackRowProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const isTouchMovedRef = useRef(false);

  // Handle touch start for long press detection
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    isLongPressRef.current = false;
    isTouchMovedRef.current = false;

    // Don't allow long press for MV tracks
    if (!isMV) {
      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        onLongPress();
      }, 500);
    }
  };

  // Handle touch move - cancel long press and mark as scrolling if moved too much
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;

    const touch = e.touches[0];

    // Use isTapGesture to check if user has moved enough to be considered scrolling
    if (
      !isTapGesture(
        touchStartPosRef.current.x,
        touchStartPosRef.current.y,
        touch.clientX,
        touch.clientY,
        10,
      )
    ) {
      isTouchMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  // Handle touch end
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Only trigger tap if it wasn't a long press and user didn't scroll
    if (
      !isLongPressRef.current &&
      !isTouchMovedRef.current &&
      touchStartPosRef.current
    ) {
      const touch = e.changedTouches[0];
      if (
        isTapGesture(
          touchStartPosRef.current.x,
          touchStartPosRef.current.y,
          touch.clientX,
          touch.clientY,
          10,
        )
      ) {
        if (isMV && onMVClick) {
          onMVClick();
        } else if (!isMV) {
          onTap();
        }
      }
    }

    touchStartPosRef.current = null;
    isLongPressRef.current = false;
    isTouchMovedRef.current = false;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        if (isMV && onMVClick) {
          onMVClick();
        } else if (!isMV) {
          onLongPress();
        }
      }}
      className={`flex items-center gap-3 px-4 py-2 min-h-[52px] active:bg-white/10 transition-colors cursor-pointer select-none ${
        isCurrentTrack && !isMV ? "bg-white/5" : ""
      } ${isMV ? "opacity-60" : ""}`}
      data-testid="mobile-track-row"
      data-track-id={track.id}
    >
      {/* Album artwork - optional */}
      {showArtwork && (
        <div
          className={`w-12 h-12 flex-shrink-0 bg-neutral-800 rounded overflow-hidden ${isCurrentTrack && !isMV ? "ring-1 ring-spotify-green" : ""}`}
        >
          {track.artworkUrl ? (
            <CachedImage
              src={getProxiedImageUrl(track.artworkUrl, 92)}
              alt={track.albumName}
              className="w-full h-full object-cover"
              songId={track.id}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40 text-sm">
              ♪
            </div>
          )}
        </div>
      )}

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {/* Playing indicator - before song name, only for non-MV tracks */}
          {isCurrentTrack && isPlaying && !isMV && (
            <MobileNowPlayingIcon className="flex-shrink-0" />
          )}
          <span
            className={`font-medium truncate text-[15px] ${isMV ? "text-white/40" : isCurrentTrack ? "text-spotify-green" : "text-white"}`}
          >
            {track.name}
          </span>
          {track.contentRating === "explicit" && (
            <span className="flex-shrink-0 w-4 h-4 bg-white/20 rounded-sm text-[9px] text-white/80 flex items-center justify-center font-medium">
              E
            </span>
          )}
          {/* MV badge */}
          {isMV && (
            <span className="flex-shrink-0 px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white/70 flex items-center gap-1">
              <IoVideocam size={10} />
              MV
            </span>
          )}
        </div>
        <div className="text-sm text-white/60 truncate flex items-center gap-1">
          {!isMV && isDownloading && (
            <MiniDownloadingIcon size={14} progress={downloadProgress} />
          )}
          {!isMV && !isDownloading && isCached && (
            <MiniDownloadedIcon size={14} />
          )}
          {secondaryText ?? track.artistName}
        </div>
      </div>

      {/* Like button - only show when liked and not MV */}
      {!isMV && (
        <LikeButton
          song={track}
          size="sm"
          showOnHover
          enableTooltip={false}
          onlyWhenLiked
        />
      )}

      {/* More options button - only for non-MV tracks */}
      {!isMV && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onLongPress();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onTouchEnd={(e) => {
            e.stopPropagation();
          }}
          className="w-10 h-10 flex items-center justify-center text-white/40 flex-shrink-0 -mr-2"
          aria-label="更多选项"
        >
          <FiMoreHorizontal size={18} />
        </button>
      )}
    </div>
  );
}

/**
 * MobileDetailPage component
 * Mobile-optimized album/playlist detail view with:
 * - Hero section with artwork and metadata (Requirements: 6.1)
 * - Compact track list with touch-optimized row height (Requirements: 6.2)
 * - Track playback on tap (Requirements: 6.3)
 * - Sticky header on scroll (Requirements: 6.4)
 */
export default function MobileDetailPage({
  variant,
  id,
}: MobileDetailPageProps) {
  const navigate = useNavigate();

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [artworkUrl, setArtworkUrl] = useState<string | undefined>();
  const [motionVideoUrl, setMotionVideoUrl] = useState<string | undefined>(); // Square 1:1 motion video
  const [motionTallVideoUrl, setMotionTallVideoUrl] = useState<
    string | undefined
  >(); // Portrait 3:4 motion video
  const [songs, setSongs] = useState<Song[]>([]);
  const [albumData, setAlbumData] = useState<AlbumDetail | null>(null);
  const [artistInfo, setArtistInfo] = useState<{
    id: string;
    name: string;
    artworkUrl?: string;
  } | null>(null);
  const [themeColor, setThemeColor] = useState("rgb(38, 38, 38)");
  const [headerOpacity, setHeaderOpacity] = useState(0);
  const [localShuffle, setLocalShuffle] = useState(false);
  const [stickyPlayButton, setStickyPlayButton] = useState(false); // Whether play button should be in sticky mode
  const [playButtonRight, setPlayButtonRight] = useState(16); // Right position for sticky button

  // Context menu state for songs
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<Song | null>(null);

  // Context menu state for album/playlist
  const [detailMenuOpen, setDetailMenuOpen] = useState(false);
  const [playlistData, setPlaylistData] = useState<{
    id: string;
    name: string;
    artworkUrl?: string;
    songCount?: number;
  } | null>(null);

  // Playlist curator info (author name and avatar)
  const [playlistCurator, setPlaylistCurator] = useState<{
    name: string;
    avatarUrl?: string;
  } | null>(null);

  // Album footer data
  const [copyright, setCopyright] = useState<string | undefined>();
  const [otherVersions, setOtherVersions] = useState<AlbumVersion[]>([]);
  const [moreByArtist, setMoreByArtist] = useState<AlbumRelatedResult | null>(
    null,
  );

  // Object URLs to revoke on unmount (for offline cached data)
  const [objectUrlsToRevoke, setObjectUrlsToRevoke] = useState<string[]>([]);

  // Context menu state for related albums (other versions / more by artist)
  const [relatedAlbumMenuOpen, setRelatedAlbumMenuOpen] = useState(false);
  const [selectedRelatedAlbum, setSelectedRelatedAlbum] =
    useState<Album | null>(null);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const playButtonRef = useRef<HTMLButtonElement>(null);

  // Stores
  const { likedSongs, fetchLikedSongs } = useLikedSongsStore();
  const {
    setQueue,
    currentSong,
    isPlaying,
    queueSource,
    toggleShuffle,
    isShuffled,
    pause,
    play,
  } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const { isOnline } = useOnlineStatus();
  const {
    cachedSongIds,
    downloadProgress,
    isDownloading,
    isSongCachedForAlbum,
    isSongCachedForPlaylist,
  } = useOfflineCacheStore();
  const { paddingClass: bottomPaddingClass } = useBottomPadding();
  const { showToast } = useToastStore();

  const isSongCachedInCurrentCollection = useCallback(
    (songId: string) =>
      resolveSongCachedForDetailRow({
        songId,
        variant,
        collectionId: id,
        cachedSongIds,
        isSongCachedForAlbum,
        isSongCachedForPlaylist,
      }),
    [
      cachedSongIds,
      id,
      isSongCachedForAlbum,
      isSongCachedForPlaylist,
      variant,
    ],
  );

  // Cleanup Object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (objectUrlsToRevoke.length > 0) {
        revokeObjectUrls(objectUrlsToRevoke);
      }
    };
  }, [objectUrlsToRevoke]);
  // Load data based on variant
  useEffect(() => {
    if (variant === "liked") {
      fetchLikedSongs();
      setTitle("已点赞的歌曲");
      // Get current user for liked songs curator info
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        setSubtitle(currentUser.username);
        setPlaylistCurator({
          name: currentUser.username,
          avatarUrl: currentUser.avatar_url,
        });
      } else {
        setSubtitle("歌单");
        setPlaylistCurator(null);
      }
      setThemeColor("rgb(88, 28, 135)");
    } else if (variant === "album" && id) {
      loadAlbum(id);
    } else if (variant === "playlist" && id) {
      loadPlaylist(id);
    }
  }, [variant, id, fetchLikedSongs, isOnline]);

  // Update songs when liked songs change
  useEffect(() => {
    if (variant === "liked") {
      setIsLoading(false);
      setSongs(likedSongs.map((ls: LikedSong) => likedSongToSong(ls)));
    }
  }, [variant, likedSongs]);

  // Extract theme color from artwork
  useEffect(() => {
    if (artworkUrl && variant !== "liked") {
      const imageUrl = getProxiedImageUrl(artworkUrl, 100);
      extractDominantColor(imageUrl).then(setThemeColor);
    }
  }, [artworkUrl, variant]);

  // Sync localShuffle from playerStore when queueSource matches
  useEffect(() => {
    const isCurrentSource = getIsCurrentSource();
    if (isCurrentSource) {
      setLocalShuffle(isShuffled);
    }
  }, [queueSource, isShuffled, variant, id]);

  // Handle scroll for sticky header with opacity transition (Requirements: 6.4)
  // Header starts appearing immediately on scroll, fully opaque when title is behind header
  // Play button becomes sticky when action bar reaches header
  // Get safe area inset top value for sticky calculations
  const [safeAreaTop, setSafeAreaTop] = useState(0);

  useEffect(() => {
    // Create a temporary element to measure safe area inset
    const measureEl = document.createElement("div");
    measureEl.style.cssText =
      "position:fixed;top:env(safe-area-inset-top,0px);left:0;width:0;height:0;pointer-events:none;";
    document.body.appendChild(measureEl);
    const rect = measureEl.getBoundingClientRect();
    setSafeAreaTop(rect.top);
    document.body.removeChild(measureEl);
  }, []);

  useEffect(() => {
    let scrollableParent: HTMLElement | null = null;

    const checkPositions = () => {
      const headerHeight = 56; // MobileHeader height (h-14 = 56px)
      const playButtonHalfHeight = 24; // Half of play button (48px / 2)
      // The threshold where play button top should stop (safe area + header bottom - half button)
      const stickyThreshold = safeAreaTop + headerHeight - playButtonHalfHeight;

      // Check if play button should be in sticky mode based on action bar position
      const actionBar = actionBarRef.current;
      const playButton = playButtonRef.current;
      let isSticky = false;

      if (actionBar && playButton) {
        // Calculate the right position of the button relative to viewport
        // This needs to be calculated before the button becomes invisible
        const buttonRect = playButton.getBoundingClientRect();
        if (buttonRect.width > 0) {
          // Only update if button is visible
          const rightPos = window.innerWidth - buttonRect.right;
          setPlayButtonRight(rightPos);
        }

        // Use action bar position to determine sticky state
        // Action bar has py-3 (12px) padding, button is 48px tall
        // Button top = actionBar.top + 12 (top padding)
        const actionBarRect = actionBar.getBoundingClientRect();
        const buttonNaturalTop = actionBarRect.top + 12; // py-3 = 12px
        isSticky = buttonNaturalTop <= stickyThreshold;
        setStickyPlayButton(isSticky);
      }

      // Calculate opacity based on hero position and sticky state
      const hero = heroRef.current;
      let newOpacity = 0;

      if (hero) {
        const heroRect = hero.getBoundingClientRect();
        // Hero has pt-16 (64px) padding, so initial top is around 0 when at top
        // When scrolled, heroRect.top becomes negative
        const scrollAmount = -heroRect.top; // Positive when scrolled down

        if (scrollAmount <= 0) {
          // At top or pulled down, fully transparent
          newOpacity = 0;
        } else if (isSticky) {
          // Play button is sticky, fully opaque
          newOpacity = 1;
        } else {
          // Gradually increase opacity based on scroll amount
          // Use distance to sticky threshold for smooth transition
          const actionBarRect = actionBar?.getBoundingClientRect();
          if (actionBarRect) {
            const buttonNaturalTop = actionBarRect.top + 12;
            const distanceToSticky = buttonNaturalTop - stickyThreshold;
            const totalScrollDistance = scrollAmount + distanceToSticky;
            if (totalScrollDistance > 0) {
              const progress = scrollAmount / totalScrollDistance;
              newOpacity = Math.min(0.95, Math.max(0, progress));
            }
          }
        }
      }
      setHeaderOpacity(newOpacity);
    };

    const handleScroll = () => {
      requestAnimationFrame(checkPositions);
    };

    // Find the scrollable parent - MobileLayout's main element has overflow-y: auto
    const findScrollableParentElement = (): HTMLElement | null => {
      let element: HTMLElement | null = scrollContainerRef.current;
      while (element) {
        const parent = element.parentElement;
        if (parent) {
          const style = getComputedStyle(parent);
          if (style.overflowY === "auto" || style.overflowY === "scroll") {
            return parent;
          }
        }
        element = parent;
      }
      return null;
    };

    scrollableParent = findScrollableParentElement();

    if (scrollableParent) {
      scrollableParent.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }

    // Also listen to window scroll as fallback
    window.addEventListener("scroll", handleScroll, {
      passive: true,
      capture: true,
    });

    // Initial calculation
    checkPositions();

    return () => {
      if (scrollableParent) {
        scrollableParent.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [safeAreaTop]);

  // Load album data
  const loadAlbum = async (albumId: string) => {
    setIsLoading(true);
    setError(null);

    // Revoke previous Object URLs if any
    if (objectUrlsToRevoke.length > 0) {
      revokeObjectUrls(objectUrlsToRevoke);
      setObjectUrlsToRevoke([]);
    }

    try {
      if (isOnline) {
        // Online: use API
        const data = await getAlbumDetail(albumId);
        setTitle(data.name);
        setSubtitle(data.artistName || "未知艺术家");
        setArtworkUrl(data.artworkUrl);
        // Save motion video URLs for dynamic cover (priority: tall > square > static)
        setMotionTallVideoUrl(data.motionTallVideoUrl);
        setMotionVideoUrl(data.motionVideoUrl);
        setSongs(data.tracks || []);
        setAlbumData(data);
        // Save album data for AlbumSaveButton
        // Save artist info for navigation and avatar display
        if (data.artists && data.artists.length > 0) {
          setArtistInfo({
            id: data.artists[0].id,
            name: data.artists[0].name,
            artworkUrl: data.artists[0].artworkUrl,
          });
        } else if (data.artistId) {
          setArtistInfo({
            id: data.artistId,
            name: data.artistName || "未知艺术家",
            artworkUrl: undefined,
          });
        }
        // Save copyright info
        setCopyright(data.copyright);

        if (data.localRelatedContent !== undefined) {
          setOtherVersions([]);
          setMoreByArtist(EMPTY_RELATED_RESULT);
        } else {
          // Load other versions and more by artist in parallel
          Promise.all([
            getAlbumOtherVersions(albumId).catch(() => []),
            getAlbumMoreByArtist(albumId).catch(() => EMPTY_RELATED_RESULT),
          ]).then(([versions, moreAlbums]) => {
            setOtherVersions(versions);
            setMoreByArtist(moreAlbums);
          });
        }
      } else {
        // Offline: load from IndexedDB cache
        const cachedAlbum = await offlineCacheService.getCachedAlbum(albumId);
        if (!cachedAlbum) {
          setError("此专辑未缓存，无法离线查看");
          return;
        }

        // Load cached songs for this album
        const cachedSongsPromises = cachedAlbum.trackIds.map((trackId) =>
          offlineCacheService.getCachedSong(trackId),
        );
        const cachedSongsResults = await Promise.all(cachedSongsPromises);
        const validSongs = cachedSongsResults.filter(
          (s): s is CachedSong => s !== null,
        );

        // Convert to AlbumDetail format (async to load motion video from store)
        const albumDetail = await convertCachedAlbumToAlbumDetail(
          cachedAlbum,
          validSongs,
        );

        setTitle(albumDetail.name);
        setSubtitle(albumDetail.artistName || "未知艺术家");
        setArtworkUrl(albumDetail.artworkUrl);
        setMotionVideoUrl(albumDetail.motionVideoUrl);
        setMotionTallVideoUrl(undefined); // Tall video not cached
        setSongs(albumDetail.tracks || []);
        setAlbumData(albumDetail);
        if (albumDetail.artistId) {
          setArtistInfo({
            id: albumDetail.artistId,
            name: albumDetail.artistName || "未知艺术家",
            artworkUrl: undefined,
          });
        }
        setObjectUrlsToRevoke(albumDetail._objectUrls);

        // Related data is not available offline
        setOtherVersions([]);
        setMoreByArtist(null);
        setCopyright(undefined);
      }
    } catch (err) {
      // If offline mode error, try to load from local cache
      if (err instanceof OfflineModeError) {
        try {
          const cachedAlbum = await offlineCacheService.getCachedAlbum(albumId);
          if (!cachedAlbum) {
            setError("离线模式已启用，此专辑未缓存");
            return;
          }

          // Load cached songs for this album
          const cachedSongsPromises = cachedAlbum.trackIds.map((trackId) =>
            offlineCacheService.getCachedSong(trackId),
          );
          const cachedSongsResults = await Promise.all(cachedSongsPromises);
          const validSongs = cachedSongsResults.filter(
            (s): s is CachedSong => s !== null,
          );

          // Convert to AlbumDetail format (async to load motion video from store)
          const albumDetail = await convertCachedAlbumToAlbumDetail(
            cachedAlbum,
            validSongs,
          );

          setTitle(albumDetail.name);
          setSubtitle(albumDetail.artistName || "未知艺术家");
          setArtworkUrl(albumDetail.artworkUrl);
          setMotionVideoUrl(albumDetail.motionVideoUrl);
          setMotionTallVideoUrl(undefined);
          setSongs(albumDetail.tracks || []);
          setAlbumData(albumDetail);
          if (albumDetail.artistId) {
            setArtistInfo({
              id: albumDetail.artistId,
              name: albumDetail.artistName || "未知艺术家",
              artworkUrl: undefined,
            });
          }
          setObjectUrlsToRevoke(albumDetail._objectUrls);
          setOtherVersions([]);
          setMoreByArtist(null);
          setCopyright(undefined);
        } catch (cacheErr) {
          setError("离线模式已启用，此专辑未缓存");
        }
      } else {
        setError(err instanceof Error ? err.message : "加载专辑失败");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load playlist data
  const loadPlaylist = async (playlistId: string) => {
    setIsLoading(true);
    setError(null);

    // Revoke previous Object URLs if any
    if (objectUrlsToRevoke.length > 0) {
      revokeObjectUrls(objectUrlsToRevoke);
      setObjectUrlsToRevoke([]);
    }

    try {
      if (isOnline) {
        // Online: use API
        const data = await getPlaylist(playlistId);
        setTitle(data.name);

        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          setSubtitle(currentUser.username);
          setPlaylistCurator({
            name: currentUser.username,
            avatarUrl: currentUser.avatar_url,
          });
        } else {
          setSubtitle(`${data.songs.length} 首歌曲`);
          setPlaylistCurator(null);
        }

        const artwork =
          data.artwork_url ||
          (data.songs.length > 0 ? data.songs[0].artworkUrl : undefined);
        setArtworkUrl(artwork);
        setSongs(
          data.songs.map((s) => ({
            id: s.id,
            name: s.name,
            artistName: s.artistName,
            artistId: s.artistId,
            albumName: s.albumName,
            albumId: s.albumId,
            duration: s.duration,
            artworkUrl: s.artworkUrl,
            hasLyrics: s.hasLyrics,
          })),
        );
        // Save playlist data for menu
        setPlaylistData({
          id: playlistId,
          name: data.name,
          artworkUrl: artwork,
          songCount: data.songs.length,
        });
      } else {
        // Offline: load from IndexedDB cache
        const cachedPlaylist =
          await offlineCacheService.getCachedPlaylist(playlistId);
        if (!cachedPlaylist) {
          setError("此歌单未缓存，无法离线查看");
          return;
        }

        // Load cached songs for this playlist
        const cachedSongsPromises = cachedPlaylist.trackIds.map((trackId) =>
          offlineCacheService.getCachedSong(trackId),
        );
        const cachedSongsResults = await Promise.all(cachedSongsPromises);
        const validSongs = cachedSongsResults.filter(
          (s): s is CachedSong => s !== null,
        );

        // Convert to Playlist format
        const playlistDetail = convertCachedPlaylistToPlaylist(
          cachedPlaylist,
          validSongs,
        );

        setTitle(playlistDetail.name);
        const currentUser = useAuthStore.getState().user;
        if (currentUser) {
          setSubtitle(currentUser.username);
          setPlaylistCurator({
            name: currentUser.username,
            avatarUrl: currentUser.avatar_url,
          });
        } else {
          setSubtitle(`${playlistDetail.songs.length} 首歌曲`);
          setPlaylistCurator(null);
        }

        // Use playlist artwork from cache, fallback to first song's artwork
        const artwork =
          playlistDetail.artworkUrl ||
          (playlistDetail.songs.length > 0
            ? playlistDetail.songs[0].artworkUrl
            : undefined);
        setArtworkUrl(artwork);
        setSongs(playlistDetail.songs);
        setPlaylistData({
          id: playlistId,
          name: playlistDetail.name,
          artworkUrl: artwork,
          songCount: playlistDetail.songs.length,
        });
        setObjectUrlsToRevoke(playlistDetail._objectUrls);
      }
    } catch (err) {
      // If offline mode error, try to load from local cache
      if (err instanceof OfflineModeError) {
        try {
          const cachedPlaylist =
            await offlineCacheService.getCachedPlaylist(playlistId);
          if (!cachedPlaylist) {
            setError("离线模式已启用，此歌单未缓存");
            return;
          }

          // Load cached songs for this playlist
          const cachedSongsPromises = cachedPlaylist.trackIds.map((trackId) =>
            offlineCacheService.getCachedSong(trackId),
          );
          const cachedSongsResults = await Promise.all(cachedSongsPromises);
          const validSongs = cachedSongsResults.filter(
            (s): s is CachedSong => s !== null,
          );

          // Convert to Playlist format
          const playlistDetail = convertCachedPlaylistToPlaylist(
            cachedPlaylist,
            validSongs,
          );

          setTitle(playlistDetail.name);
          const currentUser = useAuthStore.getState().user;
          if (currentUser) {
            setSubtitle(currentUser.username);
            setPlaylistCurator({
              name: currentUser.username,
              avatarUrl: currentUser.avatar_url,
            });
          } else {
            setSubtitle(`${playlistDetail.songs.length} 首歌曲`);
            setPlaylistCurator(null);
          }

          const artwork =
            playlistDetail.artworkUrl ||
            (playlistDetail.songs.length > 0
              ? playlistDetail.songs[0].artworkUrl
              : undefined);
          setArtworkUrl(artwork);
          setSongs(playlistDetail.songs);
          setPlaylistData({
            id: playlistId,
            name: playlistDetail.name,
            artworkUrl: artwork,
            songCount: playlistDetail.songs.length,
          });
          setObjectUrlsToRevoke(playlistDetail._objectUrls);
        } catch (cacheErr) {
          setError("离线模式已启用，此歌单未缓存");
        }
      } else {
        setError(err instanceof Error ? err.message : "加载歌单失败");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check if current queue source matches this page
  const getIsCurrentSource = useCallback(() => {
    if (variant === "liked") return queueSource.type === "liked-songs";
    if (variant === "album")
      return queueSource.type === "album" && queueSource.id === id;
    if (variant === "playlist")
      return queueSource.type === "playlist" && queueSource.id === id;
    return false;
  }, [variant, id, queueSource]);

  const isCurrentSource = getIsCurrentSource();
  const isCurrentSourcePlaying = isPlaying && isCurrentSource;

  // Get queue source for this page
  const getQueueSource = useCallback((): QueueSource => {
    if (variant === "liked") {
      return { type: "liked-songs", id: null, name: "喜欢的歌曲" };
    }
    if (variant === "album") {
      return { type: "album", id: id || null, name: title };
    }
    return { type: "playlist", id: id || null, name: title };
  }, [variant, id, title]);

  // Handle play all
  const handlePlayAll = () => {
    if (songs.length === 0) return;

    // Filter out music videos from the playlist
    const playableTracks = songs.filter((track) => !track.isMusicVideo);
    if (playableTracks.length === 0) return;

    // Record play for recently played
    if (variant === "liked") {
      recordPlay("liked-songs", "liked-songs");
    } else if (id) {
      recordPlay(variant, id);
    }

    setQueue(playableTracks, 0, getQueueSource());

    // Sync shuffle state
    if (localShuffle !== isShuffled) {
      toggleShuffle();
    }
  };

  // Handle play/pause button click
  const handlePlayPauseClick = () => {
    if (isCurrentSourcePlaying) {
      pause();
    } else if (isCurrentSource) {
      play();
    } else {
      handlePlayAll();
    }
  };

  // Handle MV click - show toast
  const handleMVClick = () => {
    showToast("暂不支持MV播放", 2000);
  };

  // Handle track tap - start playback (Requirements: 6.3)
  const handleTrackTap = (index: number) => {
    if (songs.length === 0) return;

    const track = songs[index];

    // Check if track is a music video
    if (track.isMusicVideo) {
      handleMVClick();
      return;
    }

    // Filter out music videos and find the correct index for the selected track
    const playableTracks = songs.filter((t) => !t.isMusicVideo);
    const playableIndex = playableTracks.findIndex((t) => t.id === track.id);

    // Record play for recently played
    if (variant === "liked") {
      recordPlay("liked-songs", "liked-songs");
    } else if (id) {
      recordPlay(variant, id);
    }

    setQueue(
      playableTracks,
      playableIndex >= 0 ? playableIndex : 0,
      getQueueSource(),
    );
  };

  // Handle long press - show context menu
  const handleLongPress = (song: Song) => {
    setMenuSong(song);
    setMenuOpen(true);
  };

  // Handle back navigation - use app-level navigation instead of browser history
  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  const isLocalAlbum = variant === "album" && isLocalAlbumDetail(albumData);
  const localRelatedShelves =
    variant === "album" ? getLocalAlbumRelatedShelves(albumData) : [];
  const cacheableTrackIds = songs
    .filter((song) => !song.isMusicVideo)
    .map((song) => song.id);

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex flex-col bg-black">
        <MobileHeader opacity={0} onBack={handleBack} />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  // Error state - use unified OfflineFallback for offline errors
  if (error) {
    // Check if it's an offline-related error
    const isOfflineError =
      error.includes("离线") || error.includes("未缓存") || !isOnline;

    if (isOfflineError) {
      return (
        <div className="h-full flex flex-col bg-black">
          <MobileHeader opacity={0} onBack={handleBack} />
          <OfflineFallback
            message={error}
            onBack={handleBack}
            showPath={false}
          />
        </div>
      );
    }

    // Non-offline errors use simple display
    return (
      <div className="h-full flex flex-col bg-black">
        <MobileHeader opacity={0} onBack={handleBack} />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-white/10 rounded-full text-white"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="min-h-full bg-black relative">
      {/* 状态栏区域不再使用纯色遮罩，让渐变背景延伸到状态栏 */}

      {/* Global header with transparent to opaque transition (Requirements: 6.4) */}
      <MobileHeader
        title={title}
        opacity={headerOpacity}
        backgroundColor={themeColor}
        onBack={handleBack}
      />

      {/* Sticky play button - shown when scrolled past threshold */}
      {/* Positioned to match the original button location exactly */}
      {/* z-[80] ensures it's above MobileHeader (z-[70]) */}
      {stickyPlayButton && (
        <button
          onClick={handlePlayPauseClick}
          disabled={songs.length === 0}
          className="fixed z-[80] w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
          style={{
            // header height (56px) + safe area - half button height (24px) = 32px + safe area
            top: "calc(env(safe-area-inset-top, 0px) + 32px)",
            right: playButtonRight, // Match the original button's right position
          }}
          aria-label={isCurrentSourcePlaying ? "暂停" : "播放"}
        >
          {isCurrentSourcePlaying ? (
            <FiPause size={24} className="text-black" />
          ) : (
            <FiPlay size={24} className="text-black ml-0.5" />
          )}
        </button>
      )}

      {/* Content */}
      <div>
        {/* Hero section - different layout for tall motion video vs standard */}
        {variant === "album" && motionTallVideoUrl ? (
          /* Full-screen style hero for tall motion video - like artist page */
          <div
            ref={heroRef}
            className="relative"
            data-testid="mobile-detail-hero"
          >
            {/* Hero background - full width motion video */}
            <div className="h-[520px] w-full overflow-hidden">
              <MotionArtwork
                videoUrl={motionTallVideoUrl}
                fallbackImage={
                  artworkUrl ? getProxiedImageUrl(artworkUrl, 600) : undefined
                }
                alt={title}
                quality="high"
              />
            </div>
            {/* Gradient overlay for smooth transition */}
            <div
              className="absolute bottom-0 left-0 right-0 h-32"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.8) 70%, rgb(0,0,0) 100%)",
              }}
            />
            {/* Album info overlay */}
            <div className="absolute bottom-4 left-4 right-4">
              <h1
                ref={titleRef}
                className="text-2xl font-bold text-white mb-1 drop-shadow-lg line-clamp-2"
              >
                {title}
              </h1>
              <div className="flex items-center gap-2 text-sm text-white/80">
                {artistInfo ? (
                  <div
                    className="flex items-center gap-2 cursor-pointer active:opacity-70"
                    onClick={() => navigate(`/artist/${artistInfo.id}`)}
                  >
                    <div className="w-5 h-5 rounded-full bg-neutral-700 overflow-hidden flex-shrink-0">
                      {artistInfo.artworkUrl ? (
                        <CachedImage
                          src={getProxiedImageUrl(artistInfo.artworkUrl, 40)}
                          alt={artistInfo.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
                          ♪
                        </div>
                      )}
                    </div>
                    <span className="font-medium">{subtitle}</span>
                  </div>
                ) : (
                  <span className="font-medium">{subtitle}</span>
                )}
              </div>
              <p className="text-xs text-white/60 mt-1">
                专辑
                {albumData?.releaseDate &&
                  (() => {
                    const date = new Date(albumData.releaseDate);
                    return ` · ${date.getFullYear()}`;
                  })()}
                {" · "}
                {songs.length} 首歌曲
              </p>
            </div>
          </div>
        ) : (
          /* Standard hero layout for square motion video or static image */
          <div
            ref={heroRef}
            className="relative px-4 pb-4"
            style={{
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 2.5rem)",
              background: `linear-gradient(to bottom, ${themeColor} 0%, transparent 100%)`,
            }}
            data-testid="mobile-detail-hero"
          >
            {/* Artwork - Spotify style: centered */}
            <div className="flex justify-center mb-4">
              {variant === "album" && motionVideoUrl ? (
                /* Square 1:1 motion video */
                <div className="w-60 h-60 rounded shadow-2xl overflow-hidden bg-neutral-800">
                  <MotionArtwork
                    videoUrl={motionVideoUrl}
                    fallbackImage={
                      artworkUrl
                        ? getProxiedImageUrl(artworkUrl, 400)
                        : undefined
                    }
                    alt={title}
                    quality="low"
                  />
                </div>
              ) : (
                /* Static image fallback */
                <div className="w-60 h-60 rounded shadow-2xl overflow-hidden bg-neutral-800">
                  {variant === "liked" ? (
                    <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-400 flex items-center justify-center">
                      <FiHeart className="w-20 h-20 text-white" />
                    </div>
                  ) : artworkUrl ? (
                    <CachedImage
                      src={getProxiedImageUrl(artworkUrl, 400)}
                      alt={title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/40 text-6xl">
                      ♪
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Title and metadata - Spotify style: left aligned */}
            <div className="text-left">
              <h1
                ref={titleRef}
                className="text-xl font-bold text-white mb-1 line-clamp-2"
              >
                {title}
              </h1>
              <div className="flex items-center gap-2 text-sm text-white/70">
                {/* Artist avatar and name - clickable for albums */}
                {variant === "album" && artistInfo ? (
                  <div
                    className="flex items-center gap-2 cursor-pointer active:opacity-70"
                    onClick={() => navigate(`/artist/${artistInfo.id}`)}
                  >
                    <div className="w-5 h-5 rounded-full bg-neutral-700 overflow-hidden flex-shrink-0">
                      {artistInfo.artworkUrl ? (
                        <CachedImage
                          src={getProxiedImageUrl(artistInfo.artworkUrl, 40)}
                          alt={artistInfo.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">
                          ♪
                        </div>
                      )}
                    </div>
                    <span className="font-medium">{subtitle}</span>
                  </div>
                ) : (
                  <>
                    {/* Playlist/Liked variant: show curator avatar if available */}
                    <div className="w-5 h-5 rounded-full bg-neutral-700 overflow-hidden flex-shrink-0">
                      {playlistCurator?.avatarUrl ? (
                        <CachedImage
                          src={getProxiedImageUrl(
                            playlistCurator.avatarUrl,
                            40,
                          )}
                          alt={playlistCurator.name}
                          className="w-full h-full object-cover"
                        />
                      ) : variant === "liked" ? (
                        // For liked songs without avatar, show a user icon placeholder
                        <div className="w-full h-full flex items-center justify-center bg-neutral-600 text-white/60 text-xs">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                          </svg>
                        </div>
                      ) : artworkUrl ? (
                        <CachedImage
                          src={getProxiedImageUrl(artworkUrl, 40)}
                          alt={subtitle}
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </div>
                    <span className="font-medium">{subtitle}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-white/50 mt-1">
                {variant === "album"
                  ? "专辑"
                  : variant === "playlist"
                    ? "歌单"
                    : "歌单"}
                {variant === "album" &&
                  albumData?.releaseDate &&
                  (() => {
                    const date = new Date(albumData.releaseDate);
                    return ` · ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
                  })()}
                {" · "}
                {songs.length} 首歌曲
              </p>
            </div>
          </div>
        )}

        {/* Action buttons - Spotify style layout */}
        <div
          ref={actionBarRef}
          className="flex items-center justify-between px-4 py-3"
        >
          {/* Left side: action icons */}
          <div className="flex items-center gap-4">
            {/* Album save button - only show for albums */}
            {variant === "album" && albumData && (
              <AlbumSaveButton
                album={albumData}
                size={20}
                enableTooltip={false}
              />
            )}

            {variant === "album" && id && cacheableTrackIds.length > 0 && (
              <MobileAlbumDownloadButton
                albumId={id}
                trackIds={cacheableTrackIds}
                size={20}
              />
            )}

            {variant === "playlist" && id && cacheableTrackIds.length > 0 && (
              <MobilePlaylistDownloadButton
                playlistId={id}
                trackIds={cacheableTrackIds}
                size={20}
              />
            )}

            {/* More options - opens album/playlist menu */}
            <button
              onClick={() => setDetailMenuOpen(true)}
              className="w-10 h-10 flex items-center justify-center text-white/60"
              aria-label="更多选项"
            >
              <FiMoreHorizontal size={22} />
            </button>
          </div>

          {/* Right side: shuffle + play button */}
          <div className="flex items-center gap-4">
            {/* Shuffle button - reuse web component */}
            <ShuffleButton
              isActive={localShuffle}
              onClick={() => setLocalShuffle(!localShuffle)}
              size="md"
              disableHover
            />

            {/* Play button - visible when not in sticky mode */}
            {/* relative z-[80] ensures it's above MobileHeader (z-[70]) */}
            <button
              ref={playButtonRef}
              onClick={handlePlayPauseClick}
              disabled={songs.length === 0}
              className={`relative z-[80] w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50 ${
                stickyPlayButton ? "invisible" : ""
              }`}
              aria-label={isCurrentSourcePlaying ? "暂停" : "播放"}
            >
              {isCurrentSourcePlaying ? (
                <FiPause size={24} className="text-black" />
              ) : (
                <FiPlay size={24} className="text-black ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Track list (Requirements: 6.2) */}
        <div>
          {songs.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              {variant === "liked" ? "还没有点赞的歌曲" : "暂无歌曲"}
            </div>
          ) : (
            songs.map((song, index) => {
              const isSongCached = isSongCachedInCurrentCollection(song.id);
              const isSongDownloading =
                isDownloading && downloadProgress?.currentSongId === song.id;
              const songDownloadProgress =
                isSongDownloading && downloadProgress?.totalSongs
                  ? Math.round(
                      (downloadProgress.completedSongs /
                        downloadProgress.totalSongs) *
                        100,
                    )
                  : 0;
              const isMV = song.isMusicVideo === true;

              return (
                <MobileTrackRow
                  key={song.id}
                  track={song}
                  index={index}
                  isPlaying={isPlaying}
                  isCurrentTrack={
                    currentSong?.id === song.id && isCurrentSource
                  }
                  onTap={() => handleTrackTap(index)}
                  onLongPress={() => handleLongPress(song)}
                  isCached={isSongCached}
                  isDownloading={isSongDownloading}
                  downloadProgress={songDownloadProgress}
                  isMV={isMV}
                  onMVClick={handleMVClick}
                />
              );
            })
          )}
        </div>

        {/* Album footer section - only for albums */}
        {variant === "album" && songs.length > 0 && (
          <div className={`px-4 pt-6 ${bottomPaddingClass}`}>
            {/* Song count and total duration */}
            <p className="text-sm text-white/50 mb-1">
              {songs.length} 首歌曲 ·{" "}
              {(() => {
                const totalMs = songs.reduce(
                  (acc, song) => acc + (song.duration || 0),
                  0,
                );
                const totalMinutes = Math.floor(totalMs / 60000);
                if (totalMinutes >= 60) {
                  const hours = Math.floor(totalMinutes / 60);
                  const mins = totalMinutes % 60;
                  return `${hours}小时${mins > 0 ? ` ${mins}分钟` : ""}`;
                }
                return `${totalMinutes}分钟`;
              })()}
            </p>

            {/* Copyright info */}
            {copyright && (
              <p className="text-xs text-white/40 whitespace-pre-line mb-6">
                {copyright}
              </p>
            )}

            {localRelatedShelves.map((shelf) => {
              if (
                shelf.id === "more-by-artist" &&
                shelf.kind === "albums" &&
                shelf.albums &&
                shelf.albums.length > 0 &&
                artistInfo &&
                id
              ) {
                const previewAlbums = shelf.albums.slice(
                  0,
                  LOCAL_RELATED_ALBUM_PREVIEW_LIMIT,
                );
                const hasMoreAlbums =
                  shelf.albums.length > LOCAL_RELATED_ALBUM_PREVIEW_LIMIT;
                return (
                  <div
                    key={shelf.id}
                    className="mb-6"
                    data-testid="mobile-local-related-more-by-artist"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-white">
                        {shelf.title}
                      </h2>
                      {hasMoreAlbums && (
                        <button
                          onClick={() =>
                            navigate(
                              `/album/${id}/more-by-artist/${encodeURIComponent(artistInfo.name)}`,
                            )
                          }
                          className="text-sm font-medium text-white/60"
                        >
                          显示全部
                        </button>
                      )}
                    </div>
                    <div className="-mx-4">
                      <ScrollableCardRow
                        cardWidth={140}
                        gap={12}
                        edgePadding={16}
                        mobileEdgePadding={16}
                      >
                        {previewAlbums.map((album) => (
                          <AlbumCard
                            key={album.id}
                            album={album}
                            onCardClick={() => navigate(`/album/${album.id}`)}
                            onLongPress={(a) => {
                              setSelectedRelatedAlbum(a);
                              setRelatedAlbumMenuOpen(true);
                            }}
                          />
                        ))}
                      </ScrollableCardRow>
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Other versions section */}
            {!isLocalAlbum && otherVersions.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-bold text-white">其他版本</h2>
                </div>
                <div className="-mx-4">
                  <ScrollableCardRow
                    cardWidth={140}
                    gap={12}
                    edgePadding={16}
                    mobileEdgePadding={16}
                  >
                    {otherVersions.map((album) => (
                      <AlbumCard
                        key={album.id}
                        album={{
                          id: album.id,
                          name: album.name,
                          artistName: album.artistName,
                          artworkUrl: album.artworkUrl,
                          trackCount: album.trackCount,
                          releaseDate: album.releaseDate,
                        }}
                        onCardClick={() => navigate(`/album/${album.id}`)}
                        onLongPress={(a) => {
                          setSelectedRelatedAlbum(a);
                          setRelatedAlbumMenuOpen(true);
                        }}
                      />
                    ))}
                  </ScrollableCardRow>
                </div>
              </div>
            )}

            {/* More by artist section */}
            {!isLocalAlbum &&
              moreByArtist &&
              moreByArtist.albums.length > 0 &&
              artistInfo &&
              id && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">
                      更多来自 {artistInfo.name} 的内容
                    </h2>
                    <button
                      onClick={() =>
                        navigate(
                          `/album/${id}/more-by-artist/${encodeURIComponent(artistInfo.name)}`,
                        )
                      }
                      className="text-sm font-medium text-white/60"
                    >
                      显示全部
                    </button>
                  </div>
                  <div className="-mx-4">
                    <ScrollableCardRow
                      cardWidth={140}
                      gap={12}
                      edgePadding={16}
                      mobileEdgePadding={16}
                    >
                      {moreByArtist.albums.map((album) => (
                        <AlbumCard
                          key={album.id}
                          album={{
                            id: album.id,
                            name: album.name,
                            artistName: album.artistName,
                            artworkUrl: album.artworkUrl,
                            trackCount: album.trackCount,
                            releaseDate: album.releaseDate,
                          }}
                          onCardClick={() => navigate(`/album/${album.id}`)}
                          onLongPress={(a) => {
                            setSelectedRelatedAlbum(a);
                            setRelatedAlbumMenuOpen(true);
                          }}
                        />
                      ))}
                    </ScrollableCardRow>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* Bottom padding for non-album variants */}
        {variant !== "album" && <div className={bottomPaddingClass} />}
      </div>

      {/* Song context menu */}
      <MobileSongMenu
        song={menuSong}
        isOpen={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setMenuSong(null);
        }}
      />

      {/* Album menu */}
      {variant === "album" && albumData && (
        <MobileAlbumMenu
          album={albumData}
          isOpen={detailMenuOpen}
          onClose={() => setDetailMenuOpen(false)}
        />
      )}

      {/* Playlist menu */}
      {variant === "playlist" && playlistData && (
        <MobilePlaylistMenu
          playlist={playlistData}
          isOpen={detailMenuOpen}
          onClose={() => setDetailMenuOpen(false)}
        />
      )}

      {/* Related album menu (other versions / more by artist) */}
      {selectedRelatedAlbum && (
        <MobileAlbumMenu
          album={selectedRelatedAlbum}
          isOpen={relatedAlbumMenuOpen}
          onClose={() => {
            setRelatedAlbumMenuOpen(false);
            setSelectedRelatedAlbum(null);
          }}
        />
      )}
    </div>
  );
}
