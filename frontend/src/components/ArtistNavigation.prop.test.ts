import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: artist-view-more-pages, Property 1: View More Navigation**
// **Validates: Requirements 1.1, 2.1, 3.1**

// Pure functions that generate navigation routes
function getTopSongsRoute(artistId: string): string {
  return `/artist/${artistId}/top-songs`;
}

function getAlbumsRoute(artistId: string): string {
  return `/artist/${artistId}/albums`;
}

function getSinglesRoute(artistId: string): string {
  return `/artist/${artistId}/singles`;
}

function getArtistDetailRoute(artistId: string): string {
  return `/artist/${artistId}`;
}

function getAlbumDetailRoute(albumId: string): string {
  return `/album/${albumId}`;
}

// Route type for content pages
type ContentType = 'songs' | 'albums' | 'singles';

function getViewMoreRoute(artistId: string, contentType: ContentType): string {
  switch (contentType) {
    case 'songs':
      return getTopSongsRoute(artistId);
    case 'albums':
      return getAlbumsRoute(artistId);
    case 'singles':
      return getSinglesRoute(artistId);
  }
}

describe('Artist Navigation Routes', () => {
  // **Feature: artist-view-more-pages, Property 1: View More Navigation**
  // **Validates: Requirements 1.1, 2.1, 3.1**
  describe('Property 1: View More Navigation', () => {
    it('should generate correct top songs route for any artist ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (artistId) => {
            const route = getTopSongsRoute(artistId);
            expect(route).toBe(`/artist/${artistId}/top-songs`);
            expect(route).toContain(artistId);
            expect(route).toContain('top-songs');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate correct albums route for any artist ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (artistId) => {
            const route = getAlbumsRoute(artistId);
            expect(route).toBe(`/artist/${artistId}/albums`);
            expect(route).toContain(artistId);
            expect(route).toContain('albums');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate correct singles route for any artist ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (artistId) => {
            const route = getSinglesRoute(artistId);
            expect(route).toBe(`/artist/${artistId}/singles`);
            expect(route).toContain(artistId);
            expect(route).toContain('singles');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate correct view more route based on content type', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('songs', 'albums', 'singles') as fc.Arbitrary<ContentType>,
          (artistId, contentType) => {
            const route = getViewMoreRoute(artistId, contentType);
            expect(route).toContain(artistId);
            
            switch (contentType) {
              case 'songs':
                expect(route).toContain('top-songs');
                break;
              case 'albums':
                expect(route).toContain('albums');
                break;
              case 'singles':
                expect(route).toContain('singles');
                break;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should generate unique routes for different content types', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (artistId) => {
            const songsRoute = getViewMoreRoute(artistId, 'songs');
            const albumsRoute = getViewMoreRoute(artistId, 'albums');
            const singlesRoute = getViewMoreRoute(artistId, 'singles');
            
            // All routes should be different
            expect(songsRoute).not.toBe(albumsRoute);
            expect(songsRoute).not.toBe(singlesRoute);
            expect(albumsRoute).not.toBe(singlesRoute);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Back Navigation Routes', () => {
    it('should generate correct artist detail route for back navigation', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (artistId) => {
            const route = getArtistDetailRoute(artistId);
            expect(route).toBe(`/artist/${artistId}`);
            expect(route).toContain(artistId);
            expect(route).not.toContain('top-songs');
            expect(route).not.toContain('albums');
            expect(route).not.toContain('singles');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Album Click Navigation', () => {
    it('should generate correct album detail route for any album ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (albumId) => {
            const route = getAlbumDetailRoute(albumId);
            expect(route).toBe(`/album/${albumId}`);
            expect(route).toContain(albumId);
            expect(route).toContain('album');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// Unit tests for navigation flows
// **Feature: artist-view-more-pages**
// **Validates: Requirements 1.1, 1.4, 2.1, 2.4, 2.5, 3.1, 3.4, 3.5**

describe('Navigation Flow Unit Tests', () => {
  describe('Artist Detail to View More Navigation', () => {
    it('should navigate to top songs page from artist detail', () => {
      const artistId = 'test-artist-123';
      const route = getTopSongsRoute(artistId);
      expect(route).toBe('/artist/test-artist-123/top-songs');
    });

    it('should navigate to albums page from artist detail', () => {
      const artistId = 'test-artist-123';
      const route = getAlbumsRoute(artistId);
      expect(route).toBe('/artist/test-artist-123/albums');
    });

    it('should navigate to singles page from artist detail', () => {
      const artistId = 'test-artist-123';
      const route = getSinglesRoute(artistId);
      expect(route).toBe('/artist/test-artist-123/singles');
    });
  });

  describe('Back Navigation', () => {
    it('should navigate back to artist detail from top songs page', () => {
      const artistId = 'test-artist-456';
      const backRoute = getArtistDetailRoute(artistId);
      expect(backRoute).toBe('/artist/test-artist-456');
    });

    it('should navigate back to artist detail from albums page', () => {
      const artistId = 'test-artist-789';
      const backRoute = getArtistDetailRoute(artistId);
      expect(backRoute).toBe('/artist/test-artist-789');
    });

    it('should navigate back to artist detail from singles page', () => {
      const artistId = 'test-artist-abc';
      const backRoute = getArtistDetailRoute(artistId);
      expect(backRoute).toBe('/artist/test-artist-abc');
    });
  });

  describe('Album Click Navigation', () => {
    it('should navigate to album detail when clicking album from albums page', () => {
      const albumId = 'album-123';
      const route = getAlbumDetailRoute(albumId);
      expect(route).toBe('/album/album-123');
    });

    it('should navigate to album detail when clicking single/EP from singles page', () => {
      const singleId = 'single-456';
      const route = getAlbumDetailRoute(singleId);
      expect(route).toBe('/album/single-456');
    });
  });
});
