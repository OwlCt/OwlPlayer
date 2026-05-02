package services

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// CacheSettings holds audio cache configuration
type CacheSettings struct {
	MaxCacheSize   int64 `json:"max_cache_size"`   // Maximum cache size in bytes
	MaxCacheAge    int64 `json:"max_cache_age"`    // Maximum cache age in seconds
	IdleExpiryTime int64 `json:"idle_expiry_time"` // Idle expiry time in seconds
}

// EmailSettings holds SMTP email configuration stored in system settings.
type EmailSettings struct {
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     int    `json:"smtp_port"`
	SMTPUser     string `json:"smtp_user"`
	SMTPPassword string `json:"smtp_password"`
	FromAddress  string `json:"from_address"`
	FromName     string `json:"from_name"`
	UseTLS       bool   `json:"use_tls"`
}

// Validate checks if the email settings are valid enough to send mail.
func (s *EmailSettings) Validate() error {
	if strings.TrimSpace(s.SMTPHost) == "" {
		return fmt.Errorf("smtp_host is required")
	}
	if s.SMTPPort <= 0 || s.SMTPPort > 65535 {
		return fmt.Errorf("smtp_port must be between 1 and 65535")
	}
	if strings.TrimSpace(s.FromAddress) == "" {
		return fmt.Errorf("from_address is required")
	}
	return nil
}

// ToEmailConfig converts system settings into the runtime email config.
func (s *EmailSettings) ToEmailConfig() *EmailConfig {
	if s == nil {
		return nil
	}
	return &EmailConfig{
		SMTPHost:     strings.TrimSpace(s.SMTPHost),
		SMTPPort:     s.SMTPPort,
		SMTPUser:     strings.TrimSpace(s.SMTPUser),
		SMTPPassword: s.SMTPPassword,
		FromAddress:  strings.TrimSpace(s.FromAddress),
		FromName:     strings.TrimSpace(s.FromName),
		UseTLS:       s.UseTLS,
	}
}

// DefaultCacheSettings returns default cache settings
// 1GB max size, 30 days max age, 7 days idle expiry
func DefaultCacheSettings() *CacheSettings {
	return &CacheSettings{
		MaxCacheSize:   1024 * 1024 * 1024, // 1GB
		MaxCacheAge:    30 * 24 * 60 * 60,  // 30 days in seconds
		IdleExpiryTime: 7 * 24 * 60 * 60,   // 7 days in seconds
	}
}

// Validate checks if the cache settings are valid
func (s *CacheSettings) Validate() error {
	if s.MaxCacheSize <= 0 {
		return fmt.Errorf("max_cache_size must be positive")
	}
	if s.MaxCacheAge <= 0 {
		return fmt.Errorf("max_cache_age must be positive")
	}
	if s.IdleExpiryTime <= 0 {
		return fmt.Errorf("idle_expiry_time must be positive")
	}
	return nil
}

// SystemSettingsService manages system-wide settings in database
type SystemSettingsService struct {
	db *Database
}

// NewSystemSettingsService creates a new system settings service
func NewSystemSettingsService(db *Database) *SystemSettingsService {
	return &SystemSettingsService{db: db}
}

// Get retrieves a setting value by key
func (s *SystemSettingsService) Get(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		"SELECT value FROM system_settings WHERE key = $1",
		key,
	).Scan(&value)

	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("failed to get setting %s: %w", key, err)
	}
	return value, nil
}

// Set stores a setting value
func (s *SystemSettingsService) Set(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO system_settings (key, value, updated_at) 
		 VALUES ($1, $2, $3) 
		 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
		key, value, time.Now(),
	)
	if err != nil {
		return fmt.Errorf("failed to set setting %s: %w", key, err)
	}
	return nil
}

