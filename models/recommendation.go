package models

// DailyMix represents a personalized daily mix playlist
type DailyMix struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	ArtworkURL  string   `json:"artwork_url"`
	Genres      []string `json:"genres"`
	Artists     []string `json:"artists"`
}

// HotCollection represents a hot collection based on user's listening patterns
type HotCollection struct {
	ID          string `json:"id"`
	Type        string `json:"type"` // "artist" or "genre"
	Name        string `json:"name"`
	ArtworkURL  string `json:"artwork_url"`
	Description string `json:"description"`
	ArtistID    string `json:"artist_id,omitempty"`
	ArtistName  string `json:"artist_name,omitempty"`
	Genre       string `json:"genre,omitempty"`
}

// CollectionSong represents a song in a collection with source info
type CollectionSong struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	ArtistName   string   `json:"artist_name"`
	ArtistID     string   `json:"artist_id,omitempty"`
	AlbumName    string   `json:"album_name"`
	AlbumID      string   `json:"album_id"`
	Duration     int      `json:"duration"` // milliseconds
	ArtworkURL   string   `json:"artwork_url"`
	Genres       []string `json:"genres,omitempty"`
	PlayCount    int      `json:"play_count,omitempty"`    // User's play count
	Source       string   `json:"source"`                  // "history", "top", "discovery"
}

// CollectionSongsResponse represents the API response for collection songs
type CollectionSongsResponse struct {
	Success     bool             `json:"success"`
	Collection  HotCollection    `json:"collection"`
	Songs       []CollectionSong `json:"songs"`
	Total       int              `json:"total"`
}

// LikedAlbum represents an album containing user's liked songs
type LikedAlbum struct {
	AlbumID        string `json:"album_id"`
	AlbumName      string `json:"album_name"`
	ArtistName     string `json:"artist_name"`
	ArtworkURL     string `json:"artwork_url"`
	LikedSongCount int    `json:"liked_song_count"`
}

// NostalgicPlaylist represents a nostalgic playlist based on past listening
type NostalgicPlaylist struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	ArtworkURL string   `json:"artwork_url"`
	Artists    []string `json:"artists"`
	SongCount  int      `json:"song_count"`
	TimePeriod string   `json:"time_period"`
}

// ArtistPlaylist represents a playlist related to followed artists
type ArtistPlaylist struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	CuratorName string `json:"curator_name"`
	ArtworkURL  string `json:"artwork_url"`
}

// SimilarArtist represents a similar artist from Apple Music API
type SimilarArtist struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	ArtworkURL string   `json:"artwork_url"`
	Genres     []string `json:"genres"`
}

// RelatedAlbum represents a related album from Apple Music API
type RelatedAlbum struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	ArtistName  string `json:"artist_name"`
	ArtworkURL  string `json:"artwork_url"`
	ReleaseDate string `json:"release_date"`
}

// DiscoverItem represents an item in the discover section
type DiscoverItem struct {
	ID         string `json:"id"`
	Type       string `json:"type"` // "album" | "song" | "artist"
	Name       string `json:"name"`
	ArtistName string `json:"artist_name,omitempty"`
	ArtworkURL string `json:"artwork_url"`
	Source     string `json:"source"`      // "similar-artist" | "related-album"
	SourceID   string `json:"source_id"`   // Source artist/album ID
	SourceName string `json:"source_name"` // Source artist/album name
}

// DiscoveryCache represents cached discovery content for a user
type DiscoveryCache struct {
	ID          int64     `json:"id"`
	UserID      string    `json:"user_id"`
	CacheType   string    `json:"cache_type"` // "similar-artists", "related-albums", "discover-songs"
	ItemsJSON   string    `json:"items_json"`
	ShuffleDate string    `json:"shuffle_date"`
	ExpiresAt   string    `json:"expires_at"`
	CreatedAt   string    `json:"created_at"`
}


// RecommendationItem represents a generic recommendation item
type RecommendationItem struct {
	Type       string `json:"type"` // "album", "artist", "playlist"
	ID         string `json:"id"`
	Name       string `json:"name"`
	ArtistName string `json:"artist_name,omitempty"`
	ArtworkURL string `json:"artwork_url"`
	Source     string `json:"source,omitempty"` // "history" or "discovery"
}

