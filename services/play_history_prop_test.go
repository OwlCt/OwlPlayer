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
// Property Test Generators for Play History
// =============================================================================

// genPlayHistorySongID generates random song IDs
func genPlayHistorySongID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "song-" + string(chars)
	})
}

// genPlayHistoryArtistID generates random artist IDs
func genPlayHistoryArtistID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "artist-" + string(chars)
	})
}

// genPlayHistoryName generates random names
func genPlayHistoryName() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genPlayHistoryItem generates random PlayHistoryItem for testing
func genPlayHistoryItem() gopter.Gen {
	return gopter.CombineGens(
		genPlayHistorySongID(),
		genPlayHistoryName(),
		genPlayHistoryArtistID(),
		genPlayHistoryName(),
		genPlayHistorySongID(),      // albumID
		genPlayHistoryName(),        // albumName
		gen.IntRange(30000, 600000), // duration 30s to 10min in ms
	).Map(func(vals []interface{}) *models.PlayHistoryItem {
		return &models.PlayHistoryItem{
			SongID:     vals[0].(string),
			SongName:   vals[1].(string),
			ArtistID:   vals[2].(string),
			ArtistName: vals[3].(string),
			AlbumID:    vals[4].(string),
			AlbumName:  vals[5].(string),
			Duration:   vals[6].(int),
			PlayedAt:   time.Now(),
		}
	})
}

// =============================================================================
// Mock Play History Store for Property Tests
// =============================================================================

// MockPlayHistoryStore simulates the play history store for testing
type MockPlayHistoryStore struct {
	history []*models.PlayHistoryItem
}

// NewMockPlayHistoryStore creates a new mock store
func NewMockPlayHistoryStore() *MockPlayHistoryStore {
	return &MockPlayHistoryStore{
		history: make([]*models.PlayHistoryItem, 0),
	}
}

// RecordPlay adds a play event to history
func (s *MockPlayHistoryStore) RecordPlay(item *models.PlayHistoryItem) {
	s.history = append(s.history, item)
}

// GetTopArtists returns top artists aggregated by play count
func (s *MockPlayHistoryStore) GetTopArtists(limit int) []*models.TopArtistItem {
	// Aggregate by artist
	artistCounts := make(map[string]*models.TopArtistItem)
	for _, h := range s.history {
		if existing, ok := artistCounts[h.ArtistID]; ok {
			existing.PlayCount++
		} else {
			artistCounts[h.ArtistID] = &models.TopArtistItem{
				ArtistID:   h.ArtistID,
				ArtistName: h.ArtistName,
				PlayCount:  1,
			}
		}
	}

	// Convert to slice and sort by play count descending
	result := make([]*models.TopArtistItem, 0, len(artistCounts))
	for _, item := range artistCounts {
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].PlayCount > result[j].PlayCount
	})

	// Apply limit
	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result
}

// GetTopTracks returns top tracks aggregated by play count
func (s *MockPlayHistoryStore) GetTopTracks(limit int) []*models.TopTrackItem {
	// Aggregate by song
	songCounts := make(map[string]*models.TopTrackItem)
	for _, h := range s.history {
		if existing, ok := songCounts[h.SongID]; ok {
			existing.PlayCount++
		} else {
			songCounts[h.SongID] = &models.TopTrackItem{
				SongID:     h.SongID,
				SongName:   h.SongName,
				ArtistID:   h.ArtistID,
				ArtistName: h.ArtistName,
				AlbumID:    h.AlbumID,
				AlbumName:  h.AlbumName,
				Duration:   h.Duration,
				PlayCount:  1,
			}
		}
	}

	// Convert to slice and sort by play count descending
	result := make([]*models.TopTrackItem, 0, len(songCounts))
	for _, item := range songCounts {
		result = append(result, item)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].PlayCount > result[j].PlayCount
	})

	// Apply limit
	if limit > 0 && len(result) > limit {
		result = result[:limit]
	}
	return result
}

// =============================================================================
// Property Tests for Play History
// =============================================================================

