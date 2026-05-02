package models

import (
	"database/sql"
	"time"
)

// LibraryAlbum represents a saved album record in the database
type LibraryAlbum struct {
	ID                 string      `json:"id"`
	UserID             string      `json:"user_id"`
	AlbumID            string      `json:"album_id"`
	AlbumName          string      `json:"album_name"`
	ArtistID           string      `json:"artist_id,omitempty"`
	ArtistName         string      `json:"artist_name"`
	ArtworkURL         string      `json:"artwork_url"`
	ReleaseDate        string      `json:"release_date,omitempty"`
	TrackCount         int         `json:"track_count"`
	ReleaseType        ReleaseType `json:"release_type,omitempty"`
	IsSingle           bool        `json:"is_single,omitempty"`
	AvailabilityStatus string      `json:"availability_status,omitempty"`
	CreatedAt          time.Time   `json:"created_at"`
}

// ScanLibraryAlbum scans a database row into a LibraryAlbum struct
func ScanLibraryAlbum(row interface{ Scan(...any) error }) (*LibraryAlbum, error) {
	var la LibraryAlbum
	var artistID, artworkURL, releaseDate sql.NullString

	err := row.Scan(
		&la.ID,
		&la.UserID,
		&la.AlbumID,
		&la.AlbumName,
		&artistID,
		&la.ArtistName,
		&artworkURL,
		&releaseDate,
		&la.TrackCount,
		&la.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if artistID.Valid {
		la.ArtistID = artistID.String
	}
	if artworkURL.Valid {
		la.ArtworkURL = artworkURL.String
	}
	if releaseDate.Valid {
		la.ReleaseDate = releaseDate.String
	}

	return &la, nil
}

// LibraryAlbumColumns returns the column names for library_albums queries
func LibraryAlbumColumns() string {
	return "id, user_id, album_id, album_name, artist_id, artist_name, artwork_url, release_date, track_count, created_at"
}

// AddLibraryAlbumRequest represents the request body for adding an album to library
type AddLibraryAlbumRequest struct {
	AlbumID     string      `json:"album_id"`
	AlbumName   string      `json:"album_name"`
	ArtistID    string      `json:"artist_id,omitempty"`
	ArtistName  string      `json:"artist_name"`
	ArtworkURL  string      `json:"artwork_url,omitempty"`
	ReleaseDate string      `json:"release_date,omitempty"`
	TrackCount  int         `json:"track_count"`
	ReleaseType ReleaseType `json:"release_type,omitempty"`
	IsSingle    bool        `json:"is_single,omitempty"`
}
