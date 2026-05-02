package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
)

// Playlists service errors
var (
	ErrPlaylistNotFound      = errors.New("playlist not found")
	ErrSongAlreadyInPlaylist = errors.New("song already in playlist")
	ErrSongNotInPlaylist     = errors.New("song not in playlist")
)

// PlaylistsDBService handles playlists business logic with database storage
type PlaylistsDBService struct {
	db   *Database
	repo LocalLibraryRepository
}

// NewPlaylistsDBService creates a new PlaylistsDBService instance
func NewPlaylistsDBService(db *Database) *PlaylistsDBService {
	return &PlaylistsDBService{db: db}
}

func (s *PlaylistsDBService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.repo = repo
}

// EnsureArtistIDColumn ensures the artist_id column exists in playlist_songs table
func (s *PlaylistsDBService) EnsureArtistIDColumn(ctx context.Context) error {
	query := `
		DO $$
		BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns 
				WHERE table_name = 'playlist_songs' AND column_name = 'artist_id'
			) THEN
				ALTER TABLE playlist_songs ADD COLUMN artist_id TEXT;
			END IF;
		END $$;
	`
	_, err := s.db.ExecContext(ctx, query)
	return err
}

// GetPlaylists retrieves all playlists for a user, ordered by most recently created
// If a playlist has no custom artwork, it returns the first song's artwork as fallback
func (s *PlaylistsDBService) GetPlaylists(ctx context.Context, userID string) ([]*models.Playlist, error) {
	query := `
		SELECT p.id, p.user_id, p.name, p.description, 
			   COALESCE(NULLIF(p.artwork_url, ''), (
				   SELECT ps.artwork_url FROM playlist_songs ps 
				   WHERE ps.playlist_id = p.id 
				   ORDER BY ps.position ASC 
				   LIMIT 1
			   )) as artwork_url,
			   p.created_at, p.updated_at,
			   COALESCE((SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id), 0) as song_count
		FROM playlists p
		WHERE p.user_id = $1
		ORDER BY p.created_at DESC
	`
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get playlists: %w", err)
	}
	defer rows.Close()

	var playlists []*models.Playlist
	for rows.Next() {
		playlist, err := models.ScanPlaylistWithCount(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan playlist: %w", err)
		}
		playlists = append(playlists, playlist)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating playlists: %w", err)
	}

	return playlists, nil
}

// GetPlaylist retrieves a single playlist by ID
// If the playlist has no custom artwork, it returns the first song's artwork as fallback
func (s *PlaylistsDBService) GetPlaylist(ctx context.Context, userID, playlistID string) (*models.Playlist, error) {
	query := `
		SELECT p.id, p.user_id, p.name, p.description, 
			   COALESCE(NULLIF(p.artwork_url, ''), (
				   SELECT ps.artwork_url FROM playlist_songs ps 
				   WHERE ps.playlist_id = p.id 
				   ORDER BY ps.position ASC 
				   LIMIT 1
			   )) as artwork_url,
			   p.created_at, p.updated_at,
			   COALESCE((SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id), 0) as song_count
		FROM playlists p
		WHERE p.id = $1 AND p.user_id = $2
	`
	row := s.db.QueryRowContext(ctx, query, playlistID, userID)
	playlist, err := models.ScanPlaylistWithCount(row)
	if err == sql.ErrNoRows {
		return nil, ErrPlaylistNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get playlist: %w", err)
	}
	return playlist, nil
}

// CreatePlaylist creates a new playlist
func (s *PlaylistsDBService) CreatePlaylist(ctx context.Context, userID, name, description string) (*models.Playlist, error) {
	query := `
		INSERT INTO playlists (user_id, name, description)
		VALUES ($1, $2, $3)
		RETURNING id, user_id, name, description, artwork_url, created_at, updated_at
	`
	row := s.db.QueryRowContext(ctx, query, userID, name, sql.NullString{String: description, Valid: description != ""})
	playlist, err := models.ScanPlaylist(row)
	if err != nil {
		return nil, fmt.Errorf("failed to create playlist: %w", err)
	}
	playlist.SongCount = 0
	return playlist, nil
}

