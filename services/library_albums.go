package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
)

// Library albums service errors
var (
	ErrAlbumAlreadySaved = errors.New("album already saved")
	ErrAlbumNotSaved     = errors.New("album not saved")
)

// LibraryAlbumsService handles library albums business logic
type LibraryAlbumsService struct {
	db   *Database
	repo LocalLibraryRepository
}

// NewLibraryAlbumsService creates a new LibraryAlbumsService instance
func NewLibraryAlbumsService(db *Database) *LibraryAlbumsService {
	return &LibraryAlbumsService{db: db}
}

func (s *LibraryAlbumsService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.repo = repo
}

// GetLibraryAlbums retrieves all saved albums for a user, ordered by most recently saved
func (s *LibraryAlbumsService) GetLibraryAlbums(ctx context.Context, userID string) ([]*models.LibraryAlbum, error) {
	query := fmt.Sprintf(`SELECT %s FROM library_albums WHERE user_id = $1 ORDER BY created_at DESC`, models.LibraryAlbumColumns())
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get library albums: %w", err)
	}
	defer rows.Close()

	var albums []*models.LibraryAlbum
	for rows.Next() {
		album, err := models.ScanLibraryAlbum(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan library album: %w", err)
		}
		albums = append(albums, album)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating library albums: %w", err)
	}

	s.hydrateLibraryAlbums(ctx, albums)
	return albums, nil
}

// AddLibraryAlbum adds an album to the user's library
func (s *LibraryAlbumsService) AddLibraryAlbum(ctx context.Context, userID string, req *models.AddLibraryAlbumRequest) (*models.LibraryAlbum, error) {
	album := &models.LibraryAlbum{
		UserID:      userID,
		AlbumID:     req.AlbumID,
		AlbumName:   req.AlbumName,
		ArtistID:    req.ArtistID,
		ArtistName:  req.ArtistName,
		ArtworkURL:  req.ArtworkURL,
		ReleaseDate: req.ReleaseDate,
		TrackCount:  req.TrackCount,
	}
	requestedReleaseType := req.ReleaseType
	if requestedReleaseType == "" && req.IsSingle {
		requestedReleaseType = models.ReleaseTypeEP
	}
	applyLibraryAlbumReleaseType(album, requestedReleaseType)

	query := `
		INSERT INTO library_albums (user_id, album_id, album_name, artist_id, artist_name, artwork_url, release_date, track_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`
	err := s.db.QueryRowContext(ctx, query,
		album.UserID,
		album.AlbumID,
		album.AlbumName,
		sql.NullString{String: album.ArtistID, Valid: album.ArtistID != ""},
		album.ArtistName,
		sql.NullString{String: album.ArtworkURL, Valid: album.ArtworkURL != ""},
		sql.NullString{String: album.ReleaseDate, Valid: album.ReleaseDate != ""},
		album.TrackCount,
	).Scan(&album.ID, &album.CreatedAt)

	if err != nil {
		// Check for unique constraint violation
		if isUniqueViolation(err) {
			return nil, ErrAlbumAlreadySaved
		}
		return nil, fmt.Errorf("failed to add library album: %w", err)
	}

	s.hydrateLibraryAlbums(ctx, []*models.LibraryAlbum{album})
	return album, nil
}

// RemoveLibraryAlbum removes an album from the user's library
func (s *LibraryAlbumsService) RemoveLibraryAlbum(ctx context.Context, userID, albumID string) error {
	query := `DELETE FROM library_albums WHERE user_id = $1 AND album_id = $2`
	result, err := s.db.ExecContext(ctx, query, userID, albumID)
	if err != nil {
		return fmt.Errorf("failed to remove library album: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrAlbumNotSaved
	}

	return nil
}

// IsSaved checks if an album is saved in the user's library
func (s *LibraryAlbumsService) IsSaved(ctx context.Context, userID, albumID string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM library_albums WHERE user_id = $1 AND album_id = $2`
	err := s.db.QueryRowContext(ctx, query, userID, albumID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check saved status: %w", err)
	}
	return count > 0, nil
}

// GetLibraryAlbum retrieves a specific library album by user ID and album ID
func (s *LibraryAlbumsService) GetLibraryAlbum(ctx context.Context, userID, albumID string) (*models.LibraryAlbum, error) {
	query := fmt.Sprintf(`SELECT %s FROM library_albums WHERE user_id = $1 AND album_id = $2`, models.LibraryAlbumColumns())
	row := s.db.QueryRowContext(ctx, query, userID, albumID)
	album, err := models.ScanLibraryAlbum(row)
	if err == sql.ErrNoRows {
		return nil, ErrAlbumNotSaved
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get library album: %w", err)
	}
	s.hydrateLibraryAlbums(ctx, []*models.LibraryAlbum{album})
	return album, nil
}

// GetLibraryAlbumsCount returns the count of saved albums for a user
func (s *LibraryAlbumsService) GetLibraryAlbumsCount(ctx context.Context, userID string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM library_albums WHERE user_id = $1`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get library albums count: %w", err)
	}
	return count, nil
}

func (s *LibraryAlbumsService) hydrateLibraryAlbums(ctx context.Context, albums []*models.LibraryAlbum) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for _, album := range albums {
		if album == nil {
			continue
		}
		snapshot, err := resolver.ResolveAlbum(ctx, album.AlbumID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			applyLibraryAlbumReleaseType(album, models.ReleaseTypeAlbum)
			album.AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		album.AlbumName = snapshot.Name
		album.ArtistID = snapshot.ArtistID
		album.ArtistName = snapshot.ArtistName
		album.ArtworkURL = snapshot.ArtworkURL
		album.ReleaseDate = snapshot.ReleaseDate
		album.TrackCount = snapshot.TrackCount
		applyLibraryAlbumReleaseType(album, snapshot.ReleaseType)
		album.AvailabilityStatus = snapshot.AvailabilityStatus
	}
}