// GetEmailSettings retrieves SMTP email settings from the database.
func (s *SystemSettingsService) GetEmailSettings(ctx context.Context) (*EmailSettings, error) {
	settings := &EmailSettings{}

	if val, err := s.Get(ctx, "email.smtp_host"); err != nil {
		return nil, err
	} else if val != "" {
		settings.SMTPHost = val
	}

	if val, err := s.Get(ctx, "email.smtp_port"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed > 0 {
			settings.SMTPPort = parsed
		}
	}

	if val, err := s.Get(ctx, "email.smtp_user"); err != nil {
		return nil, err
	} else if val != "" {
		settings.SMTPUser = val
	}

	if val, err := s.Get(ctx, "email.smtp_password"); err != nil {
		return nil, err
	} else if val != "" {
		settings.SMTPPassword = val
	}

	if val, err := s.Get(ctx, "email.from_address"); err != nil {
		return nil, err
	} else if val != "" {
		settings.FromAddress = val
	}

	if val, err := s.Get(ctx, "email.from_name"); err != nil {
		return nil, err
	} else if val != "" {
		settings.FromName = val
	}

	if val, err := s.Get(ctx, "email.use_tls"); err != nil {
		return nil, err
	} else if val != "" {
		settings.UseTLS = val == "true"
	}

	return settings, nil
}

// SetEmailSettings stores SMTP email settings in the database.
func (s *SystemSettingsService) SetEmailSettings(ctx context.Context, settings *EmailSettings) error {
	if settings == nil {
		settings = &EmailSettings{}
	}
	if err := settings.ValidateOptional(); err != nil {
		return err
	}

	if err := s.Set(ctx, "email.smtp_host", strings.TrimSpace(settings.SMTPHost)); err != nil {
		return err
	}
	if err := s.Set(ctx, "email.smtp_port", strconv.Itoa(settings.SMTPPort)); err != nil {
		return err
	}
	if err := s.Set(ctx, "email.smtp_user", strings.TrimSpace(settings.SMTPUser)); err != nil {
		return err
	}
	if err := s.Set(ctx, "email.smtp_password", settings.SMTPPassword); err != nil {
		return err
	}
	if err := s.Set(ctx, "email.from_address", strings.TrimSpace(settings.FromAddress)); err != nil {
		return err
	}
	if err := s.Set(ctx, "email.from_name", strings.TrimSpace(settings.FromName)); err != nil {
		return err
	}

	useTLS := "false"
	if settings.UseTLS {
		useTLS = "true"
	}
	if err := s.Set(ctx, "email.use_tls", useTLS); err != nil {
		return err
	}

	return nil
}

// GetCacheSettings retrieves all cache-related settings
func (s *SystemSettingsService) GetCacheSettings(ctx context.Context) (*CacheSettings, error) {
	settings := DefaultCacheSettings()

	// Get max_cache_size
	if val, err := s.Get(ctx, "cache.max_size"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			settings.MaxCacheSize = parsed
		}
	}

	// Get max_cache_age
	if val, err := s.Get(ctx, "cache.max_age"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			settings.MaxCacheAge = parsed
		}
	}

	// Get idle_expiry_time
	if val, err := s.Get(ctx, "cache.idle_expiry"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			settings.IdleExpiryTime = parsed
		}
	}

	return settings, nil
}

// SetCacheSettings stores all cache-related settings
func (s *SystemSettingsService) SetCacheSettings(ctx context.Context, settings *CacheSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}

	// Set max_cache_size
	if err := s.Set(ctx, "cache.max_size", strconv.FormatInt(settings.MaxCacheSize, 10)); err != nil {
		return err
	}

	// Set max_cache_age
	if err := s.Set(ctx, "cache.max_age", strconv.FormatInt(settings.MaxCacheAge, 10)); err != nil {
		return err
	}

	// Set idle_expiry_time
	if err := s.Set(ctx, "cache.idle_expiry", strconv.FormatInt(settings.IdleExpiryTime, 10)); err != nil {
		return err
	}

	return nil
}

