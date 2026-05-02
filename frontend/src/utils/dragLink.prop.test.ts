import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { generateDragUrl, ImageType } from './dragLink';

// **Feature: image-context-menu-drag, Property 2: Drag URL format consistency**
// **Validates: Requirements 4.1, 4.2, 4.3**

describe('Drag URL Generation', () => {
  const mockOrigin = 'http://localhost:3000';

  beforeEach(() => {
    // Mock window.location.origin
    vi.stubGlobal('location', { origin: mockOrigin });
  });

  // **Feature: image-context-menu-drag, Property 2: Drag URL format consistency**
  // **Validates: Requirements 4.1, 4.2, 4.3**
  describe('Property 2: Drag URL format consistency', () => {
    const imageTypeArbitrary = fc.constantFrom<ImageType>('artist', 'album', 'playlist');
    const idArbitrary = fc.uuid();

    it('should generate URL in format {origin}/{type}/{id} for any valid type and ID', () => {
      fc.assert(
        fc.property(imageTypeArbitrary, idArbitrary, (type, id) => {
          const url = generateDragUrl(type, id);
          const expectedUrl = `${mockOrigin}/${type}/${id}`;
          
          expect(url).toBe(expectedUrl);
        }),
        { numRuns: 100 }
      );
    });

    it('should always start with the origin', () => {
      fc.assert(
        fc.property(imageTypeArbitrary, idArbitrary, (type, id) => {
          const url = generateDragUrl(type, id);
          
          expect(url.startsWith(mockOrigin)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should always contain the type in the path', () => {
      fc.assert(
        fc.property(imageTypeArbitrary, idArbitrary, (type, id) => {
          const url = generateDragUrl(type, id);
          
          expect(url.includes(`/${type}/`)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should always end with the ID', () => {
      fc.assert(
        fc.property(imageTypeArbitrary, idArbitrary, (type, id) => {
          const url = generateDragUrl(type, id);
          
          expect(url.endsWith(id)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate artist URLs correctly', () => {
      fc.assert(
        fc.property(idArbitrary, (id) => {
          const url = generateDragUrl('artist', id);
          
          expect(url).toBe(`${mockOrigin}/artist/${id}`);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate album URLs correctly', () => {
      fc.assert(
        fc.property(idArbitrary, (id) => {
          const url = generateDragUrl('album', id);
          
          expect(url).toBe(`${mockOrigin}/album/${id}`);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate playlist URLs correctly', () => {
      fc.assert(
        fc.property(idArbitrary, (id) => {
          const url = generateDragUrl('playlist', id);
          
          expect(url).toBe(`${mockOrigin}/playlist/${id}`);
        }),
        { numRuns: 100 }
      );
    });
  });
});
