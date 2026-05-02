import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isNavItemActive } from './BottomNavigation';
import { SourceTab } from '../../store/navigationStore';

// **Feature: spotify-mobile-ui, Property 2: Bottom Navigation Active State**
// **Validates: Requirements 1.2**

// Navigation item structure matching the component
interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  matchPaths?: string[];
}

// Define the navigation items as they exist in the component
const navItems: NavItem[] = [
  {
    id: 'home',
    label: '主页',
    path: '/',
    icon: null,
    activeIcon: null,
    matchPaths: ['/recently-played'],
  },
  {
    id: 'search',
    label: '搜索',
    path: '/search',
    icon: null,
    activeIcon: null,
  },
  {
    id: 'library',
    label: '音乐库',
    path: '/library',
    icon: null,
    activeIcon: null,
    matchPaths: ['/liked-songs'],
  },
];

// Valid routes that should activate specific nav items (without sourceTab)
const validRoutes = {
  home: ['/', '/recently-played'],
  search: ['/search', '/search?q=test'],
  library: ['/library', '/liked-songs'],
};

// Detail page routes that depend on sourceTab
const detailPageRoutes = ['/playlist/123', '/playlist/abc-def', '/album/456', '/artist/789'];

// Generate a random valid route for a specific nav item (non-detail pages)
const validRouteForNavItem = (navId: string): fc.Arbitrary<string> => {
  const routes = validRoutes[navId as keyof typeof validRoutes] || [];
  if (routes.length === 0) {
    return fc.constant('/');
  }
  
  // Generate either a known route or a dynamic route with random ID
  return fc.constantFrom(...routes);
};

// Generate a route that should NOT activate a specific nav item (non-detail pages)
const invalidRouteForNavItem = (navId: string): fc.Arbitrary<string> => {
  const otherNavIds = Object.keys(validRoutes).filter(id => id !== navId);
  return fc.oneof(
    ...otherNavIds.map(otherId => validRouteForNavItem(otherId))
  );
};

describe('Bottom Navigation Active State', () => {
  // **Feature: spotify-mobile-ui, Property 2: Bottom Navigation Active State**
  // **Validates: Requirements 1.2**
  describe('Property 2: Bottom Navigation Active State', () => {
    it('should highlight home nav item for home-related routes', () => {
      const homeNavItem = navItems.find(item => item.id === 'home')!;
      
      fc.assert(
        fc.property(
          validRouteForNavItem('home'),
          (route) => {
            const isActive = isNavItemActive(homeNavItem, route, null);
            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should highlight search nav item for search routes', () => {
      const searchNavItem = navItems.find(item => item.id === 'search')!;
      
      fc.assert(
        fc.property(
          fc.constantFrom('/search', '/search?q=test', '/search?q=hello+world'),
          (route) => {
            const isActive = isNavItemActive(searchNavItem, route, null);
            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should highlight library nav item for library-related routes', () => {
      const libraryNavItem = navItems.find(item => item.id === 'library')!;
      
      fc.assert(
        fc.property(
          validRouteForNavItem('library'),
          (route) => {
            const isActive = isNavItemActive(libraryNavItem, route, null);
            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not highlight home nav item for non-home routes', () => {
      const homeNavItem = navItems.find(item => item.id === 'home')!;
      
      fc.assert(
        fc.property(
          invalidRouteForNavItem('home'),
          (route) => {
            const isActive = isNavItemActive(homeNavItem, route, null);
            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not highlight search nav item for non-search routes', () => {
      const searchNavItem = navItems.find(item => item.id === 'search')!;
      
      fc.assert(
        fc.property(
          invalidRouteForNavItem('search'),
          (route) => {
            const isActive = isNavItemActive(searchNavItem, route, null);
            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not highlight library nav item for non-library routes', () => {
      const libraryNavItem = navItems.find(item => item.id === 'library')!;
      
      fc.assert(
        fc.property(
          invalidRouteForNavItem('library'),
          (route) => {
            const isActive = isNavItemActive(libraryNavItem, route, null);
            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have exactly one nav item active for any valid route (non-detail pages)', () => {
      // Generate any valid route from all categories (non-detail pages)
      const anyValidRoute = fc.oneof(
        validRouteForNavItem('home'),
        validRouteForNavItem('search'),
        validRouteForNavItem('library')
      );

      fc.assert(
        fc.property(
          anyValidRoute,
          (route) => {
            const activeItems = navItems.filter(item => isNavItemActive(item, route, null));
            // Exactly one nav item should be active for any valid route
            expect(activeItems.length).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should highlight correct nav item for detail pages based on sourceTab', () => {
      // Generate random UUIDs and alphanumeric IDs
      const dynamicIdArb = fc.oneof(
        fc.uuid(),
        fc.stringMatching(/^[a-zA-Z0-9-]+$/).filter(s => s.length > 0 && s.length < 50)
      );

      const sourceTabArb = fc.constantFrom<SourceTab>('home', 'search', 'library');

      fc.assert(
        fc.property(
          fc.constantFrom('/playlist/', '/album/', '/artist/'),
          dynamicIdArb,
          sourceTabArb,
          (prefix, id, sourceTab) => {
            const route = `${prefix}${id}`;
            const expectedNavItem = navItems.find(item => item.id === sourceTab)!;
            const isActive = isNavItemActive(expectedNavItem, route, sourceTab);
            expect(isActive).toBe(true);
            
            // Other nav items should not be active
            const otherNavItems = navItems.filter(item => item.id !== sourceTab);
            otherNavItems.forEach(item => {
              expect(isNavItemActive(item, route, sourceTab)).toBe(false);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should default to home for detail pages when sourceTab is null', () => {
      const homeNavItem = navItems.find(item => item.id === 'home')!;
      
      // Generate random UUIDs and alphanumeric IDs
      const dynamicIdArb = fc.oneof(
        fc.uuid(),
        fc.stringMatching(/^[a-zA-Z0-9-]+$/).filter(s => s.length > 0 && s.length < 50)
      );

      fc.assert(
        fc.property(
          fc.constantFrom('/playlist/', '/album/', '/artist/'),
          dynamicIdArb,
          (prefix, id) => {
            const route = `${prefix}${id}`;
            // When sourceTab is null, home should be active (default behavior)
            const isActive = isNavItemActive(homeNavItem, route, null);
            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
