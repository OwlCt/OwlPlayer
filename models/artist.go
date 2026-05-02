package models

// ArtistItem represents an artist in the streaming player
type ArtistItem struct {
	ID                 string                     `json:"id"`
	Name               string                     `json:"name"`
	ArtworkURL         string                     `json:"artworkUrl"`
	ArtworkWidth       int                        `json:"artworkWidth,omitempty"`  // Original artwork width
	ArtworkHeight      int                        `json:"artworkHeight,omitempty"` // Original artwork height
	Genres             []string                   `json:"genres"`
	MotionVideoURL     string                     `json:"motionVideoUrl,omitempty"` // 720p HLS video URL from editorialVideo
	LandscapeURL       string                     `json:"landscapeUrl,omitempty"`   // Landscape artwork URL from editorialArtwork
	AvailabilityStatus string                     `json:"availabilityStatus,omitempty"`
	FieldSources       map[string]FieldProvenance `json:"fieldSources,omitempty"`
}

// IsValid checks if the artist has required fields
func (a *ArtistItem) IsValid() bool {
	return a.ID != "" && a.Name != ""
}

// GetArtworkURLWithSize returns artwork URL with specified size
func (a *ArtistItem) GetArtworkURLWithSize(width, height int) string {
	if a.ArtworkURL == "" {
		return ""
	}
	return replaceArtworkSize(a.ArtworkURL, width, height)
}

// ArtistPlaylistItem represents a playlist associated with an artist
type ArtistPlaylistItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	CuratorName string `json:"curatorName"`
	ArtworkURL  string `json:"artworkUrl"`
	Description string `json:"description,omitempty"`
}

// ArtistDetail represents detailed artist information with top songs and albums
type ArtistDetail struct {
	ArtistItem
	TopSongs          []SongItem           `json:"topSongs"`
	FeaturedSongs     []SongItem           `json:"featuredSongs,omitempty"`
	FeaturedSongsSource string             `json:"featuredSongsSource,omitempty"`
	LibrarySongs      []SongItem           `json:"librarySongs,omitempty"`
	Albums            []AlbumItem          `json:"albums"`            // Full albums (not singles)
	SinglesAndEPs     []AlbumItem          `json:"singlesAndEPs"`     // Singles and EPs
	EssentialAlbums   []AlbumItem          `json:"essentialAlbums"`   // Essential/Featured albums curated by Apple Music
	LiveAlbums        []AlbumItem          `json:"liveAlbums"`        // Live albums
	CompilationAlbums []AlbumItem          `json:"compilationAlbums"` // Compilation/Greatest hits albums
	AppearsOnAlbums   []AlbumItem          `json:"appearsOnAlbums"`   // Albums the artist appears on (collaborations)
	Playlists         []ArtistPlaylistItem `json:"playlists"`         // Playlists featuring this artist
	MetadataState     *MetadataState       `json:"metadataState,omitempty"`
}
