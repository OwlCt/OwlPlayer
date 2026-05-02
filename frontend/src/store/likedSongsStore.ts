import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api';
import { Song } from '../types';
import { prefetchArtworks } from '../utils/imagePrefetch';

// Liked song from API
export interface LikedSong {
  id: string;
  user_id: string;
  song_id: string;
  song_name: string;
  artist_name: string;
  artist_id?: string;
  album_name: string;
  album_id?: string;
  duration: number;
  artwork_url: string;
  has_lyrics: boolean;
  created_at: string;
}

// Convert LikedSong to Song for playback
export const likedSongToSong = (likedSong: LikedSong): Song => ({
  id: likedSong.song_id,
  name: likedSong.song_name,
  artistName: likedSong.artist_name,
  artistId: likedSong.artist_id,
  albumName: likedSong.album_name,
  albumId: likedSong.album_id,
  duration: likedSong.duration,
  artworkUrl: likedSong.artwork_url,
  hasLyrics: likedSong.has_lyrics,
});

// Liked songs state interface
interface LikedSongsState {
  likedSongIds: Set<string>;
  likedSongs: LikedSong[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchLikedSongs: () => Promise<void>;
  likeSong: (song: Song) => Promise<void>;
  unlikeSong: (songId: string) => Promise<void>;
  isLiked: (songId: string) => boolean;
  getLikedSongsCount: () => number;
  clearLikedSongs: () => void;
}


export const useLikedSongsStore = create<LikedSongsState>()(
  persist(
    (set, get) => ({
  likedSongIds: new Set<string>(),
  likedSongs: [],
  isLoading: false,
  error: null,

  fetchLikedSongs: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ success: boolean; songs: LikedSong[]; count: number }>('/liked-songs');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch liked songs');
      }

      const songs = response.data.songs || [];
      const songIds = new Set(songs.map(s => s.song_id));

      set({
        likedSongs: songs,
        likedSongIds: songIds,
        isLoading: false,
        error: null,
      });
      prefetchArtworks(songs.map(s => ({ artworkUrl: s.artwork_url })), [80, 300]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch liked songs';
      set({ isLoading: false, error: message });
    }
  },

  likeSong: async (song: Song) => {
    const { likedSongIds, likedSongs } = get();
    
    // Optimistic update
    const newLikedSongIds = new Set(likedSongIds);
    newLikedSongIds.add(song.id);
    
    const optimisticLikedSong: LikedSong = {
      id: '', // Will be set by server
      user_id: '',
      song_id: song.id,
      song_name: song.name,
      artist_name: song.artistName,
      artist_id: song.artistId,
      album_name: song.albumName,
      album_id: song.albumId,
      duration: song.duration,
      artwork_url: song.artworkUrl,
      has_lyrics: song.hasLyrics,
      created_at: new Date().toISOString(),
    };

    set({
      likedSongIds: newLikedSongIds,
      likedSongs: [optimisticLikedSong, ...likedSongs],
    });

    try {
      const response = await api.post<{ success: boolean; song: LikedSong; message: string }>('/liked-songs', {
        song_id: song.id,
        song_name: song.name,
        artist_name: song.artistName,
        artist_id: song.artistId,
        album_name: song.albumName,
        album_id: song.albumId,
        duration: song.duration,
        artwork_url: song.artworkUrl,
        has_lyrics: song.hasLyrics,
        genres: song.genres || [],
      });

      if (!response.data.success) {
        throw new Error('Failed to like song');
      }

      // Update with server response
      const serverSong = response.data.song;
      set({
        likedSongs: [serverSong, ...likedSongs.filter(s => s.song_id !== song.id)],
      });
    } catch (err) {
      // Rollback on error
      set({
        likedSongIds: likedSongIds,
        likedSongs: likedSongs,
        error: err instanceof Error ? err.message : 'Failed to like song',
      });
    }
  },

  unlikeSong: async (songId: string) => {
    const { likedSongIds, likedSongs } = get();
    
    // Optimistic update
    const newLikedSongIds = new Set(likedSongIds);
    newLikedSongIds.delete(songId);
    
    set({
      likedSongIds: newLikedSongIds,
      likedSongs: likedSongs.filter(s => s.song_id !== songId),
    });

    try {
      const response = await api.delete<{ success: boolean; message: string }>(`/liked-songs/${songId}`);

      if (!response.data.success) {
        throw new Error('Failed to unlike song');
      }
    } catch (err) {
      // Rollback on error
      set({
        likedSongIds: likedSongIds,
        likedSongs: likedSongs,
        error: err instanceof Error ? err.message : 'Failed to unlike song',
      });
    }
  },

  isLiked: (songId: string) => {
    return get().likedSongIds.has(songId);
  },

  getLikedSongsCount: () => {
    return get().likedSongs.length;
  },

  clearLikedSongs: () => {
    set({
      likedSongIds: new Set<string>(),
      likedSongs: [],
      isLoading: false,
      error: null,
    });
  },
}),
    {
      name: 'liked-songs-storage',
      partialize: (state) => ({
        likedSongs: state.likedSongs,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { likedSongs?: LikedSong[] };
        const songs = persisted?.likedSongs || [];
        return {
          ...currentState,
          likedSongs: songs,
          likedSongIds: new Set(songs.map(s => s.song_id)),
        };
      },
    }
  )
);