// SyncResult holds the last sync job result for persistence
type SyncResult struct {
	ProcessedArtists int    `json:"processed_artists"`
	NewReleases      int    `json:"new_releases"`
	Errors           int    `json:"errors"`
	Duration         string `json:"duration"`
	CompletedAt      string `json:"completed_at"`
}

// GetLastSyncResult retrieves the last sync result from database
func (s *SystemSettingsService) GetLastSyncResult(ctx context.Context) (*SyncResult, error) {
	result := &SyncResult{}

	// Get processed_artists
	if val, err := s.Get(ctx, "sync.last_processed_artists"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			result.ProcessedArtists = parsed
		}
	}

	// Get new_releases
	if val, err := s.Get(ctx, "sync.last_new_releases"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			result.NewReleases = parsed
		}
	}

	// Get errors
	if val, err := s.Get(ctx, "sync.last_errors"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			result.Errors = parsed
		}
	}

	// Get duration
	if val, err := s.Get(ctx, "sync.last_duration"); err != nil {
		return nil, err
	} else if val != "" {
		result.Duration = val
	}

	// Get completed_at
	if val, err := s.Get(ctx, "sync.last_completed_at"); err != nil {
		return nil, err
	} else if val != "" {
		result.CompletedAt = val
	}

	// Return nil if no result exists
	if result.CompletedAt == "" {
		return nil, nil
	}

	return result, nil
}

// SetLastSyncResult stores the last sync result to database
func (s *SystemSettingsService) SetLastSyncResult(ctx context.Context, result *SyncResult) error {
	// Set processed_artists
	if err := s.Set(ctx, "sync.last_processed_artists", strconv.Itoa(result.ProcessedArtists)); err != nil {
		return err
	}

	// Set new_releases
	if err := s.Set(ctx, "sync.last_new_releases", strconv.Itoa(result.NewReleases)); err != nil {
		return err
	}

	// Set errors
	if err := s.Set(ctx, "sync.last_errors", strconv.Itoa(result.Errors)); err != nil {
		return err
	}

	// Set duration
	if err := s.Set(ctx, "sync.last_duration", result.Duration); err != nil {
		return err
	}

	// Set completed_at
	if err := s.Set(ctx, "sync.last_completed_at", result.CompletedAt); err != nil {
		return err
	}

	return nil
}

// SyncScheduleSettings holds the sync schedule configuration
type SyncScheduleSettings struct {
	IntervalHours   int  `json:"interval_hours"`
	RequestDelayMs  int  `json:"request_delay_ms"`
	ScheduleEnabled bool `json:"schedule_enabled"`
	ScheduleHour    int  `json:"schedule_hour"`
	ScheduleMinute  int  `json:"schedule_minute"`
}

// DefaultSyncScheduleSettings returns default sync schedule settings
func DefaultSyncScheduleSettings() *SyncScheduleSettings {
	return &SyncScheduleSettings{
		IntervalHours:   24,
		RequestDelayMs:  2000,
		ScheduleEnabled: false,
		ScheduleHour:    3,
		ScheduleMinute:  0,
	}
}

// GetSyncScheduleSettings retrieves all sync schedule settings from database
func (s *SystemSettingsService) GetSyncScheduleSettings(ctx context.Context) (*SyncScheduleSettings, error) {
	settings := DefaultSyncScheduleSettings()

	// Get interval_hours
	if val, err := s.Get(ctx, "sync.interval_hours"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed > 0 {
			settings.IntervalHours = parsed
		}
	}

	// Get request_delay_ms
	if val, err := s.Get(ctx, "sync.request_delay_ms"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 0 {
			settings.RequestDelayMs = parsed
		}
	}

	// Get schedule_enabled
	if val, err := s.Get(ctx, "sync.schedule_enabled"); err != nil {
		return nil, err
	} else if val != "" {
		settings.ScheduleEnabled = val == "true"
	}

	// Get schedule_hour
	if val, err := s.Get(ctx, "sync.schedule_hour"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 0 && parsed <= 23 {
			settings.ScheduleHour = parsed
		}
	}

	// Get schedule_minute
	if val, err := s.Get(ctx, "sync.schedule_minute"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 0 && parsed <= 59 {
			settings.ScheduleMinute = parsed
		}
	}

	return settings, nil
}

