package services

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// MetadataCache provides caching for song metadata, lyrics, and artist info
type MetadataCache struct {
	cacheDir string
	mu       sync.RWMutex
	// In-memory cache for frequently accessed data
	memCache    map[string]*CacheEntry
	memCacheMu  sync.RWMutex
	maxMemItems int
}

// CacheEntry represents a cached item with expiration
type CacheEntry struct {
	Data      interface{} `json:"data"`
	ExpiresAt time.Time   `json:"expires_at"`
	CachedAt  time.Time   `json:"cached_at"`
}

// CacheConfig holds cache configuration
type CacheConfig struct {
	Dir            string
	MaxMemoryItems int
	DefaultTTL     time.Duration
}

// NewMetadataCache creates a new metadata cache
func NewMetadataCache(config CacheConfig) (*MetadataCache, error) {
	if config.Dir == "" {
		config.Dir = ".cache/metadata"
	}
	if config.MaxMemoryItems == 0 {
		config.MaxMemoryItems = 1000
	}

	// Create cache directories
	dirs := []string{
		filepath.Join(config.Dir, "songs"),
		filepath.Join(config.Dir, "lyrics"),
		filepath.Join(config.Dir, "artists"),
	}
	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, err
		}
	}

	return &MetadataCache{
		cacheDir:    config.Dir,
		memCache:    make(map[string]*CacheEntry),
		maxMemItems: config.MaxMemoryItems,
	}, nil
}

// getCachePath returns the file path for a cache key
func (c *MetadataCache) getCachePath(category, key string) string {
	return filepath.Join(c.cacheDir, category, key+".json")
}

// Get retrieves an item from cache (memory first, then disk)
func (c *MetadataCache) Get(category, key string, result interface{}) bool {
	cacheKey := category + ":" + key

	// Try memory cache first
	c.memCacheMu.RLock()
	if entry, ok := c.memCache[cacheKey]; ok {
		c.memCacheMu.RUnlock()
		if time.Now().Before(entry.ExpiresAt) {
			// Marshal and unmarshal to copy data
			data, _ := json.Marshal(entry.Data)
			if err := json.Unmarshal(data, result); err == nil {
				return true
			}
		}
	} else {
		c.memCacheMu.RUnlock()
	}

	// Try disk cache
	c.mu.RLock()
	defer c.mu.RUnlock()

	path := c.getCachePath(category, key)
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}

	var entry CacheEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return false
	}

	// Check expiration
	if time.Now().After(entry.ExpiresAt) {
		// Cache expired, remove file
		go os.Remove(path)
		return false
	}

	// Unmarshal the actual data
	dataBytes, _ := json.Marshal(entry.Data)
	if err := json.Unmarshal(dataBytes, result); err != nil {
		return false
	}

	// Store in memory cache for faster access
	c.memCacheMu.Lock()
	if len(c.memCache) < c.maxMemItems {
		c.memCache[cacheKey] = &entry
	}
	c.memCacheMu.Unlock()

	return true
}

// Set stores an item in cache (both memory and disk)
func (c *MetadataCache) Set(category, key string, data interface{}, ttl time.Duration) error {
	cacheKey := category + ":" + key
	now := time.Now()

	entry := &CacheEntry{
		Data:      data,
		ExpiresAt: now.Add(ttl),
		CachedAt:  now,
	}

	// Store in memory cache
	c.memCacheMu.Lock()
	if len(c.memCache) >= c.maxMemItems {
		// Simple eviction: remove oldest entries
		c.evictOldest(100)
	}
	c.memCache[cacheKey] = entry
	c.memCacheMu.Unlock()

	// Store on disk
	c.mu.Lock()
	defer c.mu.Unlock()

	path := c.getCachePath(category, key)
	jsonData, err := json.MarshalIndent(entry, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, jsonData, 0644)
}

// evictOldest removes the oldest entries from memory cache
func (c *MetadataCache) evictOldest(count int) {
	// Simple implementation: just clear some entries
	removed := 0
	for key := range c.memCache {
		if removed >= count {
			break
		}
		delete(c.memCache, key)
		removed++
	}
}

// Delete removes an item from cache
func (c *MetadataCache) Delete(category, key string) {
	cacheKey := category + ":" + key

	c.memCacheMu.Lock()
	delete(c.memCache, cacheKey)
	c.memCacheMu.Unlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	os.Remove(c.getCachePath(category, key))
}

