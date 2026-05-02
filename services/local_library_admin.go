package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"main/models"
	"sync"
	"time"
)

var (
	ErrLocalLibraryDisabled         = errors.New("local library is not enabled")
	ErrLocalLibraryScanUnavailable  = errors.New("local library scanner is not available")
	ErrLocalLibraryScrapeDisabled   = errors.New("local library metadata enhancement is not enabled")
	ErrLocalLibraryScanRunning      = errors.New("local library scan is already running")
	ErrLocalLibraryScrapeRunning    = errors.New("local library scrape is already running")
	ErrInvalidLocalLibraryScanMode  = errors.New("invalid local library scan mode")
	ErrInvalidLocalLibraryScrapeScope = errors.New("invalid local library scrape scope")
)

type LocalLibraryScrapeScope string

const (
	LocalLibraryScrapeScopeUnmatched LocalLibraryScrapeScope = "unmatched"
	LocalLibraryScrapeScopeAll       LocalLibraryScrapeScope = "all"
)

type LocalLibraryOverview struct {
	Enabled        bool                           `json:"enabled"`
	DisabledReason string                         `json:"disabled_reason,omitempty"`
	Roots          []string                       `json:"roots"`
	ScanMode       models.LibraryScanMode         `json:"scan_mode"`
	CleanupPolicy  models.CleanupPolicy           `json:"cleanup_policy"`
	AppleMusic     LocalLibraryAppleMusicOverview `json:"apple_music"`
	Stats          LocalLibraryOverviewStats      `json:"stats"`
	ScanRunning    bool                           `json:"scan_running"`
	RecentScanTasks []*models.MediaScanTask       `json:"recent_scan_tasks"`
	ScrapeStatus   LocalLibraryScrapeStatus       `json:"scrape_status"`
}

type LocalLibraryAppleMusicOverview struct {
	MetadataEnhancement bool    `json:"metadata_enhancement"`
	LyricsEnhancement   bool    `json:"lyrics_enhancement"`
	MatchThreshold      float64 `json:"match_threshold"`
}

type LocalLibraryOverviewStats struct {
	Artists        int `json:"artists"`
	Albums         int `json:"albums"`
	Media          int `json:"media"`
	AvailableMedia int `json:"available_media"`
	Files          int `json:"files"`
	AvailableFiles int `json:"available_files"`
	MatchedMedia   int `json:"matched_media"`
	UnmatchedMedia int `json:"unmatched_media"`
	ErroredMedia   int `json:"errored_media"`
}

type LocalLibraryScrapeStatus struct {
	Available      bool                    `json:"available"`
	DisabledReason string                  `json:"disabled_reason,omitempty"`
	IsRunning      bool                    `json:"is_running"`
	Scope          LocalLibraryScrapeScope `json:"scope,omitempty"`
	Total          int                     `json:"total"`
	Processed      int                     `json:"processed"`
	Succeeded      int                     `json:"succeeded"`
	Failed         int                     `json:"failed"`
	CurrentMediaID int64                   `json:"current_media_id,omitempty"`
	LastError      string                  `json:"last_error,omitempty"`
	StartedAt      *time.Time              `json:"started_at,omitempty"`
	CompletedAt    *time.Time              `json:"completed_at,omitempty"`
}

type LocalLibraryAdminService struct {
	db       *Database
	repo     LocalLibraryRepository
	scanner  *LocalMediaScanner
	enhancer *LocalMetadataEnhancer
	config   LocalMediaConfig

	mu          sync.Mutex
	scanRunning bool
	scrape      LocalLibraryScrapeStatus
}

func NewLocalLibraryAdminService(db *Database, repo LocalLibraryRepository, scanner *LocalMediaScanner, enhancer *LocalMetadataEnhancer, config LocalMediaConfig) *LocalLibraryAdminService {
	s := &LocalLibraryAdminService{
		db:       db,
		repo:     repo,
		scanner:  scanner,
		enhancer: enhancer,
		config:   config,
	}
	s.scrape = s.defaultScrapeStatus()
	return s
}

