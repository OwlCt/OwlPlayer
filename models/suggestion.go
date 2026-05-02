package models

// SuggestionResult contains parsed search suggestions
type SuggestionResult struct {
	Terms    []TermSuggestion    `json:"terms"`
	Contents []ContentSuggestion `json:"contents"`
}

// TermSuggestion represents a term-based search suggestion
type TermSuggestion struct {
	DisplayTerm string `json:"displayTerm"`
	SearchTerm  string `json:"searchTerm"`
}

// ContentSuggestion represents a content-based search suggestion (artist/album/song)
type ContentSuggestion struct {
	ID         string `json:"id"`
	Type       string `json:"type"` // "artist", "album", "song"
	Name       string `json:"name"`
	ArtworkURL string `json:"artworkUrl"`
	Subtitle   string `json:"subtitle,omitempty"` // artist name for albums/songs
}

// IsValidType checks if the content suggestion type is valid
func (c *ContentSuggestion) IsValidType() bool {
	return c.Type == "artist" || c.Type == "album" || c.Type == "song"
}
