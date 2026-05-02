import { useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { setNavigationDirection } from './useNavigationDirection';

interface NavigationHistoryState {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

// Define root/home routes where back button should not appear
const ROOT_ROUTES = ['/', '/search', '/library'];

// Check if a route is a root-level route (bottom of navigation hierarchy)
export function isRootRoute(pathname: string): boolean {
  return ROOT_ROUTES.includes(pathname);
}

// Get the parent route for a given path
export function getParentRoute(pathname: string): string | null {
  // Profile sub-pages -> /profile
  if (pathname.startsWith('/profile/')) {
    return '/profile';
  }

  // Settings sub-pages -> /settings
  if (pathname.startsWith('/settings/')) {
    return '/settings';
  }

  // Artist sub-pages -> /artist/:id
  const artistSubMatch = pathname.match(/^\/artist\/([^/]+)\/.+$/);
  if (artistSubMatch) {
    return `/artist/${artistSubMatch[1]}`;
  }

  // Album sub-pages -> /album/:id
  const albumSubMatch = pathname.match(/^\/album\/([^/]+)\/.+$/);
  if (albumSubMatch) {
    return `/album/${albumSubMatch[1]}`;
  }

  // Detail pages (album, artist, playlist, etc.) -> home
  if (
    pathname.startsWith('/album/') ||
    pathname.startsWith('/artist/') ||
    pathname.startsWith('/playlist/')
  ) {
    return '/';
  }

  // Other pages -> home
  if (['/liked-songs', '/profile', '/settings', '/admin/users', '/admin'].includes(pathname)) {
    return '/';
  }

  // Admin sub-pages -> admin
  if (pathname.startsWith('/admin/')) {
    return '/admin';
  }

  return null;
}

// Zustand store for app-level navigation history
// This store maintains a simple parent-child relationship stack
// Key principle: navigating to a root route resets the stack
interface NavigationStackStore {
  // Stack only contains the path from root to current page
  // e.g., ['/', '/artist/123', '/artist/123/albums']
  stack: string[];
  // Flag to indicate if we're handling a browser back action
  isHandlingBrowserBack: boolean;
  push: (path: string) => void;
  pop: () => string | null;
  peek: () => string | null;
  canGoBack: () => boolean;
  reset: (initialPath?: string) => void;
  setHandlingBrowserBack: (value: boolean) => void;
}

const useNavigationStackStore = create<NavigationStackStore>((set, get) => ({
  stack: [],
  isHandlingBrowserBack: false,

  push: (path: string) => {
    const { stack, isHandlingBrowserBack } = get();
    const currentPath = stack[stack.length - 1];

    // Don't push if same as current
    if (currentPath === path) return;

    // If we're handling browser back, don't push - just update stack
    if (isHandlingBrowserBack) {
      set({ isHandlingBrowserBack: false });
      return;
    }

    // If navigating to a root route, reset the stack
    if (isRootRoute(path)) {
      set({ stack: [path] });
      return;
    }

    // If current is a root route, start fresh stack with root + new path
    if (stack.length === 0 || isRootRoute(currentPath)) {
      // Keep the root route as base, add new path
      const rootPath = stack.length > 0 ? currentPath : '/';
      set({ stack: [rootPath, path] });
      return;
    }

    // Check if this path is a parent of current path (going back in hierarchy)
    // e.g., from /artist/123/albums to /artist/123
    const parentRoute = getParentRoute(currentPath);
    if (parentRoute === path) {
      // Pop current and don't add (we're going back)
      set({ stack: stack.slice(0, -1) });
      return;
    }

    // Normal forward navigation - add to stack
    set({ stack: [...stack, path] });
  },

  pop: () => {
    const { stack } = get();
    if (stack.length <= 1) return null;

    const newStack = stack.slice(0, -1);
    const prevPath = newStack[newStack.length - 1];
    set({ stack: newStack });
    return prevPath;
  },

  peek: () => {
    const { stack } = get();
    if (stack.length <= 1) return null;
    return stack[stack.length - 2];
  },

  canGoBack: () => {
    const { stack } = get();
    // Can go back if stack has more than 1 item (root + at least one page)
    // AND current page is not a root route
    if (stack.length <= 1) return false;
    const currentPath = stack[stack.length - 1];
    return !isRootRoute(currentPath);
  },

  reset: (initialPath = '/') => {
    set({ stack: [initialPath] });
  },

  setHandlingBrowserBack: (value: boolean) => {
    set({ isHandlingBrowserBack: value });
  },
}));

/**
 * Custom hook to track app-level navigation history.
 *
 * Key behaviors:
 * - Root routes (/, /search, /library) are the bottom of the navigation hierarchy
 * - Back button only appears when there's a meaningful parent to return to
 * - Navigating to a root route resets the navigation stack
 * - Supports hierarchical navigation (e.g., /artist/123/albums -> /artist/123 -> /)
 */
export function useNavigationHistory(): NavigationHistoryState {
  const location = useLocation();
  const navigate = useNavigate();
  const { push, pop, canGoBack } = useNavigationStackStore();

  const lastPathRef = useRef(location.pathname);

  // Handle location changes - update stack on every navigation
  useEffect(() => {
    const currentPath = location.pathname;

    // Skip if path hasn't changed
    if (currentPath === lastPathRef.current) return;

    lastPathRef.current = currentPath;

    // Push to stack (the store handles all the logic)
    push(currentPath);
  }, [location.pathname, push]);

  const goBackHandler = useCallback(() => {
    const currentPath = location.pathname;

    // If on a root route, don't go back
    if (isRootRoute(currentPath)) return;

    // Try to get previous path from our stack
    const prevPath = pop();

    if (prevPath) {
      navigate(prevPath);
    } else {
      // Fallback: navigate to parent route based on URL hierarchy
      const parentRoute = getParentRoute(currentPath);
      if (parentRoute) {
        navigate(parentRoute);
      } else {
        // Ultimate fallback: go home
        navigate('/');
      }
    }
  }, [location.pathname, navigate, pop]);

  // Forward navigation is not supported in this simplified model
  const goForwardHandler = useCallback(() => {
    // Not implemented - use browser forward if needed
  }, []);

  return {
    canGoBack: canGoBack(),
    canGoForward: false,
    goBack: goBackHandler,
    goForward: goForwardHandler,
  };
}

// Export the store for use in other components if needed
export { useNavigationStackStore };

/**
 * Simple hook that returns just the goBack function for components
 * that only need back navigation functionality.
 *
 * This is a lighter alternative to useNavigationHistory when you don't
 * need canGoBack/canGoForward state.
 */
export function useGoBack(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  const { pop } = useNavigationStackStore();

  return useCallback(() => {
    const currentPath = location.pathname;

    // If on a root route, don't go back
    if (isRootRoute(currentPath)) return;

    // Try to get previous path from our stack
    const prevPath = pop();

    // Set navigation direction to 'back' before navigating
    // This ensures MobileLayout knows this is a back navigation
    setNavigationDirection('back');

    if (prevPath) {
      // Navigate to previous path in stack
      navigate(prevPath);
    } else {
      // Fallback: navigate to parent route based on URL hierarchy
      const parentRoute = getParentRoute(currentPath);
      if (parentRoute) {
        navigate(parentRoute);
      } else {
        // Ultimate fallback: go home
        navigate('/');
      }
    }
  }, [location.pathname, navigate, pop]);
}

/**
 * Hook to intercept browser back/forward buttons and use app-level navigation.
 * This should be used once at the app root level.
 *
 * How it works:
 * 1. On mount, push a dummy history entry to create a "buffer"
 * 2. When user presses browser back, we intercept the popstate event
 * 3. We push the dummy entry back and navigate using our app logic
 * 4. This effectively replaces browser history navigation with app navigation
 */
export function useBrowserBackInterceptor(): void {
  const navigate = useNavigate();
  const location = useLocation();
  const { pop, peek, setHandlingBrowserBack, canGoBack } = useNavigationStackStore();

  // Track if we've initialized the history buffer
  const initializedRef = useRef(false);
  const isInterceptingRef = useRef(false);

  // Initialize: push a dummy state to create history buffer
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      // Push a dummy state so we can intercept back button
      window.history.pushState({ appNav: true }, '', window.location.href);
    }
  }, []);

  // Handle popstate (browser back/forward)
  useEffect(() => {
    const handlePopState = (_event: PopStateEvent) => {
      // Prevent recursive handling
      if (isInterceptingRef.current) return;

      isInterceptingRef.current = true;

      // Re-push the dummy state to maintain our buffer
      window.history.pushState({ appNav: true }, '', window.location.href);

      const currentPath = location.pathname;

      // If on a root route, don't go back - stay on current page
      if (isRootRoute(currentPath)) {
        isInterceptingRef.current = false;
        return;
      }

      // Set navigation direction to 'back' before navigating
      // This ensures MobileLayout knows this is a back navigation
      setNavigationDirection('back');

      // Check if we can go back in our app stack
      if (canGoBack()) {
        // Get the previous path from our stack
        const prevPath = pop();

        if (prevPath) {
          // Mark that we're handling browser back so push() doesn't add to stack
          setHandlingBrowserBack(true);
          navigate(prevPath);
        }
      } else {
        // Fallback: navigate to parent route
        const parentRoute = getParentRoute(currentPath);
        if (parentRoute) {
          setHandlingBrowserBack(true);
          navigate(parentRoute);
        }
      }

      // Reset flag after a short delay to allow navigation to complete
      setTimeout(() => {
        isInterceptingRef.current = false;
      }, 100);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [location.pathname, navigate, pop, peek, setHandlingBrowserBack, canGoBack]);
}
