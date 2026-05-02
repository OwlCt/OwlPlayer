package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// HLSCacheMetadata stores metadata for each cached HLS song
type HLSCacheMetadata struct {
	SongID        string    `json:"song_id"`
	Variant       string    `json:"variant,omitempty"`
	TotalSize     int64     `json:"total_size"`    // Total size of all segments
	SegmentCount  int       `json:"segment_count"` // Number of segments
	CachedAt      time.Time `json:"cached_at"`
	LastAccessed  time.Time `json:"last_accessed"`
	FormatVersion int       `json:"format_version,omitempty"`
}

// HLSCacheMetadataStore manages metadata for all cached HLS files
type HLSCacheMetadataStore struct {
	Files map[string]*HLSCacheMetadata `json:"files"`
	mu    sync.RWMutex
}

// NewHLSCacheMetadataStore creates a new HLS metadata store
func NewHLSCacheMetadataStore() *HLSCacheMetadataStore {
	return &HLSCacheMetadataStore{
		Files: make(map[string]*HLSCacheMetadata),
	}
}

// Get returns metadata for a song
func (s *HLSCacheMetadataStore) Get(songID string) (*HLSCacheMetadata, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	meta, ok := s.Files[songID]
	return meta, ok
}

// Set stores metadata for a song
func (s *HLSCacheMetadataStore) Set(songID string, meta *HLSCacheMetadata) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Files[songID] = meta
}

// Delete removes metadata for a song
func (s *HLSCacheMetadataStore) Delete(songID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.Files, songID)
}

// GetAll returns all metadata entries
func (s *HLSCacheMetadataStore) GetAll() map[string]*HLSCacheMetadata {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]*HLSCacheMetadata, len(s.Files))
	for k, v := range s.Files {
		result[k] = v
	}
	return result
}

// Clear removes all metadata entries
func (s *HLSCacheMetadataStore) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.Files = make(map[string]*HLSCacheMetadata)
}

// Count returns the number of entries
func (s *HLSCacheMetadataStore) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.Files)
}

// HLSCacheStats holds HLS cache statistics
type HLSCacheStats struct {
	TotalSize      int64   `json:"total_size"`       // Total cache size in bytes
	TotalSizeHuman string  `json:"total_size_human"` // Human-readable format
	SongCount      int     `json:"song_count"`       // Number of songs
	SegmentCount   int     `json:"segment_count"`    // Total number of segments
	OldestFile     string  `json:"oldest_file"`      // Oldest file timestamp
	NewestFile     string  `json:"newest_file"`      // Newest file timestamp
	UsagePercent   float64 `json:"usage_percent"`    // Usage as percentage of max size
}

// HLSCleanupResult holds the result of an HLS cleanup operation
type HLSCleanupResult struct {
	RemovedCount int    `json:"removed_count"`
	RemovedSize  int64  `json:"removed_size"`
	Reason       string `json:"reason"`
}

// HLSCacheService manages HLS segment cache
type HLSCacheService struct {
	hlsDir          string
	tempDir         string
	metadata        *HLSCacheMetadataStore
	metadataPath    string
	settings        *HLSCacheSettings
	settingsService *SystemSettingsService
	resolvedVariant map[string]localHLSVariantResolution
	mu              sync.RWMutex
}

type hlsVariant struct {
	key              string
	cacheSuffix      string
	segmentExtension string
	segmentMimeType  string
	initFilename     string
	formatVersion    int
}

var (
	hlsVariantAAC256 = hlsVariant{
		key:              "aac_256",
		cacheSuffix:      "",
		segmentExtension: ".ts",
		segmentMimeType:  "video/mp2t",
		formatVersion:    4,
	}
	hlsVariantAAC320 = hlsVariant{
		key:              "aac_320",
		cacheSuffix:      "aac_320",
		segmentExtension: ".ts",
		segmentMimeType:  "video/mp2t",
		formatVersion:    4,
	}
	hlsVariantAAC192 = hlsVariant{
		key:              "aac_192",
		cacheSuffix:      "aac_192",
		segmentExtension: ".ts",
		segmentMimeType:  "video/mp2t",
		formatVersion:    4,
	}
	hlsVariantLossless = hlsVariant{
		key:              "lossless",
		cacheSuffix:      "lossless",
		segmentExtension: ".m4s",
		segmentMimeType:  "audio/mp4",
		initFilename:     "init.mp4",
		formatVersion:    6,
	}
)