// SetSyncScheduleSettings stores all sync schedule settings to database
func (s *SystemSettingsService) SetSyncScheduleSettings(ctx context.Context, settings *SyncScheduleSettings) error {
	// Set interval_hours
	if err := s.Set(ctx, "sync.interval_hours", strconv.Itoa(settings.IntervalHours)); err != nil {
		return err
	}

	// Set request_delay_ms
	if err := s.Set(ctx, "sync.request_delay_ms", strconv.Itoa(settings.RequestDelayMs)); err != nil {
		return err
	}

	// Set schedule_enabled
	enabledStr := "false"
	if settings.ScheduleEnabled {
		enabledStr = "true"
	}
	if err := s.Set(ctx, "sync.schedule_enabled", enabledStr); err != nil {
		return err
	}

	// Set schedule_hour
	if err := s.Set(ctx, "sync.schedule_hour", strconv.Itoa(settings.ScheduleHour)); err != nil {
		return err
	}

	// Set schedule_minute
	if err := s.Set(ctx, "sync.schedule_minute", strconv.Itoa(settings.ScheduleMinute)); err != nil {
		return err
	}

	return nil
}

// CollectionCacheSettings holds collection songs cache configuration
type CollectionCacheSettings struct {
	TTLHours    int  `json:"ttl_hours"`    // Cache TTL in hours (24-72)
	AutoRefresh bool `json:"auto_refresh"` // Whether to auto refresh cache
	RefreshHour int  `json:"refresh_hour"` // Hour of day to refresh (0-23)
}

// DefaultCollectionCacheSettings returns default collection cache settings
func DefaultCollectionCacheSettings() *CollectionCacheSettings {
	return &CollectionCacheSettings{
		TTLHours:    48,    // 48 hours default
		AutoRefresh: false, // Disabled by default
		RefreshHour: 5,     // 5 AM - refresh at dawn
	}
}

// Validate checks if the collection cache settings are valid
func (s *CollectionCacheSettings) Validate() error {
	if s.TTLHours < 24 || s.TTLHours > 72 {
		return fmt.Errorf("ttl_hours must be between 24 and 72")
	}
	if s.RefreshHour < 0 || s.RefreshHour > 23 {
		return fmt.Errorf("refresh_hour must be between 0 and 23")
	}
	return nil
}

// GetCollectionCacheSettings retrieves collection cache settings from database
func (s *SystemSettingsService) GetCollectionCacheSettings(ctx context.Context) (*CollectionCacheSettings, error) {
	settings := DefaultCollectionCacheSettings()

	// Get ttl_hours
	if val, err := s.Get(ctx, "collection_cache.ttl_hours"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 24 && parsed <= 72 {
			settings.TTLHours = parsed
		}
	}

	// Get auto_refresh
	if val, err := s.Get(ctx, "collection_cache.auto_refresh"); err != nil {
		return nil, err
	} else if val != "" {
		settings.AutoRefresh = val == "true"
	}

	// Get refresh_hour
	if val, err := s.Get(ctx, "collection_cache.refresh_hour"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 0 && parsed <= 23 {
			settings.RefreshHour = parsed
		}
	}

	return settings, nil
}

// SetCollectionCacheSettings stores collection cache settings to database
func (s *SystemSettingsService) SetCollectionCacheSettings(ctx context.Context, settings *CollectionCacheSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}

	// Set ttl_hours
	if err := s.Set(ctx, "collection_cache.ttl_hours", strconv.Itoa(settings.TTLHours)); err != nil {
		return err
	}

	// Set auto_refresh
	autoRefreshStr := "false"
	if settings.AutoRefresh {
		autoRefreshStr = "true"
	}
	if err := s.Set(ctx, "collection_cache.auto_refresh", autoRefreshStr); err != nil {
		return err
	}

	// Set refresh_hour
	if err := s.Set(ctx, "collection_cache.refresh_hour", strconv.Itoa(settings.RefreshHour)); err != nil {
		return err
	}

	return nil
}

