import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  QuickAccessItem,
  sortAndLimitItems,
  getItemRoute,
  MAX_QUICK_ACCESS_ITEMS,
  GRID_COLUMNS,
} from './QuickAccessGrid';

// **Feature: spotify-mobile-ui, Property 5: Quick Access Grid Constraints**
// **Validates: Requirements 3.2, 3.4**

// Generator for valid item types
const itemTypeArb = fc.constantFrom(
  'playlist' as const,
  'album' as const,
  'artist' as const,
  'liked-songs' as const,
  'daily-mix' as const
);

// Generator for ISO timestamp strings - using integer timestamps to avoid invalid date issues
const isoTimestampArb = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
}).map(ts => new Date(ts).toISOString());

// Generator for a single QuickAccessItem
const quickAccessItemArb: fc.Arbitrary<QuickAccessItem> = fc.record({
  id: fc.uuid(),
  type: itemTypeArb,
  name: fc.string({ minLength: 1, maxLength: 100 }),
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
  lastPlayedAt: fc.option(isoTimestampArb, { nil: undefined }),
});

// Generator for an array of QuickAccessItems with varying lengths
const quickAccessItemsArb = (minLength: number = 0, maxLength: number = 20) =>
  fc.array(quickAccessItemArb, { minLength, maxLength });

