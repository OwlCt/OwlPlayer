export type AvailabilityStatus = "available" | "unavailable" | "stale";
export type ReleaseType = "album" | "ep" | "single";

export interface FieldProvenance {
  source: string;
  confidence: number;
  enhanced?: boolean;
  entityType?:
    | "artist"
    | "album"
    | "media"
    | "media_file"
    | "lyrics_mapping"
    | "scan_task";
  entityId?: string;
  details?: Record<string, unknown>;
}

export type MetadataOverrideMode =
  | "inherit"
  | "force_local"
  | "prefer_am"
  | "manual_override";
export type MetadataLyricsSource =
  | "inherit"
  | "local"
  | "apple_music"
  | "disabled";

export interface MetadataState {
  overrideMode: MetadataOverrideMode;
  usesAppleMusic: boolean;
  usesManualOverride: boolean;
  displaySource: string;
}

export interface MetadataCandidate {
  id: string;
  name: string;
  subtitle?: string;
  artworkUrl?: string;
  releaseDate?: string;
  genres?: string[];
}

// Song type
export interface Song {
  id: string;
  name: string;
  artistName: string;
  artistId?: string;
  albumName: string;
  albumId?: string;
  duration: number; // milliseconds
  artworkUrl: string;
  hasLyrics: boolean;
  audioTraits?: string[];
  trackNumber?: number;
  discNumber?: number;
  genres?: string[]; // Genre information for recommendations
  isMusicVideo?: boolean; // True if this track is a music video
  contentRating?: string; // "explicit" for explicit content
  source?: "history" | "discovery" | "top"; // Source of the song in recommendations
  availabilityStatus?: AvailabilityStatus;
  fieldSources?: Record<string, FieldProvenance>;
}

// Album type
export interface Album {
  id: string;
  name: string;
  artistId?: string;
  artistName: string;
  artworkUrl: string;
  releaseDate?: string;
  trackCount: number;
  tracks?: Song[];
  genres?: string[];
  copyright?: string;
  releaseType?: ReleaseType;
  isSingle?: boolean; // True if this is a single or EP
  contentRating?: string; // "explicit" for explicit content
  availabilityStatus?: AvailabilityStatus;
  fieldSources?: Record<string, FieldProvenance>;
}

// Album detail type (extended)
export interface AlbumDetail extends Album {
  recordLabel?: string;
  artists?: ArtistRef[];
  hasMusicVideo?: boolean; // True if album contains any music videos
  motionVideoUrl?: string; // Dynamic album cover video URL - square 1:1 (m3u8)
  motionTallVideoUrl?: string; // Dynamic album cover video URL - portrait 3:4 (m3u8)
  localRelatedContent?: LocalAlbumRelatedContent;
  metadataState?: MetadataState;
}

export interface LocalAlbumRelatedContent {
  shelves: LocalAlbumRelatedShelf[];
}

export interface LocalAlbumRelatedShelf {
  id: "more-by-artist" | "artist-songs" | string;
  kind: "albums" | "songs" | string;
  title: string;
  albums?: Album[];
  songs?: Song[];
}

// Artist reference type
export interface ArtistRef {
  id: string;
  name: string;
  artworkUrl?: string;
  fieldSources?: Record<string, FieldProvenance>;
}

// Artist type
export interface Artist {
  id: string;
  name: string;
  artworkUrl: string;
  artworkWidth?: number; // Original artwork width
  artworkHeight?: number; // Original artwork height
  genres: string[];
  motionVideoUrl?: string; // 720p HLS video URL for motion artist video
  landscapeUrl?: string; // Landscape artwork URL (centeredFullscreenBackground)
  availabilityStatus?: AvailabilityStatus;
  fieldSources?: Record<string, FieldProvenance>;
}

// Artist detail type (extended)
export interface ArtistDetail extends Artist {
  topSongs: Song[];
  featuredSongs: Song[];
  featuredSongsSource?: "history" | "library_fallback";
  librarySongs: Song[];
  albums: Album[]; // Full albums (not singles)
  singlesAndEPs: Album[]; // Singles and EPs
  essentialAlbums: Album[]; // Essential/Featured albums curated by Apple Music
  liveAlbums: Album[]; // Live albums
  compilationAlbums: Album[]; // Compilation/Greatest hits albums
  appearsOnAlbums: Album[]; // Albums the artist appears on (collaborations)
  metadataState?: MetadataState;
}

export interface Credits {
  composer?: string;
  recordLabel?: string;
  copyright?: string;
}

