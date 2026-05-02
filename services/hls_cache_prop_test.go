package services

import (
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for HLS Cache
// =============================================================================

// genHLSCacheMetadata generates random HLS cache metadata
func genHLSCacheMetadata(songID string) gopter.Gen {
	return gopter.CombineGens(
		gen.Int64Range(1024, 50*1024*1024),    // TotalSize: 1KB to 50MB
		gen.IntRange(1, 100),                   // SegmentCount: 1 to 100
		gen.Int64Range(0, 30*24*60*60),         // CachedAt offset in seconds (0 to 30 days ago)
		gen.Int64Range(0, 14*24*60*60),         // LastAccessed offset in seconds (0 to 14 days ago)
	).Map(func(vals []interface{}) *HLSCacheMetadata {
		now := time.Now()
		cachedAtOffset := time.Duration(vals[2].(int64)) * time.Second
		lastAccessedOffset := time.Duration(vals[3].(int64)) * time.Second

		return &HLSCacheMetadata{
			SongID:       songID,
			TotalSize:    vals[0].(int64),
			SegmentCount: vals[1].(int),
			CachedAt:     now.Add(-cachedAtOffset),
			LastAccessed: now.Add(-lastAccessedOffset),
		}
	})
}

// genHLSCacheMetadataList generates a list of HLS cache metadata entries
func genHLSCacheMetadataList(minCount, maxCount int) gopter.Gen {
	return gen.IntRange(minCount, maxCount).FlatMap(func(count interface{}) gopter.Gen {
		n := count.(int)
		gens := make([]gopter.Gen, n)
		for i := 0; i < n; i++ {
			songID := genHLSSongID(i)
			gens[i] = genHLSCacheMetadata(songID)
		}
		return gopter.CombineGens(gens...).Map(func(vals []interface{}) []*HLSCacheMetadata {
			result := make([]*HLSCacheMetadata, len(vals))
			for i, v := range vals {
				result[i] = v.(*HLSCacheMetadata)
			}
			return result
		})
	}, reflect.TypeOf([]*HLSCacheMetadata{}))
}

// genHLSSongID generates a song ID based on index for HLS tests
func genHLSSongID(index int) string {
	return "hls_song_" + string(rune('a'+index%26)) + string(rune('0'+index/26))
}

// =============================================================================
// Mock HLS Cache for Property Tests
// =============================================================================

// MockHLSCache simulates HLS cache for testing cleanup logic
type MockHLSCache struct {
	metadata *HLSCacheMetadataStore
	settings *HLSCacheSettings
}

// NewMockHLSCache creates a new mock HLS cache
func NewMockHLSCache(settings *HLSCacheSettings) *MockHLSCache {
	return &MockHLSCache{
		metadata: NewHLSCacheMetadataStore(),
		settings: settings,
	}
}

// AddEntry adds a metadata entry to the mock cache
func (c *MockHLSCache) AddEntry(meta *HLSCacheMetadata) {
	c.metadata.Set(meta.SongID, meta)
}

// GetTotalSize returns total size of all entries
func (c *MockHLSCache) GetTotalSize() int64 {
	var total int64
	for _, meta := range c.metadata.GetAll() {
		total += meta.TotalSize
	}
	return total
}

// RunCleanup simulates the cleanup logic
func (c *MockHLSCache) RunCleanup() (removedByAge, removedByIdle, removedByLRU []*HLSCacheMetadata) {
	now := time.Now()
	allMeta := c.metadata.GetAll()
	toRemove := make(map[string]*HLSCacheMetadata)

	// 1. Remove by age
	maxAge := time.Duration(c.settings.MaxCacheAge) * time.Second
	for songID, meta := range allMeta {
		if now.Sub(meta.CachedAt) > maxAge {
			toRemove[songID] = meta
			removedByAge = append(removedByAge, meta)
		}
	}

	// 2. Remove by idle
	idleExpiry := time.Duration(c.settings.IdleExpiryTime) * time.Second
	for songID, meta := range allMeta {
		if _, alreadyMarked := toRemove[songID]; alreadyMarked {
			continue
		}
		if now.Sub(meta.LastAccessed) > idleExpiry {
			toRemove[songID] = meta
			removedByIdle = append(removedByIdle, meta)
		}
	}

	// Remove marked entries
	for songID := range toRemove {
		c.metadata.Delete(songID)
		delete(allMeta, songID)
	}

	// 3. Remove by LRU if over size
	var totalSize int64
	for _, meta := range allMeta {
		totalSize += meta.TotalSize
	}

	if totalSize > c.settings.MaxCacheSize {
		// Sort by last_accessed (oldest first)
		type entry struct {
			songID string
			meta   *HLSCacheMetadata
		}
		var entries []entry
		for songID, meta := range allMeta {
			entries = append(entries, entry{songID, meta})
		}
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].meta.LastAccessed.Before(entries[j].meta.LastAccessed)
		})

		for _, e := range entries {
			if totalSize <= c.settings.MaxCacheSize {
				break
			}
			c.metadata.Delete(e.songID)
			totalSize -= e.meta.TotalSize
			removedByLRU = append(removedByLRU, e.meta)
		}
	}

	return
}

// GetRemainingEntries returns all remaining entries after cleanup
func (c *MockHLSCache) GetRemainingEntries() map[string]*HLSCacheMetadata {
	return c.metadata.GetAll()
}

// =============================================================================
// Property Tests for HLS Cache Cleanup
// =============================================================================

