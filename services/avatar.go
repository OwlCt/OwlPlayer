package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	_ "golang.org/x/image/webp"
)

// Avatar service errors
var (
	ErrAvatarInvalidFormat = errors.New("invalid image format, must be JPEG, PNG, GIF, or WebP")
	ErrAvatarTooLarge      = errors.New("image size exceeds 5MB limit")
	ErrAvatarReadFailed    = errors.New("failed to read image data")
)

// AvatarConfig holds configuration for the avatar service
type AvatarConfig struct {
	StorageDir    string `yaml:"storage-dir"`
	MaxSizeBytes  int64  `yaml:"max-size-bytes"`
	DefaultAvatar string `yaml:"default-avatar"`
	URLPrefix     string `yaml:"url-prefix"`
}

// DefaultAvatarConfig returns the default avatar configuration
func DefaultAvatarConfig() *AvatarConfig {
	return &AvatarConfig{
		StorageDir:    ".data/avatars",
		MaxSizeBytes:  5 * 1024 * 1024, // 5MB
		DefaultAvatar: "default.svg",
		URLPrefix:     "/api/avatars",
	}
}

// AvatarService handles avatar upload, validation, and retrieval
type AvatarService struct {
	config *AvatarConfig
}

// NewAvatarService creates a new AvatarService instance
func NewAvatarService(config *AvatarConfig) (*AvatarService, error) {
	if config == nil {
		config = DefaultAvatarConfig()
	}

	// Ensure storage directory exists
	if err := os.MkdirAll(config.StorageDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create avatar storage directory: %w", err)
	}

	return &AvatarService{
		config: config,
	}, nil
}

// =============================================================================
// Avatar Validation (Task 10.1)
// =============================================================================

// AllowedImageFormats contains the list of allowed image formats
var AllowedImageFormats = []string{"jpeg", "png", "gif", "webp"}

// MaxAvatarSize is the maximum allowed avatar file size (5MB)
const MaxAvatarSize = 5 * 1024 * 1024

// ValidateAvatarFormat validates that the image data is a valid image format
// Returns the detected format name if valid, or an error if invalid
// **Feature: user-account-system, Property 18: Avatar validation**
func ValidateAvatarFormat(data []byte) (string, error) {
	if len(data) == 0 {
		return "", ErrAvatarReadFailed
	}

	// Try to decode the image to validate format
	reader := bytes.NewReader(data)
	_, format, err := image.DecodeConfig(reader)
	if err != nil {
		return "", ErrAvatarInvalidFormat
	}

	// Check if format is allowed
	format = strings.ToLower(format)
	for _, allowed := range AllowedImageFormats {
		if format == allowed {
			return format, nil
		}
	}

	return "", ErrAvatarInvalidFormat
}

// ValidateAvatarSize validates that the image data does not exceed the size limit
// **Feature: user-account-system, Property 18: Avatar validation**
func ValidateAvatarSize(data []byte, maxSize int64) error {
	if maxSize <= 0 {
		maxSize = MaxAvatarSize
	}
	if int64(len(data)) > maxSize {
		return ErrAvatarTooLarge
	}
	return nil
}

// ValidateAvatar validates both format and size of avatar data
// Returns the detected format if valid, or an error if invalid
// **Feature: user-account-system, Property 18: Avatar validation**
func (s *AvatarService) ValidateAvatar(data []byte) (string, error) {
	// Validate size first (cheaper check)
	if err := ValidateAvatarSize(data, s.config.MaxSizeBytes); err != nil {
		return "", err
	}

	// Validate format
	format, err := ValidateAvatarFormat(data)
	if err != nil {
		return "", err
	}

	return format, nil
}

// =============================================================================
// Avatar Storage (Task 10.1, 10.3)
// =============================================================================

// getExtensionForFormat returns the file extension for a given image format
func getExtensionForFormat(format string) string {
	switch strings.ToLower(format) {
	case "jpeg":
		return ".jpg"
	case "png":
		return ".png"
	case "gif":
		return ".gif"
	case "webp":
		return ".webp"
	default:
		return ".jpg"
	}
}

// SaveAvatar saves avatar data to storage and returns the filename
// **Feature: user-account-system, Property 17: Avatar upload and retrieval round-trip**
func (s *AvatarService) SaveAvatar(ctx context.Context, userID string, data []byte) (string, error) {
	// Validate avatar
	format, err := s.ValidateAvatar(data)
	if err != nil {
		return "", err
	}

	// Generate unique filename
	filename := fmt.Sprintf("%s_%s%s", userID, uuid.New().String()[:8], getExtensionForFormat(format))
	filepath := filepath.Join(s.config.StorageDir, filename)

	// Write file
	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return "", fmt.Errorf("failed to save avatar: %w", err)
	}

	return filename, nil
}

// GetAvatarPath returns the full filesystem path for an avatar filename
func (s *AvatarService) GetAvatarPath(filename string) string {
	return filepath.Join(s.config.StorageDir, filename)
}

// GetAvatarURL returns the URL for an avatar filename
// **Feature: user-account-system, Property 19: Avatar URL always present**
func (s *AvatarService) GetAvatarURL(filename string) string {
	if filename == "" {
		return s.GetDefaultAvatarURL()
	}
	return fmt.Sprintf("%s/%s", s.config.URLPrefix, filename)
}

// GetDefaultAvatarURL returns the URL for the default avatar
// **Feature: user-account-system, Property 19: Avatar URL always present**
func (s *AvatarService) GetDefaultAvatarURL() string {
	return fmt.Sprintf("%s/%s", s.config.URLPrefix, s.config.DefaultAvatar)
}

// DeleteAvatar removes an avatar file from storage
func (s *AvatarService) DeleteAvatar(filename string) error {
	if filename == "" || filename == s.config.DefaultAvatar {
		return nil // Don't delete default avatar
	}

	filepath := s.GetAvatarPath(filename)
	if err := os.Remove(filepath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete avatar: %w", err)
	}
	return nil
}

// AvatarExists checks if an avatar file exists
func (s *AvatarService) AvatarExists(filename string) bool {
	if filename == "" {
		return false
	}
	filepath := s.GetAvatarPath(filename)
	_, err := os.Stat(filepath)
	return err == nil
}

// ReadAvatar reads avatar data from storage
// **Feature: user-account-system, Property 17: Avatar upload and retrieval round-trip**
func (s *AvatarService) ReadAvatar(filename string) ([]byte, error) {
	if filename == "" {
		return nil, ErrAvatarReadFailed
	}

	filepath := s.GetAvatarPath(filename)
	data, err := os.ReadFile(filepath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrAvatarReadFailed
		}
		return nil, fmt.Errorf("failed to read avatar: %w", err)
	}

	return data, nil
}

// ReadAvatarFromReader reads avatar data from an io.Reader with size limit
func (s *AvatarService) ReadAvatarFromReader(r io.Reader) ([]byte, error) {
	// Limit reader to max size + 1 byte to detect oversized files
	limitedReader := io.LimitReader(r, s.config.MaxSizeBytes+1)

	data, err := io.ReadAll(limitedReader)
	if err != nil {
		return nil, ErrAvatarReadFailed
	}

	// Check if we hit the limit (file too large)
	if int64(len(data)) > s.config.MaxSizeBytes {
		return nil, ErrAvatarTooLarge
	}

	return data, nil
}

// GetStorageDir returns the avatar storage directory
func (s *AvatarService) GetStorageDir() string {
	return s.config.StorageDir
}

// GetConfig returns the avatar service configuration
func (s *AvatarService) GetConfig() *AvatarConfig {
	return s.config
}
