import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getAlbumMenuVisibility } from '../utils/menuVisibility';
import { PageContextType } from '../types';

// **Feature: image-context-menu-drag, Property 3: Album menu page context awareness**
// **Validates: Requirements 2.2**

// Generator for PageContextType
const pageContextArb = fc.constantFrom<PageContextType>('default', 'album', 'artist');

describe('DraggableImage', () => {
  // **Feature: image-context-menu-drag, Property 3: Album menu page context awareness**
  // **Validates: Requirements 2.2**
  describe('Property 3: Album menu page context awareness', () => {
    it('should hide "Go to Artist" when on artist page', () => {
      fc.assert(
        fc.property(fc.constant<PageContextType>('artist'), (pageContext) => {
          const visibility = getAlbumMenuVisibility(pageContext);
          expect(visibility.showGoToArtist).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should show "Go to Artist" when not on artist page', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<PageContextType>('default', 'album'),
          (pageContext) => {
            const visibility = getAlbumMenuVisibility(pageContext);
            expect(visibility.showGoToArtist).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect page context for any valid context type', () => {
      fc.assert(
        fc.property(pageContextArb, (pageContext) => {
          const visibility = getAlbumMenuVisibility(pageContext);
          
          // "Go to Artist" should be hidden only on artist page
          const expectedShowGoToArtist = pageContext !== 'artist';
          expect(visibility.showGoToArtist).toBe(expectedShowGoToArtist);
        }),
        { numRuns: 100 }
      );
    });

    it('should be deterministic - same context always produces same visibility', () => {
      fc.assert(
        fc.property(pageContextArb, (pageContext) => {
          const visibility1 = getAlbumMenuVisibility(pageContext);
          const visibility2 = getAlbumMenuVisibility(pageContext);
          
          expect(visibility1.showGoToArtist).toBe(visibility2.showGoToArtist);
        }),
        { numRuns: 100 }
      );
    });

    it('should use default context when undefined', () => {
      const visibility = getAlbumMenuVisibility(undefined);
      // Default should show all items
      expect(visibility.showGoToArtist).toBe(true);
    });
  });
});
