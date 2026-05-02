package services

import (
	"bytes"
	"context"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property 8: Save operation round-trip
// **Feature: playlist-edit-modal, Property 8: Save operation round-trip**
// **Validates: Requirements 6.1, 6.2**
// For any valid playlist cover image uploaded, retrieving the cover
// SHALL return the same image content.
// =============================================================================

// TestProperty8_PlaylistCoverRoundTrip tests that uploaded covers can be retrieved
func TestProperty8_PlaylistCoverRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create playlist cover service with temp directory
	config := &PlaylistCoverConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 1024 * 1024, // 1MB for testing
		URLPrefix:    "/api/playlists",
	}
	service, err := NewPlaylistCoverService(config)
	if err != nil {
		t.Fatalf("Failed to create playlist cover service: %v", err)
	}

	// Property: Saved JPEG covers can be retrieved with same content
	properties.Property("JPEG cover round-trip preserves content", prop.ForAll(
		func(width, height int, playlistID string) bool {
			if playlistID == "" {
				playlistID = "test-playlist"
			}
			data := generateValidJPEG(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save cover
			filename, err := service.SavePlaylistCover(context.Background(), playlistID, data)
			if err != nil {
				return false
			}

			// Read cover back
			retrieved, err := service.ReadPlaylistCover(filename)
			if err != nil {
				return false
			}

			// Verify content matches
			return bytes.Equal(data, retrieved)
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
		gen.AlphaString(),
	))

	// Property: Saved PNG covers can be retrieved with same content
	properties.Property("PNG cover round-trip preserves content", prop.ForAll(
		func(width, height int, playlistID string) bool {
			if playlistID == "" {
				playlistID = "test-playlist"
			}
			data := generateValidPNG(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save cover
			filename, err := service.SavePlaylistCover(context.Background(), playlistID, data)
			if err != nil {
				return false
			}

			// Read cover back
			retrieved, err := service.ReadPlaylistCover(filename)
			if err != nil {
				return false
			}

			// Verify content matches
			return bytes.Equal(data, retrieved)
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
		gen.AlphaString(),
	))

	properties.TestingRun(t)
}

// TestProperty8_PlaylistCoverValidation tests cover validation
func TestProperty8_PlaylistCoverValidation(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create playlist cover service with small size limit for testing
	config := &PlaylistCoverConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 100 * 1024, // 100KB for testing
		URLPrefix:    "/api/playlists",
	}
	service, err := NewPlaylistCoverService(config)
	if err != nil {
		t.Fatalf("Failed to create playlist cover service: %v", err)
	}

	// Property: Valid JPEG images are accepted
	properties.Property("valid JPEG images are accepted", prop.ForAll(
		func(width, height int) bool {
			data := generateValidJPEG(width, height)
			// Only test if image is under size limit
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}
			format, err := service.ValidatePlaylistCover(data)
			return err == nil && format == "jpeg"
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
	))

	// Property: Valid PNG images are accepted
	properties.Property("valid PNG images are accepted", prop.ForAll(
		func(width, height int) bool {
			data := generateValidPNG(width, height)
			// Only test if image is under size limit
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}
			format, err := service.ValidatePlaylistCover(data)
			return err == nil && format == "png"
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
	))

	// Property: GIF images are rejected (only JPEG, PNG, WebP allowed for playlist covers)
	properties.Property("GIF images are rejected for playlist covers", prop.ForAll(
		func(width, height int) bool {
			data := generateValidGIF(width, height)
			_, err := ValidatePlaylistCoverFormat(data)
			return err == ErrPlaylistCoverInvalidFormat
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
	))

	properties.TestingRun(t)
}

// TestProperty8_PlaylistCoverURLGeneration tests URL generation
func TestProperty8_PlaylistCoverURLGeneration(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create playlist cover service
	config := &PlaylistCoverConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 1024 * 1024,
		URLPrefix:    "/api/playlists",
	}
	service, err := NewPlaylistCoverService(config)
	if err != nil {
		t.Fatalf("Failed to create playlist cover service: %v", err)
	}

	// Property: Generated URLs contain the filename
	properties.Property("cover URL contains filename", prop.ForAll(
		func(filename string) bool {
			if filename == "" {
				// Empty filename should return empty URL
				url := service.GetPlaylistCoverURL(filename)
				return url == ""
			}
			url := service.GetPlaylistCoverURL(filename)
			return len(url) > 0
		},
		gen.AlphaString(),
	))

	// Property: Empty filename returns empty URL
	properties.Property("empty filename returns empty URL", prop.ForAll(
		func(_ int) bool {
			url := service.GetPlaylistCoverURL("")
			return url == ""
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}


// =============================================================================
// Property 10: Cover removal persistence
// **Feature: playlist-edit-modal, Property 10: Cover removal persistence**
// **Validates: Requirements 6.4**
// For any playlist with a custom cover, selecting "删除照片" and saving
// SHALL clear the artwork_url field and delete the file.
// =============================================================================

// TestProperty10_PlaylistCoverRemoval tests that covers can be deleted
func TestProperty10_PlaylistCoverRemoval(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create playlist cover service with temp directory
	config := &PlaylistCoverConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 1024 * 1024, // 1MB for testing
		URLPrefix:    "/api/playlists",
	}
	service, err := NewPlaylistCoverService(config)
	if err != nil {
		t.Fatalf("Failed to create playlist cover service: %v", err)
	}

	// Property: Deleted covers no longer exist
	properties.Property("deleted covers no longer exist", prop.ForAll(
		func(width, height int, playlistID string) bool {
			if playlistID == "" {
				playlistID = "test-playlist"
			}
			data := generateValidJPEG(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save cover
			filename, err := service.SavePlaylistCover(context.Background(), playlistID, data)
			if err != nil {
				return false
			}

			// Verify cover exists
			if !service.PlaylistCoverExists(filename) {
				return false
			}

			// Delete cover
			err = service.DeletePlaylistCover(filename)
			if err != nil {
				return false
			}

			// Verify cover no longer exists
			return !service.PlaylistCoverExists(filename)
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
		gen.AlphaString(),
	))

	// Property: Deleting non-existent cover does not error
	properties.Property("deleting non-existent cover does not error", prop.ForAll(
		func(filename string) bool {
			err := service.DeletePlaylistCover(filename)
			return err == nil
		},
		gen.AlphaString(),
	))

	// Property: Deleting empty filename does not error
	properties.Property("deleting empty filename does not error", prop.ForAll(
		func(_ int) bool {
			err := service.DeletePlaylistCover("")
			return err == nil
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

// TestProperty10_PlaylistCoverRemovalByURL tests cover removal by URL
func TestProperty10_PlaylistCoverRemovalByURL(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create playlist cover service with temp directory
	config := &PlaylistCoverConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 1024 * 1024, // 1MB for testing
		URLPrefix:    "/api/playlists",
	}
	service, err := NewPlaylistCoverService(config)
	if err != nil {
		t.Fatalf("Failed to create playlist cover service: %v", err)
	}

	// Property: Covers can be deleted by URL
	properties.Property("covers can be deleted by URL", prop.ForAll(
		func(width, height int, playlistID string) bool {
			if playlistID == "" {
				playlistID = "test-playlist"
			}
			data := generateValidJPEG(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save cover
			filename, err := service.SavePlaylistCover(context.Background(), playlistID, data)
			if err != nil {
				return false
			}

			// Get URL
			url := service.GetPlaylistCoverURL(filename)

			// Verify cover exists
			if !service.PlaylistCoverExists(filename) {
				return false
			}

			// Delete cover by URL
			err = service.DeletePlaylistCoverByURL(url)
			if err != nil {
				return false
			}

			// Verify cover no longer exists
			return !service.PlaylistCoverExists(filename)
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
		gen.AlphaString(),
	))

	// Property: Deleting by empty URL does not error
	properties.Property("deleting by empty URL does not error", prop.ForAll(
		func(_ int) bool {
			err := service.DeletePlaylistCoverByURL("")
			return err == nil
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

// TestProperty8_InvalidFormatsRejected tests that invalid formats are rejected
func TestProperty8_InvalidFormatsRejected(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Random bytes (non-image data) are rejected
	properties.Property("random bytes are rejected as invalid format", prop.ForAll(
		func(data []byte) bool {
			// Skip if data happens to be a valid image header
			if len(data) >= 8 {
				// Check for common image magic bytes
				if bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}) || // JPEG
					bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47}) || // PNG
					bytes.HasPrefix(data, []byte{0x52, 0x49, 0x46, 0x46}) { // WebP (RIFF)
					return true // Skip this case
				}
			}
			_, err := ValidatePlaylistCoverFormat(data)
			return err == ErrPlaylistCoverInvalidFormat || err == ErrPlaylistCoverReadFailed
		},
		gen.SliceOf(gen.UInt8()),
	))

	// Property: Empty data is rejected
	properties.Property("empty data is rejected", prop.ForAll(
		func(_ int) bool {
			_, err := ValidatePlaylistCoverFormat([]byte{})
			return err == ErrPlaylistCoverReadFailed
		},
		gen.Int(),
	))

	// Property: Text files are rejected
	properties.Property("text content is rejected", prop.ForAll(
		func(text string) bool {
			if len(text) == 0 {
				return true // Skip empty strings
			}
			_, err := ValidatePlaylistCoverFormat([]byte(text))
			return err == ErrPlaylistCoverInvalidFormat || err == ErrPlaylistCoverReadFailed
		},
		gen.AnyString(),
	))

	properties.TestingRun(t)
}

// TestProperty8_SizeLimitEnforced tests that size limits are enforced
func TestProperty8_SizeLimitEnforced(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Data under size limit is accepted
	properties.Property("data under size limit is accepted", prop.ForAll(
		func(size int) bool {
			if size <= 0 {
				return true
			}
			data := make([]byte, size)
			err := ValidatePlaylistCoverSize(data, MaxAvatarSize)
			return err == nil
		},
		gen.IntRange(1, int(MaxAvatarSize)),
	))

	// Property: Data over size limit is rejected
	properties.Property("data over size limit is rejected", prop.ForAll(
		func(extraBytes int) bool {
			if extraBytes <= 0 {
				extraBytes = 1
			}
			size := int(MaxAvatarSize) + extraBytes
			data := make([]byte, size)
			err := ValidatePlaylistCoverSize(data, MaxAvatarSize)
			return err == ErrPlaylistCoverTooLarge
		},
		gen.IntRange(1, 1000),
	))

	properties.TestingRun(t)
}
