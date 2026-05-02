import {
  useEffect,
  useRef,
  useState,
  useCallback,
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import {
  BrowserRouter,
  Navigate,
  Routes,
  Route,
  useNavigate,
  useLocation,
  useParams,
} from "react-router-dom";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { getSetupStatus, type SetupStatus as AppSetupStatus } from "./api";
import { usePlayerStore } from "./store/playerStore";
import { useAuthStore } from "./store/authStore";
import { useNavigationStore } from "./store/navigationStore";
import ProtectedRoute from "./components/ProtectedRoute";
import {
  OverlayScrollbarsComponent,
  OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import OfflineFallback from "./components/OfflineFallback";

// 核心布局组件 - 保持直接导入以确保首屏渲染
import Sidebar from "./components/Sidebar";
import TopNavBar from "./components/TopNavBar";
import PlayerBar from "./components/PlayerBar";
import ResizablePanel from "./components/ResizablePanel";
import OfflineCacheProvider from "./components/OfflineCacheProvider";
import ErrorBoundary from "./components/ErrorBoundary";
import OfflineIndicator from "./components/OfflineIndicator";

type LazyWithPreload<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload?: () => Promise<void>;
  clearCache?: () => void;
};

// 存储所有懒加载组件的缓存清除函数
const lazyComponentCacheClearers: Array<() => void> = [];

/**
 * 清除所有懒加载组件的缓存，用于网络恢复后重新加载
 */
export function clearAllLazyComponentCache() {
  console.log("[lazy] Clearing all lazy component cache");
  lazyComponentCacheClearers.forEach((clear) => clear());
}

function lazyWithOfflineFallback<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyWithPreload<T> {
  let preloadPromise: Promise<{ default: T }> | null = null;
  let loadedOfflineFallback = false;

  const clearCache = () => {
    if (loadedOfflineFallback) {
      preloadPromise = null;
      loadedOfflineFallback = false;
    }
  };

  // 注册缓存清除函数
  lazyComponentCacheClearers.push(clearCache);

  const loader = async () => {
    try {
      const promise = preloadPromise ?? importer();
      const module = await promise;
      preloadPromise = promise;
      loadedOfflineFallback = false;
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkError =
        /ChunkLoadError|Failed to fetch dynamically imported module|importing a module script|MIME type/i.test(
          message,
        );
      const offline = typeof navigator !== "undefined" && !navigator.onLine;

      if (offline || isChunkError) {
        console.warn(
          "[lazy] Using offline fallback for chunk load failure:",
          message || error,
        );
        loadedOfflineFallback = true;
        // 不缓存离线回退结果，让下次可以重试
        preloadPromise = null;
        return { default: OfflineFallback as unknown as T };
      }
      throw error;
    }
  };

  const Component = lazy(loader) as LazyWithPreload<T>;
  Component.preload = () => {
    if (!preloadPromise) {
      preloadPromise = importer();
    }
    return preloadPromise.catch(() => undefined).then(() => undefined);
  };
  Component.clearCache = clearCache;

  return Component;
}

// 懒加载所有页面组件（带离线回退）
const AuthLayout = lazyWithOfflineFallback(
  () => import("./components/AuthLayout"),
);
const SearchPage = lazyWithOfflineFallback(
  () => import("./components/SearchPage"),
);
const PlaylistPage = lazyWithOfflineFallback(
  () => import("./components/PlaylistPage"),
);
const NowPlayingView = lazyWithOfflineFallback(
  () => import("./components/NowPlayingView"),
);
const AlbumDetailPage = lazyWithOfflineFallback(
  () => import("./components/AlbumDetailPage"),
);
const ArtistDetailPage = lazyWithOfflineFallback(
  () => import("./components/ArtistDetailPage"),
);
const ArtistContentPage = lazyWithOfflineFallback(
  () => import("./components/ArtistContentPage"),
);
const AlbumContentPage = lazyWithOfflineFallback(
  () => import("./components/AlbumContentPage"),
);
const LoginPage = lazyWithOfflineFallback(
  () => import("./components/LoginPage"),
);
const RegisterPage = lazyWithOfflineFallback(
  () => import("./components/RegisterPage"),
);
const VerifyEmailPage = lazyWithOfflineFallback(
  () => import("./components/VerifyEmailPage"),
);
const ForgotPasswordPage = lazyWithOfflineFallback(
  () => import("./components/ForgotPasswordPage"),
);
const LikedSongsPage = lazyWithOfflineFallback(
  () => import("./components/LikedSongsPage"),
);
const ExpandedLibraryPage = lazyWithOfflineFallback(
  () => import("./components/ExpandedLibraryPage"),
);
const ExpandedLyricsPage = lazyWithOfflineFallback(
  () => import("./components/ExpandedLyricsPage"),
);
const FullscreenView = lazyWithOfflineFallback(
  () => import("./components/FullscreenView"),
);
const SettingsPage = lazyWithOfflineFallback(
  () => import("./components/SettingsPage"),
);
const SetupPage = lazyWithOfflineFallback(
  () => import("./components/SetupPage"),
);
const AdminUsersPage = lazyWithOfflineFallback(
  () => import("./components/AdminUsersPage"),
);
const ProfilePage = lazyWithOfflineFallback(
  () => import("./components/ProfilePage"),
);
const TopTracksPage = lazyWithOfflineFallback(
  () => import("./components/TopTracksPage"),
);
const TopArtistsPage = lazyWithOfflineFallback(
  () => import("./components/TopArtistsPage"),
);
const RecentArtistsPage = lazyWithOfflineFallback(
  () => import("./components/RecentArtistsPage"),
);
const FollowedArtistsPage = lazyWithOfflineFallback(
  () => import("./components/FollowedArtistsPage"),
);
const PlaylistsPage = lazyWithOfflineFallback(
  () => import("./components/PlaylistsPage"),
);
const HomePage = lazyWithOfflineFallback(() => import("./components/HomePage"));
const LibraryBrowsePage = lazyWithOfflineFallback(
  () => import("./components/LibraryBrowsePage"),
);

// Mobile layout components - 直接导入以避免懒加载导致的动画时序问题
import MobileLayout from "./components/mobile/MobileLayout";
import MobileHomePage from "./components/mobile/MobileHomePage";
import MobileSearchPage from "./components/mobile/MobileSearchPage";
import MobileLibraryPage from "./components/mobile/MobileLibraryPage";
import MobileDetailPage from "./components/mobile/MobileDetailPage";
import MobileSettingsPage from "./components/mobile/MobileSettingsPage";
import MobilePlaybackQualityPage from "./components/mobile/MobilePlaybackQualityPage";
import MobileProfilePage from "./components/mobile/MobileProfilePage";
import MobileTopArtistsPage from "./components/mobile/MobileTopArtistsPage";
import MobileTopTracksPage from "./components/mobile/MobileTopTracksPage";
import MobileRecentArtistsPage from "./components/mobile/MobileRecentArtistsPage";
import MobileFollowedArtistsPage from "./components/mobile/MobileFollowedArtistsPage";
import MobilePlaylistsPage from "./components/mobile/MobilePlaylistsPage";
import MobileRecentlyPlayedPage from "./components/mobile/MobileRecentlyPlayedPage";
import MobileStateRestorer from "./components/mobile/MobileStateRestorer";
import MobileAdminPage from "./components/mobile/MobileAdminPage";
import MobileAdminTabWrapper from "./components/mobile/MobileAdminTabWrapper";
import ArtistDiscographyPage from "./pages/ArtistDiscographyPage";
import ArtistAllSongsPage from "./pages/ArtistAllSongsPage";
import ArtistTopSongsPage from "./pages/ArtistTopSongsPage";
import MoreByArtistPage from "./pages/MoreByArtistPage";

// 懒加载组件的 loading fallback
const PageLoading = () => (
  <div className="flex items-center justify-center h-full">
    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);
import { useLikedSongsStore } from "./store/likedSongsStore";
import { useLibraryAlbumsStore } from "./store/libraryAlbumsStore";
import { useFollowedArtistsStore } from "./store/followedArtistsStore";
import { usePlaylistsStore } from "./store/playlistsStore";
import { useLibraryStore } from "./store/libraryStore";
import { useRecentlyPlayedStore } from "./store/recentlyPlayedStore";
import { usePlaybackStatePersistence } from "./hooks/usePlaybackStatePersistence";
import { useMediaSession } from "./hooks/useMediaSession";
import { useScrollPosition } from "./hooks/useScrollPosition";
import { useIsMobile } from "./hooks/useIsMobile";
import { useBrowserBackInterceptor } from "./hooks/useNavigationHistory";
import {
  useOnlineStatus,
  subscribeToNetworkRecovery,
} from "./hooks/useOnlineStatus";
import { getProxiedImageUrl } from "./utils/image";
import {
  initIOSAudioSession,
  markAudioContextMayBeInvalid,
  isIOSPWAMode,
  recordPageHidden,
  mayHaveBeenKilled,
  clearAudioCache,
} from "./utils/audioSessionKeepAlive";
import { getPlatformInfo } from "./utils/audioSession";
import { getManagedAudioSourceUrl } from "./utils/audioElementSource";
import { debugLog } from "./components/mobile/MobileDebugPanel";
import { clearIOSAudioSessionFrozen } from "./store/playerStore";

const SETUP_STATUS_CACHE_KEY = "owl-setup-status-cache";

type Page =
  | "home"
  | "library"
  | "playlist"
  | "liked-songs"
  | "expanded-library";

// Auth routes that should use standalone AuthLayout
const AUTH_ROUTES = [
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
];

const AUTO_COLLAPSE_THRESHOLD = 800; // px
const SIDEBAR_MINI_WIDTH = 85; // px
const MAIN_CONTENT_MIN_WIDTH = 400; // px - keep main content readable on narrow screens

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const platformInfo = getPlatformInfo();
  const isSetupRoute = location.pathname === "/setup";

  // Mobile responsive detection (Requirement 1.1, 1.3)
  const isMobile = useIsMobile();

  // Intercept browser back button to use app-level navigation
  useBrowserBackInterceptor();

  // Initialize iOS audio session handler on mount
  useEffect(() => {
    initIOSAudioSession();
  }, []);

  const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);
  const audioRefCallback = useCallback((el: HTMLAudioElement | null) => {
    setAudioEl(el);
  }, []);
  // Main content area scrollbar control
  const osMainScrollRef = useRef<OverlayScrollbarsComponentRef>(null);
  const [mainViewport, setMainViewport] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (osMainScrollRef.current) {
      const instance = osMainScrollRef.current.osInstance();
      if (instance) {
        setMainViewport(instance.elements().viewport);
      }
    }
  }, []);

  // Use mainViewport for scroll position persistence
  useScrollPosition(mainViewport);

  const {
    setAudioRef,
    setProgress,
    setDuration,
    next,
    showNowPlaying,
    leftPanelWidth,
    rightPanelWidth,
    setLeftPanelWidth,
    setRightPanelWidth,
    // Media Session integration
    currentSong,
    isPlaying,
    progress,
    duration,
    play,
    pause,
    previous,
    seek,
    // Queue state for Media Session track navigation
    queue,
    queueIndex,
    playMode,
    // Expanded lyrics mode
    expandedLyricsMode,
    deactivateExpandedLyrics,
    lyricsVisible,
    // Fullscreen view
    showFullscreenView,
  } = usePlayerStore();
  const { initialize, isAuthenticated, isInitialized } = useAuthStore();
  const { setSearchState } = useNavigationStore();
  const { fetchLikedSongs, clearLikedSongs } = useLikedSongsStore();
  const { fetchLibraryAlbums, clearLibraryAlbums } = useLibraryAlbumsStore();
  const { fetchFollowedArtists, clearFollowedArtists } =
    useFollowedArtistsStore();
  const { fetchPlaylists, clearPlaylists } = usePlaylistsStore();
  const { isExpanded: isLibraryExpanded, setExpanded: setLibraryExpanded } =
    useLibraryStore();
  const { fetchRecentlyPlayed } = useRecentlyPlayedStore();
  const { loadPlaybackState, clearQueue } = usePlayerStore();
  const { isOnline } = useOnlineStatus();
  const preloadedCriticalChunksRef = useRef(false);
  const [setupStatus, setSetupStatus] = useState<AppSetupStatus | null>(null);
  const [setupStatusLoading, setSetupStatusLoading] = useState(true);
  const [setupStatusError, setSetupStatusError] = useState<string | null>(null);
  const setupStatusInitialLoadDoneRef = useRef(false);

  // Auto-save playback state with debounce
  usePlaybackStatePersistence();

  // Preload关键离线页面的代码块，确保离线刷新后仍可访问缓存内容
  useEffect(() => {
    if (!isOnline || preloadedCriticalChunksRef.current) return;
    preloadedCriticalChunksRef.current = true;

    const criticalModules: Array<LazyWithPreload<any>> = [
      AlbumDetailPage,
      PlaylistPage,
      LikedSongsPage,
      NowPlayingView,
      HomePage,
      SearchPage,
      SettingsPage,
    ];

    criticalModules.forEach((mod) => mod.preload?.());
  }, [isOnline]);

  // Media Session API integration for OS-level media controls
  // Calculate whether next/previous track is available based on queue state
  const hasNextTrack =
    queue.length > 0 &&
    (playMode === "loop" || // Loop mode always has next
      playMode === "single" || // Single loop always has next (same song)
      queueIndex < queue.length - 1); // Sequential mode: not at last song
  const hasPreviousTrack =
    queue.length > 0 &&
    (playMode === "loop" || // Loop mode always has previous
      playMode === "single" || // Single loop always has previous (same song)
      queueIndex > 0 || // Not at first song
      progress > 3); // Can restart current song if > 3 seconds in

  useMediaSession({
    currentSong,
    isPlaying,
    progress,
    duration,
    onPlay: play,
    onPause: pause,
    onNext: next,
    onPrevious: previous,
    onSeek: seek,
    hasNextTrack,
    hasPreviousTrack,
  });

  const HOME_TITLE = "OwlPlayer - Web Player : Music for everyone";

  // Track previous pathname for route change detection
  const prevPathnameRef = useRef(location.pathname);

  // When route changes, hide expanded lyrics (but keep now playing lyrics untouched)
  useEffect(() => {
    const prevPathname = prevPathnameRef.current;
    const currentPathname = location.pathname;

    // Only act on actual route changes
    if (prevPathname !== currentPathname) {
      prevPathnameRef.current = currentPathname;

      // If expanded lyrics mode is active and visible, hide it when navigating
      if (expandedLyricsMode && lyricsVisible) {
        usePlayerStore.getState().setLyricsVisible(false);
      }
    }
  }, [location.pathname, expandedLyricsMode, lyricsVisible]);

  // When playing, show current track in browser tab
  useEffect(() => {
    const baseTitle = "OwlPlayer";
    if (!currentSong || !isPlaying) return;
    document.title = `${currentSong.name} • ${currentSong.artistName} | ${baseTitle}`;
  }, [currentSong, isPlaying]);

  // When not playing, reflect main content in tab title
  useEffect(() => {
    if (isPlaying) return;
    const path = location.pathname;
    // Playlist/album/artist titles handled in their respective pages
    if (
      path.startsWith("/playlist") ||
      path === "/liked-songs" ||
      path.startsWith("/album") ||
      path.startsWith("/artist")
    ) {
      return;
    }
    if (path === "/") {
      document.title = HOME_TITLE;
      return;
    }
    document.title = "OwlPlayer";
  }, [location.pathname, isPlaying]);

  // Note: We no longer deactivate expanded lyrics mode when route changes or NowPlayingView closes
  // The expandedLyricsMode preference is preserved, and lyricsVisible controls visibility

  // 音乐库展开动画状态
  const [libraryAnimating, setLibraryAnimating] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [libraryExiting, setLibraryExiting] = useState(false);

  // Sidebar auto-collapse state
  const [sidebarAutoCollapsed, setSidebarAutoCollapsed] = useState(false);
  const [sidebarWidthBeforeCollapse, setSidebarWidthBeforeCollapse] =
    useState(leftPanelWidth);

  // 处理音乐库展开/收起动画
  useEffect(() => {
    if (isLibraryExpanded && !libraryVisible) {
      // 展开：立即显示并播放进入动画
      setLibraryVisible(true);
      setLibraryExiting(false);
      setLibraryAnimating(true);
      setTimeout(() => setLibraryAnimating(false), 300);
    } else if (!isLibraryExpanded && libraryVisible) {
      // 收起：播放退出动画后隐藏
      setLibraryExiting(true);
      setTimeout(() => {
        setLibraryVisible(false);
        setLibraryExiting(false);
      }, 250);
    }
  }, [isLibraryExpanded, libraryVisible]);

  // Handle sidebar auto-collapse on window resize
  useEffect(() => {
    const handleWindowResize = () => {
      const windowWidth = window.innerWidth;

      if (windowWidth < AUTO_COLLAPSE_THRESHOLD && !sidebarAutoCollapsed) {
        // Window is narrow and sidebar is not auto-collapsed yet
        setSidebarWidthBeforeCollapse(leftPanelWidth);
        setSidebarAutoCollapsed(true);
        setLeftPanelWidth(SIDEBAR_MINI_WIDTH); // Mini mode width
      } else if (
        windowWidth >= AUTO_COLLAPSE_THRESHOLD &&
        sidebarAutoCollapsed
      ) {
        // Window is wide enough and sidebar was auto-collapsed
        setSidebarAutoCollapsed(false);
        setLeftPanelWidth(sidebarWidthBeforeCollapse);
      }
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [
    sidebarAutoCollapsed,
    leftPanelWidth,
    setLeftPanelWidth,
    sidebarWidthBeforeCollapse,
  ]);

  // Main content area scrollbar visibility control
  const [showMainScrollbar, setShowMainScrollbar] = useState(false);
  const mainScrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleMainMouseEnter = useCallback(() => {
    if (mainScrollbarTimeoutRef.current) {
      clearTimeout(mainScrollbarTimeoutRef.current);
      mainScrollbarTimeoutRef.current = null;
    }
    setShowMainScrollbar(true);
  }, []);

  const handleMainMouseLeave = useCallback(() => {
    mainScrollbarTimeoutRef.current = setTimeout(() => {
      setShowMainScrollbar(false);
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (mainScrollbarTimeoutRef.current) {
        clearTimeout(mainScrollbarTimeoutRef.current);
      }
    };
  }, []);

  // Check if current route is an auth route
  const isOnAuthPage = isAuthRoute(location.pathname);

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  const refreshSetupStatus = useCallback(async () => {
    const isInitial = !setupStatusInitialLoadDoneRef.current;
    if (isInitial === true) {
      setSetupStatusLoading(true);
    }
    try {
      const next = await getSetupStatus();
      setSetupStatus(next);
      try {
        localStorage.setItem(SETUP_STATUS_CACHE_KEY, JSON.stringify(next));
      } catch {}
      setSetupStatusError(null);
    } catch (error) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      if (offline) {
        try {
          const cached = localStorage.getItem(SETUP_STATUS_CACHE_KEY);
          if (cached) {
            const parsed = JSON.parse(cached) as AppSetupStatus;
            setSetupStatus(parsed);
            setSetupStatusError(null);
            return;
          }
        } catch {}

        setSetupStatus(null);
        setSetupStatusError(null);
        return;
      }

      setSetupStatusError(
        error instanceof Error ? error.message : "Failed to load setup status",
      );
    } finally {
      if (isInitial === true) {
        setSetupStatusLoading(false);
      }
      setupStatusInitialLoadDoneRef.current = true;
    }
  }, []);

  useEffect(() => {
    void refreshSetupStatus();
  }, [refreshSetupStatus]);

  // Fetch liked songs, library albums, followed artists, playlists, recently played, and playback state when authenticated, clear on logout
  // Skip API calls when offline to prevent errors - data will be loaded from persisted stores
  // Wait for auth initialization before clearing to prevent wiping persisted data on page load
  useEffect(() => {
    if (!isInitialized) return;

    if (isAuthenticated) {
      // Always load playback state from localStorage (works offline)
      loadPlaybackState();

      // Only fetch from server when online
      if (isOnline) {
        fetchLikedSongs();
        fetchLibraryAlbums();
        fetchFollowedArtists();
        fetchPlaylists();
        fetchRecentlyPlayed();
      }
    } else {
      clearLikedSongs();
      clearLibraryAlbums();
      clearFollowedArtists();
      clearPlaylists();
      clearQueue();
    }
  }, [
    isInitialized,
    isAuthenticated,
    isOnline,
    fetchLikedSongs,
    clearLikedSongs,
    fetchLibraryAlbums,
    clearLibraryAlbums,
    fetchFollowedArtists,
    clearFollowedArtists,
    fetchPlaylists,
    clearPlaylists,
    fetchRecentlyPlayed,
    loadPlaybackState,
    clearQueue,
  ]);

  // Subscribe to network recovery events to immediately refresh data when network is restored
  // This ensures data is fetched right away without waiting for React's state update cycle
  useEffect(() => {
    if (!isInitialized || !isAuthenticated) return;

    const unsubscribe = subscribeToNetworkRecovery(() => {
      console.log("[App] Network recovered, refreshing user data...");
      // 清除懒加载组件的离线缓存，让页面可以重新加载
      clearAllLazyComponentCache();
      void refreshSetupStatus();
      fetchLikedSongs();
      fetchLibraryAlbums();
      fetchFollowedArtists();
      fetchPlaylists();
      fetchRecentlyPlayed();
    });

    return unsubscribe;
  }, [
    isInitialized,
    isAuthenticated,
    fetchLikedSongs,
    fetchLibraryAlbums,
    fetchFollowedArtists,
    fetchPlaylists,
    fetchRecentlyPlayed,
    refreshSetupStatus,
  ]);

  useEffect(() => {
    if (audioEl) {
      setAudioRef(audioEl);

      const audio = audioEl;

      // Track if early transition has been triggered for current song
      let earlyTransitionTriggered = false;
      let lastSongId: string | null = null;
      const resolveDisplayDuration = () => {
        const state = usePlayerStore.getState();
        const metadataDuration = state.currentSong?.duration
          ? state.currentSong.duration / 1000
          : 0;
        const managedSrc = getManagedAudioSourceUrl(audio);
        const currentSrc = managedSrc || audio.currentSrc || audio.src || "";
        const isBlobSource = !managedSrc && currentSrc.startsWith("blob:");

        if (!isFinite(audio.duration) || audio.duration <= 0) {
          // For blob sources (offline cache), ADTS blobs report Infinity for duration.
          // Use metadata duration as fallback so the UI shows correct total time.
          if (isBlobSource && metadataDuration > 0) {
            return metadataDuration;
          }
          return null;
        }

        if (metadataDuration <= 0) {
          return audio.duration;
        }

        const durationDifference = Math.abs(audio.duration - metadataDuration);
        const durationMatchesMetadata =
          durationDifference <= Math.max(2, metadataDuration * 0.02);
        const shouldPreferMetadataDuration =
          audio.duration > metadataDuration * 2 ||
          ((platformInfo.platform === "android" || isBlobSource) &&
            !durationMatchesMetadata);

        if (shouldPreferMetadataDuration) {
          console.log(
            "[Audio] Using metadata duration instead of reported audio.duration",
            {
              platform: platformInfo.platform,
              audioDuration: audio.duration,
              metadataDuration,
              currentSrc,
            },
          );
          return metadataDuration;
        }

        return audio.duration;
      };

      const handleTimeUpdate = () => {
        setProgress(audio.currentTime);

        // Early song transition for background playback
        // When in background, JS may be throttled/paused, so we trigger next() early
        // to ensure the transition happens before JS is completely suspended
        // This also acts as a fallback for the 'ended' event which may not fire reliably
        const state = usePlayerStore.getState();
        const currentSongId = state.currentSong?.id;

        // Reset early transition flag when song changes
        if (currentSongId !== lastSongId) {
          earlyTransitionTriggered = false;
          lastSongId = currentSongId || null;
        }

        // Trigger early transition when near end of song
        // In background: trigger earlier (1 second) because timeupdate may be throttled
        // In foreground: trigger very late (0.3 seconds) as backup for 'ended' event
        if (
          !earlyTransitionTriggered &&
          audio.duration > 0 &&
          audio.currentTime > 0
        ) {
          const timeRemaining = audio.duration - audio.currentTime;
          const isBackground = document.visibilityState === "hidden";
          const threshold = isBackground ? 1 : 0.3;

          if (timeRemaining <= threshold && timeRemaining > 0) {
            console.log(
              "[Audio] Early transition triggered, timeRemaining:",
              timeRemaining.toFixed(2),
              "background:",
              isBackground,
            );
            earlyTransitionTriggered = true;
            // Use setTimeout(0) to ensure this runs after current event processing
            setTimeout(() => {
              // Double-check we haven't already transitioned (e.g., by 'ended' event)
              const currentState = usePlayerStore.getState();
              if (currentState.currentSong?.id === currentSongId) {
                next();
              }
            }, 0);
          }
        }
      };

      const handleLoadedMetadata = () => {
        const nextDuration = resolveDisplayDuration();
        if (nextDuration !== null) {
          setDuration(nextDuration);
        }
        console.log(
          "[Audio] loadedmetadata, duration:",
          audio.duration,
          "readyState:",
          audio.readyState,
        );
      };

      // durationchange is more reliable on mobile browsers
      // It fires when the duration attribute changes (e.g., when metadata is loaded)
      const handleDurationChange = () => {
        const nextDuration = resolveDisplayDuration();
        if (nextDuration !== null) {
          setDuration(nextDuration);
        }
        console.log("[Audio] durationchange, duration:", audio.duration);
      };

      const handleEnded = () => {
        console.log("[Audio] ended");
        next();
      };

      // 添加更多事件监听用于调试
      const handleCanPlay = () => {
        console.log(
          "[Audio] canplay, readyState:",
          audio.readyState,
          "paused:",
          audio.paused,
        );
      };

      const handleCanPlayThrough = () => {
        console.log("[Audio] canplaythrough, readyState:", audio.readyState);
      };

      // 关键：同步 playing 事件到 store 状态
      const handlePlaying = () => {
        console.log(
          "[Audio] playing event fired, currentTime:",
          audio.currentTime,
        );
        // 如果音频开始播放但 store 显示暂停，同步状态
        const state = usePlayerStore.getState();
        if (!state.isPlaying) {
          console.log("[Audio] Syncing isPlaying to true");
          usePlayerStore.setState({ isPlaying: true });
        }
      };

      // 关键：同步 pause 事件到 store 状态
      // 注意：在后台时，浏览器可能会暂停音频，但我们不应该同步这个状态
      // 否则会导致后台播放停止
      const handlePause = () => {
        console.log(
          "[Audio] pause event fired, currentTime:",
          audio.currentTime,
        );
        // 如果页面在后台，不同步暂停状态（浏览器可能自动暂停了音频）
        if (document.visibilityState === "hidden") {
          console.log("[Audio] Page is hidden, not syncing pause state");
          return;
        }
        // 如果音频暂停但 store 显示播放，同步状态
        const state = usePlayerStore.getState();
        if (state.isPlaying) {
          console.log("[Audio] Syncing isPlaying to false");
          usePlayerStore.setState({ isPlaying: false });
        }
      };

      const handleWaiting = () => {
        console.log(
          "[Audio] waiting (buffering), readyState:",
          audio.readyState,
        );
      };

      const handleStalled = () => {
        console.log(
          "[Audio] stalled, readyState:",
          audio.readyState,
          "networkState:",
          audio.networkState,
        );
      };

      const handleError = () => {
        const error = audio.error;
        console.error("[Audio] error:", {
          code: error?.code,
          message: error?.message,
          src: audio.src?.slice(-50),
          readyState: audio.readyState,
          networkState: audio.networkState,
        });
        // 发生错误时重置播放状态
        usePlayerStore.getState().pause();
      };

      const handleLoadStart = () => {
        console.log("[Audio] loadstart, src:", audio.src?.slice(-60));
      };

      const handleProgress = () => {
        // 只在有实际进度时打印
        if (audio.buffered.length > 0) {
          const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
          if (bufferedEnd > 0) {
            console.log(
              "[Audio] progress, buffered:",
              bufferedEnd.toFixed(1),
              "s",
            );
          }
        }
      };

      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("durationchange", handleDurationChange);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("canplay", handleCanPlay);
      audio.addEventListener("canplaythrough", handleCanPlayThrough);
      audio.addEventListener("playing", handlePlaying);
      audio.addEventListener("pause", handlePause);
      audio.addEventListener("waiting", handleWaiting);
      audio.addEventListener("stalled", handleStalled);
      audio.addEventListener("error", handleError);
      audio.addEventListener("loadstart", handleLoadStart);
      audio.addEventListener("progress", handleProgress);

      return () => {
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("durationchange", handleDurationChange);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("canplay", handleCanPlay);
        audio.removeEventListener("canplaythrough", handleCanPlayThrough);
        audio.removeEventListener("playing", handlePlaying);
        audio.removeEventListener("pause", handlePause);
        audio.removeEventListener("waiting", handleWaiting);
        audio.removeEventListener("stalled", handleStalled);
        audio.removeEventListener("error", handleError);
        audio.removeEventListener("loadstart", handleLoadStart);
        audio.removeEventListener("progress", handleProgress);
      };
    }
  }, [audioEl, setAudioRef, setProgress, setDuration, next]);

  // Keep progress in sync and restore audio source/time when returning from background (PWA resilience)
  useEffect(() => {
    const syncProgress = () =>
      usePlayerStore.getState().syncProgressFromAudio();
    const restoreAudio = () =>
      usePlayerStore.getState().restoreAudioAfterResume();

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "hidden") {
        syncProgress();
        // iOS PWA: 记录页面隐藏时间
        if (isIOSPWAMode()) {
          recordPageHidden();
        }
      } else if (document.visibilityState === "visible") {
        debugLog("[App] Page visible");

        const state = usePlayerStore.getState();
        const audio = state.audioRef;

        // iOS PWA 特殊处理 - 只在被杀后台时才干预
        if (isIOSPWAMode()) {
          markAudioContextMayBeInvalid();

          const wasKilled = mayHaveBeenKilled();
          if (wasKilled) {
            debugLog("[App] PWA may have been killed, clearing audio cache...");
            await clearAudioCache();
          }

          if (audio && state.isPlaying) {
            // 检查音频是否还在正常播放
            const audioHealthy = !audio.paused && audio.readyState >= 2;

            if (audioHealthy) {
              // 音频正常，不需要干预
              debugLog("[App] iOS PWA: Audio still healthy, skipping recovery");
              clearIOSAudioSessionFrozen();
            } else if (wasKilled) {
              // 只有被杀后台才尝试恢复
              debugLog("[App] iOS PWA: Was killed, attempting recovery...");
              debugLog(
                "[App] iOS PWA: paused=",
                audio.paused,
                "readyState=",
                audio.readyState,
              );
              try {
                await audio.play();
                debugLog("[App] iOS PWA: play() succeeded");
                clearIOSAudioSessionFrozen();
              } catch (e) {
                debugLog("[App] iOS PWA: play() failed:", (e as Error).message);
              }
            }
            // 如果没被杀后台但音频暂停了，让 restoreAudio() 处理
          }
        }

        restoreAudio();
      }
    };

    const handlePageHide = () => {
      syncProgress();
      // iOS PWA: 记录页面隐藏时间
      if (isIOSPWAMode()) {
        recordPageHidden();
      }
    };

    const handlePageShow = async (event: PageTransitionEvent) => {
      // iOS PWA: 如果是从 bfcache 恢复，标记 AudioContext 可能已失效
      if (event.persisted && isIOSPWAMode()) {
        console.log(
          "[App] Page restored from bfcache, marking AudioContext as potentially invalid",
        );
        markAudioContextMayBeInvalid();
        // 从 bfcache 恢复通常意味着被杀后台了
        console.log("[App] Clearing audio cache after bfcache restore...");
        await clearAudioCache();
      }
      restoreAudio();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  const getCurrentPage = (): Page => {
    const path = location.pathname;
    if (path.startsWith("/playlist")) return "playlist";
    if (path === "/library") return "library";
    if (path === "/liked-songs") return "liked-songs";
    return "home";
  };

  // Get detailed current page string for active state detection (e.g., 'playlist-123', 'album-456')
  const getDetailedCurrentPage = (): string => {
    const path = location.pathname;
    // Match /playlist/:id
    const playlistMatch = path.match(/^\/playlist\/(.+)$/);
    if (playlistMatch) return `playlist-${playlistMatch[1]}`;
    // Match /album/:id
    const albumMatch = path.match(/^\/album\/(.+)$/);
    if (albumMatch) return `album-${albumMatch[1]}`;
    // Match /artist/:id
    const artistMatch = path.match(/^\/artist\/(.+)$/);
    if (artistMatch) return `artist-${artistMatch[1]}`;
    // Liked songs
    if (path === "/liked-songs") return "liked-songs";
    // Default
    return path;
  };

  const handleNavigate = (page: Page) => {
    switch (page) {
      case "library":
        navigate("/library");
        break;
      case "liked-songs":
        navigate("/liked-songs");
        break;
      case "expanded-library":
        navigate("/expanded-library");
        break;
      case "home":
      default:
        navigate("/");
        break;
    }
  };

  const handleSelectAlbum = (albumId: string) => {
    navigate(`/album/${albumId}`);
  };

  const handleSelectArtist = (artistId: string) => {
    navigate(`/artist/${artistId}`);
  };

  const handleSelectPlaylist = (id: string) => {
    navigate(`/playlist/${id}`);
  };

  const handleSearch = (query: string) => {
    setSearchState(query, undefined);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  // Check if we have a token in localStorage but not yet initialized in state
  const hasStoredToken = localStorage.getItem("auth-token") !== null;

  if (setupStatusLoading) {
    return (
      <div className="h-screen bg-black overflow-hidden text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (setupStatusError) {
    return (
      <div className="h-screen bg-gradient-to-b from-neutral-900 to-black overflow-hidden text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-neutral-900/80 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white text-center mb-4">
            初始化状态加载失败
          </h1>
          <p className="text-sm text-white/60 text-center mb-6">
            {setupStatusError}
          </p>
          <button onClick={() => void refreshSetupStatus()} className="w-full py-3 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full transition-colors">
            重试
          </button>
        </div>
      </div>
    );
  }

  if (setupStatus?.setup_required) {
    if (!isSetupRoute) {
      return <Navigate to="/setup" replace />;
    }

    return (
      <div className="h-screen bg-black overflow-hidden text-white">
        <audio ref={audioRefCallback} />
        <Suspense fallback={<PageLoading />}>
          <SetupPage onStatusChange={setSetupStatus} />
        </Suspense>
      </div>
    );
  }

  if (isSetupRoute) {
    return <Navigate to={isAuthenticated ? "/" : "/login"} replace />;
  }

  // Mobile layout - viewport width < 768px (Requirement 1.1, 1.3)
  // Check mobile first to ensure proper auth page rendering on mobile devices
  if (isMobile) {
    // Mobile auth pages - use mobile-optimized layout
    if (isOnAuthPage) {
      return (
        <div className="h-screen bg-black overflow-hidden text-white">
          <audio ref={audioRefCallback} />
          <Suspense fallback={<PageLoading />}>
            <AuthLayout>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route
                  path="/forgot-password"
                  element={<ForgotPasswordPage />}
                />
              </Routes>
            </AuthLayout>
          </Suspense>
        </div>
      );
    }

    // Not authenticated and no stored token - redirect to login immediately
    // This prevents MobileLayout from rendering before redirect
    if (!isAuthenticated && !hasStoredToken) {
      return (
        <div className="h-screen bg-black overflow-hidden text-white">
          <audio ref={audioRefCallback} />
          <Suspense fallback={<PageLoading />}>
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          </Suspense>
        </div>
      );
    }

    // Mobile main layout
    return (
      <div className="h-screen bg-black overflow-hidden text-white">
        {/* Hidden audio element */}
        <audio ref={audioRefCallback} />

        {/* State restoration for PWA standalone mode (Requirement 10.2) */}
        <MobileStateRestorer />

        <MobileLayout>
          <Routes>
            {/* Main tabs (/, /search, /library) are cached in MobileLayout */}
            {/* These routes render null as the actual content is handled by MobileLayout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <></>
                </ProtectedRoute>
              }
            />
            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <></>
                </ProtectedRoute>
              }
            />
            <Route
              path="/library"
              element={
                <ProtectedRoute>
                  <></>
                </ProtectedRoute>
              }
            />

            {/* Detail pages - not cached */}
            <Route
              path="/liked-songs"
              element={
                <ProtectedRoute>
                  <MobileDetailPage variant="liked" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/playlist/:playlistId"
              element={
                <ProtectedRoute>
                  <MobilePlaylistWrapper />
                </ProtectedRoute>
              }
            />
            <Route
              path="/album/:albumId"
              element={
                <ProtectedRoute>
                  <MobileAlbumWrapper />
                </ProtectedRoute>
              }
            />
            <Route
              path="/artist/:artistId"
              element={
                <ProtectedRoute>
                  <ArtistDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/artist/:artistId/discography"
              element={
                <ProtectedRoute>
                  <ArtistDiscographyPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/artist/:artistId/top-songs"
              element={
                <ProtectedRoute>
                  <ArtistTopSongsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/artist/:artistId/all-songs"
              element={
                <ProtectedRoute>
                  <ArtistAllSongsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/album/:albumId/more-by-artist/:artistName"
              element={
                <ProtectedRoute>
                  <MoreByArtistPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <MobileSettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/email"
              element={
                <ProtectedRoute>
                  <SettingsPage initialTab="email" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/password"
              element={
                <ProtectedRoute>
                  <SettingsPage initialTab="password" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/quality"
              element={
                <ProtectedRoute>
                  <MobilePlaybackQualityPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/data"
              element={
                <ProtectedRoute>
                  <SettingsPage initialTab="data" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <MobileProfilePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/top-artists"
              element={
                <ProtectedRoute>
                  <MobileTopArtistsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/top-tracks"
              element={
                <ProtectedRoute>
                  <MobileTopTracksPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/recent-artists"
              element={
                <ProtectedRoute>
                  <MobileRecentArtistsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/followed-artists"
              element={
                <ProtectedRoute>
                  <MobileFollowedArtistsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile/playlists"
              element={
                <ProtectedRoute>
                  <MobilePlaylistsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/songs"
              element={
                <ProtectedRoute>
                  <LibraryBrowsePage kind="songs" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/albums"
              element={
                <ProtectedRoute>
                  <LibraryBrowsePage kind="albums" />
                </ProtectedRoute>
              }
            />
            <Route
              path="/artists"
              element={
                <ProtectedRoute>
                  <LibraryBrowsePage kind="artists" />
                </ProtectedRoute>
              }
            />
            {/* Recently Played page */}
            <Route
              path="/recently-played"
              element={
                <ProtectedRoute>
                  <MobileRecentlyPlayedPage />
                </ProtectedRoute>
              }
            />
            {/* Admin pages */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <MobileAdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/:tab"
              element={
                <ProtectedRoute>
                  <MobileAdminTabWrapper />
                </ProtectedRoute>
              }
            />
          </Routes>
        </MobileLayout>
      </div>
    );
  }

  // Desktop auth pages use standalone AuthLayout
  if (isOnAuthPage) {
    return (
      <div className="h-screen bg-black overflow-hidden text-white">
        <audio ref={audioRefCallback} />
        <Suspense fallback={<PageLoading />}>
          <AuthLayout>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            </Routes>
          </AuthLayout>
        </Suspense>
      </div>
    );
  }

  // Not authenticated and no stored token - redirect to login immediately
  // This prevents main layout from rendering before redirect
  if (!isAuthenticated && !hasStoredToken) {
    return (
      <div className="h-screen bg-black overflow-hidden text-white">
        <audio ref={audioRefCallback} />
        <Suspense fallback={<PageLoading />}>
          <AuthLayout>
            <LoginPage />
          </AuthLayout>
        </Suspense>
      </div>
    );
  }

  // Desktop layout with TopNavBar, Sidebar, and PlayerBar
  return (
    <div className="h-screen h-screen-dynamic flex flex-col bg-black overflow-hidden text-white">
      {/* Hidden audio element */}
      <audio ref={audioRefCallback} />

      {/* Hidden preload container - keeps shared layout elements in DOM to avoid reload on component switch */}
      {currentSong?.artworkUrl && (
        <div
          className="fixed opacity-0 pointer-events-none -z-50"
          aria-hidden="true"
        >
          {/* Preload images */}
          <img src={getProxiedImageUrl(currentSong.artworkUrl, 128)} alt="" />
          <img src={getProxiedImageUrl(currentSong.artworkUrl, 160)} alt="" />
          <img src={getProxiedImageUrl(currentSong.artworkUrl, 400)} alt="" />
          <img src={getProxiedImageUrl(currentSong.artworkUrl, 600)} alt="" />
          <img src={getProxiedImageUrl(currentSong.artworkUrl, 800)} alt="" />

          {/* Preload text content for layout animation */}
          <div className="w-16 h-16">
            <span>{currentSong.name}</span>
            <span>{currentSong.artistName}</span>
          </div>
        </div>
      )}

      {/* Top Navigation Bar */}
      <TopNavBar onSearch={handleSearch} />

      {/* Main content area - with top padding for fixed TopNavBar + safe area */}
      <LayoutGroup id="global-nowplaying-shared">
        <div
          className="flex-1 flex overflow-hidden overflow-x-hidden"
          style={{ paddingTop: "calc(64px + env(safe-area-inset-top, 0px))" }}
        >
          {/* Expanded Library - overlays sidebar and main content when active */}
          {(libraryVisible || libraryExiting) && (
            <div
              className="absolute z-40 overflow-hidden bg-neutral-900 rounded-lg"
              style={{
                top: 72, // TopNavBar height (64px) + margin (8px)
                left: 8,
                right: showNowPlaying ? rightPanelWidth + 8 : 8,
                bottom: 86, // PlayerBar height (78px) + margin (8px)
                minWidth: MAIN_CONTENT_MIN_WIDTH + leftPanelWidth, // Match main content stop point
              }}
            >
              <Suspense fallback={<PageLoading />}>
                <ExpandedLibraryPage
                  onBack={() => setLibraryExpanded(false)}
                  onSelectPlaylist={(id) => {
                    setLibraryExpanded(false);
                    handleSelectPlaylist(id);
                  }}
                  onSelectAlbum={(id) => {
                    setLibraryExpanded(false);
                    handleSelectAlbum(id);
                  }}
                  onSelectArtist={(id) => {
                    setLibraryExpanded(false);
                    handleSelectArtist(id);
                  }}
                  onNavigateToLikedSongs={() => {
                    setLibraryExpanded(false);
                    navigate("/liked-songs");
                  }}
                  isExiting={libraryExiting}
                  currentPage={getDetailedCurrentPage()}
                  onNavigate={(page) => {
                    setLibraryExpanded(false);
                    if (page === "liked-songs") {
                      navigate("/liked-songs");
                    } else {
                      navigate(`/${page}`);
                    }
                  }}
                />
              </Suspense>
            </div>
          )}

          {/* Sidebar - always rendered */}
          <ResizablePanel
            minWidth={280}
            maxWidth={420}
            defaultWidth={leftPanelWidth}
            side="left"
            onWidthChange={setLeftPanelWidth}
            className="bg-black z-20"
            snapWidth={SIDEBAR_MINI_WIDTH}
            snapThreshold={200}
          >
            <Sidebar
              currentPage={getDetailedCurrentPage()}
              onNavigate={handleNavigate}
              onSelectPlaylist={handleSelectPlaylist}
              onSelectArtist={handleSelectArtist}
              onSelectAlbum={handleSelectAlbum}
              width={leftPanelWidth}
              onCollapse={() =>
                setLeftPanelWidth(
                  leftPanelWidth < 100 ? 280 : SIDEBAR_MINI_WIDTH,
                )
              }
            />
          </ResizablePanel>

          {/* Main content - always rendered */}
          <main
            className={`flex-1 bg-[#121212] rounded-lg my-2 mr-2 relative z-10 transition-all duration-250 ease-out overflow-hidden`}
            style={{ minWidth: MAIN_CONTENT_MIN_WIDTH }}
          >
            {/* Expanded lyrics - always rendered when song exists to keep layoutId elements in DOM */}
            {currentSong && (
              <motion.div
                className="absolute inset-0 h-full z-10"
                initial={false}
                animate={{
                  opacity: expandedLyricsMode && lyricsVisible ? 1 : 0,
                  scale: expandedLyricsMode && lyricsVisible ? 1 : 0.96,
                }}
                transition={{ duration: 0.55, ease: [0.22, 0.7, 0.36, 1] }}
                style={{
                  pointerEvents:
                    expandedLyricsMode && lyricsVisible ? "auto" : "none",
                }}
              >
                <Suspense fallback={<PageLoading />}>
                  <ExpandedLyricsPage onMinimize={deactivateExpandedLyrics} />
                </Suspense>
              </motion.div>
            )}
            {/* Main routes - always rendered underneath */}
            <motion.div
              initial={false}
              animate={{
                opacity: expandedLyricsMode && lyricsVisible ? 0 : 1,
              }}
              transition={{ duration: 0.15 }}
              style={{
                pointerEvents:
                  expandedLyricsMode && lyricsVisible ? "none" : "auto",
              }}
              className="h-full" // Ensure motion.div takes full height
            >
              <OverlayScrollbarsComponent
                ref={osMainScrollRef}
                className={`h-full ${showMainScrollbar ? "scrollbar-visible" : ""}`}
                onMouseEnter={handleMainMouseEnter}
                onMouseLeave={handleMainMouseLeave}
                options={{
                  scrollbars: {
                    theme: "os-theme-light",
                    autoHide: "move",
                    clickScroll: true,
                  },
                }}
                events={{
                  initialized: (instance) => {
                    setMainViewport(instance.elements().viewport);
                  },
                }}
              >
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    {/* Protected routes - require login and active account */}
                    <Route
                      path="/"
                      element={
                        <ProtectedRoute>
                          <HomePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/search"
                      element={
                        <ProtectedRoute>
                          <SearchPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/library"
                      element={
                        <ProtectedRoute>
                          <LibraryPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/liked-songs"
                      element={
                        <ProtectedRoute>
                          <LikedSongsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/playlist/:playlistId"
                      element={
                        <ProtectedRoute>
                          <PlaylistPageWrapper />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/album/:albumId"
                      element={
                        <ProtectedRoute>
                          <AlbumDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/album/:albumId/other-versions"
                      element={
                        <ProtectedRoute>
                          <AlbumContentPage contentType="other-versions" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/album/:albumId/more-by-artist"
                      element={
                        <ProtectedRoute>
                          <AlbumContentPage contentType="more-by-artist" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/album/:albumId/appears-on"
                      element={
                        <ProtectedRoute>
                          <AlbumContentPage contentType="appears-on" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/album/:albumId/you-might-also-like"
                      element={
                        <ProtectedRoute>
                          <AlbumContentPage contentType="you-might-also-like" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId"
                      element={
                        <ProtectedRoute>
                          <ArtistDetailPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/top-songs"
                      element={
                        <ProtectedRoute>
                          <ArtistTopSongsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/all-songs"
                      element={
                        <ProtectedRoute>
                          <ArtistAllSongsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/albums"
                      element={
                        <ProtectedRoute>
                          <ArtistContentPage contentType="albums" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/singles"
                      element={
                        <ProtectedRoute>
                          <ArtistContentPage contentType="singles" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/essential"
                      element={
                        <ProtectedRoute>
                          <ArtistContentPage contentType="albums" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/live"
                      element={
                        <ProtectedRoute>
                          <ArtistContentPage contentType="live" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/compilations"
                      element={
                        <ProtectedRoute>
                          <ArtistContentPage contentType="compilations" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/appears-on"
                      element={
                        <ProtectedRoute>
                          <ArtistContentPage contentType="appears-on" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artist/:artistId/discography"
                      element={
                        <ProtectedRoute>
                          <ArtistDiscographyPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/album/:albumId/more-by-artist/:artistName"
                      element={
                        <ProtectedRoute>
                          <MoreByArtistPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/settings"
                      element={
                        <ProtectedRoute>
                          <SettingsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile"
                      element={
                        <ProtectedRoute>
                          <ProfilePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/top-tracks"
                      element={
                        <ProtectedRoute>
                          <TopTracksPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/top-artists"
                      element={
                        <ProtectedRoute>
                          <TopArtistsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/recent-artists"
                      element={
                        <ProtectedRoute>
                          <RecentArtistsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/followed-artists"
                      element={
                        <ProtectedRoute>
                          <FollowedArtistsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/profile/playlists"
                      element={
                        <ProtectedRoute>
                          <PlaylistsPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/songs"
                      element={
                        <ProtectedRoute>
                          <LibraryBrowsePage kind="songs" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/albums"
                      element={
                        <ProtectedRoute>
                          <LibraryBrowsePage kind="albums" />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/artists"
                      element={
                        <ProtectedRoute>
                          <LibraryBrowsePage kind="artists" />
                        </ProtectedRoute>
                      }
                    />
                    {/* Admin routes - require login, active account, and admin role */}
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requireAdmin>
                          <Navigate to="/admin/users" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/users"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminUsersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/system"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminUsersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/email"
                      element={
                        <ProtectedRoute requireAdmin>
                          <Navigate to="/admin/system" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/scan"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminUsersPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/scrape"
                      element={
                        <ProtectedRoute requireAdmin>
                          <AdminUsersPage />
                        </ProtectedRoute>
                      }
                    />
                  </Routes>
                </Suspense>
              </OverlayScrollbarsComponent>
            </motion.div>
          </main>

          {/* Right Panel (Now Playing) - always in the same position, never remounts */}
          <AnimatePresence>
            {showNowPlaying && (
              <motion.div
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="my-2 mr-2 flex-shrink-0"
                style={{ width: rightPanelWidth, height: "calc(100% - 16px)" }}
              >
                <ResizablePanel
                  minWidth={280}
                  maxWidth={480}
                  defaultWidth={rightPanelWidth}
                  side="right"
                  onWidthChange={setRightPanelWidth}
                  className="bg-black z-20 rounded-lg border-l border-white/10 h-full"
                >
                  <Suspense fallback={<PageLoading />}>
                    <NowPlayingView />
                  </Suspense>
                </ResizablePanel>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      {/* Player bar - hidden when fullscreen view is active (it renders its own) */}
      {!showFullscreenView && <PlayerBar />}

      {/* Fullscreen Now Playing View */}
      <AnimatePresence>
        {showFullscreenView && currentSong && (
          <Suspense fallback={null}>
            <FullscreenView />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}

// HomePage is lazy loaded at the top of the file

function LibraryPage() {
  return (
    <div className="p-8 text-white">
      <h1 className="text-3xl font-bold mb-6">音乐库</h1>
      <p className="text-white/60">你的歌单将显示在这里</p>
    </div>
  );
}

function PlaylistPageWrapper() {
  const { playlistId } = useParams();
  if (!playlistId) return <SearchPage />;
  return <PlaylistPage playlistId={playlistId} />;
}

function MobilePlaylistWrapper() {
  const { playlistId } = useParams();
  if (!playlistId) return null;
  return <MobileDetailPage variant="playlist" id={playlistId} />;
}

function MobileAlbumWrapper() {
  const { albumId } = useParams();
  if (!albumId) return null;
  return <MobileDetailPage variant="album" id={albumId} />;
}

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <OfflineCacheProvider>
          <OfflineIndicator />
          <AppContent />
        </OfflineCacheProvider>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
