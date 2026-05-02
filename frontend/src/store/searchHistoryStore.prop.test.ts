import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { 
  useSearchHistoryStore, 
  SearchHistoryItem,
  MAX_SEARCH_HISTORY_ITEMS,
  SEARCH_HISTORY_DISPLAY_LIMIT 
} from './searchHistoryStore';

// Generator for search history item type
const searchHistoryTypeArbitrary = fc.constantFrom('song', 'artist', 'album') as fc.Arbitrary<'song' | 'artist' | 'album'>;

// Generator for search history item (without timestamp)
const searchHistoryItemInputArbitrary = fc.record({
  type: searchHistoryTypeArbitrary,
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.string({ minLength: 0, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
}) as fc.Arbitrary<Omit<SearchHistoryItem, 'timestamp'>>;

// Generator for full search history item (with timestamp)
const validDateArbitrary = fc.integer({ 
  min: new Date('2020-01-01').getTime(), 
  max: new Date('2030-12-31').getTime() 
}).map(ts => new Date(ts).toISOString());

const searchHistoryItemArbitrary = fc.record({
  type: searchHistoryTypeArbitrary,
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.string({ minLength: 0, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
  artistId: fc.option(fc.uuid(), { nil: undefined }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  timestamp: validDateArbitrary,
}) as fc.Arbitrary<SearchHistoryItem>;

describe('Search History Store', () => {
  beforeEach(() => {
    // Reset store state before each test
    useSearchHistoryStore.setState({ items: [] });
  });

  // **Feature: user-profile-search-history, Property 4: Search history item persistence**
  // **Validates: Requirements 3.1, 4.3**
  describe('Property 4: Search history item persistence', () => {
    it('added item should be retrievable with all fields intact', () => {
      fc.assert(
        fc.property(searchHistoryItemInputArbitrary, (itemInput) => {
          // Reset store
          useSearchHistoryStore.setState({ items: [] });
          
          // Add item
          useSearchHistoryStore.getState().addItem(itemInput);
          
          // Retrieve items
          const items = useSearchHistoryStore.getState().items;
          
          // Should have exactly one item
          expect(items.length).toBe(1);
          
          // All fields should be preserved
          const retrieved = items[0];
          expect(retrieved.type).toBe(itemInput.type);
          expect(retrieved.id).toBe(itemInput.id);
          expect(retrieved.name).toBe(itemInput.name);
          expect(retrieved.subtitle).toBe(itemInput.subtitle);
          expect(retrieved.artworkUrl).toBe(itemInput.artworkUrl);
          expect(retrieved.artistId).toBe(itemInput.artistId);
          expect(retrieved.albumId).toBe(itemInput.albumId);
          
          // Timestamp should be a valid ISO string
          expect(retrieved.timestamp).toBeDefined();
          const date = new Date(retrieved.timestamp);
          expect(date.toString()).not.toBe('Invalid Date');
        }),
        { numRuns: 100 }
      );
    });

    it('duplicate items should be moved to top instead of duplicated', () => {
      fc.assert(
        fc.property(
          searchHistoryItemInputArbitrary,
          fc.array(searchHistoryItemInputArbitrary, { minLength: 1, maxLength: 10 }),
          (duplicateItem, otherItems) => {
            // Reset store
            useSearchHistoryStore.setState({ items: [] });
            
            // Add the item first
            useSearchHistoryStore.getState().addItem(duplicateItem);
            
            // Add other items
            for (const item of otherItems) {
              useSearchHistoryStore.getState().addItem(item);
            }
            
            // Add the same item again
            useSearchHistoryStore.getState().addItem(duplicateItem);
            
            // Get items
            const items = useSearchHistoryStore.getState().items;
            
            // Count occurrences of the duplicate item
            const occurrences = items.filter(
              i => i.id === duplicateItem.id && i.type === duplicateItem.type
            ).length;
            
            // Should only appear once
            expect(occurrences).toBe(1);
            
            // Should be at the top (index 0)
            expect(items[0].id).toBe(duplicateItem.id);
            expect(items[0].type).toBe(duplicateItem.type);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should limit items to MAX_SEARCH_HISTORY_ITEMS', () => {
      fc.assert(
        fc.property(
          fc.array(searchHistoryItemInputArbitrary, { 
            minLength: MAX_SEARCH_HISTORY_ITEMS + 1, 
            maxLength: MAX_SEARCH_HISTORY_ITEMS + 20 
          }),
          (items) => {
            // Reset store
            useSearchHistoryStore.setState({ items: [] });
            
            // Add all items
            for (const item of items) {
              useSearchHistoryStore.getState().addItem(item);
            }
            
            // Get stored items
            const storedItems = useSearchHistoryStore.getState().items;
            
            // Should not exceed max
            expect(storedItems.length).toBeLessThanOrEqual(MAX_SEARCH_HISTORY_ITEMS);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // **Feature: user-profile-search-history, Property 5: Search history display limit**
  // **Validates: Requirements 3.2**
  describe('Property 5: Search history display limit', () => {
    it('getRecentItems should return at most SEARCH_HISTORY_DISPLAY_LIMIT items', () => {
      fc.assert(
        fc.property(
          fc.array(searchHistoryItemInputArbitrary, { minLength: 0, maxLength: 30 }),
          (items) => {
            // Reset store
            useSearchHistoryStore.setState({ items: [] });
            
            // Add all items
            for (const item of items) {
              useSearchHistoryStore.getState().addItem(item);
            }
            
            // Get recent items with default limit
            const recentItems = useSearchHistoryStore.getState().getRecentItems();
            
            // Should not exceed display limit
            expect(recentItems.length).toBeLessThanOrEqual(SEARCH_HISTORY_DISPLAY_LIMIT);
            
            // Should return correct count
            const expectedCount = Math.min(items.length, SEARCH_HISTORY_DISPLAY_LIMIT);
            // Note: actual count may be less due to deduplication
            expect(recentItems.length).toBeLessThanOrEqual(expectedCount);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getRecentItems with custom limit should respect the limit', () => {
      fc.assert(
        fc.property(
          fc.array(searchHistoryItemInputArbitrary, { minLength: 5, maxLength: 20 }),
          fc.integer({ min: 1, max: 15 }),
          (items, customLimit) => {
            // Reset store
            useSearchHistoryStore.setState({ items: [] });
            
            // Add all items
            for (const item of items) {
              useSearchHistoryStore.getState().addItem(item);
            }
            
            // Get recent items with custom limit
            const recentItems = useSearchHistoryStore.getState().getRecentItems(customLimit);
            
            // Should not exceed custom limit
            expect(recentItems.length).toBeLessThanOrEqual(customLimit);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: user-profile-search-history, Property 7: Search history deletion**
  // **Validates: Requirements 4.1**
  describe('Property 7: Search history deletion', () => {
    it('removeItem should decrease list length by exactly 1', () => {
      fc.assert(
        fc.property(
          fc.array(searchHistoryItemInputArbitrary, { minLength: 1, maxLength: 20 }),
          fc.integer({ min: 0, max: 19 }),
          (items, indexToRemove) => {
            // Reset store
            useSearchHistoryStore.setState({ items: [] });
            
            // Add all items
            for (const item of items) {
              useSearchHistoryStore.getState().addItem(item);
            }
            
            // Get current items
            const beforeItems = useSearchHistoryStore.getState().items;
            const beforeLength = beforeItems.length;
            
            // Skip if no items or invalid index
            if (beforeLength === 0) return;
            
            const safeIndex = indexToRemove % beforeLength;
            const itemToRemove = beforeItems[safeIndex];
            
            // Remove the item
            useSearchHistoryStore.getState().removeItem(itemToRemove.id, itemToRemove.type);
            
            // Get updated items
            const afterItems = useSearchHistoryStore.getState().items;
            
            // Length should decrease by 1
            expect(afterItems.length).toBe(beforeLength - 1);
            
            // Item should no longer exist
            const stillExists = afterItems.some(
              i => i.id === itemToRemove.id && i.type === itemToRemove.type
            );
            expect(stillExists).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('clearHistory should remove all items', () => {
      fc.assert(
        fc.property(
          fc.array(searchHistoryItemInputArbitrary, { minLength: 0, maxLength: 20 }),
          (items) => {
            // Reset store
            useSearchHistoryStore.setState({ items: [] });
            
            // Add all items
            for (const item of items) {
              useSearchHistoryStore.getState().addItem(item);
            }
            
            // Clear history
            useSearchHistoryStore.getState().clearHistory();
            
            // Should be empty
            const afterItems = useSearchHistoryStore.getState().items;
            expect(afterItems.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