describe('QuickAccessGrid', () => {
  // **Feature: spotify-mobile-ui, Property 5: Quick Access Grid Constraints**
  // **Validates: Requirements 3.2, 3.4**
  describe('Property 5: Quick Access Grid Constraints', () => {
    it('should limit display to at most 6 items regardless of input size', () => {
      fc.assert(
        fc.property(
          quickAccessItemsArb(0, 50),
          (items) => {
            const result = sortAndLimitItems(items);
            expect(result.length).toBeLessThanOrEqual(MAX_QUICK_ACCESS_ITEMS);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all items when input has 6 or fewer items', () => {
      fc.assert(
        fc.property(
          quickAccessItemsArb(0, MAX_QUICK_ACCESS_ITEMS),
          (items) => {
            const result = sortAndLimitItems(items);
            expect(result.length).toBe(items.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should sort items by most recent first (descending lastPlayedAt)', () => {
      fc.assert(
        fc.property(
          quickAccessItemsArb(2, 20),
          (items) => {
            const result = sortAndLimitItems(items);
            
            // Verify descending order by lastPlayedAt
            for (let i = 0; i < result.length - 1; i++) {
              const currentTime = result[i].lastPlayedAt 
                ? new Date(result[i].lastPlayedAt!).getTime() 
                : 0;
              const nextTime = result[i + 1].lastPlayedAt 
                ? new Date(result[i + 1].lastPlayedAt!).getTime() 
                : 0;
              expect(currentTime).toBeGreaterThanOrEqual(nextTime);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return the 8 most recent items when input exceeds 8', () => {
      // Generate items with distinct timestamps to ensure clear ordering
      const itemsWithDistinctTimesArb = fc.array(
        fc.record({
          id: fc.uuid(),
          type: itemTypeArb,
          name: fc.string({ minLength: 1, maxLength: 50 }),
          imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
          lastPlayedAt: isoTimestampArb,
        }),
        { minLength: 9, maxLength: 20 }
      );

      fc.assert(
        fc.property(
          itemsWithDistinctTimesArb,
          (items) => {
            const result = sortAndLimitItems(items);
            
            // Sort original items by time to find expected top 8
            const sortedOriginal = [...items].sort((a, b) => {
              const timeA = new Date(a.lastPlayedAt!).getTime();
              const timeB = new Date(b.lastPlayedAt!).getTime();
              return timeB - timeA;
            });
            const expectedTop8 = sortedOriginal.slice(0, MAX_QUICK_ACCESS_ITEMS);
            
            // Result should contain exactly the top 8 most recent
            expect(result.length).toBe(MAX_QUICK_ACCESS_ITEMS);
            
            // Each result item should be in the expected top 8
            result.forEach(item => {
              const found = expectedTop8.some(
                expected => expected.id === item.id && expected.type === item.type
              );
              expect(found).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle items without lastPlayedAt by treating them as oldest', () => {
      // Create items where some have timestamps and some don't
      const mixedItemsArb = fc.tuple(
        // Items with timestamps
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: itemTypeArb,
            name: fc.string({ minLength: 1, maxLength: 50 }),
            imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
            lastPlayedAt: isoTimestampArb,
          }),
          { minLength: 1, maxLength: 5 }
        ),
        // Items without timestamps
        fc.array(
          fc.record({
            id: fc.uuid(),
            type: itemTypeArb,
            name: fc.string({ minLength: 1, maxLength: 50 }),
            imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
            lastPlayedAt: fc.constant(undefined),
          }),
          { minLength: 1, maxLength: 5 }
        )
      ).map(([withTime, withoutTime]) => [...withTime, ...withoutTime]);

      fc.assert(
        fc.property(
          mixedItemsArb,
          (items) => {
            const result = sortAndLimitItems(items);
            
            // Items with timestamps should come before items without
            let foundWithoutTimestamp = false;
            for (const item of result) {
              if (!item.lastPlayedAt) {
                foundWithoutTimestamp = true;
              } else if (foundWithoutTimestamp) {
                // If we found an item without timestamp, all subsequent should also be without
                // This would fail if an item with timestamp comes after one without
                expect(item.lastPlayedAt).toBeUndefined();
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return empty array for empty input', () => {
      const result = sortAndLimitItems([]);
      expect(result).toEqual([]);
    });

    it('should not mutate the original array', () => {
      fc.assert(
        fc.property(
          quickAccessItemsArb(1, 10),
          (items) => {
            const originalItems = JSON.parse(JSON.stringify(items));
            sortAndLimitItems(items);
            expect(items).toEqual(originalItems);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should respect custom maxItems parameter', () => {
      fc.assert(
        fc.property(
          quickAccessItemsArb(5, 20),
          fc.integer({ min: 1, max: 10 }),
          (items, maxItems) => {
            const result = sortAndLimitItems(items, maxItems);
            expect(result.length).toBeLessThanOrEqual(maxItems);
            expect(result.length).toBe(Math.min(items.length, maxItems));
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Verify grid layout constant
  describe('Grid Layout Constants', () => {
    it('should have 2-column grid layout constant', () => {
      expect(GRID_COLUMNS).toBe(2);
    });

    it('should have max items constant of 8', () => {
      expect(MAX_QUICK_ACCESS_ITEMS).toBe(8);
    });
  });
});


// **Feature: spotify-mobile-ui, Property 6: Navigation from Grid Items**
// **Validates: Requirements 3.3**
describe('Property 6: Navigation from Grid Items', () => {
  it('should generate correct route for liked-songs type', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (id) => {
          const item: QuickAccessItem = {
            id,
            type: 'liked-songs',
            name: 'Liked Songs',
          };
          const route = getItemRoute(item);
          expect(route).toBe('/liked-songs');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate correct route for playlist type', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id, name) => {
          const item: QuickAccessItem = {
            id,
            type: 'playlist',
            name,
          };
          const route = getItemRoute(item);
          expect(route).toBe(`/playlist/${id}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate correct route for album type', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id, name) => {
          const item: QuickAccessItem = {
            id,
            type: 'album',
            name,
          };
          const route = getItemRoute(item);
          expect(route).toBe(`/album/${id}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate correct route for artist type', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id, name) => {
          const item: QuickAccessItem = {
            id,
            type: 'artist',
            name,
          };
          const route = getItemRoute(item);
          expect(route).toBe(`/artist/${id}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate correct route for daily-mix type (maps to playlist)', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id, name) => {
          const item: QuickAccessItem = {
            id,
            type: 'daily-mix',
            name,
          };
          const route = getItemRoute(item);
          expect(route).toBe(`/playlist/${id}`);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate route containing the item id for all navigable types', () => {
    const navigableTypes = ['playlist', 'album', 'artist', 'daily-mix'] as const;
    
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.constantFrom(...navigableTypes),
        fc.string({ minLength: 1, maxLength: 50 }),
        (id, type, name) => {
          const item: QuickAccessItem = {
            id,
            type,
            name,
          };
          const route = getItemRoute(item);
          expect(route).toContain(id);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate valid route paths (starting with /)', () => {
    fc.assert(
      fc.property(
        quickAccessItemArb,
        (item) => {
          const route = getItemRoute(item);
          expect(route.startsWith('/')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should generate deterministic routes (same input = same output)', () => {
    fc.assert(
      fc.property(
        quickAccessItemArb,
        (item) => {
          const route1 = getItemRoute(item);
          const route2 = getItemRoute(item);
          expect(route1).toBe(route2);
        }
      ),
      { numRuns: 100 }
    );
  });
});