// UpdatePlaylist updates a playlist's metadata
// **Feature: playlist-edit-modal, Property 10: Cover removal persistence**
func (s *PlaylistsDBService) UpdatePlaylist(ctx context.Context, userID, playlistID string, req *models.UpdatePlaylistRequest) (*models.Playlist, error) {
	// First check if playlist exists and belongs to user
	_, err := s.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return nil, err
	}

	// Build dynamic update query based on flags
	var row interface{ Scan(...any) error }

	// Determine description update logic - use $4 placeholder even when clearing
	descriptionSQL := "CASE WHEN $4 = '' THEN description ELSE $4 END"
	if req.ClearDescription {
		// When clearing, ignore the $4 value and set to NULL
		descriptionSQL = "CASE WHEN TRUE THEN NULL ELSE $4 END"
		fmt.Printf("[DEBUG] Setting description to NULL for playlist %s\n", playlistID)
	}

	// Determine artwork update logic - use $5 placeholder even when clearing
	artworkSQL := "CASE WHEN $5 = '' THEN artwork_url ELSE $5 END"
	if req.ClearArtwork {
		// When clearing, ignore the $5 value and set to NULL
		artworkSQL = "CASE WHEN TRUE THEN NULL ELSE $5 END"
	}

	query := `
		UPDATE playlists
		SET name = COALESCE(NULLIF($3, ''), name),
			description = ` + descriptionSQL + `,
			artwork_url = ` + artworkSQL + `,
			updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, name, description, artwork_url, created_at, updated_at
	`
	row = s.db.QueryRowContext(ctx, query, playlistID, userID, req.Name, req.Description, req.ArtworkURL)

	playlist, err := models.ScanPlaylist(row)
	if err != nil {
		return nil, fmt.Errorf("failed to update playlist: %w", err)
	}

	// Get song count
	countQuery := `SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = $1`
	err = s.db.QueryRowContext(ctx, countQuery, playlistID).Scan(&playlist.SongCount)
	if err != nil {
		return nil, fmt.Errorf("failed to get song count: %w", err)
	}

	return playlist, nil
}

// DeletePlaylist deletes a playlist and all its songs (cascade)
func (s *PlaylistsDBService) DeletePlaylist(ctx context.Context, userID, playlistID string) error {
	query := `DELETE FROM playlists WHERE id = $1 AND user_id = $2`
	result, err := s.db.ExecContext(ctx, query, playlistID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete playlist: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrPlaylistNotFound
	}

	return nil
}

// GetPlaylistSongs retrieves all songs in a playlist
func (s *PlaylistsDBService) GetPlaylistSongs(ctx context.Context, userID, playlistID string) ([]*models.PlaylistSong, error) {
	// First verify playlist belongs to user
	_, err := s.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return nil, err
	}

	query := fmt.Sprintf(`SELECT %s FROM playlist_songs WHERE playlist_id = $1 ORDER BY position ASC`, models.PlaylistSongColumns())
	rows, err := s.db.QueryContext(ctx, query, playlistID)
	if err != nil {
		return nil, fmt.Errorf("failed to get playlist songs: %w", err)
	}
	defer rows.Close()

	var songs []*models.PlaylistSong
	for rows.Next() {
		song, err := models.ScanPlaylistSong(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan playlist song: %w", err)
		}
		songs = append(songs, song)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating playlist songs: %w", err)
	}

	s.hydratePlaylistSongs(ctx, songs)
	return songs, nil
}

// AddSongToPlaylist adds a song to a playlist
func (s *PlaylistsDBService) AddSongToPlaylist(ctx context.Context, userID, playlistID string, req *models.AddPlaylistSongRequest) (*models.PlaylistSong, error) {
	// First verify playlist belongs to user
	_, err := s.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return nil, err
	}

	// Get the next position
	var maxPosition sql.NullInt64
	posQuery := `SELECT MAX(position) FROM playlist_songs WHERE playlist_id = $1`
	err = s.db.QueryRowContext(ctx, posQuery, playlistID).Scan(&maxPosition)
	if err != nil {
		return nil, fmt.Errorf("failed to get max position: %w", err)
	}

	nextPosition := 0
	if maxPosition.Valid {
		nextPosition = int(maxPosition.Int64) + 1
	}

	query := `
		INSERT INTO playlist_songs (playlist_id, song_id, song_name, artist_name, artist_id, album_name, album_id, duration, artwork_url, has_lyrics, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, playlist_id, song_id, song_name, artist_name, artist_id, album_name, album_id, duration, artwork_url, has_lyrics, position, created_at
	`
	row := s.db.QueryRowContext(ctx, query,
		playlistID,
		req.SongID,
		req.SongName,
		req.ArtistName,
		sql.NullString{String: req.ArtistID, Valid: req.ArtistID != ""},
		req.AlbumName,
		sql.NullString{String: req.AlbumID, Valid: req.AlbumID != ""},
		req.Duration,
		sql.NullString{String: req.ArtworkURL, Valid: req.ArtworkURL != ""},
		req.HasLyrics,
		nextPosition,
	)

	song, err := models.ScanPlaylistSong(row)
	if err != nil {
		if isUniqueViolation(err) {
			return nil, ErrSongAlreadyInPlaylist
		}
		return nil, fmt.Errorf("failed to add song to playlist: %w", err)
	}

	// Update playlist's updated_at
	updateQuery := `UPDATE playlists SET updated_at = NOW() WHERE id = $1`
	_, _ = s.db.ExecContext(ctx, updateQuery, playlistID)

	s.hydratePlaylistSongs(ctx, []*models.PlaylistSong{song})
	return song, nil
}

