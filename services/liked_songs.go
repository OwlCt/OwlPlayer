package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"

	"github.com/lib/pq"
)

// Liked songs service errors
var (
	ErrSongAlreadyLiked = errors.New("song already liked")
	ErrSongNotLiked     = errors.New("song not liked")
)

// LikedSongsService handles liked songs business logic
type LikedSongsService struct {
	db   *Database
	repo LocalLibraryRepository
}

// NewLikedSongsService creates a new LikedSongsService instance
func NewLikedSongsService(db *Database) *LikedSongsService {
	return &LikedSongsService{db: db}
}

func (s *LikedSongsService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.repo = repo
}

// GetLikedSongs retrieves all liked songs for a user, ordered by most recently liked
func (s *LikedSongsService) GetLikedSongs(ctx context.Context, userID string) ([]*models.LikedSong, error) {
	query := fmt.Sprintf(`SELECT %s FROM liked_songs WHERE user_id = $1 ORDER BY created_at DESC`, models.LikedSongColumns())
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get liked songs: %w", err)
	}
	defer rows.Close()

	var songs []*models.LikedSong
	for rows.Next() {
		song, err := models.ScanLikedSong(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan liked song: %w", err)
		}
		songs = append(songs, song)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating liked songs: %w", err)
	}

	s.hydrateLikedSongs(ctx, songs)
	return songs, nil
}

// AddLikedSong adds a song to the user's liked songs
func (s *LikedSongsService) AddLikedSong(ctx context.Context, userID string, song *models.SongItem) (*models.LikedSong, error) {
	likedSong := models.LikedSongFromSongItem(userID, song)

	// Handle empty genres array gracefully
	genres := song.Genres
	if genres == nil {
		genres = []string{}
	}
	likedSong.Genres = genres

	query := `
		INSERT INTO liked_songs (user_id, song_id, song_name, artist_name, artist_id, album_name, album_id, duration, artwork_url, has_lyrics, genres)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at
	`
	err := s.db.QueryRowContext(ctx, query,
		likedSong.UserID,
		likedSong.SongID,
		likedSong.SongName,
		likedSong.ArtistName,
		sql.NullString{String: likedSong.ArtistID, Valid: likedSong.ArtistID != ""},
		sql.NullString{String: likedSong.AlbumName, Valid: likedSong.AlbumName != ""},
		sql.NullString{String: likedSong.AlbumID, Valid: likedSong.AlbumID != ""},
		likedSong.Duration,
		sql.NullString{String: likedSong.ArtworkURL, Valid: likedSong.ArtworkURL != ""},
		likedSong.HasLyrics,
		pq.Array(likedSong.Genres),
	).Scan(&likedSong.ID, &likedSong.CreatedAt)

	if err != nil {
		// Check for unique constraint violation
		if isUniqueViolation(err) {
			return nil, ErrSongAlreadyLiked
		}
		return nil, fmt.Errorf("failed to add liked song: %w", err)
	}

	return likedSong, nil
}

// RemoveLikedSong removes a song from the user's liked songs
func (s *LikedSongsService) RemoveLikedSong(ctx context.Context, userID, songID string) error {
	query := `DELETE FROM liked_songs WHERE user_id = $1 AND song_id = $2`
	result, err := s.db.ExecContext(ctx, query, userID, songID)
	if err != nil {
		return fmt.Errorf("failed to remove liked song: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrSongNotLiked
	}

	return nil
}

// IsLiked checks if a song is liked by the user
func (s *LikedSongsService) IsLiked(ctx context.Context, userID, songID string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM liked_songs WHERE user_id = $1 AND song_id = $2`
	err := s.db.QueryRowContext(ctx, query, userID, songID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check liked status: %w", err)
	}
	return count > 0, nil
}

// BatchCheckLiked checks if multiple songs are liked by the user
func (s *LikedSongsService) BatchCheckLiked(ctx context.Context, userID string, songIDs []string) (map[string]bool, error) {
	result := make(map[string]bool)

	// Initialize all as not liked
	for _, id := range songIDs {
		result[id] = false
	}

	if len(songIDs) == 0 {
		return result, nil
	}

	// Build query with placeholders
	query := `SELECT song_id FROM liked_songs WHERE user_id = $1 AND song_id = ANY($2)`
	rows, err := s.db.QueryContext(ctx, query, userID, songIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to batch check liked songs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var songID string
		if err := rows.Scan(&songID); err != nil {
			return nil, fmt.Errorf("failed to scan song id: %w", err)
		}
		result[songID] = true
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating liked songs: %w", err)
	}

	return result, nil
}

// GetLikedSongsCount returns the count of liked songs for a user
func (s *LikedSongsService) GetLikedSongsCount(ctx context.Context, userID string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM liked_songs WHERE user_id = $1`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get liked songs count: %w", err)
	}
	return count, nil
}

// GetLikedSong retrieves a specific liked song by user ID and song ID
func (s *LikedSongsService) GetLikedSong(ctx context.Context, userID, songID string) (*models.LikedSong, error) {
	query := fmt.Sprintf(`SELECT %s FROM liked_songs WHERE user_id = $1 AND song_id = $2`, models.LikedSongColumns())
	row := s.db.QueryRowContext(ctx, query, userID, songID)
	song, err := models.ScanLikedSong(row)
	if err == sql.ErrNoRows {
		return nil, ErrSongNotLiked
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get liked song: %w", err)
	}
	s.hydrateLikedSongs(ctx, []*models.LikedSong{song})
	return song, nil
}

func (s *LikedSongsService) hydrateLikedSongs(ctx context.Context, songs []*models.LikedSong) {
	resolver := newLocalLibrarySnapshotResolver(s.repo)
	if resolver == nil {
		return
	}
	for _, song := range songs {
		if song == nil {
			continue
		}
		snapshot, err := resolver.ResolveSong(ctx, song.SongID)
		if err != nil {
			continue
		}
		if snapshot == nil {
			song.AvailabilityStatus = string(models.AvailabilityStatusUnavailable)
			continue
		}
		song.SongName = snapshot.Name
		song.ArtistName = snapshot.ArtistName
		song.ArtistID = snapshot.ArtistID
		song.AlbumName = snapshot.AlbumName
		song.AlbumID = snapshot.AlbumID
		song.Duration = snapshot.Duration
		song.ArtworkURL = snapshot.ArtworkURL
		song.HasLyrics = snapshot.HasLyrics
		song.AvailabilityStatus = snapshot.AvailabilityStatus
	}
}

// isUniqueViolation checks if the error is a PostgreSQL unique constraint violation
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	// PostgreSQL unique violation error code is 23505
	return contains(err.Error(), "23505") || contains(err.Error(), "unique constraint")
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsHelper(s, substr))
}

func containsHelper(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
