import React, {
  useState,
  useCallback,
  useRef,
  Suspense,
  useEffect,
  ReactNode,
} from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useNavigationStore, SourceTab } from '../../store/navigationStore';
import { useMobileStatePersistence } from '../../hooks/useMobileStatePersistence';
import { useNavigationDirection, useNavigationDirectionStore } from '../../hooks/useNavigationDirection';
import { useNavigationHistory } from '../../hooks/useNavigationHistory';
import BottomNavigation from './BottomNavigation';
import MiniPlayer from './MiniPlayer';
import MobileNowPlaying from './MobileNowPlaying';
import MobileToast from './MobileToast';
import OfflineIndicator from './OfflineIndicator';
import MobileHomePage from './MobileHomePage';
import MobileSearchPage from './MobileSearchPage';
import MobileLibraryPage from './MobileLibraryPage';
import MobileHomeHeader from './MobileHomeHeader';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { MobileInactiveAccountPage } from '../ProtectedRoute';

// Loading fallback for lazy-loaded page components
const PageLoading = () => (
  <div className="flex items-center justify-center h-full">
    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
  </div>
);

// Main tab routes that should be cached (always mounted)
const CACHED_TAB_ROUTES = ['/', '/search', '/library'];

// Map main tab paths to sourceTab values
const PATH_TO_SOURCE_TAB: Record<string, SourceTab> = {
  '/': 'home',
  '/search': 'search',
  '/library': 'library',
};

// Paths that belong to specific tabs (not detail pages)
const TAB_OWNED_PATHS: Record<SourceTab, string[]> = {
  home: ['/recommendations', '/collection', '/recently-played'],
  search: [],
  library: ['/liked-songs'],
};

// Maximum number of pages to keep in the navigation stack cache
const MAX_PAGE_STACK_SIZE = 10;

interface CachedPage {
  path: string;
  element: ReactNode;
  scrollTop: number;
  // The artist context this page belongs to (if any)
  artistContext: string | null;
  // Unique key for React reconciliation - ensures component instance is preserved
  instanceKey: string;
}

// Counter for generating unique instance keys
let instanceKeyCounter = 0;
function generateInstanceKey(): string {
  return `page-instance-${++instanceKeyCounter}`;
}

// Extract artist ID from a path if it's an artist-related page
function getArtistContext(path: string): string | null {
  // Match /artist/:id or /artist/:id/...
  const artistMatch = path.match(/^\/artist\/([^/]+)/);
  if (artistMatch) {
    return artistMatch[1];
  }
  return null;
}

// Check if navigating to a different artist
function isDifferentArtist(currentPath: string, newPath: string): boolean {
  const currentArtist = getArtistContext(currentPath);
  const newArtist = getArtistContext(newPath);
  
  // If both are artist pages but different artists
  if (currentArtist && newArtist && currentArtist !== newArtist) {
    return true;
  }
  
  return false;
}

interface MobileLayoutProps {
  children: React.ReactNode;
}

/**
 * MobileLayout component - Main layout container for mobile UI.
 * Implements layout structure: content area + MiniPlayer + BottomNavigation.
 * Handles safe area insets for notched devices.
 * Integrates state persistence for PWA standalone mode.
 * Implements page stack caching for smooth back navigation.
 * 
 * Requirements: 1.4, 2.1, 10.2
 */
