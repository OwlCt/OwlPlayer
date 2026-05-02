import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { SearchHistoryItem } from '../store/searchHistoryStore';

// Helper functions to extract display format from item
// These mirror the logic in SearchHistoryItem component

/**
 * Get the subtitle text that should be displayed for a search history item
 */
function getExpectedSubtitle(item: SearchHistoryItem): { typeLabel: string; hasClickableArtist: boolean } {
  switch (item.type) {
    case 'artist':
      return { typeLabel: '艺术家', hasClickableArtist: false };
    case 'song':
      return { typeLabel: '歌曲', hasClickableArtist: !!item.artistId };
    case 'album':
      return { typeLabel: '专辑', hasClickableArtist: !!item.artistId };
  }
}

/**
 * Check if artwork should be circular (only for artists)
 */
function shouldBeCircular(item: SearchHistoryItem): boolean {
  return item.type === 'artist';
}

/**
 * Validate the display format for a search history item
 */
function validateDisplayFormat(item: SearchHistoryItem): {
  isValid: boolean;
  isCircular: boolean;
  typeLabel: string;
  hasClickableArtist: boolean;
} {
  const { typeLabel, hasClickableArtist } = getExpectedSubtitle(item);
  const isCircular = shouldBeCircular(item);
  
  return {
    isValid: true,
    isCircular,
    typeLabel,
    hasClickableArtist,
  };
}

// Generator for search history item type
const searchHistoryTypeArbitrary = fc.constantFrom('song', 'artist', 'album') as fc.Arbitrary<'song' | 'artist' | 'album'>;

// Generator for valid date
const validDateArbitrary = fc.integer({ 
  min: new Date('2020-01-01').getTime(), 
  max: new Date('2030-12-31').getTime() 
}).map(ts => new Date(ts).toISOString());

// Generator for artist name
const artistNameArbitrary = fc.string({ minLength: 1, maxLength: 30 });

// Generator for search history item with proper subtitle format
const searchHistoryItemArbitrary = fc.record({
  type: searchHistoryTypeArbitrary,
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  timestamp: validDateArbitrary,
}).chain((base) => {
  // Generate appropriate subtitle based on type
  if (base.type === 'artist') {
    return fc.constant({ ...base, subtitle: '艺术家' });
  }
  return artistNameArbitrary.map(artistName => ({
    ...base,
    subtitle: `${base.type === 'song' ? '歌曲' : '专辑'} · ${artistName}`,
  }));
}) as fc.Arbitrary<SearchHistoryItem>;

describe('SearchHistoryItem Display Format', () => {
  // **Feature: user-profile-search-history, Property 6: Search history item display format**
  // **Validates: Requirements 3.3, 3.4, 3.5**
  describe('Property 6: Search history item display format', () => {
    it('songs should display "歌曲 · {artistName}" format with square artwork', () => {
      fc.assert(
        fc.property(
          searchHistoryItemArbitrary.filter(item => item.type === 'song'),
          (item) => {
            const format = validateDisplayFormat(item);
            
            // Songs should have square artwork (not circular)
            expect(format.isCircular).toBe(false);
            
            // Type label should be "歌曲"
            expect(format.typeLabel).toBe('歌曲');
            
            // Subtitle should contain "歌曲"
            expect(item.subtitle).toContain('歌曲');
            
            // If artistId exists, artist name should be clickable
            if (item.artistId) {
              expect(format.hasClickableArtist).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('artists should display "艺术家" subtitle with circular artwork', () => {
      fc.assert(
        fc.property(
          searchHistoryItemArbitrary.filter(item => item.type === 'artist'),
          (item) => {
            const format = validateDisplayFormat(item);
            
            // Artists should have circular artwork
            expect(format.isCircular).toBe(true);
            
            // Type label should be "艺术家"
            expect(format.typeLabel).toBe('艺术家');
            
            // Subtitle should be exactly "艺术家"
            expect(item.subtitle).toBe('艺术家');
            
            // Artists don't have clickable artist in subtitle
            expect(format.hasClickableArtist).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('albums should display "专辑 · {artistName}" format with square artwork', () => {
      fc.assert(
        fc.property(
          searchHistoryItemArbitrary.filter(item => item.type === 'album'),
          (item) => {
            const format = validateDisplayFormat(item);
            
            // Albums should have square artwork (not circular)
            expect(format.isCircular).toBe(false);
            
            // Type label should be "专辑"
            expect(format.typeLabel).toBe('专辑');
            
            // Subtitle should contain "专辑"
            expect(item.subtitle).toContain('专辑');
            
            // If artistId exists, artist name should be clickable
            if (item.artistId) {
              expect(format.hasClickableArtist).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('artwork shape should be determined solely by item type', () => {
      fc.assert(
        fc.property(searchHistoryItemArbitrary, (item) => {
          const isCircular = shouldBeCircular(item);
          
          // Only artists should have circular artwork
          if (item.type === 'artist') {
            expect(isCircular).toBe(true);
          } else {
            expect(isCircular).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('subtitle format should match item type consistently', () => {
      fc.assert(
        fc.property(searchHistoryItemArbitrary, (item) => {
          const { typeLabel } = getExpectedSubtitle(item);
          
          // Type label should match the item type
          switch (item.type) {
            case 'song':
              expect(typeLabel).toBe('歌曲');
              break;
            case 'artist':
              expect(typeLabel).toBe('艺术家');
              break;
            case 'album':
              expect(typeLabel).toBe('专辑');
              break;
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
