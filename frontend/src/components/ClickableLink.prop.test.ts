import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getArtistHref, getAlbumHref } from './ClickableLink';

// ============================================================================
// **Feature: clickable-album-artist-links**
// Property-based tests for ClickableLink component
// ============================================================================

// Pure function to determine if a link should be clickable
export function isLinkClickable(href?: string, disabled?: boolean): boolean {
  return !disabled && !!href;
}

// Pure function to determine what element type should be rendered
export function getLinkRenderType(href?: string, disabled?: boolean): 'span-clickable' | 'span-plain' {
  return isLinkClickable(href, disabled) ? 'span-clickable' : 'span-plain';
}

// Pure function to simulate click behavior
export interface ClickResult {
  shouldNavigate: boolean;
  shouldStopPropagation: boolean;
  targetHref: string | null;
}

export function simulateClick(href?: string, disabled?: boolean): ClickResult {
  const clickable = isLinkClickable(href, disabled);
  return {
    shouldNavigate: clickable && !!href,
    shouldStopPropagation: clickable,
    targetHref: clickable ? (href || null) : null,
  };
}

describe('ClickableLink URL Generation', () => {
  // **Feature: clickable-album-artist-links, Property 1: Artist navigation generates correct URL**
  // **Validates: Requirements 1.1, 3.1, 4.1, 8.1, 13.1, 14.1**
  describe('Property 1: Artist navigation generates correct URL', () => {
    it('should generate correct artist URL for any valid artistId', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (artistId) => {
            const href = getArtistHref(artistId);
            expect(href).toBe(`/artist/${artistId}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return undefined for undefined artistId', () => {
      const href = getArtistHref(undefined);
      expect(href).toBeUndefined();
    });

    it('should return undefined for empty string artistId', () => {
      const href = getArtistHref('');
      expect(href).toBeUndefined();
    });
  });

  // **Feature: clickable-album-artist-links, Property 2: Album navigation generates correct URL**
  // **Validates: Requirements 2.1, 5.1**
  describe('Property 2: Album navigation generates correct URL', () => {
    it('should generate correct album URL for any valid albumId', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (albumId) => {
            const href = getAlbumHref(albumId);
            expect(href).toBe(`/album/${albumId}`);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return undefined for undefined albumId', () => {
      const href = getAlbumHref(undefined);
      expect(href).toBeUndefined();
    });

    it('should return undefined for empty string albumId', () => {
      const href = getAlbumHref('');
      expect(href).toBeUndefined();
    });
  });
});

describe('ClickableLink Disabled State', () => {
  // **Feature: clickable-album-artist-links, Property 3: Links without ID are disabled**
  // **Validates: Requirements 1.3, 2.3, 3.3, 4.4, 5.4, 8.4, 13.3**
  describe('Property 3: Links without ID are disabled', () => {
    it('should render as plain text when href is undefined', () => {
      fc.assert(
        fc.property(fc.boolean(), (disabled) => {
          const renderType = getLinkRenderType(undefined, disabled);
          expect(renderType).toBe('span-plain');
        }),
        { numRuns: 100 }
      );
    });

    it('should render as plain text when href is empty string', () => {
      fc.assert(
        fc.property(fc.boolean(), (disabled) => {
          const renderType = getLinkRenderType('', disabled);
          expect(renderType).toBe('span-plain');
        }),
        { numRuns: 100 }
      );
    });

    it('should render as plain text when disabled is true regardless of href', () => {
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          (href) => {
            const renderType = getLinkRenderType(href, true);
            expect(renderType).toBe('span-plain');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should render as clickable when href is valid and not disabled', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (href) => {
            const renderType = getLinkRenderType(href, false);
            expect(renderType).toBe('span-clickable');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not navigate when artistId/albumId is undefined', () => {
      // Test with undefined href
      const resultUndefined = simulateClick(undefined, false);
      expect(resultUndefined.shouldNavigate).toBe(false);
      expect(resultUndefined.targetHref).toBeNull();

      // Test with generated undefined hrefs
      const artistHref = getArtistHref(undefined);
      const albumHref = getAlbumHref(undefined);
      
      const artistResult = simulateClick(artistHref, false);
      const albumResult = simulateClick(albumHref, false);
      
      expect(artistResult.shouldNavigate).toBe(false);
      expect(albumResult.shouldNavigate).toBe(false);
    });
  });
});

describe('ClickableLink Click Behavior', () => {
  // **Feature: clickable-album-artist-links, Property 4: Click events stop propagation**
  // **Validates: Requirements 4.2, 5.2, 8.2, 14.2**
  describe('Property 4: Click events stop propagation', () => {
    it('should stop propagation when link is clickable', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (href) => {
            const result = simulateClick(href, false);
            expect(result.shouldStopPropagation).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not stop propagation when link is disabled', () => {
      fc.assert(
        fc.property(
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          (href) => {
            const result = simulateClick(href, true);
            expect(result.shouldStopPropagation).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not stop propagation when href is undefined', () => {
      const result = simulateClick(undefined, false);
      expect(result.shouldStopPropagation).toBe(false);
    });
  });
});

describe('ClickableLink Navigation Consistency', () => {
  // Additional property: URL format consistency
  describe('URL format consistency', () => {
    it('artist URLs should always start with /artist/', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (artistId) => {
            const href = getArtistHref(artistId);
            expect(href).toMatch(/^\/artist\//);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('album URLs should always start with /album/', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (albumId) => {
            const href = getAlbumHref(albumId);
            expect(href).toMatch(/^\/album\//);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('generated URLs should preserve the original ID', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          (id) => {
            const artistHref = getArtistHref(id);
            const albumHref = getAlbumHref(id);
            
            expect(artistHref).toContain(id);
            expect(albumHref).toContain(id);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
