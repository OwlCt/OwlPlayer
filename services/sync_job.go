package services

import (
	"context"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"log"
	"sync"
	"time"
)

type ArtistDetailProvider interface {
	GetArtistDetail(artistID string) (*models.ArtistDetail, error)
}

// SyncJobScheduler handles periodic synchronization of artist releases
type SyncJobScheduler struct {
	db              *Database
	artistProvider  ArtistDetailProvider
	snapshotSvc     *ArtistSnapshotService
	notifySvc       *ReleaseNotificationService
	settingsSvc     *SystemSettingsService
	historySvc      *SyncHistoryService
	metadataCache   *MetadataCache
	interval        time.Duration
	requestDelay    time.Duration
	scheduleEnabled bool // Whether scheduled sync is enabled
	scheduleHour    int  // Hour of day to run (0-23)
	scheduleMinute  int  // Minute of hour to run (0-59)
	mu              sync.Mutex
	running         bool
	lastResult      *models.SyncJobResult
	currentHistory  *models.SyncHistory
	stopChan        chan struct{}
}

// NewSyncJobScheduler creates a new SyncJobScheduler instance
func NewSyncJobScheduler(
	db *Database,
	artistProvider ArtistDetailProvider,
	snapshotSvc *ArtistSnapshotService,
	notifySvc *ReleaseNotificationService,
	settingsSvc *SystemSettingsService,
	historySvc *SyncHistoryService,
	interval time.Duration,
	requestDelay time.Duration,
) *SyncJobScheduler {
	return &SyncJobScheduler{
		db:             db,
		artistProvider: artistProvider,
		snapshotSvc:    snapshotSvc,
		notifySvc:      notifySvc,
		settingsSvc:    settingsSvc,
		historySvc:     historySvc,
		metadataCache:  GetMetadataCache(),
		interval:       interval,
		requestDelay:   requestDelay,
	}
}

// GetAllFollowedArtists retrieves all followed artists and recently played artists across all users, deduplicated
// VIP users' artists are prioritized in the returned list
func (s *SyncJobScheduler) GetAllFollowedArtists(ctx context.Context) ([]models.ArtistSyncItem, error) {
	// Query combines followed artists and recently played artists
	query := `
		WITH all_artists AS (
			-- Followed artists
			SELECT 
				fa.artist_id,
				fa.artist_name,
				CASE WHEN u.user_group = 'vip' THEN true ELSE false END as is_vip,
				1 as priority
			FROM followed_artists fa
			JOIN users u ON fa.user_id = u.id
			WHERE u.is_active = true
			
			UNION ALL
			
			-- Recently played artists (from recently_played table)
			SELECT 
				rp.item_id as artist_id,
				'' as artist_name,
				CASE WHEN u.user_group = 'vip' THEN true ELSE false END as is_vip,
				2 as priority
			FROM recently_played rp
			JOIN users u ON rp.user_id = u.id
			WHERE rp.item_type = 'artist' AND u.is_active = true
		)
		SELECT DISTINCT ON (artist_id)
			artist_id,
			artist_name,
			is_vip
		FROM all_artists
		ORDER BY artist_id, priority ASC, is_vip DESC
	`

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to get artists for sync: %w", err)
	}
	defer rows.Close()

	var artists []models.ArtistSyncItem
	for rows.Next() {
		var item models.ArtistSyncItem
		if err := rows.Scan(&item.ArtistID, &item.ArtistName, &item.IsVIP); err != nil {
			return nil, fmt.Errorf("failed to scan artist: %w", err)
		}
		artists = append(artists, item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating artists: %w", err)
	}

	// Sort: VIP artists first
	sortedArtists := sortArtistsByVIPPriority(artists)

	return sortedArtists, nil
}

// sortArtistsByVIPPriority sorts artists with VIP users' artists first
func sortArtistsByVIPPriority(artists []models.ArtistSyncItem) []models.ArtistSyncItem {
	vipArtists := make([]models.ArtistSyncItem, 0)
	normalArtists := make([]models.ArtistSyncItem, 0)

	for _, artist := range artists {
		if artist.IsVIP {
			vipArtists = append(vipArtists, artist)
		} else {
			normalArtists = append(normalArtists, artist)
		}
	}

	return append(vipArtists, normalArtists...)
}

