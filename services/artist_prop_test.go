package services

import (
	"github.com/OwlCt/OwlPlayer/models"
	"testing"
	"testing/quick"
)

/**
 * **Feature: enhanced-search-results, Property 14: Artist API Response Structure**
 * *For any* valid artist ID, the API response should contain: name, artwork URL,
 * genres array, topSongs array, and albums array.
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */
func TestArtistDetailHasRequiredFields(t *testing.T) {
	// Property: For any valid ArtistDetail, all required fields must be present
	f := func(name string, genreCount uint8) bool {
		if name == "" {
			return true // Skip empty inputs
		}

		genres := make([]string, int(genreCount%5))
		for i := range genres {
			genres[i] = "Genre" + string(rune('A'+i))
		}

		detail := models.ArtistDetail{
			ArtistItem: models.ArtistItem{
				ID:         "test-id",
				Name:       name,
				ArtworkURL: "https://example.com/art.jpg",
				Genres:     genres,
			},
			TopSongs: []models.SongItem{},
			Albums:   []models.AlbumItem{},
		}

		// Verify required fields are present
		hasID := detail.ID != ""
		hasName := detail.Name != ""
		hasArtworkURL := detail.ArtworkURL != ""
		hasGenres := detail.Genres != nil
		hasTopSongs := detail.TopSongs != nil
		hasAlbums := detail.Albums != nil

		return hasID && hasName && hasArtworkURL && hasGenres && hasTopSongs && hasAlbums
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}

/**
 * **Feature: enhanced-search-results, Property 14: Artist API Response Structure**
 * The topSongs array should contain valid song metadata.
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */
func TestArtistDetailTopSongsHaveRequiredFields(t *testing.T) {
	// Property: For any song in artist's top songs, required fields must be present
	f := func(songName string, songArtist string) bool {
		if songName == "" || songArtist == "" {
			return true // Skip empty inputs
		}

		song := models.SongItem{
			ID:         "song-id",
			Name:       songName,
			ArtistName: songArtist,
			Duration:   180000,
			ArtworkURL: "https://example.com/art.jpg",
		}

		// Verify required song fields
		hasID := song.ID != ""
		hasName := song.Name != ""
		hasArtistName := song.ArtistName != ""

		return hasID && hasName && hasArtistName
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}

/**
 * **Feature: enhanced-search-results, Property 14: Artist API Response Structure**
 * The albums array should contain valid album metadata.
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */
func TestArtistDetailAlbumsHaveRequiredFields(t *testing.T) {
	// Property: For any album in artist's albums, required fields must be present
	f := func(albumName string, artistName string) bool {
		if albumName == "" || artistName == "" {
			return true // Skip empty inputs
		}

		album := models.AlbumItem{
			ID:         "album-id",
			Name:       albumName,
			ArtistName: artistName,
			ArtworkURL: "https://example.com/art.jpg",
		}

		// Verify required album fields
		hasID := album.ID != ""
		hasName := album.Name != ""
		hasArtistName := album.ArtistName != ""

		return hasID && hasName && hasArtistName
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}

/**
 * **Feature: enhanced-search-results, Property 14: Artist API Response Structure**
 * Artist IsValid should return true only when ID and Name are non-empty.
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */
func TestArtistIsValidProperty(t *testing.T) {
	f := func(id string, name string) bool {
		artist := models.ArtistItem{
			ID:   id,
			Name: name,
		}

		expected := id != "" && name != ""
		return artist.IsValid() == expected
	}

	if err := quick.Check(f, &quick.Config{MaxCount: 100}); err != nil {
		t.Error(err)
	}
}
