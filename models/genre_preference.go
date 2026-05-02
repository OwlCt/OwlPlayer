package models

// GenrePreference represents a user's preference for a specific genre
// Score is calculated as: play_count * 1 + liked_count * 2 + followed_count * 3
type GenrePreference struct {
	Genre         string `json:"genre"`
	Score         int    `json:"score"`
	PlayCount     int    `json:"play_count"`
	LikedCount    int    `json:"liked_count"`
	FollowedCount int    `json:"followed_count"`
}

// GenrePreferencesResponse represents the API response for genre preferences
type GenrePreferencesResponse struct {
	Success     bool              `json:"success"`
	Preferences []GenrePreference `json:"preferences"`
}