// DeduplicateArtists removes duplicate artists from the list, keeping the first occurrence
func DeduplicateArtists(artists []models.ArtistSyncItem) []models.ArtistSyncItem {
	seen := make(map[string]bool)
	result := make([]models.ArtistSyncItem, 0)

	for _, artist := range artists {
		if !seen[artist.ArtistID] {
			seen[artist.ArtistID] = true
			result = append(result, artist)
		}
	}

	return result
}

// RunOnce executes a single sync job
func (s *SyncJobScheduler) RunOnce(ctx context.Context) (*models.SyncJobResult, error) {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil, fmt.Errorf("sync job is already running")
	}
	s.running = true
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		s.running = false
		s.currentHistory = nil
		s.mu.Unlock()
	}()

	startTime := time.Now()
	result := &models.SyncJobResult{}

	// Create sync history record at the start
	var history *models.SyncHistory
	if s.historySvc != nil {
		history = &models.SyncHistory{
			StartedAt: startTime,
			Status:    models.SyncStatusRunning,
			Logs:      []models.SyncLogEntry{},
		}
		if err := s.historySvc.CreateHistory(ctx, history); err != nil {
			log.Printf("[SyncJob] Failed to create sync history: %v", err)
		} else {
			s.mu.Lock()
			s.currentHistory = history
			s.mu.Unlock()
		}
	}

	// Get all followed artists
	artists, err := s.GetAllFollowedArtists(ctx)
	if err != nil {
		// Update history with failure status
		if history != nil && s.historySvc != nil {
			now := time.Now()
			history.CompletedAt = &now
			history.Status = models.SyncStatusFailed
			if updateErr := s.historySvc.UpdateHistory(ctx, history); updateErr != nil {
				log.Printf("[SyncJob] Failed to update sync history: %v", updateErr)
			}
		}
		return nil, fmt.Errorf("failed to get followed artists: %w", err)
	}

	log.Printf("[SyncJob] Starting sync for %d artists", len(artists))

	// Process each artist
	for i, artist := range artists {
		select {
		case <-ctx.Done():
			log.Printf("[SyncJob] Sync cancelled after processing %d artists", i)
			result.Duration = time.Since(startTime)
			// Update history with cancelled status
			if history != nil && s.historySvc != nil {
				now := time.Now()
				history.CompletedAt = &now
				history.Status = models.SyncStatusFailed
				history.ProcessedArtists = result.ProcessedArtists
				history.NewReleases = result.NewReleases
				history.Errors = result.Errors
				if updateErr := s.historySvc.UpdateHistory(ctx, history); updateErr != nil {
					log.Printf("[SyncJob] Failed to update sync history: %v", updateErr)
				}
			}
			return result, ctx.Err()
		default:
		}

		newReleases, processErr := s.processArtistWithLog(ctx, artist)

		// Add log entry for this artist
		logEntry := models.SyncLogEntry{
			ArtistID:    artist.ArtistID,
			ArtistName:  artist.ArtistName,
			ProcessedAt: time.Now(),
			NewReleases: newReleases,
		}

		if processErr != nil {
			log.Printf("[SyncJob] Error processing artist %s: %v", artist.ArtistID, processErr)
			result.Errors++
			logEntry.Status = models.SyncLogStatusError
			logEntry.Error = processErr.Error()
		} else {
			result.ProcessedArtists++
			result.NewReleases += newReleases
			logEntry.Status = models.SyncLogStatusSuccess
		}

		// Update history with new log entry
		if history != nil {
			history.Logs = append(history.Logs, logEntry)
			history.ProcessedArtists = result.ProcessedArtists
			history.NewReleases = result.NewReleases
			history.Errors = result.Errors
			if s.historySvc != nil {
				if updateErr := s.historySvc.UpdateHistory(ctx, history); updateErr != nil {
					log.Printf("[SyncJob] Failed to update sync history: %v", updateErr)
				}
			}
		}

		// Wait between requests to avoid rate limiting
		if i < len(artists)-1 && s.requestDelay > 0 {
			time.Sleep(s.requestDelay)
		}
	}

	result.Duration = time.Since(startTime)
	s.lastResult = result

	log.Printf("[SyncJob] Sync completed: %d artists processed, %d new releases, %d errors, duration: %v",
		result.ProcessedArtists, result.NewReleases, result.Errors, result.Duration)

	// Update history with completed status
	if history != nil && s.historySvc != nil {
		now := time.Now()
		history.CompletedAt = &now
		history.Status = models.SyncStatusCompleted
		history.ProcessedArtists = result.ProcessedArtists
		history.NewReleases = result.NewReleases
		history.Errors = result.Errors
		if updateErr := s.historySvc.UpdateHistory(ctx, history); updateErr != nil {
			log.Printf("[SyncJob] Failed to update sync history: %v", updateErr)
		}

		// Cleanup old history records, keep only the most recent 7
		if deleted, cleanupErr := s.historySvc.CleanupOldHistory(ctx, 7); cleanupErr != nil {
			log.Printf("[SyncJob] Failed to cleanup old sync history: %v", cleanupErr)
		} else if deleted > 0 {
			log.Printf("[SyncJob] Cleaned up %d old sync history records", deleted)
		}
	}

	// Persist result to database
	if s.settingsSvc != nil {
		syncResult := &SyncResult{
			ProcessedArtists: result.ProcessedArtists,
			NewReleases:      result.NewReleases,
			Errors:           result.Errors,
			Duration:         result.Duration.String(),
			CompletedAt:      time.Now().Format(time.RFC3339),
		}
		if err := s.settingsSvc.SetLastSyncResult(ctx, syncResult); err != nil {
			log.Printf("[SyncJob] Failed to persist sync result: %v", err)
		}
	}

	// Cleanup expired notifications
	deleted, err := s.notifySvc.CleanupExpired(ctx)
	if err != nil {
		log.Printf("[SyncJob] Error cleaning up expired notifications: %v", err)
	} else if deleted > 0 {
		log.Printf("[SyncJob] Cleaned up %d expired notifications", deleted)
	}

	return result, nil
}