// DailyMixesResponse represents the API response for daily mixes
type DailyMixesResponse struct {
	Success bool       `json:"success"`
	Mixes   []DailyMix `json:"mixes"`
}

// HotCollectionsResponse represents the API response for hot collections
type HotCollectionsResponse struct {
	Success     bool            `json:"success"`
	Collections []HotCollection `json:"collections"`
}

// LikedAlbumsResponse represents the API response for liked albums
type LikedAlbumsResponse struct {
	Success bool         `json:"success"`
	Albums  []LikedAlbum `json:"albums"`
}

// TodayRecommendationsResponse represents the API response for today's recommendations
type TodayRecommendationsResponse struct {
	Success bool                 `json:"success"`
	Items   []RecommendationItem `json:"items"`
}

// NostalgicPlaylistsResponse represents the API response for nostalgic playlists
type NostalgicPlaylistsResponse struct {
	Success   bool                `json:"success"`
	Playlists []NostalgicPlaylist `json:"playlists"`
}

// ArtistPlaylistsResponse represents the API response for artist playlists
type ArtistPlaylistsResponse struct {
	Success   bool             `json:"success"`
	Playlists []ArtistPlaylist `json:"playlists"`
}

// Paginated response types for View All pages

// PaginatedDailyMixesResponse represents paginated daily mixes response
type PaginatedDailyMixesResponse struct {
	Success bool       `json:"success"`
	Mixes   []DailyMix `json:"mixes"`
	Total   int        `json:"total"`
	Limit   int        `json:"limit"`
	Offset  int        `json:"offset"`
}

// PaginatedHotCollectionsResponse represents paginated hot collections response
type PaginatedHotCollectionsResponse struct {
	Success     bool            `json:"success"`
	Collections []HotCollection `json:"collections"`
	Total       int             `json:"total"`
	Limit       int             `json:"limit"`
	Offset      int             `json:"offset"`
}

// PaginatedLikedAlbumsResponse represents paginated liked albums response
type PaginatedLikedAlbumsResponse struct {
	Success bool         `json:"success"`
	Albums  []LikedAlbum `json:"albums"`
	Total   int          `json:"total"`
	Limit   int          `json:"limit"`
	Offset  int          `json:"offset"`
}

// PaginatedTodayRecommendationsResponse represents paginated today's recommendations response
type PaginatedTodayRecommendationsResponse struct {
	Success bool                 `json:"success"`
	Items   []RecommendationItem `json:"items"`
	Total   int                  `json:"total"`
	Limit   int                  `json:"limit"`
	Offset  int                  `json:"offset"`
}

// PaginatedNostalgicPlaylistsResponse represents paginated nostalgic playlists response
type PaginatedNostalgicPlaylistsResponse struct {
	Success   bool                `json:"success"`
	Playlists []NostalgicPlaylist `json:"playlists"`
	Total     int                 `json:"total"`
	Limit     int                 `json:"limit"`
	Offset    int                 `json:"offset"`
}

// NostalgicPlaylistSongsResponse represents the API response for nostalgic playlist songs
type NostalgicPlaylistSongsResponse struct {
	Success  bool             `json:"success"`
	Playlist NostalgicPlaylist `json:"playlist"`
	Songs    []CollectionSong `json:"songs"`
}

// PaginatedArtistPlaylistsResponse represents paginated artist playlists response
type PaginatedArtistPlaylistsResponse struct {
	Success   bool             `json:"success"`
	Playlists []ArtistPlaylist `json:"playlists"`
	Total     int              `json:"total"`
	Limit     int              `json:"limit"`
	Offset    int              `json:"offset"`
}

// DiscoverNewResponse represents the API response for discover new section
type DiscoverNewResponse struct {
	Success bool           `json:"success"`
	Items   []DiscoverItem `json:"items"`
	Total   int            `json:"total"`
}

// PaginatedDiscoverNewResponse represents paginated discover new response
type PaginatedDiscoverNewResponse struct {
	Success bool           `json:"success"`
	Items   []DiscoverItem `json:"items"`
	Total   int            `json:"total"`
	Limit   int            `json:"limit"`
	Offset  int            `json:"offset"`
}
