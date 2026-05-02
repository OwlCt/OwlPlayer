import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api';
import { Song } from '../types';
import { prefetchArtworks, prefetchImageUrls } from '../utils/imagePrefetch';

// Playlist from API
export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  artwork_url?: string;
  song_count: number;
  created_at: string;
  updated_at: string;
}

// Playlist song from API
export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  song_name: string;
  artist_name: string;
  artist_id?: string;
  album_name: string;
  album_id?: string;
  duration: number;
  artwork_url: string;
  has_lyrics: boolean;
  position: number;
  created_at: string;
}

// Convert PlaylistSong to Song for playback
export const playlistSongToSong = (playlistSong: PlaylistSong): Song => ({
  id: playlistSong.song_id,
  name: playlistSong.song_name,
  artistName: playlistSong.artist_name,
  artistId: playlistSong.artist_id,
  albumName: playlistSong.album_name,
  albumId: playlistSong.album_id,
  duration: playlistSong.duration,
  artworkUrl: playlistSong.artwork_url,
  hasLyrics: playlistSong.has_lyrics,
});

// Playlists state interface
interface PlaylistsState {
  playlists: Playlist[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;

  // Actions
  fetchPlaylists: () => Promise<void>;
  getNextPlaylistName: () => string;
  createPlaylist: (name: string, description?: string) => Promise<Playlist | null>;
  updatePlaylist: (id: string, updates: { name?: string; description?: string; artwork_url?: string; clear_artwork?: boolean }) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  addSongToPlaylist: (playlistId: string, song: Song) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  getPlaylistSongs: (playlistId: string) => Promise<PlaylistSong[]>;
  getSongPlaylists: (songId: string) => Promise<string[]>;
  batchUpdateSongPlaylists: (
    song: Song,
    addToPlaylists: string[],
    removeFromPlaylists: string[]
  ) => Promise<void>;
  clearPlaylists: () => void;
  getPlaylistById: (id: string) => (Playlist & { songs?: Song[] }) | undefined;
}


export const usePlaylistsStore = create<PlaylistsState>()(
  persist(
    (set, get) => ({
  playlists: [],
  isLoading: false,
  isFetching: false,
  error: null,

  fetchPlaylists: async () => {
    const { isFetching } = get();
    if (isFetching) return; // Prevent concurrent requests
    
    set({ isFetching: true, isLoading: true, error: null });
    try {
      const response = await api.get<{ success: boolean; playlists: Playlist[]; count: number }>('/playlists');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch playlists');
      }

      const playlists = response.data.playlists || [];

      set({
        playlists,
        isLoading: false,
        isFetching: false,
        error: null,
      });
      prefetchArtworks(
        playlists
          .filter(playlist => playlist.artwork_url)
          .map(playlist => ({ artworkUrl: playlist.artwork_url })),
        [240, 300]
      );
      prefetchImageUrls(
        playlists
          .filter(playlist => !playlist.artwork_url)
          .map(playlist => `/api/playlists/${playlist.id}/cover`)
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch playlists';
      set({ isLoading: false, isFetching: false, error: message });
    }
  },

  getNextPlaylistName: () => {
    const { playlists } = get();
    // 查找所有"我的 #N 歌单"格式的歌单，提取最大编号
    const pattern = /^我的 #(\d+) 歌单$/;
    let maxNumber = 0;

    for (const playlist of playlists) {
      const match = playlist.name.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNumber) {
          maxNumber = num;
        }
      }
    }

    return `我的 #${maxNumber + 1} 歌单`;
  },

  createPlaylist: async (name: string, description?: string) => {
    try {
      const response = await api.post<{ success: boolean; playlist: Playlist; message: string }>('/playlists', {
        name,
        description,
      });

      if (!response.data.success) {
        throw new Error('Failed to create playlist');
      }

      const newPlaylist = response.data.playlist;
      set(state => ({
        playlists: [newPlaylist, ...state.playlists],
      }));

      return newPlaylist;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create playlist';
      set({ error: message });
      return null;
    }
  },

  updatePlaylist: async (id: string, updates: { name?: string; description?: string; artwork_url?: string; clear_artwork?: boolean }) => {
    const { playlists } = get();
    
    // Optimistic update - if clearing artwork, set it to undefined
    const optimisticUpdates = updates.clear_artwork 
      ? { ...updates, artwork_url: undefined }
      : updates;
    
    set({
      playlists: playlists.map(p => 
        p.id === id ? { ...p, ...optimisticUpdates, updated_at: new Date().toISOString() } : p
      ),
    });

    try {
      const response = await api.put<{ success: boolean; playlist: Playlist; message: string }>(`/playlists/${id}`, updates);

      if (!response.data.success) {
        throw new Error('Failed to update playlist');
      }

      // Update with server response
      set(state => ({
        playlists: state.playlists.map(p => 
          p.id === id ? response.data.playlist : p
        ),
      }));
    } catch (err) {
      // Rollback on error
      set({ playlists, error: err instanceof Error ? err.message : 'Failed to update playlist' });
      throw err;
    }
  },

  deletePlaylist: async (id: string) => {
    const { playlists } = get();
    
    // Optimistic update
    set({
      playlists: playlists.filter(p => p.id !== id),
    });

    try {
      const response = await api.delete<{ success: boolean; message: string }>(`/playlists/${id}`);

      if (!response.data.success) {
        throw new Error('Failed to delete playlist');
      }
    } catch (err) {
      // Rollback on error
      set({ playlists, error: err instanceof Error ? err.message : 'Failed to delete playlist' });
    }
  },

  addSongToPlaylist: async (playlistId: string, song: Song) => {
    try {
      const response = await api.post<{ success: boolean; song: PlaylistSong; message: string }>(`/playlists/${playlistId}/songs`, {
        song_id: song.id,
        song_name: song.name,
        artist_name: song.artistName,
        artist_id: song.artistId,
        album_name: song.albumName,
        album_id: song.albumId,
        duration: song.duration,
        artwork_url: song.artworkUrl,
        has_lyrics: song.hasLyrics,
      });

      if (!response.data.success) {
        throw new Error('Failed to add song to playlist');
      }

      // Update song count and artwork_url (use first song's artwork as fallback if no custom cover)
      set(state => ({
        playlists: state.playlists.map(p => {
          if (p.id !== playlistId) return p;
          const newCount = p.song_count + 1;
          // If playlist has no custom artwork and this is the first song, use song's artwork
          const newArtworkUrl = (!p.artwork_url && newCount === 1 && song.artworkUrl) 
            ? song.artworkUrl 
            : p.artwork_url;
          return { ...p, song_count: newCount, artwork_url: newArtworkUrl };
        }),
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add song to playlist';
      set({ error: message });
      throw err;
    }
  },

  removeSongFromPlaylist: async (playlistId: string, songId: string) => {
    try {
      const response = await api.delete<{ success: boolean; message: string }>(`/playlists/${playlistId}/songs/${songId}`);

      if (!response.data.success) {
        throw new Error('Failed to remove song from playlist');
      }

      // Update song count optimistically
      set(state => ({
        playlists: state.playlists.map(p => 
          p.id === playlistId ? { ...p, song_count: Math.max(0, p.song_count - 1) } : p
        ),
      }));

      // Refresh playlists to get updated artwork_url (in case first song was removed)
      const { fetchPlaylists } = get();
      fetchPlaylists();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove song from playlist';
      set({ error: message });
      throw err;
    }
  },

  getPlaylistSongs: async (playlistId: string) => {
    try {
      const response = await api.get<{ success: boolean; songs: PlaylistSong[]; count: number }>(`/playlists/${playlistId}/songs`);

      if (!response.data.success) {
        throw new Error('Failed to get playlist songs');
      }

      return response.data.songs || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get playlist songs';
      set({ error: message });
      return [];
    }
  },

  getSongPlaylists: async (songId: string) => {
    try {
      const response = await api.get<{ success: boolean; playlist_ids: string[] }>(`/song-playlists/${songId}`);

      if (!response.data.success) {
        throw new Error('Failed to get song playlists');
      }

      return response.data.playlist_ids || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get song playlists';
      set({ error: message });
      return [];
    }
  },

  batchUpdateSongPlaylists: async (
    song: Song,
    addToPlaylists: string[],
    removeFromPlaylists: string[]
  ) => {
    const errors: string[] = [];

    // Add song to playlists
    for (const playlistId of addToPlaylists) {
      try {
        const response = await api.post<{ success: boolean; song: PlaylistSong; message: string }>(`/playlists/${playlistId}/songs`, {
          song_id: song.id,
          song_name: song.name,
          artist_name: song.artistName,
          artist_id: song.artistId,
          album_name: song.albumName,
          album_id: song.albumId,
          duration: song.duration,
          artwork_url: song.artworkUrl,
          has_lyrics: song.hasLyrics,
        });

        if (response.data.success) {
          // Update song count and artwork_url (use first song's artwork as fallback if no custom cover)
          set(state => ({
            playlists: state.playlists.map(p => {
              if (p.id !== playlistId) return p;
              const newCount = p.song_count + 1;
              // If playlist has no custom artwork and this is the first song, use song's artwork
              const newArtworkUrl = (!p.artwork_url && newCount === 1 && song.artworkUrl) 
                ? song.artworkUrl 
                : p.artwork_url;
              return { ...p, song_count: newCount, artwork_url: newArtworkUrl };
            }),
          }));
        }
      } catch (err) {
        // Ignore "already in playlist" errors (409)
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status?: number } };
          if (axiosErr.response?.status !== 409) {
            errors.push(`Failed to add to playlist ${playlistId}`);
          }
        }
      }
    }

    // Remove song from playlists
    for (const playlistId of removeFromPlaylists) {
      try {
        const response = await api.delete<{ success: boolean; message: string }>(`/playlists/${playlistId}/songs/${song.id}`);

        if (response.data.success) {
          // Update song count
          set(state => ({
            playlists: state.playlists.map(p => 
              p.id === playlistId ? { ...p, song_count: Math.max(0, p.song_count - 1) } : p
            ),
          }));
        }
      } catch (err) {
        // Ignore "not in playlist" errors (404)
        if (err && typeof err === 'object' && 'response' in err) {
          const axiosErr = err as { response?: { status?: number } };
          if (axiosErr.response?.status !== 404) {
            errors.push(`Failed to remove from playlist ${playlistId}`);
          }
        }
      }
    }

    // Refresh playlists to get updated artwork_url (in case first song was removed)
    if (removeFromPlaylists.length > 0) {
      const { fetchPlaylists } = get();
      fetchPlaylists();
    }

    if (errors.length > 0) {
      set({ error: errors.join(', ') });
      throw new Error(errors.join(', '));
    }
  },

  clearPlaylists: () => {
    set({
      playlists: [],
      isLoading: false,
      isFetching: false,
      error: null,
    });
  },

  getPlaylistById: (id: string) => {
    const { playlists } = get();
    return playlists.find(p => p.id === id);
  },
}),
    {
      name: 'playlists-storage',
      partialize: (state) => ({
        playlists: state.playlists,
      }),
    }
  )
);
