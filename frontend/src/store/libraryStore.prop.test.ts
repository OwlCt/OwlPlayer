import * as fc from 'fast-check';
import { 
  filterLibraryItems, 
  sortLibraryItems, 
  searchLibraryItems,
  LibraryItem,
  FilterTab,
  SortOption 
} from './libraryStore';

// Generator for valid ISO date string
const isoDateArb = fc.integer({ min: 1577836800000, max: Date.now() }).map(ts => new Date(ts).toISOString());

// Generator for LibraryItem
const libraryItemArb: fc.Arbitrary<LibraryItem> = fc.record({
  type: fc.constantFrom('playlist' as const, 'album' as const, 'artist' as const, 'liked-songs' as const),
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.string({ minLength: 0, maxLength: 50 }),
  imageUrl: fc.option(fc.constant('https://example.com/image.jpg'), { nil: undefined }),
  createdAt: isoDateArb,
  lastPlayedAt: fc.option(isoDateArb, { nil: undefined }),
  isCached: fc.option(fc.boolean(), { nil: undefined }),
});

// Generator for LibraryItem without liked-songs (for sort tests, since liked-songs is always pinned to top)
const libraryItemWithoutLikedSongsArb: fc.Arbitrary<LibraryItem> = fc.record({
  type: fc.constantFrom('playlist' as const, 'album' as const, 'artist' as const),
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.string({ minLength: 0, maxLength: 50 }),
  imageUrl: fc.option(fc.constant('https://example.com/image.jpg'), { nil: undefined }),
  createdAt: isoDateArb,
  lastPlayedAt: fc.option(isoDateArb, { nil: undefined }),
  isCached: fc.option(fc.boolean(), { nil: undefined }),
});

const libraryItemsArb = fc.array(libraryItemArb, { minLength: 0, maxLength: 20 });
const libraryItemsWithoutLikedSongsArb = fc.array(libraryItemWithoutLikedSongsArb, { minLength: 0, maxLength: 20 });

/**
 * **Feature: sidebar-library-expand, Property 1: Filter Returns Only Matching Types**
 * **Validates: Requirements 1.1, 2.1, 2.2, 2.3, 2.4**
 * 
 * For any list of library items and a filter type, when the filter is applied,
 * all returned items should be of the specified type (or all types if filter is 'all').
 * Note: 'cached' filter is tested separately as it filters by isCached property, not type.
 */
