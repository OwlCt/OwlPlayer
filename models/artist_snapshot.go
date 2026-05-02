package models

import (
	"time"

	"github.com/lib/pq"
)

// ArtistSnapshot represents a snapshot of an artist's releases
type ArtistSnapshot struct {
	ID         string    `json:"id"`
	ArtistID   string    `json:"artist_id"`
	ArtistName string    `json:"artist_name"`
	AlbumIDs   []string  `json:"album_ids"`
	SingleIDs  []string  `json:"single_ids"`
	SnapshotAt time.Time `json:"snapshot_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// ScanArtistSnapshot scans a database row into an ArtistSnapshot struct
func ScanArtistSnapshot(row interface{ Scan(...any) error }) (*ArtistSnapshot, error) {
	var s ArtistSnapshot
	var albumIDs, singleIDs pq.StringArray

	err := row.Scan(
		&s.ID,
		&s.ArtistID,
		&s.ArtistName,
		&albumIDs,
		&singleIDs,
		&s.SnapshotAt,
		&s.CreatedAt,
		&s.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	s.AlbumIDs = []string(albumIDs)
	s.SingleIDs = []string(singleIDs)

	// Ensure non-nil slices
	if s.AlbumIDs == nil {
		s.AlbumIDs = []string{}
	}
	if s.SingleIDs == nil {
		s.SingleIDs = []string{}
	}

	return &s, nil
}

// ArtistSnapshotColumns returns the column names for artist_snapshots queries
func ArtistSnapshotColumns() string {
	return "id, artist_id, artist_name, album_ids, single_ids, snapshot_at, created_at, updated_at"
}

// NewRelease represents a newly released album or single
type NewRelease struct {
	ID          string `json:"id"`
	Type        string `json:"type"` // "album" or "single"
	Name        string `json:"name"`
	ArtworkURL  string `json:"artwork_url"`
	ReleaseDate string `json:"release_date"`
}

// SnapshotDiff represents the difference between two snapshots
type SnapshotDiff struct {
	NewAlbums  []NewRelease `json:"new_albums"`
	NewSingles []NewRelease `json:"new_singles"`
}

// ArtistSyncItem represents an artist to be synced
type ArtistSyncItem struct {
	ArtistID   string `json:"artist_id"`
	ArtistName string `json:"artist_name"`
	IsVIP      bool   `json:"is_vip"` // Whether followed by VIP user
}

// SyncJobResult represents the result of a sync job
type SyncJobResult struct {
	ProcessedArtists int           `json:"processed_artists"`
	NewReleases      int           `json:"new_releases"`
	Errors           int           `json:"errors"`
	Duration         time.Duration `json:"duration"`
}