// GetLikedAlbumsShuffleHour retrieves the hour at which liked albums should be reshuffled daily
func (s *SystemSettingsService) GetLikedAlbumsShuffleHour(ctx context.Context) (int, error) {
	val, err := s.Get(ctx, "liked_albums_cache.shuffle_hour")
	if err != nil {
		return 6, err // Default to 6 AM
	}
	if val == "" {
		return 6, nil // Default to 6 AM
	}
	hour, err := strconv.Atoi(val)
	if err != nil || hour < 0 || hour > 23 {
		return 6, nil // Default to 6 AM
	}
	return hour, nil
}

// SetLikedAlbumsShuffleHour sets the hour at which liked albums should be reshuffled daily
func (s *SystemSettingsService) SetLikedAlbumsShuffleHour(ctx context.Context, hour int) error {
	if hour < 0 || hour > 23 {
		return fmt.Errorf("shuffle_hour must be between 0 and 23")
	}
	return s.Set(ctx, "liked_albums_cache.shuffle_hour", strconv.Itoa(hour))
}

// TodayRecommendationsSettings holds today's recommendations configuration
type TodayRecommendationsSettings struct {
	ShuffleHour int `json:"shuffle_hour"` // Hour of day to reshuffle (0-23), default 4 AM
}

// DefaultTodayRecommendationsSettings returns default today's recommendations settings
func DefaultTodayRecommendationsSettings() *TodayRecommendationsSettings {
	return &TodayRecommendationsSettings{
		ShuffleHour: 4, // 4 AM default
	}
}

// GetTodayRecommendationsSettings retrieves today's recommendations settings from database
func (s *SystemSettingsService) GetTodayRecommendationsSettings(ctx context.Context) (*TodayRecommendationsSettings, error) {
	settings := DefaultTodayRecommendationsSettings()

	// Get shuffle_hour
	if val, err := s.Get(ctx, "today_recommendations.shuffle_hour"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 0 && parsed <= 23 {
			settings.ShuffleHour = parsed
		}
	}

	return settings, nil
}

// SetTodayRecommendationsSettings stores today's recommendations settings to database
func (s *SystemSettingsService) SetTodayRecommendationsSettings(ctx context.Context, settings *TodayRecommendationsSettings) error {
	if settings.ShuffleHour < 0 || settings.ShuffleHour > 23 {
		return fmt.Errorf("shuffle_hour must be between 0 and 23")
	}

	return s.Set(ctx, "today_recommendations.shuffle_hour", strconv.Itoa(settings.ShuffleHour))
}

// GetTodayRecommendationsShuffleHour retrieves the hour at which today's recommendations should be reshuffled daily
func (s *SystemSettingsService) GetTodayRecommendationsShuffleHour(ctx context.Context) (int, error) {
	val, err := s.Get(ctx, "today_recommendations.shuffle_hour")
	if err != nil {
		return 4, err // Default to 4 AM
	}
	if val == "" {
		return 4, nil // Default to 4 AM
	}
	hour, err := strconv.Atoi(val)
	if err != nil || hour < 0 || hour > 23 {
		return 4, nil // Default to 4 AM
	}
	return hour, nil
}

// SetTodayRecommendationsShuffleHour sets the hour at which today's recommendations should be reshuffled daily
func (s *SystemSettingsService) SetTodayRecommendationsShuffleHour(ctx context.Context, hour int) error {
	if hour < 0 || hour > 23 {
		return fmt.Errorf("shuffle_hour must be between 0 and 23")
	}
	return s.Set(ctx, "today_recommendations.shuffle_hour", strconv.Itoa(hour))
}

