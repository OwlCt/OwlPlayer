import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api';
import { prefetchArtistImages } from '../utils/imagePrefetch';

// Followed artist from API
export interface FollowedArtist {
  id: string;
  user_id: string;
  artist_id: string;
  artist_name: string;
  artwork_url: string;
  created_at: string;
}

// Artist info for follow action
export interface ArtistInfo {
  id: string;
  name: string;
  artworkUrl?: string;
  genres?: string[];
}

// Followed artists state interface
interface FollowedArtistsState {
  followedArtistIds: Set<string>;
  followedArtists: FollowedArtist[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchFollowedArtists: () => Promise<void>;
  followArtist: (artist: ArtistInfo) => Promise<void>;
  unfollowArtist: (artistId: string) => Promise<void>;
  isFollowed: (artistId: string) => boolean;
  getFollowedArtistsCount: () => number;
  clearFollowedArtists: () => void;
}

export const useFollowedArtistsStore = create<FollowedArtistsState>()(
  persist(
    (set, get) => ({
  followedArtistIds: new Set<string>(),
  followedArtists: [],
  isLoading: false,
  error: null,

  fetchFollowedArtists: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ success: boolean; artists: FollowedArtist[]; count: number }>('/followed-artists');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch followed artists');
      }

      const artists = response.data.artists || [];
      const artistIds = new Set(artists.map(a => a.artist_id));


      set({
        followedArtists: artists,
        followedArtistIds: artistIds,
        isLoading: false,
        error: null,
      });
      prefetchArtistImages(artists.map(a => ({ artworkUrl: a.artwork_url })), [300]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch followed artists';
      set({ isLoading: false, error: message });
    }
  },

  followArtist: async (artist: ArtistInfo) => {
    const { followedArtistIds, followedArtists } = get();
    
    // Prevent duplicate follows
    if (followedArtistIds.has(artist.id)) {
      return;
    }
    
    // Optimistic update
    const newFollowedArtistIds = new Set(followedArtistIds);
    newFollowedArtistIds.add(artist.id);
    
    const optimisticFollowedArtist: FollowedArtist = {
      id: '', // Will be set by server
      user_id: '',
      artist_id: artist.id,
      artist_name: artist.name,
      artwork_url: artist.artworkUrl || '',
      created_at: new Date().toISOString(),
    };

    set({
      followedArtistIds: newFollowedArtistIds,
      followedArtists: [optimisticFollowedArtist, ...followedArtists],
    });

    try {
      const response = await api.post<{ success: boolean; artist: FollowedArtist; message: string }>('/followed-artists', {
        artist_id: artist.id,
        artist_name: artist.name,
        artwork_url: artist.artworkUrl || '',
        genres: artist.genres || [],
      });

      if (!response.data.success) {
        throw new Error('Failed to follow artist');
      }

      // Update with server response
      const serverArtist = response.data.artist;
      set({
        followedArtists: [serverArtist, ...followedArtists.filter(a => a.artist_id !== artist.id)],
      });
    } catch (err) {
      console.error('Follow artist error:', err);
      // Rollback on error
      set({
        followedArtistIds: followedArtistIds,
        followedArtists: followedArtists,
        error: err instanceof Error ? err.message : 'Failed to follow artist',
      });
      throw err; // Re-throw so the button knows it failed
    }
  },

  unfollowArtist: async (artistId: string) => {
    const { followedArtistIds, followedArtists } = get();
    
    // Optimistic update
    const newFollowedArtistIds = new Set(followedArtistIds);
    newFollowedArtistIds.delete(artistId);
    
    set({
      followedArtistIds: newFollowedArtistIds,
      followedArtists: followedArtists.filter(a => a.artist_id !== artistId),
    });

    try {
      const response = await api.delete<{ success: boolean; message: string }>(`/followed-artists/${artistId}`);

      if (!response.data.success) {
        throw new Error('Failed to unfollow artist');
      }
    } catch (err) {
      console.error('Unfollow artist error:', err);
      // Rollback on error
      set({
        followedArtistIds: followedArtistIds,
        followedArtists: followedArtists,
        error: err instanceof Error ? err.message : 'Failed to unfollow artist',
      });
      throw err; // Re-throw so the button knows it failed
    }
  },

  isFollowed: (artistId: string) => {
    return get().followedArtistIds.has(artistId);
  },

  getFollowedArtistsCount: () => {
    return get().followedArtists.length;
  },

  clearFollowedArtists: () => {
    set({
      followedArtistIds: new Set<string>(),
      followedArtists: [],
      isLoading: false,
      error: null,
    });
  },
}),
    {
      name: 'followed-artists-storage',
      partialize: (state) => ({
        followedArtists: state.followedArtists,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { followedArtists?: FollowedArtist[] };
        const artists = persisted?.followedArtists || [];
        return {
          ...currentState,
          followedArtists: artists,
          followedArtistIds: new Set(artists.map(a => a.artist_id)),
        };
      },
    }
  )
);
