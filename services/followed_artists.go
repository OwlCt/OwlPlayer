package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"main/models"

	"github.com/lib/pq"
)

// Followed artists service errors
var (
	ErrArtistAlreadyFollowed = errors.New("artist already followed")
	ErrArtistNotFollowed     = errors.New("artist not followed")
)

// FollowedArtistsService handles followed artists business logic
type FollowedArtistsService struct {
	db   *Database
	repo LocalLibraryRepository
}

// NewFollowedArtistsService creates a new FollowedArtistsService instance
func NewFollowedArtistsService(db *Database) *FollowedArtistsService {
	return &FollowedArtistsService{db: db}
}

func (s *FollowedArtistsService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.repo = repo
}

// GetFollowedArtists retrieves all followed artists for a user, ordered by most recently followed
func (s *FollowedArtistsService) GetFollowedArtists(ctx context.Context, userID string) ([]*models.FollowedArtist, error) {
	query := fmt.Sprintf(`SELECT %s FROM followed_artists WHERE user_id = $1 ORDER BY created_at DESC`, models.FollowedArtistColumns())
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get followed artists: %w", err)
	}
	defer rows.Close()

	var artists []*models.FollowedArtist
	for rows.Next() {
		artist, err := models.ScanFollowedArtist(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan followed artist: %w", err)
		}
		artists = append(artists, artist)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating followed artists: %w", err)
	}

	s.hydrateFollowedArtists(ctx, artists)
	return artists, nil
}

// FollowArtist adds an artist to the user's followed list
func (s *FollowedArtistsService) FollowArtist(ctx context.Context, userID string, req *models.FollowArtistRequest) (*models.FollowedArtist, error) {
	// Handle empty genres array gracefully
	genres := req.Genres
	if genres == nil {
		genres = []string{}
	}

	artist := &models.FollowedArtist{
		UserID:     userID,
		ArtistID:   req.ArtistID,
		ArtistName: req.ArtistName,
		ArtworkURL: req.ArtworkURL,
		Genres:     genres,
	}

	query := `
		INSERT INTO followed_artists (user_id, artist_id, artist_name, artwork_url, genres)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`
	err := s.db.QueryRowContext(ctx, query,
		artist.UserID,
		artist.ArtistID,
		artist.ArtistName,
		sql.NullString{String: artist.ArtworkURL, Valid: artist.ArtworkURL != ""},
		pq.Array(artist.Genres),
	).Scan(&artist.ID, &artist.CreatedAt)

	if err != nil {
		// Check for unique constraint violation
		if isUniqueViolation(err) {
			return nil, ErrArtistAlreadyFollowed
		}
		return nil, fmt.Errorf("failed to follow artist: %w", err)
	}

	return artist, nil
}

// UnfollowArtist removes an artist from the user's followed list
func (s *FollowedArtistsService) UnfollowArtist(ctx context.Context, userID, artistID string) error {
	query := `DELETE FROM followed_artists WHERE user_id = $1 AND artist_id = $2`
	result, err := s.db.ExecContext(ctx, query, userID, artistID)
	if err != nil {
		return fmt.Errorf("failed to unfollow artist: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrArtistNotFollowed
	}

	return nil
}

// IsFollowed checks if an artist is followed by the user
func (s *FollowedArtistsService) IsFollowed(ctx context.Context, userID, artistID string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM followed_artists WHERE user_id = $1 AND artist_id = $2`
	err := s.db.QueryRowContext(ctx, query, userID, artistID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check followed status: %w", err)
	}
	return count > 0, nil
}

// GetFollowedArtist retrieves a specific followed artist by user ID and artist ID
func (s *FollowedArtistsService) GetFollowedArtist(ctx context.Context, userID, artistID string) (*models.FollowedArtist, error) {
	query := fmt.Sprintf(`SELECT %s FROM followed_artists WHERE user_id = $1 AND artist_id = $2`, models.FollowedArtistColumns())
	row := s.db.QueryRowContext(ctx, query, userID, artistID)
	artist, err := models.ScanFollowedArtist(row)
	if err == sql.ErrNoRows {
		return nil, ErrArtistNotFollowed
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get followed artist: %w", err)
	}
	s.hydrateFollowedArtists(ctx, []*models.FollowedArtist{artist})
	return artist, nil
}

// GetFollowedArtistsCount returns the count of followed artists for a user
func (s *FollowedArtistsService) GetFollowedArtistsCount(ctx context.Context, userID string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM followed_artists WHERE user_id = $1`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get followed artists count: %w", err)
	}
	return count, nil
}

func (s *FollowedArtistsService) hydrateFollowedArtists(ctx context.Context, artists []*models.FollowedArtist) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for _, artist := range artists {
		if artist == nil {
			continue
		}
		snapshot, err := resolver.ResolveArtist(ctx, artist.ArtistID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			artist.AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		artist.ArtistName = snapshot.Name
		artist.ArtworkURL = snapshot.ArtworkURL
		artist.AvailabilityStatus = snapshot.AvailabilityStatus
	}
}
