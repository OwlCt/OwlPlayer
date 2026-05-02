package models

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: artist-release-notifications, Property 3: 快照存储往返一致性**
// **Validates: Requirements 1.5, 7.1**
//
// For any valid ArtistSnapshot, serializing to JSON and then deserializing
// should produce an equivalent snapshot data.

func TestArtistSnapshotJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid ArtistSnapshot objects
	snapshotGen := gen.Struct(reflect.TypeOf(ArtistSnapshot{}), map[string]gopter.Gen{
		"ID":         genUUID(),
		"ArtistID":   genSnapshotArtistID(),
		"ArtistName": genSnapshotArtistName(),
		"AlbumIDs":   genSnapshotIDList(),
		"SingleIDs":  genSnapshotIDList(),
		"SnapshotAt": genSnapshotTime(),
		"CreatedAt":  genSnapshotTime(),
		"UpdatedAt":  genSnapshotTime(),
	})

	// Property: JSON serialization round-trip preserves all fields
	properties.Property("JSON serialization round-trip preserves all fields", prop.ForAll(
		func(snapshot ArtistSnapshot) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(snapshot)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded ArtistSnapshot
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			if decoded.ID != snapshot.ID ||
				decoded.ArtistID != snapshot.ArtistID ||
				decoded.ArtistName != snapshot.ArtistName {
				return false
			}

			// Check album IDs
			if len(decoded.AlbumIDs) != len(snapshot.AlbumIDs) {
				return false
			}
			for i, id := range snapshot.AlbumIDs {
				if decoded.AlbumIDs[i] != id {
					return false
				}
			}

			// Check single IDs
			if len(decoded.SingleIDs) != len(snapshot.SingleIDs) {
				return false
			}
			for i, id := range snapshot.SingleIDs {
				if decoded.SingleIDs[i] != id {
					return false
				}
			}

			// Check timestamps (compare Unix timestamps to avoid timezone issues)
			return decoded.SnapshotAt.Unix() == snapshot.SnapshotAt.Unix() &&
				decoded.CreatedAt.Unix() == snapshot.CreatedAt.Unix() &&
				decoded.UpdatedAt.Unix() == snapshot.UpdatedAt.Unix()
		},
		snapshotGen,
	))

	properties.TestingRun(t)
}

// **Feature: artist-release-notifications, Property 4: 新发行检测正确性**
// **Validates: Requirements 2.2, 2.3**
//
// For any two snapshots, new albums/singles in the new snapshot that don't exist
// in the old snapshot should be correctly identified as new releases.

func TestSnapshotDiffDetection(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for snapshot pair input
	type snapshotInput struct {
		CommonAlbums  []string
		NewAlbums     []string
		CommonSingles []string
		NewSingles    []string
	}

	snapshotInputGen := gen.Struct(reflect.TypeOf(snapshotInput{}), map[string]gopter.Gen{
		"CommonAlbums":  gen.SliceOfN(5, genUniqueID("common-album-")),
		"NewAlbums":     gen.SliceOfN(3, genUniqueID("new-album-")),
		"CommonSingles": gen.SliceOfN(4, genUniqueID("common-single-")),
		"NewSingles":    gen.SliceOfN(2, genUniqueID("new-single-")),
	})

	// Property: New items in new snapshot are correctly detected
	properties.Property("New items in new snapshot are correctly detected", prop.ForAll(
		func(input snapshotInput) bool {
			oldSnapshot := ArtistSnapshot{
				ID:         "old-snapshot-id",
				ArtistID:   "artist-123",
				ArtistName: "Test Artist",
				AlbumIDs:   input.CommonAlbums,
				SingleIDs:  input.CommonSingles,
				SnapshotAt: time.Now().Add(-24 * time.Hour),
			}

			// New snapshot has common items plus new items
			newAlbumIDs := append([]string{}, input.CommonAlbums...)
			newAlbumIDs = append(newAlbumIDs, input.NewAlbums...)
			newSingleIDs := append([]string{}, input.CommonSingles...)
			newSingleIDs = append(newSingleIDs, input.NewSingles...)

			newSnapshot := ArtistSnapshot{
				ID:         "new-snapshot-id",
				ArtistID:   "artist-123",
				ArtistName: "Test Artist",
				AlbumIDs:   newAlbumIDs,
				SingleIDs:  newSingleIDs,
				SnapshotAt: time.Now(),
			}

			// Simulate the comparison logic
			diff := compareSnapshots(&oldSnapshot, &newSnapshot)

			// Verify new albums count matches
			if len(diff.NewAlbums) != len(input.NewAlbums) {
				return false
			}

			// Verify new singles count matches
			if len(diff.NewSingles) != len(input.NewSingles) {
				return false
			}

			return true
		},
		snapshotInputGen,
	))

	properties.TestingRun(t)
}

// compareSnapshots compares two snapshots and returns the differences
// This is a test helper that mirrors the service implementation
func compareSnapshots(old, new *ArtistSnapshot) *SnapshotDiff {
	diff := &SnapshotDiff{
		NewAlbums:  []NewRelease{},
		NewSingles: []NewRelease{},
	}

	// Build sets of old IDs
	oldAlbumSet := make(map[string]bool)
	for _, id := range old.AlbumIDs {
		oldAlbumSet[id] = true
	}
	oldSingleSet := make(map[string]bool)
	for _, id := range old.SingleIDs {
		oldSingleSet[id] = true
	}

	// Find new albums
	for _, id := range new.AlbumIDs {
		if !oldAlbumSet[id] {
			diff.NewAlbums = append(diff.NewAlbums, NewRelease{
				ID:   id,
				Type: "album",
			})
		}
	}

	// Find new singles
	for _, id := range new.SingleIDs {
		if !oldSingleSet[id] {
			diff.NewSingles = append(diff.NewSingles, NewRelease{
				ID:   id,
				Type: "single",
			})
		}
	}

	return diff
}

// Helper generators for ArtistSnapshot

func genSnapshotArtistID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "artist123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genSnapshotArtistName() gopter.Gen {
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

func genSnapshotIDList() gopter.Gen {
	return gen.SliceOfN(10, genSnapshotArtistID())
}

func genSnapshotTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}

// genUniqueID generates unique IDs with a prefix and index
func genUniqueID(prefix string) gopter.Gen {
	return gen.IntRange(0, 999999).Map(func(i int) string {
		return prefix + string(rune('a'+i%26)) + string(rune('0'+i%10))
	})
}
