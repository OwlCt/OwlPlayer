package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
)

// Playback state service errors
var (
	ErrPlaybackStateNotFound = errors.New("playback state not found")
	ErrInvalidPlayMode       = errors.New("invalid play mode")
)

// PlaybackStateService handles playback state business logic
type PlaybackStateService struct {
	db   *Database
	repo LocalLibraryRepository
}

// NewPlaybackStateService creates a new PlaybackStateService instance
func NewPlaybackStateService(db *Database) *PlaybackStateService {
	return &PlaybackStateService{db: db}
}

func (s *PlaybackStateService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.repo = repo
}

// SavePlaybackState saves or updates the playback state for a user
func (s *PlaybackStateService) SavePlaybackState(ctx context.Context, state *models.PlaybackState) error {
	if !state.PlayMode.IsValid() {
		return ErrInvalidPlayMode
	}

	// Serialize queue songs to JSON
	queueSongsJSON, err := json.Marshal(state.QueueSongs)
	if err != nil {
		return fmt.Errorf("failed to serialize queue songs: %w", err)
	}

	query := `
		INSERT INTO playback_states (user_id, queue_songs, current_index, position, play_mode, is_shuffled, volume, queue_source_type, queue_source_id, queue_source_name, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			queue_songs = EXCLUDED.queue_songs,
			current_index = EXCLUDED.current_index,
			position = EXCLUDED.position,
			play_mode = EXCLUDED.play_mode,
			is_shuffled = EXCLUDED.is_shuffled,
			volume = EXCLUDED.volume,
			queue_source_type = EXCLUDED.queue_source_type,
			queue_source_id = EXCLUDED.queue_source_id,
			queue_source_name = EXCLUDED.queue_source_name,
			updated_at = NOW()
	`

	_, err = s.db.ExecContext(ctx, query,
		state.UserID,
		queueSongsJSON,
		state.CurrentIndex,
		state.Position,
		string(state.PlayMode),
		state.IsShuffled,
		state.Volume,
		state.QueueSourceType,
		state.QueueSourceID,
		state.QueueSourceName,
	)
	if err != nil {
		return fmt.Errorf("failed to save playback state: %w", err)
	}

	return nil
}

// LoadPlaybackState retrieves the playback state for a user
func (s *PlaybackStateService) LoadPlaybackState(ctx context.Context, userID string) (*models.PlaybackState, error) {
	query := fmt.Sprintf(`SELECT %s FROM playback_states WHERE user_id = $1`, models.PlaybackStateColumns())
	row := s.db.QueryRowContext(ctx, query, userID)

	state, err := models.ScanPlaybackState(row)
	if err == sql.ErrNoRows {
		return nil, ErrPlaybackStateNotFound
	}
	if err != nil {
		// Log the actual error for debugging
		fmt.Printf("LoadPlaybackState error for user %s: %v\n", userID, err)
		return nil, fmt.Errorf("failed to load playback state: %w", err)
	}

	s.hydrateQueueSongs(ctx, state.QueueSongs)
	return state, nil
}

// DeletePlaybackState deletes the playback state for a user
func (s *PlaybackStateService) DeletePlaybackState(ctx context.Context, userID string) error {
	query := `DELETE FROM playback_states WHERE user_id = $1`
	result, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to delete playback state: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrPlaybackStateNotFound
	}

	return nil
}

// SavePlaybackProgress updates only the progress fields (lightweight update)
func (s *PlaybackStateService) SavePlaybackProgress(ctx context.Context, userID string, currentIndex int, position float64, volume int) error {
	query := `
		UPDATE playback_states 
		SET current_index = $2, position = $3, volume = $4, updated_at = NOW()
		WHERE user_id = $1
	`

	result, err := s.db.ExecContext(ctx, query, userID, currentIndex, position, volume)
	if err != nil {
		return fmt.Errorf("failed to save playback progress: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrPlaybackStateNotFound
	}

	return nil
}

func (s *PlaybackStateService) hydrateQueueSongs(ctx context.Context, songs []models.QueueSong) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for idx := range songs {
		snapshot, err := resolver.ResolveSong(ctx, songs[idx].ID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			songs[idx].AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		songs[idx].Name = snapshot.Name
		songs[idx].ArtistName = snapshot.ArtistName
		songs[idx].ArtistID = snapshot.ArtistID
		songs[idx].AlbumName = snapshot.AlbumName
		songs[idx].AlbumID = snapshot.AlbumID
		songs[idx].Duration = float64(snapshot.Duration)
		songs[idx].ArtworkURL = snapshot.ArtworkURL
		songs[idx].HasLyrics = snapshot.HasLyrics
		songs[idx].AvailabilityStatus = snapshot.AvailabilityStatus
	}
}
