package services

import (
	"context"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"time"

	"github.com/lib/pq"
)

// PlayHistoryService handles play history business logic
type PlayHistoryService struct {
	db   *Database
	repo LocalLibraryRepository
}

// NewPlayHistoryService creates a new PlayHistoryService instance
func NewPlayHistoryService(db *Database) *PlayHistoryService {
	return &PlayHistoryService{db: db}
}

func (s *PlayHistoryService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.repo = repo
}

// RecordPlay records a play event for a song
func (s *PlayHistoryService) RecordPlay(ctx context.Context, userID string, req *models.RecordPlayHistoryRequest) (*models.PlayHistory, error) {
	// Handle empty genres array gracefully
	genres := req.Genres
	if genres == nil {
		genres = []string{}
	}

	ph := &models.PlayHistory{
		UserID:     userID,
		SongID:     req.SongID,
		SongName:   req.SongName,
		ArtistID:   req.ArtistID,
		ArtistName: req.ArtistName,
		AlbumID:    req.AlbumID,
		AlbumName:  req.AlbumName,
		ArtworkURL: req.ArtworkURL,
		Duration:   req.Duration,
		Genres:     genres,
	}

	query := `
		INSERT INTO play_history (user_id, song_id, song_name, artist_id, artist_name, album_id, album_name, artwork_url, duration, genres, played_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
		RETURNING id, played_at, created_at
	`
	err := s.db.QueryRowContext(ctx, query,
		ph.UserID,
		ph.SongID,
		ph.SongName,
		ph.ArtistID,
		ph.ArtistName,
		ph.AlbumID,
		ph.AlbumName,
		ph.ArtworkURL,
		ph.Duration,
		pq.Array(ph.Genres),
	).Scan(&ph.ID, &ph.PlayedAt, &ph.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to record play: %w", err)
	}

	return ph, nil
}

// GetPlayHistory retrieves play history for a user with pagination
func (s *PlayHistoryService) GetPlayHistory(ctx context.Context, userID string, limit, offset int) ([]*models.PlayHistoryItem, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	query := `
		SELECT song_id, song_name, artist_id, artist_name, album_id, album_name, artwork_url, duration, played_at
		FROM play_history
		WHERE user_id = $1
		ORDER BY played_at DESC
		LIMIT $2 OFFSET $3
	`
	rows, err := s.db.QueryContext(ctx, query, userID, limit, offset)
	if err != nil {
		return nil, fmt.Errorf("failed to get play history: %w", err)
	}
	defer rows.Close()

	var items []*models.PlayHistoryItem
	for rows.Next() {
		var item models.PlayHistoryItem
		if err := rows.Scan(
			&item.SongID,
			&item.SongName,
			&item.ArtistID,
			&item.ArtistName,
			&item.AlbumID,
			&item.AlbumName,
			&item.ArtworkURL,
			&item.Duration,
			&item.PlayedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan play history item: %w", err)
		}
		items = append(items, &item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating play history: %w", err)
	}

	s.hydratePlayHistoryItems(ctx, items)
	return items, nil
}

// GetTopArtists returns top artists for the current month
func (s *PlayHistoryService) GetTopArtists(ctx context.Context, userID string, limit int) ([]*models.TopArtistItem, error) {
	if limit <= 0 {
		limit = 4
	}
	if limit > 100 {
		limit = 100
	}

	// Get the first day of current month
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	query := `
		SELECT artist_id, artist_name, MAX(artwork_url) as artwork_url, COUNT(*) as play_count
		FROM play_history
		WHERE user_id = $1 AND played_at >= $2
		GROUP BY artist_id, artist_name
		ORDER BY play_count DESC
		LIMIT $3
	`
	rows, err := s.db.QueryContext(ctx, query, userID, startOfMonth, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get top artists: %w", err)
	}
	defer rows.Close()

	var items []*models.TopArtistItem
	for rows.Next() {
		var item models.TopArtistItem
		if err := rows.Scan(&item.ArtistID, &item.ArtistName, &item.ArtworkURL, &item.PlayCount); err != nil {
			return nil, fmt.Errorf("failed to scan top artist: %w", err)
		}
		items = append(items, &item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating top artists: %w", err)
	}

	s.hydrateTopArtists(ctx, items)
	return items, nil
}

// GetTopTracks returns top tracks for the current month
func (s *PlayHistoryService) GetTopTracks(ctx context.Context, userID string, limit int) ([]*models.TopTrackItem, error) {
	if limit <= 0 {
		limit = 4
	}
	if limit > 100 {
		limit = 100
	}

	// Get the first day of current month
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	query := `
		SELECT song_id, song_name, artist_id, artist_name, album_id, album_name, MAX(artwork_url) as artwork_url, MAX(duration) as duration, COUNT(*) as play_count
		FROM play_history
		WHERE user_id = $1 AND played_at >= $2
		GROUP BY song_id, song_name, artist_id, artist_name, album_id, album_name
		ORDER BY play_count DESC
		LIMIT $3
	`
	rows, err := s.db.QueryContext(ctx, query, userID, startOfMonth, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get top tracks: %w", err)
	}
	defer rows.Close()

	var items []*models.TopTrackItem
	for rows.Next() {
		var item models.TopTrackItem
		if err := rows.Scan(
			&item.SongID,
			&item.SongName,
			&item.ArtistID,
			&item.ArtistName,
			&item.AlbumID,
			&item.AlbumName,
			&item.ArtworkURL,
			&item.Duration,
			&item.PlayCount,
		); err != nil {
			return nil, fmt.Errorf("failed to scan top track: %w", err)
		}
		items = append(items, &item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating top tracks: %w", err)
	}

	s.hydrateTopTracks(ctx, items)
	return items, nil
}

// ClearHistory clears all play history for a user
func (s *PlayHistoryService) ClearHistory(ctx context.Context, userID string) error {
	query := `DELETE FROM play_history WHERE user_id = $1`
	_, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to clear play history: %w", err)
	}
	return nil
}

func (s *PlayHistoryService) hydratePlayHistoryItems(ctx context.Context, items []*models.PlayHistoryItem) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		snapshot, err := resolver.ResolveSong(ctx, item.SongID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			item.AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		item.SongName = snapshot.Name
		item.ArtistID = snapshot.ArtistID
		item.ArtistName = snapshot.ArtistName
		item.AlbumID = snapshot.AlbumID
		item.AlbumName = snapshot.AlbumName
		item.ArtworkURL = snapshot.ArtworkURL
		item.Duration = snapshot.Duration
		item.AvailabilityStatus = snapshot.AvailabilityStatus
	}
}

func (s *PlayHistoryService) hydrateTopArtists(ctx context.Context, items []*models.TopArtistItem) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		snapshot, err := resolver.ResolveArtist(ctx, item.ArtistID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			item.AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		item.ArtistName = snapshot.Name
		item.ArtworkURL = snapshot.ArtworkURL
		item.AvailabilityStatus = snapshot.AvailabilityStatus
	}
}

func (s *PlayHistoryService) hydrateTopTracks(ctx context.Context, items []*models.TopTrackItem) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for _, item := range items {
		if item == nil {
			continue
		}
		snapshot, err := resolver.ResolveSong(ctx, item.SongID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			item.AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		item.SongName = snapshot.Name
		item.ArtistID = snapshot.ArtistID
		item.ArtistName = snapshot.ArtistName
		item.AlbumID = snapshot.AlbumID
		item.AlbumName = snapshot.AlbumName
		item.ArtworkURL = snapshot.ArtworkURL
		item.Duration = snapshot.Duration
		item.AvailabilityStatus = snapshot.AvailabilityStatus
	}
}
