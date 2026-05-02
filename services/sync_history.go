package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"main/models"
	"time"
)

// SyncHistoryService handles sync history business logic
type SyncHistoryService struct {
	db *Database
}

// NewSyncHistoryService creates a new SyncHistoryService instance
func NewSyncHistoryService(db *Database) *SyncHistoryService {
	return &SyncHistoryService{db: db}
}

// CreateHistory creates a new sync history record
func (s *SyncHistoryService) CreateHistory(ctx context.Context, history *models.SyncHistory) error {
	now := time.Now()
	history.CreatedAt = now

	logsJSON, err := json.Marshal(history.Logs)
	if err != nil {
		return fmt.Errorf("failed to marshal logs: %w", err)
	}

	query := `
		INSERT INTO sync_history (started_at, completed_at, status, processed_artists, new_releases, errors, logs, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`
	err = s.db.QueryRowContext(ctx, query,
		history.StartedAt,
		history.CompletedAt,
		history.Status,
		history.ProcessedArtists,
		history.NewReleases,
		history.Errors,
		logsJSON,
		history.CreatedAt,
	).Scan(&history.ID)

	if err != nil {
		return fmt.Errorf("failed to create sync history: %w", err)
	}

	return nil
}

// UpdateHistory updates an existing sync history record
func (s *SyncHistoryService) UpdateHistory(ctx context.Context, history *models.SyncHistory) error {
	logsJSON, err := json.Marshal(history.Logs)
	if err != nil {
		return fmt.Errorf("failed to marshal logs: %w", err)
	}

	query := `
		UPDATE sync_history
		SET completed_at = $1, status = $2, processed_artists = $3, new_releases = $4, errors = $5, logs = $6
		WHERE id = $7
	`
	result, err := s.db.ExecContext(ctx, query,
		history.CompletedAt,
		history.Status,
		history.ProcessedArtists,
		history.NewReleases,
		history.Errors,
		logsJSON,
		history.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update sync history: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("sync history not found: %s", history.ID)
	}

	return nil
}

// GetHistory retrieves a sync history record by ID
func (s *SyncHistoryService) GetHistory(ctx context.Context, id string) (*models.SyncHistory, error) {
	query := `
		SELECT id, started_at, completed_at, status, processed_artists, new_releases, errors, logs, created_at
		FROM sync_history
		WHERE id = $1
	`
	row := s.db.QueryRowContext(ctx, query, id)
	return s.scanHistory(row)
}

// GetRecentHistory retrieves the most recent sync history records
func (s *SyncHistoryService) GetRecentHistory(ctx context.Context, limit int) ([]*models.SyncHistory, error) {
	query := `
		SELECT id, started_at, completed_at, status, processed_artists, new_releases, errors, logs, created_at
		FROM sync_history
		ORDER BY started_at DESC
		LIMIT $1
	`
	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get recent sync history: %w", err)
	}
	defer rows.Close()

	var histories []*models.SyncHistory
	for rows.Next() {
		history, err := s.scanHistoryRows(rows)
		if err != nil {
			return nil, err
		}
		histories = append(histories, history)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating sync history rows: %w", err)
	}

	return histories, nil
}

// CleanupOldHistory removes old history records, keeping only the most recent ones
func (s *SyncHistoryService) CleanupOldHistory(ctx context.Context, keepCount int) (int, error) {
	// Delete records that are not in the top N by started_at
	query := `
		DELETE FROM sync_history
		WHERE id NOT IN (
			SELECT id FROM sync_history
			ORDER BY started_at DESC
			LIMIT $1
		)
	`
	result, err := s.db.ExecContext(ctx, query, keepCount)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup old sync history: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	return int(rowsAffected), nil
}

// ClearAllHistory removes all sync history records
func (s *SyncHistoryService) ClearAllHistory(ctx context.Context) (int, error) {
	query := `DELETE FROM sync_history`
	result, err := s.db.ExecContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to clear all sync history: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	return int(rowsAffected), nil
}

// GetHistoryCount returns the total number of sync history records
func (s *SyncHistoryService) GetHistoryCount(ctx context.Context) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM sync_history`
	err := s.db.QueryRowContext(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get sync history count: %w", err)
	}
	return count, nil
}

// scanHistory scans a single row into a SyncHistory struct
func (s *SyncHistoryService) scanHistory(row *sql.Row) (*models.SyncHistory, error) {
	var history models.SyncHistory
	var completedAt sql.NullTime
	var logsJSON []byte

	err := row.Scan(
		&history.ID,
		&history.StartedAt,
		&completedAt,
		&history.Status,
		&history.ProcessedArtists,
		&history.NewReleases,
		&history.Errors,
		&logsJSON,
		&history.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to scan sync history: %w", err)
	}

	if completedAt.Valid {
		history.CompletedAt = &completedAt.Time
	}

	if err := json.Unmarshal(logsJSON, &history.Logs); err != nil {
		return nil, fmt.Errorf("failed to unmarshal logs: %w", err)
	}

	return &history, nil
}

// scanHistoryRows scans a row from sql.Rows into a SyncHistory struct
func (s *SyncHistoryService) scanHistoryRows(rows *sql.Rows) (*models.SyncHistory, error) {
	var history models.SyncHistory
	var completedAt sql.NullTime
	var logsJSON []byte

	err := rows.Scan(
		&history.ID,
		&history.StartedAt,
		&completedAt,
		&history.Status,
		&history.ProcessedArtists,
		&history.NewReleases,
		&history.Errors,
		&logsJSON,
		&history.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to scan sync history row: %w", err)
	}

	if completedAt.Valid {
		history.CompletedAt = &completedAt.Time
	}

	if err := json.Unmarshal(logsJSON, &history.Logs); err != nil {
		return nil, fmt.Errorf("failed to unmarshal logs: %w", err)
	}

	return &history, nil
}
