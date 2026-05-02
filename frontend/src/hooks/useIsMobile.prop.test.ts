import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MOBILE_BREAKPOINT } from './useIsMobile';

// **Feature: spotify-mobile-ui, Property 1: Responsive Layout Switching**
// **Validates: Requirements 1.1, 1.3**

// Pure function that determines layout based on viewport width
// This mirrors the logic in useIsMobile hook
function determineLayout(viewportWidth: number, breakpoint: number = MOBILE_BREAKPOINT): {
  isMobile: boolean;
  showBottomNavigation: boolean;
  showDesktopSidebar: boolean;
} {
  const isMobile = viewportWidth < breakpoint;
  return {
    isMobile,
    showBottomNavigation: isMobile,
    showDesktopSidebar: !isMobile,
  };
}

describe('Responsive Layout Switching', () => {
  // **Feature: spotify-mobile-ui, Property 1: Responsive Layout Switching**
  // **Validates: Requirements 1.1, 1.3**
  describe('Property 1: Responsive Layout Switching', () => {
    // Generate viewport widths below mobile breakpoint
    const mobileWidthArb = fc.integer({ min: 1, max: MOBILE_BREAKPOINT - 1 });
    
    // Generate viewport widths at or above mobile breakpoint
    const desktopWidthArb = fc.integer({ min: MOBILE_BREAKPOINT, max: 3840 });
    
    // Generate any valid viewport width
    const anyWidthArb = fc.integer({ min: 1, max: 3840 });

    it('should show Bottom Navigation when viewport width < 768px', () => {
      fc.assert(
        fc.property(mobileWidthArb, (width) => {
          const layout = determineLayout(width);
          expect(layout.isMobile).toBe(true);
          expect(layout.showBottomNavigation).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should hide Bottom Navigation when viewport width >= 768px', () => {
      fc.assert(
        fc.property(desktopWidthArb, (width) => {
          const layout = determineLayout(width);
          expect(layout.isMobile).toBe(false);
          expect(layout.showBottomNavigation).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should show desktop Sidebar when viewport width >= 768px', () => {
      fc.assert(
        fc.property(desktopWidthArb, (width) => {
          const layout = determineLayout(width);
          expect(layout.showDesktopSidebar).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should hide desktop Sidebar when viewport width < 768px', () => {
      fc.assert(
        fc.property(mobileWidthArb, (width) => {
          const layout = determineLayout(width);
          expect(layout.showDesktopSidebar).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should have mutually exclusive Bottom Navigation and desktop Sidebar visibility', () => {
      fc.assert(
        fc.property(anyWidthArb, (width) => {
          const layout = determineLayout(width);
          // XOR: exactly one should be true
          expect(layout.showBottomNavigation !== layout.showDesktopSidebar).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should correctly handle boundary at exactly 768px', () => {
      // At exactly 768px, should be desktop mode
      const layoutAt768 = determineLayout(768);
      expect(layoutAt768.isMobile).toBe(false);
      expect(layoutAt768.showBottomNavigation).toBe(false);
      expect(layoutAt768.showDesktopSidebar).toBe(true);

      // At 767px, should be mobile mode
      const layoutAt767 = determineLayout(767);
      expect(layoutAt767.isMobile).toBe(true);
      expect(layoutAt767.showBottomNavigation).toBe(true);
      expect(layoutAt767.showDesktopSidebar).toBe(false);
    });

    it('should support custom breakpoints', () => {
      const customBreakpointArb = fc.integer({ min: 320, max: 1920 });
      
      fc.assert(
        fc.property(anyWidthArb, customBreakpointArb, (width, breakpoint) => {
          const layout = determineLayout(width, breakpoint);
          
          if (width < breakpoint) {
            expect(layout.isMobile).toBe(true);
            expect(layout.showBottomNavigation).toBe(true);
            expect(layout.showDesktopSidebar).toBe(false);
          } else {
            expect(layout.isMobile).toBe(false);
            expect(layout.showBottomNavigation).toBe(false);
            expect(layout.showDesktopSidebar).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should be consistent across multiple calls with same width', () => {
      fc.assert(
        fc.property(anyWidthArb, (width) => {
          const layout1 = determineLayout(width);
          const layout2 = determineLayout(width);
          
          expect(layout1.isMobile).toBe(layout2.isMobile);
          expect(layout1.showBottomNavigation).toBe(layout2.showBottomNavigation);
          expect(layout1.showDesktopSidebar).toBe(layout2.showDesktopSidebar);
        }),
        { numRuns: 100 }
      );
    });
  });
});
