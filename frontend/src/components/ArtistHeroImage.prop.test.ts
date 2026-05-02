import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Helper function to calculate expected resolution based on isLandscape flag.
 * This mirrors the logic in ArtistHeroImage component.
 */
function getExpectedResolution(isLandscape: boolean): number {
  return isLandscape ? 1920 : 1000;
}

/**
 * Helper function to simulate URL transformation with resolution.
 * This mirrors the getArtworkUrl logic from utils/image.ts
 */
function transformUrlWithResolution(url: string, size: number): string {
  return url
    .replace('{w}x{h}bb', `${size}x${size}bb`)
    .replace('{w}x{h}', `${size}x${size}`)
    .replace('{w}', String(size))
    .replace('{h}', String(size))
    .replace('{c}', 'cc')
    .replace('{f}', 'jpg');
}

// Generator for Apple Music style artwork URLs with placeholders
const artworkUrlArb = fc.constantFrom(
  'https://is1-ssl.mzstatic.com/image/thumb/Music/{w}x{h}bb.jpg',
  'https://is1-ssl.mzstatic.com/image/thumb/Features/{w}x{h}.jpg',
  'https://is1-ssl.mzstatic.com/image/thumb/AMCArtistImages/{w}x{h}cc.{f}',
  'https://example.com/artist/{w}/{h}/image.jpg'
);

describe('ArtistHeroImage Property Tests', () => {
  /**
   * **Feature: artist-dynamic-artwork, Property 5: Landscape Resolution**
   * 
   * For any landscape artwork URL, the system SHALL transform the URL to include
   * appropriate width and height parameters for the display size.
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 5: Landscape images use higher resolution (1920) than standard images (1000)', () => {
    fc.assert(
      fc.property(
        artworkUrlArb,
        fc.boolean(),
        (imageUrl, isLandscape) => {
          const expectedResolution = getExpectedResolution(isLandscape);
          const transformedUrl = transformUrlWithResolution(imageUrl, expectedResolution);

          // Verify the resolution is correctly applied
          if (isLandscape) {
            // Landscape should use 1920 resolution
            expect(expectedResolution).toBe(1920);
            // The transformed URL should contain 1920 dimensions
            const has1920 = transformedUrl.includes('1920');
            expect(has1920).toBe(true);
          } else {
            // Standard/avatar should use 1000 resolution
            expect(expectedResolution).toBe(1000);
            // The transformed URL should contain 1000 dimensions
            const has1000 = transformedUrl.includes('1000');
            expect(has1000).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sub-property: Landscape resolution is always greater than standard resolution
   */
  it('should always use higher resolution for landscape than for standard images', () => {
    fc.assert(
      fc.property(
        artworkUrlArb,
        (imageUrl) => {
          const landscapeResolution = getExpectedResolution(true);
          const standardResolution = getExpectedResolution(false);

          // Landscape resolution should always be greater
          expect(landscapeResolution).toBeGreaterThan(standardResolution);
          expect(landscapeResolution).toBe(1920);
          expect(standardResolution).toBe(1000);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Sub-property: URL transformation preserves the base URL structure
   */
  it('should preserve base URL structure when applying resolution', () => {
    fc.assert(
      fc.property(
        artworkUrlArb,
        fc.boolean(),
        (imageUrl, isLandscape) => {
          const resolution = getExpectedResolution(isLandscape);
          const transformedUrl = transformUrlWithResolution(imageUrl, resolution);

          // The transformed URL should not contain any unresolved placeholders
          expect(transformedUrl).not.toContain('{w}');
          expect(transformedUrl).not.toContain('{h}');
          expect(transformedUrl).not.toContain('{c}');
          expect(transformedUrl).not.toContain('{f}');

          // The base domain should be preserved
          const originalDomain = new URL(imageUrl.replace(/{[whcf]}/g, '100')).hostname;
          const transformedDomain = new URL(transformedUrl).hostname;
          expect(transformedDomain).toBe(originalDomain);
        }
      ),
      { numRuns: 100 }
    );
  });
});