// processArtistWithLog processes a single artist and returns the number of new releases
func (s *SyncJobScheduler) processArtistWithLog(ctx context.Context, artist models.ArtistSyncItem) (int, error) {
	// Get current snapshot
	oldSnapshot, err := s.snapshotSvc.GetSnapshot(ctx, artist.ArtistID)
	if err != nil {
		return 0, fmt.Errorf("failed to get snapshot: %w", err)
	}

	// Delete existing cache to force refresh from API
	if s.metadataCache != nil {
		s.metadataCache.Delete("artists", artist.ArtistID)
	}

	// Fetch latest artist data from API (this will also update the cache)
	artistDetail, err := s.artistProvider.GetArtistDetail(artist.ArtistID)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch artist data: %w", err)
	}
	if artistDetail == nil {
		return 0, fmt.Errorf("artist not found: %s", artist.ArtistID)
	}

	// Use API name if artist name is empty (e.g., from recently_played)
	artistName := artist.ArtistName
	if artistName == "" {
		artistName = artistDetail.Name
	}

	// Build new snapshot from artist data
	newSnapshot := s.buildSnapshotFromArtistDetail(artistDetail, artistName)

	// Compare snapshots
	diff := s.snapshotSvc.CompareSnapshots(oldSnapshot, newSnapshot)

	// Count new releases
	newReleasesCount := len(diff.NewAlbums) + len(diff.NewSingles)

	// If this is the first snapshot, don't generate notifications
	isFirstSnapshot := oldSnapshot == nil

	// Save new snapshot
	if err := s.snapshotSvc.SaveSnapshot(ctx, newSnapshot); err != nil {
		return 0, fmt.Errorf("failed to save snapshot: %w", err)
	}

	// Generate notifications for new releases (skip if first snapshot)
	if !isFirstSnapshot && newReleasesCount > 0 {
		// Update artist name for notifications
		artist.ArtistName = artistName
		// Enrich new releases with name, artwork, and release date
		s.enrichNewReleases(diff, artistDetail)
		if err := s.createNotificationsForDiff(ctx, artist, diff); err != nil {
			return newReleasesCount, fmt.Errorf("failed to create notifications: %w", err)
		}
	}

	return newReleasesCount, nil
}