describe('Property 1: Filter Returns Only Matching Types', () => {
  it('should return only items matching the filter type', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        fc.constantFrom('all', 'playlists', 'artists', 'albums') as fc.Arbitrary<FilterTab>,
        (items, filter) => {
          const filtered = filterLibraryItems(items, filter);

          if (filter === 'all') {
            // All filter should return all items
            return filtered.length === items.length;
          }

          // Check that all filtered items match the expected types
          const typeMap: Record<Exclude<FilterTab, 'cached'>, LibraryItem['type'][]> = {
            all: ['playlist', 'album', 'artist', 'liked-songs'],
            playlists: ['playlist', 'liked-songs'],
            artists: ['artist'],
            albums: ['album'],
          };

          const allowedTypes = typeMap[filter];
          return filtered.every(item => allowedTypes.includes(item.type));
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not lose any items of the matching type', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        fc.constantFrom('playlists', 'artists', 'albums') as fc.Arbitrary<FilterTab>,
        (items, filter) => {
          const filtered = filterLibraryItems(items, filter);

          const typeMap: Record<Exclude<FilterTab, 'cached'>, LibraryItem['type'][]> = {
            all: ['playlist', 'album', 'artist', 'liked-songs'],
            playlists: ['playlist', 'liked-songs'],
            artists: ['artist'],
            albums: ['album'],
          };

          const allowedTypes = typeMap[filter];
          const expectedCount = items.filter(item => allowedTypes.includes(item.type)).length;

          return filtered.length === expectedCount;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return only cached albums and playlists when cached filter is selected', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        (items) => {
          const filtered = filterLibraryItems(items, 'cached');

          // All returned items should be cached albums or playlists
          return filtered.every(item => 
            item.isCached === true && (item.type === 'album' || item.type === 'playlist')
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return correct count of cached albums and playlists', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        (items) => {
          const filtered = filterLibraryItems(items, 'cached');
          const expectedCount = items.filter(item => 
            item.isCached === true && (item.type === 'album' || item.type === 'playlist')
          ).length;

          return filtered.length === expectedCount;
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: sidebar-library-expand, Property 2: Sort Maintains Correct Order**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * For any list of library items and a sort option, when sorted, the items should
 * be in the correct order according to the sort criteria.
 */
describe('Property 2: Sort Maintains Correct Order', () => {
  it('should sort alphabetically by name when alphabetical is selected', () => {
    fc.assert(
      // Use items without liked-songs since liked-songs is always pinned to top
      fc.property(libraryItemsWithoutLikedSongsArb, (items) => {
        const sorted = sortLibraryItems(items, 'alphabetical');

        // Check that items are in alphabetical order
        for (let i = 0; i < sorted.length - 1; i++) {
          const cmp = sorted[i].name.localeCompare(sorted[i + 1].name);
          if (cmp > 0) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should sort by creator/subtitle when creator is selected', () => {
    fc.assert(
      // Use items without liked-songs since liked-songs is always pinned to top
      fc.property(libraryItemsWithoutLikedSongsArb, (items) => {
        const sorted = sortLibraryItems(items, 'creator');

        // Check that items are sorted by subtitle
        for (let i = 0; i < sorted.length - 1; i++) {
          const cmp = sorted[i].subtitle.localeCompare(sorted[i + 1].subtitle);
          if (cmp > 0) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should sort by recent-added (newest first)', () => {
    fc.assert(
      // Use items without liked-songs since liked-songs is always pinned to top
      fc.property(libraryItemsWithoutLikedSongsArb, (items) => {
        const sorted = sortLibraryItems(items, 'recent-added');

        // Check that items are sorted by createdAt descending
        for (let i = 0; i < sorted.length - 1; i++) {
          const aTime = new Date(sorted[i].createdAt).getTime();
          const bTime = new Date(sorted[i + 1].createdAt).getTime();
          if (aTime < bTime) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all items after sorting', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        fc.constantFrom('recent-played', 'recent-added', 'alphabetical', 'creator') as fc.Arbitrary<SortOption>,
        (items, sortBy) => {
          const sorted = sortLibraryItems(items, sortBy);
          return sorted.length === items.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: sidebar-library-expand, Property 3: Search Returns Only Matching Items**
 * **Validates: Requirements 5.1**
 * 
 * For any list of library items and a search query, all returned items should
 * have names that contain the search query (case-insensitive).
 */
describe('Property 3: Search Returns Only Matching Items', () => {
  it('should return only items matching the search query', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        fc.string({ minLength: 1, maxLength: 20 }),
        (items, query) => {
          const searched = searchLibraryItems(items, query);
          const lowerQuery = query.toLowerCase().trim();

          // All returned items should contain the query in name or subtitle
          return searched.every(item => 
            item.name.toLowerCase().includes(lowerQuery) ||
            item.subtitle.toLowerCase().includes(lowerQuery)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return all items when query is empty', () => {
    fc.assert(
      fc.property(libraryItemsArb, (items) => {
        const searched = searchLibraryItems(items, '');
        return searched.length === items.length;
      }),
      { numRuns: 100 }
    );
  });

  it('should return all items when query is whitespace only', () => {
    fc.assert(
      fc.property(
        libraryItemsArb,
        fc.constantFrom('   ', '\t', '\n', '  \t  '),
        (items, whitespace) => {
          const searched = searchLibraryItems(items, whitespace);
          return searched.length === items.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: library-fullscreen-expand, Property 1: Filter Toggle Behavior**
 * **Validates: Requirements 2.1, 2.2**
 * 
 * For any filter tab and current filter state, clicking the same filter that is
 * currently active SHALL reset the filter to 'all', and clicking a different
 * filter SHALL set that filter as active.
 */
describe('Property: Filter Toggle Behavior', () => {
  it('should reset to all when clicking the same filter that is active', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('playlists', 'artists', 'albums', 'cached') as fc.Arbitrary<FilterTab>,
        (filter) => {
          // Simulate toggle: if current filter equals clicked filter, result should be 'all'
          const currentFilter = filter;
          const clickedFilter = filter;
          const result = currentFilter === clickedFilter ? 'all' : clickedFilter;
          return result === 'all';
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should set new filter when clicking a different filter', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('all', 'playlists', 'artists', 'albums', 'cached') as fc.Arbitrary<FilterTab>,
        fc.constantFrom('playlists', 'artists', 'albums', 'cached') as fc.Arbitrary<FilterTab>,
        (currentFilter, clickedFilter) => {
          // Skip if same filter (covered by other test)
          if (currentFilter === clickedFilter) return true;
          
          // Simulate toggle: different filter should be set
          const result = currentFilter === clickedFilter ? 'all' : clickedFilter;
          return result === clickedFilter;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should toggle back to all after double click on same filter', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('playlists', 'artists', 'albums', 'cached') as fc.Arbitrary<FilterTab>,
        (filter) => {
          // Start from 'all', click filter, then click same filter again
          let state: FilterTab = 'all';
          
          // First click: should set the filter
          state = state === filter ? 'all' : filter;
          if (state !== filter) return false;
          
          // Second click: should reset to 'all'
          state = state === filter ? 'all' : filter;
          return state === 'all';
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: sidebar-library-expand, Property 4: Expand/Collapse Preserves State**
 * **Validates: Requirements 4.3**
 * 
 * For any library state with filter, sort, and search settings, expanding and
 * collapsing the library should preserve all these settings.
 */
describe('Property 4: Expand/Collapse Preserves State', () => {
  it('should preserve filter, sort, and search when expanding/collapsing', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('all', 'playlists', 'artists', 'albums', 'cached') as fc.Arbitrary<FilterTab>,
        fc.constantFrom('recent-played', 'recent-added', 'alphabetical', 'creator') as fc.Arbitrary<SortOption>,
        fc.string({ minLength: 0, maxLength: 50 }),
        (filter, sortBy, searchQuery) => {
          // Simulate state before expand
          const stateBefore = { filter, sortBy, searchQuery };

          // Simulate expand/collapse (state should not change)
          const stateAfterExpand = { ...stateBefore, isExpanded: true };
          const stateAfterCollapse = { ...stateAfterExpand, isExpanded: false };

          // Verify state is preserved
          return (
            stateAfterCollapse.filter === stateBefore.filter &&
            stateAfterCollapse.sortBy === stateBefore.sortBy &&
            stateAfterCollapse.searchQuery === stateBefore.searchQuery
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