// **Feature: idle-precache-hls, Property 7: HLS Cache Cleanup - LRU Eviction**
// **Validates: Requirements 3.4**
func TestProperty_HLSCacheCleanup_LRUEviction(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: After LRU cleanup, total size is at or below max_cache_size
	properties.Property("LRU cleanup brings size under limit", prop.ForAll(
		func(metaList []*HLSCacheMetadata, maxCacheSize int64) bool {
			if len(metaList) == 0 {
				return true
			}

			settings := &HLSCacheSettings{
				MaxCacheSize:   maxCacheSize,
				MaxCacheAge:    365 * 24 * 60 * 60, // 1 year (effectively disabled)
				IdleExpiryTime: 365 * 24 * 60 * 60, // 1 year (effectively disabled)
			}

			cache := NewMockHLSCache(settings)
			for _, meta := range metaList {
				cache.AddEntry(meta)
			}

			cache.RunCleanup()

			// After cleanup, total size should be at or below max
			return cache.GetTotalSize() <= maxCacheSize
		},
		genHLSCacheMetadataList(1, 20),
		gen.Int64Range(10*1024*1024, 100*1024*1024), // 10MB to 100MB max size
	))

	// Property: LRU eviction removes oldest accessed files first
	properties.Property("LRU eviction removes oldest accessed first", prop.ForAll(
		func(metaList []*HLSCacheMetadata) bool {
			if len(metaList) < 2 {
				return true
			}

			// Set max size to force some eviction
			var totalSize int64
			for _, meta := range metaList {
				totalSize += meta.TotalSize
			}
			maxCacheSize := totalSize / 2 // Force eviction of about half

			settings := &HLSCacheSettings{
				MaxCacheSize:   maxCacheSize,
				MaxCacheAge:    365 * 24 * 60 * 60,
				IdleExpiryTime: 365 * 24 * 60 * 60,
			}

			cache := NewMockHLSCache(settings)
			for _, meta := range metaList {
				cache.AddEntry(meta)
			}

			_, _, removedByLRU := cache.RunCleanup()
			remaining := cache.GetRemainingEntries()

			// All removed entries should have older LastAccessed than remaining entries
			for _, removed := range removedByLRU {
				for _, kept := range remaining {
					// Removed entry should not have newer LastAccessed than kept entry
					if removed.LastAccessed.After(kept.LastAccessed) {
						return false
					}
				}
			}

			return true
		},
		genHLSCacheMetadataList(3, 15),
	))

	properties.TestingRun(t)
}

// **Feature: idle-precache-hls, Property 8: HLS Cache Cleanup - Age and Idle Expiry**
// **Validates: Requirements 3.5, 3.6**
func TestProperty_HLSCacheCleanup_AgeAndIdleExpiry(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Entries exceeding max_cache_age are removed
	properties.Property("age expired entries are removed", prop.ForAll(
		func(metaList []*HLSCacheMetadata, maxAgeSeconds int64) bool {
			if len(metaList) == 0 {
				return true
			}

			settings := &HLSCacheSettings{
				MaxCacheSize:   1024 * 1024 * 1024 * 1024, // 1TB (effectively unlimited)
				MaxCacheAge:    maxAgeSeconds,
				IdleExpiryTime: 365 * 24 * 60 * 60, // 1 year (effectively disabled)
			}

			cache := NewMockHLSCache(settings)
			for _, meta := range metaList {
				cache.AddEntry(meta)
			}

			removedByAge, _, _ := cache.RunCleanup()
			remaining := cache.GetRemainingEntries()
			now := time.Now()
			maxAge := time.Duration(maxAgeSeconds) * time.Second

			// All removed by age should have exceeded max age
			for _, removed := range removedByAge {
				if now.Sub(removed.CachedAt) <= maxAge {
					return false
				}
			}

			// All remaining should not have exceeded max age
			for _, kept := range remaining {
				if now.Sub(kept.CachedAt) > maxAge {
					return false
				}
			}

			return true
		},
		genHLSCacheMetadataList(1, 15),
		gen.Int64Range(1*24*60*60, 30*24*60*60), // 1 to 30 days
	))

	// Property: Entries exceeding idle_expiry_time are removed
	properties.Property("idle expired entries are removed", prop.ForAll(
		func(metaList []*HLSCacheMetadata, idleExpirySeconds int64) bool {
			if len(metaList) == 0 {
				return true
			}

			settings := &HLSCacheSettings{
				MaxCacheSize:   1024 * 1024 * 1024 * 1024, // 1TB (effectively unlimited)
				MaxCacheAge:    365 * 24 * 60 * 60,        // 1 year (effectively disabled)
				IdleExpiryTime: idleExpirySeconds,
			}

			cache := NewMockHLSCache(settings)
			for _, meta := range metaList {
				cache.AddEntry(meta)
			}

			_, removedByIdle, _ := cache.RunCleanup()
			remaining := cache.GetRemainingEntries()
			now := time.Now()
			idleExpiry := time.Duration(idleExpirySeconds) * time.Second

			// All removed by idle should have exceeded idle expiry
			for _, removed := range removedByIdle {
				if now.Sub(removed.LastAccessed) <= idleExpiry {
					return false
				}
			}

			// All remaining should not have exceeded idle expiry
			for _, kept := range remaining {
				if now.Sub(kept.LastAccessed) > idleExpiry {
					return false
				}
			}

			return true
		},
		genHLSCacheMetadataList(1, 15),
		gen.Int64Range(1*24*60*60, 14*24*60*60), // 1 to 14 days
	))

	properties.TestingRun(t)
}
