import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: top-navigation-bar, Property 3: Auth routes hide main layout**
// **Validates: Requirements 4.2, 5.2**

// Define auth routes that should use AuthLayout
const AUTH_ROUTES = ['/login', '/register', '/verify-email'] as const;

// Define main layout routes that should show full layout
const MAIN_LAYOUT_ROUTES = ['/', '/search', '/library', '/settings', '/playlist/123', '/album/456', '/artist/789'] as const;

// Pure function that determines if a route should use AuthLayout
function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'));
}

// Pure function that determines which layout components should be visible
interface LayoutVisibility {
  showSidebar: boolean;
  showTopNavBar: boolean;
  showPlayerBar: boolean;
  showAuthLayout: boolean;
}

function getLayoutVisibility(pathname: string): LayoutVisibility {
  const isAuth = isAuthRoute(pathname);
  return {
    showSidebar: !isAuth,
    showTopNavBar: !isAuth,
    showPlayerBar: !isAuth,
    showAuthLayout: isAuth,
  };
}

describe('AuthLayout Route Detection', () => {
  // **Feature: top-navigation-bar, Property 3: Auth routes hide main layout**
  // **Validates: Requirements 4.2, 5.2**
  describe('Property 3: Auth routes hide main layout', () => {
    // Generate auth route paths
    const authRouteArbitrary = fc.constantFrom(...AUTH_ROUTES);

    // Generate main layout route paths
    const mainLayoutRouteArbitrary = fc.constantFrom(...MAIN_LAYOUT_ROUTES);

    // Generate random playlist/album/artist IDs for dynamic routes
    const dynamicMainRouteArbitrary = fc.oneof(
      fc.uuid().map(id => `/playlist/${id}`),
      fc.uuid().map(id => `/album/${id}`),
      fc.uuid().map(id => `/artist/${id}`),
      fc.uuid().map(id => `/artist/${id}/top-songs`),
      fc.uuid().map(id => `/artist/${id}/albums`),
      fc.uuid().map(id => `/artist/${id}/singles`)
    );

    it('should identify auth routes correctly', () => {
      fc.assert(
        fc.property(authRouteArbitrary, (route) => {
          expect(isAuthRoute(route)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should identify main layout routes correctly', () => {
      fc.assert(
        fc.property(mainLayoutRouteArbitrary, (route) => {
          expect(isAuthRoute(route)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should identify dynamic main routes correctly', () => {
      fc.assert(
        fc.property(dynamicMainRouteArbitrary, (route) => {
          expect(isAuthRoute(route)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should hide Sidebar, TopNavBar, and PlayerBar on auth routes', () => {
      fc.assert(
        fc.property(authRouteArbitrary, (route) => {
          const visibility = getLayoutVisibility(route);
          expect(visibility.showSidebar).toBe(false);
          expect(visibility.showTopNavBar).toBe(false);
          expect(visibility.showPlayerBar).toBe(false);
          expect(visibility.showAuthLayout).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should show Sidebar, TopNavBar, and PlayerBar on main routes', () => {
      fc.assert(
        fc.property(mainLayoutRouteArbitrary, (route) => {
          const visibility = getLayoutVisibility(route);
          expect(visibility.showSidebar).toBe(true);
          expect(visibility.showTopNavBar).toBe(true);
          expect(visibility.showPlayerBar).toBe(true);
          expect(visibility.showAuthLayout).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should show main layout for dynamic routes', () => {
      fc.assert(
        fc.property(dynamicMainRouteArbitrary, (route) => {
          const visibility = getLayoutVisibility(route);
          expect(visibility.showSidebar).toBe(true);
          expect(visibility.showTopNavBar).toBe(true);
          expect(visibility.showPlayerBar).toBe(true);
          expect(visibility.showAuthLayout).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should never show both AuthLayout and main layout components simultaneously', () => {
      const anyRouteArbitrary = fc.oneof(
        authRouteArbitrary,
        mainLayoutRouteArbitrary,
        dynamicMainRouteArbitrary
      );

      fc.assert(
        fc.property(anyRouteArbitrary, (route) => {
          const visibility = getLayoutVisibility(route);
          // AuthLayout and main layout components should be mutually exclusive
          const showsMainLayout = visibility.showSidebar || visibility.showTopNavBar || visibility.showPlayerBar;
          const showsAuthLayout = visibility.showAuthLayout;
          
          // XOR: exactly one should be true
          expect(showsMainLayout !== showsAuthLayout).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});