var allHLSVariants = []hlsVariant{
	hlsVariantAAC256,
	hlsVariantAAC320,
	hlsVariantAAC192,
	hlsVariantLossless,
}

func resolveHLSVariant(raw string) (hlsVariant, error) {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "", "aac", "aac_256", "default":
		return hlsVariantAAC256, nil
	case "aac_320":
		return hlsVariantAAC320, nil
	case "aac_192":
		return hlsVariantAAC192, nil
	case "lossless":
		return hlsVariantLossless, nil
	default:
		return hlsVariant{}, ErrInvalidPlaybackOption
	}
}

func resolveHLSVariantFromDirName(name string) (string, hlsVariant) {
	for _, variant := range allHLSVariants {
		if variant.cacheSuffix == "" {
			continue
		}
		suffix := "__" + variant.cacheSuffix
		if strings.HasSuffix(name, suffix) {
			return strings.TrimSuffix(name, suffix), variant
		}
	}

	return name, hlsVariantAAC256
}

func buildHLSConvertArgs(audioPath string, variant hlsVariant, segmentPattern string, playlistPath string) []string {
	args := []string{
		"-i", audioPath,
		"-map_metadata", "-1",
		"-map", "0:a:0",
		"-vn",
		"-sn",
		"-dn",
	}

	switch variant.key {
	case hlsVariantLossless.key:
		args = append(args,
			"-c:a", "flac",
			"-hls_time", "10",
			"-hls_list_size", "0",
			"-hls_playlist_type", "vod",
			"-hls_segment_type", "fmp4",
			"-hls_fmp4_init_filename", variant.initFilename,
			"-hls_segment_filename", segmentPattern,
			"-f", "hls",
			playlistPath,
		)
	case hlsVariantAAC320.key:
		args = append(args,
			"-c:a", "aac",
			"-b:a", "320k",
			"-hls_time", "10",
			"-hls_list_size", "0",
			"-hls_playlist_type", "vod",
			"-hls_segment_type", "mpegts",
			"-hls_segment_filename", segmentPattern,
			"-f", "hls",
			playlistPath,
		)
	case hlsVariantAAC192.key:
		args = append(args,
			"-c:a", "aac",
			"-b:a", "192k",
			"-hls_time", "10",
			"-hls_list_size", "0",
			"-hls_playlist_type", "vod",
			"-hls_segment_type", "mpegts",
			"-hls_segment_filename", segmentPattern,
			"-f", "hls",
			playlistPath,
		)
	default:
		args = append(args,
			"-c:a", "aac",
			"-b:a", "256k",
			"-hls_time", "10",
			"-hls_list_size", "0",
			"-hls_playlist_type", "vod",
			"-hls_segment_type", "mpegts",
			"-hls_segment_filename", segmentPattern,
			"-f", "hls",
			playlistPath,
		)
	}

	return args
}

// NewHLSCacheService creates a new HLS cache service
func NewHLSCacheService(hlsDir string, settingsService *SystemSettingsService) (*HLSCacheService, error) {
	if hlsDir == "" {
		hlsDir = ".cache/hls"
	}

	tempDir := filepath.Join(hlsDir, ".temp")

	// Create directories
	if err := os.MkdirAll(hlsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create HLS cache directory: %w", err)
	}
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create HLS temp directory: %w", err)
	}

	service := &HLSCacheService{
		hlsDir:          hlsDir,
		tempDir:         tempDir,
		metadata:        NewHLSCacheMetadataStore(),
		metadataPath:    filepath.Join(hlsDir, "metadata.json"),
		settings:        DefaultHLSCacheSettings(),
		settingsService: settingsService,
		resolvedVariant: make(map[string]localHLSVariantResolution),
	}

	// Load existing metadata
	if err := service.LoadMetadata(); err != nil {
		log.Printf("Failed to load HLS cache metadata: %v", err)
	}

	// Load settings from database
	if settingsService != nil {
		ctx := context.Background()
		if settings, err := settingsService.GetHLSCacheSettings(ctx); err == nil {
			service.settings = settings
		}
	}

	// Sync metadata with actual files on disk
	service.syncMetadataWithDisk()

	return service, nil
}

