import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { calculateOverlayOpacity, isHeaderVisible } from './scrollHeader';

describe('Scroll Header Utilities', () => {
  // **Feature: sticky-header-scroll, Property 1: Overlay opacity is proportional to scroll position**
  // **Validates: Requirements 1.1, 1.2, 1.3**
  describe('Property 1: Overlay opacity is proportional to scroll position', () => {
    it('should always return opacity in [0, 1] range', () => {
      fc.assert(
        fc.property(
          fc.float({ min: -1000, max: 10000, noNaN: true }),
          fc.float({ min: 0, max: 5000, noNaN: true }),
          fc.float({ min: 0, max: 5000, noNaN: true }),
          (scrollY, start, end) => {
            const startThreshold = Math.min(start, end);
            const endThreshold = Math.max(start, end);
            const opacity = calculateOverlayOpacity(scrollY, startThreshold, endThreshold);
            return opacity >= 0 && opacity <= 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 0 when scrollY <= startThreshold', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.float({ min: 0, max: 1000, noNaN: true }),
          (startThreshold, range) => {
            const endThreshold = startThreshold + range + 1;
            const scrollY = startThreshold - Math.random() * 100;
            const opacity = calculateOverlayOpacity(scrollY, startThreshold, endThreshold);
            return opacity === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return 1 when scrollY >= endThreshold', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.float({ min: 1, max: 1000, noNaN: true }),
          (startThreshold, range) => {
            const endThreshold = startThreshold + range;
            const scrollY = endThreshold + Math.random() * 100;
            const opacity = calculateOverlayOpacity(scrollY, startThreshold, endThreshold);
            return opacity === 1;
          }
        ),
        { numRuns: 100 }
      );
    });


    it('should calculate proportional opacity within range', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 500, noNaN: true }),
          fc.float({ min: 1, max: 500, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (startThreshold, range, fraction) => {
            const endThreshold = startThreshold + range;
            const scrollY = startThreshold + fraction * range;
            const opacity = calculateOverlayOpacity(scrollY, startThreshold, endThreshold);
            // Allow small floating point tolerance
            return Math.abs(opacity - fraction) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should be monotonically increasing with scroll position', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 500, noNaN: true }),
          fc.float({ min: 1, max: 500, noNaN: true }),
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.float({ min: 0, max: 1000, noNaN: true }),
          (startThreshold, range, scroll1, scroll2) => {
            const endThreshold = startThreshold + range;
            const opacity1 = calculateOverlayOpacity(scroll1, startThreshold, endThreshold);
            const opacity2 = calculateOverlayOpacity(scroll2, startThreshold, endThreshold);
            if (scroll1 <= scroll2) {
              return opacity1 <= opacity2;
            }
            return opacity1 >= opacity2;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: sticky-header-scroll, Property 2: Header visibility is determined by scroll threshold**
  // **Validates: Requirements 2.1, 2.3**
  describe('Property 2: Header visibility is determined by scroll threshold', () => {
    it('should return true when scrollY >= actionBarTop', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 5000, noNaN: true }),
          fc.float({ min: 0, max: 5000, noNaN: true }),
          (scrollY, actionBarTop) => {
            const visible = isHeaderVisible(scrollY, actionBarTop);
            return visible === (scrollY >= actionBarTop);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when scrollY < actionBarTop', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1000, noNaN: true }),
          fc.float({ min: 1, max: 1000, noNaN: true }),
          (base, offset) => {
            const actionBarTop = base + offset;
            const scrollY = base;
            return isHeaderVisible(scrollY, actionBarTop) === false;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return true when scrollY equals actionBarTop', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 5000, noNaN: true }),
          (position) => {
            return isHeaderVisible(position, position) === true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
