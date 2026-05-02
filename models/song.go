package models

// SongItem represents a song in the streaming player
type SongItem struct {
	ID                 string                     `json:"id"`
	Name               string                     `json:"name"`
	ArtistName         string                     `json:"artistName"`
	ArtistID           string                     `json:"artistId,omitempty"`
	AlbumName          string                     `json:"albumName"`
	AlbumID            string                     `json:"albumId"`
	Duration           int                        `json:"duration"` // milliseconds
	ArtworkURL         string                     `json:"artworkUrl"`
	ReleaseDate        string                     `json:"releaseDate"`
	HasLyrics          bool                       `json:"hasLyrics"`
	AudioTraits        []string                   `json:"audioTraits"`
	TrackNumber        int                        `json:"trackNumber"`
	DiscNumber         int                        `json:"discNumber"`
	ComposerName       string                     `json:"composerName,omitempty"`
	Genres             []string                   `json:"genres,omitempty"`
	ISRC               string                     `json:"isrc,omitempty"`
	IsMusicVideo       bool                       `json:"isMusicVideo,omitempty"`  // True if this track is a music video
	ContentRating      string                     `json:"contentRating,omitempty"` // "explicit" for explicit content
	AvailabilityStatus string                     `json:"availabilityStatus,omitempty"`
	FieldSources       map[string]FieldProvenance `json:"fieldSources,omitempty"`
}

// SongDetail represents detailed song information including credits
type SongDetail struct {
	SongItem
	Credits   SongCredits `json:"credits"`
	Album     *AlbumInfo  `json:"album,omitempty"`
	Artists   []ArtistRef `json:"artists,omitempty"`
	AudioInfo *AudioInfo  `json:"audioInfo,omitempty"`
}

type AudioInfo struct {
	Codec      string `json:"codec,omitempty"`
	Container  string `json:"container,omitempty"`
	MIMEType   string `json:"mimeType,omitempty"`
	Bitrate    int    `json:"bitrate,omitempty"`
	BitDepth   int    `json:"bitDepth,omitempty"`
	SampleRate int    `json:"sampleRate,omitempty"`
	Channels   int    `json:"channels,omitempty"`
}

// SongCredits represents song credits/contributors
type SongCredits struct {
	Composer    string `json:"composer,omitempty"`
	RecordLabel string `json:"recordLabel,omitempty"`
	Copyright   string `json:"copyright,omitempty"`
}

// AlbumInfo represents basic album information
type AlbumInfo struct {
	ID           string                     `json:"id"`
	Name         string                     `json:"name"`
	ArtworkURL   string                     `json:"artworkUrl"`
	RecordLabel  string                     `json:"recordLabel,omitempty"`
	Copyright    string                     `json:"copyright,omitempty"`
	ReleaseDate  string                     `json:"releaseDate,omitempty"`
	TrackCount   int                        `json:"trackCount,omitempty"`
	FieldSources map[string]FieldProvenance `json:"fieldSources,omitempty"`
}

// ArtistRef represents a reference to an artist
type ArtistRef struct {
	ID           string                     `json:"id"`
	Name         string                     `json:"name"`
	ArtworkURL   string                     `json:"artworkUrl,omitempty"`
	FieldSources map[string]FieldProvenance `json:"fieldSources,omitempty"`
}

// IsValid checks if the song has required fields
func (s *SongItem) IsValid() bool {
	return s.ID != "" && s.Name != ""
}

// GetArtworkURLWithSize returns artwork URL with specified size
func (s *SongItem) GetArtworkURLWithSize(width, height int) string {
	if s.ArtworkURL == "" {
		return ""
	}
	// Apple Music artwork URLs use {w}x{h} placeholder
	return replaceArtworkSize(s.ArtworkURL, width, height)
}
