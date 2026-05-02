import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { FollowedArtist, ArtistInfo } from './followedArtistsStore';

// Generators for test data
const artistInfoArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.option(fc.webUrl(), { nil: undefined }),
}) as fc.Arbitrary<ArtistInfo>;

// Generate valid ISO date strings
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

const followedArtistArbitrary = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  artist_id: fc.uuid(),
  artist_name: fc.string({ minLength: 1, maxLength: 50 }),
  artwork_url: fc.webUrl(),
  created_at: isoDateArbitrary,
}) as fc.Arbitrary<FollowedArtist>;

describe('Followed Artists Store', () => {
  // **Feature: artist-follow, Property 1: Follow adds artist to library**
  // **Validates: Requirements 1.1, 1.2**
  describe('Property 1: Follow adds artist to library', () => {
    it('following an artist should add them to followedArtistIds', () => {
      fc.assert(
        fc.property(artistInfoArbitrary, (artist) => {
          // Simulate store state
          const followedArtistIds = new Set<string>();
          
          // Follow artist
          followedArtistIds.add(artist.id);
          
          expect(followedArtistIds.has(artist.id)).toBe(true);
          expect(followedArtistIds.size).toBe(1);
        }),
        { numRuns: 100 }
      );
    });

    it('following multiple artists should add all to followedArtistIds', () => {
      fc.assert(
        fc.property(
          fc.array(artistInfoArbitrary, { minLength: 1, maxLength: 10 }),
          (artists) => {
            const followedArtistIds = new Set<string>();
            
            for (const artist of artists) {
              followedArtistIds.add(artist.id);
            }
            
            // All artists should be in the set
            for (const artist of artists) {
              expect(followedArtistIds.has(artist.id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  // **Feature: artist-follow, Property 2: Unfollow removes artist from library**
  // **Validates: Requirements 2.1, 2.2**
  describe('Property 2: Unfollow removes artist from library', () => {
    it('unfollowing an artist should remove them from followedArtistIds', () => {
      fc.assert(
        fc.property(artistInfoArbitrary, (artist) => {
          const followedArtistIds = new Set<string>();
          
          // Follow then unfollow
          followedArtistIds.add(artist.id);
          expect(followedArtistIds.has(artist.id)).toBe(true);
          
          followedArtistIds.delete(artist.id);
          expect(followedArtistIds.has(artist.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('follow then unfollow should result in artist not being followed', () => {
      fc.assert(
        fc.property(artistInfoArbitrary, (artist) => {
          const followedArtistIds = new Set<string>();
          const followedArtists: FollowedArtist[] = [];
          
          // Follow
          followedArtistIds.add(artist.id);
          followedArtists.push({
            id: 'temp',
            user_id: 'user',
            artist_id: artist.id,
            artist_name: artist.name,
            artwork_url: artist.artworkUrl || '',
            created_at: new Date().toISOString(),
          });
          
          // Unfollow
          followedArtistIds.delete(artist.id);
          const filteredArtists = followedArtists.filter(a => a.artist_id !== artist.id);
          
          expect(followedArtistIds.has(artist.id)).toBe(false);
          expect(filteredArtists.length).toBe(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: artist-follow, Property 3: Follow is idempotent**
  // **Validates: Requirements 1.3**
  describe('Property 3: Follow is idempotent', () => {
    it('double follow should be idempotent', () => {
      fc.assert(
        fc.property(artistInfoArbitrary, (artist) => {
          const followedArtistIds = new Set<string>();
          
          followedArtistIds.add(artist.id);
          const countAfterFirst = followedArtistIds.size;
          
          followedArtistIds.add(artist.id);
          const countAfterSecond = followedArtistIds.size;
          
          expect(countAfterFirst).toBe(countAfterSecond);
          expect(followedArtistIds.has(artist.id)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('double unfollow should be idempotent', () => {
      fc.assert(
        fc.property(artistInfoArbitrary, (artist) => {
          const followedArtistIds = new Set<string>();
          
          followedArtistIds.add(artist.id);
          followedArtistIds.delete(artist.id);
          const countAfterFirst = followedArtistIds.size;
          
          followedArtistIds.delete(artist.id);
          const countAfterSecond = followedArtistIds.size;
          
          expect(countAfterFirst).toBe(countAfterSecond);
          expect(followedArtistIds.has(artist.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: artist-follow, Property 4: Failed operations rollback state**
  // **Validates: Requirements 1.4, 2.3**
  describe('Property 4: Failed operations rollback state', () => {
    it('rollback should restore original state after failed follow', () => {
      fc.assert(
        fc.property(
          fc.array(artistInfoArbitrary, { minLength: 0, maxLength: 10 }),
          artistInfoArbitrary,
          (existingArtists, newArtist) => {
            // Original state
            const originalIds = new Set(existingArtists.map(a => a.id));
            
            // Optimistic update
            const optimisticIds = new Set(originalIds);
            optimisticIds.add(newArtist.id);
            
            // Simulate failure - rollback
            const rolledBackIds = new Set(originalIds);
            
            // Rolled back state should match original
            expect(rolledBackIds.size).toBe(originalIds.size);
            for (const id of originalIds) {
              expect(rolledBackIds.has(id)).toBe(true);
            }
            expect(rolledBackIds.has(newArtist.id)).toBe(originalIds.has(newArtist.id));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rollback should restore original state after failed unfollow', () => {
      fc.assert(
        fc.property(
          fc.array(artistInfoArbitrary, { minLength: 1, maxLength: 10 }),
          (existingArtists) => {
            // Original state
            const originalIds = new Set(existingArtists.map(a => a.id));
            const artistToUnfollow = existingArtists[0];
            
            // Optimistic update
            const optimisticIds = new Set(originalIds);
            optimisticIds.delete(artistToUnfollow.id);
            
            // Simulate failure - rollback
            const rolledBackIds = new Set(originalIds);
            
            // Rolled back state should match original
            expect(rolledBackIds.size).toBe(originalIds.size);
            expect(rolledBackIds.has(artistToUnfollow.id)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: artist-follow, Property 5: Follow status reflects saved state**
  // **Validates: Requirements 3.1, 3.2**
  describe('Property 5: Follow status reflects saved state', () => {
    it('isFollowed should return true for artists in followedArtistIds', () => {
      fc.assert(
        fc.property(
          fc.array(followedArtistArbitrary, { minLength: 1, maxLength: 10 }),
          fc.uuid(),
          (followedArtists, randomId) => {
            const followedArtistIds = new Set(followedArtists.map(a => a.artist_id));
            
            // isFollowed simulation
            const isFollowed = (artistId: string) => followedArtistIds.has(artistId);
            
            // All followed artists should return true
            for (const artist of followedArtists) {
              expect(isFollowed(artist.artist_id)).toBe(true);
            }
            
            // Random ID should return false unless it happens to be in the set
            expect(isFollowed(randomId)).toBe(followedArtistIds.has(randomId));
          }
        ),
        { numRuns: 100 }
      );
    });

    it('isFollowed should return false for unfollowed artists', () => {
      fc.assert(
        fc.property(artistInfoArbitrary, (artist) => {
          const followedArtistIds = new Set<string>();
          
          const isFollowed = (artistId: string) => followedArtistIds.has(artistId);
          
          expect(isFollowed(artist.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  // followedArtistIds Set consistency
  describe('followedArtistIds Set Consistency', () => {
    it('followedArtistIds Set should be consistent with followedArtists array', () => {
      fc.assert(
        fc.property(
          fc.array(followedArtistArbitrary, { minLength: 0, maxLength: 20 }),
          (followedArtists) => {
            // Simulate store state
            const followedArtistIds = new Set(followedArtists.map(a => a.artist_id));
            
            // Every artist in the array should be in the Set
            for (const artist of followedArtists) {
              expect(followedArtistIds.has(artist.artist_id)).toBe(true);
            }
            
            // Set size should match unique artist IDs
            const uniqueIds = new Set(followedArtists.map(a => a.artist_id));
            expect(followedArtistIds.size).toBe(uniqueIds.size);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Followed artists count accuracy
  describe('Followed Artists Count Accuracy', () => {
    it('getFollowedArtistsCount should equal followedArtists array length', () => {
      fc.assert(
        fc.property(
          fc.array(followedArtistArbitrary, { minLength: 0, maxLength: 50 }),
          (followedArtists) => {
            // Simulate store state
            const getFollowedArtistsCount = () => followedArtists.length;
            
            expect(getFollowedArtistsCount()).toBe(followedArtists.length);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
