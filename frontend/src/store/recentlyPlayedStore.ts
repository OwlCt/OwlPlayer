import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  getRecentlyPlayed as fetchRecentlyPlayed,
  recordPlay as apiRecordPlay,
  clearRecentlyPlayed as apiClearRecentlyPlayed,
  RecentlyPlayedItem as APIRecentlyPlayedItem,
} from '../api';
import { prefetchArtworks } from '../utils/imagePrefetch';

// Recently played item type
export interface RecentlyPlayedItem {
  type: 'playlist' | 'album' | 'artist' | 'liked-songs' | 'daily-mix';
  id: string;
  name: string;
  subtitle: string;
  artworkUrl?: string;
  lastPlayedAt: string; // ISO timestamp
}

// Recently played state interface
interface RecentlyPlayedState {
  items: RecentlyPlayedItem[];
  isLoading: boolean;
  isFetched: boolean;

  // Actions
  fetchRecentlyPlayed: () => Promise<void>;
  recordPlay: (type: RecentlyPlayedItem['type'], id: string, name?: string, subtitle?: string, artworkUrl?: string) => void;
  getLastPlayedAt: (type: string, id: string) => string | undefined;
  clearHistory: () => Promise<void>;
}

const MAX_ITEMS = 100; // Keep last 100 items

const isVisibleRecentlyPlayedItem = (
  item: Pick<APIRecentlyPlayedItem, 'type'> | Pick<RecentlyPlayedItem, 'type'>
): boolean => item.type !== 'daily-mix';

// Convert API item to store item
const convertAPIItem = (item: APIRecentlyPlayedItem): RecentlyPlayedItem => ({
  type: item.type,
  id: item.id,
  name: item.name,
  subtitle: item.subtitle,
  artworkUrl: item.artwork_url,
  lastPlayedAt: item.last_played_at,
});

export const useRecentlyPlayedStore = create<RecentlyPlayedState>()(
  persist(
    (set, get) => ({
      items: [],
      isLoading: false,
      isFetched: false,

      fetchRecentlyPlayed: async () => {
        const { isFetched, isLoading } = get();
        if (isFetched || isLoading) return;

        set({ isLoading: true });
        try {
          const apiItems = await fetchRecentlyPlayed();
          const items = apiItems.filter(isVisibleRecentlyPlayedItem).map(convertAPIItem);
          set({ items, isFetched: true, isLoading: false });
          prefetchArtworks(items.map(it => ({ artworkUrl: it.artworkUrl })), [80, 112, 300]);
        } catch (error) {
          console.error('Failed to fetch recently played:', error);
          set({ isLoading: false });
        }
      },

      recordPlay: (type, id, name = '', subtitle = '', artworkUrl = '') => {
        if (type === 'daily-mix') {
          return;
        }

        const now = new Date().toISOString();
        const { items } = get();

        // Find existing item to preserve its details if not provided
        const existingItem = items.find((item) => item.type === type && item.id === id);
        
        // Optimistic update: update local state immediately
        const filtered = items.filter(
          (item) => !(item.type === type && item.id === id)
        );
        
        // Use provided values or fall back to existing item's values
        const newItem: RecentlyPlayedItem = {
          type,
          id,
          name: name || existingItem?.name || '',
          subtitle: subtitle || existingItem?.subtitle || '',
          artworkUrl: artworkUrl || existingItem?.artworkUrl,
          lastPlayedAt: now,
        };
        
        const newItems = [newItem, ...filtered].slice(0, MAX_ITEMS);
        set({ items: newItems });

        // Sync to server and refresh to get full details
        apiRecordPlay(type, id)
          .then(async () => {
            // Fetch fresh data from server to get complete item details
            try {
              const apiItems = await fetchRecentlyPlayed(10);
              const freshItems = apiItems.filter(isVisibleRecentlyPlayedItem).map(convertAPIItem);
              // Merge: use fresh items for the first few, keep rest from local
              const { items: currentItems } = get();
              const freshIds = new Set(freshItems.map(i => `${i.type}-${i.id}`));
              const remainingItems = currentItems.filter(i => !freshIds.has(`${i.type}-${i.id}`));
              const mergedItems = [...freshItems, ...remainingItems].slice(0, MAX_ITEMS);
              set({ items: mergedItems });
            } catch (error) {
              console.error('Failed to refresh recently played:', error);
            }
          })
          .catch((error) => {
            console.error('Failed to record play to server:', error);
          });
      },

      getLastPlayedAt: (type, id) => {
        const { items } = get();
        const item = items.find((i) => i.type === type && i.id === id);
        return item?.lastPlayedAt;
      },

      clearHistory: async () => {
        set({ items: [] });
        try {
          await apiClearRecentlyPlayed();
        } catch (error) {
          console.error('Failed to clear history on server:', error);
        }
      },
    }),
    {
      name: 'recently-played-storage',
      partialize: (state) => ({ items: state.items }), // Only persist items
    }
  )
);