// processArtist processes a single artist for new releases
func (s *SyncJobScheduler) processArtist(ctx context.Context, artist models.ArtistSyncItem) error {
	// Get current snapshot
	oldSnapshot, err := s.snapshotSvc.GetSnapshot(ctx, artist.ArtistID)
	if err != nil {
		return fmt.Errorf("failed to get snapshot: %w", err)
	}

	// Delete existing cache to force refresh from API
	if s.metadataCache != nil {
		s.metadataCache.Delete("artists", artist.ArtistID)
	}

	// Fetch latest artist data from API (this will also update the cache)
	artistDetail, err := s.artistProvider.GetArtistDetail(artist.ArtistID)
	if err != nil {
		return fmt.Errorf("failed to fetch artist data: %w", err)
	}
	if artistDetail == nil {
		return fmt.Errorf("artist not found: %s", artist.ArtistID)
	}

	// Use API name if artist name is empty (e.g., from recently_played)
	artistName := artist.ArtistName
	if artistName == "" {
		artistName = artistDetail.Name
	}

	// Build new snapshot from artist data
	newSnapshot := s.buildSnapshotFromArtistDetail(artistDetail, artistName)

	// Compare snapshots
	diff := s.snapshotSvc.CompareSnapshots(oldSnapshot, newSnapshot)

	// If this is the first snapshot, don't generate notifications
	isFirstSnapshot := oldSnapshot == nil

	// Save new snapshot
	if err := s.snapshotSvc.SaveSnapshot(ctx, newSnapshot); err != nil {
		return fmt.Errorf("failed to save snapshot: %w", err)
	}

	// Generate notifications for new releases (skip if first snapshot)
	if !isFirstSnapshot && (len(diff.NewAlbums) > 0 || len(diff.NewSingles) > 0) {
		// Update artist name for notifications
		artist.ArtistName = artistName
		// Enrich new releases with name, artwork, and release date
		s.enrichNewReleases(diff, artistDetail)
		if err := s.createNotificationsForDiff(ctx, artist, diff); err != nil {
			return fmt.Errorf("failed to create notifications: %w", err)
		}
	}

	return nil
}

// buildSnapshotFromArtistDetail creates a snapshot from artist detail API data
func (s *SyncJobScheduler) buildSnapshotFromArtistDetail(artistDetail *models.ArtistDetail, artistName string) *models.ArtistSnapshot {
	snapshot := &models.ArtistSnapshot{
		ArtistID:   artistDetail.ID,
		ArtistName: artistName,
		AlbumIDs:   make([]string, 0),
		SingleIDs:  make([]string, 0),
	}

	// Extract album IDs
	for _, album := range artistDetail.Albums {
		snapshot.AlbumIDs = append(snapshot.AlbumIDs, album.ID)
	}

	// Extract single/EP IDs
	for _, single := range artistDetail.SinglesAndEPs {
		snapshot.SingleIDs = append(snapshot.SingleIDs, single.ID)
	}

	return snapshot
}

// enrichNewReleases fills in Name, ArtworkURL, and ReleaseDate for new releases from artistDetail
func (s *SyncJobScheduler) enrichNewReleases(diff *models.SnapshotDiff, artistDetail *models.ArtistDetail) {
	// Build lookup maps for albums and singles
	albumMap := make(map[string]models.AlbumItem)
	for _, album := range artistDetail.Albums {
		albumMap[album.ID] = album
	}
	singleMap := make(map[string]models.AlbumItem)
	for _, single := range artistDetail.SinglesAndEPs {
		singleMap[single.ID] = single
	}

	// Enrich new albums
	for i := range diff.NewAlbums {
		if album, ok := albumMap[diff.NewAlbums[i].ID]; ok {
			diff.NewAlbums[i].Name = album.Name
			diff.NewAlbums[i].ArtworkURL = album.ArtworkURL
			diff.NewAlbums[i].ReleaseDate = album.ReleaseDate
		}
	}

	// Enrich new singles
	for i := range diff.NewSingles {
		if single, ok := singleMap[diff.NewSingles[i].ID]; ok {
			diff.NewSingles[i].Name = single.Name
			diff.NewSingles[i].ArtworkURL = single.ArtworkURL
			diff.NewSingles[i].ReleaseDate = single.ReleaseDate
		}
	}
}

