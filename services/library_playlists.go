package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// Library playlists service errors
var (
	ErrLibraryPlaylistNotFound      = errors.New("library playlist not found")
	ErrLibraryPlaylistAlreadyExists = errors.New("playlist already in library")
)

// LibraryPlaylist represents an Apple Music playlist added to user's library
type LibraryPlaylist struct {
	ID           int       `json:"id"`
	UserID       string    `json:"user_id"`
	PlaylistID   string    `json:"playlist_id"`   // Apple Music playlist ID (e.g., pl.xxxxx)
	PlaylistName string    `json:"playlist_name"`
	CuratorName  string    `json:"curator_name,omitempty"`
	ArtworkURL   string    `json:"artwork_url,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// LibraryPlaylistsService handles library playlists business logic
type LibraryPlaylistsService struct {
	db *Database
}

// NewLibraryPlaylistsService creates a new LibraryPlaylistsService instance
func NewLibraryPlaylistsService(db *Database) *LibraryPlaylistsService {
	return &LibraryPlaylistsService{db: db}
}

// GetLibraryPlaylists retrieves all Apple Music playlists in user's library
func (s *LibraryPlaylistsService) GetLibraryPlaylists(ctx context.Context, userID string) ([]*LibraryPlaylist, error) {
	query := `
		SELECT id, user_id, playlist_id, playlist_name, curator_name, artwork_url, created_at
		FROM library_playlists
		WHERE user_id = $1
		ORDER BY created_at DESC
	`
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get library playlists: %w", err)
	}
	defer rows.Close()

	var playlists []*LibraryPlaylist
	for rows.Next() {
		p, err := scanLibraryPlaylist(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan library playlist: %w", err)
		}
		playlists = append(playlists, p)
	}

	return playlists, rows.Err()
}

// AddLibraryPlaylist adds an Apple Music playlist to user's library
func (s *LibraryPlaylistsService) AddLibraryPlaylist(ctx context.Context, userID string, playlist *LibraryPlaylist) (*LibraryPlaylist, error) {
	query := `
		INSERT INTO library_playlists (user_id, playlist_id, playlist_name, curator_name, artwork_url)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, playlist_id) DO UPDATE SET
			playlist_name = EXCLUDED.playlist_name,
			curator_name = EXCLUDED.curator_name,
			artwork_url = EXCLUDED.artwork_url
		RETURNING id, user_id, playlist_id, playlist_name, curator_name, artwork_url, created_at
	`
	row := s.db.QueryRowContext(ctx, query, userID, playlist.PlaylistID, playlist.PlaylistName, playlist.CuratorName, playlist.ArtworkURL)
	return scanLibraryPlaylistRow(row)
}

// RemoveLibraryPlaylist removes an Apple Music playlist from user's library
func (s *LibraryPlaylistsService) RemoveLibraryPlaylist(ctx context.Context, userID, playlistID string) error {
	query := `DELETE FROM library_playlists WHERE user_id = $1 AND playlist_id = $2`
	result, err := s.db.ExecContext(ctx, query, userID, playlistID)
	if err != nil {
		return fmt.Errorf("failed to remove library playlist: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}

	if rowsAffected == 0 {
		return ErrLibraryPlaylistNotFound
	}

	return nil
}

// IsInLibrary checks if an Apple Music playlist is in user's library
func (s *LibraryPlaylistsService) IsInLibrary(ctx context.Context, userID, playlistID string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM library_playlists WHERE user_id = $1 AND playlist_id = $2`
	err := s.db.QueryRowContext(ctx, query, userID, playlistID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check library playlist: %w", err)
	}
	return count > 0, nil
}

// GetLibraryPlaylistsCount returns the count of Apple Music playlists in user's library
func (s *LibraryPlaylistsService) GetLibraryPlaylistsCount(ctx context.Context, userID string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM library_playlists WHERE user_id = $1`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get library playlists count: %w", err)
	}
	return count, nil
}

// scanLibraryPlaylist scans a row into a LibraryPlaylist struct
func scanLibraryPlaylist(rows *sql.Rows) (*LibraryPlaylist, error) {
	var p LibraryPlaylist
	var curatorName, artworkURL sql.NullString

	err := rows.Scan(
		&p.ID,
		&p.UserID,
		&p.PlaylistID,
		&p.PlaylistName,
		&curatorName,
		&artworkURL,
		&p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if curatorName.Valid {
		p.CuratorName = curatorName.String
	}
	if artworkURL.Valid {
		p.ArtworkURL = artworkURL.String
	}

	return &p, nil
}

// scanLibraryPlaylistRow scans a single row into a LibraryPlaylist struct
func scanLibraryPlaylistRow(row *sql.Row) (*LibraryPlaylist, error) {
	var p LibraryPlaylist
	var curatorName, artworkURL sql.NullString

	err := row.Scan(
		&p.ID,
		&p.UserID,
		&p.PlaylistID,
		&p.PlaylistName,
		&curatorName,
		&artworkURL,
		&p.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if curatorName.Valid {
		p.CuratorName = curatorName.String
	}
	if artworkURL.Valid {
		p.ArtworkURL = artworkURL.String
	}

	return &p, nil
}
