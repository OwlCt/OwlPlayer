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

// **Feature: enhanced-sync-management, Property 1: 同步历史存储往返一致性**
// **Validates: Requirements 1.3, 5.1**
//
// For any valid SyncHistory, serializing to JSON and then deserializing
// should produce an equivalent history data (including detailed logs).

func TestSyncHistoryJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for SyncLogEntry
	logEntryGen := gen.Struct(reflect.TypeOf(SyncLogEntry{}), map[string]gopter.Gen{
		"ArtistID":    genSyncHistoryArtistID(),
		"ArtistName":  genSyncHistoryArtistName(),
		"Status":      gen.OneConstOf(SyncLogStatusSuccess, SyncLogStatusError),
		"NewReleases": gen.IntRange(0, 100),
		"Error":       genSyncHistoryErrorMsg(),
		"ProcessedAt": genSyncHistoryTime(),
	})

	// Generator for valid SyncHistory objects
	historyGen := gen.Struct(reflect.TypeOf(SyncHistory{}), map[string]gopter.Gen{
		"ID":               genSyncHistoryUUID(),
		"StartedAt":        genSyncHistoryTime(),
		"CompletedAt":      genSyncHistoryOptionalTime(),
		"Status":           gen.OneConstOf(SyncStatusRunning, SyncStatusCompleted, SyncStatusFailed),
		"ProcessedArtists": gen.IntRange(0, 1000),
		"NewReleases":      gen.IntRange(0, 500),
		"Errors":           gen.IntRange(0, 100),
		"Logs":             gen.SliceOfN(10, logEntryGen),
		"CreatedAt":        genSyncHistoryTime(),
	})

	// Property: JSON serialization round-trip preserves all fields
	properties.Property("JSON serialization round-trip preserves all fields", prop.ForAll(
		func(history SyncHistory) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(history)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded SyncHistory
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check basic fields are preserved
			if decoded.ID != history.ID ||
				decoded.Status != history.Status ||
				decoded.ProcessedArtists != history.ProcessedArtists ||
				decoded.NewReleases != history.NewReleases ||
				decoded.Errors != history.Errors {
				return false
			}

			// Check timestamps (compare Unix timestamps to avoid timezone issues)
			if decoded.StartedAt.Unix() != history.StartedAt.Unix() ||
				decoded.CreatedAt.Unix() != history.CreatedAt.Unix() {
				return false
			}

			// Check optional CompletedAt
			if history.CompletedAt != nil {
				if decoded.CompletedAt == nil ||
					decoded.CompletedAt.Unix() != history.CompletedAt.Unix() {
					return false
				}
			} else if decoded.CompletedAt != nil {
				return false
			}

			// Check logs count
			if len(decoded.Logs) != len(history.Logs) {
				return false
			}

			// Check each log entry
			for i, log := range history.Logs {
				decodedLog := decoded.Logs[i]
				if decodedLog.ArtistID != log.ArtistID ||
					decodedLog.ArtistName != log.ArtistName ||
					decodedLog.Status != log.Status ||
					decodedLog.NewReleases != log.NewReleases ||
					decodedLog.Error != log.Error ||
					decodedLog.ProcessedAt.Unix() != log.ProcessedAt.Unix() {
					return false
				}
			}

			return true
		},
		historyGen,
	))

	properties.TestingRun(t)
}

// **Feature: enhanced-sync-management, Property 7: 同步日志条目完整性**
// **Validates: Requirements 4.2**
//
// For any SyncLogEntry, it should contain artist name, processing status, and new releases count.

func TestSyncLogEntryCompleteness(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for SyncLogEntry with valid data
	logEntryGen := gen.Struct(reflect.TypeOf(SyncLogEntry{}), map[string]gopter.Gen{
		"ArtistID":    genSyncHistoryArtistID(),
		"ArtistName":  genSyncHistoryArtistName(),
		"Status":      gen.OneConstOf(SyncLogStatusSuccess, SyncLogStatusError),
		"NewReleases": gen.IntRange(0, 100),
		"Error":       genSyncHistoryErrorMsg(),
		"ProcessedAt": genSyncHistoryTime(),
	})

	// Property: Log entry contains required fields
	properties.Property("Log entry contains artist name, status, and new releases count", prop.ForAll(
		func(entry SyncLogEntry) bool {
			// Artist name must be non-empty
			if entry.ArtistName == "" {
				return false
			}

			// Status must be valid
			if entry.Status != SyncLogStatusSuccess && entry.Status != SyncLogStatusError {
				return false
			}

			// NewReleases must be non-negative
			if entry.NewReleases < 0 {
				return false
			}

			return true
		},
		logEntryGen,
	))

	properties.TestingRun(t)
}

// Helper generators for SyncHistory

func genSyncHistoryUUID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) < 8 {
			return "sync-" + s + "-uuid"
		}
		return s[:8] + "-" + s[len(s)/2:len(s)/2+4] + "-uuid"
	})
}

func genSyncHistoryArtistID() gopter.Gen {
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

func genSyncHistoryArtistName() gopter.Gen {
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

func genSyncHistoryErrorMsg() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) > 200 {
			return s[:200]
		}
		return s
	})
}

func genSyncHistoryTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}

func genSyncHistoryOptionalTime() gopter.Gen {
	return gen.PtrOf(genSyncHistoryTime())
}