// createNotificationsForDiff creates notifications for all users following the artist
func (s *SyncJobScheduler) createNotificationsForDiff(ctx context.Context, artist models.ArtistSyncItem, diff *models.SnapshotDiff) error {
	// Get all users following this artist
	userIDs, err := s.notifySvc.GetUserIDsFollowingArtist(ctx, artist.ArtistID)
	if err != nil {
		return fmt.Errorf("failed to get users following artist: %w", err)
	}

	if len(userIDs) == 0 {
		return nil
	}

	// Combine all new releases
	releases := make([]models.NewRelease, 0, len(diff.NewAlbums)+len(diff.NewSingles))
	releases = append(releases, diff.NewAlbums...)
	releases = append(releases, diff.NewSingles...)

	// Create notifications
	if err := s.notifySvc.CreateNotifications(ctx, artist.ArtistID, artist.ArtistName, releases, userIDs); err != nil {
		return fmt.Errorf("failed to create notifications: %w", err)
	}

	return nil
}

// Start begins the periodic sync job
// If runOnStart is true, it will run a sync immediately on startup
func (s *SyncJobScheduler) Start(ctx context.Context, runOnStart bool) {
	// Load settings from database on startup
	if err := s.LoadSettingsFromDB(ctx); err != nil {
		log.Printf("[SyncJob] Warning: failed to load settings from database, using defaults: %v", err)
	}

	s.mu.Lock()
	s.stopChan = make(chan struct{})
	interval := s.interval
	s.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Ticker for checking scheduled time (check every minute)
		scheduleTicker := time.NewTicker(1 * time.Minute)
		defer scheduleTicker.Stop()

		// Track last scheduled run date to avoid running multiple times on the same day
		var lastScheduledRunDate string

		// Run immediately on start if configured
		if runOnStart {
			log.Printf("[SyncJob] Running initial sync on startup")
			if _, err := s.RunOnce(ctx); err != nil {
				log.Printf("[SyncJob] Initial sync failed: %v", err)
			}
		} else {
			log.Printf("[SyncJob] Skipping initial sync (run-on-start is disabled)")
		}

		for {
			select {
			case <-ctx.Done():
				log.Println("[SyncJob] Scheduler stopped (context cancelled)")
				return
			case <-s.stopChan:
				log.Println("[SyncJob] Scheduler stopped")
				return
			case <-scheduleTicker.C:
				// Check if scheduled sync should run
				s.mu.Lock()
				scheduleEnabled := s.scheduleEnabled
				scheduleHour := s.scheduleHour
				scheduleMinute := s.scheduleMinute
				s.mu.Unlock()

				if scheduleEnabled {
					now := time.Now()
					todayDate := now.Format("2006-01-02")

					// Check if it's time to run and we haven't run today
					if now.Hour() == scheduleHour && now.Minute() == scheduleMinute && lastScheduledRunDate != todayDate {
						log.Printf("[SyncJob] Running scheduled sync at %02d:%02d", scheduleHour, scheduleMinute)
						lastScheduledRunDate = todayDate
						if _, err := s.RunOnce(ctx); err != nil {
							log.Printf("[SyncJob] Scheduled sync failed: %v", err)
						}
					}
				}
			case <-ticker.C:
				// Interval-based sync (only if schedule is not enabled)
				s.mu.Lock()
				scheduleEnabled := s.scheduleEnabled
				s.mu.Unlock()

				if !scheduleEnabled {
					if _, err := s.RunOnce(ctx); err != nil {
						log.Printf("[SyncJob] Interval sync failed: %v", err)
					}
				}
			}
		}
	}()

	log.Printf("[SyncJob] Scheduler started with interval: %v", s.interval)
}

// IsRunning returns whether a sync job is currently running
func (s *SyncJobScheduler) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