// LoadMetadata loads HLS cache metadata from disk
func (s *HLSCacheService) LoadMetadata() error {
	data, err := os.ReadFile(s.metadataPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // No metadata file yet
		}
		return fmt.Errorf("failed to read HLS metadata file: %w", err)
	}

	var store HLSCacheMetadataStore
	if err := json.Unmarshal(data, &store); err != nil {
		return fmt.Errorf("failed to parse HLS metadata file: %w", err)
	}

	s.metadata.mu.Lock()
	s.metadata.Files = store.Files
	if s.metadata.Files == nil {
		s.metadata.Files = make(map[string]*HLSCacheMetadata)
	}
	s.metadata.mu.Unlock()

	return nil
}

// SaveMetadata saves HLS cache metadata to disk
func (s *HLSCacheService) SaveMetadata() error {
	s.metadata.mu.RLock()
	data, err := json.MarshalIndent(s.metadata, "", "  ")
	s.metadata.mu.RUnlock()

	if err != nil {
		return fmt.Errorf("failed to marshal HLS metadata: %w", err)
	}

	// Use a temporary file for atomic write
	tempPath := s.metadataPath + ".tmp"
	if err := os.WriteFile(tempPath, data, 0644); err != nil {
		// Fallback: write directly if temp file fails
		if err := os.WriteFile(s.metadataPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write HLS metadata file: %w", err)
		}
		return nil
	}

	// Atomic rename
	if err := os.Rename(tempPath, s.metadataPath); err != nil {
		os.Remove(tempPath) // Clean up temp file on failure
		// Fallback: write directly
		if err := os.WriteFile(s.metadataPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write HLS metadata file: %w", err)
		}
		return nil
	}

	return nil
}

// syncMetadataWithDisk synchronizes metadata with actual HLS directories on disk
func (s *HLSCacheService) syncMetadataWithDisk() {
	entries, err := os.ReadDir(s.hlsDir)
	if err != nil {
		log.Printf("Failed to read HLS cache directory for sync: %v", err)
		return
	}

	// Track which cache keys exist on disk
	existingCacheKeys := make(map[string]bool)

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		name := entry.Name()
		// Skip temp directory and hidden directories
		if name == ".temp" || name[0] == '.' {
			continue
		}

		songID, variant := resolveHLSVariantFromDirName(name)
		// If metadata doesn't exist for this song, create it
		cacheKey := s.cacheKey(songID, variant)
		existingCacheKeys[cacheKey] = true
		if _, exists := s.metadata.Get(cacheKey); !exists {
			songDir := filepath.Join(s.hlsDir, name)
			totalSize, segmentCount := s.calculateDirStats(songDir)

			info, err := entry.Info()
			cachedAt := time.Now()
			if err == nil {
				cachedAt = info.ModTime()
			}

			s.metadata.Set(cacheKey, &HLSCacheMetadata{
				SongID:        songID,
				Variant:       variant.key,
				TotalSize:     totalSize,
				SegmentCount:  segmentCount,
				CachedAt:      cachedAt,
				LastAccessed:  cachedAt,
				FormatVersion: variant.formatVersion,
			})
		}
	}

	// Remove metadata for songs that no longer exist
	allMeta := s.metadata.GetAll()
	for cacheKey := range allMeta {
		if !existingCacheKeys[cacheKey] {
			s.metadata.Delete(cacheKey)
		}
	}

	// Save updated metadata
	if err := s.SaveMetadata(); err != nil {
		log.Printf("Failed to save synced HLS metadata: %v", err)
	}
}

// calculateDirStats calculates total size and segment count for a song directory
func (s *HLSCacheService) calculateDirStats(songDir string) (int64, int) {
	var totalSize int64
	var segmentCount int

	entries, err := os.ReadDir(songDir)
	if err != nil {
		return 0, 0
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			continue
		}

		totalSize += info.Size()

		switch filepath.Ext(entry.Name()) {
		case ".ts", ".m4s":
			segmentCount++
		}
	}

	return totalSize, segmentCount
}

// Exists checks if HLS cache exists for a song
func (s *HLSCacheService) Exists(songID string) bool {
	return s.ExistsVariant(songID, hlsVariantAAC256)
}

