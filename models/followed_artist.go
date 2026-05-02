package models

import (
	"database/sql"
	"time"

	"github.com/lib/pq"
)

// FollowedArtist represents a followed artist record in the database
type FollowedArtist struct {
	ID                 string         `json:"id"`
	UserID             string         `json:"user_id"`
	ArtistID           string         `json:"artist_id"`
	ArtistName         string         `json:"artist_name"`
	ArtworkURL         string         `json:"artwork_url"`
	Genres             pq.StringArray `json:"genres"`
	AvailabilityStatus string         `json:"availability_status,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
}

// ScanFollowedArtist scans a database row into a FollowedArtist struct
func ScanFollowedArtist(row interface{ Scan(...any) error }) (*FollowedArtist, error) {
	var fa FollowedArtist
	var artworkURL sql.NullString

	err := row.Scan(
		&fa.ID,
		&fa.UserID,
		&fa.ArtistID,
		&fa.ArtistName,
		&artworkURL,
		&fa.Genres,
		&fa.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if artworkURL.Valid {
		fa.ArtworkURL = artworkURL.String
	}

	return &fa, nil
}

// FollowedArtistColumns returns the column names for followed_artists queries
func FollowedArtistColumns() string {
	return "id, user_id, artist_id, artist_name, artwork_url, genres, created_at"
}

// FollowArtistRequest represents the request body for following an artist
type FollowArtistRequest struct {
	ArtistID   string   `json:"artist_id"`
	ArtistName string   `json:"artist_name"`
	ArtworkURL string   `json:"artwork_url,omitempty"`
	Genres     []string `json:"genres"`
}
