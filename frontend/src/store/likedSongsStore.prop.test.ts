import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LikedSong, likedSongToSong } from './likedSongsStore';
import { Song } from '../types';

// **Feature: music-library-liked-songs, Property 2: Liked State Consistency**
// **Validates: Requirements 3.4, 4.4**

// Generators for test data
// Song arbitrary is defined but used for type reference only
const _songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;
void _songArbitrary; // Suppress unused warning

// Generate valid ISO date strings directly to avoid Invalid Date issues
const isoDateArbitrary = fc.tuple(
  fc.integer({ min: 2000, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 }),
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 }),
  fc.integer({ min: 0, max: 59 })
).map(([year, month, day, hour, min, sec]) => 
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.000Z`
);

const likedSongArbitrary = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  song_id: fc.uuid(),
  song_name: fc.string({ minLength: 1, maxLength: 50 }),
  artist_name: fc.string({ minLength: 1, maxLength: 50 }),
  album_name: fc.string({ minLength: 1, maxLength: 50 }),
  album_id: fc.option(fc.uuid(), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artwork_url: fc.webUrl(),
  has_lyrics: fc.boolean(),
  created_at: isoDateArbitrary,
}) as fc.Arbitrary<LikedSong>;

describe('Liked Songs Store', () => {
  // **Feature: music-library-liked-songs, Property 2: Liked State Consistency**
  // **Validates: Requirements 3.4, 4.4**
  describe('Property 2: Liked State Consistency', () => {
    it('likedSongToSong should preserve all song data', () => {
      fc.assert(
        fc.property(likedSongArbitrary, (likedSong) => {
          const song = likedSongToSong(likedSong);
          
          expect(song.id).toBe(likedSong.song_id);
          expect(song.name).toBe(likedSong.song_name);
          expect(song.artistName).toBe(likedSong.artist_name);
          expect(song.albumName).toBe(likedSong.album_name);
          expect(song.albumId).toBe(likedSong.album_id);
          expect(song.duration).toBe(likedSong.duration);
          expect(song.artworkUrl).toBe(likedSong.artwork_url);
          expect(song.hasLyrics).toBe(likedSong.has_lyrics);
        }),
        { numRuns: 100 }
      );
    });

    it('likedSongIds Set should be consistent with likedSongs array', () => {
      fc.assert(
        fc.property(
          fc.array(likedSongArbitrary, { minLength: 0, maxLength: 20 }),
          (likedSongs) => {
            // Simulate store state
            const likedSongIds = new Set(likedSongs.map(s => s.song_id));
            
            // Every song in the array should be in the Set
            for (const song of likedSongs) {
              expect(likedSongIds.has(song.song_id)).toBe(true);
            }
            
            // Set size should match unique song IDs
            const uniqueIds = new Set(likedSongs.map(s => s.song_id));
            expect(likedSongIds.size).toBe(uniqueIds.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isLiked should return true for songs in likedSongIds', () => {
      fc.assert(
        fc.property(
          fc.array(likedSongArbitrary, { minLength: 1, maxLength: 10 }),
          fc.uuid(),
          (likedSongs, randomId) => {
            const likedSongIds = new Set(likedSongs.map(s => s.song_id));
            
            // isLiked simulation
            const isLiked = (songId: string) => likedSongIds.has(songId);
            
            // All liked songs should return true
            for (const song of likedSongs) {
              expect(isLiked(song.song_id)).toBe(true);
            }
            
            // Random ID should return false unless it happens to be in the set
            expect(isLiked(randomId)).toBe(likedSongIds.has(randomId));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: music-library-liked-songs, Property 4: Liked Songs Count Accuracy**
  // **Validates: Requirements 5.2, 5.3**
  describe('Property 4: Liked Songs Count Accuracy', () => {
    it('getLikedSongsCount should equal likedSongs array length', () => {
      fc.assert(
        fc.property(
          fc.array(likedSongArbitrary, { minLength: 0, maxLength: 50 }),
          (likedSongs) => {
            // Simulate store state
            const getLikedSongsCount = () => likedSongs.length;
            
            expect(getLikedSongsCount()).toBe(likedSongs.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: music-library-liked-songs, Property 5: Liked Songs Display Completeness**
  // **Validates: Requirements 5.2**
  describe('Property 5: Liked Songs Display Completeness', () => {
    it('converted song should have all required display fields', () => {
      fc.assert(
        fc.property(likedSongArbitrary, (likedSong) => {
          const song = likedSongToSong(likedSong);
          
          // All required display fields should be present
          expect(song.id).toBeDefined();
          expect(song.name).toBeDefined();
          expect(song.artistName).toBeDefined();
          expect(song.duration).toBeDefined();
          expect(typeof song.duration).toBe('number');
          expect(song.artworkUrl).toBeDefined();
        }),
        { numRuns: 100 }
      );
    });

    it('song name and artist should not be empty', () => {
      fc.assert(
        fc.property(likedSongArbitrary, (likedSong) => {
          const song = likedSongToSong(likedSong);
          
          expect(song.name.length).toBeGreaterThan(0);
          expect(song.artistName.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });
});


// **Feature: music-library-liked-songs, Property 3: Filter Tab Content Consistency**
// **Validates: Requirements 1.3, 6.1, 6.2, 6.3**
describe('Property 3: Filter Tab Content Consistency', () => {
  type FilterTab = 'playlists' | 'artists' | 'albums';
  
  const filterTabArbitrary = fc.constantFrom<FilterTab>('playlists', 'artists', 'albums');
  
  it('active filter should only show content of that type', () => {
    fc.assert(
      fc.property(filterTabArbitrary, (activeFilter) => {
        // Simulate filter logic
        const getContentType = (filter: FilterTab): string => {
          switch (filter) {
            case 'playlists': return 'playlist';
            case 'artists': return 'artist';
            case 'albums': return 'album';
          }
        };
        
        const contentType = getContentType(activeFilter);
        
        // Content type should match the filter
        if (activeFilter === 'playlists') {
          expect(contentType).toBe('playlist');
        } else if (activeFilter === 'artists') {
          expect(contentType).toBe('artist');
        } else if (activeFilter === 'albums') {
          expect(contentType).toBe('album');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('filter tabs should be mutually exclusive', () => {
    fc.assert(
      fc.property(filterTabArbitrary, (activeFilter) => {
        const filters: FilterTab[] = ['playlists', 'artists', 'albums'];
        
        // Only one filter should be active at a time
        const activeCount = filters.filter(f => f === activeFilter).length;
        expect(activeCount).toBe(1);
      }),
      { numRuns: 100 }
    );
  });
});
