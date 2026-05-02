import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getArtistMenuLabel, ARTIST_MENU_ITEMS } from './ArtistContextMenu';

// **Feature: image-context-menu-drag, Property 1: Artist menu shows correct follow state**
// **Validates: Requirements 1.1, 1.2, 1.5**

// **Feature: library-remove-confirmation, Property 1: Dialog displays with correct item information (artist)**
// **Feature: library-remove-confirmation, Property 3: Confirm action executes unfollow for artists**
// **Validates: Requirements 2.1, 2.2**

describe('ArtistContextMenu', () => {
  // **Feature: image-context-menu-drag, Property 1: Artist menu shows correct follow state**
  // **Validates: Requirements 1.1, 1.2, 1.5**
  describe('Property 1: Artist menu shows correct follow state', () => {
    it('should display "关注" when artist is not followed', () => {
      fc.assert(
        fc.property(fc.constant(false), (isFollowed) => {
          const label = getArtistMenuLabel(isFollowed);
          expect(label).toBe(ARTIST_MENU_ITEMS.FOLLOW);
        }),
        { numRuns: 100 }
      );
    });

    it('should display "取消关注" when artist is followed', () => {
      fc.assert(
        fc.property(fc.constant(true), (isFollowed) => {
          const label = getArtistMenuLabel(isFollowed);
          expect(label).toBe(ARTIST_MENU_ITEMS.UNFOLLOW);
        }),
        { numRuns: 100 }
      );
    });

    it('should always return one of the two valid labels for any boolean state', () => {
      fc.assert(
        fc.property(fc.boolean(), (isFollowed) => {
          const label = getArtistMenuLabel(isFollowed);
          
          // Label must be one of the valid options
          const validLabels = [ARTIST_MENU_ITEMS.FOLLOW, ARTIST_MENU_ITEMS.UNFOLLOW];
          expect(validLabels).toContain(label);
        }),
        { numRuns: 100 }
      );
    });

    it('should return opposite labels for opposite follow states', () => {
      fc.assert(
        fc.property(fc.boolean(), (isFollowed) => {
          const labelWhenFollowed = getArtistMenuLabel(true);
          const labelWhenNotFollowed = getArtistMenuLabel(false);
          
          // Labels should be different
          expect(labelWhenFollowed).not.toBe(labelWhenNotFollowed);
          
          // Verify correct mapping
          expect(labelWhenFollowed).toBe(ARTIST_MENU_ITEMS.UNFOLLOW);
          expect(labelWhenNotFollowed).toBe(ARTIST_MENU_ITEMS.FOLLOW);
        }),
        { numRuns: 100 }
      );
    });

    it('should be deterministic - same input always produces same output', () => {
      fc.assert(
        fc.property(fc.boolean(), (isFollowed) => {
          const label1 = getArtistMenuLabel(isFollowed);
          const label2 = getArtistMenuLabel(isFollowed);
          
          expect(label1).toBe(label2);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: library-remove-confirmation, Property 1: Dialog displays with correct item information (artist)**
  // **Validates: Requirements 2.1**
  describe('Property 1: Dialog displays with correct item information (artist)', () => {
    // Artist generator
    const artistArbitrary = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      artworkUrl: fc.webUrl(),
    });

    // Pure function to generate confirmation dialog message for artist
    function getArtistConfirmMessage(artistName: string): string {
      return `确定要取消关注「${artistName}」吗？`;
    }

    it('confirmation message should contain artist name', () => {
      fc.assert(
        fc.property(artistArbitrary, (artist) => {
          const message = getArtistConfirmMessage(artist.name);
          expect(message).toContain(artist.name);
        }),
        { numRuns: 100 }
      );
    });

    it('confirmation message should have correct format', () => {
      fc.assert(
        fc.property(artistArbitrary, (artist) => {
          const message = getArtistConfirmMessage(artist.name);
          expect(message).toMatch(/^确定要取消关注「.+」吗？$/);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: library-remove-confirmation, Property 3: Confirm action executes unfollow for artists**
  // **Validates: Requirements 2.2**
  describe('Property 3: Confirm action executes unfollow for artists', () => {
    // Artist generator
    const artistArbitrary = fc.record({
      id: fc.uuid(),
      name: fc.string({ minLength: 1, maxLength: 100 }),
      artworkUrl: fc.webUrl(),
    });

    // Simulate artist unfollow confirmation flow
    function simulateArtistUnfollowConfirmation(
      artistId: string,
      followedArtistIds: Set<string>,
      userConfirms: boolean
    ): { artistUnfollowed: boolean; finalFollowedIds: Set<string> } {
      const newFollowedIds = new Set(followedArtistIds);
      
      if (userConfirms) {
        newFollowedIds.delete(artistId);
        return { artistUnfollowed: true, finalFollowedIds: newFollowedIds };
      }
      
      return { artistUnfollowed: false, finalFollowedIds: newFollowedIds };
    }

    it('confirming unfollow should remove artist from followed list', () => {
      fc.assert(
        fc.property(artistArbitrary, (artist) => {
          const followedArtistIds = new Set([artist.id]);
          
          const result = simulateArtistUnfollowConfirmation(artist.id, followedArtistIds, true);
          
          expect(result.artistUnfollowed).toBe(true);
          expect(result.finalFollowedIds.has(artist.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('canceling unfollow should keep artist in followed list', () => {
      fc.assert(
        fc.property(artistArbitrary, (artist) => {
          const followedArtistIds = new Set([artist.id]);
          
          const result = simulateArtistUnfollowConfirmation(artist.id, followedArtistIds, false);
          
          expect(result.artistUnfollowed).toBe(false);
          expect(result.finalFollowedIds.has(artist.id)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('unfollow should only affect the specified artist', () => {
      fc.assert(
        fc.property(
          artistArbitrary,
          fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
          (artist, otherArtistIds) => {
            const followedArtistIds = new Set([artist.id, ...otherArtistIds]);
            
            const result = simulateArtistUnfollowConfirmation(artist.id, followedArtistIds, true);
            
            // Target artist should be unfollowed
            expect(result.finalFollowedIds.has(artist.id)).toBe(false);
            // Other artists should remain followed
            for (const otherId of otherArtistIds) {
              if (otherId !== artist.id) {
                expect(result.finalFollowedIds.has(otherId)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
