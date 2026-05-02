package models

type ReleaseType string

const (
	ReleaseTypeAlbum  ReleaseType = "album"
	ReleaseTypeEP     ReleaseType = "ep"
	ReleaseTypeSingle ReleaseType = "single"
)

func NormalizeReleaseType(value string) ReleaseType {
	switch ReleaseType(value) {
	case ReleaseTypeEP:
		return ReleaseTypeEP
	case ReleaseTypeSingle:
		return ReleaseTypeSingle
	default:
		return ReleaseTypeAlbum
	}
}

func ReleaseTypeIsSingle(value ReleaseType) bool {
	normalized := NormalizeReleaseType(string(value))
	return normalized == ReleaseTypeEP || normalized == ReleaseTypeSingle
}

// AlbumItem represents an album in the streaming player
type AlbumItem struct {
	ID                 string                     `json:"id"`
	Name               string                     `json:"name"`
	ArtistID           string                     `json:"artistId,omitempty"`
	ArtistName         string                     `json:"artistName"`
	ArtworkURL         string                     `json:"artworkUrl"`
	ReleaseDate        string                     `json:"releaseDate"`
	TrackCount         int                        `json:"trackCount"`
	Tracks             []SongItem                 `json:"tracks,omitempty"`
	Genres             []string                   `json:"genres,omitempty"`
	Copyright          string                     `json:"copyright,omitempty"`
	ReleaseType        ReleaseType                `json:"releaseType,omitempty"`   // album, ep, or single
	IsSingle           bool                       `json:"isSingle,omitempty"`      // True if this is a single or EP
	ContentRating      string                     `json:"contentRating,omitempty"` // "explicit" for explicit content
	AvailabilityStatus string                     `json:"availabilityStatus,omitempty"`
	FieldSources       map[string]FieldProvenance `json:"fieldSources,omitempty"`
}

// IsValid checks if the album has required fields
func (a *AlbumItem) IsValid() bool {
	return a.ID != "" && a.Name != ""
}

// GetArtworkURLWithSize returns artwork URL with specified size
func (a *AlbumItem) GetArtworkURLWithSize(width, height int) string {
	if a.ArtworkURL == "" {
		return ""
	}
	return replaceArtworkSize(a.ArtworkURL, width, height)
}

// AlbumDetail represents detailed album information with tracks
type AlbumDetail struct {
	AlbumItem
	RecordLabel         string                    `json:"recordLabel,omitempty"`
	Artists             []ArtistRef               `json:"artists,omitempty"`
	HasMusicVideo       bool                      `json:"hasMusicVideo,omitempty"`      // True if album contains any music videos
	MotionVideoURL      string                    `json:"motionVideoUrl,omitempty"`     // Dynamic album cover video URL - square 1:1 (m3u8)
	MotionTallVideoURL  string                    `json:"motionTallVideoUrl,omitempty"` // Dynamic album cover video URL - portrait 3:4 (m3u8)
	LocalRelatedContent *LocalAlbumRelatedContent `json:"localRelatedContent,omitempty"`
	MetadataState       *MetadataState            `json:"metadataState,omitempty"`
}

const (
	LocalAlbumRelatedShelfMoreByArtist = "more-by-artist"
	LocalAlbumRelatedShelfArtistSongs  = "artist-songs"
	LocalAlbumRelatedShelfAlbumsKind   = "albums"
	LocalAlbumRelatedShelfSongsKind    = "songs"
)

type LocalAlbumRelatedContent struct {
	Shelves []LocalAlbumRelatedShelf `json:"shelves,omitempty"`
}

type LocalAlbumRelatedShelf struct {
	ID     string      `json:"id"`
	Kind   string      `json:"kind"`
	Title  string      `json:"title"`
	Albums []AlbumItem `json:"albums,omitempty"`
	Songs  []SongItem  `json:"songs,omitempty"`
}

// AlbumVersion represents an alternative version of an album (deluxe, Japan edition, etc.)
type AlbumVersion struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ArtistName    string `json:"artistName"`
	ArtworkURL    string `json:"artworkUrl"`
	ReleaseDate   string `json:"releaseDate"`
	TrackCount    int    `json:"trackCount"`
	ContentRating string `json:"contentRating,omitempty"`
}
