package models

import (
	"encoding/json"
	"time"
)

// PlayMode represents the playback mode
type PlayMode string

const (
	PlayModeSequential PlayMode = "sequential"
	PlayModeLoop       PlayMode = "loop"
	PlayModeSingle     PlayMode = "single"
)

// IsValid checks if the play mode is valid
func (pm PlayMode) IsValid() bool {
	switch pm {
	case PlayModeSequential, PlayModeLoop, PlayModeSingle:
		return true
	default:
		return false
	}
}

// QueueSong represents a song in the playback queue
type QueueSong struct {
	ID                 string  `json:"id"`
	Name               string  `json:"name"`
	ArtistName         string  `json:"artist_name"`
	ArtistID           string  `json:"artist_id,omitempty"`
	AlbumName          string  `json:"album_name"`
	AlbumID            string  `json:"album_id,omitempty"`
	Duration           float64 `json:"duration"`
	ArtworkURL         string  `json:"artwork_url"`
	HasLyrics          bool    `json:"has_lyrics"`
	AvailabilityStatus string  `json:"availability_status,omitempty"`
}

// PlaybackState represents the user's playback state in the database
type PlaybackState struct {
	UserID          string      `json:"user_id"`
	QueueSongs      []QueueSong `json:"queue_songs"`
	CurrentIndex    int         `json:"current_index"`
	Position        float64     `json:"position"`
	PlayMode        PlayMode    `json:"play_mode"`
	IsShuffled      bool        `json:"is_shuffled"`
	Volume          int         `json:"volume"`
	QueueSourceType *string     `json:"queue_source_type,omitempty"`
	QueueSourceID   *string     `json:"queue_source_id,omitempty"`
	QueueSourceName *string     `json:"queue_source_name,omitempty"`
	UpdatedAt       time.Time   `json:"updated_at"`
}

// ScanPlaybackState scans a database row into a PlaybackState struct
func ScanPlaybackState(row interface{ Scan(...interface{}) error }) (*PlaybackState, error) {
	var ps PlaybackState
	var queueSongsJSON []byte

	err := row.Scan(
		&ps.UserID,
		&queueSongsJSON,
		&ps.CurrentIndex,
		&ps.Position,
		&ps.PlayMode,
		&ps.IsShuffled,
		&ps.Volume,
		&ps.QueueSourceType,
		&ps.QueueSourceID,
		&ps.QueueSourceName,
		&ps.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	// Parse queue songs JSON
	if len(queueSongsJSON) > 0 {
		if err := json.Unmarshal(queueSongsJSON, &ps.QueueSongs); err != nil {
			return nil, err
		}
	}

	return &ps, nil
}

// PlaybackStateColumns returns the column names for playback_states queries
func PlaybackStateColumns() string {
	return "user_id, queue_songs, current_index, position, play_mode, is_shuffled, volume, queue_source_type, queue_source_id, queue_source_name, updated_at"
}

// SavePlaybackStateRequest represents the request body for saving playback state (full queue)
type SavePlaybackStateRequest struct {
	QueueSongs      []QueueSong `json:"queue_songs"`
	CurrentIndex    int         `json:"current_index"`
	Position        float64     `json:"position"`
	PlayMode        string      `json:"play_mode"`
	IsShuffled      bool        `json:"is_shuffled"`
	Volume          int         `json:"volume"`
	QueueSourceType *string     `json:"queue_source_type,omitempty"`
	QueueSourceID   *string     `json:"queue_source_id,omitempty"`
	QueueSourceName *string     `json:"queue_source_name,omitempty"`
}

// Validate validates the request
func (r *SavePlaybackStateRequest) Validate() bool {
	pm := PlayMode(r.PlayMode)
	return pm.IsValid() && r.CurrentIndex >= 0 && r.Position >= 0 && r.Volume >= 0 && r.Volume <= 100
}

// SavePlaybackProgressRequest represents the request body for saving progress only (lightweight)
type SavePlaybackProgressRequest struct {
	CurrentIndex int     `json:"current_index"`
	Position     float64 `json:"position"`
	Volume       int     `json:"volume"`
}

// Validate validates the progress request
func (r *SavePlaybackProgressRequest) Validate() bool {
	return r.CurrentIndex >= 0 && r.Position >= 0 && r.Volume >= 0 && r.Volume <= 100
}

// SavePlaybackProgressResponse represents the response for saving progress
type SavePlaybackProgressResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ToPlaybackState converts the request to a PlaybackState
func (r *SavePlaybackStateRequest) ToPlaybackState(userID string) *PlaybackState {
	return &PlaybackState{
		UserID:          userID,
		QueueSongs:      r.QueueSongs,
		CurrentIndex:    r.CurrentIndex,
		Position:        r.Position,
		PlayMode:        PlayMode(r.PlayMode),
		IsShuffled:      r.IsShuffled,
		Volume:          r.Volume,
		QueueSourceType: r.QueueSourceType,
		QueueSourceID:   r.QueueSourceID,
		QueueSourceName: r.QueueSourceName,
	}
}

// GetPlaybackStateResponse represents the response for getting playback state
type GetPlaybackStateResponse struct {
	Success bool           `json:"success"`
	State   *PlaybackState `json:"state,omitempty"`
}

// SavePlaybackStateResponse represents the response for saving playback state
type SavePlaybackStateResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}
