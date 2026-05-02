import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LibraryItem } from '../../store/libraryStore';
import {
  TYPE_LABELS,
  getLibraryItemDisplayInfo,
  LibraryItemDisplayInfo,
} from './MobileLibraryPage';

// **Feature: spotify-mobile-ui, Property 8: Library Item Information**
// **Validates: Requirements 5.2**

// Generator for valid library item types
const libraryItemTypeArb = fc.constantFrom(
  'playlist' as const,
  'album' as const,
  'artist' as const
);

// Generator for ISO timestamp strings
const isoTimestampArb = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
}).map(ts => new Date(ts).toISOString());

// Generator for non-whitespace-only strings (valid titles)
const nonWhitespaceStringArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter(s => s.trim().length > 0);

// Generator for a valid LibraryItem with all required fields
const libraryItemArb: fc.Arbitrary<LibraryItem> = fc.record({
  type: libraryItemTypeArb,
  id: fc.uuid(),
  name: nonWhitespaceStringArb,
  subtitle: fc.string({ minLength: 0, maxLength: 100 }),
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: isoTimestampArb,
  lastPlayedAt: fc.option(isoTimestampArb, { nil: undefined }),
});

// Generator for LibraryItem with guaranteed artwork URL
const libraryItemWithArtworkArb: fc.Arbitrary<LibraryItem> = fc.record({
  type: libraryItemTypeArb,
  id: fc.uuid(),
  name: nonWhitespaceStringArb,
  subtitle: fc.string({ minLength: 0, maxLength: 100 }),
  imageUrl: fc.webUrl(),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: isoTimestampArb,
  lastPlayedAt: fc.option(isoTimestampArb, { nil: undefined }),
});

describe('MobileLibraryPage', () => {
  // **Feature: spotify-mobile-ui, Property 8: Library Item Information**
  // **Validates: Requirements 5.2**
  describe('Property 8: Library Item Information', () => {
    it('should always have a title for any library item', () => {
      fc.assert(
        fc.property(
          libraryItemArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            expect(displayInfo.hasTitle).toBe(true);
            expect(displayInfo.title).toBe(item.name);
            expect(displayInfo.title.trim().length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should always have a type indicator for any library item', () => {
      fc.assert(
        fc.property(
          libraryItemArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            expect(displayInfo.hasTypeIndicator).toBe(true);
            expect(displayInfo.typeIndicator.trim().length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return correct type indicator label for each item type', () => {
      fc.assert(
        fc.property(
          libraryItemArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            const expectedLabel = TYPE_LABELS[item.type];
            expect(displayInfo.typeIndicator).toBe(expectedLabel);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect artwork presence when imageUrl is provided', () => {
      fc.assert(
        fc.property(
          libraryItemWithArtworkArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            expect(displayInfo.hasArtwork).toBe(true);
            expect(displayInfo.artworkUrl).toBe(item.imageUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect artwork absence when imageUrl is undefined', () => {
      const itemWithoutArtworkArb = fc.record({
        type: libraryItemTypeArb,
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 100 }),
        subtitle: fc.string({ minLength: 0, maxLength: 100 }),
        imageUrl: fc.constant(undefined),
        artistId: fc.option(fc.uuid(), { nil: undefined }),
        createdAt: isoTimestampArb,
        lastPlayedAt: fc.option(isoTimestampArb, { nil: undefined }),
      });

      fc.assert(
        fc.property(
          itemWithoutArtworkArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            expect(displayInfo.hasArtwork).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect artwork absence when imageUrl is empty string', () => {
      const itemWithEmptyArtworkArb = fc.record({
        type: libraryItemTypeArb,
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 100 }),
        subtitle: fc.string({ minLength: 0, maxLength: 100 }),
        imageUrl: fc.constant(''),
        artistId: fc.option(fc.uuid(), { nil: undefined }),
        createdAt: isoTimestampArb,
        lastPlayedAt: fc.option(isoTimestampArb, { nil: undefined }),
      });

      fc.assert(
        fc.property(
          itemWithEmptyArtworkArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            expect(displayInfo.hasArtwork).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have type labels defined for all supported library item types', () => {
      const supportedTypes = ['playlist', 'album', 'artist', 'liked-songs'];
      
      supportedTypes.forEach(type => {
        expect(TYPE_LABELS[type]).toBeDefined();
        expect(TYPE_LABELS[type].trim().length).toBeGreaterThan(0);
      });
    });

    it('should return deterministic display info (same input = same output)', () => {
      fc.assert(
        fc.property(
          libraryItemArb,
          (item) => {
            const info1 = getLibraryItemDisplayInfo(item);
            const info2 = getLibraryItemDisplayInfo(item);
            expect(info1).toEqual(info2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve original item data in display info', () => {
      fc.assert(
        fc.property(
          libraryItemArb,
          (item) => {
            const displayInfo = getLibraryItemDisplayInfo(item);
            expect(displayInfo.title).toBe(item.name);
            expect(displayInfo.artworkUrl).toBe(item.imageUrl);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