// CollectionRefreshStatus holds the status of a collection cache refresh task
type CollectionRefreshStatus struct {
	TaskType       string `json:"task_type"` // "hot_collections", "artist_playlists", "liked_albums", "today_recommendations"
	Status         string `json:"status"`    // "running", "completed", "failed"
	UsersRefreshed int    `json:"users_refreshed"`
	ErrorMessage   string `json:"error_message,omitempty"`
	StartedAt      string `json:"started_at"`
	CompletedAt    string `json:"completed_at,omitempty"`
	Duration       string `json:"duration,omitempty"`
}

// GetCollectionRefreshStatus retrieves the last refresh status for a task type
func (s *SystemSettingsService) GetCollectionRefreshStatus(ctx context.Context, taskType string) (*CollectionRefreshStatus, error) {
	status := &CollectionRefreshStatus{TaskType: taskType}

	prefix := "collection_refresh." + taskType + "."

	if val, err := s.Get(ctx, prefix+"status"); err != nil {
		return nil, err
	} else if val != "" {
		status.Status = val
	}

	if val, err := s.Get(ctx, prefix+"users_refreshed"); err == nil && val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			status.UsersRefreshed = parsed
		}
	}

	if val, err := s.Get(ctx, prefix+"error_message"); err == nil {
		status.ErrorMessage = val
	}

	if val, err := s.Get(ctx, prefix+"started_at"); err == nil {
		status.StartedAt = val
	}

	if val, err := s.Get(ctx, prefix+"completed_at"); err == nil {
		status.CompletedAt = val
	}

	if val, err := s.Get(ctx, prefix+"duration"); err == nil {
		status.Duration = val
	}

	// Return nil if no status exists
	if status.Status == "" {
		return nil, nil
	}

	return status, nil
}

// SetCollectionRefreshStatus stores the refresh status for a task type
func (s *SystemSettingsService) SetCollectionRefreshStatus(ctx context.Context, status *CollectionRefreshStatus) error {
	prefix := "collection_refresh." + status.TaskType + "."

	if err := s.Set(ctx, prefix+"status", status.Status); err != nil {
		return err
	}

	if err := s.Set(ctx, prefix+"users_refreshed", strconv.Itoa(status.UsersRefreshed)); err != nil {
		return err
	}

	if err := s.Set(ctx, prefix+"error_message", status.ErrorMessage); err != nil {
		return err
	}

	if err := s.Set(ctx, prefix+"started_at", status.StartedAt); err != nil {
		return err
	}

	if err := s.Set(ctx, prefix+"completed_at", status.CompletedAt); err != nil {
		return err
	}

	if err := s.Set(ctx, prefix+"duration", status.Duration); err != nil {
		return err
	}

	return nil
}

// GetAllCollectionRefreshStatuses retrieves all refresh statuses
func (s *SystemSettingsService) GetAllCollectionRefreshStatuses(ctx context.Context) ([]*CollectionRefreshStatus, error) {
	taskTypes := []string{"hot_collections", "artist_playlists", "liked_albums", "today_recommendations", "daily_mixes"}
	statuses := make([]*CollectionRefreshStatus, 0)

	for _, taskType := range taskTypes {
		status, err := s.GetCollectionRefreshStatus(ctx, taskType)
		if err != nil {
			continue
		}
		if status != nil {
			statuses = append(statuses, status)
		}
	}

	return statuses, nil
}

// GetDailyMixesShuffleHour retrieves the hour at which daily mixes should be reshuffled daily
func (s *SystemSettingsService) GetDailyMixesShuffleHour(ctx context.Context) (int, error) {
	val, err := s.Get(ctx, "daily_mixes.shuffle_hour")
	if err != nil {
		return 5, err // Default to 5 AM
	}
	if val == "" {
		return 5, nil
	}
	hour, err := strconv.Atoi(val)
	if err != nil || hour < 0 || hour > 23 {
		return 5, nil // Default to 5 AM
	}
	return hour, nil
}

