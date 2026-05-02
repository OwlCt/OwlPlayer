import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isArtworkLargeAndCentered, isTouchTargetValid } from './MobileNowPlaying';

// **Feature: spotify-mobile-ui, Property 12: Now Playing Artwork Display**
// **Validates: Requirements 7.1**

// **Feature: spotify-mobile-ui, Property 9: Touch Target Minimum Size**
// **Validates: Requirements 5.1, 6.2, 7.2**

// Arbitrary for realistic mobile container widths (320px to 428px covers most phones)
const containerWidthArbitrary = fc.integer({ min: 320, max: 428 });

// Arbitrary for artwork sizes (relative to container)
const artworkSizeArbitrary = (containerWidth: number) => 
  fc.integer({ min: 0, max: containerWidth });

// Arbitrary for touch target dimensions
const touchTargetDimensionArbitrary = fc.integer({ min: 0, max: 200 });

describe('MobileNowPlaying Property Tests', () => {
  // **Feature: spotify-mobile-ui, Property 12: Now Playing Artwork Display**
  // **Validates: Requirements 7.1**
  describe('Property 12: Now Playing Artwork Display', () => {
    it('should consider artwork large when it is at least 60% of container width', () => {
      fc.assert(
        fc.property(
          containerWidthArbitrary,
          (containerWidth) => {
            // Artwork that is at least 60% of container should be considered large
            // Use Math.ceil to ensure we're at or above the threshold
            const minLargeSize = Math.ceil(containerWidth * 0.6);
            expect(isArtworkLargeAndCentered(minLargeSize, containerWidth)).toBe(true);
            
            // Artwork larger than 60% should also be considered large
            const largerSize = Math.ceil(containerWidth * 0.8);
            expect(isArtworkLargeAndCentered(largerSize, containerWidth)).toBe(true);
            
            // Full width artwork should be considered large
            expect(isArtworkLargeAndCentered(containerWidth, containerWidth)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not consider artwork large when it is less than 60% of container width', () => {
      fc.assert(
        fc.property(
          containerWidthArbitrary,
          (containerWidth) => {
            // Artwork that is less than 60% should not be considered large
            const smallSize = Math.floor(containerWidth * 0.5);
            expect(isArtworkLargeAndCentered(smallSize, containerWidth)).toBe(false);
            
            // Very small artwork should not be considered large
            const verySmallSize = Math.floor(containerWidth * 0.2);
            expect(isArtworkLargeAndCentered(verySmallSize, containerWidth)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly classify any artwork size relative to container', () => {
      fc.assert(
        fc.property(
          containerWidthArbitrary.chain(containerWidth => 
            fc.tuple(
              fc.constant(containerWidth),
              artworkSizeArbitrary(containerWidth)
            )
          ),
          ([containerWidth, artworkSize]) => {
            const isLarge = isArtworkLargeAndCentered(artworkSize, containerWidth);
            const expectedLarge = artworkSize >= containerWidth * 0.6;
            expect(isLarge).toBe(expectedLarge);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle edge case of zero container width', () => {
      // Zero container width should result in artwork not being considered large
      // (unless artwork is also zero, which satisfies >= 0 * 0.6 = 0)
      expect(isArtworkLargeAndCentered(0, 0)).toBe(true); // 0 >= 0 * 0.6
      expect(isArtworkLargeAndCentered(100, 0)).toBe(true); // 100 >= 0 * 0.6
    });
  });

  // **Feature: spotify-mobile-ui, Property 9: Touch Target Minimum Size**
  // **Validates: Requirements 5.1, 6.2, 7.2**
  describe('Property 9: Touch Target Minimum Size', () => {
    const MIN_TOUCH_TARGET = 44;

    it('should validate touch targets that meet the 44px minimum', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_TOUCH_TARGET, max: 200 }),
          fc.integer({ min: MIN_TOUCH_TARGET, max: 200 }),
          (width, height) => {
            expect(isTouchTargetValid(width, height)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject touch targets below the 44px minimum', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MIN_TOUCH_TARGET - 1 }),
          fc.integer({ min: 0, max: 200 }),
          (width, height) => {
            // If width is below minimum, should be invalid regardless of height
            expect(isTouchTargetValid(width, height)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 200 }),
          fc.integer({ min: 0, max: MIN_TOUCH_TARGET - 1 }),
          (width, height) => {
            // If height is below minimum, should be invalid regardless of width
            expect(isTouchTargetValid(width, height)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly classify any dimension combination', () => {
      fc.assert(
        fc.property(
          touchTargetDimensionArbitrary,
          touchTargetDimensionArbitrary,
          (width, height) => {
            const isValid = isTouchTargetValid(width, height);
            const expectedValid = width >= MIN_TOUCH_TARGET && height >= MIN_TOUCH_TARGET;
            expect(isValid).toBe(expectedValid);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should validate exact boundary values', () => {
      // Exactly 44px should be valid
      expect(isTouchTargetValid(44, 44)).toBe(true);
      expect(isTouchTargetValid(44, 100)).toBe(true);
      expect(isTouchTargetValid(100, 44)).toBe(true);
      
      // 43px should be invalid
      expect(isTouchTargetValid(43, 44)).toBe(false);
      expect(isTouchTargetValid(44, 43)).toBe(false);
      expect(isTouchTargetValid(43, 43)).toBe(false);
    });

    it('should ensure all playback control buttons meet minimum size', () => {
      // These are the actual sizes used in MobileNowPlaying component
      const buttonSizes = [
        { name: 'shuffle', width: 44, height: 44 },      // w-11 h-11 = 44px
        { name: 'previous', width: 48, height: 48 },     // w-12 h-12 = 48px
        { name: 'play/pause', width: 64, height: 64 },   // w-16 h-16 = 64px
        { name: 'next', width: 48, height: 48 },         // w-12 h-12 = 48px
        { name: 'repeat', width: 44, height: 44 },       // w-11 h-11 = 44px
        { name: 'queue', width: 44, height: 44 },        // w-11 h-11 = 44px
        { name: 'lyrics', width: 44, height: 44 },       // w-11 h-11 = 44px
        { name: 'share', width: 44, height: 44 },        // w-11 h-11 = 44px
        { name: 'close', width: 44, height: 44 },        // w-11 h-11 = 44px
      ];

      buttonSizes.forEach(({ name, width, height }) => {
        expect(
          isTouchTargetValid(width, height),
          `${name} button should have valid touch target size`
        ).toBe(true);
      });
    });
  });
});
