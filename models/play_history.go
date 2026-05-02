package models

import (
	"time"

	"github.com/lib/pq"
)

// PlayHistory represents a play history record in the database
type PlayHistory struct {
	ID                 string         `json:"id"`
	UserID             string         `json:"user_id"`
	SongID             string         `json:"song_id"`
	SongName           string         `json:"song_name"`
	ArtistID           string         `json:"artist_id"`
	ArtistName         string         `json:"artist_name"`
	AlbumID            string         `json:"album_id"`
	AlbumName          string         `json:"album_name"`
	ArtworkURL         string         `json:"artwork_url"`
	Duration           int            `json:"duration"`
	Genres             pq.StringArray `json:"genres"`
	AvailabilityStatus string         `json:"availability_status,omitempty"`
	PlayedAt           time.Time      `json:"played_at"`
	CreatedAt          time.Time      `json:"created_at"`
}

// ScanPlayHistory scans a database row into a PlayHistory struct
func ScanPlayHistory(row interface{ Scan(...any) error }) (*PlayHistory, error) {
	var ph PlayHistory
	err := row.Scan(
		&ph.ID,
		&ph.UserID,
		&ph.SongID,
		&ph.SongName,
		&ph.ArtistID,
		&ph.ArtistName,
		&ph.AlbumID,
		&ph.AlbumName,
		&ph.ArtworkURL,
		&ph.Duration,
		&ph.Genres,
		&ph.PlayedAt,
		&ph.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &ph, nil
}

// PlayHistoryColumns returns the column names for play_history queries
func PlayHistoryColumns() string {
	return "id, user_id, song_id, song_name, artist_id, artist_name, album_id, album_name, artwork_url, duration, genres, played_at, created_at"
}

// RecordPlayHistoryRequest represents the request body for recording a play
type RecordPlayHistoryRequest struct {
	SongID     string   `json:"song_id"`
	SongName   string   `json:"song_name"`
	ArtistID   string   `json:"artist_id"`
	ArtistName string   `json:"artist_name"`
	AlbumID    string   `json:"album_id"`
	AlbumName  string   `json:"album_name"`
	ArtworkURL string   `json:"artwork_url"`
	Duration   int      `json:"duration"`
	Genres     []string `json:"genres"`
}

// PlayHistoryItem represents a simplified item for API response
type PlayHistoryItem struct {
	SongID             string    `json:"song_id"`
	SongName           string    `json:"song_name"`
	ArtistID           string    `json:"artist_id"`
	ArtistName         string    `json:"artist_name"`
	AlbumID            string    `json:"album_id"`
	AlbumName          string    `json:"album_name"`
	ArtworkURL         string    `json:"artwork_url"`
	Duration           int       `json:"duration"`
	AvailabilityStatus string    `json:"availability_status,omitempty"`
	PlayedAt           time.Time `json:"played_at"`
}

// TopArtistItem represents a top artist with play count
type TopArtistItem struct {
	ArtistID           string `json:"artist_id"`
	ArtistName         string `json:"artist_name"`
	ArtworkURL         string `json:"artwork_url"`
	AvailabilityStatus string `json:"availability_status,omitempty"`
	PlayCount          int    `json:"play_count"`
}

// TopTrackItem represents a top track with play count
type TopTrackItem struct {
	SongID             string `json:"song_id"`
	SongName           string `json:"song_name"`
	ArtistID           string `json:"artist_id"`
	ArtistName         string `json:"artist_name"`
	AlbumID            string `json:"album_id"`
	AlbumName          string `json:"album_name"`
	ArtworkURL         string `json:"artwork_url"`
	Duration           int    `json:"duration"`
	AvailabilityStatus string `json:"availability_status,omitempty"`
	PlayCount          int    `json:"play_count"`
}
