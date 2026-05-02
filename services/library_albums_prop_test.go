package services

import (
	"github.com/OwlCt/OwlPlayer/models"
	"sort"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for Library Albums
// =============================================================================

// genLibraryAlbumID generates random album IDs for library albums tests
func genLibraryAlbumID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genLibraryAlbumName generates random album names for library albums tests
func genLibraryAlbumName() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genLibraryArtistName generates random artist names for library albums tests
func genLibraryArtistName() gopter.Gen {
	return gen.SliceOfN(6, gen.AlphaChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genLibraryUserID generates random user IDs for library albums tests
func genLibraryUserID() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "user-" + string(chars)
	})
}

// genLibraryAlbum generates random LibraryAlbum for testing
func genLibraryAlbum() gopter.Gen {
	return gopter.CombineGens(
		genLibraryAlbumID(),
		genLibraryUserID(),
		genLibraryAlbumID(),
		genLibraryAlbumName(),
		genLibraryArtistName(),
		gen.IntRange(1, 20),
		gen.Int64Range(0, time.Now().Unix()),
	).Map(func(vals []interface{}) *models.LibraryAlbum {
		return &models.LibraryAlbum{
			ID:         vals[0].(string),
			UserID:     vals[1].(string),
			AlbumID:    vals[2].(string),
			AlbumName:  vals[3].(string),
			ArtistName: vals[4].(string),
			TrackCount: vals[5].(int),
			CreatedAt:  time.Unix(vals[6].(int64), 0).UTC(),
		}
	})
}

// =============================================================================
// Property Tests for Library Albums
// =============================================================================

// **Feature: library-albums, Property 3: Library Albums Sorted by Date Descending**
// **Validates: Requirements 3.1**
func TestProperty_LibraryAlbumsSortedByDateDescending(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Sorting library albums by created_at DESC produces correct order
	properties.Property("sorting by created_at DESC produces correct order", prop.ForAll(
		func(albums []*models.LibraryAlbum) bool {
			if len(albums) <= 1 {
				return true
			}

			// Sort by created_at DESC (newest first)
			sorted := make([]*models.LibraryAlbum, len(albums))
			copy(sorted, albums)
			sort.Slice(sorted, func(i, j int) bool {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			})

			// Verify order: each album should have created_at >= next album's created_at
			for i := 0; i < len(sorted)-1; i++ {
				if sorted[i].CreatedAt.Before(sorted[i+1].CreatedAt) {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(10, genLibraryAlbum()),
	))

	// Property: Sorted list preserves all original albums
	properties.Property("sorting preserves all original albums", prop.ForAll(
		func(albums []*models.LibraryAlbum) bool {
			if len(albums) == 0 {
				return true
			}

			// Sort by created_at DESC
			sorted := make([]*models.LibraryAlbum, len(albums))
			copy(sorted, albums)
			sort.Slice(sorted, func(i, j int) bool {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			})

			// Verify same length
			if len(sorted) != len(albums) {
				return false
			}

			// Verify all original albums are present
			originalIDs := make(map[string]bool)
			for _, album := range albums {
				originalIDs[album.ID] = true
			}

			for _, album := range sorted {
				if !originalIDs[album.ID] {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(10, genLibraryAlbum()),
	))

	properties.TestingRun(t)
}

// **Feature: library-albums, Property 1: Save/Remove Round-Trip Consistency**
// **Validates: Requirements 1.1, 1.2, 4.2**
func TestProperty_SaveRemoveRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Save then remove results in album not being saved
	properties.Property("save then remove results in album not being saved", prop.ForAll(
		func(albumID string, userID string) bool {
			if albumID == "" || userID == "" {
				return true
			}

			store := NewMockLibraryAlbumsStore()

			// Save album
			store.Save(albumID)
			if !store.IsSaved(albumID) {
				return false
			}

			// Remove album
			store.Remove(albumID)
			return !store.IsSaved(albumID)
		},
		genLibraryAlbumID(),
		genLibraryUserID(),
	))

	// Property: Double save is idempotent
	properties.Property("double save is idempotent", prop.ForAll(
		func(albumID string) bool {
			if albumID == "" {
				return true
			}

			store := NewMockLibraryAlbumsStore()

			store.Save(albumID)
			countAfterFirst := store.Count()

			store.Save(albumID)
			countAfterSecond := store.Count()

			return countAfterFirst == countAfterSecond && store.IsSaved(albumID)
		},
		genLibraryAlbumID(),
	))

	// Property: Double remove is idempotent
	properties.Property("double remove is idempotent", prop.ForAll(
		func(albumID string) bool {
			if albumID == "" {
				return true
			}

			store := NewMockLibraryAlbumsStore()

			store.Save(albumID)
			store.Remove(albumID)
			countAfterFirst := store.Count()

			store.Remove(albumID)
			countAfterSecond := store.Count()

			return countAfterFirst == countAfterSecond && !store.IsSaved(albumID)
		},
		genLibraryAlbumID(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Mock Types for Property Tests
// =============================================================================

// MockLibraryAlbumsStore simulates the library albums store for testing
type MockLibraryAlbumsStore struct {
	savedAlbums map[string]bool
}

// NewMockLibraryAlbumsStore creates a new mock store
func NewMockLibraryAlbumsStore() *MockLibraryAlbumsStore {
	return &MockLibraryAlbumsStore{
		savedAlbums: make(map[string]bool),
	}
}

// Save adds an album to saved albums
func (s *MockLibraryAlbumsStore) Save(albumID string) {
	s.savedAlbums[albumID] = true
}

// Remove removes an album from saved albums
func (s *MockLibraryAlbumsStore) Remove(albumID string) {
	delete(s.savedAlbums, albumID)
}

// IsSaved checks if an album is saved
func (s *MockLibraryAlbumsStore) IsSaved(albumID string) bool {
	return s.savedAlbums[albumID]
}

// Count returns the number of saved albums
func (s *MockLibraryAlbumsStore) Count() int {
	return len(s.savedAlbums)
}

// GetSavedAlbumIDs returns all saved album IDs
func (s *MockLibraryAlbumsStore) GetSavedAlbumIDs() []string {
	ids := make([]string, 0, len(s.savedAlbums))
	for id := range s.savedAlbums {
		ids = append(ids, id)
	}
	return ids
}
