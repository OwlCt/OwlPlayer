package models

import (
	"database/sql"
	"time"

	"github.com/lib/pq"
)

// LikedSong represents a liked song record in the database
type LikedSong struct {
	ID                 string         `json:"id"`
	UserID             string         `json:"user_id"`
	SongID             string         `json:"song_id"`
	SongName           string         `json:"song_name"`
	ArtistName         string         `json:"artist_name"`
	ArtistID           string         `json:"artist_id,omitempty"`
	AlbumName          string         `json:"album_name"`
	AlbumID            string         `json:"album_id,omitempty"`
	Duration           int            `json:"duration"`
	ArtworkURL         string         `json:"artwork_url"`
	HasLyrics          bool           `json:"has_lyrics"`
	Genres             pq.StringArray `json:"genres"`
	AvailabilityStatus string         `json:"availability_status,omitempty"`
	CreatedAt          time.Time      `json:"created_at"`
}

// ToSong converts LikedSong to SongItem for playback
func (ls *LikedSong) ToSong() *SongItem {
	return &SongItem{
		ID:         ls.SongID,
		Name:       ls.SongName,
		ArtistName: ls.ArtistName,
		ArtistID:   ls.ArtistID,
		AlbumName:  ls.AlbumName,
		AlbumID:    ls.AlbumID,
		Duration:   ls.Duration,
		ArtworkURL: ls.ArtworkURL,
		HasLyrics:  ls.HasLyrics,
	}
}

// LikedSongFromSongItem creates a LikedSong from a SongItem
func LikedSongFromSongItem(userID string, song *SongItem) *LikedSong {
	return &LikedSong{
		UserID:     userID,
		SongID:     song.ID,
		SongName:   song.Name,
		ArtistName: song.ArtistName,
		ArtistID:   song.ArtistID,
		AlbumName:  song.AlbumName,
		AlbumID:    song.AlbumID,
		Duration:   song.Duration,
		ArtworkURL: song.ArtworkURL,
		HasLyrics:  song.HasLyrics,
	}
}

// ScanLikedSong scans a database row into a LikedSong struct
func ScanLikedSong(row interface{ Scan(...interface{}) error }) (*LikedSong, error) {
	var ls LikedSong
	var artistID, albumName, albumID, artworkURL sql.NullString

	err := row.Scan(
		&ls.ID,
		&ls.UserID,
		&ls.SongID,
		&ls.SongName,
		&ls.ArtistName,
		&artistID,
		&albumName,
		&albumID,
		&ls.Duration,
		&artworkURL,
		&ls.HasLyrics,
		&ls.Genres,
		&ls.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if artistID.Valid {
		ls.ArtistID = artistID.String
	}
	if albumName.Valid {
		ls.AlbumName = albumName.String
	}
	if albumID.Valid {
		ls.AlbumID = albumID.String
	}
	if artworkURL.Valid {
		ls.ArtworkURL = artworkURL.String
	}

	return &ls, nil
}

// LikedSongColumns returns the column names for liked_songs queries
func LikedSongColumns() string {
	return "id, user_id, song_id, song_name, artist_name, artist_id, album_name, album_id, duration, artwork_url, has_lyrics, genres, created_at"
}

// AddLikedSongRequest represents the request body for adding a liked song
type AddLikedSongRequest struct {
	SongID     string   `json:"song_id"`
	SongName   string   `json:"song_name"`
	ArtistName string   `json:"artist_name"`
	ArtistID   string   `json:"artist_id,omitempty"`
	AlbumName  string   `json:"album_name,omitempty"`
	AlbumID    string   `json:"album_id,omitempty"`
	Duration   int      `json:"duration"`
	ArtworkURL string   `json:"artwork_url,omitempty"`
	HasLyrics  bool     `json:"has_lyrics"`
	Genres     []string `json:"genres"`
}

// ToSongItem converts AddLikedSongRequest to SongItem
func (r *AddLikedSongRequest) ToSongItem() *SongItem {
	return &SongItem{
		ID:         r.SongID,
		Name:       r.SongName,
		ArtistName: r.ArtistName,
		ArtistID:   r.ArtistID,
		AlbumName:  r.AlbumName,
		AlbumID:    r.AlbumID,
		Duration:   r.Duration,
		ArtworkURL: r.ArtworkURL,
		HasLyrics:  r.HasLyrics,
	}
}

// BatchCheckLikedRequest represents the request body for batch checking liked songs
type BatchCheckLikedRequest struct {
	SongIDs []string `json:"song_ids"`
}

// BatchCheckLikedResponse represents the response for batch checking liked songs
type BatchCheckLikedResponse struct {
	LikedStatus map[string]bool `json:"liked_status"`
}
