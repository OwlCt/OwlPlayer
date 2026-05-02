import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useRecentlyPlayedStore } from './recentlyPlayedStore';
import { CacheStatus } from './offlineCacheStore';
import type { ReleaseType } from '../types';

// Filter tab types
// 'cached' is conditionally shown when cached albums or playlists exist
export type FilterTab = 'all' | 'playlists' | 'artists' | 'albums' | 'cached';

// Sort option types
export type SortOption = 'recent-played' | 'recent-added' | 'alphabetical' | 'creator';

// View mode types
export type ViewMode = 'list' | 'compact' | 'grid';

// Library item type for unified display
export interface LibraryItem {
  type: 'playlist' | 'album' | 'artist' | 'liked-songs';
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
  artistId?: string;  // For albums, to enable direct artist navigation
  artistName?: string;
  releaseType?: ReleaseType;
  isSingle?: boolean;
  createdAt: string;
  lastPlayedAt?: string;
  isCached?: boolean; // For cached filter tab
  cacheStatus?: CacheStatus; // For partial download indicator
}

// Helper to get lastPlayedAt from recentlyPlayedStore
export const getItemLastPlayedAt = (type: string, id: string): string | undefined => {
  return useRecentlyPlayedStore.getState().getLastPlayedAt(type, id);
};

// Library state interface
interface LibraryState {
  filter: FilterTab;
  sortBy: SortOption;
  searchQuery: string;
  viewMode: ViewMode;
  isExpanded: boolean;

  // Actions
  setFilter: (filter: FilterTab) => void;
  toggleFilter: (filter: FilterTab) => void;
  setSortBy: (sortBy: SortOption) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setExpanded: (expanded: boolean) => void;
  resetFilters: () => void;
}

export const useLibraryStore = create<LibraryState>()(
  persist(
    (set, get) => ({
      filter: 'all',
      sortBy: 'recent-added',
      searchQuery: '',
      viewMode: 'list',
      isExpanded: false,

      setFilter: (filter: FilterTab) => set({ filter }),
      /**
       * Toggle filter: if clicking the same filter that's active, reset to 'all';
       * otherwise set the new filter.
       * **Feature: library-fullscreen-expand, Property 1: Filter Toggle Behavior**
       * **Validates: Requirements 2.1, 2.2**
       */
      toggleFilter: (filter: FilterTab) => {
        const currentFilter = get().filter;
        if (currentFilter === filter) {
          set({ filter: 'all' });
        } else {
          set({ filter });
        }
      },
      setSortBy: (sortBy: SortOption) => set({ sortBy }),
      setSearchQuery: (query: string) => set({ searchQuery: query }),
      setViewMode: (mode: ViewMode) => set({ viewMode: mode }),
      setExpanded: (expanded: boolean) => set({ isExpanded: expanded }),
      resetFilters: () => set({ filter: 'all', sortBy: 'recent-added', searchQuery: '' }),
    }),
    {
      name: 'library-storage',
      partialize: (state) => ({ viewMode: state.viewMode }), // Only persist viewMode
    }
  )
);

// Utility functions for filtering and sorting

/**
 * Filter library items by type
 * **Feature: sidebar-library-expand, Property 1: Filter Returns Only Matching Types**
 * **Validates: Requirements 1.1, 2.1, 2.2, 2.3, 2.4**
 * 
 * For 'cached' filter: returns only items where isCached is true (albums and playlists only)
 */
export const filterLibraryItems = (items: LibraryItem[], filter: FilterTab): LibraryItem[] => {
  if (filter === 'all') {
    return items;
  }

  // Special handling for 'cached' filter - only show cached albums and playlists
  if (filter === 'cached') {
    return items.filter(item => 
      item.isCached === true && (item.type === 'album' || item.type === 'playlist')
    );
  }

  const typeMap: Record<Exclude<FilterTab, 'cached'>, LibraryItem['type'][]> = {
    all: ['playlist', 'album', 'artist', 'liked-songs'],
    playlists: ['playlist', 'liked-songs'],
    artists: ['artist'],
    albums: ['album'],
  };

  const allowedTypes = typeMap[filter];
  return items.filter(item => allowedTypes.includes(item.type));
};

/**
 * Sort library items by the specified option
 * **Feature: sidebar-library-expand, Property 2: Sort Maintains Correct Order**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 * 
 * For 'recent-played' sort: items are sorted by lastPlayedAt from recentlyPlayedStore,
 * mixing playlists, albums, and artists together based on when they were last played.
 * 
 * Note: 'liked-songs' is always pinned to the top regardless of sort option.
 */
export const sortLibraryItems = (items: LibraryItem[], sortBy: SortOption): LibraryItem[] => {
  // Separate liked-songs from other items (liked-songs should always be pinned to top)
  const likedSongs = items.filter(item => item.type === 'liked-songs');
  const otherItems = items.filter(item => item.type !== 'liked-songs');
  
  const sorted = [...otherItems];

  switch (sortBy) {
    case 'recent-played':
      // Get lastPlayedAt from recentlyPlayedStore for each item
      sorted.sort((a, b) => {
        const aLastPlayed = getItemLastPlayedAt(a.type, a.id);
        const bLastPlayed = getItemLastPlayedAt(b.type, b.id);
        const aTime = aLastPlayed ? new Date(aLastPlayed).getTime() : 0;
        const bTime = bLastPlayed ? new Date(bLastPlayed).getTime() : 0;
        // Items with no play history go to the end, sorted by createdAt
        if (aTime === 0 && bTime === 0) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        return bTime - aTime;
      });
      break;

    case 'recent-added':
      sorted.sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        return bTime - aTime;
      });
      break;

    case 'alphabetical':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;

    case 'creator':
      sorted.sort((a, b) => a.subtitle.localeCompare(b.subtitle));
      break;
  }

  // Always put liked-songs at the top
  return [...likedSongs, ...sorted];
};

/**
 * Search library items by name
 * **Feature: sidebar-library-expand, Property 3: Search Returns Only Matching Items**
 * **Validates: Requirements 5.1**
 */
export const searchLibraryItems = (items: LibraryItem[], query: string): LibraryItem[] => {
  if (!query.trim()) {
    return items;
  }

  const lowerQuery = query.toLowerCase().trim();
  return items.filter(item => 
    item.name.toLowerCase().includes(lowerQuery) ||
    item.subtitle.toLowerCase().includes(lowerQuery)
  );
};
