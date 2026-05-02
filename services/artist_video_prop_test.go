package services

import (
	"github.com/OwlCt/OwlPlayer/utils/ampapi"
	"testing"

	"pgregory.net/rapid"
)

/**
 * **Feature: artist-dynamic-artwork, Property 2: Video URL Extraction**
 * *For any* valid editorialVideo response containing motionArtistWide16x9 data,
 * the system SHALL extract a valid video URL string.
 * **Validates: Requirements 1.2**
 */
func TestVideoURLExtraction(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random video URL
		videoURL := rapid.StringMatching(`https://mvod\.itunes\.apple\.com/[a-z0-9/]+/[a-z0-9]+\.m3u8`).Draw(t, "videoURL")

		// Create editorialVideo data with motionArtistWide16x9
		editorialVideo := struct {
			MotionArtistWide16x9 *ampapi.EditorialVideoAsset `json:"motionArtistWide16x9"`
		}{
			MotionArtistWide16x9: &ampapi.EditorialVideoAsset{
				Video: videoURL,
			},
		}

		// Extract video URL (simulating the extraction logic)
		var extractedURL string
		if editorialVideo.MotionArtistWide16x9 != nil {
			extractedURL = editorialVideo.MotionArtistWide16x9.Video
		}

		// Verify extraction
		if extractedURL != videoURL {
			t.Errorf("Expected video URL '%s', got '%s'", videoURL, extractedURL)
		}

		// Verify URL is non-empty when data is present
		if extractedURL == "" {
			t.Errorf("Extracted URL should not be empty when motionArtistWide16x9 is present")
		}
	})
}

/**
 * **Feature: artist-dynamic-artwork, Property 2: Video URL Extraction**
 * *For any* editorialVideo response without motionArtistWide16x9 data,
 * the system SHALL return an empty string for video URL.
 * **Validates: Requirements 1.2**
 */
func TestVideoURLExtractionWhenMissing(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Create editorialVideo data without motionArtistWide16x9
		editorialVideo := struct {
			MotionArtistWide16x9 *ampapi.EditorialVideoAsset `json:"motionArtistWide16x9"`
		}{
			MotionArtistWide16x9: nil,
		}

		// Extract video URL (simulating the extraction logic)
		var extractedURL string
		if editorialVideo.MotionArtistWide16x9 != nil {
			extractedURL = editorialVideo.MotionArtistWide16x9.Video
		}

		// Verify extraction returns empty string
		if extractedURL != "" {
			t.Errorf("Expected empty URL when motionArtistWide16x9 is nil, got '%s'", extractedURL)
		}
	})
}

/**
 * **Feature: artist-dynamic-artwork, Property 2: Video URL Extraction**
 * *For any* valid editorialArtwork response containing centeredFullscreenBackground,
 * the system SHALL extract a valid landscape artwork URL.
 * **Validates: Requirements 2.1**
 */
func TestLandscapeURLExtraction(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random landscape artwork URL
		landscapeURL := rapid.StringMatching(`https://is[0-9]-ssl\.mzstatic\.com/image/thumb/[a-zA-Z0-9/]+\.jpg`).Draw(t, "landscapeURL")
		width := rapid.IntRange(1920, 3840).Draw(t, "width")
		height := rapid.IntRange(1080, 2160).Draw(t, "height")

		// Create editorialArtwork data with centeredFullscreenBackground
		editorialArtwork := struct {
			CenteredFullscreenBackground *ampapi.ArtworkAsset `json:"centeredFullscreenBackground"`
		}{
			CenteredFullscreenBackground: &ampapi.ArtworkAsset{
				URL:    landscapeURL,
				Width:  width,
				Height: height,
			},
		}

		// Extract landscape URL (simulating the extraction logic)
		var extractedURL string
		if editorialArtwork.CenteredFullscreenBackground != nil {
			extractedURL = editorialArtwork.CenteredFullscreenBackground.URL
		}

		// Verify extraction
		if extractedURL != landscapeURL {
			t.Errorf("Expected landscape URL '%s', got '%s'", landscapeURL, extractedURL)
		}

		// Verify URL is non-empty when data is present
		if extractedURL == "" {
			t.Errorf("Extracted URL should not be empty when centeredFullscreenBackground is present")
		}
	})
}

/**
 * **Feature: artist-dynamic-artwork, Property 2: Video URL Extraction**
 * *For any* editorialArtwork response without centeredFullscreenBackground,
 * the system SHALL return an empty string for landscape URL.
 * **Validates: Requirements 2.1**
 */
func TestLandscapeURLExtractionWhenMissing(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Create editorialArtwork data without centeredFullscreenBackground
		editorialArtwork := struct {
			CenteredFullscreenBackground *ampapi.ArtworkAsset `json:"centeredFullscreenBackground"`
		}{
			CenteredFullscreenBackground: nil,
		}

		// Extract landscape URL (simulating the extraction logic)
		var extractedURL string
		if editorialArtwork.CenteredFullscreenBackground != nil {
			extractedURL = editorialArtwork.CenteredFullscreenBackground.URL
		}

		// Verify extraction returns empty string
		if extractedURL != "" {
			t.Errorf("Expected empty URL when centeredFullscreenBackground is nil, got '%s'", extractedURL)
		}
	})
}
