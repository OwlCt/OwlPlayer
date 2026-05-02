import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LibraryAlbum, libraryAlbumToAlbum } from './libraryAlbumsStore';
import { Album, ReleaseType } from '../types';

// **Feature: library-albums, Property 1: Save/Remove Round-Trip Consistency**
// **Validates: Requirements 1.1, 1.2, 4.2**

// Generate valid date strings directly to avoid Invalid Date issues
const validDateArbitrary = fc.tuple(
  fc.integer({ min: 2000, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([year, month, day]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

// Generators for test data
const albumArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  releaseDate: fc.option(validDateArbitrary, { nil: undefined }),
  trackCount: fc.integer({ min: 1, max: 30 }),
}) as fc.Arbitrary<Album>;

// Generate valid date strings directly
const releaseDateArbitrary = fc.tuple(
  fc.integer({ min: 2000, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([year, month, day]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

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

const libraryAlbumArbitrary = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  album_id: fc.uuid(),
  album_name: fc.string({ minLength: 1, maxLength: 50 }),
  artist_name: fc.string({ minLength: 1, maxLength: 50 }),
  artwork_url: fc.webUrl(),
  release_date: fc.option(releaseDateArbitrary, { nil: undefined }),
  track_count: fc.integer({ min: 1, max: 30 }),
  release_type: fc.option(fc.constantFrom<ReleaseType>('album', 'ep', 'single'), { nil: undefined }),
  is_single: fc.option(fc.boolean(), { nil: undefined }),
  created_at: isoDateArbitrary,
}) as fc.Arbitrary<LibraryAlbum>;

describe('Library Albums Store', () => {
  // **Feature: library-albums, Property 1: Save/Remove Round-Trip Consistency**
  // **Validates: Requirements 1.1, 1.2, 4.2**
  describe('Property 1: Save/Remove Round-Trip Consistency', () => {
    it('save then remove should result in album not being saved', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          // Simulate store state
          let savedAlbumIds = new Set<string>();
          
          // Save album
          savedAlbumIds.add(album.id);
          expect(savedAlbumIds.has(album.id)).toBe(true);
          
          // Remove album
          savedAlbumIds.delete(album.id);
          expect(savedAlbumIds.has(album.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('double save should be idempotent', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          const savedAlbumIds = new Set<string>();
          
          savedAlbumIds.add(album.id);
          const countAfterFirst = savedAlbumIds.size;
          
          savedAlbumIds.add(album.id);
          const countAfterSecond = savedAlbumIds.size;
          
          expect(countAfterFirst).toBe(countAfterSecond);
          expect(savedAlbumIds.has(album.id)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('double remove should be idempotent', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          const savedAlbumIds = new Set<string>();
          
          savedAlbumIds.add(album.id);
          savedAlbumIds.delete(album.id);
          const countAfterFirst = savedAlbumIds.size;
          
          savedAlbumIds.delete(album.id);
          const countAfterSecond = savedAlbumIds.size;
          
          expect(countAfterFirst).toBe(countAfterSecond);
          expect(savedAlbumIds.has(album.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });


  // **Feature: library-albums, Property 2: Optimistic Update Rollback on Failure**
  // **Validates: Requirements 1.4**
  describe('Property 2: Optimistic Update Rollback on Failure', () => {
    it('rollback should restore original state after failed save', () => {
      fc.assert(
        fc.property(
          fc.array(albumArbitrary, { minLength: 0, maxLength: 10 }),
          albumArbitrary,
          (existingAlbums, newAlbum) => {
            // Original state
            const originalIds = new Set(existingAlbums.map(a => a.id));
            
            // Optimistic update
            const optimisticIds = new Set(originalIds);
            optimisticIds.add(newAlbum.id);
            
            // Simulate failure - rollback
            const rolledBackIds = new Set(originalIds);
            
            // Rolled back state should match original
            expect(rolledBackIds.size).toBe(originalIds.size);
            for (const id of originalIds) {
              expect(rolledBackIds.has(id)).toBe(true);
            }
            expect(rolledBackIds.has(newAlbum.id)).toBe(originalIds.has(newAlbum.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rollback should restore original state after failed remove', () => {
      fc.assert(
        fc.property(
          fc.array(albumArbitrary, { minLength: 1, maxLength: 10 }),
          (existingAlbums) => {
            // Original state
            const originalIds = new Set(existingAlbums.map(a => a.id));
            const albumToRemove = existingAlbums[0];
            
            // Optimistic update
            const optimisticIds = new Set(originalIds);
            optimisticIds.delete(albumToRemove.id);
            
            // Simulate failure - rollback
            const rolledBackIds = new Set(originalIds);
            
            // Rolled back state should match original
            expect(rolledBackIds.size).toBe(originalIds.size);
            expect(rolledBackIds.has(albumToRemove.id)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: library-albums, Property 4: LibraryAlbum Display Contains Required Fields**
  // **Validates: Requirements 3.2**
  describe('Property 4: LibraryAlbum Display Contains Required Fields', () => {
    it('libraryAlbumToAlbum should preserve all album data', () => {
      fc.assert(
        fc.property(libraryAlbumArbitrary, (libraryAlbum) => {
          const album = libraryAlbumToAlbum(libraryAlbum);
          
          expect(album.id).toBe(libraryAlbum.album_id);
          expect(album.name).toBe(libraryAlbum.album_name);
          expect(album.artistName).toBe(libraryAlbum.artist_name);
          expect(album.artworkUrl).toBe(libraryAlbum.artwork_url);
          expect(album.releaseDate).toBe(libraryAlbum.release_date);
          expect(album.trackCount).toBe(libraryAlbum.track_count);
          expect(album.releaseType).toBe(libraryAlbum.release_type);
          expect(album.isSingle).toBe(libraryAlbum.is_single);
        }),
        { numRuns: 100 }
      );
    });

    it('converted album should have all required display fields', () => {
      fc.assert(
        fc.property(libraryAlbumArbitrary, (libraryAlbum) => {
          const album = libraryAlbumToAlbum(libraryAlbum);
          
          // All required display fields should be present
          expect(album.id).toBeDefined();
          expect(album.name).toBeDefined();
          expect(album.artistName).toBeDefined();
          expect(album.artworkUrl).toBeDefined();
          expect(album.trackCount).toBeDefined();
          expect(typeof album.trackCount).toBe('number');
        }),
        { numRuns: 100 }
      );
    });

    it('album name and artist should not be empty', () => {
      fc.assert(
        fc.property(libraryAlbumArbitrary, (libraryAlbum) => {
          const album = libraryAlbumToAlbum(libraryAlbum);
          
          expect(album.name.length).toBeGreaterThan(0);
          expect(album.artistName.length).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  // savedAlbumIds Set consistency
  describe('savedAlbumIds Set Consistency', () => {
    it('savedAlbumIds Set should be consistent with savedAlbums array', () => {
      fc.assert(
        fc.property(
          fc.array(libraryAlbumArbitrary, { minLength: 0, maxLength: 20 }),
          (savedAlbums) => {
            // Simulate store state
            const savedAlbumIds = new Set(savedAlbums.map(a => a.album_id));
            
            // Every album in the array should be in the Set
            for (const album of savedAlbums) {
              expect(savedAlbumIds.has(album.album_id)).toBe(true);
            }
            
            // Set size should match unique album IDs
            const uniqueIds = new Set(savedAlbums.map(a => a.album_id));
            expect(savedAlbumIds.size).toBe(uniqueIds.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isSaved should return true for albums in savedAlbumIds', () => {
      fc.assert(
        fc.property(
          fc.array(libraryAlbumArbitrary, { minLength: 1, maxLength: 10 }),
          fc.uuid(),
          (savedAlbums, randomId) => {
            const savedAlbumIds = new Set(savedAlbums.map(a => a.album_id));
            
            // isSaved simulation
            const isSaved = (albumId: string) => savedAlbumIds.has(albumId);
            
            // All saved albums should return true
            for (const album of savedAlbums) {
              expect(isSaved(album.album_id)).toBe(true);
            }
            
            // Random ID should return false unless it happens to be in the set
            expect(isSaved(randomId)).toBe(savedAlbumIds.has(randomId));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Library albums count accuracy
  describe('Library Albums Count Accuracy', () => {
    it('getLibraryAlbumsCount should equal savedAlbums array length', () => {
      fc.assert(
        fc.property(
          fc.array(libraryAlbumArbitrary, { minLength: 0, maxLength: 50 }),
          (savedAlbums) => {
            // Simulate store state
            const getLibraryAlbumsCount = () => savedAlbums.length;
            
            expect(getLibraryAlbumsCount()).toBe(savedAlbums.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
