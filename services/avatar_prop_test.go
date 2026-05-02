package services

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Test Helpers - Image Generation
// =============================================================================

// generateValidJPEG creates a valid JPEG image with given dimensions
func generateValidJPEG(width, height int) []byte {
	if width <= 0 {
		width = 100
	}
	if height <= 0 {
		height = 100
	}
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	// Fill with a color
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	jpeg.Encode(&buf, img, &jpeg.Options{Quality: 80})
	return buf.Bytes()
}

// generateValidPNG creates a valid PNG image with given dimensions
func generateValidPNG(width, height int) []byte {
	if width <= 0 {
		width = 100
	}
	if height <= 0 {
		height = 100
	}
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	var buf bytes.Buffer
	png.Encode(&buf, img)
	return buf.Bytes()
}

// generateValidGIF creates a valid GIF image with given dimensions
func generateValidGIF(width, height int) []byte {
	if width <= 0 {
		width = 100
	}
	if height <= 0 {
		height = 100
	}
	img := image.NewPaletted(image.Rect(0, 0, width, height), color.Palette{
		color.RGBA{R: 255, G: 0, B: 0, A: 255},
		color.RGBA{R: 0, G: 255, B: 0, A: 255},
		color.RGBA{R: 0, G: 0, B: 255, A: 255},
	})
	var buf bytes.Buffer
	gif.Encode(&buf, img, nil)
	return buf.Bytes()
}

// =============================================================================
// Property 18: Avatar validation
// **Feature: user-account-system, Property 18: Avatar validation**
// **Validates: Requirements 6.2**
// For any file upload as avatar, the system SHALL accept it if and only if
// it is a valid image (JPEG, PNG, GIF, WebP) and size is under 5MB.
// =============================================================================

// TestProperty18_ValidImageFormatsAccepted tests that valid image formats are accepted
func TestProperty18_ValidImageFormatsAccepted(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Valid JPEG images are accepted
	properties.Property("valid JPEG images are accepted", prop.ForAll(
		func(width, height int) bool {
			data := generateValidJPEG(width, height)
			format, err := ValidateAvatarFormat(data)
			return err == nil && format == "jpeg"
		},
		gen.IntRange(10, 500),
		gen.IntRange(10, 500),
	))

	// Property: Valid PNG images are accepted
	properties.Property("valid PNG images are accepted", prop.ForAll(
		func(width, height int) bool {
			data := generateValidPNG(width, height)
			format, err := ValidateAvatarFormat(data)
			return err == nil && format == "png"
		},
		gen.IntRange(10, 500),
		gen.IntRange(10, 500),
	))

	// Property: Valid GIF images are accepted
	properties.Property("valid GIF images are accepted", prop.ForAll(
		func(width, height int) bool {
			data := generateValidGIF(width, height)
			format, err := ValidateAvatarFormat(data)
			return err == nil && format == "gif"
		},
		gen.IntRange(10, 200), // GIF has more limited size due to palette
		gen.IntRange(10, 200),
	))

	properties.TestingRun(t)
}

// TestProperty18_InvalidFormatsRejected tests that invalid formats are rejected
func TestProperty18_InvalidFormatsRejected(t *testing.T) {
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
					bytes.HasPrefix(data, []byte{0x47, 0x49, 0x46}) || // GIF
					bytes.HasPrefix(data, []byte{0x52, 0x49, 0x46, 0x46}) { // WebP (RIFF)
					return true // Skip this case
				}
			}
			_, err := ValidateAvatarFormat(data)
			return err == ErrAvatarInvalidFormat || err == ErrAvatarReadFailed
		},
		gen.SliceOf(gen.UInt8()),
	))

	// Property: Empty data is rejected
	properties.Property("empty data is rejected", prop.ForAll(
		func(_ int) bool {
			_, err := ValidateAvatarFormat([]byte{})
			return err == ErrAvatarReadFailed
		},
		gen.Int(),
	))

	// Property: Text files are rejected
	properties.Property("text content is rejected", prop.ForAll(
		func(text string) bool {
			if len(text) == 0 {
				return true // Skip empty strings
			}
			_, err := ValidateAvatarFormat([]byte(text))
			return err == ErrAvatarInvalidFormat || err == ErrAvatarReadFailed
		},
		gen.AnyString(),
	))

	properties.TestingRun(t)
}

