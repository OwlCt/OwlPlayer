import { Fragment, useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { FiClock, FiChevronRight } from "react-icons/fi";
import {
  IoEllipsisHorizontal,
  IoPlay,
  IoPause,
  IoVideocam,
} from "react-icons/io5";
import {
  getAlbumDetail,
  getAlbumOtherVersions,
  getAlbumYouMightAlsoLike,
  getAlbumMoreByArtist,
  getAlbumAppearsOn,
  AlbumVersion,
  AlbumRelatedResult,
} from "../api";
import { AlbumDetail, Song, Album } from "../types";
import { usePlayerStore } from "../store/playerStore";
import { useRecentlyPlayedStore } from "../store/recentlyPlayedStore";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { getProxiedImageUrl } from "../utils/image";
import { AlbumSaveButton } from "./AlbumSaveButton";
import { AlbumDownloadButton } from "./DownloadButton";
import { extractDominantColor } from "../utils/colorExtractor";
import { StickyHeader } from "./StickyHeader";
import { LikeButton } from "./LikeButton";
import SongContextMenu from "./SongContextMenu";
import { MenuPosition } from "./ContextMenu";
import { ShuffleButton } from "./ShuffleButton";
import ClickableLink, { getArtistHref } from "./ClickableLink";
import { AdaptiveTitle } from "./AdaptiveTitle";
import CachedImage from "./CachedImage";
import AlbumCard from "./AlbumCard";
import MotionArtwork from "./MotionArtwork";
import ScrollableCardRow from "./ScrollableCardRow";
import {
  offlineCacheService,
  CachedSong,
} from "../services/offlineCacheService";
import {
  convertCachedAlbumToAlbumDetail,
  revokeObjectUrls,
} from "../utils/offlineCacheConverter";
import OfflineFallback from "./OfflineFallback";
import {
  getLocalAlbumRelatedShelves,
  isLocalAlbumDetail,
  LOCAL_RELATED_ALBUM_PREVIEW_LIMIT,
} from "../utils/albumLocalRelatedContent";
import { prefetchArtworks, prefetchArtistImages } from "../utils/imagePrefetch";

const PREVIEW_LIMIT = 10; // Maximum items to show in preview mode
const EMPTY_RELATED_RESULT: AlbumRelatedResult = { albums: [], hasMore: false };

// Simple in-memory cache for album data to avoid re-fetching on back navigation
interface AlbumCacheEntry {
  album: AlbumDetail;
  otherVersions: AlbumVersion[];
  moreByArtist: AlbumRelatedResult;
  appearsOn: AlbumRelatedResult;
  youMightAlsoLike: AlbumRelatedResult;
  timestamp: number;
}
const albumDetailCache = new Map<string, AlbumCacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedAlbumDetail(albumId: string): AlbumCacheEntry | null {
  const cached = albumDetailCache.get(albumId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached;
  }
  return null;
}

function setCachedAlbumDetail(
  albumId: string,
  entry: Omit<AlbumCacheEntry, "timestamp">,
): void {
  albumDetailCache.set(albumId, { ...entry, timestamp: Date.now() });
}

export default function AlbumDetailPage() {
  const { albumId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    setQueue,
    currentSong,
    isPlaying,
    togglePlay,
    toggleShuffle,
    isShuffled,
    queueSource,
    pause,
    play,
  } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const { isOnline } = useOnlineStatus();
  const actionBarRef = useRef<HTMLDivElement>(null);
  const highlightedTrackRef = useRef<HTMLDivElement>(null);

  // Try to get cached data first
  const cachedData = albumId ? getCachedAlbumDetail(albumId) : null;

  const [album, setAlbum] = useState<AlbumDetail | null>(
    cachedData?.album ?? null,
  );
  const [otherVersions, setOtherVersions] = useState<AlbumVersion[]>(
    cachedData?.otherVersions ?? [],
  );
  const [moreByArtist, setMoreByArtist] = useState<AlbumRelatedResult>(
    cachedData?.moreByArtist ?? { albums: [], hasMore: false },
  );
  const [appearsOn, setAppearsOn] = useState<AlbumRelatedResult>(
    cachedData?.appearsOn ?? { albums: [], hasMore: false },
  );
  const [youMightAlsoLike, setYouMightAlsoLike] = useState<AlbumRelatedResult>(
    cachedData?.youMightAlsoLike ?? { albums: [], hasMore: false },
  );
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string>("rgb(38, 38, 38)");
  const [hoveredTrackIndex, setHoveredTrackIndex] = useState<number | null>(
    null,
  );
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [localShuffle, setLocalShuffle] = useState(false);
  const [mvToast, setMvToast] = useState(false);

  // Temporary highlight for song from search suggestion
  const [highlightedSongId, setHighlightedSongId] = useState<string | null>(
    null,
  );

  // Context menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({
    x: 0,
    y: 0,
  });
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [menuCloseOnScroll, setMenuCloseOnScroll] = useState(true);

  // Object URLs to revoke on unmount (for offline cached data)
  const [objectUrlsToRevoke, setObjectUrlsToRevoke] = useState<string[]>([]);

  // Clear selection and highlight when clicking outside track rows
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't clear selection if clicking inside a context menu
      if (target.closest('[class*="bg-[#282828]"]')) {
        return;
      }
      if (!target.closest("[data-track-row]")) {
        setSelectedTrackId(null);
        setHighlightedSongId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Cleanup Object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (objectUrlsToRevoke.length > 0) {
        revokeObjectUrls(objectUrlsToRevoke);
      }
    };
  }, [objectUrlsToRevoke]);

  useEffect(() => {
    if (albumId) {
      // If online and we have cached data, don't reload
      if (isOnline) {
        const cached = getCachedAlbumDetail(albumId);
        if (cached) {
          setAlbum(cached.album);
          setOtherVersions(cached.otherVersions);
          setMoreByArtist(cached.moreByArtist);
          setAppearsOn(cached.appearsOn);
          setYouMightAlsoLike(cached.youMightAlsoLike);
          setLoading(false);
          return;
        }
      }
      loadAlbumDetail(albumId);
    }
  }, [albumId, isOnline]);

  // Handle highlight parameter from URL (for search suggestion navigation)
  useEffect(() => {
    const highlightId = searchParams.get("highlight");
    if (highlightId && album?.tracks) {
      setHighlightedSongId(highlightId);
      // Clear the URL parameter after setting highlight
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, album?.tracks, setSearchParams]);

  // Scroll to highlighted track when it's set
  useEffect(() => {
    if (highlightedSongId) {
      // Wait for next frame to ensure DOM is rendered with the ref
      requestAnimationFrame(() => {
        if (highlightedTrackRef.current) {
          highlightedTrackRef.current.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      });
    }
  }, [highlightedSongId]);

  // Extract theme color from album artwork
  useEffect(() => {
    if (album?.artworkUrl) {
      const imageUrl = getProxiedImageUrl(album.artworkUrl, 100);
      extractDominantColor(imageUrl).then(setThemeColor);
    }
  }, [album?.artworkUrl]);

  useEffect(() => {
    if (!album) return;

    prefetchArtworks(
      [
        { artworkUrl: album.artworkUrl },
        ...(album.tracks || []),
        ...otherVersions,
        ...moreByArtist.albums,
        ...appearsOn.albums,
        ...youMightAlsoLike.albums,
      ],
      [80, 300, 400]
    );
    prefetchArtistImages(album.artists || [], [300, 1000]);
  }, [album, otherVersions, moreByArtist, appearsOn, youMightAlsoLike]);

  // Update document title when not playing
  useEffect(() => {
    if (isPlaying || !album?.name) return;
    const artistLabel =
      album.artistName || album.artists?.[0]?.name || "未知艺术家";
    document.title = `${album.name} - by ${artistLabel} | OwlPlayer`;
  }, [album?.name, album?.artistName, album?.artists, isPlaying]);

  // Sync localShuffle from playerStore when queueSource matches current album
  useEffect(() => {
    if (albumId && queueSource.type === "album" && queueSource.id === albumId) {
      setLocalShuffle(isShuffled);
    }
  }, [albumId, queueSource, isShuffled]);

  const loadAlbumDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    setOtherVersions([]);
    setMoreByArtist(EMPTY_RELATED_RESULT);
    setAppearsOn(EMPTY_RELATED_RESULT);
    setYouMightAlsoLike(EMPTY_RELATED_RESULT);

    // Revoke previous Object URLs if any
    if (objectUrlsToRevoke.length > 0) {
      revokeObjectUrls(objectUrlsToRevoke);
      setObjectUrlsToRevoke([]);
    }

    // Helper function to load from local IndexedDB cache
    const loadFromLocalCache = async (): Promise<boolean> => {
      const cachedAlbum = await offlineCacheService.getCachedAlbum(id);
      if (!cachedAlbum) {
        return false;
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
      setAlbum(albumDetail);
      setObjectUrlsToRevoke(albumDetail._objectUrls);

      // Related data is not available offline
      setOtherVersions([]);
      setMoreByArtist({ albums: [], hasMore: false });
      setAppearsOn({ albums: [], hasMore: false });
      setYouMightAlsoLike({ albums: [], hasMore: false });
      return true;
    };

    try {
      if (isOnline) {
        // Online: use API
        const data = await getAlbumDetail(id);
        setAlbum(data);
        if (data.localRelatedContent !== undefined) {
          setOtherVersions([]);
          setMoreByArtist(EMPTY_RELATED_RESULT);
          setAppearsOn(EMPTY_RELATED_RESULT);
          setYouMightAlsoLike(EMPTY_RELATED_RESULT);
          setCachedAlbumDetail(id, {
            album: data,
            otherVersions: [],
            moreByArtist: EMPTY_RELATED_RESULT,
            appearsOn: EMPTY_RELATED_RESULT,
            youMightAlsoLike: EMPTY_RELATED_RESULT,
          });
        } else {
          // Load related data in background and cache when done
          const [versions, moreBy, appears, youMight] = await Promise.all([
            getAlbumOtherVersions(id).catch(() => [] as AlbumVersion[]),
            getAlbumMoreByArtist(id).catch(() => EMPTY_RELATED_RESULT),
            getAlbumAppearsOn(id).catch(() => EMPTY_RELATED_RESULT),
            getAlbumYouMightAlsoLike(id).catch(() => EMPTY_RELATED_RESULT),
          ]);
          setOtherVersions(versions);
          setMoreByArtist(moreBy);
          setAppearsOn(appears);
          setYouMightAlsoLike(youMight);
          // Save to cache
          setCachedAlbumDetail(id, {
            album: data,
            otherVersions: versions,
            moreByArtist: moreBy,
            appearsOn: appears,
            youMightAlsoLike: youMight,
          });
        }
      } else {
        // Offline: load from IndexedDB cache
        const loaded = await loadFromLocalCache();
        if (!loaded) {
          setError("此专辑未缓存，无法离线查看");
          return;
        }
      }
    } catch (err) {
      // If offline mode error, try to load from local cache
      if (err instanceof Error && err.name === "OfflineModeError") {
        try {
          const loaded = await loadFromLocalCache();
          if (!loaded) {
            setError("离线模式已启用，此专辑未缓存");
          }
        } catch (cacheErr) {
          setError("离线模式已启用，此专辑未缓存");
        }
      } else {
        setError(err instanceof Error ? err.message : "Failed to load album");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (albumId) {
      loadAlbumDetail(albumId);
    }
  };

  // Check if current queue source is this album (regardless of play state)
  const isCurrentAlbumSource =
    queueSource.type === "album" && queueSource.id === albumId;

  // Check if current album is playing
  const isCurrentAlbumPlaying = isPlaying && isCurrentAlbumSource;

  const handlePlayAll = () => {
    if (album?.tracks && album.tracks.length > 0) {
      // Filter out music videos from the playlist
      const playableTracks = album.tracks.filter(
        (track) => !track.isMusicVideo,
      );
      if (playableTracks.length === 0) return;
      // Record play for recently played sorting
      recordPlay("album", album.id);
      setQueue(playableTracks, 0, {
        type: "album",
        id: album.id,
        name: album.name,
      });
      // Sync shuffle state to playerStore
      if (localShuffle !== isShuffled) {
        toggleShuffle();
      }
    }
  };

  // Handle play/pause button click
  const handlePlayPauseClick = () => {
    if (isCurrentAlbumPlaying) {
      pause();
    } else if (isCurrentAlbumSource) {
      // Resume playback when source matches but paused
      play();
    } else {
      handlePlayAll();
    }
  };

  const handlePlayTrack = (track: Song, _index: number) => {
    // Check if track is a music video
    if (track.isMusicVideo) {
      setMvToast(true);
      setTimeout(() => setMvToast(false), 2000);
      return;
    }
    if (album?.tracks) {
      // Clear highlight when playing
      setHighlightedSongId(null);
      // Record play for recently played sorting
      recordPlay("album", album.id);
      // Filter out music videos and find the correct index for the selected track
      const playableTracks = album.tracks.filter((t) => !t.isMusicVideo);
      const playableIndex = playableTracks.findIndex((t) => t.id === track.id);
      setQueue(playableTracks, playableIndex >= 0 ? playableIndex : 0, {
        type: "album",
        id: album.id,
        name: album.name,
      });
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, track: Song) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedTrackId(track.id); // Select on right-click
    setMenuCloseOnScroll(true);
    // Enrich track with album info
    const enrichedTrack: Song = {
      ...track,
      albumId: album?.id,
      artistId: album?.artists?.[0]?.id,
    };
    setMenuSong(enrichedTrack);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleMenuButtonClick = (e: React.MouseEvent, track: Song) => {
    e.stopPropagation();
    setSelectedTrackId(track.id); // Select on menu button click
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuCloseOnScroll(false);
    // Enrich track with album info
    const enrichedTrack: Song = {
      ...track,
      albumId: album?.id,
      artistId: album?.artists?.[0]?.id,
    };
    setMenuSong(enrichedTrack);
    setMenuPosition({ x: rect.right, y: rect.bottom });
    setMenuOpen(true);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
    setMenuSong(null);
  };

  const handleAlbumCardClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const getTotalDuration = () => {
    if (!album?.tracks) return "0 min";
    const totalMs = album.tracks.reduce(
      (sum, track) => sum + track.duration,
      0,
    );
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    if (hours > 0) {
      return `${hours} 小时 ${minutes} 分钟`;
    }
    return `${minutes} 分 ${seconds} 秒`;
  };

  const formatReleaseDate = (dateStr: string | undefined) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}年${month}月${day}日`;
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    // Check if it's an offline-related error
    const isOfflineError =
      error.includes("离线") || error.includes("未缓存") || !isOnline;

    if (isOfflineError) {
      return <OfflineFallback message={error} showPath={false} />;
    }

    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-spotify-green text-black rounded-full font-medium hover:bg-spotify-green/90 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="p-8">
        <p className="text-white/60">未找到专辑</p>
      </div>
    );
  }

  const albumMetaItems = [
    {
      key: "artist",
      content: (
        <span className="font-medium">
          <ClickableLink
            text={album.artistName}
            href={getArtistHref(album.artists?.[0]?.id || album.artistId)}
            disabled={!album.artists?.[0]?.id && !album.artistId}
          />
        </span>
      ),
    },
    album.releaseDate?.slice(0, 4)
      ? {
          key: "year",
          content: <span>{album.releaseDate.slice(0, 4)}</span>,
        }
      : null,
    {
      key: "summary",
      content: (
        <span>
          {album.trackCount} 首歌曲, {getTotalDuration()}
        </span>
      ),
    },
  ].filter(Boolean) as Array<{ key: string; content: React.ReactNode }>;

  const isLocalAlbum = isLocalAlbumDetail(album);
  const localRelatedShelves = getLocalAlbumRelatedShelves(album);
  const cacheableTrackIds = (album.tracks ?? [])
    .filter((track) => !track.isMusicVideo)
    .map((track) => track.id);

  return (
    <StickyHeader
      title={album.name}
      themeColor={themeColor}
      onPlay={handlePlayPauseClick}
      actionBarRef={actionBarRef}
      isCurrentSourcePlaying={isCurrentAlbumPlaying}
    >
      <div
        className="min-h-full"
        style={{
          background: `linear-gradient(to bottom, ${themeColor} 0%, transparent 400px), linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgb(18,18,18) 400px)`,
        }}
      >
        <div className="p-8">
          {/* Album header */}
          <div className="flex gap-6 mb-8">
            {/* Artwork */}
            <div className="w-64 h-64 flex-shrink-0 rounded-lg overflow-hidden shadow-xl">
              {album.motionVideoUrl ? (
                <MotionArtwork
                  videoUrl={album.motionVideoUrl}
                  fallbackImage={getProxiedImageUrl(album.artworkUrl, 400)}
                  alt={album.name}
                  quality="low"
                />
              ) : album.artworkUrl ? (
                <CachedImage
                  src={getProxiedImageUrl(album.artworkUrl, 400)}
                  alt={album.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-spotify-gray flex items-center justify-center text-6xl text-white/20">
                  ♪
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex flex-col justify-end min-w-0 flex-1">
              <p className="text-sm text-white/60 uppercase tracking-wider mb-2">
                专辑
              </p>
              <AdaptiveTitle title={album.name} className="mb-4" />
              <div className="flex items-center gap-2 text-sm text-white/80">
                {albumMetaItems.map((item, index) => (
                  <Fragment key={item.key}>
                    {index > 0 && <span className="text-white/40">•</span>}
                    {item.content}
                  </Fragment>
                ))}
                {(album.contentRating === "explicit" ||
                  album.hasMusicVideo) && (
                  <span className="text-white/40">•</span>
                )}
                {album.hasMusicVideo && (
                  <span className="h-4 px-1.5 bg-white/10 rounded text-[10px] text-white/70 flex items-center gap-1">
                    <IoVideocam size={10} />
                    包含MV
                  </span>
                )}
                {album.contentRating === "explicit" && (
                  <span className="w-4 h-4 bg-white/20 rounded-sm text-[9px] text-white/80 flex items-center justify-center font-medium">
                    E
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Play button, Shuffle button, Save button and Download button */}
          <div ref={actionBarRef} className="flex items-center gap-4 mb-6">
            <button
              onClick={handlePlayPauseClick}
              className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            >
              <svg
                className="w-7 h-7 text-black"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                {isCurrentAlbumPlaying ? (
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                ) : (
                  <path d="M6 4l15 8-15 8V4z" />
                )}
              </svg>
            </button>
            <ShuffleButton
              isActive={localShuffle}
              onClick={() => setLocalShuffle(!localShuffle)}
              size="lg"
            />
            <AlbumSaveButton album={album} size="md" />
            {cacheableTrackIds.length > 0 && (
              <AlbumDownloadButton
                albumId={album.id}
                trackIds={cacheableTrackIds}
                size="md"
              />
            )}
          </div>

          {/* Track list */}
          <div className="space-y-1">
            {/* Header */}
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-2 text-sm text-white/60 border-b border-white/10">
              <span className="w-8 text-center">#</span>
              <span>标题</span>
              <span className="w-8"></span>
              <span className="w-12 flex items-center justify-end">
                <FiClock size={16} />
              </span>
              <span className="w-8"></span>
            </div>

            {/* Tracks */}
            {album.tracks?.map((track, index) => {
              const isSelected = selectedTrackId === track.id;
              const isHovered = hoveredTrackIndex === index;
              const isCurrentSong = currentSong?.id === track.id;
              const isMV = track.isMusicVideo;
              const isHighlighted = highlightedSongId === track.id;

              const showMvToast = () => {
                setMvToast(true);
                setTimeout(() => setMvToast(false), 2000);
              };

              return (
                <div
                  key={track.id}
                  ref={isHighlighted ? highlightedTrackRef : undefined}
                  data-track-row
                  onClick={() => {
                    setSelectedTrackId(track.id);
                    setHighlightedSongId(null);
                    if (isMV) showMvToast();
                  }}
                  onDoubleClick={() => !isMV && handlePlayTrack(track, index)}
                  onContextMenu={(e) => {
                    if (isMV) {
                      e.preventDefault();
                      showMvToast();
                    } else {
                      handleContextMenu(e, track);
                    }
                  }}
                  onMouseEnter={() => setHoveredTrackIndex(index)}
                  onMouseLeave={() => setHoveredTrackIndex(null)}
                  className={`grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 py-3 rounded-md cursor-pointer group transition-colors ${
                    isMV ? "opacity-60" : ""
                  } ${isHighlighted ? "animate-blink-highlight" : ""} ${isSelected ? "bg-white/20" : "hover:bg-white/10"}`}
                >
                  <div className="w-8 flex items-center justify-center">
                    {isMV ? (
                      <span className="text-sm text-white/30">{index + 1}</span>
                    ) : isCurrentSong &&
                      isPlaying &&
                      isCurrentAlbumSource &&
                      !isHovered ? (
                      <div className="equalizer">
                        <div className="equalizer-bar"></div>
                        <div className="equalizer-bar"></div>
                        <div className="equalizer-bar"></div>
                        <div className="equalizer-bar"></div>
                      </div>
                    ) : (
                      <>
                        <span
                          className={`text-sm ${isCurrentSong && isCurrentAlbumSource ? "text-spotify-green" : "text-white/60"} group-hover:hidden`}
                        >
                          {index + 1}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCurrentSong) {
                              togglePlay();
                            } else {
                              handlePlayTrack(track, index);
                            }
                          }}
                          className="hidden group-hover:flex items-center justify-center"
                        >
                          {isCurrentSong && isPlaying ? (
                            <IoPause className="text-white" size={14} />
                          ) : (
                            <IoPlay className="text-white" size={14} />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p
                        className={`font-medium truncate ${isMV ? "text-white/40" : isCurrentSong ? "text-spotify-green" : "text-white"}`}
                      >
                        {track.name}
                      </p>
                      {track.contentRating === "explicit" && (
                        <span className="flex-shrink-0 w-3 h-3 bg-white/20 rounded-sm text-[7px] text-white/80 flex items-center justify-center font-medium">
                          E
                        </span>
                      )}
                      {isMV && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 bg-white/10 rounded text-[10px] text-white/70 flex items-center gap-1">
                          <IoVideocam size={10} />
                          MV
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/60 truncate flex items-center gap-1">
                      <ClickableLink
                        text={track.artistName}
                        href={getArtistHref(
                          track.artistId || album.artists?.[0]?.id,
                        )}
                        disabled={!track.artistId && !album.artists?.[0]?.id}
                      />
                    </p>
                  </div>
                  <div className="w-8 flex items-center justify-center">
                    {!isMV && (
                      <LikeButton
                        song={track}
                        size="sm"
                        showOnHover={true}
                        forceShow={isHovered}
                      />
                    )}
                  </div>
                  <span
                    className={`w-12 text-sm flex items-center justify-end ${isMV ? "text-white/30" : "text-white/60"}`}
                  >
                    {formatDuration(track.duration)}
                  </span>
                  <div className="w-8 flex items-center justify-center">
                    {!isMV && (
                      <button
                        onClick={(e) => handleMenuButtonClick(e, track)}
                        className={`p-1 rounded-full hover:bg-white/10 transition-opacity ${isHovered ? "opacity-100" : "opacity-0"}`}
                      >
                        <IoEllipsisHorizontal className="text-white w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Album footer - release date and copyright */}
          <div className="mt-4 text-sm text-white/60">
            {album.releaseDate && <p>{formatReleaseDate(album.releaseDate)}</p>}
            {album.copyright && (
              <p className="mt-0.5 text-[11px]">{album.copyright}</p>
            )}
          </div>

          {localRelatedShelves.map((shelf) => {
            if (
              shelf.id === "more-by-artist" &&
              shelf.kind === "albums" &&
              shelf.albums &&
              shelf.albums.length > 0
            ) {
              const previewAlbums = shelf.albums.slice(
                0,
                LOCAL_RELATED_ALBUM_PREVIEW_LIMIT,
              );
              const hasMoreAlbums =
                shelf.albums.length > LOCAL_RELATED_ALBUM_PREVIEW_LIMIT;
              return (
                <section
                  key={shelf.id}
                  className="mt-8"
                  style={{ marginLeft: "-32px", marginRight: "-32px" }}
                  data-testid="local-related-more-by-artist"
                >
                  <div
                    className="flex items-center justify-between mb-4"
                    style={{ paddingLeft: "32px", paddingRight: "32px" }}
                  >
                    <h2 className="text-xl font-bold text-white">
                      {shelf.title}
                    </h2>
                    {hasMoreAlbums && (
                      <button
                        onClick={() =>
                          navigate(`/album/${albumId}/more-by-artist`)
                        }
                        className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                      >
                        <span>查看全部</span>
                        <FiChevronRight size={16} />
                      </button>
                    )}
                  </div>
                  <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                    {previewAlbums.map((item) => {
                      const isItemPlaying =
                        isPlaying &&
                        queueSource.type === "album" &&
                        queueSource.id === item.id;
                      const isItemSource =
                        queueSource.type === "album" &&
                        queueSource.id === item.id;
                      return (
                        <AlbumCard
                          key={item.id}
                          album={item}
                          pageContext="album"
                          isPlaying={isItemPlaying}
                          onPlay={async () => {
                            recordPlay("album", item.id);
                            if (isItemSource) {
                              play();
                              return;
                            }
                            try {
                              const itemDetail = await getAlbumDetail(item.id);
                              if (
                                itemDetail.tracks &&
                                itemDetail.tracks.length > 0
                              ) {
                                setQueue(itemDetail.tracks, 0, {
                                  type: "album",
                                  id: item.id,
                                  name: itemDetail.name,
                                });
                              }
                            } catch (err) {
                              console.error(
                                "Failed to load album tracks:",
                                err,
                              );
                            }
                          }}
                          onPause={pause}
                          onCardClick={handleAlbumCardClick}
                        />
                      );
                    })}
                  </ScrollableCardRow>
                </section>
              );
            }

            return null;
          })}

          {/* Other Versions */}
          {!isLocalAlbum && otherVersions.length > 0 && (
            <section
              className="mt-8"
              style={{ marginLeft: "-32px", marginRight: "-32px" }}
            >
              <div
                className="flex items-center justify-between mb-4"
                style={{ paddingLeft: "32px", paddingRight: "32px" }}
              >
                <h2 className="text-xl font-bold text-white">其他版本</h2>
                {otherVersions.length > PREVIEW_LIMIT && (
                  <button
                    onClick={() => navigate(`/album/${albumId}/other-versions`)}
                    className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                  >
                    <span>查看全部</span>
                    <FiChevronRight size={16} />
                  </button>
                )}
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {otherVersions.slice(0, PREVIEW_LIMIT).map((version) => {
                  const versionAsAlbum: Album = {
                    id: version.id,
                    name: version.name,
                    artistName: version.artistName,
                    artworkUrl: version.artworkUrl,
                    releaseDate: version.releaseDate,
                    trackCount: version.trackCount,
                    contentRating: version.contentRating,
                  };
                  const isVersionPlaying =
                    isPlaying &&
                    queueSource.type === "album" &&
                    queueSource.id === version.id;
                  const isVersionSource =
                    queueSource.type === "album" &&
                    queueSource.id === version.id;
                  return (
                    <AlbumCard
                      key={version.id}
                      album={versionAsAlbum}
                      pageContext="album"
                      isPlaying={isVersionPlaying}
                      onPlay={async () => {
                        recordPlay("album", version.id);
                        if (isVersionSource) {
                          play();
                          return;
                        }
                        try {
                          const versionDetail = await getAlbumDetail(
                            version.id,
                          );
                          if (
                            versionDetail.tracks &&
                            versionDetail.tracks.length > 0
                          ) {
                            setQueue(versionDetail.tracks, 0, {
                              type: "album",
                              id: version.id,
                              name: versionDetail.name,
                            });
                          }
                        } catch (err) {
                          console.error("Failed to load album tracks:", err);
                        }
                      }}
                      onPause={pause}
                      onCardClick={handleAlbumCardClick}
                    />
                  );
                })}
              </ScrollableCardRow>
            </section>
          )}

          {/* More By Artist */}
          {!isLocalAlbum && moreByArtist.albums.length > 0 && (
            <section
              className="mt-8"
              style={{ marginLeft: "-32px", marginRight: "-32px" }}
            >
              <div
                className="flex items-center justify-between mb-4"
                style={{ paddingLeft: "32px", paddingRight: "32px" }}
              >
                <h2 className="text-xl font-bold text-white">
                  更多{album?.artistName}的作品
                </h2>
                {(moreByArtist.albums.length > PREVIEW_LIMIT ||
                  moreByArtist.hasMore) && (
                  <button
                    onClick={() => navigate(`/album/${albumId}/more-by-artist`)}
                    className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                  >
                    <span>查看全部</span>
                    <FiChevronRight size={16} />
                  </button>
                )}
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {moreByArtist.albums.slice(0, PREVIEW_LIMIT).map((item) => {
                  const itemAsAlbum: Album = {
                    id: item.id,
                    name: item.name,
                    artistName: item.artistName,
                    artworkUrl: item.artworkUrl,
                    releaseDate: item.releaseDate,
                    trackCount: item.trackCount,
                    contentRating: item.contentRating,
                  };
                  const isItemPlaying =
                    isPlaying &&
                    queueSource.type === "album" &&
                    queueSource.id === item.id;
                  const isItemSource =
                    queueSource.type === "album" && queueSource.id === item.id;
                  return (
                    <AlbumCard
                      key={item.id}
                      album={itemAsAlbum}
                      pageContext="album"
                      isPlaying={isItemPlaying}
                      onPlay={async () => {
                        recordPlay("album", item.id);
                        if (isItemSource) {
                          play();
                          return;
                        }
                        try {
                          const itemDetail = await getAlbumDetail(item.id);
                          if (
                            itemDetail.tracks &&
                            itemDetail.tracks.length > 0
                          ) {
                            setQueue(itemDetail.tracks, 0, {
                              type: "album",
                              id: item.id,
                              name: itemDetail.name,
                            });
                          }
                        } catch (err) {
                          console.error("Failed to load album tracks:", err);
                        }
                      }}
                      onPause={pause}
                      onCardClick={handleAlbumCardClick}
                    />
                  );
                })}
              </ScrollableCardRow>
            </section>
          )}

          {/* Appears On */}
          {!isLocalAlbum && appearsOn.albums.length > 0 && (
            <section
              className="mt-8"
              style={{ marginLeft: "-32px", marginRight: "-32px" }}
            >
              <div
                className="flex items-center justify-between mb-4"
                style={{ paddingLeft: "32px", paddingRight: "32px" }}
              >
                <h2 className="text-xl font-bold text-white">
                  出现在以下内容中
                </h2>
                {(appearsOn.albums.length > PREVIEW_LIMIT ||
                  appearsOn.hasMore) && (
                  <button
                    onClick={() => navigate(`/album/${albumId}/appears-on`)}
                    className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                  >
                    <span>查看全部</span>
                    <FiChevronRight size={16} />
                  </button>
                )}
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {appearsOn.albums.slice(0, PREVIEW_LIMIT).map((item) => {
                  const itemAsAlbum: Album = {
                    id: item.id,
                    name: item.name,
                    artistName: item.artistName,
                    artworkUrl: item.artworkUrl,
                    releaseDate: item.releaseDate,
                    trackCount: item.trackCount,
                    contentRating: item.contentRating,
                  };
                  const isItemPlaying =
                    isPlaying &&
                    queueSource.type === "album" &&
                    queueSource.id === item.id;
                  const isItemSource =
                    queueSource.type === "album" && queueSource.id === item.id;
                  return (
                    <AlbumCard
                      key={item.id}
                      album={itemAsAlbum}
                      pageContext="album"
                      isPlaying={isItemPlaying}
                      onPlay={async () => {
                        recordPlay("album", item.id);
                        if (isItemSource) {
                          play();
                          return;
                        }
                        try {
                          const itemDetail = await getAlbumDetail(item.id);
                          if (
                            itemDetail.tracks &&
                            itemDetail.tracks.length > 0
                          ) {
                            setQueue(itemDetail.tracks, 0, {
                              type: "album",
                              id: item.id,
                              name: itemDetail.name,
                            });
                          }
                        } catch (err) {
                          console.error("Failed to load album tracks:", err);
                        }
                      }}
                      onPause={pause}
                      onCardClick={handleAlbumCardClick}
                    />
                  );
                })}
              </ScrollableCardRow>
            </section>
          )}

          {/* You Might Also Like */}
          {!isLocalAlbum && youMightAlsoLike.albums.length > 0 && (
            <section
              className="mt-8"
              style={{ marginLeft: "-32px", marginRight: "-32px" }}
            >
              <div
                className="flex items-center justify-between mb-4"
                style={{ paddingLeft: "32px", paddingRight: "32px" }}
              >
                <h2 className="text-xl font-bold text-white">你可能也喜欢</h2>
                {(youMightAlsoLike.albums.length > PREVIEW_LIMIT ||
                  youMightAlsoLike.hasMore) && (
                  <button
                    onClick={() =>
                      navigate(`/album/${albumId}/you-might-also-like`)
                    }
                    className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                  >
                    <span>查看全部</span>
                    <FiChevronRight size={16} />
                  </button>
                )}
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {youMightAlsoLike.albums.slice(0, PREVIEW_LIMIT).map((item) => {
                  const itemAsAlbum: Album = {
                    id: item.id,
                    name: item.name,
                    artistName: item.artistName,
                    artworkUrl: item.artworkUrl,
                    releaseDate: item.releaseDate,
                    trackCount: item.trackCount,
                    contentRating: item.contentRating,
                  };
                  const isItemPlaying =
                    isPlaying &&
                    queueSource.type === "album" &&
                    queueSource.id === item.id;
                  const isItemSource =
                    queueSource.type === "album" && queueSource.id === item.id;
                  return (
                    <AlbumCard
                      key={item.id}
                      album={itemAsAlbum}
                      pageContext="album"
                      isPlaying={isItemPlaying}
                      onPlay={async () => {
                        recordPlay("album", item.id);
                        if (isItemSource) {
                          play();
                          return;
                        }
                        try {
                          const itemDetail = await getAlbumDetail(item.id);
                          if (
                            itemDetail.tracks &&
                            itemDetail.tracks.length > 0
                          ) {
                            setQueue(itemDetail.tracks, 0, {
                              type: "album",
                              id: item.id,
                              name: itemDetail.name,
                            });
                          }
                        } catch (err) {
                          console.error("Failed to load album tracks:", err);
                        }
                      }}
                      onPause={pause}
                      onCardClick={handleAlbumCardClick}
                    />
                  );
                })}
              </ScrollableCardRow>
            </section>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {menuSong && (
        <SongContextMenu
          song={menuSong}
          isOpen={menuOpen}
          position={menuPosition}
          onClose={handleMenuClose}
          pageContext="album"
          closeOnScroll={menuCloseOnScroll}
        />
      )}

      {/* MV Toast */}
      {mvToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-white text-black rounded-lg shadow-lg text-sm font-medium z-50 animate-fade-in">
          暂不支持MV播放
        </div>
      )}
    </StickyHeader>
  );
}
