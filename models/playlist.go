package models

import (
	"database/sql"
	"time"
)

// Playlist represents a user playlist stored in the database
type Playlist struct {
	ID          string    `json:"id"`
	UserID      string    `json:"user_id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	ArtworkURL  string    `json:"artwork_url,omitempty"`
	SongCount   int       `json:"song_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// PlaylistSong represents a song in a playlist
type PlaylistSong struct {
	ID                 string    `json:"id"`
	PlaylistID         string    `json:"playlist_id"`
	SongID             string    `json:"song_id"`
	SongName           string    `json:"song_name"`
	ArtistName         string    `json:"artist_name"`
	ArtistID           string    `json:"artist_id,omitempty"`
	AlbumName          string    `json:"album_name"`
	AlbumID            string    `json:"album_id,omitempty"`
	Duration           int       `json:"duration"`
	ArtworkURL         string    `json:"artwork_url"`
	HasLyrics          bool      `json:"has_lyrics"`
	AvailabilityStatus string    `json:"availability_status,omitempty"`
	Position           int       `json:"position"`
	CreatedAt          time.Time `json:"created_at"`
}

// IsValid checks if the playlist has required fields
func (p *Playlist) IsValid() bool {
	return p.ID != "" && p.Name != ""
}

// ToSong converts PlaylistSong to SongItem for playback
func (ps *PlaylistSong) ToSong() *SongItem {
	return &SongItem{
		ID:         ps.SongID,
		Name:       ps.SongName,
		ArtistName: ps.ArtistName,
		ArtistID:   ps.ArtistID,
		AlbumName:  ps.AlbumName,
		AlbumID:    ps.AlbumID,
		Duration:   ps.Duration,
		ArtworkURL: ps.ArtworkURL,
		HasLyrics:  ps.HasLyrics,
	}
}

// ScanPlaylist scans a database row into a Playlist struct
func ScanPlaylist(row interface{ Scan(...any) error }) (*Playlist, error) {
	var p Playlist
	var description, artworkURL sql.NullString

	err := row.Scan(
		&p.ID,
		&p.UserID,
		&p.Name,
		&description,
		&artworkURL,
		&p.CreatedAt,
		&p.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if description.Valid {
		p.Description = description.String
	}
	if artworkURL.Valid {
		p.ArtworkURL = artworkURL.String
	}

	return &p, nil
}

// ScanPlaylistWithCount scans a database row into a Playlist struct including song count
func ScanPlaylistWithCount(row interface{ Scan(...any) error }) (*Playlist, error) {
	var p Playlist
	var description, artworkURL sql.NullString

	err := row.Scan(
		&p.ID,
		&p.UserID,
		&p.Name,
		&description,
		&artworkURL,
		&p.CreatedAt,
		&p.UpdatedAt,
		&p.SongCount,
	)
	if err != nil {
		return nil, err
	}

	if description.Valid {
		p.Description = description.String
	}
	if artworkURL.Valid {
		p.ArtworkURL = artworkURL.String
	}

	return &p, nil
}

// ScanPlaylistSong scans a database row into a PlaylistSong struct
func ScanPlaylistSong(row interface{ Scan(...any) error }) (*PlaylistSong, error) {
	var ps PlaylistSong
	var artistID, albumID, artworkURL sql.NullString

	err := row.Scan(
		&ps.ID,
		&ps.PlaylistID,
		&ps.SongID,
		&ps.SongName,
		&ps.ArtistName,
		&artistID,
		&ps.AlbumName,
		&albumID,
		&ps.Duration,
		&artworkURL,
		&ps.HasLyrics,
		&ps.Position,
		&ps.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if artistID.Valid {
		ps.ArtistID = artistID.String
	}
	if albumID.Valid {
		ps.AlbumID = albumID.String
	}
	if artworkURL.Valid {
		ps.ArtworkURL = artworkURL.String
	}

	return &ps, nil
}

// PlaylistColumns returns the column names for playlists queries
func PlaylistColumns() string {
	return "id, user_id, name, description, artwork_url, created_at, updated_at"
}

// PlaylistSongColumns returns the column names for playlist_songs queries
func PlaylistSongColumns() string {
	return "id, playlist_id, song_id, song_name, artist_name, artist_id, album_name, album_id, duration, artwork_url, has_lyrics, position, created_at"
}

// CreatePlaylistRequest represents the request body for creating a playlist
type CreatePlaylistRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// UpdatePlaylistRequest represents the request body for updating a playlist
type UpdatePlaylistRequest struct {
	Name             string `json:"name,omitempty"`
	Description      string `json:"description,omitempty"`
	ArtworkURL       string `json:"artwork_url,omitempty"`
	ClearArtwork     bool   `json:"clear_artwork,omitempty"`     // When true, clears the artwork_url
	ClearDescription bool   `json:"clear_description,omitempty"` // When true, clears the description
}

// AddPlaylistSongRequest represents the request body for adding a song to a playlist
type AddPlaylistSongRequest struct {
	SongID     string `json:"song_id"`
	SongName   string `json:"song_name"`
	ArtistName string `json:"artist_name"`
	ArtistID   string `json:"artist_id,omitempty"`
	AlbumName  string `json:"album_name"`
	AlbumID    string `json:"album_id,omitempty"`
	Duration   int    `json:"duration"`
	ArtworkURL string `json:"artwork_url,omitempty"`
	HasLyrics  bool   `json:"has_lyrics"`
}

// ReorderSongsRequest represents the request body for reordering songs in a playlist
type ReorderSongsRequest struct {
	SongIDs []string `json:"song_ids"`
}
