import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getHeroSectionInfo, simulateTrackTap, DetailPageVariant, HeroSectionInfo, TrackTapResult } from './MobileDetailPage';
import { Song } from '../../types';

// **Feature: spotify-mobile-ui, Property 10: Detail Page Hero Section**
// **Validates: Requirements 6.1**

// **Feature: spotify-mobile-ui, Property 11: Track Playback on Tap**
// **Validates: Requirements 6.3**

// Arbitrary for detail page variant
const variantArbitrary = fc.constantFrom<DetailPageVariant>('album', 'playlist', 'liked');

// Arbitrary for non-empty strings (for titles)
const nonEmptyStringArbitrary = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

// Arbitrary for optional artwork URL
const artworkUrlArbitrary = fc.option(
  fc.webUrl().map(url => url + '/artwork.jpg'),
  { nil: undefined }
);

// Arbitrary for track count
const trackCountArbitrary = fc.integer({ min: 0, max: 500 });

// Arbitrary for detail page data
const detailDataArbitrary = fc.record({
  name: nonEmptyStringArbitrary,
  artworkUrl: artworkUrlArbitrary,
  artistName: fc.option(nonEmptyStringArbitrary, { nil: undefined }),
  trackCount: trackCountArbitrary,
});

// Arbitrary for a song
const songArbitrary: fc.Arbitrary<Song> = fc.record({
  id: fc.uuid(),
  name: nonEmptyStringArbitrary,
  artistName: nonEmptyStringArbitrary,
  albumName: nonEmptyStringArbitrary,
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }), // 1 second to 10 minutes
  artworkUrl: fc.webUrl().map(url => url + '/artwork.jpg'),
  hasLyrics: fc.boolean(),
});

// Arbitrary for a list of songs
const songsArbitrary = fc.array(songArbitrary, { minLength: 0, maxLength: 50 });

// Arbitrary for a valid track index within a song list
const validTrackIndexArbitrary = (songs: Song[]) => 
  songs.length > 0 
    ? fc.integer({ min: 0, max: songs.length - 1 })
    : fc.constant(-1);

