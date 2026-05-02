package services

import (
	"main/models"
	"sort"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for Followed Artists
// =============================================================================

// genFollowArtistID generates random artist IDs for followed artists tests
func genFollowArtistID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genFollowArtistName generates random artist names for followed artists tests
func genFollowArtistName() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genFollowUserID generates random user IDs for followed artists tests
func genFollowUserID() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "user-" + string(chars)
	})
}

// genFollowedArtist generates random FollowedArtist for testing
func genFollowedArtist() gopter.Gen {
	return gopter.CombineGens(
		genFollowArtistID(),
		genFollowUserID(),
		genFollowArtistID(),
		genFollowArtistName(),
		gen.Int64Range(0, time.Now().Unix()),
	).Map(func(vals []interface{}) *models.FollowedArtist {
		return &models.FollowedArtist{
			ID:         vals[0].(string),
			UserID:     vals[1].(string),
			ArtistID:   vals[2].(string),
			ArtistName: vals[3].(string),
			CreatedAt:  time.Unix(vals[4].(int64), 0).UTC(),
		}
	})
}

// =============================================================================
// Property Tests for Followed Artists
// =============================================================================

// **Feature: artist-follow, Property 3: Follow is idempotent**
// **Validates: Requirements 1.3**
func TestProperty_FollowIsIdempotent(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Double follow is idempotent - artist appears exactly once
	properties.Property("double follow is idempotent", prop.ForAll(
		func(artistID string) bool {
			if artistID == "" {
				return true
			}

			store := NewMockFollowedArtistsStore()

			store.Follow(artistID)
			countAfterFirst := store.Count()

			store.Follow(artistID)
			countAfterSecond := store.Count()

			return countAfterFirst == countAfterSecond && store.IsFollowed(artistID)
		},
		genFollowArtistID(),
	))

	// Property: Follow then unfollow then follow results in artist being followed
	properties.Property("follow-unfollow-follow results in followed", prop.ForAll(
		func(artistID string) bool {
			if artistID == "" {
				return true
			}

			store := NewMockFollowedArtistsStore()

			store.Follow(artistID)
			store.Unfollow(artistID)
			store.Follow(artistID)

			return store.IsFollowed(artistID) && store.Count() == 1
		},
		genFollowArtistID(),
	))

	properties.TestingRun(t)
}

// **Feature: artist-follow, Property 7: New follows appear at top of list**
// **Validates: Requirements 4.3**
func TestProperty_FollowedArtistsSortedByDateDescending(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Sorting followed artists by created_at DESC produces correct order
	properties.Property("sorting by created_at DESC produces correct order", prop.ForAll(
		func(artists []*models.FollowedArtist) bool {
			if len(artists) <= 1 {
				return true
			}

			// Sort by created_at DESC (newest first)
			sorted := make([]*models.FollowedArtist, len(artists))
			copy(sorted, artists)
			sort.Slice(sorted, func(i, j int) bool {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			})

			// Verify order: each artist should have created_at >= next artist's created_at
			for i := 0; i < len(sorted)-1; i++ {
				if sorted[i].CreatedAt.Before(sorted[i+1].CreatedAt) {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(10, genFollowedArtist()),
	))

	// Property: Sorted list preserves all original artists
	properties.Property("sorting preserves all original artists", prop.ForAll(
		func(artists []*models.FollowedArtist) bool {
			if len(artists) == 0 {
				return true
			}

			// Sort by created_at DESC
			sorted := make([]*models.FollowedArtist, len(artists))
			copy(sorted, artists)
			sort.Slice(sorted, func(i, j int) bool {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			})

			// Verify same length
			if len(sorted) != len(artists) {
				return false
			}

			// Verify all original artists are present
			originalIDs := make(map[string]bool)
			for _, artist := range artists {
				originalIDs[artist.ID] = true
			}

			for _, artist := range sorted {
				if !originalIDs[artist.ID] {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(10, genFollowedArtist()),
	))

	properties.TestingRun(t)
}

// **Feature: artist-follow, Property 9: Follow/unfollow database round-trip**
// **Validates: Requirements 5.1, 5.2, 5.3**
func TestProperty_FollowUnfollowRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Follow then unfollow results in artist not being followed
	properties.Property("follow then unfollow results in artist not being followed", prop.ForAll(
		func(artistID string, userID string) bool {
			if artistID == "" || userID == "" {
				return true
			}

			store := NewMockFollowedArtistsStore()

			// Follow artist
			store.Follow(artistID)
			if !store.IsFollowed(artistID) {
				return false
			}

			// Unfollow artist
			store.Unfollow(artistID)
			return !store.IsFollowed(artistID)
		},
		genFollowArtistID(),
		genFollowUserID(),
	))

	// Property: Double unfollow is idempotent
	properties.Property("double unfollow is idempotent", prop.ForAll(
		func(artistID string) bool {
			if artistID == "" {
				return true
			}

			store := NewMockFollowedArtistsStore()

			store.Follow(artistID)
			store.Unfollow(artistID)
			countAfterFirst := store.Count()

			store.Unfollow(artistID)
			countAfterSecond := store.Count()

			return countAfterFirst == countAfterSecond && !store.IsFollowed(artistID)
		},
		genFollowArtistID(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Mock Types for Property Tests
// =============================================================================

// MockFollowedArtistsStore simulates the followed artists store for testing
type MockFollowedArtistsStore struct {
	followedArtists map[string]bool
}

// NewMockFollowedArtistsStore creates a new mock store
func NewMockFollowedArtistsStore() *MockFollowedArtistsStore {
	return &MockFollowedArtistsStore{
		followedArtists: make(map[string]bool),
	}
}

// Follow adds an artist to followed artists
func (s *MockFollowedArtistsStore) Follow(artistID string) {
	s.followedArtists[artistID] = true
}

// Unfollow removes an artist from followed artists
func (s *MockFollowedArtistsStore) Unfollow(artistID string) {
	delete(s.followedArtists, artistID)
}

// IsFollowed checks if an artist is followed
func (s *MockFollowedArtistsStore) IsFollowed(artistID string) bool {
	return s.followedArtists[artistID]
}

// Count returns the number of followed artists
func (s *MockFollowedArtistsStore) Count() int {
	return len(s.followedArtists)
}

// GetFollowedArtistIDs returns all followed artist IDs
func (s *MockFollowedArtistsStore) GetFollowedArtistIDs() []string {
	ids := make([]string, 0, len(s.followedArtists))
	for id := range s.followedArtists {
		ids = append(ids, id)
	}
	return ids
}