func (s *HLSCacheService) ExistsVariant(songID string, variant hlsVariant) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	songDir := s.getVariantPath(songID, variant)
	if !variantArtifactsReady(songDir, variant) {
		return false
	}

	meta, ok := s.metadata.Get(s.cacheKey(songID, variant))
	if !ok {
		return false
	}

	return meta.FormatVersion >= variant.formatVersion
}

// GetPath returns the HLS cache directory path for a song
func (s *HLSCacheService) GetPath(songID string) string {
	return s.getVariantPath(songID, hlsVariantAAC256)
}

func (s *HLSCacheService) GetVariantPath(songID string, variant hlsVariant) string {
	return s.getVariantPath(songID, variant)
}

func variantArtifactsReady(songDir string, variant hlsVariant) bool {
	info, err := os.Stat(songDir)
	if err != nil || !info.IsDir() {
		return false
	}

	playlistPath := filepath.Join(songDir, "playlist.m3u8")
	playlistInfo, err := os.Stat(playlistPath)
	if err != nil || playlistInfo.Size() == 0 {
		return false
	}

	if variant.initFilename != "" {
		initPath := filepath.Join(songDir, variant.initFilename)
		initInfo, err := os.Stat(initPath)
		if err != nil || initInfo.Size() == 0 {
			return false
		}
	}

	matches, err := filepath.Glob(filepath.Join(songDir, "segment*"+variant.segmentExtension))
	if err != nil || len(matches) == 0 {
		return false
	}

	return true
}

func (s *HLSCacheService) getVariantPath(songID string, variant hlsVariant) string {
	return filepath.Join(s.hlsDir, s.cacheKey(songID, variant))
}

func (s *HLSCacheService) cacheKey(songID string, variant hlsVariant) string {
	if variant.cacheSuffix == "" {
		return songID
	}
	return songID + "__" + variant.cacheSuffix
}

// Delete removes HLS cache for a song
func (s *HLSCacheService) Delete(songID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for _, variant := range allHLSVariants {
		songDir := s.getVariantPath(songID, variant)
		if err := os.RemoveAll(songDir); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to remove HLS cache for %s (%s): %w", songID, variant.key, err)
		}
		s.metadata.Delete(s.cacheKey(songID, variant))
	}
	delete(s.resolvedVariant, songID)

	// Save metadata asynchronously
	go func() {
		if err := s.SaveMetadata(); err != nil {
			log.Printf("Failed to save HLS metadata after delete: %v", err)
		}
	}()

	return nil
}

func (s *HLSCacheService) DeleteVariant(songID string, variant hlsVariant) error {
	if s == nil {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	songDir := s.getVariantPath(songID, variant)
	if err := os.RemoveAll(songDir); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove HLS cache for %s (%s): %w", songID, variant.key, err)
	}
	s.metadata.Delete(s.cacheKey(songID, variant))

	if bound, ok := s.resolvedVariant[songID]; ok && bound.actualVariant.key == variant.key {
		delete(s.resolvedVariant, songID)
	}

	if err := s.SaveMetadata(); err != nil {
		log.Printf("Failed to save HLS metadata after variant delete: %v", err)
	}

	return nil
}