// Clear removes all cached items
func (c *MetadataCache) Clear() error {
	c.memCacheMu.Lock()
	c.memCache = make(map[string]*CacheEntry)
	c.memCacheMu.Unlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	return os.RemoveAll(c.cacheDir)
}

// Stats returns cache statistics
func (c *MetadataCache) Stats() map[string]interface{} {
	c.memCacheMu.RLock()
	memCount := len(c.memCache)
	c.memCacheMu.RUnlock()

	diskCount := 0
	categories := []string{"songs", "lyrics", "artists"}
	for _, cat := range categories {
		dir := filepath.Join(c.cacheDir, cat)
		entries, _ := os.ReadDir(dir)
		diskCount += len(entries)
	}

	return map[string]interface{}{
		"memory_items": memCount,
		"disk_items":   diskCount,
		"cache_dir":    c.cacheDir,
	}
}

// Default TTL values
const (
	SongDetailTTL  = 24 * time.Hour       // Song metadata rarely changes
	LyricsTTL      = 7 * 24 * time.Hour   // Lyrics almost never change
	ArtistTTL      = 365 * 24 * time.Hour // Artist info is updated by sync job, use long TTL
	AlbumDetailTTL = 24 * time.Hour       // Album metadata rarely changes
)

// Global cache instance
var globalCache *MetadataCache
var cacheOnce sync.Once

// GetMetadataCache returns the global metadata cache instance
func GetMetadataCache() *MetadataCache {
	cacheOnce.Do(func() {
		var err error
		globalCache, err = NewMetadataCache(CacheConfig{
			Dir:            ".cache/metadata",
			MaxMemoryItems: 1000,
		})
		if err != nil {
			log.Printf("Failed to create metadata cache: %v", err)
		}
	})
	return globalCache
}

// CacheFileMetadata stores metadata for each cached file
type CacheFileMetadata struct {
	SongID       string    `json:"song_id"`
	Size         int64     `json:"size"`
	CachedAt     time.Time `json:"cached_at"`
	LastAccessed time.Time `json:"last_accessed"`
}

// CacheMetadataStore manages metadata for all cached files
type CacheMetadataStore struct {
	Files map[string]*CacheFileMetadata `json:"files"`
	mu    sync.RWMutex
}

// NewCacheMetadataStore creates a new metadata store
func NewCacheMetadataStore() *CacheMetadataStore {
	return &CacheMetadataStore{
		Files: make(map[string]*CacheFileMetadata),
	}
}

// Get returns metadata for a song
func (s *CacheMetadataStore) Get(songID string) (*CacheFileMetadata, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	meta, ok := s.Files[songID]
	return meta, ok
}

// Set stores metadata for a song
func (s *CacheMetadataStore) Set(songID string, meta *CacheFileMetadata) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Files[songID] = meta
}

// Delete removes metadata for a song
func (s *CacheMetadataStore) Delete(songID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Files, songID)
}

// GetAll returns all metadata entries
func (s *CacheMetadataStore) GetAll() map[string]*CacheFileMetadata {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]*CacheFileMetadata, len(s.Files))
	for k, v := range s.Files {
		result[k] = v
	}
	return result
}

// Clear removes all metadata entries
func (s *CacheMetadataStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Files = make(map[string]*CacheFileMetadata)
}

// Count returns the number of entries
func (s *CacheMetadataStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.Files)
}

// CacheStats holds cache statistics
type CacheStats struct {
	TotalSize      int64   `json:"total_size"`       // Total cache size in bytes
	TotalSizeHuman string  `json:"total_size_human"` // Human-readable format
	FileCount      int     `json:"file_count"`       // Number of files
	OldestFile     string  `json:"oldest_file"`      // Oldest file timestamp
	NewestFile     string  `json:"newest_file"`      // Newest file timestamp
	UsagePercent   float64 `json:"usage_percent"`    // Percentage of max cache size used
}

// CleanupResult holds the result of a cleanup operation
type CleanupResult struct {
	RemovedCount int    `json:"removed_count"`
	RemovedSize  int64  `json:"removed_size"`
	Reason       string `json:"reason"`
}

// FormatBytes converts bytes to human-readable format
func FormatBytes(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
		TB = GB * 1024
	)

	switch {
	case bytes >= TB:
		return fmt.Sprintf("%.2f TB", float64(bytes)/float64(TB))
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.2f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.2f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