// SetDailyMixesShuffleHour sets the hour at which daily mixes should be reshuffled daily
func (s *SystemSettingsService) SetDailyMixesShuffleHour(ctx context.Context, hour int) error {
	if hour < 0 || hour > 23 {
		return fmt.Errorf("shuffle_hour must be between 0 and 23")
	}
	return s.Set(ctx, "daily_mixes.shuffle_hour", strconv.Itoa(hour))
}

// DiscoverySettings holds discovery recommendation configuration
type DiscoverySettings struct {
	TodayDiscoveryRatio    float64 `json:"today_discovery_ratio"`     // Discovery ratio for today recommendations (0.0-1.0), default 0.3
	DailyMixDiscoveryRatio float64 `json:"daily_mix_discovery_ratio"` // Discovery ratio for daily mix (0.0-1.0), default 0.4
	DiscoverMinItems       int     `json:"discover_min_items"`        // Minimum items in discover section, default 10
	CacheTTLHours          int     `json:"cache_ttl_hours"`           // Discovery cache TTL in hours, default 24
}

// DefaultDiscoverySettings returns default discovery settings
func DefaultDiscoverySettings() *DiscoverySettings {
	return &DiscoverySettings{
		TodayDiscoveryRatio:    0.3, // 30% discovery content
		DailyMixDiscoveryRatio: 0.4, // 40% discovery content
		DiscoverMinItems:       10,
		CacheTTLHours:          24,
	}
}

// Validate checks if the discovery settings are valid
func (s *DiscoverySettings) Validate() error {
	if s.TodayDiscoveryRatio < 0 || s.TodayDiscoveryRatio > 1 {
		return fmt.Errorf("today_discovery_ratio must be between 0 and 1")
	}
	if s.DailyMixDiscoveryRatio < 0 || s.DailyMixDiscoveryRatio > 1 {
		return fmt.Errorf("daily_mix_discovery_ratio must be between 0 and 1")
	}
	if s.DiscoverMinItems < 1 {
		return fmt.Errorf("discover_min_items must be at least 1")
	}
	if s.CacheTTLHours < 1 || s.CacheTTLHours > 168 {
		return fmt.Errorf("cache_ttl_hours must be between 1 and 168")
	}
	return nil
}

// GetDiscoverySettings retrieves discovery settings from database
func (s *SystemSettingsService) GetDiscoverySettings(ctx context.Context) (*DiscoverySettings, error) {
	settings := DefaultDiscoverySettings()

	// Get today_discovery_ratio
	if val, err := s.Get(ctx, "discovery.today_ratio"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseFloat(val, 64); err == nil && parsed >= 0 && parsed <= 1 {
			settings.TodayDiscoveryRatio = parsed
		}
	}

	// Get daily_mix_discovery_ratio
	if val, err := s.Get(ctx, "discovery.daily_mix_ratio"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseFloat(val, 64); err == nil && parsed >= 0 && parsed <= 1 {
			settings.DailyMixDiscoveryRatio = parsed
		}
	}

	// Get discover_min_items
	if val, err := s.Get(ctx, "discovery.min_items"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 1 {
			settings.DiscoverMinItems = parsed
		}
	}

	// Get cache_ttl_hours
	if val, err := s.Get(ctx, "discovery.cache_ttl_hours"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.Atoi(val); err == nil && parsed >= 1 && parsed <= 168 {
			settings.CacheTTLHours = parsed
		}
	}

	return settings, nil
}