func (s *HLSCacheService) BindResolvedVariant(songID string, resolution localHLSVariantResolution) {
	if s == nil {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.resolvedVariant == nil {
		s.resolvedVariant = make(map[string]localHLSVariantResolution)
	}
	s.resolvedVariant[songID] = resolution
}

func (s *HLSCacheService) GetResolvedVariant(songID string) (localHLSVariantResolution, bool) {
	if s == nil {
		return localHLSVariantResolution{}, false
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	if s.resolvedVariant == nil {
		return localHLSVariantResolution{}, false
	}

	resolution, ok := s.resolvedVariant[songID]
	return resolution, ok
}

// GetStats returns HLS cache statistics
func (s *HLSCacheService) GetStats() *HLSCacheStats {
	s.mu.RLock()
	defer s.mu.RUnlock()

	stats := &HLSCacheStats{}

	allMeta := s.metadata.GetAll()
	stats.SongCount = len(allMeta)

	var oldestTime, newestTime time.Time
	for _, meta := range allMeta {
		stats.TotalSize += meta.TotalSize
		stats.SegmentCount += meta.SegmentCount

		if oldestTime.IsZero() || meta.CachedAt.Before(oldestTime) {
			oldestTime = meta.CachedAt
		}
		if newestTime.IsZero() || meta.CachedAt.After(newestTime) {
			newestTime = meta.CachedAt
		}
	}

	stats.TotalSizeHuman = FormatBytes(stats.TotalSize)

	if !oldestTime.IsZero() {
		stats.OldestFile = oldestTime.Format(time.RFC3339)
	}
	if !newestTime.IsZero() {
		stats.NewestFile = newestTime.Format(time.RFC3339)
	}

	// Calculate usage percentage
	if s.settings.MaxCacheSize > 0 {
		stats.UsagePercent = float64(stats.TotalSize) / float64(s.settings.MaxCacheSize) * 100
		if stats.UsagePercent > 100 {
			stats.UsagePercent = 100
		}
	}

	return stats
}

// GetSettings returns current HLS cache settings
func (s *HLSCacheService) GetSettings() *HLSCacheSettings {
	// If we have a settings service, read from database to ensure we have the latest
	if s.settingsService != nil {
		ctx := context.Background()
		if settings, err := s.settingsService.GetHLSCacheSettings(ctx); err == nil {
			// Update in-memory settings if they differ
			if settings.MaxCacheSize != s.settings.MaxCacheSize ||
				settings.MaxCacheAge != s.settings.MaxCacheAge ||
				settings.IdleExpiryTime != s.settings.IdleExpiryTime {
				s.settings = settings
			}
			return settings
		}
	}
	return s.settings
}

// UpdateSettings updates HLS cache settings
func (s *HLSCacheService) UpdateSettings(settings *HLSCacheSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}

	s.settings = settings

	// Persist to database if settings service is available
	if s.settingsService != nil {
		ctx := context.Background()
		if err := s.settingsService.SetHLSCacheSettings(ctx, settings); err != nil {
			return fmt.Errorf("failed to persist HLS settings: %w", err)
		}
	}

	return nil
}

// UpdateAccessTime updates the last access time for a cached HLS song
func (s *HLSCacheService) UpdateAccessTime(songID string) error {
	return s.UpdateAccessTimeVariant(songID, hlsVariantAAC256)
}

func (s *HLSCacheService) UpdateAccessTimeVariant(songID string, variant hlsVariant) error {
	cacheKey := s.cacheKey(songID, variant)
	meta, exists := s.metadata.Get(cacheKey)
	if !exists {
		// Song might exist but metadata is missing, try to create it
		songDir := s.getVariantPath(songID, variant)
		info, err := os.Stat(songDir)
		if err != nil {
			return fmt.Errorf("HLS cache not found: %s (%s)", songID, variant.key)
		}

		totalSize, segmentCount := s.calculateDirStats(songDir)
		meta = &HLSCacheMetadata{
			SongID:        songID,
			Variant:       variant.key,
			TotalSize:     totalSize,
			SegmentCount:  segmentCount,
			CachedAt:      info.ModTime(),
			LastAccessed:  time.Now(),
			FormatVersion: variant.formatVersion,
		}
		s.metadata.Set(cacheKey, meta)
	} else {
		// Update existing metadata
		meta.LastAccessed = time.Now()
		if meta.FormatVersion < variant.formatVersion {
			meta.FormatVersion = variant.formatVersion
		}
		if meta.Variant == "" {
			meta.Variant = variant.key
		}
		s.metadata.Set(cacheKey, meta)
	}

	if err := s.SaveMetadata(); err != nil {
		log.Printf("Failed to save HLS metadata after access time update: %v", err)
	}

	return nil
}

// RunCleanup performs HLS cache cleanup based on current settings
// It removes files that:
// 1. Exceed max_cache_age
// 2. Have not been accessed within idle_expiry_time
// 3. Are LRU when total size exceeds max_cache_size
func (s *HLSCacheService) RunCleanup() ([]*HLSCleanupResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var results []*HLSCleanupResult
	now := time.Now()

	// Get all metadata
	allMeta := s.metadata.GetAll()

	// Track songs to remove
	toRemove := make(map[string]*HLSCacheMetadata)

	// 1. Remove songs exceeding max_cache_age
	maxAge := time.Duration(s.settings.MaxCacheAge) * time.Second
	ageResult := &HLSCleanupResult{Reason: "age_expired"}
	for songID, meta := range allMeta {
		if now.Sub(meta.CachedAt) > maxAge {
			toRemove[songID] = meta
			ageResult.RemovedCount++
			ageResult.RemovedSize += meta.TotalSize
		}
	}
	if ageResult.RemovedCount > 0 {
		results = append(results, ageResult)
	}

	// 2. Remove songs not accessed within idle_expiry_time
	idleExpiry := time.Duration(s.settings.IdleExpiryTime) * time.Second
	idleResult := &HLSCleanupResult{Reason: "idle_expired"}
	for songID, meta := range allMeta {
		if _, alreadyMarked := toRemove[songID]; alreadyMarked {
			continue
		}
		if now.Sub(meta.LastAccessed) > idleExpiry {
			toRemove[songID] = meta
			idleResult.RemovedCount++
			idleResult.RemovedSize += meta.TotalSize
		}
	}
	if idleResult.RemovedCount > 0 {
		results = append(results, idleResult)
	}

	// Remove marked songs
	for songID := range toRemove {
		songDir := filepath.Join(s.hlsDir, songID)
		if err := os.RemoveAll(songDir); err != nil && !os.IsNotExist(err) {
			log.Printf("Failed to remove HLS cache for %s: %v", songID, err)
		}
		s.metadata.Delete(songID)
		delete(s.resolvedVariant, songID)
		delete(allMeta, songID)
	}

	// 3. Check if total size exceeds max_cache_size and remove LRU songs
	var totalSize int64
	for _, meta := range allMeta {
		totalSize += meta.TotalSize
	}

	if totalSize > s.settings.MaxCacheSize {
		lruResult := &HLSCleanupResult{Reason: "size_exceeded"}

		// Sort by last_accessed (oldest first)
		type songEntry struct {
			songID string
			meta   *HLSCacheMetadata
		}
		var entries []songEntry
		for songID, meta := range allMeta {
			entries = append(entries, songEntry{songID, meta})
		}
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].meta.LastAccessed.Before(entries[j].meta.LastAccessed)
		})

		// Remove LRU songs until under limit
		for _, entry := range entries {
			if totalSize <= s.settings.MaxCacheSize {
				break
			}

			songDir := filepath.Join(s.hlsDir, entry.songID)
			if err := os.RemoveAll(songDir); err != nil && !os.IsNotExist(err) {
				log.Printf("Failed to remove LRU HLS cache for %s: %v", entry.songID, err)
				continue
			}
			s.metadata.Delete(entry.songID)
			delete(s.resolvedVariant, entry.songID)
			totalSize -= entry.meta.TotalSize
			lruResult.RemovedCount++
			lruResult.RemovedSize += entry.meta.TotalSize
		}

		if lruResult.RemovedCount > 0 {
			results = append(results, lruResult)
		}
	}

	// Save updated metadata
	if err := s.SaveMetadata(); err != nil {
		log.Printf("Failed to save HLS metadata after cleanup: %v", err)
	}

	return results, nil
}

