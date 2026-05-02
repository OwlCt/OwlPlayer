import { create } from 'zustand';
import { SearchResult, SearchResultWithTop } from '../types';

// Source tab for navigation - tracks which main tab the user navigated from
export type SourceTab = 'home' | 'search' | 'library' | null;

interface NavigationState {
  // Search state preservation
  searchQuery: string;
  searchResults: SearchResult | SearchResultWithTop | null;
  expandedSection: 'songs' | 'albums' | 'artists' | 'singlesAndEPs' | null;
  
  // Scroll position preservation - keyed by route path
  scrollPositions: Record<string, number>;
  
  // Source tab tracking - which main tab the user navigated from
  sourceTab: SourceTab;
  
  // Actions
  setSearchState: (query: string, results: SearchResult | SearchResultWithTop) => void;
  setExpandedSection: (section: 'songs' | 'albums' | 'artists' | 'singlesAndEPs' | null) => void;
  clearSearchState: () => void;
  
  // Scroll position actions
  saveScrollPosition: (path: string, position: number) => void;
  getScrollPosition: (path: string) => number;
  clearScrollPosition: (path: string) => void;
  
  // Source tab actions
  setSourceTab: (tab: SourceTab) => void;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  searchQuery: '',
  searchResults: null,
  expandedSection: null,
  scrollPositions: {},
  sourceTab: null,

  setSearchState: (query, results) => set({
    searchQuery: query,
    searchResults: results,
  }),

  setExpandedSection: (section) => set({
    expandedSection: section,
  }),

  clearSearchState: () => set({
    searchQuery: '',
    searchResults: null,
    expandedSection: null,
  }),

  saveScrollPosition: (path, position) => set((state) => ({
    scrollPositions: {
      ...state.scrollPositions,
      [path]: position,
    },
  })),

  getScrollPosition: (path) => {
    return get().scrollPositions[path] || 0;
  },

  clearScrollPosition: (path) => set((state) => {
    const { [path]: _, ...rest } = state.scrollPositions;
    return { scrollPositions: rest };
  }),

  setSourceTab: (tab) => set({ sourceTab: tab }),
}));