describe('MobileDetailPage Property Tests', () => {
  // **Feature: spotify-mobile-ui, Property 10: Detail Page Hero Section**
  // **Validates: Requirements 6.1**
  describe('Property 10: Detail Page Hero Section', () => {
    it('should always include title in hero section for any valid detail data', () => {
      fc.assert(
        fc.property(
          variantArbitrary,
          detailDataArbitrary,
          (variant, data) => {
            const heroInfo = getHeroSectionInfo(variant, data);
            
            // Title should always be present (from data.name)
            expect(heroInfo.hasTitle).toBe(true);
            expect(heroInfo.title).toBe(data.name);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always include metadata in hero section', () => {
      fc.assert(
        fc.property(
          variantArbitrary,
          detailDataArbitrary,
          (variant, data) => {
            const heroInfo = getHeroSectionInfo(variant, data);
            
            // Metadata should always be present
            expect(heroInfo.hasMetadata).toBe(true);
            expect(heroInfo.metadata.length).toBeGreaterThan(0);
            
            // For albums, metadata should include artist name
            if (variant === 'album') {
              const expectedArtist = data.artistName || '未知艺术家';
              expect(heroInfo.metadata).toContain(expectedArtist);
            }
            
            // Metadata should include track count
            expect(heroInfo.metadata).toContain('首歌曲');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly report artwork presence based on artworkUrl', () => {
      fc.assert(
        fc.property(
          variantArbitrary,
          detailDataArbitrary,
          (variant, data) => {
            const heroInfo = getHeroSectionInfo(variant, data);
            
            // hasArtwork should match whether artworkUrl is present and non-empty
            const expectedHasArtwork = data.artworkUrl !== undefined && 
                                       data.artworkUrl !== null && 
                                       data.artworkUrl !== '';
            expect(heroInfo.hasArtwork).toBe(expectedHasArtwork);
            
            // If artwork is present, artworkUrl should match
            if (heroInfo.hasArtwork) {
              expect(heroInfo.artworkUrl).toBe(data.artworkUrl);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty or whitespace-only names correctly', () => {
      // Test with empty name
      const emptyNameData = { name: '', artworkUrl: 'http://example.com/art.jpg', trackCount: 10 };
      const heroInfo = getHeroSectionInfo('album', emptyNameData);
      expect(heroInfo.hasTitle).toBe(false);
      
      // Test with whitespace-only name
      const whitespaceNameData = { name: '   ', artworkUrl: 'http://example.com/art.jpg', trackCount: 10 };
      const heroInfo2 = getHeroSectionInfo('album', whitespaceNameData);
      expect(heroInfo2.hasTitle).toBe(false);
    });

    it('should format metadata differently for album vs playlist/liked variants', () => {
      const testData = { 
        name: 'Test Album', 
        artworkUrl: 'http://example.com/art.jpg', 
        artistName: 'Test Artist',
        trackCount: 10 
      };
      
      const albumHero = getHeroSectionInfo('album', testData);
      const playlistHero = getHeroSectionInfo('playlist', testData);
      const likedHero = getHeroSectionInfo('liked', testData);
      
      // Album should include artist name in metadata
      expect(albumHero.metadata).toContain('Test Artist');
      
      // Playlist and liked should not include artist name in metadata
      expect(playlistHero.metadata).not.toContain('Test Artist');
      expect(likedHero.metadata).not.toContain('Test Artist');
    });
  });

  // **Feature: spotify-mobile-ui, Property 11: Track Playback on Tap**
  // **Validates: Requirements 6.3**
  describe('Property 11: Track Playback on Tap', () => {
    it('should start playback when tapping a valid track index', () => {
      fc.assert(
        fc.property(
          songsArbitrary.filter(songs => songs.length > 0),
          (songs) => {
            // Test tapping each valid index
            for (let i = 0; i < songs.length; i++) {
              const result = simulateTrackTap(songs, i);
              
              expect(result.shouldStartPlayback).toBe(true);
              expect(result.trackId).toBe(songs[i].id);
              expect(result.queueIndex).toBe(i);
            }
          }
        ),
        { numRuns: 50 }
      );
    });

    it('should not start playback for invalid track indices', () => {
      fc.assert(
        fc.property(
          songsArbitrary,
          fc.integer({ min: -100, max: -1 }),
          (songs, negativeIndex) => {
            const result = simulateTrackTap(songs, negativeIndex);
            
            expect(result.shouldStartPlayback).toBe(false);
            expect(result.trackId).toBe('');
            expect(result.queueIndex).toBe(-1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not start playback for out-of-bounds indices', () => {
      fc.assert(
        fc.property(
          songsArbitrary,
          (songs) => {
            // Test index equal to length (out of bounds)
            const result = simulateTrackTap(songs, songs.length);
            expect(result.shouldStartPlayback).toBe(false);
            
            // Test index greater than length
            const result2 = simulateTrackTap(songs, songs.length + 10);
            expect(result2.shouldStartPlayback).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle empty track list correctly', () => {
      const emptyTracks: Song[] = [];
      
      // Any index should fail for empty list
      const result0 = simulateTrackTap(emptyTracks, 0);
      expect(result0.shouldStartPlayback).toBe(false);
      
      const resultNeg = simulateTrackTap(emptyTracks, -1);
      expect(resultNeg.shouldStartPlayback).toBe(false);
    });

    it('should return correct track ID for any valid tap', () => {
      fc.assert(
        fc.property(
          songsArbitrary.filter(songs => songs.length > 0).chain(songs => 
            fc.tuple(
              fc.constant(songs),
              fc.integer({ min: 0, max: songs.length - 1 })
            )
          ),
          ([songs, index]) => {
            const result = simulateTrackTap(songs, index);
            
            // The returned track ID should match the song at that index
            expect(result.trackId).toBe(songs[index].id);
            expect(result.queueIndex).toBe(index);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set queue index to match tapped track position', () => {
      fc.assert(
        fc.property(
          songsArbitrary.filter(songs => songs.length >= 3),
          (songs) => {
            // Test first, middle, and last tracks
            const firstResult = simulateTrackTap(songs, 0);
            expect(firstResult.queueIndex).toBe(0);
            
            const middleIndex = Math.floor(songs.length / 2);
            const middleResult = simulateTrackTap(songs, middleIndex);
            expect(middleResult.queueIndex).toBe(middleIndex);
            
            const lastResult = simulateTrackTap(songs, songs.length - 1);
            expect(lastResult.queueIndex).toBe(songs.length - 1);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
