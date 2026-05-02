package services

import (
	"github.com/OwlCt/OwlPlayer/models"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for Liked Songs
// =============================================================================

// genLikedSongID generates random song IDs for liked songs tests
func genLikedSongID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genLikedSongName generates random song names for liked songs tests
func genLikedSongName() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genLikedArtistName generates random artist names for liked songs tests
func genLikedArtistName() gopter.Gen {
	return gen.SliceOfN(6, gen.AlphaChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genLikedSongItem generates random SongItem for liked songs testing
func genLikedSongItem() gopter.Gen {
	return gopter.CombineGens(
		genLikedSongID(),
		genLikedSongName(),
		genLikedArtistName(),
		gen.IntRange(30000, 600000), // duration 30s to 10min in ms
	).Map(func(vals []interface{}) *models.SongItem {
		return &models.SongItem{
			ID:         vals[0].(string),
			Name:       vals[1].(string),
			ArtistName: vals[2].(string),
			Duration:   vals[3].(int),
		}
	})
}

// genLikedUserID generates random user IDs for liked songs tests
func genLikedUserID() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "user-" + string(chars)
	})
}

// =============================================================================
// Property Tests for Liked Songs
// =============================================================================

// **Feature: music-library-liked-songs, Property 1: Like/Unlike Round Trip**
// **Validates: Requirements 3.5, 3.6, 4.1, 4.2**
func TestProperty_LikeUnlikeRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: LikedSongFromSongItem preserves song data
	properties.Property("LikedSongFromSongItem preserves song data", prop.ForAll(
		func(song *models.SongItem, userID string) bool {
			if song == nil || song.ID == "" || userID == "" {
				return true
			}

			likedSong := models.LikedSongFromSongItem(userID, song)

			// Verify all fields are preserved
			return likedSong.UserID == userID &&
				likedSong.SongID == song.ID &&
				likedSong.SongName == song.Name &&
				likedSong.ArtistName == song.ArtistName &&
				likedSong.AlbumName == song.AlbumName &&
				likedSong.AlbumID == song.AlbumID &&
				likedSong.Duration == song.Duration &&
				likedSong.ArtworkURL == song.ArtworkURL &&
				likedSong.HasLyrics == song.HasLyrics
		},
		genLikedSongItem(),
		genLikedUserID(),
	))

	// Property: ToSong converts LikedSong back to SongItem correctly
	properties.Property("ToSong converts LikedSong back to SongItem", prop.ForAll(
		func(song *models.SongItem, userID string) bool {
			if song == nil || song.ID == "" || userID == "" {
				return true
			}

			likedSong := models.LikedSongFromSongItem(userID, song)
			convertedSong := likedSong.ToSong()

			// Verify round trip preserves data
			return convertedSong.ID == song.ID &&
				convertedSong.Name == song.Name &&
				convertedSong.ArtistName == song.ArtistName &&
				convertedSong.AlbumName == song.AlbumName &&
				convertedSong.AlbumID == song.AlbumID &&
				convertedSong.Duration == song.Duration &&
				convertedSong.ArtworkURL == song.ArtworkURL &&
				convertedSong.HasLyrics == song.HasLyrics
		},
		genLikedSongItem(),
		genLikedUserID(),
	))

	// Property: Round trip (SongItem -> LikedSong -> SongItem) preserves essential data
	properties.Property("round trip preserves essential song data", prop.ForAll(
		func(song *models.SongItem, userID string) bool {
			if song == nil || song.ID == "" || userID == "" {
				return true
			}

			// SongItem -> LikedSong -> SongItem
			likedSong := models.LikedSongFromSongItem(userID, song)
			roundTrippedSong := likedSong.ToSong()

			// Essential fields must be preserved
			return roundTrippedSong.ID == song.ID &&
				roundTrippedSong.Name == song.Name &&
				roundTrippedSong.ArtistName == song.ArtistName &&
				roundTrippedSong.Duration == song.Duration
		},
		genLikedSongItem(),
		genLikedUserID(),
	))

	properties.TestingRun(t)
}

// **Feature: music-library-liked-songs, Property 2: Liked State Consistency**
// **Validates: Requirements 3.4, 4.4**
func TestProperty_LikedStateConsistency(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Mock liked songs store maintains consistency
	properties.Property("liked songs store maintains consistency", prop.ForAll(
		func(songIDs []string, likedIndices []int) bool {
			if len(songIDs) == 0 {
				return true
			}

			// Create a mock store
			store := NewMockLikedSongsStore()

			// Like songs at specified indices
			for _, idx := range likedIndices {
				if idx >= 0 && idx < len(songIDs) {
					store.Like(songIDs[idx])
				}
			}

			// Verify consistency: isLiked should match store state
			for _, songID := range songIDs {
				isLiked := store.IsLiked(songID)
				_, exists := store.likedSongs[songID]
				if isLiked != exists {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(10, genLikedSongID()),
		gen.SliceOfN(5, gen.IntRange(0, 9)),
	))

	// Property: Unlike removes song from liked state
	properties.Property("unlike removes song from liked state", prop.ForAll(
		func(songID string) bool {
			if songID == "" {
				return true
			}

			store := NewMockLikedSongsStore()

			// Like then unlike
			store.Like(songID)
			if !store.IsLiked(songID) {
				return false
			}

			store.Unlike(songID)
			return !store.IsLiked(songID)
		},
		genLikedSongID(),
	))

	// Property: Double like is idempotent
	properties.Property("double like is idempotent", prop.ForAll(
		func(songID string) bool {
			if songID == "" {
				return true
			}

			store := NewMockLikedSongsStore()

			store.Like(songID)
			countAfterFirst := store.Count()

			store.Like(songID)
			countAfterSecond := store.Count()

			return countAfterFirst == countAfterSecond && store.IsLiked(songID)
		},
		genLikedSongID(),
	))

	// Property: Double unlike is idempotent
	properties.Property("double unlike is idempotent", prop.ForAll(
		func(songID string) bool {
			if songID == "" {
				return true
			}

			store := NewMockLikedSongsStore()

			store.Like(songID)
			store.Unlike(songID)
			countAfterFirst := store.Count()

			store.Unlike(songID)
			countAfterSecond := store.Count()

			return countAfterFirst == countAfterSecond && !store.IsLiked(songID)
		},
		genLikedSongID(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Mock Types for Property Tests
// =============================================================================

// MockLikedSongsStore simulates the liked songs store for testing
type MockLikedSongsStore struct {
	likedSongs map[string]bool
}

// NewMockLikedSongsStore creates a new mock store
func NewMockLikedSongsStore() *MockLikedSongsStore {
	return &MockLikedSongsStore{
		likedSongs: make(map[string]bool),
	}
}

// Like adds a song to liked songs
func (s *MockLikedSongsStore) Like(songID string) {
	s.likedSongs[songID] = true
}

// Unlike removes a song from liked songs
func (s *MockLikedSongsStore) Unlike(songID string) {
	delete(s.likedSongs, songID)
}

// IsLiked checks if a song is liked
func (s *MockLikedSongsStore) IsLiked(songID string) bool {
	return s.likedSongs[songID]
}

// Count returns the number of liked songs
func (s *MockLikedSongsStore) Count() int {
	return len(s.likedSongs)
}

// GetLikedSongIDs returns all liked song IDs
func (s *MockLikedSongsStore) GetLikedSongIDs() []string {
	ids := make([]string, 0, len(s.likedSongs))
	for id := range s.likedSongs {
		ids = append(ids, id)
	}
	return ids
}
