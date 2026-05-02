package models

import (
	"database/sql"
	"time"
)

// ReleaseNotification represents a notification about a new release
type ReleaseNotification struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	ArtistID    string    `json:"artist_id"`
	ArtistName  string    `json:"artist_name"`
	ReleaseID   string    `json:"release_id"`
	ReleaseType string    `json:"release_type"` // "album" or "single"
	ReleaseName string    `json:"release_name"`
	ArtworkURL  string    `json:"artwork_url"`
	ReleaseDate string    `json:"release_date"`
	IsRead      bool      `json:"is_read"`
	CreatedAt   time.Time `json:"created_at"`
}

// ScanReleaseNotification scans a database row into a ReleaseNotification struct
func ScanReleaseNotification(row interface{ Scan(...any) error }) (*ReleaseNotification, error) {
	var n ReleaseNotification
	var artworkURL sql.NullString
	var releaseDate sql.NullTime

	err := row.Scan(
		&n.ID,
		&n.UserID,
		&n.ArtistID,
		&n.ArtistName,
		&n.ReleaseID,
		&n.ReleaseType,
		&n.ReleaseName,
		&artworkURL,
		&releaseDate,
		&n.IsRead,
		&n.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if artworkURL.Valid {
		n.ArtworkURL = artworkURL.String
	}
	if releaseDate.Valid {
		n.ReleaseDate = releaseDate.Time.Format("2006-01-02")
	}

	return &n, nil
}

// ReleaseNotificationColumns returns the column names for release_notifications queries
func ReleaseNotificationColumns() string {
	return "id, user_id, artist_id, artist_name, release_id, release_type, release_name, artwork_url, release_date, is_read, created_at"
}

// NotificationFilter represents filter options for notifications
type NotificationFilter struct {
	Type string `json:"type"` // "all", "album", "single"
}