export default function MobileLayout({ children }: MobileLayoutProps) {
  const { currentSong } = usePlayerStore();
  const { isAuthenticated, user } = useAuthStore();
  const { setSourceTab } = useNavigationStore();
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const location = useLocation();
  const navigationDirection = useNavigationDirection();
  
  // Initialize navigation history tracking for mobile
  // This ensures the navigation stack is updated on every route change
  useNavigationHistory();

  // Auto-set sourceTab when navigating to main tabs or tab-owned paths
  useEffect(() => {
    const path = location.pathname;
    
    // Check if it's a main tab path
    if (PATH_TO_SOURCE_TAB[path]) {
      setSourceTab(PATH_TO_SOURCE_TAB[path]);
      return;
    }
    
    // Check if it's a tab-owned path
    for (const [tab, paths] of Object.entries(TAB_OWNED_PATHS)) {
      if (paths.some(p => path.startsWith(p))) {
        setSourceTab(tab as SourceTab);
        return;
      }
    }
    // For detail pages (album, artist, playlist), keep the current sourceTab
  }, [location.pathname, setSourceTab]);

  // Only show cached tabs when authenticated and active
  const canShowCachedTabs = isAuthenticated && user?.is_active;

  // Track if we're on a cached tab route
  const isCachedTabRoute = CACHED_TAB_ROUTES.includes(location.pathname);
  const currentTab = location.pathname;

  // Page stack for caching previous pages during forward navigation
  const [pageStack, setPageStack] = useState<CachedPage[]>([]);
  const pageStackScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Refs for each cached tab's scroll container
  const homeScrollRef = useRef<HTMLDivElement>(null);
  const searchScrollRef = useRef<HTMLDivElement>(null);
  const libraryScrollRef = useRef<HTMLDivElement>(null);
  // Ref for current non-cached page
  const mainScrollRef = useRef<HTMLDivElement>(null);

  // Save/restore scroll position for cached tabs
  const scrollPositions = useRef<Record<string, number>>({});

  // Track previous path and children for page stack management
  const prevPathRef = useRef<string>(location.pathname);
  const prevChildrenRef = useRef<ReactNode>(children);
  // Resolve the scroll container for a given path (cached tabs, cached pages, or current main container)
  const getScrollContainerForPath = useCallback((path: string): HTMLDivElement | null => {
    if (path === '/') return homeScrollRef.current;
    if (path === '/search') return searchScrollRef.current;
    if (path === '/library') return libraryScrollRef.current;

    const cachedRef = pageStackScrollRefs.current.get(path);
    if (cachedRef) return cachedRef;

    return mainScrollRef.current;
  }, []);

  // Persist & restore scroll for whichever container is active on mobile
  const [activeScrollContainer, setActiveScrollContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncActiveContainer = () => {
      setActiveScrollContainer(getScrollContainerForPath(location.pathname));
    };

    // Run immediately and schedule another tick to wait for refs to attach
    syncActiveContainer();
    const id = setTimeout(syncActiveContainer, 50);

    return () => clearTimeout(id);
  }, [location.pathname, pageStack, getScrollContainerForPath]);

  // Scroll position persistence disabled for detail pages

  // Track the current artist context for cache management
  const currentArtistContextRef = useRef<string | null>(null);

  // Manage page stack based on navigation
  // Key logic:
  // 1. Cache all pages within an artist context (artist page + albums + songs etc.)
  // 2. Clear cache when:
  //    - Navigating to a root route (/, /search, /library)
  //    - Navigating to a different artist
  useEffect(() => {
    const prevPath = prevPathRef.current;
    const currentPath = location.pathname;

    // Skip if path hasn't changed
    if (prevPath === currentPath) {
      prevChildrenRef.current = children;
      return;
    }

    const prevIsCachedTab = CACHED_TAB_ROUTES.includes(prevPath);
    const currentIsCachedTab = CACHED_TAB_ROUTES.includes(currentPath);
    const prevScrollContainer = getScrollContainerForPath(prevPath);
    const navigationStore = useNavigationStore.getState();
    const savedScrollFromStore =
      navigationStore.getScrollPosition(`${prevPath}::mobile`) ||
      navigationStore.getScrollPosition(prevPath);
    const prevScrollTop = prevScrollContainer?.scrollTop ?? savedScrollFromStore ?? 0;

    // Get artist context for current and previous paths
    const prevArtistContext = getArtistContext(prevPath);
    const currentArtistContext = getArtistContext(currentPath);

    // Check if we're navigating back (should preserve cache)
    const isBackNavigation = useNavigationDirectionStore.getState().direction === 'back';

    // Determine if we should clear the cache
    // IMPORTANT: Never clear cache when navigating back - we want to preserve the previous page state
    const shouldClearCache =
      !isBackNavigation && (
        // Navigating to a root route clears cache
        currentIsCachedTab ||
        // Navigating to a different artist clears cache
        (currentArtistContext && prevArtistContext && currentArtistContext !== prevArtistContext) ||
        // Navigating from non-artist page to a new artist clears cache (only on forward navigation)
        (currentArtistContext && !prevArtistContext && !prevIsCachedTab)
      );

    setPageStack((prev) => {
      // If navigating to root route or different artist, clear the entire cache
      if (shouldClearCache) {
        return [];
      }

      // If coming from a cached tab, don't add to stack
      if (prevIsCachedTab) {
        return prev;
      }

      // If navigating back, we're returning to a cached page
      // Remove pages that are "forward" from the target (i.e., the page we're leaving)
      if (isBackNavigation) {
        // Check if we're returning to a page in the cache
        const targetIndex = prev.findIndex((p) => p.path === currentPath);
        if (targetIndex >= 0) {
          // Remove all pages after the target (including the page we're leaving from)
          return prev.slice(0, targetIndex + 1);
        }
        // If target is not in cache, just don't add the leaving page
        return prev;
      }

      // Check if the page we're leaving is already in the stack
      const existingIndex = prev.findIndex((p) => p.path === prevPath);
      
      if (existingIndex >= 0) {
        // Update existing entry with latest element and scroll position
        const updated = [...prev];
        updated[existingIndex] = {
          ...prev[existingIndex],
          element: prevChildrenRef.current,
          scrollTop: prevScrollTop,
        };
        return updated;
      }

      // Add the page we're leaving to the cache
      const newEntry: CachedPage = {
        path: prevPath,
        element: prevChildrenRef.current,
        scrollTop: prevScrollTop,
        artistContext: prevArtistContext,
        instanceKey: generateInstanceKey(),
      };

      const newStack = [...prev, newEntry];
      
      // Limit stack size
      if (newStack.length > MAX_PAGE_STACK_SIZE) {
        newStack.shift();
      }
      
      return newStack;
    });

    // Update artist context ref
    currentArtistContextRef.current = currentArtistContext;

    prevPathRef.current = currentPath;
    prevChildrenRef.current = children;
  }, [location.pathname, children, getScrollContainerForPath]);

  // Save scroll position when leaving a cached tab
  useEffect(() => {
    const refs: Record<string, React.RefObject<HTMLDivElement>> = {
      '/': homeScrollRef,
      '/search': searchScrollRef,
      '/library': libraryScrollRef,
    };

    // Restore scroll position for current tab
    if (isCachedTabRoute && refs[currentTab]?.current) {
      const savedPosition = scrollPositions.current[currentTab] || 0;
      refs[currentTab].current!.scrollTop = savedPosition;
    }

    return () => {
      // Save scroll position when leaving
      if (isCachedTabRoute && refs[currentTab]?.current) {
        scrollPositions.current[currentTab] = refs[currentTab].current!.scrollTop;
      }
    };
  }, [currentTab, isCachedTabRoute]);

  // Cached page stack no longer restores scroll position

  // Enable mobile state persistence (navigation state, playback position)
  useMobileStatePersistence();

  // When navigating back, skip all animations
  const isNavigatingBack = navigationDirection === 'back';

  // Use ref to store direction for exit animation
  const directionRef = useRef(navigationDirection);
  directionRef.current = navigationDirection;

  // Handle MiniPlayer expand to full-screen Now Playing
  const handleExpandNowPlaying = useCallback(() => {
    setShowNowPlaying(true);
  }, []);

  // Handle closing full-screen Now Playing
  const handleCloseNowPlaying = useCallback(() => {
    setShowNowPlaying(false);
  }, []);

  // Check if MiniPlayer should be shown
  const hasMiniPlayer = currentSong !== null;
  
  // Check offline status for bottom bar height adjustment
  const { isOnline } = useOnlineStatus();
  // Extra height for offline indicator (py-1.5 = 12px + text-xs line height ~16px = 28px)
  const offlineBarHeight = !isOnline ? 28 : 0;

  // Check if current page is in the cached stack
  const cachedPage = pageStack.find((p) => p.path === location.pathname);

  // 只在主页和音乐库显示顶部安全区遮罩，搜索页面不显示
  const showSafeAreaMask = currentTab === '/' || currentTab === '/library';

  // Check if user account is inactive - show inactive page and hide player/nav
  const isInactiveAccount = isAuthenticated && user && !user.is_active;

  // If account is inactive, show the inactive account page
  if (isInactiveAccount) {
    return <MobileInactiveAccountPage />;
  }

  return (
    <LayoutGroup id="mobile-layout">
      {/* 
        iOS 26.2+ PWA: 不再在主容器上添加 safe-area-top padding，
        因为子组件（如 MobileHomeHeader）会自己处理 safe area。
        这避免了双重 padding 导致的过大空白。
      */}
      <div className="h-screen flex flex-col bg-black text-white overflow-hidden">
        {/* Notch area background fill - 仅在主页/音乐库显示 */}
        {showSafeAreaMask && (
          <div
            className="fixed top-0 left-0 right-0 z-[60] pointer-events-none"
            style={{ height: 'env(safe-area-inset-top)', backgroundColor: '#121212' }}
            aria-hidden="true"
          />
        )}

        {/* Offline indicator */}
        <OfflineIndicator />

        {/* Main content area */}
        <div className="flex-1 overflow-hidden relative">
          {/* Home Header - rendered outside scroll container to prevent overscroll covering */}
          {canShowCachedTabs && currentTab === '/' && <MobileHomeHeader />}

          {/* Cached Tab: Home */}
          {canShowCachedTabs && (
            <div
              ref={homeScrollRef}
              className={`absolute inset-0 overflow-y-auto overflow-x-hidden bg-[#121212] ${
                currentTab === '/' ? 'z-10' : 'z-0 invisible'
              }`}
              data-testid="mobile-home-container"
            >
              <MobileHomePage />
            </div>
          )}

          {/* Cached Tab: Search */}
          {canShowCachedTabs && (
            <div
              ref={searchScrollRef}
              className={`absolute inset-0 overflow-y-auto overflow-x-hidden bg-black ${
                currentTab === '/search' ? 'z-10' : 'z-0 invisible'
              }`}
              data-testid="mobile-search-container"
            >
              <MobileSearchPage />
            </div>
          )}

          {/* Cached Tab: Library */}
          {canShowCachedTabs && (
            <div
              ref={libraryScrollRef}
              className={`absolute inset-0 overflow-y-auto overflow-x-hidden bg-[#121212] ${
                currentTab === '/library' ? 'z-10' : 'z-0 invisible'
              }`}
              data-testid="mobile-library-container"
            >
              <MobileLibraryPage />
            </div>
          )}

          {/* Cached page stack - previous pages kept in DOM for instant back navigation */}
          {/* These pages are always rendered but hidden when not active */}
          {/* Using instanceKey ensures React preserves the component instance */}
          {pageStack.map((page) => {
            const isActive = page.path === location.pathname;
            return (
              <div
                key={page.instanceKey}
                ref={(el) => {
                  if (el) {
                    pageStackScrollRefs.current.set(page.path, el);
                  } else {
                    pageStackScrollRefs.current.delete(page.path);
                  }
                }}
                className="absolute inset-0 overflow-y-auto overflow-x-hidden"
                style={{
                  zIndex: isActive ? 20 : 0,
                  visibility: isActive ? 'visible' : 'hidden',
                  // Keep the element in the render tree but hidden
                  pointerEvents: isActive ? 'auto' : 'none',
                }}
                data-testid={`mobile-cached-page-${page.path}`}
              >
                {page.element}
              </div>
            );
          })}

          {/* Current non-cached page (not in stack and not a tab route) */}
          {!isCachedTabRoute && !cachedPage && (
            <div
              ref={mainScrollRef}
              className="absolute inset-0 overflow-y-auto overflow-x-hidden z-20"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={isNavigatingBack ? false : { x: '100%', opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={() => {
                    if (directionRef.current === 'back') {
                      return { opacity: 1, transition: { duration: 0 } };
                    }
                    return { x: '-30%', opacity: 0 };
                  }}
                  transition={
                    isNavigatingBack
                      ? { duration: 0 }
                      : { type: 'tween', duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }
                  }
                  className="h-full"
                  data-testid="mobile-page-content"
                >
                  <Suspense fallback={<PageLoading />}>{children}</Suspense>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* MiniPlayer */}
        {hasMiniPlayer && (
          <div
            className="fixed left-0 right-0 z-40 transition-[bottom] duration-200"
            style={{ bottom: `calc(56px + env(safe-area-inset-bottom) + ${offlineBarHeight}px)` }}
          >
            <MiniPlayer onExpand={handleExpandNowPlaying} />
          </div>
        )}

        {/* Bottom Navigation */}
        <motion.div
          className="fixed bottom-0 left-0 right-0 z-40"
          animate={{
            y: showNowPlaying ? '100%' : '0%',
          }}
          transition={{
            type: 'spring',
            damping: 30,
            stiffness: 300,
            mass: 0.8,
          }}
        >
          <BottomNavigation />
        </motion.div>

        {/* Full-screen Now Playing view */}
        <AnimatePresence>
          {showNowPlaying && <MobileNowPlaying onClose={handleCloseNowPlaying} />}
        </AnimatePresence>

        {/* Toast notifications */}
        <MobileToast />
      </div>
    </LayoutGroup>
  );
}