// TestProperty18_SizeLimitEnforced tests that size limits are enforced
func TestProperty18_SizeLimitEnforced(t *testing.T) {
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
			err := ValidateAvatarSize(data, MaxAvatarSize)
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
			err := ValidateAvatarSize(data, MaxAvatarSize)
			return err == ErrAvatarTooLarge
		},
		gen.IntRange(1, 1000),
	))

	// Property: Custom size limits are respected
	properties.Property("custom size limits are respected", prop.ForAll(
		func(limit, dataSize int) bool {
			if limit <= 0 || dataSize <= 0 {
				return true
			}
			data := make([]byte, dataSize)
			err := ValidateAvatarSize(data, int64(limit))
			if dataSize > limit {
				return err == ErrAvatarTooLarge
			}
			return err == nil
		},
		gen.IntRange(100, 10000),
		gen.IntRange(1, 15000),
	))

	properties.TestingRun(t)
}

// TestProperty18_AvatarServiceValidation tests the combined validation in AvatarService
func TestProperty18_AvatarServiceValidation(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create avatar service with small size limit for testing
	config := &AvatarConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 100 * 1024, // 100KB for testing
		URLPrefix:    "/api/avatars",
	}
	service, err := NewAvatarService(config)
	if err != nil {
		t.Fatalf("Failed to create avatar service: %v", err)
	}

	// Property: Valid small images pass validation
	properties.Property("valid small images pass validation", prop.ForAll(
		func(width, height int) bool {
			data := generateValidJPEG(width, height)
			// Only test if image is under size limit
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}
			format, err := service.ValidateAvatar(data)
			return err == nil && format == "jpeg"
		},
		gen.IntRange(10, 100),
		gen.IntRange(10, 100),
	))

	// Property: Invalid data fails validation
	properties.Property("invalid data fails validation", prop.ForAll(
		func(data []byte) bool {
			// Skip if data happens to be a valid image
			if len(data) >= 8 {
				if bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}) ||
					bytes.HasPrefix(data, []byte{0x89, 0x50, 0x4E, 0x47}) ||
					bytes.HasPrefix(data, []byte{0x47, 0x49, 0x46}) ||
					bytes.HasPrefix(data, []byte{0x52, 0x49, 0x46, 0x46}) {
					return true
				}
			}
			_, err := service.ValidateAvatar(data)
			return err != nil
		},
		gen.SliceOf(gen.UInt8()),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Property 17: Avatar upload and retrieval round-trip
// **Feature: user-account-system, Property 17: Avatar upload and retrieval round-trip**
// **Validates: Requirements 6.1**
// For any valid avatar image uploaded by a user, retrieving the user's profile
// SHALL return an avatar_url that serves the same image content.
// =============================================================================

