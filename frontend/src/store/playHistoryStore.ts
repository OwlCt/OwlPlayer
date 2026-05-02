import { create } from 'zustand';
import {
  getPlayHistory,
  recordPlayHistory,
  getTopArtists as fetchTopArtists,
  getTopTracks as fetchTopTracks,
  clearPlayHistory as apiClearPlayHistory,
  getArtistDetail,
  PlayHistoryItem as APIPlayHistoryItem,
  TopArtistItem as APITopArtistItem,
  TopTrackItem as APITopTrackItem,
} from '../api';
import { Song } from '../types';
import { prefetchArtworks, prefetchArtistImages } from '../utils/imagePrefetch';

// Play history item type (frontend format)
export interface PlayHistoryItem {
  songId: string;
  songName: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  artworkUrl: string;
  duration: number;
  playedAt: string;
}

// Top artist item type (frontend format)
export interface TopArtistItem {
  artistId: string;
  artistName: string;
  artworkUrl: string;
  playCount: number;
}

// Top track item type (frontend format)
export interface TopTrackItem {
  songId: string;
  songName: string;
  artistId: string;
  artistName: string;
  albumId: string;
  albumName: string;
  artworkUrl: string;
  duration: number;
  playCount: number;
}


// Play history state interface
interface PlayHistoryState {
  history: PlayHistoryItem[];
  topArtists: TopArtistItem[];
  topTracks: TopTrackItem[];
  isLoading: boolean;
  isFetched: boolean;
  isTopArtistsFetched: boolean;
  isTopTracksFetched: boolean;

  // Actions
  fetchHistory: (limit?: number, offset?: number) => Promise<void>;
  recordPlay: (song: Song) => void;
  fetchTopArtists: (limit?: number) => Promise<TopArtistItem[]>;
  fetchTopTracks: (limit?: number) => Promise<TopTrackItem[]>;
  clearHistory: () => Promise<void>;
  reset: () => void;
}

// Convert API item to store item
const convertAPIHistoryItem = (item: APIPlayHistoryItem): PlayHistoryItem => ({
  songId: item.song_id,
  songName: item.song_name,
  artistId: item.artist_id,
  artistName: item.artist_name,
  albumId: item.album_id,
  albumName: item.album_name,
  artworkUrl: item.artwork_url,
  duration: item.duration,
  playedAt: item.played_at,
});

const convertAPITopArtist = (item: APITopArtistItem): TopArtistItem => ({
  artistId: item.artist_id,
  artistName: item.artist_name,
  artworkUrl: item.artwork_url,
  playCount: item.play_count,
});

const convertAPITopTrack = (item: APITopTrackItem): TopTrackItem => ({
  songId: item.song_id,
  songName: item.song_name,
  artistId: item.artist_id,
  artistName: item.artist_name,
  albumId: item.album_id,
  albumName: item.album_name,
  artworkUrl: item.artwork_url,
  duration: item.duration,
  playCount: item.play_count,
});


export const usePlayHistoryStore = create<PlayHistoryState>()((set, get) => ({
  history: [],
  topArtists: [],
  topTracks: [],
  isLoading: false,
  isFetched: false,
  isTopArtistsFetched: false,
  isTopTracksFetched: false,

  fetchHistory: async (limit = 50, offset = 0) => {
    const { isLoading } = get();
    if (isLoading) return;

    set({ isLoading: true });
    try {
      const apiItems = await getPlayHistory(limit, offset);
      const items = apiItems.map(convertAPIHistoryItem);
      set({ history: items, isFetched: true, isLoading: false });
    } catch (error) {
      console.error('Failed to fetch play history:', error);
      set({ isLoading: false });
    }
  },

  recordPlay: (song: Song) => {
    // Record to server in background (fire and forget)
    recordPlayHistory({
      song_id: song.id,
      song_name: song.name,
      artist_id: song.artistId || '',
      artist_name: song.artistName,
      album_id: song.albumId || '',
      album_name: song.albumName,
      artwork_url: song.artworkUrl,
      duration: song.duration,
      genres: song.genres || [],
    }).catch((error) => {
      console.error('Failed to record play history:', error);
    });

    // Reset fetched flags so next fetch will get fresh data
    set({ isFetched: false, isTopArtistsFetched: false, isTopTracksFetched: false });
  },

  fetchTopArtists: async (limit = 4) => {
    try {
      const apiItems = await fetchTopArtists(limit);
      const items = apiItems.map(convertAPITopArtist);
      
      // Fetch real artist artwork from API
      const itemsWithArtwork = await Promise.all(
        items.map(async (item) => {
          try {
            const artistDetail = await getArtistDetail(item.artistId);
            return {
              ...item,
              artworkUrl: artistDetail.artworkUrl || item.artworkUrl,
            };
          } catch {
            return item; // Keep original if fetch fails
          }
        })
      );
      
      set({ topArtists: itemsWithArtwork, isTopArtistsFetched: true });
      prefetchArtistImages(itemsWithArtwork.map(a => ({ artworkUrl: a.artworkUrl })), [300]);
      return itemsWithArtwork;
    } catch (error) {
      console.error('Failed to fetch top artists:', error);
      return [];
    }
  },

  fetchTopTracks: async (limit = 4) => {
    try {
      const apiItems = await fetchTopTracks(limit);
      const items = apiItems.map(convertAPITopTrack);
      set({ topTracks: items, isTopTracksFetched: true });
      prefetchArtworks(items.map(t => ({ artworkUrl: t.artworkUrl })), [80, 300]);
      return items;
    } catch (error) {
      console.error('Failed to fetch top tracks:', error);
      return [];
    }
  },

  clearHistory: async () => {
    set({ history: [], topArtists: [], topTracks: [] });
    try {
      await apiClearPlayHistory();
    } catch (error) {
      console.error('Failed to clear play history on server:', error);
    }
  },

  reset: () => {
    set({
      history: [],
      topArtists: [],
      topTracks: [],
      isLoading: false,
      isFetched: false,
      isTopArtistsFetched: false,
      isTopTracksFetched: false,
    });
  },
}));
