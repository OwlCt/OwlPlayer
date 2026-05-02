package services

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// Playlist cover service errors
var (
	ErrPlaylistCoverInvalidFormat = errors.New("invalid image format, must be JPEG, PNG, or WebP")
	ErrPlaylistCoverTooLarge      = errors.New("image size exceeds 5MB limit")
	ErrPlaylistCoverReadFailed    = errors.New("failed to read image data")
)

// AllowedPlaylistCoverFormats contains the list of allowed image formats for playlist covers
var AllowedPlaylistCoverFormats = []string{"jpeg", "png", "webp"}

// PlaylistCoverConfig holds configuration for the playlist cover service
type PlaylistCoverConfig struct {
	StorageDir   string `yaml:"storage-dir"`
	MaxSizeBytes int64  `yaml:"max-size-bytes"`
	URLPrefix    string `yaml:"url-prefix"`
}

// DefaultPlaylistCoverConfig returns the default playlist cover configuration
func DefaultPlaylistCoverConfig() *PlaylistCoverConfig {
	return &PlaylistCoverConfig{
		StorageDir:   ".data/playlists",
		MaxSizeBytes: 5 * 1024 * 1024, // 5MB
		URLPrefix:    "/api/playlists",
	}
}

// PlaylistCoverService handles playlist cover upload, validation, and retrieval
type PlaylistCoverService struct {
	config *PlaylistCoverConfig
}

// NewPlaylistCoverService creates a new PlaylistCoverService instance
func NewPlaylistCoverService(config *PlaylistCoverConfig) (*PlaylistCoverService, error) {
	if config == nil {
		config = DefaultPlaylistCoverConfig()
	}

	// Ensure storage directory exists
	if err := os.MkdirAll(config.StorageDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create playlist cover storage directory: %w", err)
	}

	return &PlaylistCoverService{
		config: config,
	}, nil
}


// =============================================================================
// Playlist Cover Validation (Reuses AvatarService validation logic)
// =============================================================================

// ValidatePlaylistCoverFormat validates that the image data is a valid image format
// Returns the detected format name if valid, or an error if invalid
// **Feature: playlist-edit-modal, Property 8: Save operation round-trip**
func ValidatePlaylistCoverFormat(data []byte) (string, error) {
	if len(data) == 0 {
		return "", ErrPlaylistCoverReadFailed
	}

	// Reuse avatar format validation
	format, err := ValidateAvatarFormat(data)
	if err != nil {
		return "", ErrPlaylistCoverInvalidFormat
	}

	// Check if format is allowed for playlist covers (JPEG, PNG, WebP only - no GIF)
	for _, allowed := range AllowedPlaylistCoverFormats {
		if format == allowed {
			return format, nil
		}
	}

	return "", ErrPlaylistCoverInvalidFormat
}

// ValidatePlaylistCoverSize validates that the image data does not exceed the size limit
// **Feature: playlist-edit-modal, Property 8: Save operation round-trip**
func ValidatePlaylistCoverSize(data []byte, maxSize int64) error {
	if maxSize <= 0 {
		maxSize = MaxAvatarSize // Reuse the same 5MB limit
	}
	if int64(len(data)) > maxSize {
		return ErrPlaylistCoverTooLarge
	}
	return nil
}

// ValidatePlaylistCover validates both format and size of playlist cover data
// Returns the detected format if valid, or an error if invalid
// **Feature: playlist-edit-modal, Property 8: Save operation round-trip**
func (s *PlaylistCoverService) ValidatePlaylistCover(data []byte) (string, error) {
	// Validate size first (cheaper check)
	if err := ValidatePlaylistCoverSize(data, s.config.MaxSizeBytes); err != nil {
		return "", err
	}

	// Validate format
	format, err := ValidatePlaylistCoverFormat(data)
	if err != nil {
		return "", err
	}

	return format, nil
}

// =============================================================================
// Playlist Cover Storage
// =============================================================================

// SavePlaylistCover saves playlist cover data to storage and returns the filename
// **Feature: playlist-edit-modal, Property 8: Save operation round-trip**
func (s *PlaylistCoverService) SavePlaylistCover(ctx context.Context, playlistID string, data []byte) (string, error) {
	// Validate cover
	format, err := s.ValidatePlaylistCover(data)
	if err != nil {
		return "", err
	}

	// Generate unique filename using playlist ID and UUID
	filename := fmt.Sprintf("%s_%s%s", playlistID, uuid.New().String()[:8], getExtensionForFormat(format))
	filePath := filepath.Join(s.config.StorageDir, filename)

	// Write file
	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return "", fmt.Errorf("failed to save playlist cover: %w", err)
	}

	return filename, nil
}

// GetPlaylistCoverPath returns the full filesystem path for a playlist cover filename
func (s *PlaylistCoverService) GetPlaylistCoverPath(filename string) string {
	return filepath.Join(s.config.StorageDir, filename)
}

// GetPlaylistCoverURL returns the URL for a playlist cover filename
func (s *PlaylistCoverService) GetPlaylistCoverURL(filename string) string {
	if filename == "" {
		return ""
	}
	return fmt.Sprintf("/api/playlist-covers/%s", filename)
}

// DeletePlaylistCover removes a playlist cover file from storage
// **Feature: playlist-edit-modal, Property 10: Cover removal persistence**
func (s *PlaylistCoverService) DeletePlaylistCover(filename string) error {
	if filename == "" {
		return nil
	}

	filePath := s.GetPlaylistCoverPath(filename)
	if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete playlist cover: %w", err)
	}
	return nil
}

// DeletePlaylistCoverByURL removes a playlist cover file from storage by its URL
// **Feature: playlist-edit-modal, Property 10: Cover removal persistence**
func (s *PlaylistCoverService) DeletePlaylistCoverByURL(artworkURL string) error {
	if artworkURL == "" {
		return nil
	}

	// Extract filename from URL (e.g., "/api/playlist-covers/xxx.jpg" -> "xxx.jpg")
	filename := filepath.Base(artworkURL)
	return s.DeletePlaylistCover(filename)
}

// PlaylistCoverExists checks if a playlist cover file exists
func (s *PlaylistCoverService) PlaylistCoverExists(filename string) bool {
	if filename == "" {
		return false
	}
	filePath := s.GetPlaylistCoverPath(filename)
	_, err := os.Stat(filePath)
	return err == nil
}

// ReadPlaylistCover reads playlist cover data from storage
func (s *PlaylistCoverService) ReadPlaylistCover(filename string) ([]byte, error) {
	if filename == "" {
		return nil, ErrPlaylistCoverReadFailed
	}

	filePath := s.GetPlaylistCoverPath(filename)
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrPlaylistCoverReadFailed
		}
		return nil, fmt.Errorf("failed to read playlist cover: %w", err)
	}

	return data, nil
}

// GetStorageDir returns the playlist cover storage directory
func (s *PlaylistCoverService) GetStorageDir() string {
	return s.config.StorageDir
}

// GetConfig returns the playlist cover service configuration
func (s *PlaylistCoverService) GetConfig() *PlaylistCoverConfig {
	return s.config
}