func (s *LocalLibraryAdminService) GetOverview(ctx context.Context, recentLimit int) (*LocalLibraryOverview, error) {
	if recentLimit <= 0 {
		recentLimit = 10
	}

	overview := &LocalLibraryOverview{
		Enabled: s.config.Enabled,
		Roots:   append([]string(nil), s.config.Roots...),
		ScanMode: s.config.ScanMode,
		CleanupPolicy: s.config.CleanupPolicy,
		AppleMusic: LocalLibraryAppleMusicOverview{
			MetadataEnhancement: s.config.AppleMusic.MetadataEnhancement,
			LyricsEnhancement:   s.config.AppleMusic.LyricsEnhancement,
			MatchThreshold:      s.config.AppleMusic.MatchThreshold,
		},
		RecentScanTasks: []*models.MediaScanTask{},
		ScrapeStatus:    s.GetScrapeStatus(),
	}

	s.mu.Lock()
	overview.ScanRunning = s.scanRunning
	s.mu.Unlock()

	if !s.config.Enabled {
		overview.DisabledReason = "本地媒体库未启用"
		return overview, nil
	}
	if s.db == nil || s.repo == nil {
		overview.DisabledReason = "本地媒体库服务未初始化"
		return overview, nil
	}

	stats, err := s.loadStats(ctx)
	if err != nil {
		return nil, err
	}
	overview.Stats = stats

	tasks, err := s.repo.ListScanTasks(ctx, recentLimit)
	if err != nil {
		return nil, err
	}
	if tasks != nil {
		overview.RecentScanTasks = tasks
	}
	return overview, nil
}

func (s *LocalLibraryAdminService) StartScan(mode string, triggerSource string) error {
	if !s.config.Enabled {
		return ErrLocalLibraryDisabled
	}
	if s.scanner == nil {
		return ErrLocalLibraryScanUnavailable
	}

	s.mu.Lock()
	if s.scanRunning {
		s.mu.Unlock()
		return ErrLocalLibraryScanRunning
	}
	s.scanRunning = true
	s.mu.Unlock()

	go func() {
		defer func() {
			s.mu.Lock()
			s.scanRunning = false
			s.mu.Unlock()
		}()

		ctx := context.Background()
		switch mode {
		case "incremental":
			_, _ = s.scanner.RunIncrementalScan(ctx, triggerSource)
		case "full":
			_, _ = s.scanner.RunFullScan(ctx, triggerSource)
		default:
		}
	}()

	switch mode {
	case "incremental", "full":
		return nil
	default:
		s.mu.Lock()
		s.scanRunning = false
		s.mu.Unlock()
		return ErrInvalidLocalLibraryScanMode
	}
}

func (s *LocalLibraryAdminService) StartScrape(scope LocalLibraryScrapeScope) error {
	if !s.config.Enabled {
		return ErrLocalLibraryDisabled
	}
	if !s.config.AppleMusic.MetadataEnhancement || s.enhancer == nil || s.db == nil {
		return ErrLocalLibraryScrapeDisabled
	}

	ids, err := s.listMediaIDsForScrape(context.Background(), scope)
	if err != nil {
		return err
	}

	s.mu.Lock()
	if s.scrape.IsRunning {
		s.mu.Unlock()
		return ErrLocalLibraryScrapeRunning
	}

	now := time.Now()
	s.scrape = s.defaultScrapeStatus()
	s.scrape.Available = true
	s.scrape.IsRunning = len(ids) > 0
	s.scrape.Scope = scope
	s.scrape.Total = len(ids)
	s.scrape.StartedAt = &now
	if len(ids) == 0 {
		s.scrape.CompletedAt = &now
	}
	s.mu.Unlock()

	if len(ids) == 0 {
		return nil
	}

	go s.runScrape(scope, ids)
	return nil
}

func (s *LocalLibraryAdminService) GetScrapeStatus() LocalLibraryScrapeStatus {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := s.scrape
	if !status.Available {
		status = s.defaultScrapeStatus()
	}
	return status
}

func (s *LocalLibraryAdminService) runScrape(scope LocalLibraryScrapeScope, ids []int64) {
	for index, mediaID := range ids {
		s.mu.Lock()
		s.scrape.CurrentMediaID = mediaID
		s.mu.Unlock()

		err := s.enhancer.EnhanceMedia(context.Background(), mediaID)

		s.mu.Lock()
		s.scrape.Processed = index + 1
		if err != nil {
			s.scrape.Failed++
			s.scrape.LastError = err.Error()
		} else {
			s.scrape.Succeeded++
		}
		s.mu.Unlock()
	}

	now := time.Now()
	s.mu.Lock()
	s.scrape.IsRunning = false
	s.scrape.CurrentMediaID = 0
	s.scrape.CompletedAt = &now
	s.scrape.Scope = scope
	s.mu.Unlock()
}