// RemoveSongFromPlaylist removes a song from a playlist
func (s *PlaylistsDBService) RemoveSongFromPlaylist(ctx context.Context, userID, playlistID, songID string) error {
	// First verify playlist belongs to user
	_, err := s.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return err
	}

	query := `DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2`
	result, err := s.db.ExecContext(ctx, query, playlistID, songID)
	if err != nil {
		return fmt.Errorf("failed to remove song from playlist: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rowsAffected == 0 {
		return ErrSongNotInPlaylist
	}

	// Update playlist's updated_at
	updateQuery := `UPDATE playlists SET updated_at = NOW() WHERE id = $1`
	_, _ = s.db.ExecContext(ctx, updateQuery, playlistID)

	return nil
}

// ReorderSongs reorders songs in a playlist
func (s *PlaylistsDBService) ReorderSongs(ctx context.Context, userID, playlistID string, songIDs []string) error {
	// First verify playlist belongs to user
	_, err := s.GetPlaylist(ctx, userID, playlistID)
	if err != nil {
		return err
	}

	// Update positions for each song
	for i, songID := range songIDs {
		query := `UPDATE playlist_songs SET position = $1 WHERE playlist_id = $2 AND song_id = $3`
		_, err := s.db.ExecContext(ctx, query, i, playlistID, songID)
		if err != nil {
			return fmt.Errorf("failed to update song position: %w", err)
		}
	}

	// Update playlist's updated_at
	updateQuery := `UPDATE playlists SET updated_at = NOW() WHERE id = $1`
	_, _ = s.db.ExecContext(ctx, updateQuery, playlistID)

	return nil
}

// IsSongInPlaylist checks if a song is in a playlist
func (s *PlaylistsDBService) IsSongInPlaylist(ctx context.Context, playlistID, songID string) (bool, error) {
	var count int
	query := `SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2`
	err := s.db.QueryRowContext(ctx, query, playlistID, songID).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check song in playlist: %w", err)
	}
	return count > 0, nil
}

// GetPlaylistSongCount returns the count of songs in a playlist
func (s *PlaylistsDBService) GetPlaylistSongCount(ctx context.Context, playlistID string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM playlist_songs WHERE playlist_id = $1`
	err := s.db.QueryRowContext(ctx, query, playlistID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get playlist song count: %w", err)
	}
	return count, nil
}

// GetSongPlaylists returns all playlist IDs that contain a specific song for a user
func (s *PlaylistsDBService) GetSongPlaylists(ctx context.Context, userID, songID string) ([]string, error) {
	query := `
		SELECT ps.playlist_id
		FROM playlist_songs ps
		INNER JOIN playlists p ON ps.playlist_id = p.id
		WHERE ps.song_id = $1 AND p.user_id = $2
	`
	rows, err := s.db.QueryContext(ctx, query, songID, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get song playlists: %w", err)
	}
	defer rows.Close()

	var playlistIDs []string
	for rows.Next() {
		var playlistID string
		if err := rows.Scan(&playlistID); err != nil {
			return nil, fmt.Errorf("failed to scan playlist ID: %w", err)
		}
		playlistIDs = append(playlistIDs, playlistID)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating song playlists: %w", err)
	}

	return playlistIDs, nil
}

func (s *PlaylistsDBService) hydratePlaylistSongs(ctx context.Context, songs []*models.PlaylistSong) {
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
