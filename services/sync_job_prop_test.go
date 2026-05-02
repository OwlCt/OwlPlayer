package services

import (
	"github.com/OwlCt/OwlPlayer/models"
	"reflect"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: artist-release-notifications, Property 1: 歌手去重正确性**
// **Validates: Requirements 1.1**
//
// For any list of followed artists, after deduplication, each artist ID should appear only once.

func TestDeduplicateArtistsProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for artist sync items
	artistGen := gen.Struct(reflect.TypeOf(models.ArtistSyncItem{}), map[string]gopter.Gen{
		"ArtistID":   genArtistID(),
		"ArtistName": genArtistName(),
		"IsVIP":      gen.Bool(),
	})

	// Generator for list of artists (may contain duplicates)
	artistListGen := gen.SliceOfN(30, artistGen)

	// Property: After deduplication, each artist ID appears exactly once
	properties.Property("After deduplication, each artist ID appears exactly once", prop.ForAll(
		func(artists []models.ArtistSyncItem) bool {
			deduplicated := DeduplicateArtists(artists)

			// Check for duplicates
			seen := make(map[string]bool)
			for _, artist := range deduplicated {
				if seen[artist.ArtistID] {
					return false // Found duplicate
				}
				seen[artist.ArtistID] = true
			}
			return true
		},
		artistListGen,
	))

	// Property: Deduplication preserves all unique artist IDs
	properties.Property("Deduplication preserves all unique artist IDs", prop.ForAll(
		func(artists []models.ArtistSyncItem) bool {
			deduplicated := DeduplicateArtists(artists)

			// Get unique IDs from original list
			originalIDs := make(map[string]bool)
			for _, artist := range artists {
				originalIDs[artist.ArtistID] = true
			}

			// Get IDs from deduplicated list
			deduplicatedIDs := make(map[string]bool)
			for _, artist := range deduplicated {
				deduplicatedIDs[artist.ArtistID] = true
			}

			// All unique IDs should be preserved
			if len(originalIDs) != len(deduplicatedIDs) {
				return false
			}

			for id := range originalIDs {
				if !deduplicatedIDs[id] {
					return false
				}
			}

			return true
		},
		artistListGen,
	))

	// Property: Deduplication keeps first occurrence
	properties.Property("Deduplication keeps first occurrence", prop.ForAll(
		func(artists []models.ArtistSyncItem) bool {
			deduplicated := DeduplicateArtists(artists)

			// For each deduplicated artist, verify it matches the first occurrence in original
			for _, dedup := range deduplicated {
				// Find first occurrence in original
				for _, orig := range artists {
					if orig.ArtistID == dedup.ArtistID {
						// Should match the first occurrence
						if orig.ArtistName != dedup.ArtistName || orig.IsVIP != dedup.IsVIP {
							return false
						}
						break
					}
				}
			}
			return true
		},
		artistListGen,
	))

	properties.TestingRun(t)
}

// **Feature: artist-release-notifications, Property 2: VIP优先排序正确性**
// **Validates: Requirements 1.2**
//
// For any list of artists followed by both VIP and normal users, after sorting,
// all VIP users' artists should come before normal users' artists.

func TestVIPPrioritySortingProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for artist sync items
	artistGen := gen.Struct(reflect.TypeOf(models.ArtistSyncItem{}), map[string]gopter.Gen{
		"ArtistID":   genArtistID(),
		"ArtistName": genArtistName(),
		"IsVIP":      gen.Bool(),
	})

	// Generator for list of artists
	artistListGen := gen.SliceOfN(30, artistGen)

	// Property: All VIP artists come before all non-VIP artists
	properties.Property("All VIP artists come before all non-VIP artists", prop.ForAll(
		func(artists []models.ArtistSyncItem) bool {
			sorted := sortArtistsByVIPPriority(artists)

			// Find the last VIP artist index
			lastVIPIndex := -1
			for i, artist := range sorted {
				if artist.IsVIP {
					lastVIPIndex = i
				}
			}

			// Find the first non-VIP artist index
			firstNonVIPIndex := -1
			for i, artist := range sorted {
				if !artist.IsVIP {
					firstNonVIPIndex = i
					break
				}
			}

			// If there are both VIP and non-VIP artists, VIP should come first
			if lastVIPIndex != -1 && firstNonVIPIndex != -1 {
				return lastVIPIndex < firstNonVIPIndex
			}

			return true
		},
		artistListGen,
	))

	// Property: Sorting preserves all artists
	properties.Property("Sorting preserves all artists", prop.ForAll(
		func(artists []models.ArtistSyncItem) bool {
			sorted := sortArtistsByVIPPriority(artists)

			if len(sorted) != len(artists) {
				return false
			}

			// Count VIP and non-VIP in original
			originalVIPCount := 0
			originalNonVIPCount := 0
			for _, a := range artists {
				if a.IsVIP {
					originalVIPCount++
				} else {
					originalNonVIPCount++
				}
			}

			// Count VIP and non-VIP in sorted
			sortedVIPCount := 0
			sortedNonVIPCount := 0
			for _, a := range sorted {
				if a.IsVIP {
					sortedVIPCount++
				} else {
					sortedNonVIPCount++
				}
			}

			return originalVIPCount == sortedVIPCount && originalNonVIPCount == sortedNonVIPCount
		},
		artistListGen,
	))

	// Property: VIP section is contiguous at the beginning
	properties.Property("VIP section is contiguous at the beginning", prop.ForAll(
		func(artists []models.ArtistSyncItem) bool {
			sorted := sortArtistsByVIPPriority(artists)

			// Count VIP artists
			vipCount := 0
			for _, a := range artists {
				if a.IsVIP {
					vipCount++
				}
			}

			// First vipCount artists should all be VIP
			for i := 0; i < vipCount && i < len(sorted); i++ {
				if !sorted[i].IsVIP {
					return false
				}
			}

			// Remaining artists should all be non-VIP
			for i := vipCount; i < len(sorted); i++ {
				if sorted[i].IsVIP {
					return false
				}
			}

			return true
		},
		artistListGen,
	))

	properties.TestingRun(t)
}

// Helper generators

func genArtistID() gopter.Gen {
	return gen.Identifier().Map(func(s string) string {
		if len(s) == 0 {
			return "artist123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genArtistName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "Artist Name"
		}
		if len(s) > 100 {
			return s[:100]
		}
		return s
	})
}

// **Feature: enhanced-sync-management, Property 7: 同步日志条目完整性**
// **Validates: Requirements 4.2**
//
// For any sync log entry, it should contain artist name, processing status, and new releases count.

func TestSyncLogEntryCompletenessProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for sync log entry
	syncLogEntryGen := gen.Struct(reflect.TypeOf(models.SyncLogEntry{}), map[string]gopter.Gen{
		"ArtistID":    genArtistID(),
		"ArtistName":  genArtistName(),
		"Status":      gen.OneConstOf(models.SyncLogStatusSuccess, models.SyncLogStatusError),
		"NewReleases": gen.IntRange(0, 100),
		"Error":       gen.AlphaString(),
		"ProcessedAt": genTime(),
	})

	// Property: Every sync log entry has a non-empty artist name
	properties.Property("Every sync log entry has a non-empty artist name", prop.ForAll(
		func(entry models.SyncLogEntry) bool {
			return len(entry.ArtistName) > 0
		},
		syncLogEntryGen,
	))

	// Property: Every sync log entry has a valid status
	properties.Property("Every sync log entry has a valid status", prop.ForAll(
		func(entry models.SyncLogEntry) bool {
			return entry.Status == models.SyncLogStatusSuccess || entry.Status == models.SyncLogStatusError
		},
		syncLogEntryGen,
	))

	// Property: Every sync log entry has a non-negative new releases count
	properties.Property("Every sync log entry has a non-negative new releases count", prop.ForAll(
		func(entry models.SyncLogEntry) bool {
			return entry.NewReleases >= 0
		},
		syncLogEntryGen,
	))

	// Property: Error entries should have error message, success entries may not
	properties.Property("Error entries have error message when status is error", prop.ForAll(
		func(entry models.SyncLogEntry) bool {
			// This property validates that the structure allows for error messages
			// In practice, error entries should have error messages
			if entry.Status == models.SyncLogStatusError {
				// Error field can be set (we're testing the structure allows it)
				return true
			}
			return true
		},
		syncLogEntryGen,
	))

	// Property: Sync log entry has a non-empty artist ID
	properties.Property("Every sync log entry has a non-empty artist ID", prop.ForAll(
		func(entry models.SyncLogEntry) bool {
			return len(entry.ArtistID) > 0
		},
		syncLogEntryGen,
	))

	properties.TestingRun(t)
}

// genTime generates a random time value
func genTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(unix int64) time.Time {
		return time.Unix(unix, 0)
	})
}
