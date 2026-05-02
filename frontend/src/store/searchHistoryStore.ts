import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Configuration constants
const MAX_SEARCH_HISTORY_ITEMS = 50;  // Maximum items stored
const SEARCH_HISTORY_DISPLAY_LIMIT = 10;  // Maximum items shown in dropdown

// Search history item type
export interface SearchHistoryItem {
  type: 'song' | 'artist' | 'album';
  id: string;
  name: string;
  subtitle: string;      // "歌曲 · 艺人名" / "艺术家" / "专辑 · 艺人名"
  artworkUrl: string;
  artistId?: string;     // For song and album artist navigation
  artistName?: string;   // Artist name for display
  albumId?: string;      // For song album navigation
  timestamp: string;     // ISO timestamp
}

// Search history state interface
interface SearchHistoryState {
  items: SearchHistoryItem[];
  
  // Actions
  addItem: (item: Omit<SearchHistoryItem, 'timestamp'>) => void;
  removeItem: (id: string, type: string) => void;
  clearHistory: () => void;
  getRecentItems: (limit?: number) => SearchHistoryItem[];
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const timestamp = new Date().toISOString();
        const newItem: SearchHistoryItem = { ...item, timestamp };
        
        set((state) => {
          // Remove existing item with same id and type (to move it to top)
          const filteredItems = state.items.filter(
            (i) => !(i.id === item.id && i.type === item.type)
          );
          
          // Add new item at the beginning
          const updatedItems = [newItem, ...filteredItems];
          
          // Limit to max items
          return {
            items: updatedItems.slice(0, MAX_SEARCH_HISTORY_ITEMS),
          };
        });
      },

      removeItem: (id, type) => {
        set((state) => ({
          items: state.items.filter(
            (item) => !(item.id === id && item.type === type)
          ),
        }));
      },

      clearHistory: () => {
        set({ items: [] });
      },

      getRecentItems: (limit = SEARCH_HISTORY_DISPLAY_LIMIT) => {
        const { items } = get();
        return items.slice(0, limit);
      },
    }),
    {
      name: 'search-history-storage',
      // Only persist the items array
      partialize: (state) => ({ items: state.items }),
    }
  )
);

// Export constants for testing
export { MAX_SEARCH_HISTORY_ITEMS, SEARCH_HISTORY_DISPLAY_LIMIT };