// SetDiscoverySettings stores discovery settings to database
func (s *SystemSettingsService) SetDiscoverySettings(ctx context.Context, settings *DiscoverySettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}

	// Set today_discovery_ratio
	if err := s.Set(ctx, "discovery.today_ratio", strconv.FormatFloat(settings.TodayDiscoveryRatio, 'f', 2, 64)); err != nil {
		return err
	}

	// Set daily_mix_discovery_ratio
	if err := s.Set(ctx, "discovery.daily_mix_ratio", strconv.FormatFloat(settings.DailyMixDiscoveryRatio, 'f', 2, 64)); err != nil {
		return err
	}

	// Set discover_min_items
	if err := s.Set(ctx, "discovery.min_items", strconv.Itoa(settings.DiscoverMinItems)); err != nil {
		return err
	}

	// Set cache_ttl_hours
	if err := s.Set(ctx, "discovery.cache_ttl_hours", strconv.Itoa(settings.CacheTTLHours)); err != nil {
		return err
	}

	return nil
}

// HLSCacheSettings holds HLS cache configuration
type HLSCacheSettings struct {
	MaxCacheSize   int64 `json:"max_cache_size"`   // Maximum cache size in bytes, default 5GB
	MaxCacheAge    int64 `json:"max_cache_age"`    // Maximum cache age in seconds, default 30 days
	IdleExpiryTime int64 `json:"idle_expiry_time"` // Idle expiry time in seconds, default 14 days
}

// DefaultHLSCacheSettings returns default HLS cache settings
// 5GB max size, 30 days max age, 14 days idle expiry
func DefaultHLSCacheSettings() *HLSCacheSettings {
	return &HLSCacheSettings{
		MaxCacheSize:   5 * 1024 * 1024 * 1024, // 5GB
		MaxCacheAge:    30 * 24 * 60 * 60,      // 30 days in seconds
		IdleExpiryTime: 14 * 24 * 60 * 60,      // 14 days in seconds
	}
}

// Validate checks if the HLS cache settings are valid
func (s *HLSCacheSettings) Validate() error {
	if s.MaxCacheSize <= 0 {
		return fmt.Errorf("max_cache_size must be positive")
	}
	if s.MaxCacheAge <= 0 {
		return fmt.Errorf("max_cache_age must be positive")
	}
	if s.IdleExpiryTime <= 0 {
		return fmt.Errorf("idle_expiry_time must be positive")
	}
	return nil
}

// GetHLSCacheSettings retrieves HLS cache settings from database
func (s *SystemSettingsService) GetHLSCacheSettings(ctx context.Context) (*HLSCacheSettings, error) {
	settings := DefaultHLSCacheSettings()

	// Get max_cache_size
	if val, err := s.Get(ctx, "hls_cache.max_size"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			settings.MaxCacheSize = parsed
		}
	}

	// Get max_cache_age
	if val, err := s.Get(ctx, "hls_cache.max_age"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			settings.MaxCacheAge = parsed
		}
	}

	// Get idle_expiry_time
	if val, err := s.Get(ctx, "hls_cache.idle_expiry"); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseInt(val, 10, 64); err == nil && parsed > 0 {
			settings.IdleExpiryTime = parsed
		}
	}

	return settings, nil
}

// SetHLSCacheSettings stores HLS cache settings to database
func (s *SystemSettingsService) SetHLSCacheSettings(ctx context.Context, settings *HLSCacheSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}

	// Set max_cache_size
	if err := s.Set(ctx, "hls_cache.max_size", strconv.FormatInt(settings.MaxCacheSize, 10)); err != nil {
		return err
	}

	// Set max_cache_age
	if err := s.Set(ctx, "hls_cache.max_age", strconv.FormatInt(settings.MaxCacheAge, 10)); err != nil {
		return err
	}

	// Set idle_expiry_time
	if err := s.Set(ctx, "hls_cache.idle_expiry", strconv.FormatInt(settings.IdleExpiryTime, 10)); err != nil {
		return err
	}

	return nil
}

// splitAndTrim splits a comma-separated string and trims whitespace
func splitAndTrim(s string) []string {
	if s == "" {
		return nil
	}
	parts := make([]string, 0)
	for _, part := range strings.Split(s, ",") {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			parts = append(parts, trimmed)
		}
	}
	return parts
}

// joinStrings joins strings with comma separator
func joinStrings(parts []string) string {
	return strings.Join(parts, ",")
}