// Song detail with credits
export interface SongDetail extends Song {
  composerName?: string;
  genres?: string[];
  isrc?: string;
  audioInfo?: {
    codec?: string;
    container?: string;
    mimeType?: string;
    bitrate?: number;
    bitDepth?: number;
    sampleRate?: number;
    channels?: number;
  };
  credits: Credits;
  album?: {
    id: string;
    name: string;
    artworkUrl: string;
    recordLabel?: string;
    copyright?: string;
    releaseDate?: string;
    trackCount?: number;
    fieldSources?: Record<string, FieldProvenance>;
  };
  artists?: {
    id: string;
    name: string;
    artworkUrl?: string;
    fieldSources?: Record<string, FieldProvenance>;
  }[];
}

// Playlist type
export interface Playlist {
  id: string;
  name: string;
  songs: Song[];
  createdAt?: string; // Made optional
  updatedAt?: string; // Made optional
}

// Lyric word type (for syllable lyrics)
export interface LyricWord {
  timestamp: number; // milliseconds
  endTime: number; // milliseconds
  text: string;
}

// Lyric line type
export interface LyricLine {
  timestamp: number; // milliseconds
  endTime?: number; // milliseconds
  text: string; // full line text
  translation?: string; // translated text
  words?: LyricWord[]; // word-by-word timing (for syllable lyrics)
}

// Lyrics response (raw TTML from backend)
export interface LyricsResponse {
  available: boolean;
  songId: string;
  ttml: string; // Raw TTML string
  type: string; // "syllable-lyrics" or "lyrics"
}

// Search results
export interface SearchResult {
  albums: Album[];
  singlesAndEPs: Album[]; // Singles and EPs separated from albums
  songs: Song[];
  artists: Artist[];
}

// Search result with topResults and order (enhanced search response)
export interface SearchResultWithTop extends SearchResult {
  topResults: TopResultItem[];
  order: string[]; // Section display order from API meta
}

// Top result item for Best Match card
export interface TopResultItem {
  id: string;
  type: "artist" | "album" | "song";
  name: string;
  artworkUrl: string;
  subtitle: string; // Artist name for albums/songs, genre for artists
}

// Search suggestion types
export interface SuggestionResult {
  terms: TermSuggestion[];
  contents: ContentSuggestion[];
}

export interface TermSuggestion {
  displayTerm: string;
  searchTerm: string;
}

export interface ContentSuggestion {
  id: string;
  type: "artist" | "album" | "song";
  name: string;
  artworkUrl: string;
  subtitle?: string; // Artist name for albums/songs
}

// Search filter tab type
export type SearchFilterTab = "all" | "songs" | "artists" | "records";

// Best match item for search results
export interface BestMatchItem {
  type: "artist" | "album" | "song";
  id: string;
  name: string;
  subtitle: string; // Artist name or type label
  imageUrl: string;
  isCircular: boolean; // Artists use circular images
}

// API Response
export interface APIResponse<T> {
  status: "success" | "error";
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// Ranked item for interleaved search results
export interface RankedItem {
  type: "album" | "song" | "artist";
  id: string;
  relevanceScore: number;
  data: Album | Song | Artist;
}

// Paginated search result for infinite scroll
export interface PaginatedSearchResult {
  items: Song[] | Album[] | Artist[];
  hasMore: boolean;
  offset: number;
  limit: number;
  total: number; // -1 if unknown
}

// User type
export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string;
  is_email_verified: boolean;
  is_active: boolean;
  is_admin: boolean;
  user_group: "normal" | "vip";
  release_notification_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Token pair from API
export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// Page context type for context menu visibility
export type PageContextType = "default" | "album" | "artist" | "now-playing";

// Sync history log entry
export interface SyncLogEntry {
  artistId: string;
  artistName: string;
  status: "success" | "error";
  newReleases: number;
  error?: string;
  processedAt: string;
}

// Sync history record
export interface SyncHistory {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  processedArtists: number;
  newReleases: number;
  errors: number;
  logs: SyncLogEntry[];
  createdAt: string;
}

// Synced artist information
export interface SyncedArtist {
  artistId: string;
  artistName: string;
  albumCount: number;
  singleCount: number;
  lastUpdatedAt: string;
}

// Artist resync result
export interface ArtistResyncResult {
  artistId: string;
  artistName: string;
  success: boolean;
  newReleases: number;
  error?: string;
  updatedAt: string;
}
