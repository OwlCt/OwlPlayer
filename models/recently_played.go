package models

import (
	"time"
)

// RecentlyPlayed represents a recently played item record in the database
type RecentlyPlayed struct {
	ID           string    `json:"id"`
	UserID       string    `json:"user_id"`
	ItemType     string    `json:"item_type"` // 'playlist', 'album', 'artist', 'liked-songs'
	ItemID       string    `json:"item_id"`
	LastPlayedAt time.Time `json:"last_played_at"`
}

// ScanRecentlyPlayed scans a database row into a RecentlyPlayed struct
func ScanRecentlyPlayed(row interface{ Scan(...any) error }) (*RecentlyPlayed, error) {
	var rp RecentlyPlayed

	err := row.Scan(
		&rp.ID,
		&rp.UserID,
		&rp.ItemType,
		&rp.ItemID,
		&rp.LastPlayedAt,
	)
	if err != nil {
		return nil, err
	}

	return &rp, nil
}

// RecentlyPlayedColumns returns the column names for recently_played queries
func RecentlyPlayedColumns() string {
	return "id, user_id, item_type, item_id, last_played_at"
}

// RecordPlayRequest represents the request body for recording a play
type RecordPlayRequest struct {
	ItemType string `json:"item_type"` // 'playlist', 'album', 'artist', 'liked-songs'
	ItemID   string `json:"item_id"`
}

// RecentlyPlayedItem represents a simplified item for API response
type RecentlyPlayedItem struct {
	ItemType     string    `json:"type"`
	ItemID       string    `json:"id"`
	LastPlayedAt time.Time `json:"last_played_at"`
}

// RecentlyPlayedItemWithDetails represents a recently played item with full details
type RecentlyPlayedItemWithDetails struct {
	ItemType     string    `json:"type"`
	ItemID       string    `json:"id"`
	Name         string    `json:"name"`
	Subtitle     string    `json:"subtitle"`
	ArtworkURL   string    `json:"artwork_url,omitempty"`
	LastPlayedAt time.Time `json:"last_played_at"`
}
