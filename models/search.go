package models

// FieldProvenance describes where a resolved field value came from.
type FieldProvenance struct {
	Source     string          `json:"source"`
	Confidence float64         `json:"confidence"`
	Enhanced   bool            `json:"enhanced,omitempty"`
	EntityType LocalEntityType `json:"entityType,omitempty"`
	EntityID   string          `json:"entityId,omitempty"`
	Details    map[string]any  `json:"details,omitempty"`
}

// SearchResult contains categorized search results
type SearchResult struct {
	Albums        []AlbumItem  `json:"albums"`
	SinglesAndEPs []AlbumItem  `json:"singlesAndEPs"` // Singles and EPs separated from albums
	Songs         []SongItem   `json:"songs"`
	Artists       []ArtistItem `json:"artists"`
}

// TopResultItem represents a best match item from topResults
type TopResultItem struct {
	ID         string `json:"id"`
	Type       string `json:"type"` // "artist", "album", "song"
	Name       string `json:"name"`
	ArtworkURL string `json:"artworkUrl"`
	Subtitle   string `json:"subtitle"` // artist name for albums/songs
}

// SearchResultWithTop includes topResults for best match
type SearchResultWithTop struct {
	TopResults    []TopResultItem `json:"topResults"`
	Albums        []AlbumItem     `json:"albums"`
	SinglesAndEPs []AlbumItem     `json:"singlesAndEPs"`
	Songs         []SongItem      `json:"songs"`
	Artists       []ArtistItem    `json:"artists"`
	Order         []string        `json:"order"` // section display order from API meta
}

// PaginatedSearchResult contains search results with pagination info
type PaginatedSearchResult struct {
	Items   interface{} `json:"items"`   // []AlbumItem, []SongItem, or []ArtistItem
	HasMore bool        `json:"hasMore"` // true if more results available
	Offset  int         `json:"offset"`  // current offset
	Limit   int         `json:"limit"`   // items per page
	Total   int         `json:"total"`   // total count (if available, -1 if unknown)
}

// RankedItem represents a search result with relevance score
type RankedItem struct {
	Type           string      `json:"type"` // "album", "song", or "artist"
	ID             string      `json:"id"`
	RelevanceScore float64     `json:"relevanceScore"`
	Data           interface{} `json:"data"`
}

// IsValidType checks if the type is valid
func (r *RankedItem) IsValidType() bool {
	return r.Type == "album" || r.Type == "song" || r.Type == "artist"
}

// LyricWord represents a single word with its own timestamp (for syllable lyrics)
type LyricWord struct {
	Timestamp int64  `json:"timestamp"` // milliseconds
	EndTime   int64  `json:"endTime"`   // milliseconds
	Text      string `json:"text"`
}

// LyricLine represents a single line of lyrics with timestamp
type LyricLine struct {
	Timestamp   int64       `json:"timestamp"`             // milliseconds
	EndTime     int64       `json:"endTime,omitempty"`     // milliseconds
	Text        string      `json:"text"`                  // full line text
	Translation string      `json:"translation,omitempty"` // translated text
	Words       []LyricWord `json:"words,omitempty"`       // word-by-word timing (for syllable lyrics)
}

// LyricsResponse contains raw TTML lyrics data for a song
// Frontend is responsible for parsing and rendering
type LyricsResponse struct {
	Available bool   `json:"available"`
	SongID    string `json:"songId"`
	TTML      string `json:"ttml"` // Raw TTML string
	Type      string `json:"type"` // "syllable-lyrics" or "lyrics"
}

// StreamInfo contains information about an audio stream
type StreamInfo struct {
	SongID      string `json:"songId"`
	Duration    int    `json:"duration"` // milliseconds
	ContentType string `json:"contentType"`
	FileSize    int64  `json:"fileSize"`
}