// GetCurrentHistory returns the current running sync history (if any)
func (s *SyncJobScheduler) GetCurrentHistory() *models.SyncHistory {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.currentHistory
}

// GetLastResult returns the result of the last completed sync job
func (s *SyncJobScheduler) GetLastResult() *models.SyncJobResult {
	s.mu.Lock()
	defer s.mu.Unlock()

	// If we have a result in memory, return it
	if s.lastResult != nil {
		return s.lastResult
	}

	// Try to load from database
	if s.settingsSvc != nil {
		ctx := context.Background()
		dbResult, err := s.settingsSvc.GetLastSyncResult(ctx)
		if err != nil {
			log.Printf("[SyncJob] Failed to load last sync result from database: %v", err)
			return nil
		}
		if dbResult != nil {
			// Parse duration string back to time.Duration
			duration, _ := time.ParseDuration(dbResult.Duration)
			s.lastResult = &models.SyncJobResult{
				ProcessedArtists: dbResult.ProcessedArtists,
				NewReleases:      dbResult.NewReleases,
				Errors:           dbResult.Errors,
				Duration:         duration,
			}
			return s.lastResult
		}
	}

	return nil
}

// SyncJobSettings represents configurable sync settings
type SyncJobSettings struct {
	IntervalHours   int
	RequestDelayMs  int
	ScheduleEnabled bool // Whether scheduled sync is enabled
	ScheduleHour    int  // Hour of day to run (0-23)
	ScheduleMinute  int  // Minute of hour to run (0-59)
}

// GetSettings returns the current sync settings
func (s *SyncJobScheduler) GetSettings() SyncJobSettings {
	s.mu.Lock()
	defer s.mu.Unlock()
	return SyncJobSettings{
		IntervalHours:   int(s.interval.Hours()),
		RequestDelayMs:  int(s.requestDelay.Milliseconds()),
		ScheduleEnabled: s.scheduleEnabled,
		ScheduleHour:    s.scheduleHour,
		ScheduleMinute:  s.scheduleMinute,
	}
}

// UpdateSettings updates the sync settings (in memory only, use SaveSettingsToDB to persist)
func (s *SyncJobScheduler) UpdateSettings(intervalHours int, requestDelayMs int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.interval = time.Duration(intervalHours) * time.Hour
	s.requestDelay = time.Duration(requestDelayMs) * time.Millisecond
}

// UpdateScheduleSettings updates the scheduled sync settings (in memory only, use SaveSettingsToDB to persist)
func (s *SyncJobScheduler) UpdateScheduleSettings(enabled bool, hour int, minute int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.scheduleEnabled = enabled
	s.scheduleHour = hour
	s.scheduleMinute = minute
	log.Printf("[SyncJob] Schedule settings updated: enabled=%v, time=%02d:%02d", enabled, hour, minute)
}

