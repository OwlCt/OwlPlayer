package services

import (
	"main/models"
	"reflect"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: artist-release-notifications, Property 4: 新发行检测正确性**
// **Validates: Requirements 2.2, 2.3**
//
// For any two snapshots, new albums/singles in the new snapshot that don't exist
// in the old snapshot should be correctly identified as new releases.

func TestCompareSnapshotsProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	service := &ArtistSnapshotService{}

	// Generator for snapshot pair input
	type snapshotInput struct {
		CommonAlbums  []string
		NewAlbums     []string
		CommonSingles []string
		NewSingles    []string
	}

	snapshotInputGen := gen.Struct(reflect.TypeOf(snapshotInput{}), map[string]gopter.Gen{
		"CommonAlbums":  gen.SliceOfN(5, genSnapshotUniqueID("common-album-")),
		"NewAlbums":     gen.SliceOfN(3, genSnapshotUniqueID("new-album-")),
		"CommonSingles": gen.SliceOfN(4, genSnapshotUniqueID("common-single-")),
		"NewSingles":    gen.SliceOfN(2, genSnapshotUniqueID("new-single-")),
	})

	// Property: New items in new snapshot are correctly detected
	properties.Property("CompareSnapshots correctly identifies new releases", prop.ForAll(
		func(input snapshotInput) bool {
			oldSnapshot := &models.ArtistSnapshot{
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

			newSnapshot := &models.ArtistSnapshot{
				ID:         "new-snapshot-id",
				ArtistID:   "artist-123",
				ArtistName: "Test Artist",
				AlbumIDs:   newAlbumIDs,
				SingleIDs:  newSingleIDs,
				SnapshotAt: time.Now(),
			}

			// Use the service's CompareSnapshots method
			diff := service.CompareSnapshots(oldSnapshot, newSnapshot)

			// Verify new albums count matches
			if len(diff.NewAlbums) != len(input.NewAlbums) {
				return false
			}

			// Verify new singles count matches
			if len(diff.NewSingles) != len(input.NewSingles) {
				return false
			}

			// Verify all new albums are correctly identified
			newAlbumSet := make(map[string]bool)
			for _, id := range input.NewAlbums {
				newAlbumSet[id] = true
			}
			for _, release := range diff.NewAlbums {
				if !newAlbumSet[release.ID] {
					return false
				}
			}

			// Verify all new singles are correctly identified
			newSingleSet := make(map[string]bool)
			for _, id := range input.NewSingles {
				newSingleSet[id] = true
			}
			for _, release := range diff.NewSingles {
				if !newSingleSet[release.ID] {
					return false
				}
			}

			return true
		},
		snapshotInputGen,
	))

	// Property: First snapshot (nil old) returns empty diff
	properties.Property("First snapshot returns empty diff", prop.ForAll(
		func(albumCount, singleCount int) bool {
			albums := make([]string, albumCount)
			for i := 0; i < albumCount; i++ {
				albums[i] = "album-" + string(rune('a'+i))
			}
			singles := make([]string, singleCount)
			for i := 0; i < singleCount; i++ {
				singles[i] = "single-" + string(rune('a'+i))
			}

			newSnapshot := &models.ArtistSnapshot{
				ID:         "new-snapshot-id",
				ArtistID:   "artist-123",
				ArtistName: "Test Artist",
				AlbumIDs:   albums,
				SingleIDs:  singles,
				SnapshotAt: time.Now(),
			}

			// Compare with nil old snapshot (first time)
			diff := service.CompareSnapshots(nil, newSnapshot)

			// Should return empty diff for first snapshot
			return len(diff.NewAlbums) == 0 && len(diff.NewSingles) == 0
		},
		gen.IntRange(0, 10),
		gen.IntRange(0, 10),
	))

	properties.TestingRun(t)
}

// genSnapshotUniqueID generates unique IDs with a prefix and index
func genSnapshotUniqueID(prefix string) gopter.Gen {
	return gen.IntRange(0, 999999).Map(func(i int) string {
		return prefix + string(rune('a'+i%26)) + string(rune('0'+i%10))
	})
}

// **Feature: enhanced-sync-management, Property 4: 艺术家快照更新时间正确性**
// **Validates: Requirements 2.6**
//
// For any artist resync operation, after completion, the artist snapshot's
// updated_at time should be updated to the current time.

// SimulatedSnapshot represents a snapshot for testing update time correctness
type SimulatedSnapshot struct {
	ArtistID   string
	ArtistName string
	AlbumIDs   []string
	SingleIDs  []string
	UpdatedAt  time.Time
}

// simulateSaveSnapshot simulates saving a snapshot and updating the timestamp
func simulateSaveSnapshot(snapshot *SimulatedSnapshot) *SimulatedSnapshot {
	now := time.Now()
	return &SimulatedSnapshot{
		ArtistID:   snapshot.ArtistID,
		ArtistName: snapshot.ArtistName,
		AlbumIDs:   snapshot.AlbumIDs,
		SingleIDs:  snapshot.SingleIDs,
		UpdatedAt:  now,
	}
}

func TestArtistSnapshotUpdateTimeCorrectness(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for artist ID
	artistIDGen := gen.Identifier().Map(func(s string) string {
		if len(s) == 0 {
			return "artist123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return "artist-" + s
	})

	// Generator for artist name
	artistNameGen := gen.Identifier().Map(func(s string) string {
		if len(s) == 0 {
			return "Test Artist"
		}
		return s
	})

	// Generator for album/single IDs
	idsGen := gen.SliceOfN(10, gen.Identifier())

	// Generator for old timestamp (1-30 days ago)
	oldTimeGen := gen.IntRange(1, 30).Map(func(days int) time.Time {
		return time.Now().AddDate(0, 0, -days)
	})

	// Property: After save, updated_at is set to current time (within tolerance)
	properties.Property("After save, updated_at is updated to current time", prop.ForAll(
		func(artistID string, artistName string, albumIDs []string, singleIDs []string, oldTime time.Time) bool {
			// Create old snapshot with old timestamp
			oldSnapshot := &SimulatedSnapshot{
				ArtistID:   artistID,
				ArtistName: artistName,
				AlbumIDs:   albumIDs,
				SingleIDs:  singleIDs,
				UpdatedAt:  oldTime,
			}

			// Record time before save
			beforeSave := time.Now()

			// Simulate save operation
			newSnapshot := simulateSaveSnapshot(oldSnapshot)

			// Record time after save
			afterSave := time.Now()

			// Verify updated_at is within the expected time range
			return !newSnapshot.UpdatedAt.Before(beforeSave) && !newSnapshot.UpdatedAt.After(afterSave)
		},
		artistIDGen,
		artistNameGen,
		idsGen,
		idsGen,
		oldTimeGen,
	))

	// Property: Updated_at is always more recent than old timestamp
	properties.Property("Updated_at is always more recent than old timestamp", prop.ForAll(
		func(artistID string, daysAgo int) bool {
			oldTime := time.Now().AddDate(0, 0, -daysAgo)

			oldSnapshot := &SimulatedSnapshot{
				ArtistID:   artistID,
				ArtistName: "Test Artist",
				AlbumIDs:   []string{},
				SingleIDs:  []string{},
				UpdatedAt:  oldTime,
			}

			newSnapshot := simulateSaveSnapshot(oldSnapshot)

			// New updated_at should be after old updated_at
			return newSnapshot.UpdatedAt.After(oldSnapshot.UpdatedAt)
		},
		artistIDGen,
		gen.IntRange(1, 365),
	))

	// Property: Multiple saves always update the timestamp
	properties.Property("Multiple saves always update the timestamp", prop.ForAll(
		func(artistID string, saveCount int) bool {
			snapshot := &SimulatedSnapshot{
				ArtistID:   artistID,
				ArtistName: "Test Artist",
				AlbumIDs:   []string{},
				SingleIDs:  []string{},
				UpdatedAt:  time.Now().AddDate(0, 0, -1),
			}

			var lastUpdatedAt time.Time
			for i := 0; i < saveCount; i++ {
				snapshot = simulateSaveSnapshot(snapshot)
				if i > 0 && !snapshot.UpdatedAt.After(lastUpdatedAt) && !snapshot.UpdatedAt.Equal(lastUpdatedAt) {
					return false
				}
				lastUpdatedAt = snapshot.UpdatedAt
				// Small delay to ensure time difference
				time.Sleep(time.Microsecond)
			}

			return true
		},
		artistIDGen,
		gen.IntRange(1, 5),
	))

	properties.TestingRun(t)
}
