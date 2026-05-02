package models

import "time"

// SyncHistory represents a synchronization history record
type SyncHistory struct {
	ID               string         `json:"id"`
	StartedAt        time.Time      `json:"started_at"`
	CompletedAt      *time.Time     `json:"completed_at,omitempty"`
	Status           string         `json:"status"` // "running", "completed", "failed"
	ProcessedArtists int            `json:"processed_artists"`
	NewReleases      int            `json:"new_releases"`
	Errors           int            `json:"errors"`
	Logs             []SyncLogEntry `json:"logs"`
	CreatedAt        time.Time      `json:"created_at"`
}

// SyncLogEntry represents a single log entry during synchronization
type SyncLogEntry struct {
	ArtistID    string    `json:"artist_id"`
	ArtistName  string    `json:"artist_name"`
	Status      string    `json:"status"` // "success", "error"
	NewReleases int       `json:"new_releases"`
	Error       string    `json:"error,omitempty"`
	ProcessedAt time.Time `json:"processed_at"`
}

// Sync history status constants
const (
	SyncStatusRunning   = "running"
	SyncStatusCompleted = "completed"
	SyncStatusFailed    = "failed"
)

// Sync log entry status constants
const (
	SyncLogStatusSuccess = "success"
	SyncLogStatusError   = "error"
)