// **Feature: user-profile-search-history, Property 2: Play history aggregation by artist**
// **Validates: Requirements 2.2, 2.4**
func TestProperty_PlayHistoryAggregationByArtist(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Top artists are sorted by play count in descending order
	properties.Property("top artists sorted by play count descending", prop.ForAll(
		func(items []*models.PlayHistoryItem) bool {
			store := NewMockPlayHistoryStore()
			for _, item := range items {
				if item != nil && item.ArtistID != "" {
					store.RecordPlay(item)
				}
			}

			topArtists := store.GetTopArtists(0) // no limit

			// Verify sorted by play count descending
			for i := 1; i < len(topArtists); i++ {
				if topArtists[i].PlayCount > topArtists[i-1].PlayCount {
					return false
				}
			}
			return true
		},
		gen.SliceOfN(50, genPlayHistoryItem()),
	))

	// Property: Aggregation correctly counts plays per artist
	properties.Property("aggregation correctly counts plays per artist", prop.ForAll(
		func(items []*models.PlayHistoryItem) bool {
			store := NewMockPlayHistoryStore()
			expectedCounts := make(map[string]int)

			for _, item := range items {
				if item != nil && item.ArtistID != "" {
					store.RecordPlay(item)
					expectedCounts[item.ArtistID]++
				}
			}

			topArtists := store.GetTopArtists(0)

			// Verify each artist's play count matches expected
			for _, artist := range topArtists {
				if artist.PlayCount != expectedCounts[artist.ArtistID] {
					return false
				}
			}

			// Verify all artists are accounted for
			return len(topArtists) == len(expectedCounts)
		},
		gen.SliceOfN(30, genPlayHistoryItem()),
	))

	// Property: Limit parameter correctly limits results
	properties.Property("limit parameter correctly limits results", prop.ForAll(
		func(items []*models.PlayHistoryItem, limit int) bool {
			if limit <= 0 {
				return true
			}

			store := NewMockPlayHistoryStore()
			uniqueArtists := make(map[string]bool)

			for _, item := range items {
				if item != nil && item.ArtistID != "" {
					store.RecordPlay(item)
					uniqueArtists[item.ArtistID] = true
				}
			}

			topArtists := store.GetTopArtists(limit)

			expectedLen := limit
			if len(uniqueArtists) < limit {
				expectedLen = len(uniqueArtists)
			}

			return len(topArtists) == expectedLen
		},
		gen.SliceOfN(20, genPlayHistoryItem()),
		gen.IntRange(1, 10),
	))

	properties.TestingRun(t)
}

// **Feature: user-profile-search-history, Property 3: Play history aggregation by track**
// **Validates: Requirements 2.3, 2.5**
func TestProperty_PlayHistoryAggregationByTrack(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Top tracks are sorted by play count in descending order
	properties.Property("top tracks sorted by play count descending", prop.ForAll(
		func(items []*models.PlayHistoryItem) bool {
			store := NewMockPlayHistoryStore()
			for _, item := range items {
				if item != nil && item.SongID != "" {
					store.RecordPlay(item)
				}
			}

			topTracks := store.GetTopTracks(0) // no limit

			// Verify sorted by play count descending
			for i := 1; i < len(topTracks); i++ {
				if topTracks[i].PlayCount > topTracks[i-1].PlayCount {
					return false
				}
			}
			return true
		},
		gen.SliceOfN(50, genPlayHistoryItem()),
	))

	// Property: Aggregation correctly counts plays per track
	properties.Property("aggregation correctly counts plays per track", prop.ForAll(
		func(items []*models.PlayHistoryItem) bool {
			store := NewMockPlayHistoryStore()
			expectedCounts := make(map[string]int)

			for _, item := range items {
				if item != nil && item.SongID != "" {
					store.RecordPlay(item)
					expectedCounts[item.SongID]++
				}
			}

			topTracks := store.GetTopTracks(0)

			// Verify each track's play count matches expected
			for _, track := range topTracks {
				if track.PlayCount != expectedCounts[track.SongID] {
					return false
				}
			}

			// Verify all tracks are accounted for
			return len(topTracks) == len(expectedCounts)
		},
		gen.SliceOfN(30, genPlayHistoryItem()),
	))

	// Property: Track aggregation preserves song metadata
	properties.Property("track aggregation preserves song metadata", prop.ForAll(
		func(items []*models.PlayHistoryItem) bool {
			store := NewMockPlayHistoryStore()
			songMetadata := make(map[string]*models.PlayHistoryItem)

			for _, item := range items {
				if item != nil && item.SongID != "" {
					store.RecordPlay(item)
					// Store first occurrence metadata
					if _, exists := songMetadata[item.SongID]; !exists {
						songMetadata[item.SongID] = item
					}
				}
			}

			topTracks := store.GetTopTracks(0)

			// Verify metadata is preserved
			for _, track := range topTracks {
				original := songMetadata[track.SongID]
				if original == nil {
					return false
				}
				// Check essential fields are preserved
				if track.SongName != original.SongName ||
					track.ArtistID != original.ArtistID ||
					track.ArtistName != original.ArtistName ||
					track.AlbumID != original.AlbumID ||
					track.AlbumName != original.AlbumName {
					return false
				}
			}
			return true
		},
		gen.SliceOfN(20, genPlayHistoryItem()),
	))

	// Property: Limit parameter correctly limits track results
	properties.Property("limit parameter correctly limits track results", prop.ForAll(
		func(items []*models.PlayHistoryItem, limit int) bool {
			if limit <= 0 {
				return true
			}

			store := NewMockPlayHistoryStore()
			uniqueTracks := make(map[string]bool)

			for _, item := range items {
				if item != nil && item.SongID != "" {
					store.RecordPlay(item)
					uniqueTracks[item.SongID] = true
				}
			}

			topTracks := store.GetTopTracks(limit)

			expectedLen := limit
			if len(uniqueTracks) < limit {
				expectedLen = len(uniqueTracks)
			}

			return len(topTracks) == expectedLen
		},
		gen.SliceOfN(20, genPlayHistoryItem()),
		gen.IntRange(1, 10),
	))

	properties.TestingRun(t)
}
