import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../api';
import { Album, ReleaseType } from '../types';
import { prefetchArtworks } from '../utils/imagePrefetch';

// Library album from API
export interface LibraryAlbum {
  id: string;
  user_id: string;
  album_id: string;
  album_name: string;
  artist_id?: string;
  artist_name: string;
  artwork_url: string;
  release_date?: string;
  track_count: number;
  release_type?: ReleaseType;
  is_single?: boolean;
  created_at: string;
}

// Convert LibraryAlbum to Album for display
export const libraryAlbumToAlbum = (libraryAlbum: LibraryAlbum): Album => ({
  id: libraryAlbum.album_id,
  name: libraryAlbum.album_name,
  artistId: libraryAlbum.artist_id,
  artistName: libraryAlbum.artist_name,
  artworkUrl: libraryAlbum.artwork_url,
  releaseDate: libraryAlbum.release_date,
  trackCount: libraryAlbum.track_count,
  releaseType: libraryAlbum.release_type,
  isSingle: libraryAlbum.is_single,
});

// Library albums state interface
interface LibraryAlbumsState {
  savedAlbumIds: Set<string>;
  savedAlbums: LibraryAlbum[];
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchLibraryAlbums: () => Promise<void>;
  saveAlbum: (album: Album) => Promise<void>;
  removeAlbum: (albumId: string) => Promise<void>;
  isSaved: (albumId: string) => boolean;
  getLibraryAlbumsCount: () => number;
  clearLibraryAlbums: () => void;
}


export const useLibraryAlbumsStore = create<LibraryAlbumsState>()(
  persist(
    (set, get) => ({
  savedAlbumIds: new Set<string>(),
  savedAlbums: [],
  isLoading: false,
  error: null,

  fetchLibraryAlbums: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get<{ success: boolean; albums: LibraryAlbum[]; count: number }>('/library-albums');
      
      if (!response.data.success) {
        throw new Error('Failed to fetch library albums');
      }

      const albums = response.data.albums || [];
      const albumIds = new Set(albums.map(a => a.album_id));

      set({
        savedAlbums: albums,
        savedAlbumIds: albumIds,
        isLoading: false,
        error: null,
      });
      prefetchArtworks(albums.map(a => ({ artworkUrl: a.artwork_url })), [240, 300]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch library albums';
      set({ isLoading: false, error: message });
    }
  },

  saveAlbum: async (album: Album) => {
    const { savedAlbumIds, savedAlbums } = get();
    
    // Optimistic update
    const newSavedAlbumIds = new Set(savedAlbumIds);
    newSavedAlbumIds.add(album.id);
    
    // Try to get artistId from album or from first track
    const artistId = album.artistId || album.tracks?.[0]?.artistId;
    
    const optimisticLibraryAlbum: LibraryAlbum = {
      id: '', // Will be set by server
      user_id: '',
      album_id: album.id,
      album_name: album.name,
      artist_id: artistId,
      artist_name: album.artistName,
      artwork_url: album.artworkUrl,
      release_date: album.releaseDate,
      track_count: album.trackCount,
      release_type: album.releaseType,
      is_single: album.isSingle,
      created_at: new Date().toISOString(),
    };

    set({
      savedAlbumIds: newSavedAlbumIds,
      savedAlbums: [optimisticLibraryAlbum, ...savedAlbums],
    });

    try {
      const response = await api.post<{ success: boolean; album: LibraryAlbum; message: string }>('/library-albums', {
        album_id: album.id,
        album_name: album.name,
        artist_id: artistId,
        artist_name: album.artistName,
        artwork_url: album.artworkUrl,
        release_date: album.releaseDate,
        track_count: album.trackCount,
        release_type: album.releaseType,
        is_single: album.isSingle,
      });

      if (!response.data.success) {
        throw new Error('Failed to save album');
      }

      // Update with server response
      const serverAlbum = response.data.album;
      set({
        savedAlbums: [serverAlbum, ...savedAlbums.filter(a => a.album_id !== album.id)],
      });
    } catch (err) {
      // Rollback on error
      set({
        savedAlbumIds: savedAlbumIds,
        savedAlbums: savedAlbums,
        error: err instanceof Error ? err.message : 'Failed to save album',
      });
    }
  },

  removeAlbum: async (albumId: string) => {
    const { savedAlbumIds, savedAlbums } = get();
    
    // Optimistic update
    const newSavedAlbumIds = new Set(savedAlbumIds);
    newSavedAlbumIds.delete(albumId);
    
    set({
      savedAlbumIds: newSavedAlbumIds,
      savedAlbums: savedAlbums.filter(a => a.album_id !== albumId),
    });

    try {
      const response = await api.delete<{ success: boolean; message: string }>(`/library-albums/${albumId}`);

      if (!response.data.success) {
        throw new Error('Failed to remove album');
      }
    } catch (err) {
      // Rollback on error
      set({
        savedAlbumIds: savedAlbumIds,
        savedAlbums: savedAlbums,
        error: err instanceof Error ? err.message : 'Failed to remove album',
      });
    }
  },

  isSaved: (albumId: string) => {
    return get().savedAlbumIds.has(albumId);
  },

  getLibraryAlbumsCount: () => {
    return get().savedAlbums.length;
  },

  clearLibraryAlbums: () => {
    set({
      savedAlbumIds: new Set<string>(),
      savedAlbums: [],
      isLoading: false,
      error: null,
    });
  },
}),
    {
      name: 'library-albums-storage',
      partialize: (state) => ({
        savedAlbums: state.savedAlbums,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { savedAlbums?: LibraryAlbum[] };
        const albums = persisted?.savedAlbums || [];
        return {
          ...currentState,
          savedAlbums: albums,
          savedAlbumIds: new Set(albums.map(a => a.album_id)),
        };
      },
    }
  )
);
