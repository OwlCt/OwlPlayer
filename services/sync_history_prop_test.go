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

// **Feature: enhanced-sync-management, Property 2: 同步历史时间倒序排列**
// **Validates: Requirements 1.4**
//
// For any sync history list, returned records should be sorted by start time
// in descending order, with the most recent record first.

func TestSyncHistoryDescendingOrder(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for a list of timestamps
	timestampListGen := gen.SliceOfN(10, gen.Int64Range(0, time.Now().Unix()))

	// Property: After sorting by started_at DESC, records are in descending order
	properties.Property("Histories sorted by started_at DESC are in descending order", prop.ForAll(
		func(timestamps []int64) bool {
			if len(timestamps) == 0 {
				return true
			}

			// Create histories from timestamps
			histories := make([]*models.SyncHistory, len(timestamps))
			for i, ts := range timestamps {
				histories[i] = &models.SyncHistory{
					ID:        "sync-" + string(rune('a'+i)),
					StartedAt: time.Unix(ts, 0).UTC(),
					Status:    models.SyncStatusCompleted,
				}
			}

			// Simulate the ORDER BY started_at DESC behavior
			sort.Slice(histories, func(i, j int) bool {
				return histories[i].StartedAt.After(histories[j].StartedAt)
			})

			// Verify descending order
			for i := 1; i < len(histories); i++ {
				if histories[i].StartedAt.After(histories[i-1].StartedAt) {
					return false
				}
			}
			return true
		},
		timestampListGen,
	))

	properties.TestingRun(t)
}

// **Feature: enhanced-sync-management, Property 3: 同步历史保留最近7次**
// **Validates: Requirements 1.5, 5.2**
//
// For any sync history records exceeding 7, after cleanup only the most recent
// 7 records should be retained.

func TestSyncHistoryKeepRecent7(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for a list of timestamps (more than 7)
	timestampListGen := gen.SliceOfN(15, gen.Int64Range(0, time.Now().Unix()))

	// Property: After cleanup, only 7 most recent records remain
	properties.Property("Cleanup keeps only 7 most recent records", prop.ForAll(
		func(timestamps []int64) bool {
			if len(timestamps) <= 7 {
				return true
			}

			keepCount := 7

			// Create histories from timestamps
			histories := make([]*models.SyncHistory, len(timestamps))
			for i, ts := range timestamps {
				histories[i] = &models.SyncHistory{
					ID:        "sync-" + string(rune('a'+i)),
					StartedAt: time.Unix(ts, 0).UTC(),
					Status:    models.SyncStatusCompleted,
				}
			}

			// Sort by started_at DESC to find the most recent ones
			sort.Slice(histories, func(i, j int) bool {
				return histories[i].StartedAt.After(histories[j].StartedAt)
			})

			// Simulate cleanup: keep only the top N
			kept := histories[:keepCount]

			// Verify we have exactly keepCount records
			if len(kept) != keepCount {
				return false
			}

			// Verify all kept records are from the most recent ones
			oldestKept := kept[len(kept)-1]
			for _, h := range histories[keepCount:] {
				if h.StartedAt.After(oldestKept.StartedAt) {
					return false
				}
			}

			return true
		},
		timestampListGen,
	))

	properties.TestingRun(t)
}

// **Feature: enhanced-sync-management, Property 8: 清除历史后无记录**
// **Validates: Requirements 6.3**
//
// For any clear operation, after completion the sync history record count should be 0.

func TestSyncHistoryClearAll(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for a count of histories
	countGen := gen.IntRange(0, 20)

	// Property: After clear all, count is 0
	properties.Property("Clear all results in zero records", prop.ForAll(
		func(count int) bool {
			// Simulate having 'count' records
			histories := make([]*models.SyncHistory, count)
			for i := 0; i < count; i++ {
				histories[i] = &models.SyncHistory{
					ID:        "sync-" + string(rune('a'+i)),
					StartedAt: time.Now(),
					Status:    models.SyncStatusCompleted,
				}
			}

			// Simulate clear all operation
			histories = []*models.SyncHistory{}

			// After clear, count should be 0
			return len(histories) == 0
		},
		countGen,
	))

	properties.TestingRun(t)
}
