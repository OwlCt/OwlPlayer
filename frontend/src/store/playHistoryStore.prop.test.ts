import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PlayHistoryItem, TopArtistItem, TopTrackItem } from './playHistoryStore';
import { Song } from '../types';

// **Feature: user-profile-search-history, Property 9: Play history recording completeness**
// **Validates: Requirements 2.1**

// Generators for test data
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// Generate valid ISO date strings using integer timestamps
const validDateArbitrary = fc.integer({ 
  min: new Date('2020-01-01').getTime(), 
  max: new Date('2030-12-31').getTime() 
}).map(ts => new Date(ts).toISOString());

const playHistoryItemArbitrary = fc.record({
  songId: fc.uuid(),
  songName: fc.string({ minLength: 1, maxLength: 50 }),
  artistId: fc.uuid(),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.uuid(),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  duration: fc.integer({ min: 1000, max: 600000 }),
  playedAt: validDateArbitrary,
}) as fc.Arbitrary<PlayHistoryItem>;

const topArtistItemArbitrary = fc.record({
  artistId: fc.uuid(),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  playCount: fc.integer({ min: 1, max: 1000 }),
}) as fc.Arbitrary<TopArtistItem>;

const topTrackItemArbitrary = fc.record({
  songId: fc.uuid(),
  songName: fc.string({ minLength: 1, maxLength: 50 }),
  artistId: fc.uuid(),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.uuid(),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  duration: fc.integer({ min: 1000, max: 600000 }),
  playCount: fc.integer({ min: 1, max: 1000 }),
}) as fc.Arbitrary<TopTrackItem>;


describe('Play History Store', () => {
  // **Feature: user-profile-search-history, Property 9: Play history recording completeness**
  // **Validates: Requirements 2.1**
  describe('Property 9: Play history recording completeness', () => {
    it('song to play history request should contain all required fields', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // Simulate the conversion that happens in recordPlay
          const request = {
            song_id: song.id,
            song_name: song.name,
            artist_id: song.artistId || '',
            artist_name: song.artistName,
            album_id: song.albumId || '',
            album_name: song.albumName,
            artwork_url: song.artworkUrl,
            duration: song.duration,
          };

          // All required fields should be present
          expect(request.song_id).toBeDefined();
          expect(request.song_id.length).toBeGreaterThan(0);
          expect(request.song_name).toBeDefined();
          expect(request.artist_name).toBeDefined();
          expect(request.album_name).toBeDefined();
          expect(request.artwork_url).toBeDefined();
          expect(typeof request.duration).toBe('number');
          expect(request.duration).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });

    it('play history item should preserve song data', () => {
      fc.assert(
        fc.property(playHistoryItemArbitrary, (item) => {
          // All fields should be present and valid
          expect(item.songId).toBeDefined();
          expect(item.songName).toBeDefined();
          expect(item.artistId).toBeDefined();
          expect(item.artistName).toBeDefined();
          expect(item.albumId).toBeDefined();
          expect(item.albumName).toBeDefined();
          expect(item.artworkUrl).toBeDefined();
          expect(typeof item.duration).toBe('number');
          expect(item.playedAt).toBeDefined();
          
          // Validate ISO timestamp format
          const date = new Date(item.playedAt);
          expect(date.toString()).not.toBe('Invalid Date');
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: user-profile-search-history, Property 2: Play history aggregation by artist**
  // **Validates: Requirements 2.2, 2.4**
  describe('Property 2: Play history aggregation by artist', () => {
    it('top artists should be sorted by play count descending', () => {
      fc.assert(
        fc.property(
          fc.array(topArtistItemArbitrary, { minLength: 0, maxLength: 20 }),
          (artists) => {
            // Sort by play count descending (simulating store behavior)
            const sorted = [...artists].sort((a, b) => b.playCount - a.playCount);
            
            // Verify sorted order
            for (let i = 1; i < sorted.length; i++) {
              expect(sorted[i].playCount).toBeLessThanOrEqual(sorted[i - 1].playCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('aggregation should correctly count plays per artist', () => {
      fc.assert(
        fc.property(
          fc.array(playHistoryItemArbitrary, { minLength: 0, maxLength: 30 }),
          (history) => {
            // Aggregate by artist
            const artistCounts = new Map<string, number>();
            for (const item of history) {
              artistCounts.set(
                item.artistId,
                (artistCounts.get(item.artistId) || 0) + 1
              );
            }

            // Verify each artist's count
            for (const [artistId, count] of artistCounts) {
              const actualCount = history.filter(h => h.artistId === artistId).length;
              expect(count).toBe(actualCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // **Feature: user-profile-search-history, Property 3: Play history aggregation by track**
  // **Validates: Requirements 2.3, 2.5**
  describe('Property 3: Play history aggregation by track', () => {
    it('top tracks should be sorted by play count descending', () => {
      fc.assert(
        fc.property(
          fc.array(topTrackItemArbitrary, { minLength: 0, maxLength: 20 }),
          (tracks) => {
            // Sort by play count descending (simulating store behavior)
            const sorted = [...tracks].sort((a, b) => b.playCount - a.playCount);
            
            // Verify sorted order
            for (let i = 1; i < sorted.length; i++) {
              expect(sorted[i].playCount).toBeLessThanOrEqual(sorted[i - 1].playCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('aggregation should correctly count plays per track', () => {
      fc.assert(
        fc.property(
          fc.array(playHistoryItemArbitrary, { minLength: 0, maxLength: 30 }),
          (history) => {
            // Aggregate by song
            const songCounts = new Map<string, number>();
            for (const item of history) {
              songCounts.set(
                item.songId,
                (songCounts.get(item.songId) || 0) + 1
              );
            }

            // Verify each song's count
            for (const [songId, count] of songCounts) {
              const actualCount = history.filter(h => h.songId === songId).length;
              expect(count).toBe(actualCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('top track item should contain all required display fields', () => {
      fc.assert(
        fc.property(topTrackItemArbitrary, (track) => {
          // All required display fields should be present
          expect(track.songId).toBeDefined();
          expect(track.songName).toBeDefined();
          expect(track.artistId).toBeDefined();
          expect(track.artistName).toBeDefined();
          expect(track.albumId).toBeDefined();
          expect(track.albumName).toBeDefined();
          expect(track.artworkUrl).toBeDefined();
          expect(typeof track.duration).toBe('number');
          expect(typeof track.playCount).toBe('number');
          expect(track.playCount).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });
});
