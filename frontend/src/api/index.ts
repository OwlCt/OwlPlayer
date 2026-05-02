import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  APIResponse,
  SearchResult,
  SearchResultWithTop,
  SuggestionResult,
  LyricsResponse,
  Playlist,
  Song,
  SongDetail,
  AlbumDetail,
  ArtistDetail,
  PaginatedSearchResult,
  User,
  MetadataOverrideMode,
  MetadataLyricsSource,
} from "../types";
import { getManualOfflineMode } from "../hooks/useOnlineStatus";
import { getAuthenticatedStreamUrl } from "../utils/streamUrl";

// localStorage keys (must match authStore)
const TOKEN_KEY = "auth-token";
const REFRESH_TOKEN_KEY = "auth-refresh-token";

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Custom error class for offline mode
 * Thrown when network requests are blocked due to offline mode being enabled
 */
export class OfflineModeError extends Error {
  constructor(message: string = "离线模式已启用，网络请求已被阻止以节约流量") {
    super(message);
    this.name = "OfflineModeError";
  }
}

/**
 * Check if a request should be allowed in offline mode
 * Only local cache-related operations should be allowed
 */
function isOfflineAllowedRequest(url: string | undefined): boolean {
  // No URL means block
  if (!url) return false;

  const pathname = url.split("?")[0];

  // Allow explicit authentication flows so a user can still sign in, register,
  // or recover access even if manual offline mode was previously enabled.
  return [
    "/setup/status",
    "/setup/test-db",
    "/setup/bootstrap-config",
    "/setup/bootstrap-admin",
    "/setup/runtime-settings",
    "/auth/login",
    "/auth/login-with-code",
    "/auth/send-login-code",
    "/auth/register",
    "/auth/verify-email",
    "/auth/resend-code",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].includes(pathname);
}

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - block requests in offline mode and add auth header
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Check if offline mode is enabled - block ALL network requests to save bandwidth
    if (getManualOfflineMode() && !isOfflineAllowedRequest(config.url)) {
      // Reject the request immediately without making any network call
      return Promise.reject(new OfflineModeError());
    }

    // Skip adding auth header for auth endpoints (login, register, etc.)
    // This prevents issues when a different user tries to login while another is logged in
    const isAuthEndpoint = config.url?.startsWith("/auth/");

    const token = localStorage.getItem(TOKEN_KEY);
    if (token && config.headers && !isAuthEndpoint) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle 401 and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Skip refresh for auth endpoints
    const isAuthEndpoint = originalRequest?.url?.startsWith("/auth/");

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        // Wait for the refresh to complete
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              resolve(api(originalRequest));
            },
            reject: (err: Error) => reject(err),
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        isRefreshing = false;
        // Clear storage and redirect to login
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem("auth-user");
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const response = await axios.post("/api/auth/refresh", {
          refresh_token: refreshToken,
        });

        if (response.data.success && response.data.token) {
          const token = response.data.token;
          localStorage.setItem(TOKEN_KEY, token.access_token);
          localStorage.setItem(REFRESH_TOKEN_KEY, token.refresh_token);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token.access_token}`;
          }

          processQueue(null, token.access_token);
          return api(originalRequest);
        } else {
          throw new Error("Refresh failed");
        }
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        // Clear storage and redirect to login
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        localStorage.removeItem("auth-user");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

// Search API
export const search = async (
  query: string,
  type: string = "all",
): Promise<SearchResult> => {
  const response = await api.get<APIResponse<SearchResult>>("/search", {
    params: { q: query, type },
  });
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Search failed");
  }
  return response.data.data!;
};

// Search API with topResults for Best Match and section ordering
export const searchWithTopResults = async (
  query: string,
): Promise<SearchResultWithTop> => {
  const response = await api.get<APIResponse<SearchResultWithTop>>("/search", {
    params: { q: query, type: "all", with: "topResults" },
  });
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Search failed");
  }
  return response.data.data!;
};

// Search Suggestions API
export const getSearchSuggestions = async (
  term: string,
): Promise<SuggestionResult> => {
  const response = await api.get<APIResponse<SuggestionResult>>(
    "/search/suggestions",
    {
      params: { term },
    },
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get suggestions",
    );
  }
  return response.data.data!;
};

// Paginated search API for infinite scroll
export const searchPaginated = async (
  query: string,
  type: "songs" | "albums" | "artists",
  offset: number = 0,
  limit: number = 20,
): Promise<PaginatedSearchResult> => {
  const response = await api.get<APIResponse<PaginatedSearchResult>>(
    "/search",
    {
      params: { q: query, type, offset, limit },
    },
  );
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Search failed");
  }
  return response.data.data!;
};

// Search with ranking
export const searchRanked = async (query: string): Promise<SearchResult> => {
  const response = await api.get<APIResponse<SearchResult>>("/search", {
    params: { q: query, type: "all", ranked: "true" },
  });
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Search failed");
  }
  return response.data.data!;
};

// Get lyrics
export const getLyrics = async (songId: string): Promise<LyricsResponse> => {
  const response = await api.get<APIResponse<LyricsResponse>>(
    `/lyrics/${songId}`,
  );
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Failed to get lyrics");
  }
  return response.data.data!;
};

// Get song detail (including credits)
export const getSongDetail = async (songId: string): Promise<SongDetail> => {
  const response = await api.get<APIResponse<SongDetail>>(`/song/${songId}`);
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get song detail",
    );
  }
  return response.data.data!;
};

// Get stream URL (for audio element src)
export const getStreamUrl = (songId: string): string => {
  return getAuthenticatedStreamUrl(songId, false);
};

// Get album detail
export const getAlbumDetail = async (albumId: string): Promise<AlbumDetail> => {
  const response = await api.get<APIResponse<AlbumDetail>>(`/album/${albumId}`);
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get album detail",
    );
  }
  return response.data.data!;
};

// Album version type for other-versions
export interface AlbumVersion {
  id: string;
  name: string;
  artistName: string;
  artworkUrl: string;
  releaseDate: string;
  trackCount: number;
  contentRating?: string;
}

// Get album other versions (deluxe, Japan edition, etc.)
// Album related result with hasMore flag
export interface AlbumRelatedResult {
  albums: AlbumVersion[];
  hasMore: boolean;
}

export const getAlbumOtherVersions = async (
  albumId: string,
): Promise<AlbumVersion[]> => {
  try {
    const response = await api.get<APIResponse<AlbumVersion[]>>(
      `/album/${albumId}/other-versions`,
    );
    if (response.data.status === "error") {
      throw new Error(
        response.data.error?.message || "Failed to get album versions",
      );
    }
    return response.data.data || [];
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 410)
    ) {
      return [];
    }
    throw error;
  }
};

// Get album "you might also like" recommendations (first page with hasMore)
export const getAlbumYouMightAlsoLike = async (
  albumId: string,
): Promise<AlbumRelatedResult> => {
  try {
    const response = await api.get<APIResponse<AlbumRelatedResult>>(
      `/album/${albumId}/you-might-also-like`,
    );
    if (response.data.status === "error") {
      throw new Error(
        response.data.error?.message || "Failed to get album recommendations",
      );
    }
    return response.data.data || { albums: [], hasMore: false };
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 410)
    ) {
      return { albums: [], hasMore: false };
    }
    throw error;
  }
};

// Get album "more by artist" recommendations (first page with hasMore)
export const getAlbumMoreByArtist = async (
  albumId: string,
): Promise<AlbumRelatedResult> => {
  try {
    const response = await api.get<APIResponse<AlbumRelatedResult>>(
      `/album/${albumId}/more-by-artist`,
    );
    if (response.data.status === "error") {
      throw new Error(
        response.data.error?.message || "Failed to get more by artist",
      );
    }
    return response.data.data || { albums: [], hasMore: false };
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 410)
    ) {
      return { albums: [], hasMore: false };
    }
    throw error;
  }
};

// Get album "appears on" recommendations (first page with hasMore)
export const getAlbumAppearsOn = async (
  albumId: string,
): Promise<AlbumRelatedResult> => {
  try {
    const response = await api.get<APIResponse<AlbumRelatedResult>>(
      `/album/${albumId}/appears-on`,
    );
    if (response.data.status === "error") {
      throw new Error(
        response.data.error?.message || "Failed to get appears on",
      );
    }
    return response.data.data || { albums: [], hasMore: false };
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 404 || error.response?.status === 410)
    ) {
      return { albums: [], hasMore: false };
    }
    throw error;
  }
};

// Get all album "you might also like" recommendations
export const getAlbumYouMightAlsoLikeAll = async (
  albumId: string,
): Promise<AlbumVersion[]> => {
  const response = await api.get<APIResponse<AlbumVersion[]>>(
    `/album/${albumId}/you-might-also-like/all`,
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get album recommendations",
    );
  }
  return response.data.data || [];
};

// Get all album "more by artist" recommendations
export const getAlbumMoreByArtistAll = async (
  albumId: string,
): Promise<AlbumVersion[]> => {
  const response = await api.get<APIResponse<AlbumVersion[]>>(
    `/album/${albumId}/more-by-artist/all`,
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get more by artist",
    );
  }
  return response.data.data || [];
};

// Get all album "appears on" recommendations
export const getAlbumAppearsOnAll = async (
  albumId: string,
): Promise<AlbumVersion[]> => {
  const response = await api.get<APIResponse<AlbumVersion[]>>(
    `/album/${albumId}/appears-on/all`,
  );
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Failed to get appears on");
  }
  return response.data.data || [];
};

// Get all album other versions
export const getAlbumOtherVersionsAll = async (
  albumId: string,
): Promise<AlbumVersion[]> => {
  const response = await api.get<APIResponse<AlbumVersion[]>>(
    `/album/${albumId}/other-versions/all`,
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get album versions",
    );
  }
  return response.data.data || [];
};

// Paginated album related APIs
export const getAlbumYouMightAlsoLikePaginated = async (
  albumId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<AlbumRelatedResult> => {
  const response = await api.get<APIResponse<AlbumRelatedResult>>(
    `/album/${albumId}/you-might-also-like/all`,
    {
      params: { offset, limit },
    },
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get album recommendations",
    );
  }
  return response.data.data || { albums: [], hasMore: false };
};

export const getAlbumMoreByArtistPaginated = async (
  albumId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<AlbumRelatedResult> => {
  const response = await api.get<APIResponse<AlbumRelatedResult>>(
    `/album/${albumId}/more-by-artist/all`,
    {
      params: { offset, limit },
    },
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get more by artist",
    );
  }
  return response.data.data || { albums: [], hasMore: false };
};

export const getAlbumAppearsOnPaginated = async (
  albumId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<AlbumRelatedResult> => {
  const response = await api.get<APIResponse<AlbumRelatedResult>>(
    `/album/${albumId}/appears-on/all`,
    {
      params: { offset, limit },
    },
  );
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Failed to get appears on");
  }
  return response.data.data || { albums: [], hasMore: false };
};

export const getAlbumOtherVersionsPaginated = async (
  albumId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<AlbumRelatedResult> => {
  const response = await api.get<APIResponse<AlbumRelatedResult>>(
    `/album/${albumId}/other-versions/all`,
    {
      params: { offset, limit },
    },
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get album versions",
    );
  }
  return response.data.data || { albums: [], hasMore: false };
};

// Get artist detail
export const getArtistDetail = async (
  artistId: string,
): Promise<ArtistDetail> => {
  const response = await api.get<APIResponse<ArtistDetail>>(
    `/artist/${artistId}`,
  );
  if (response.data.status === "error") {
    throw new Error(
      response.data.error?.message || "Failed to get artist detail",
    );
  }
  return response.data.data!;
};

export interface ArtistMetadataCorrectionPayload {
  entityType: "artist";
  entityId: number;
  overrideMode: MetadataOverrideMode;
  manualData?: Record<string, unknown>;
  lyricsSource?: MetadataLyricsSource;
  local: {
    name: string;
    artworkUrl?: string;
    artworkWidth?: number;
    artworkHeight?: number;
    genres?: string[];
    motionVideoUrl?: string;
    landscapeUrl?: string;
    appleMusicId?: string;
  };
  resolved: {
    name: string;
    artworkUrl?: string;
    artworkWidth?: number;
    artworkHeight?: number;
    genres?: string[];
    motionVideoUrl?: string;
    landscapeUrl?: string;
    appleMusicId?: string;
  };
  metadataState: {
    overrideMode: MetadataOverrideMode;
    usesAppleMusic: boolean;
    usesManualOverride: boolean;
    displaySource: string;
  };
  currentMatch?: {
    id: string;
    name: string;
    artworkUrl?: string;
    genres?: string[];
  };
  candidates: Array<{
    id: string;
    name: string;
    artworkUrl?: string;
    genres?: string[];
  }>;
}

export interface AlbumMetadataCorrectionPayload {
  entityType: "album";
  entityId: number;
  overrideMode: MetadataOverrideMode;
  manualData?: Record<string, unknown>;
  lyricsSource?: MetadataLyricsSource;
  local: {
    name: string;
    artworkUrl?: string;
    releaseDate?: string;
    artistName?: string;
    appleMusicId?: string;
  };
  resolved: {
    name: string;
    artworkUrl?: string;
    releaseDate?: string;
    artistName?: string;
    appleMusicId?: string;
  };
  metadataState: {
    overrideMode: MetadataOverrideMode;
    usesAppleMusic: boolean;
    usesManualOverride: boolean;
    displaySource: string;
  };
  currentMatch?: {
    id: string;
    name: string;
    subtitle?: string;
    artworkUrl?: string;
    releaseDate?: string;
  };
  candidates: Array<{
    id: string;
    name: string;
    subtitle?: string;
    artworkUrl?: string;
    releaseDate?: string;
  }>;
}

export type MetadataCorrectionPayload =
  | ArtistMetadataCorrectionPayload
  | AlbumMetadataCorrectionPayload;

export const getAdminMetadataCorrection = async (
  entityType: "artist" | "album",
  entityId: string | number,
): Promise<MetadataCorrectionPayload> => {
  const response = await api.get<{
    success: boolean;
    payload: MetadataCorrectionPayload;
  }>(`/admin/local-library/metadata/${entityType}/${entityId}`);
  if (!response.data.success) {
    throw new Error("Failed to get metadata correction payload");
  }
  return response.data.payload;
};

export const updateAdminMetadataCorrection = async (
  entityType: "artist" | "album",
  entityId: string | number,
  payload: {
    overrideMode?: MetadataOverrideMode;
    manualData?: Record<string, unknown>;
    appleMusicId?: string | null;
    clearMatch?: boolean;
    lyricsSource?: MetadataLyricsSource;
  },
): Promise<MetadataCorrectionPayload> => {
  const response = await api.put<{
    success: boolean;
    payload: MetadataCorrectionPayload;
  }>(`/admin/local-library/metadata/${entityType}/${entityId}`, payload);
  if (!response.data.success) {
    throw new Error("Failed to update metadata correction");
  }
  return response.data.payload;
};

export const clearAdminMetadataCorrection = async (
  entityType: "artist" | "album",
  entityId: string | number,
): Promise<void> => {
  const response = await api.delete<{ success: boolean }>(
    `/admin/local-library/metadata/${entityType}/${entityId}`,
  );
  if (!response.data.success) {
    throw new Error("Failed to clear metadata correction");
  }
};

// Playlist APIs
export const getPlaylists = async (): Promise<Playlist[]> => {
  const response = await api.get<APIResponse<Playlist[]>>("/playlists");
  if (response.data.status === "error") {
    throw new Error(response.data.error?.message || "Failed to get playlists");
  }
  return response.data.data || [];
};

// Playlist song with added date
export interface PlaylistSongWithDate {
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

// Extended playlist with songs including added date
export interface PlaylistWithDates extends Omit<Playlist, "songs"> {
  description?: string;
  artwork_url?: string;
  songs: Array<Song & { addedAt?: string }>;
}

export const getPlaylist = async (id: string): Promise<PlaylistWithDates> => {
  // Get user playlist info
  const playlistResponse = await api.get<{
    success: boolean;
    playlist: {
      id: string;
      name: string;
      description?: string;
      artwork_url?: string;
      song_count: number;
    };
  }>(`/playlists/${id}`);
  if (!playlistResponse.data.success) {
    throw new Error("Playlist not found");
  }

  // Get playlist songs (now includes created_at)
  const songsResponse = await api.get<{
    success: boolean;
    songs: PlaylistSongWithDate[];
  }>(`/playlists/${id}/songs`);

  const playlist = playlistResponse.data.playlist;
  const songs = songsResponse.data.songs || [];

  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    artwork_url: playlist.artwork_url,
    songs: songs.map((s) => ({
      id: s.song_id,
      name: s.song_name,
      artistName: s.artist_name,
      artistId: s.artist_id,
      albumName: s.album_name,
      albumId: s.album_id,
      duration: s.duration,
      artworkUrl: s.artwork_url,
      hasLyrics: s.has_lyrics,
      addedAt: s.created_at,
    })),
  };
};

export const createPlaylist = async (name: string): Promise<Playlist> => {
  const response = await api.post<{
    success: boolean;
    playlist: {
      id: string;
      name: string;
      description?: string;
      artwork_url?: string;
      song_count: number;
    };
  }>("/playlists", { name });
  if (!response.data.success) {
    throw new Error("Failed to create playlist");
  }
  const playlist = response.data.playlist;
  return {
    id: playlist.id,
    name: playlist.name,
    songs: [],
  };
};

export interface UpdatePlaylistRequest {
  name?: string;
  description?: string;
  artwork_url?: string;
  clear_description?: boolean;
}

export const updatePlaylist = async (
  playlistId: string,
  updates: UpdatePlaylistRequest,
): Promise<void> => {
  const response = await api.put<{ success: boolean; message: string }>(
    `/playlists/${playlistId}`,
    updates,
  );
  if (!response.data.success) {
    throw new Error("Failed to update playlist");
  }
};

export const addSongToPlaylist = async (
  playlistId: string,
  song: Song,
): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    `/playlists/${playlistId}/songs`,
    {
      song_id: song.id,
      song_name: song.name,
      artist_name: song.artistName,
      artist_id: song.artistId,
      album_name: song.albumName,
      album_id: song.albumId,
      duration: song.duration,
      artwork_url: song.artworkUrl,
      has_lyrics: song.hasLyrics,
    },
  );
  if (!response.data.success) {
    throw new Error("Failed to add song");
  }
};

export const removeSongFromPlaylist = async (
  playlistId: string,
  songId: string,
): Promise<void> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    `/playlists/${playlistId}/songs/${songId}`,
  );
  if (!response.data.success) {
    throw new Error("Failed to remove song");
  }
};

export default api;

// Liked Songs APIs
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

export const getLikedSongs = async (): Promise<LikedSong[]> => {
  const response = await api.get<{
    success: boolean;
    songs: LikedSong[];
    count: number;
  }>("/liked-songs");
  if (!response.data.success) {
    throw new Error("Failed to get liked songs");
  }
  return response.data.songs || [];
};

export const likeSong = async (song: Song): Promise<LikedSong> => {
  const response = await api.post<{
    success: boolean;
    song: LikedSong;
    message: string;
  }>("/liked-songs", {
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
    throw new Error("Failed to like song");
  }
  return response.data.song;
};

export const unlikeSong = async (songId: string): Promise<void> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    `/liked-songs/${songId}`,
  );
  if (!response.data.success) {
    throw new Error("Failed to unlike song");
  }
};

export const checkSongLiked = async (songId: string): Promise<boolean> => {
  const response = await api.get<{ success: boolean; liked: boolean }>(
    `/liked-songs/${songId}`,
  );
  if (!response.data.success) {
    throw new Error("Failed to check liked status");
  }
  return response.data.liked;
};

export const batchCheckLiked = async (
  songIds: string[],
): Promise<Record<string, boolean>> => {
  const response = await api.post<{
    success: boolean;
    liked_status: Record<string, boolean>;
  }>("/liked-songs/batch", {
    song_ids: songIds,
  });
  if (!response.data.success) {
    throw new Error("Failed to batch check liked status");
  }
  return response.data.liked_status;
};

// Playback State APIs
export interface QueueSong {
  id: string;
  name: string;
  artist_name: string;
  artist_id?: string;
  album_name: string;
  album_id?: string;
  duration: number;
  artwork_url: string;
  has_lyrics: boolean;
}

export interface PlaybackState {
  user_id: string;
  queue_songs: QueueSong[];
  current_index: number;
  position: number;
  play_mode: "sequential" | "loop" | "single";
  is_shuffled: boolean;
  volume: number;
  queue_source_type?: string | null;
  queue_source_id?: string | null;
  queue_source_name?: string | null;
  updated_at: string;
}

export interface SavePlaybackStateRequest {
  queue_songs: QueueSong[];
  current_index: number;
  position: number;
  play_mode: "sequential" | "loop" | "single";
  is_shuffled: boolean;
  volume: number;
  queue_source_type?: string | null;
  queue_source_id?: string | null;
  queue_source_name?: string | null;
}

export const getPlaybackState = async (): Promise<PlaybackState | null> => {
  const response = await api.get<{
    success: boolean;
    state: PlaybackState | null;
  }>("/playback-state");
  if (!response.data.success) {
    throw new Error("Failed to get playback state");
  }
  return response.data.state;
};

export const savePlaybackState = async (
  state: SavePlaybackStateRequest,
): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/playback-state",
    state,
  );
  if (!response.data.success) {
    throw new Error("Failed to save playback state");
  }
};

export const deletePlaybackState = async (): Promise<void> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    "/playback-state",
  );
  if (!response.data.success) {
    throw new Error("Failed to delete playback state");
  }
};

// Lightweight progress-only request (no queue data)
export interface SavePlaybackProgressRequest {
  current_index: number;
  position: number;
  volume: number;
}

export const savePlaybackProgress = async (
  progress: SavePlaybackProgressRequest,
): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/playback-state/progress",
    progress,
  );
  if (!response.data.success) {
    throw new Error("Failed to save playback progress");
  }
};

/**
 * Save playback progress using sendBeacon API (lightweight version).
 * Returns true if the beacon was successfully queued.
 */
export const savePlaybackProgressBeacon = (
  progress: SavePlaybackProgressRequest,
): boolean => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  const url = "/api/playback-state/progress?token=" + encodeURIComponent(token);
  const blob = new Blob([JSON.stringify(progress)], {
    type: "application/json",
  });

  try {
    const ok = navigator.sendBeacon(url, blob);
    if (ok) return true;
  } catch {
    // Fall through to fetch keepalive
  }

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(progress),
    keepalive: true,
  }).catch(() => {});

  return true;
};

/**
 * Save playback state using sendBeacon API.
 * This is reliable for page unload scenarios where async requests may be cancelled.
 * Returns true if the beacon was successfully queued.
 */
export const savePlaybackStateBeacon = (
  state: SavePlaybackStateRequest,
): boolean => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return false;

  const url = "/api/playback-state?token=" + encodeURIComponent(token);
  const blob = new Blob([JSON.stringify(state)], { type: "application/json" });

  try {
    const ok = navigator.sendBeacon(url, blob);
    if (ok) return true;
  } catch {
    // Fall through to fetch keepalive
  }

  // Fallback: use fetch with keepalive to improve reliability during reload/unload
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(state),
    keepalive: true,
  }).catch(() => {
    // Swallow errors; best-effort during unload
  });

  return true;
};

// Recently Played APIs
export interface RecentlyPlayedItem {
  type: "playlist" | "album" | "artist" | "liked-songs";
  id: string;
  name: string;
  subtitle: string;
  artwork_url?: string;
  last_played_at: string;
}

export const getRecentlyPlayed = async (
  limit: number = 8,
): Promise<RecentlyPlayedItem[]> => {
  const response = await api.get<{
    success: boolean;
    items: RecentlyPlayedItem[];
    count: number;
  }>("/recently-played", {
    params: { limit },
  });
  if (!response.data.success) {
    throw new Error("Failed to get recently played");
  }
  return response.data.items || [];
};

export const recordPlay = async (
  itemType: string,
  itemId: string,
): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/recently-played",
    {
      item_type: itemType,
      item_id: itemId,
    },
  );
  if (!response.data.success) {
    throw new Error("Failed to record play");
  }
};

export const clearRecentlyPlayed = async (): Promise<void> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    "/recently-played",
  );
  if (!response.data.success) {
    throw new Error("Failed to clear recently played");
  }
};

// Cache Settings APIs
export interface CacheSettings {
  max_cache_size: number; // Maximum cache size in bytes
  max_cache_age: number; // Maximum cache age in seconds
  idle_expiry_time: number; // Idle expiry time in seconds
}

export interface CacheStats {
  total_size: number; // Total cache size in bytes
  total_size_human: string; // Human-readable format
  file_count: number; // Number of files
  oldest_file: string; // Oldest file timestamp
  newest_file: string; // Newest file timestamp
  usage_percent: number; // Percentage of max cache size used
}

export const getCacheSettings = async (): Promise<CacheSettings> => {
  const response = await api.get<{ success: boolean; settings: CacheSettings }>(
    "/admin/cache-settings",
  );
  if (!response.data.success) {
    throw new Error("Failed to get cache settings");
  }
  return response.data.settings;
};

export const updateCacheSettings = async (
  settings: CacheSettings,
): Promise<CacheSettings> => {
  const response = await api.put<{
    success: boolean;
    settings: CacheSettings;
    error?: { message: string };
  }>("/admin/cache-settings", settings);
  if (!response.data.success) {
    throw new Error(
      response.data.error?.message || "Failed to update cache settings",
    );
  }
  return response.data.settings;
};

export const getCacheStats = async (): Promise<CacheStats> => {
  const response = await api.get<{ success: boolean; stats: CacheStats }>(
    "/admin/cache-stats",
  );
  if (!response.data.success) {
    throw new Error("Failed to get cache stats");
  }
  return response.data.stats;
};

export const clearCache = async (): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/admin/clear-cache",
  );
  if (!response.data.success) {
    throw new Error("Failed to clear cache");
  }
};

// Prefetch APIs
export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "cached";

export interface PrefetchRequest {
  song_id: string;
  queue_position: number;
}

export interface PrefetchResponse {
  success: boolean;
  statuses: Record<string, DownloadStatus>;
}

export interface PrefetchSettings {
  prefetch_count: number;
  concurrent_download_limit: number;
  enable_hls_pre_slice: boolean;
}

export const prefetchSongs = async (
  requests: PrefetchRequest[],
): Promise<Record<string, DownloadStatus>> => {
  const response = await api.post<PrefetchResponse>("/prefetch", {
    song_ids: requests.map((r) => r.song_id),
    queue_positions: requests.map((r) => r.queue_position),
  });
  if (!response.data.success) {
    throw new Error("Failed to prefetch songs");
  }
  return response.data.statuses;
};

export const getPrefetchStatus = async (
  songIds: string[],
): Promise<Record<string, DownloadStatus>> => {
  const response = await api.get<PrefetchResponse>("/prefetch/status", {
    params: { song_ids: songIds.join(",") },
  });
  if (!response.data.success) {
    throw new Error("Failed to get prefetch status");
  }
  return response.data.statuses;
};

export const cancelPrefetch = async (songId: string): Promise<void> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    `/prefetch/${songId}`,
  );
  if (!response.data.success) {
    throw new Error("Failed to cancel prefetch");
  }
};

// Admin Prefetch Settings APIs
export const getPrefetchSettings = async (): Promise<PrefetchSettings> => {
  const response = await api.get<{
    status: string;
    data: { settings: PrefetchSettings };
  }>("/admin/prefetch-settings");
  if (response.data.status !== "success") {
    throw new Error("Failed to get prefetch settings");
  }
  return response.data.data.settings;
};

export const updatePrefetchSettings = async (
  settings: PrefetchSettings,
): Promise<PrefetchSettings> => {
  const response = await api.put<{
    status: string;
    data: { settings: PrefetchSettings };
    error?: { message: string };
  }>("/admin/prefetch-settings", settings);
  if (response.data.status !== "success") {
    throw new Error(
      response.data.error?.message || "Failed to update prefetch settings",
    );
  }
  return response.data.data.settings;
};

// Admin Sync APIs
export interface SyncStatus {
  is_running: boolean;
  snapshot_count: number;
  last_result?: {
    processed_artists: number;
    new_releases: number;
    errors: number;
    duration: string;
    completed_at?: string;
  };
}

export interface SyncSettings {
  interval_hours: number;
  request_delay_ms: number;
  schedule_enabled: boolean;
  schedule_hour: number;
  schedule_minute: number;
}

export const getSyncStatus = async (): Promise<SyncStatus> => {
  const response = await api.get<{
    success: boolean;
    is_running: boolean;
    snapshot_count: number;
    last_result?: SyncStatus["last_result"];
  }>("/admin/sync/status");
  if (!response.data.success) {
    throw new Error("Failed to get sync status");
  }
  return {
    is_running: response.data.is_running,
    snapshot_count: response.data.snapshot_count,
    last_result: response.data.last_result,
  };
};

export const triggerSync = async (): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/admin/sync/trigger",
  );
  if (!response.data.success) {
    throw new Error("Failed to trigger sync");
  }
};

export const getSyncSettings = async (): Promise<SyncSettings> => {
  const response = await api.get<{ success: boolean; settings: SyncSettings }>(
    "/admin/sync/settings",
  );
  if (!response.data.success) {
    throw new Error("Failed to get sync settings");
  }
  return response.data.settings;
};

export const updateSyncSettings = async (
  settings: SyncSettings,
): Promise<SyncSettings> => {
  const response = await api.put<{ success: boolean; settings: SyncSettings }>(
    "/admin/sync/settings",
    settings,
  );
  if (!response.data.success) {
    throw new Error("Failed to update sync settings");
  }
  return response.data.settings;
};

export const clearArtistSnapshots = async (): Promise<number> => {
  const response = await api.post<{ success: boolean; deleted: number }>(
    "/admin/sync/clear-snapshots",
  );
  if (!response.data.success) {
    throw new Error("Failed to clear snapshots");
  }
  return response.data.deleted;
};

// Sync History APIs
export interface SyncHistoryResponse {
  id: string;
  started_at: string;
  completed_at?: string;
  status: "running" | "completed" | "failed";
  processed_artists: number;
  new_releases: number;
  errors: number;
  logs: SyncLogEntryResponse[];
  created_at: string;
}

export interface SyncLogEntryResponse {
  artist_id: string;
  artist_name: string;
  status: "success" | "error";
  new_releases: number;
  error?: string;
  processed_at: string;
}

export interface SyncedArtistResponse {
  artist_id: string;
  artist_name: string;
  album_count: number;
  single_count: number;
  last_updated_at: string;
}

export interface ArtistResyncResultResponse {
  artist_id: string;
  artist_name: string;
  success: boolean;
  new_releases: number;
  error?: string;
  updated_at: string;
}

export const getSyncHistory = async (): Promise<SyncHistoryResponse[]> => {
  const response = await api.get<{
    success: boolean;
    histories: SyncHistoryResponse[];
    count: number;
  }>("/admin/sync/history");
  if (!response.data.success) {
    throw new Error("Failed to get sync history");
  }
  return response.data.histories || [];
};

export const getSyncHistoryDetail = async (
  id: string,
): Promise<SyncHistoryResponse> => {
  const response = await api.get<{
    success: boolean;
    history: SyncHistoryResponse;
  }>(`/admin/sync/history/${id}`);
  if (!response.data.success) {
    throw new Error("Failed to get sync history detail");
  }
  return response.data.history;
};

export const clearSyncHistory = async (): Promise<number> => {
  const response = await api.post<{ success: boolean; deleted: number }>(
    "/admin/sync/history/clear",
  );
  if (!response.data.success) {
    throw new Error("Failed to clear sync history");
  }
  return response.data.deleted;
};

export const getSyncedArtists = async (): Promise<SyncedArtistResponse[]> => {
  const response = await api.get<{
    success: boolean;
    artists: SyncedArtistResponse[];
    count: number;
  }>("/admin/sync/artists");
  if (!response.data.success) {
    throw new Error("Failed to get synced artists");
  }
  return response.data.artists || [];
};

export const resyncArtist = async (
  artistId: string,
): Promise<ArtistResyncResultResponse> => {
  const response = await api.post<{
    success: boolean;
    result: ArtistResyncResultResponse;
  }>(`/admin/sync/artist/${artistId}/resync`);
  if (!response.data.success && !response.data.result) {
    throw new Error("Failed to resync artist");
  }
  return response.data.result;
};

// Play History APIs
export interface PlayHistoryItem {
  song_id: string;
  song_name: string;
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_name: string;
  artwork_url: string;
  duration: number;
  played_at: string;
}

export interface TopArtistItem {
  artist_id: string;
  artist_name: string;
  artwork_url: string;
  play_count: number;
}

export interface TopTrackItem {
  song_id: string;
  song_name: string;
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_name: string;
  artwork_url: string;
  duration: number;
  play_count: number;
}

export interface RecordPlayHistoryRequest {
  song_id: string;
  song_name: string;
  artist_id: string;
  artist_name: string;
  album_id: string;
  album_name: string;
  artwork_url: string;
  duration: number;
  genres?: string[];
}

export const getPlayHistory = async (
  limit: number = 50,
  offset: number = 0,
): Promise<PlayHistoryItem[]> => {
  const response = await api.get<{
    success: boolean;
    items: PlayHistoryItem[];
    count: number;
  }>("/play-history", {
    params: { limit, offset },
  });
  if (!response.data.success) {
    throw new Error("Failed to get play history");
  }
  return response.data.items || [];
};

export const recordPlayHistory = async (
  song: RecordPlayHistoryRequest,
): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/play-history",
    song,
  );
  if (!response.data.success) {
    throw new Error("Failed to record play history");
  }
};

export const getTopArtists = async (
  limit: number = 4,
): Promise<TopArtistItem[]> => {
  const response = await api.get<{
    success: boolean;
    items: TopArtistItem[];
    count: number;
  }>("/play-history/top-artists", {
    params: { limit },
  });
  if (!response.data.success) {
    throw new Error("Failed to get top artists");
  }
  return response.data.items || [];
};

export const getTopTracks = async (
  limit: number = 4,
): Promise<TopTrackItem[]> => {
  const response = await api.get<{
    success: boolean;
    items: TopTrackItem[];
    count: number;
  }>("/play-history/top-tracks", {
    params: { limit },
  });
  if (!response.data.success) {
    throw new Error("Failed to get top tracks");
  }
  return response.data.items || [];
};

export const clearPlayHistory = async (): Promise<void> => {
  const response = await api.delete<{ success: boolean; message: string }>(
    "/play-history",
  );
  if (!response.data.success) {
    throw new Error("Failed to clear play history");
  }
};

// Playlist Cover Upload API
export interface UploadPlaylistCoverResponse {
  success: boolean;
  artwork_url: string;
  message: string;
}

export const uploadPlaylistCover = async (
  playlistId: string,
  file: File,
): Promise<string> => {
  const formData = new FormData();
  formData.append("cover", file);

  const response = await api.post<UploadPlaylistCoverResponse>(
    `/playlists/${playlistId}/cover`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
  );

  if (!response.data.success) {
    throw new Error(response.data.message || "Failed to upload playlist cover");
  }

  return response.data.artwork_url;
};

// ============================================
// Setup APIs
// ============================================

export type SetupState = "needs_setup" | "restart_required" | "ready";

export interface SetupStatus {
  state: SetupState;
  setup_required: boolean;
  database_connected: boolean;
  bootstrap_token_required: boolean;
  has_initial_admin: boolean;
  runtime_configured: boolean;
  restart_required: boolean;
  database: {
    host: string;
    port: number;
    user: string;
    dbname: string;
    sslmode: string;
    source: string;
  };
}

export interface BootstrapDatabaseSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  dbname: string;
  sslmode: string;
}

export interface RuntimeLocalMediaSettings {
  enabled: boolean;
  roots: string[];
  scan_mode: string;
  cleanup_policy: string;
}

export interface RuntimeAppleMusicSettings {
  storefront: string;
  language: string;
  media_user_token: string;
  metadata_enhancement: boolean;
  lyrics_enhancement: boolean;
  match_threshold: number;
}

export interface RuntimeGroupMetadata {
  source: string;
  apply_mode: "immediate" | "restart_required";
  restart_required: boolean;
}

export interface RuntimeSettingsEnvelope {
  email: AdminEmailSettings;
  local_media: RuntimeLocalMediaSettings;
  apple_music: RuntimeAppleMusicSettings;
  metadata: {
    email: RuntimeGroupMetadata;
    local_media: RuntimeGroupMetadata;
    apple_music: RuntimeGroupMetadata;
    restart_required: boolean;
  };
}

export interface AdminFilesystemEntry {
  name: string;
  path: string;
}

export interface AdminFilesystemListing {
  platform: string;
  current_path: string;
  parent_path?: string | null;
  is_virtual_root: boolean;
  separator: string;
  entries: AdminFilesystemEntry[];
}

export interface SetupLoginResponse {
  user: User;
  token: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export const getSetupStatus = async (): Promise<SetupStatus> => {
  const response = await api.get<{
    success: boolean;
    status: SetupStatus;
  }>("/setup/status");
  if (!response.data.success) {
    throw new Error("Failed to get setup status");
  }
  return response.data.status;
};

export const testSetupDatabase = async (
  bootstrapToken: string,
  database: BootstrapDatabaseSettings,
): Promise<void> => {
  const response = await api.post<{ success: boolean; message?: string }>(
    "/setup/test-db",
    {
      bootstrap_token: bootstrapToken,
      database,
    },
  );
  if (!response.data.success) {
    throw new Error(response.data.message || "Database connection failed");
  }
};

export const saveSetupBootstrapConfig = async (
  bootstrapToken: string,
  database: BootstrapDatabaseSettings,
): Promise<SetupStatus> => {
  const response = await api.put<{
    success: boolean;
    status: SetupStatus;
  }>("/setup/bootstrap-config", {
    bootstrap_token: bootstrapToken,
    database,
  });
  if (!response.data.success) {
    throw new Error("Failed to save bootstrap config");
  }
  return response.data.status;
};

export const bootstrapSetupAdmin = async (payload: {
  bootstrap_token: string;
  email: string;
  username: string;
  password: string;
}): Promise<SetupLoginResponse> => {
  const response = await api.post<{
    success: boolean;
    user: User;
    token: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };
  }>("/setup/bootstrap-admin", payload);
  if (!response.data.success) {
    throw new Error("Failed to create initial administrator");
  }
  return {
    user: response.data.user,
    token: response.data.token,
  };
};

export const saveSetupRuntimeSettings = async (
  bootstrapToken: string,
  settings: Omit<RuntimeSettingsEnvelope, "metadata">,
): Promise<RuntimeSettingsEnvelope> => {
  const response = await api.put<{
    success: boolean;
    settings: RuntimeSettingsEnvelope;
  }>("/setup/runtime-settings", {
    bootstrap_token: bootstrapToken,
    settings,
  });
  if (!response.data.success) {
    throw new Error("Failed to save runtime settings");
  }
  return response.data.settings;
};

// ============================================
// Admin User and Email Settings APIs
// ============================================

export interface AdminCreateUserInput {
  email: string;
  username: string;
  password: string;
  is_active?: boolean;
  is_admin?: boolean;
  is_email_verified?: boolean;
  user_group?: "normal" | "vip";
}

export interface AdminEmailSettings {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_address: string;
  from_name: string;
  use_tls: boolean;
}

export const createAdminUser = async (
  payload: AdminCreateUserInput,
): Promise<User> => {
  const response = await api.post<{
    success: boolean;
    user: User;
  }>("/admin/users", payload);
  if (!response.data.success) {
    throw new Error("Failed to create user");
  }
  return response.data.user;
};

export const updateAdminUserEmail = async (
  userId: string,
  email: string,
): Promise<User> => {
  const response = await api.put<{
    success: boolean;
    user: User;
  }>(`/admin/users/${userId}/email`, { email });
  if (!response.data.success) {
    throw new Error("Failed to update user email");
  }
  return response.data.user;
};

export const getAdminEmailSettings = async (): Promise<AdminEmailSettings> => {
  const response = await api.get<{
    success: boolean;
    settings: AdminEmailSettings;
  }>("/admin/settings/email");
  if (!response.data.success) {
    throw new Error("Failed to get email settings");
  }
  return response.data.settings;
};

export const updateAdminEmailSettings = async (
  settings: AdminEmailSettings,
): Promise<AdminEmailSettings> => {
  const response = await api.put<{
    success: boolean;
    settings: AdminEmailSettings;
  }>("/admin/settings/email", settings);
  if (!response.data.success) {
    throw new Error("Failed to update email settings");
  }
  return response.data.settings;
};

export const getAdminRuntimeSettings =
  async (): Promise<RuntimeSettingsEnvelope> => {
    const response = await api.get<{
      success: boolean;
      settings: RuntimeSettingsEnvelope;
    }>("/admin/settings/runtime");
    if (!response.data.success) {
      throw new Error("Failed to get runtime settings");
    }
    return response.data.settings;
  };

export const updateAdminRuntimeSettings = async (
  settings: Omit<RuntimeSettingsEnvelope, "metadata">,
): Promise<RuntimeSettingsEnvelope> => {
  const response = await api.put<{
    success: boolean;
    settings: RuntimeSettingsEnvelope;
  }>("/admin/settings/runtime", {
    settings,
  });
  if (!response.data.success) {
    throw new Error("Failed to update runtime settings");
  }
  return response.data.settings;
};

export async function listAdminFilesystem(
  path?: string,
): Promise<AdminFilesystemListing> {
  try {
    const response = await api.get<AdminFilesystemListing>(
      "/admin/filesystem/list",
      {
        params: path !== undefined ? { path } : {},
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError<{ error?: string }>(error)) {
      const message = error.response?.data?.error;
      if (message) {
        throw new Error(message);
      }
    }
    throw error;
  }
}

// ============================================
// Admin Precache APIs
// ============================================

export interface PrecacheSettings {
  enabled: boolean;
  concurrent_limit: number;
  idle_threshold_seconds: number;
  max_precache_per_day: number;
  priority_order: string[];
  schedule_enabled: boolean;
  schedule_start_hour: number;
  schedule_end_hour: number;
}

export interface PrecacheQueueItem {
  song_id: string;
  source: string;
  priority: number;
  user_id: string;
  added_at: string;
}

export interface PrecacheTaskInfo {
  song_id: string;
  source: string;
  started_at: string;
  duration: string;
}

export interface PrecacheStatus {
  is_running: boolean;
  is_paused: boolean;
  queue_length: number;
  active_downloads: number;
  today_precached: number;
  total_precached: number;
  last_activity_time: string;
  last_queue_build_time?: string;
  queue_items?: PrecacheQueueItem[];
  active_tasks?: PrecacheTaskInfo[];
}

export const getPrecacheSettings = async (): Promise<PrecacheSettings> => {
  const response = await api.get<{
    success: boolean;
    settings: PrecacheSettings;
  }>("/admin/precache-settings");
  if (!response.data.success) {
    throw new Error("Failed to get precache settings");
  }
  return response.data.settings;
};

export const updatePrecacheSettings = async (
  settings: PrecacheSettings,
): Promise<PrecacheSettings> => {
  const response = await api.put<{
    success: boolean;
    settings: PrecacheSettings;
  }>("/admin/precache-settings", settings);
  if (!response.data.success) {
    throw new Error("Failed to update precache settings");
  }
  return response.data.settings;
};

export const getPrecacheStatus = async (): Promise<PrecacheStatus> => {
  const response = await api.get<{ success: boolean; status: PrecacheStatus }>(
    "/admin/precache-status",
  );
  if (!response.data.success) {
    throw new Error("Failed to get precache status");
  }
  return response.data.status;
};

export const triggerPrecache = async (): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/admin/precache-trigger",
  );
  if (!response.data.success) {
    throw new Error("Failed to trigger precache");
  }
};

export const rebuildPrecacheQueue = async (): Promise<PrecacheStatus> => {
  const response = await api.post<{ success: boolean; status: PrecacheStatus }>(
    "/admin/precache-rebuild-queue",
  );
  if (!response.data.success) {
    throw new Error("Failed to rebuild precache queue");
  }
  return response.data.status;
};

// ============================================
// Admin HLS Cache APIs
// ============================================

export interface HLSCacheSettings {
  max_cache_size: number;
  max_cache_age: number;
  idle_expiry_time: number;
}

export interface HLSCacheStats {
  total_size: number;
  total_size_human: string;
  song_count: number;
  segment_count: number;
  oldest_file: string;
  newest_file: string;
  usage_percent: number;
}

export const getHLSCacheSettings = async (): Promise<HLSCacheSettings> => {
  const response = await api.get<{
    success: boolean;
    settings: HLSCacheSettings;
  }>("/admin/hls-cache-settings");
  if (!response.data.success) {
    throw new Error("Failed to get HLS cache settings");
  }
  return response.data.settings;
};

export const updateHLSCacheSettings = async (
  settings: HLSCacheSettings,
): Promise<HLSCacheSettings> => {
  const response = await api.put<{
    success: boolean;
    settings: HLSCacheSettings;
  }>("/admin/hls-cache-settings", settings);
  if (!response.data.success) {
    throw new Error("Failed to update HLS cache settings");
  }
  return response.data.settings;
};

export const getHLSCacheStats = async (): Promise<HLSCacheStats> => {
  const response = await api.get<{ success: boolean; stats: HLSCacheStats }>(
    "/admin/hls-cache-stats",
  );
  if (!response.data.success) {
    throw new Error("Failed to get HLS cache stats");
  }
  return response.data.stats;
};

export const clearHLSCache = async (): Promise<void> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/admin/clear-hls-cache",
  );
  if (!response.data.success) {
    throw new Error("Failed to clear HLS cache");
  }
};

// ============================================
// Admin Local Library APIs
// ============================================

export interface LocalLibraryOverviewStats {
  artists: number;
  albums: number;
  media: number;
  available_media: number;
  files: number;
  available_files: number;
  matched_media: number;
  unmatched_media: number;
  errored_media: number;
}

export interface LocalLibraryScanTask {
  id: number;
  scan_mode: string;
  status: string;
  library_root: string;
  trigger_source: string;
  phase: string;
  files_discovered: number;
  files_indexed: number;
  files_updated: number;
  files_unavailable: number;
  errors: number;
  last_error?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export type LocalLibraryScrapeScope = "unmatched" | "all";

export interface LocalLibraryScrapeStatus {
  available: boolean;
  disabled_reason?: string;
  is_running: boolean;
  scope?: LocalLibraryScrapeScope;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  current_media_id?: number;
  last_error?: string;
  started_at?: string;
  completed_at?: string;
}

export interface LocalLibraryOverview {
  enabled: boolean;
  disabled_reason?: string;
  roots: string[];
  scan_mode: string;
  cleanup_policy: string;
  apple_music: {
    metadata_enhancement: boolean;
    lyrics_enhancement: boolean;
    match_threshold: number;
  };
  stats: LocalLibraryOverviewStats;
  scan_running: boolean;
  recent_scan_tasks: LocalLibraryScanTask[];
  scrape_status: LocalLibraryScrapeStatus;
}

export const getLocalLibraryOverview = async (
  limit: number = 10,
): Promise<LocalLibraryOverview> => {
  const response = await api.get<{
    success: boolean;
    overview: LocalLibraryOverview;
  }>("/admin/local-library/overview", {
    params: { limit },
  });
  if (!response.data.success) {
    throw new Error("Failed to get local library overview");
  }
  return response.data.overview;
};

export const triggerLocalLibraryScan = async (
  mode: "incremental" | "full",
): Promise<string> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/admin/local-library/scan",
    { mode },
  );
  if (!response.data.success) {
    throw new Error("Failed to start local library scan");
  }
  return response.data.message;
};

export const triggerLocalLibraryScrape = async (
  scope: LocalLibraryScrapeScope,
): Promise<string> => {
  const response = await api.post<{ success: boolean; message: string }>(
    "/admin/local-library/scrape",
    { scope },
  );
  if (!response.data.success) {
    throw new Error("Failed to start local library scrape");
  }
  return response.data.message;
};