// LoadSettingsFromDB loads sync settings from database
func (s *SyncJobScheduler) LoadSettingsFromDB(ctx context.Context) error {
	if s.settingsSvc == nil {
		return nil
	}

	settings, err := s.settingsSvc.GetSyncScheduleSettings(ctx)
	if err != nil {
		return fmt.Errorf("failed to load sync settings from database: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.interval = time.Duration(settings.IntervalHours) * time.Hour
	s.requestDelay = time.Duration(settings.RequestDelayMs) * time.Millisecond
	s.scheduleEnabled = settings.ScheduleEnabled
	s.scheduleHour = settings.ScheduleHour
	s.scheduleMinute = settings.ScheduleMinute

	log.Printf("[SyncJob] Loaded settings from database: interval=%dh, delay=%dms, schedule_enabled=%v, schedule_time=%02d:%02d",
		settings.IntervalHours, settings.RequestDelayMs, settings.ScheduleEnabled, settings.ScheduleHour, settings.ScheduleMinute)

	return nil
}

// SaveSettingsToDB saves current sync settings to database
func (s *SyncJobScheduler) SaveSettingsToDB(ctx context.Context) error {
	if s.settingsSvc == nil {
		return nil
	}

	s.mu.Lock()
	settings := &SyncScheduleSettings{
		IntervalHours:   int(s.interval.Hours()),
		RequestDelayMs:  int(s.requestDelay.Milliseconds()),
		ScheduleEnabled: s.scheduleEnabled,
		ScheduleHour:    s.scheduleHour,
		ScheduleMinute:  s.scheduleMinute,
	}
	s.mu.Unlock()

	if err := s.settingsSvc.SetSyncScheduleSettings(ctx, settings); err != nil {
		return fmt.Errorf("failed to save sync settings to database: %w", err)
	}

	log.Printf("[SyncJob] Saved settings to database: interval=%dh, delay=%dms, schedule_enabled=%v, schedule_time=%02d:%02d",
		settings.IntervalHours, settings.RequestDelayMs, settings.ScheduleEnabled, settings.ScheduleHour, settings.ScheduleMinute)

	return nil
}

// ArtistResyncResult represents the result of a single artist resync operation
type ArtistResyncResult struct {
	ArtistID    string    `json:"artist_id"`
	ArtistName  string    `json:"artist_name"`
	Success     bool      `json:"success"`
	NewReleases int       `json:"new_releases"`
	Error       string    `json:"error,omitempty"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// ResyncArtist performs a resync for a single artist
func (s *SyncJobScheduler) ResyncArtist(ctx context.Context, artistID string) (*ArtistResyncResult, error) {
	result := &ArtistResyncResult{
		ArtistID:  artistID,
		UpdatedAt: time.Now(),
	}

	// Get current snapshot to get artist name
	oldSnapshot, err := s.snapshotSvc.GetSnapshot(ctx, artistID)
	if err != nil {
		result.Error = fmt.Sprintf("failed to get snapshot: %v", err)
		return result, fmt.Errorf("failed to get snapshot: %w", err)
	}

	// Delete existing cache to force refresh from API
	if s.metadataCache != nil {
		s.metadataCache.Delete("artists", artistID)
	}

	// Fetch latest artist data from API
	artistDetail, err := s.artistProvider.GetArtistDetail(artistID)
	if err != nil {
		result.Error = fmt.Sprintf("failed to fetch artist data: %v", err)
		return result, fmt.Errorf("failed to fetch artist data: %w", err)
	}
	if artistDetail == nil {
		result.Error = "artist not found"
		return result, fmt.Errorf("artist not found: %s", artistID)
	}

	// Get artist name from old snapshot or artist detail
	artistName := artistDetail.Name
	if oldSnapshot != nil && oldSnapshot.ArtistName != "" {
		artistName = oldSnapshot.ArtistName
	}
	result.ArtistName = artistName

	// Build new snapshot from artist data
	newSnapshot := s.buildSnapshotFromArtistDetail(artistDetail, artistName)

	// Compare snapshots
	diff := s.snapshotSvc.CompareSnapshots(oldSnapshot, newSnapshot)

	// Count new releases
	newReleasesCount := len(diff.NewAlbums) + len(diff.NewSingles)
	result.NewReleases = newReleasesCount

	// Save new snapshot (this will update the updated_at timestamp)
	if err := s.snapshotSvc.SaveSnapshot(ctx, newSnapshot); err != nil {
		result.Error = fmt.Sprintf("failed to save snapshot: %v", err)
		return result, fmt.Errorf("failed to save snapshot: %w", err)
	}

	// Generate notifications for new releases (skip if first snapshot)
	isFirstSnapshot := oldSnapshot == nil
	if !isFirstSnapshot && newReleasesCount > 0 {
		artist := models.ArtistSyncItem{
			ArtistID:   artistID,
			ArtistName: artistName,
		}
		// Enrich new releases with name, artwork, and release date
		s.enrichNewReleases(diff, artistDetail)
		if err := s.createNotificationsForDiff(ctx, artist, diff); err != nil {
			log.Printf("[ResyncArtist] Warning: failed to create notifications: %v", err)
			// Don't fail the resync for notification errors
		}
	}

	result.Success = true
	result.UpdatedAt = time.Now()

	log.Printf("[ResyncArtist] Successfully resynced artist %s (%s): %d new releases",
		artistID, artistName, newReleasesCount)

	return result, nil
}
