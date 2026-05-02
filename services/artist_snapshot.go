package services

import (
	"context"
	"database/sql"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"time"

	"github.com/lib/pq"
)

// ArtistSnapshotService handles artist snapshot business logic
type ArtistSnapshotService struct {
	db *Database
}

// NewArtistSnapshotService creates a new ArtistSnapshotService instance
func NewArtistSnapshotService(db *Database) *ArtistSnapshotService {
	return &ArtistSnapshotService{db: db}
}

// GetSnapshot retrieves the latest snapshot for an artist
func (s *ArtistSnapshotService) GetSnapshot(ctx context.Context, artistID string) (*models.ArtistSnapshot, error) {
	query := fmt.Sprintf(`SELECT %s FROM artist_snapshots WHERE artist_id = $1`, models.ArtistSnapshotColumns())
	row := s.db.QueryRowContext(ctx, query, artistID)
	snapshot, err := models.ScanArtistSnapshot(row)
	if err == sql.ErrNoRows {
		return nil, nil // No snapshot exists yet
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get artist snapshot: %w", err)
	}
	return snapshot, nil
}

// SaveSnapshot saves or updates an artist snapshot
func (s *ArtistSnapshotService) SaveSnapshot(ctx context.Context, snapshot *models.ArtistSnapshot) error {
	now := time.Now()
	snapshot.SnapshotAt = now
	snapshot.UpdatedAt = now

	query := `
		INSERT INTO artist_snapshots (artist_id, artist_name, album_ids, single_ids, snapshot_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (artist_id) DO UPDATE SET
			artist_name = EXCLUDED.artist_name,
			album_ids = EXCLUDED.album_ids,
			single_ids = EXCLUDED.single_ids,
			snapshot_at = EXCLUDED.snapshot_at,
			updated_at = EXCLUDED.updated_at
		RETURNING id, created_at
	`
	err := s.db.QueryRowContext(ctx, query,
		snapshot.ArtistID,
		snapshot.ArtistName,
		pq.Array(snapshot.AlbumIDs),
		pq.Array(snapshot.SingleIDs),
		snapshot.SnapshotAt,
		now,
		snapshot.UpdatedAt,
	).Scan(&snapshot.ID, &snapshot.CreatedAt)

	if err != nil {
		return fmt.Errorf("failed to save artist snapshot: %w", err)
	}

	return nil
}

// CompareSnapshots compares two snapshots and returns the differences
func (s *ArtistSnapshotService) CompareSnapshots(old, new *models.ArtistSnapshot) *models.SnapshotDiff {
	diff := &models.SnapshotDiff{
		NewAlbums:  []models.NewRelease{},
		NewSingles: []models.NewRelease{},
	}

	// If old snapshot is nil, this is the first snapshot - no new releases to report
	if old == nil {
		return diff
	}

	// Build sets of old IDs for efficient lookup
	oldAlbumSet := make(map[string]bool)
	for _, id := range old.AlbumIDs {
		oldAlbumSet[id] = true
	}
	oldSingleSet := make(map[string]bool)
	for _, id := range old.SingleIDs {
		oldSingleSet[id] = true
	}

	// Find new albums
	for _, id := range new.AlbumIDs {
		if !oldAlbumSet[id] {
			diff.NewAlbums = append(diff.NewAlbums, models.NewRelease{
				ID:   id,
				Type: "album",
			})
		}
	}

	// Find new singles
	for _, id := range new.SingleIDs {
		if !oldSingleSet[id] {
			diff.NewSingles = append(diff.NewSingles, models.NewRelease{
				ID:   id,
				Type: "single",
			})
		}
	}

	return diff
}

// DeleteSnapshot deletes an artist snapshot
func (s *ArtistSnapshotService) DeleteSnapshot(ctx context.Context, artistID string) error {
	query := `DELETE FROM artist_snapshots WHERE artist_id = $1`
	_, err := s.db.ExecContext(ctx, query, artistID)
	if err != nil {
		return fmt.Errorf("failed to delete artist snapshot: %w", err)
	}
	return nil
}

// DeleteAllSnapshots deletes all artist snapshots
func (s *ArtistSnapshotService) DeleteAllSnapshots(ctx context.Context) (int64, error) {
	query := `DELETE FROM artist_snapshots`
	result, err := s.db.ExecContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("failed to delete all artist snapshots: %w", err)
	}
	count, _ := result.RowsAffected()
	return count, nil
}

// GetSnapshotCount returns the total number of artist snapshots
func (s *ArtistSnapshotService) GetSnapshotCount(ctx context.Context) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM artist_snapshots`
	err := s.db.QueryRowContext(ctx, query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get snapshot count: %w", err)
	}
	return count, nil
}

// SyncedArtist represents an artist with sync information
type SyncedArtist struct {
	ArtistID      string    `json:"artist_id"`
	ArtistName    string    `json:"artist_name"`
	AlbumCount    int       `json:"album_count"`
	SingleCount   int       `json:"single_count"`
	LastUpdatedAt time.Time `json:"last_updated_at"`
}

// GetAllSnapshots returns all artist snapshots with their sync information
func (s *ArtistSnapshotService) GetAllSnapshots(ctx context.Context) ([]*SyncedArtist, error) {
	query := `
		SELECT artist_id, artist_name, album_ids, single_ids, updated_at
		FROM artist_snapshots
		ORDER BY updated_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get all snapshots: %w", err)
	}
	defer rows.Close()

	var artists []*SyncedArtist
	for rows.Next() {
		var artistID, artistName string
		var albumIDs, singleIDs pq.StringArray
		var updatedAt time.Time

		if err := rows.Scan(&artistID, &artistName, &albumIDs, &singleIDs, &updatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan snapshot: %w", err)
		}

		artists = append(artists, &SyncedArtist{
			ArtistID:      artistID,
			ArtistName:    artistName,
			AlbumCount:    len(albumIDs),
			SingleCount:   len(singleIDs),
			LastUpdatedAt: updatedAt,
		})
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating snapshots: %w", err)
	}

	return artists, nil
}