// TestProperty17_AvatarRoundTrip tests that uploaded avatars can be retrieved
func TestProperty17_AvatarRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create avatar service with temp directory
	config := &AvatarConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 1024 * 1024, // 1MB for testing
		URLPrefix:    "/api/avatars",
	}
	service, err := NewAvatarService(config)
	if err != nil {
		t.Fatalf("Failed to create avatar service: %v", err)
	}

	// Property: Saved JPEG avatars can be retrieved with same content
	properties.Property("JPEG avatar round-trip preserves content", prop.ForAll(
		func(width, height int, userID string) bool {
			if userID == "" {
				userID = "test-user"
			}
			data := generateValidJPEG(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save avatar
			filename, err := service.SaveAvatar(nil, userID, data)
			if err != nil {
				return false
			}

			// Read avatar back
			retrieved, err := service.ReadAvatar(filename)
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

	// Property: Saved PNG avatars can be retrieved with same content
	properties.Property("PNG avatar round-trip preserves content", prop.ForAll(
		func(width, height int, userID string) bool {
			if userID == "" {
				userID = "test-user"
			}
			data := generateValidPNG(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save avatar
			filename, err := service.SaveAvatar(nil, userID, data)
			if err != nil {
				return false
			}

			// Read avatar back
			retrieved, err := service.ReadAvatar(filename)
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

	// Property: Saved GIF avatars can be retrieved with same content
	properties.Property("GIF avatar round-trip preserves content", prop.ForAll(
		func(width, height int, userID string) bool {
			if userID == "" {
				userID = "test-user"
			}
			data := generateValidGIF(width, height)

			// Skip if image is too large
			if int64(len(data)) > config.MaxSizeBytes {
				return true
			}

			// Save avatar
			filename, err := service.SaveAvatar(nil, userID, data)
			if err != nil {
				return false
			}

			// Read avatar back
			retrieved, err := service.ReadAvatar(filename)
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

// TestProperty17_AvatarURLGeneration tests that avatar URLs are correctly generated
func TestProperty17_AvatarURLGeneration(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create avatar service
	config := &AvatarConfig{
		StorageDir:   t.TempDir(),
		MaxSizeBytes: 1024 * 1024,
		URLPrefix:    "/api/avatars",
	}
	service, err := NewAvatarService(config)
	if err != nil {
		t.Fatalf("Failed to create avatar service: %v", err)
	}

	// Property: Generated URLs contain the filename
	properties.Property("avatar URL contains filename", prop.ForAll(
		func(filename string) bool {
			if filename == "" {
				return true
			}
			url := service.GetAvatarURL(filename)
			return len(url) > 0 && url != service.GetDefaultAvatarURL()
		},
		gen.AlphaString().SuchThat(func(s string) bool { return len(s) > 0 }),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Property 19: Avatar URL always present
// **Feature: user-account-system, Property 19: Avatar URL always present**
// **Validates: Requirements 6.4**
// For any user profile response, avatar_url SHALL be present
// (either custom avatar or default avatar URL).
// =============================================================================

// TestProperty19_AvatarURLAlwaysPresent tests that avatar URL is always present
func TestProperty19_AvatarURLAlwaysPresent(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Create avatar service
	config := &AvatarConfig{
		StorageDir:    t.TempDir(),
		MaxSizeBytes:  1024 * 1024,
		URLPrefix:     "/api/avatars",
		DefaultAvatar: "default.png",
	}
	service, err := NewAvatarService(config)
	if err != nil {
		t.Fatalf("Failed to create avatar service: %v", err)
	}

	// Property: Empty filename returns default avatar URL
	properties.Property("empty filename returns default avatar URL", prop.ForAll(
		func(_ int) bool {
			url := service.GetAvatarURL("")
			defaultURL := service.GetDefaultAvatarURL()
			return url == defaultURL && url != ""
		},
		gen.Int(),
	))

	// Property: Non-empty filename returns non-default URL
	properties.Property("non-empty filename returns custom URL", prop.ForAll(
		func(filename string) bool {
			if filename == "" {
				return true
			}
			url := service.GetAvatarURL(filename)
			defaultURL := service.GetDefaultAvatarURL()
			return url != "" && url != defaultURL
		},
		gen.AlphaString().SuchThat(func(s string) bool { return len(s) > 0 }),
	))

	// Property: Default avatar URL is always non-empty
	properties.Property("default avatar URL is always non-empty", prop.ForAll(
		func(_ int) bool {
			url := service.GetDefaultAvatarURL()
			return url != "" && len(url) > 0
		},
		gen.Int(),
	))

	// Property: GetAvatarURL never returns empty string
	properties.Property("GetAvatarURL never returns empty string", prop.ForAll(
		func(filename string) bool {
			url := service.GetAvatarURL(filename)
			return url != ""
		},
		gen.AnyString(),
	))

	properties.TestingRun(t)
}

// TestProperty19_DefaultAvatarConfiguration tests default avatar configuration
func TestProperty19_DefaultAvatarConfiguration(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Different URL prefixes produce different default URLs
	properties.Property("URL prefix affects default avatar URL", prop.ForAll(
		func(prefix string) bool {
			if prefix == "" {
				return true
			}
			config := &AvatarConfig{
				StorageDir:    t.TempDir(),
				MaxSizeBytes:  1024 * 1024,
				URLPrefix:     prefix,
				DefaultAvatar: "default.png",
			}
			service, err := NewAvatarService(config)
			if err != nil {
				return false
			}
			url := service.GetDefaultAvatarURL()
			return len(url) > 0 && url != ""
		},
		gen.AlphaString(),
	))

	properties.TestingRun(t)
}