// Clear removes all HLS cached files
func (s *HLSCacheService) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove all song directories in HLS cache directory
	entries, err := os.ReadDir(s.hlsDir)
	if err != nil {
		return fmt.Errorf("failed to read HLS cache directory: %w", err)
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			// Skip non-directory files (like metadata.json)
			continue
		}

		name := entry.Name()
		// Skip temp directory
		if name == ".temp" {
			continue
		}

		songDir := filepath.Join(s.hlsDir, name)
		if err := os.RemoveAll(songDir); err != nil {
			log.Printf("Failed to remove HLS cache directory %s: %v", name, err)
		}
	}

	// Clear metadata
	s.metadata.Clear()
	s.resolvedVariant = make(map[string]localHLSVariantResolution)

	// Save empty metadata
	if err := s.SaveMetadata(); err != nil {
		log.Printf("Failed to save HLS metadata after clear: %v", err)
	}

	return nil
}

// ConvertToHLS converts an audio file to HLS format
// Uses a temporary directory for conversion and atomically moves to final location on success
func (s *HLSCacheService) ConvertToHLS(songID string, audioPath string) error {
	return s.ConvertToHLSVariant(songID, audioPath, hlsVariantAAC256)
}

func (s *HLSCacheService) ConvertToHLSVariant(songID string, audioPath string, variant hlsVariant) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check if already exists
	finalDir := s.getVariantPath(songID, variant)
	if variantArtifactsReady(finalDir, variant) {
		log.Printf("[HLS Cache] HLS already exists for song %s (%s)", songID, variant.key)
		return nil
	}
	if err := os.RemoveAll(finalDir); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to clear invalid HLS cache: %w", err)
	}

	// Create temporary directory for conversion
	tempSongDir := filepath.Join(s.tempDir, s.cacheKey(songID, variant)+"_"+fmt.Sprintf("%d", time.Now().UnixNano()))
	tempSongDir, err := filepath.Abs(tempSongDir)
	if err != nil {
		return fmt.Errorf("failed to resolve temp directory: %w", err)
	}
	if err := os.MkdirAll(tempSongDir, 0755); err != nil {
		return fmt.Errorf("failed to create temp directory: %w", err)
	}

	// Ensure cleanup on failure
	success := false
	defer func() {
		if !success {
			os.RemoveAll(tempSongDir)
		}
	}()

	tempPlaylistPath := filepath.Join(tempSongDir, "playlist.m3u8")
	segmentPattern := filepath.Join(tempSongDir, "segment%03d"+variant.segmentExtension)

	// Use ffmpeg to convert audio to HLS
	cmd := exec.Command("ffmpeg", buildHLSConvertArgs(audioPath, variant, segmentPattern, tempPlaylistPath)...)
	cmd.Dir = tempSongDir

	log.Printf("[HLS Cache] Running ffmpeg for song %s (%s): %v", songID, variant.key, cmd.Args)

	output, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[HLS Cache] ffmpeg error for song %s (%s): %s", songID, variant.key, string(output))
		return fmt.Errorf("ffmpeg conversion failed: %w", err)
	}

	// Verify conversion was successful
	if _, err := os.Stat(tempPlaylistPath); err != nil {
		return fmt.Errorf("HLS playlist not created: %w", err)
	}
	if !variantArtifactsReady(tempSongDir, variant) {
		return fmt.Errorf("required HLS artifacts not created for variant %s", variant.key)
	}

	// Calculate stats for the converted files
	totalSize, segmentCount := s.calculateDirStats(tempSongDir)
	if segmentCount == 0 {
		return fmt.Errorf("no HLS segments created")
	}

	// Remove existing final directory if it exists (partial conversion)
	os.RemoveAll(finalDir)

	// Atomic move: rename temp directory to final location
	if err := os.Rename(tempSongDir, finalDir); err != nil {
		// If rename fails (e.g., cross-device), fall back to copy
		if err := s.copyDir(tempSongDir, finalDir); err != nil {
			return fmt.Errorf("failed to move HLS files to final location: %w", err)
		}
		os.RemoveAll(tempSongDir)
	}

	// Update metadata
	now := time.Now()
	s.metadata.Set(s.cacheKey(songID, variant), &HLSCacheMetadata{
		SongID:        songID,
		Variant:       variant.key,
		TotalSize:     totalSize,
		SegmentCount:  segmentCount,
		CachedAt:      now,
		LastAccessed:  now,
		FormatVersion: variant.formatVersion,
	})

	// Save metadata
	if err := s.SaveMetadata(); err != nil {
		log.Printf("[HLS Cache] Failed to save metadata after conversion: %v", err)
	}

	success = true
	log.Printf("[HLS Cache] HLS conversion complete for song %s (%s): %d segments, %s",
		songID, variant.key, segmentCount, FormatBytes(totalSize))

	return nil
}

// copyDir copies a directory and its contents
func (s *HLSCacheService) copyDir(src, dst string) error {
	if err := os.MkdirAll(dst, 0755); err != nil {
		return err
	}

	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())

		if entry.IsDir() {
			if err := s.copyDir(srcPath, dstPath); err != nil {
				return err
			}
		} else {
			data, err := os.ReadFile(srcPath)
			if err != nil {
				return err
			}
			if err := os.WriteFile(dstPath, data, 0644); err != nil {
				return err
			}
		}
	}

	return nil
}

// CleanupTempDir removes any leftover temporary files
func (s *HLSCacheService) CleanupTempDir() error {
	entries, err := os.ReadDir(s.tempDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() {
			path := filepath.Join(s.tempDir, entry.Name())
			if err := os.RemoveAll(path); err != nil {
				log.Printf("[HLS Cache] Failed to remove temp directory %s: %v", entry.Name(), err)
			}
		}
	}

	return nil
}
