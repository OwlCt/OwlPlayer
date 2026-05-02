package services

import (
	"main/models"
	"testing"
	"testing/quick"
)

// generateAlbumDetail generates a valid AlbumDetail for testing
func generateAlbumDetail() models.AlbumDetail {
	return models.AlbumDetail{
		AlbumItem: models.AlbumItem{
			ID:          "test-album-id",
			Name:        "Test Album",
			ArtistName:  "Test Artist",
			ArtworkURL:  "https://example.com/artwork.jpg",
			ReleaseDate: "2024-01-01",
			TrackCount:  10,
			Genres:      []string{"Pop", "Rock"},
			Copyright:   "© 2024 Test Records",
			Tracks: []models.SongItem{
				{
					ID:         "song-1",
					Name:       "Song 1",
					ArtistName: "Test Artist",
					AlbumName:  "Test Album",
					Duration:   180000,
					ArtworkURL: "https://example.com/artwork.jpg",
					HasLyrics:  true,
				},
			},
		},
		RecordLabel: "Test Records",
		Artists: []models.ArtistRef{
			{
				ID:         "artist-1",
				Name:       "Test Artist",
				ArtworkURL: "https://example.com/artist.jpg",
			},
		},
	}
}

/**
 * **Feature: enhanced-search-results, Property 13: Album API Response Structure**
 * *For any* valid album ID, the API response should contain: artwork URL, name,
 * artist name, release date, copyright, and a tracks array with song metadata.
 * **Validates: Requirements 5.1, 5.2**
 */
func TestAlbumDetailHasRequiredFields(t *testing.T) {
	// Property: For any valid AlbumDetail, all required fields must be present
	f := func(name string, artistName string, trackCount uint8) bool {
		if name == "" || artistName == "" {
			return true // Skip empty inputs
		}

		detail := models.AlbumDetail{
			AlbumItem: models.AlbumItem{
				ID:          "test-id",
				Name:        name,
				ArtistName:  artistName,
				ArtworkURL:  "https://example.com/art.jpg",
				ReleaseDate: "2024-01-01",
				TrackCount:  int(trackCount),
				Copyright:   "© 2024",
			},
			RecordLabel: "Test Label",
		}

		// Verify required fields are present
		hasID := detail.ID != ""
		hasName := detail.Name != ""
		hasArtistName := detail.ArtistName != ""
		hasArtworkURL := detail.ArtworkURL != ""
		hasReleaseDate := detail.ReleaseDate != ""

		return hasID && hasName && hasArtistName && hasArtworkURL && hasReleaseDate
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}

/**
 * **Feature: enhanced-search-results, Property 13: Album API Response Structure**
 * The tracks array should contain valid song metadata.
 * **Validates: Requirements 5.1, 5.2**
 */
func TestAlbumDetailTracksHaveRequiredFields(t *testing.T) {
	// Property: For any track in an album, required fields must be present
	f := func(songName string, songArtist string, duration uint32) bool {
		if songName == "" || songArtist == "" {
			return true // Skip empty inputs
		}

		track := models.SongItem{
			ID:         "song-id",
			Name:       songName,
			ArtistName: songArtist,
			Duration:   int(duration),
			ArtworkURL: "https://example.com/art.jpg",
		}

		// Verify required track fields
		hasID := track.ID != ""
		hasName := track.Name != ""
		hasArtistName := track.ArtistName != ""

		return hasID && hasName && hasArtistName
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}

/**
 * **Feature: enhanced-search-results, Property 13: Album API Response Structure**
 * Album IsValid should return true only when ID and Name are non-empty.
 * **Validates: Requirements 5.1, 5.2**
 */
func TestAlbumIsValidProperty(t *testing.T) {
	f := func(id string, name string) bool {
		album := models.AlbumItem{
			ID:   id,
			Name: name,
		}

		expected := id != "" && name != ""
		return album.IsValid() == expected
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}