func (s *LocalLibraryAdminService) defaultScrapeStatus() LocalLibraryScrapeStatus {
	status := LocalLibraryScrapeStatus{
		Available: s.config.Enabled && s.config.AppleMusic.MetadataEnhancement && s.enhancer != nil,
	}
	if !s.config.Enabled {
		status.DisabledReason = "本地媒体库未启用"
	} else if !s.config.AppleMusic.MetadataEnhancement || s.enhancer == nil {
		status.DisabledReason = "Apple Music 元数据增强未启用"
	}
	return status
}

func (s *LocalLibraryAdminService) loadStats(ctx context.Context) (LocalLibraryOverviewStats, error) {
	var stats LocalLibraryOverviewStats
	query := `
		SELECT
			(SELECT COUNT(*) FROM local_artists WHERE availability_status = 'available') AS artists,
			(SELECT COUNT(*) FROM local_albums WHERE availability_status = 'available') AS albums,
			(SELECT COUNT(*) FROM local_media) AS media,
			(SELECT COUNT(*) FROM local_media WHERE availability_status = 'available') AS available_media,
			(SELECT COUNT(*) FROM local_media_files) AS files,
			(SELECT COUNT(*) FROM local_media_files WHERE availability_status = 'available') AS available_files,
			(
				SELECT COUNT(*)
				FROM local_media m
				LEFT JOIN local_lyrics_mappings lm ON lm.media_id = m.id
				WHERE m.availability_status = 'available'
				  AND lm.status IN ('matched', 'available')
			) AS matched_media,
			(
				SELECT COUNT(*)
				FROM local_media m
				LEFT JOIN local_lyrics_mappings lm ON lm.media_id = m.id
				WHERE m.availability_status = 'available'
				  AND (lm.id IS NULL OR lm.status IN ('unmatched', 'disabled'))
			) AS unmatched_media,
			(
				SELECT COUNT(*)
				FROM local_media m
				LEFT JOIN local_lyrics_mappings lm ON lm.media_id = m.id
				WHERE m.availability_status = 'available'
				  AND lm.status = 'error'
			) AS errored_media
	`
	if err := s.db.QueryRowContext(ctx, query).Scan(
		&stats.Artists,
		&stats.Albums,
		&stats.Media,
		&stats.AvailableMedia,
		&stats.Files,
		&stats.AvailableFiles,
		&stats.MatchedMedia,
		&stats.UnmatchedMedia,
		&stats.ErroredMedia,
	); err != nil {
		return stats, fmt.Errorf("load local library stats: %w", err)
	}
	return stats, nil
}

func (s *LocalLibraryAdminService) listMediaIDsForScrape(ctx context.Context, scope LocalLibraryScrapeScope) ([]int64, error) {
	if s.db == nil {
		return nil, ErrLocalLibraryScrapeDisabled
	}

	var query string
	switch scope {
	case LocalLibraryScrapeScopeUnmatched:
		query = `
			SELECT m.id
			FROM local_media m
			LEFT JOIN local_lyrics_mappings lm ON lm.media_id = m.id
			WHERE m.availability_status = 'available'
			  AND (lm.id IS NULL OR lm.status IN ('unmatched', 'error', 'disabled'))
			ORDER BY m.id ASC
		`
	case LocalLibraryScrapeScopeAll:
		query = `
			SELECT id
			FROM local_media
			WHERE availability_status = 'available'
			ORDER BY id ASC
		`
	default:
		return nil, ErrInvalidLocalLibraryScrapeScope
	}

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("list media ids for scrape: %w", err)
	}
	defer rows.Close()

	ids := make([]int64, 0)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan media id for scrape: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate media ids for scrape: %w", err)
	}
	return ids, nil
}

func IsLocalLibraryConflictError(err error) bool {
	return errors.Is(err, ErrLocalLibraryScanRunning) || errors.Is(err, ErrLocalLibraryScrapeRunning)
}

func IsLocalLibraryUnavailableError(err error) bool {
	return errors.Is(err, ErrLocalLibraryDisabled) || errors.Is(err, ErrLocalLibraryScanUnavailable) || errors.Is(err, ErrLocalLibraryScrapeDisabled)
}

func IsLocalLibraryValidationError(err error) bool {
	return errors.Is(err, ErrInvalidLocalLibraryScanMode) || errors.Is(err, ErrInvalidLocalLibraryScrapeScope)
}

func normalizeNullableCount(count sql.NullInt64) int {
	if !count.Valid {
		return 0
	}
	return int(count.Int64)
}
