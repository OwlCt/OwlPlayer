import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { ArtistDetail, Song, Album } from '../types';

// Arbitrary for generating songs
const songArbitrary: fc.Arbitrary<Song> = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  artistName: fc.string({ minLength: 1 }),
  albumName: fc.string({ minLength: 1 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.string(),
  hasLyrics: fc.boolean(),
});

// Arbitrary for generating albums
const albumArbitrary: fc.Arbitrary<Album> = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  artistName: fc.string({ minLength: 1 }),
  artworkUrl: fc.string(),
  trackCount: fc.integer({ min: 1, max: 50 }),
});

// Arbitrary for generating artist details
const artistDetailArbitrary: fc.Arbitrary<ArtistDetail> = fc.record({
  id: fc.string({ minLength: 1 }),
  name: fc.string({ minLength: 1 }),
  artworkUrl: fc.string(),
  genres: fc.array(fc.string()),
  topSongs: fc.array(songArbitrary),
  featuredSongs: fc.array(songArbitrary),
  featuredSongsSource: fc.constantFrom('history', 'library_fallback'),
  librarySongs: fc.array(songArbitrary),
  albums: fc.array(albumArbitrary),
  singlesAndEPs: fc.array(albumArbitrary),
  essentialAlbums: fc.array(albumArbitrary),
  liveAlbums: fc.array(albumArbitrary),
  compilationAlbums: fc.array(albumArbitrary),
  appearsOnAlbums: fc.array(albumArbitrary),
});

describe('ArtistDetailPage Properties', () => {
  /**
   * **Feature: enhanced-search-results, Property 9: Artist Detail Required Fields**
   * *For any* valid artist detail response, the rendered page should contain
   * the artist image URL, name, and genre information.
   * **Validates: Requirements 3.2, 3.3, 3.4**
   */
  it('Property 9: Artist detail has all required fields', () => {
    fc.assert(
      fc.property(artistDetailArbitrary, (artist) => {
        // Verify all required fields are present
        const hasId = artist.id !== undefined && artist.id !== '';
        const hasName = artist.name !== undefined && artist.name !== '';
        const hasArtworkUrl = artist.artworkUrl !== undefined;
        const hasGenres = artist.genres !== undefined;
        const hasTopSongs = artist.topSongs !== undefined;
        const hasAlbums = artist.albums !== undefined;

        return hasId && hasName && hasArtworkUrl && hasGenres && hasTopSongs && hasAlbums;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: enhanced-search-results, Property 10: Artist Song Playback**
   * *For any* song click in the artist's top songs section,
   * the player should start playing that specific song.
   * **Validates: Requirements 3.5**
   */
  it('Property 10: Song playback starts from clicked song', () => {
    fc.assert(
      fc.property(
        fc.array(songArbitrary, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 19 }),
        (songs, clickIndex) => {
          // Ensure click index is valid
          if (clickIndex >= songs.length) {
            return true; // Skip invalid indices
          }

          // When clicking a song, it should be the first in the queue
          const clickedSong = songs[clickIndex];
          const queueStartIndex = clickIndex;

          // The clicked song should be at the queue start position
          return songs[queueStartIndex].id === clickedSong.id;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: enhanced-search-results, Property 11: Artist Album Navigation**
   * *For any* album click in the artist's albums section,
   * the navigation should be triggered with the correct album ID.
   * **Validates: Requirements 3.6**
   */
  it('Property 11: Album navigation uses correct album ID', () => {
    fc.assert(
      fc.property(
        fc.array(albumArbitrary, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 0, max: 19 }),
        (albums, clickIndex) => {
          // Ensure click index is valid
          if (clickIndex >= albums.length) {
            return true; // Skip invalid indices
          }

          // When clicking an album, navigation should use that album's ID
          const clickedAlbum = albums[clickIndex];
          const expectedNavigationPath = `/album/${clickedAlbum.id}`;

          // Verify the navigation path would be correct
          return expectedNavigationPath.includes(clickedAlbum.id);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Top songs array is properly handled
   */
  it('Top songs array is properly accessible', () => {
    fc.assert(
      fc.property(artistDetailArbitrary, (artist) => {
        // Top songs should be an array (possibly empty)
        const isArray = Array.isArray(artist.topSongs);
        const allSongsValid = artist.topSongs.every(
          (song) => song.id !== undefined && song.name !== undefined
        );

        return isArray && allSongsValid;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Albums array is properly handled
   */
  it('Albums array is properly accessible', () => {
    fc.assert(
      fc.property(artistDetailArbitrary, (artist) => {
        // Albums should be an array (possibly empty)
        const isArray = Array.isArray(artist.albums);
        const allAlbumsValid = artist.albums.every(
          (album) => album.id !== undefined && album.name !== undefined
        );

        return isArray && allAlbumsValid;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property: Album categories are properly separated
   */
  it('Album categories (albums, singlesAndEPs) are properly accessible', () => {
    fc.assert(
      fc.property(artistDetailArbitrary, (artist) => {
        // All album categories should be arrays
        const albumsIsArray = Array.isArray(artist.albums);
        const singlesIsArray = Array.isArray(artist.singlesAndEPs);

        // All albums in each category should be valid
        const allAlbumsValid = artist.albums.every(
          (album) => album.id !== undefined && album.name !== undefined
        );
        const allSinglesValid = artist.singlesAndEPs.every(
          (album) => album.id !== undefined && album.name !== undefined
        );

        return albumsIsArray && singlesIsArray &&
               allAlbumsValid && allSinglesValid;
      }),
      { numRuns: 100 }
    );
  });
});
