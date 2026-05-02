package services

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"main/models"
)

type SettingSource string

const (
	SettingSourceBootstrapDefault SettingSource = "bootstrap-default"
	SettingSourceBootstrapFile    SettingSource = "bootstrap-file"
	SettingSourceSeeded           SettingSource = "seeded"
	SettingSourceDatabase         SettingSource = "database"
)

type ApplyMode string

const (
	ApplyModeImmediate       ApplyMode = "immediate"
	ApplyModeRestartRequired ApplyMode = "restart_required"
)

type SettingGroupStatus struct {
	Source          SettingSource `json:"source"`
	ApplyMode       ApplyMode     `json:"apply_mode"`
	RestartRequired bool          `json:"restart_required"`
}

type LocalMediaRuntimeSettings struct {
	Enabled       bool                  `json:"enabled"`
	Roots         []string              `json:"roots"`
	ScanMode      models.LibraryScanMode `json:"scan_mode"`
	CleanupPolicy models.CleanupPolicy   `json:"cleanup_policy"`
}

type AppleMusicRuntimeSettings struct {
	Storefront           string  `json:"storefront"`
	Language             string  `json:"language"`
	MediaUserToken       string  `json:"media_user_token"`
	MetadataEnhancement  bool    `json:"metadata_enhancement"`
	LyricsEnhancement    bool    `json:"lyrics_enhancement"`
	MatchThreshold       float64 `json:"match_threshold"`
}

type RuntimeSettingsMetadata struct {
	Email          SettingGroupStatus `json:"email"`
	LocalMedia     SettingGroupStatus `json:"local_media"`
	AppleMusic     SettingGroupStatus `json:"apple_music"`
	RestartRequired bool              `json:"restart_required"`
}

type RuntimeSettingsEnvelope struct {
	Email      EmailSettings              `json:"email"`
	LocalMedia LocalMediaRuntimeSettings  `json:"local_media"`
	AppleMusic AppleMusicRuntimeSettings  `json:"apple_music"`
	Metadata   RuntimeSettingsMetadata    `json:"metadata"`
}

const (
	keyRuntimeCompleted          = "setup.runtime_completed"
	keyPendingRestart            = "setup.pending_restart"
	keyEmailSource               = "setup.source.email"
	keyLocalMediaSource          = "setup.source.local_media"
	keyAppleMusicSource          = "setup.source.apple_music"
	keyLocalMediaEnabled         = "runtime.local_media.enabled"
	keyLocalMediaRoots           = "runtime.local_media.roots"
	keyLocalMediaScanMode        = "runtime.local_media.scan_mode"
	keyLocalMediaCleanupPolicy   = "runtime.local_media.cleanup_policy"
	keyAppleStorefront           = "runtime.apple_music.storefront"
	keyAppleLanguage             = "runtime.apple_music.language"
	keyAppleMediaUserToken       = "runtime.apple_music.media_user_token"
	keyAppleMetadataEnhancement  = "runtime.apple_music.metadata_enhancement"
	keyAppleLyricsEnhancement    = "runtime.apple_music.lyrics_enhancement"
	keyAppleMatchThreshold       = "runtime.apple_music.match_threshold"
)

func DefaultRuntimeSettings() *RuntimeSettingsEnvelope {
	localDefaults := DefaultLocalMediaConfig()
	return &RuntimeSettingsEnvelope{
		Email: EmailSettings{},
		LocalMedia: LocalMediaRuntimeSettings{
			Enabled:       localDefaults.Enabled,
			Roots:         []string{},
			ScanMode:      localDefaults.ScanMode,
			CleanupPolicy: localDefaults.CleanupPolicy,
		},
		AppleMusic: AppleMusicRuntimeSettings{
			MetadataEnhancement: localDefaults.AppleMusic.MetadataEnhancement,
			LyricsEnhancement:   localDefaults.AppleMusic.LyricsEnhancement,
			MatchThreshold:      localDefaults.AppleMusic.MatchThreshold,
		},
		Metadata: RuntimeSettingsMetadata{
			Email: SettingGroupStatus{
				Source:    SettingSourceDatabase,
				ApplyMode: ApplyModeImmediate,
			},
			LocalMedia: SettingGroupStatus{
				Source:    SettingSourceDatabase,
				ApplyMode: ApplyModeRestartRequired,
			},
			AppleMusic: SettingGroupStatus{
				Source:    SettingSourceDatabase,
				ApplyMode: ApplyModeRestartRequired,
			},
		},
	}
}

func (s *EmailSettings) IsEmpty() bool {
	if s == nil {
		return true
	}
	return strings.TrimSpace(s.SMTPHost) == "" &&
		s.SMTPPort == 0 &&
		strings.TrimSpace(s.SMTPUser) == "" &&
		s.SMTPPassword == "" &&
		strings.TrimSpace(s.FromAddress) == "" &&
		strings.TrimSpace(s.FromName) == "" &&
		!s.UseTLS
}

func (s *EmailSettings) ValidateOptional() error {
	if s == nil || s.IsEmpty() {
		return nil
	}
	return s.Validate()
}

func buildLocalMediaConfig(settings *RuntimeSettingsEnvelope) *LocalMediaConfig {
	if settings == nil {
		return nil
	}
	return &LocalMediaConfig{
		Enabled:       settings.LocalMedia.Enabled,
		Roots:         append([]string(nil), settings.LocalMedia.Roots...),
		ScanMode:      settings.LocalMedia.ScanMode,
		CleanupPolicy: settings.LocalMedia.CleanupPolicy,
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: settings.AppleMusic.MetadataEnhancement,
			LyricsEnhancement:   settings.AppleMusic.LyricsEnhancement,
			MatchThreshold:      settings.AppleMusic.MatchThreshold,
		},
	}
}

// BuildLocalMediaConfig converts runtime settings into the internal local media config shape.
func BuildLocalMediaConfig(settings *RuntimeSettingsEnvelope) *LocalMediaConfig {
	return buildLocalMediaConfig(settings)
}

func runtimeSettingsComplete(settings *RuntimeSettingsEnvelope) bool {
	if settings == nil {
		return false
	}
	return settings.LocalMedia.Enabled && len(settings.LocalMedia.Roots) > 0
}

// ValidateRuntimeLocalMediaConfig validates local media config plus Apple Music prerequisites.
func ValidateRuntimeLocalMediaConfig(cfg *LocalMediaConfig, storefront, mediaUserToken string) error {
	if cfg == nil {
		return fmt.Errorf("local media config is required")
	}
	if err := ValidateLocalMediaConfig(cfg); err != nil {
		return err
	}
	if cfg.Enabled && cfg.AppleMusic.MetadataEnhancement && strings.TrimSpace(storefront) == "" {
		return fmt.Errorf("storefront is required when Apple Music metadata enhancement is enabled")
	}
	if cfg.Enabled && cfg.AppleMusic.LyricsEnhancement && strings.TrimSpace(mediaUserToken) == "" {
		return fmt.Errorf("media_user_token is required when Apple Music lyrics enhancement is enabled")
	}
	return nil
}

func copyRuntimeSettings(settings *RuntimeSettingsEnvelope) *RuntimeSettingsEnvelope {
	if settings == nil {
		return nil
	}
	copy := *settings
	copy.LocalMedia.Roots = append([]string(nil), settings.LocalMedia.Roots...)
	return &copy
}

func localMediaEquals(a, b LocalMediaRuntimeSettings) bool {
	if a.Enabled != b.Enabled || a.ScanMode != b.ScanMode || a.CleanupPolicy != b.CleanupPolicy {
		return false
	}
	if len(a.Roots) != len(b.Roots) {
		return false
	}
	for i := range a.Roots {
		if a.Roots[i] != b.Roots[i] {
			return false
		}
	}
	return true
}

func appleMusicEquals(a, b AppleMusicRuntimeSettings) bool {
	return a.Storefront == b.Storefront &&
		a.Language == b.Language &&
		a.MediaUserToken == b.MediaUserToken &&
		a.MetadataEnhancement == b.MetadataEnhancement &&
		a.LyricsEnhancement == b.LyricsEnhancement &&
		a.MatchThreshold == b.MatchThreshold
}

func (s *SystemSettingsService) getGroupSource(ctx context.Context, key string) (SettingSource, error) {
	val, err := s.Get(ctx, key)
	if err != nil {
		return "", err
	}
	if val == "" {
		return SettingSourceDatabase, nil
	}
	return SettingSource(val), nil
}

func (s *SystemSettingsService) setGroupSource(ctx context.Context, key string, source SettingSource) error {
	return s.Set(ctx, key, string(source))
}

func (s *SystemSettingsService) GetPendingRestart(ctx context.Context) (bool, error) {
	val, err := s.Get(ctx, keyPendingRestart)
	if err != nil {
		return false, err
	}
	return val == "true", nil
}

func (s *SystemSettingsService) MarkRuntimeSettingsApplied(ctx context.Context) error {
	return s.Set(ctx, keyPendingRestart, "false")
}

func (s *SystemSettingsService) GetRuntimeSettings(ctx context.Context) (*RuntimeSettingsEnvelope, error) {
	settings := DefaultRuntimeSettings()

	if email, err := s.GetEmailSettings(ctx); err != nil {
		return nil, err
	} else if email != nil {
		settings.Email = *email
	}

	if val, err := s.Get(ctx, keyLocalMediaEnabled); err != nil {
		return nil, err
	} else if val != "" {
		settings.LocalMedia.Enabled = val == "true"
	}
	if val, err := s.Get(ctx, keyLocalMediaRoots); err != nil {
		return nil, err
	} else if val != "" {
		settings.LocalMedia.Roots = splitAndTrim(val)
	}
	if val, err := s.Get(ctx, keyLocalMediaScanMode); err != nil {
		return nil, err
	} else if val != "" {
		settings.LocalMedia.ScanMode = models.LibraryScanMode(val)
	}
	if val, err := s.Get(ctx, keyLocalMediaCleanupPolicy); err != nil {
		return nil, err
	} else if val != "" {
		settings.LocalMedia.CleanupPolicy = models.CleanupPolicy(val)
	}

	if val, err := s.Get(ctx, keyAppleStorefront); err != nil {
		return nil, err
	} else if val != "" {
		settings.AppleMusic.Storefront = val
	}
	if val, err := s.Get(ctx, keyAppleLanguage); err != nil {
		return nil, err
	} else if val != "" {
		settings.AppleMusic.Language = val
	}
	if val, err := s.Get(ctx, keyAppleMediaUserToken); err != nil {
		return nil, err
	} else if val != "" {
		settings.AppleMusic.MediaUserToken = val
	}
	if val, err := s.Get(ctx, keyAppleMetadataEnhancement); err != nil {
		return nil, err
	} else if val != "" {
		settings.AppleMusic.MetadataEnhancement = val == "true"
	}
	if val, err := s.Get(ctx, keyAppleLyricsEnhancement); err != nil {
		return nil, err
	} else if val != "" {
		settings.AppleMusic.LyricsEnhancement = val == "true"
	}
	if val, err := s.Get(ctx, keyAppleMatchThreshold); err != nil {
		return nil, err
	} else if val != "" {
		if parsed, err := strconv.ParseFloat(val, 64); err == nil {
			settings.AppleMusic.MatchThreshold = parsed
		}
	}

	emailSource, err := s.getGroupSource(ctx, keyEmailSource)
	if err != nil {
		return nil, err
	}
	localMediaSource, err := s.getGroupSource(ctx, keyLocalMediaSource)
	if err != nil {
		return nil, err
	}
	appleSource, err := s.getGroupSource(ctx, keyAppleMusicSource)
	if err != nil {
		return nil, err
	}
	pendingRestart, err := s.GetPendingRestart(ctx)
	if err != nil {
		return nil, err
	}

	settings.Metadata.Email.Source = emailSource
	settings.Metadata.LocalMedia.Source = localMediaSource
	settings.Metadata.AppleMusic.Source = appleSource
	settings.Metadata.Email.ApplyMode = ApplyModeImmediate
	settings.Metadata.LocalMedia.ApplyMode = ApplyModeRestartRequired
	settings.Metadata.AppleMusic.ApplyMode = ApplyModeRestartRequired
	settings.Metadata.RestartRequired = pendingRestart
	settings.Metadata.LocalMedia.RestartRequired = pendingRestart
	settings.Metadata.AppleMusic.RestartRequired = pendingRestart

	return settings, nil
}

func (s *SystemSettingsService) ValidateRuntimeSettings(settings *RuntimeSettingsEnvelope, requireLocalMedia bool) error {
	if settings == nil {
		return fmt.Errorf("runtime settings are required")
	}
	if err := settings.Email.ValidateOptional(); err != nil {
		return err
	}

	cfg := buildLocalMediaConfig(settings)
	if cfg == nil {
		return fmt.Errorf("local media config is required")
	}
	if requireLocalMedia && !cfg.Enabled {
		return fmt.Errorf("local media must be enabled during initial setup")
	}
	if requireLocalMedia && len(cfg.Roots) == 0 {
		return fmt.Errorf("local media roots are required during initial setup")
	}
	if err := ValidateLocalMediaConfig(cfg); err != nil {
		return err
	}
	if cfg.AppleMusic.MetadataEnhancement && strings.TrimSpace(settings.AppleMusic.Storefront) == "" {
		return fmt.Errorf("storefront is required when Apple Music metadata enhancement is enabled")
	}
	if cfg.AppleMusic.LyricsEnhancement && strings.TrimSpace(settings.AppleMusic.MediaUserToken) == "" {
		return fmt.Errorf("media_user_token is required when Apple Music lyrics enhancement is enabled")
	}
	return nil
}

func (s *SystemSettingsService) SetRuntimeSettings(ctx context.Context, settings *RuntimeSettingsEnvelope, source SettingSource, requireLocalMedia bool) (*RuntimeSettingsEnvelope, error) {
	if err := s.ValidateRuntimeSettings(settings, requireLocalMedia); err != nil {
		return nil, err
	}

	current, err := s.GetRuntimeSettings(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.SetEmailSettings(ctx, &settings.Email); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyLocalMediaEnabled, strconv.FormatBool(settings.LocalMedia.Enabled)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyLocalMediaRoots, joinStrings(settings.LocalMedia.Roots)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyLocalMediaScanMode, string(settings.LocalMedia.ScanMode)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyLocalMediaCleanupPolicy, string(settings.LocalMedia.CleanupPolicy)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyAppleStorefront, strings.TrimSpace(settings.AppleMusic.Storefront)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyAppleLanguage, strings.TrimSpace(settings.AppleMusic.Language)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyAppleMediaUserToken, settings.AppleMusic.MediaUserToken); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyAppleMetadataEnhancement, strconv.FormatBool(settings.AppleMusic.MetadataEnhancement)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyAppleLyricsEnhancement, strconv.FormatBool(settings.AppleMusic.LyricsEnhancement)); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyAppleMatchThreshold, strconv.FormatFloat(settings.AppleMusic.MatchThreshold, 'f', 3, 64)); err != nil {
		return nil, err
	}

	if err := s.setGroupSource(ctx, keyEmailSource, source); err != nil {
		return nil, err
	}
	if err := s.setGroupSource(ctx, keyLocalMediaSource, source); err != nil {
		return nil, err
	}
	if err := s.setGroupSource(ctx, keyAppleMusicSource, source); err != nil {
		return nil, err
	}

	if err := s.Set(ctx, keyRuntimeCompleted, strconv.FormatBool(runtimeSettingsComplete(settings))); err != nil {
		return nil, err
	}

	pendingRestart := !localMediaEquals(current.LocalMedia, settings.LocalMedia) || !appleMusicEquals(current.AppleMusic, settings.AppleMusic)
	if pendingRestart {
		if err := s.Set(ctx, keyPendingRestart, "true"); err != nil {
			return nil, err
		}
	}

	return s.GetRuntimeSettings(ctx)
}

func (s *SystemSettingsService) RuntimeSettingsComplete(ctx context.Context) (bool, error) {
	val, err := s.Get(ctx, keyRuntimeCompleted)
	if err != nil {
		return false, err
	}
	if val != "" {
		return val == "true", nil
	}
	settings, err := s.GetRuntimeSettings(ctx)
	if err != nil {
		return false, err
	}
	return runtimeSettingsComplete(settings), nil
}

func (s *SystemSettingsService) SeedRuntimeSettingsFromConfig(ctx context.Context, cfg *FileAppConfig) (*RuntimeSettingsEnvelope, error) {
	if cfg == nil {
		return s.GetRuntimeSettings(ctx)
	}

	current, err := s.GetRuntimeSettings(ctx)
	if err != nil {
		return nil, err
	}
	seeded := copyRuntimeSettings(current)
	changed := false

	if current.Metadata.Email.Source == SettingSourceDatabase && current.Email.IsEmpty() && cfg.Email.SMTPHost != "" {
		seeded.Email = EmailSettings{
			SMTPHost:     cfg.Email.SMTPHost,
			SMTPPort:     cfg.Email.SMTPPort,
			SMTPUser:     cfg.Email.SMTPUser,
			SMTPPassword: cfg.Email.SMTPPassword,
			FromAddress:  cfg.Email.FromAddress,
			FromName:     cfg.Email.FromName,
			UseTLS:       cfg.Email.UseTLS,
		}
		changed = true
	}

	if current.Metadata.LocalMedia.Source == SettingSourceDatabase && !current.LocalMedia.Enabled && len(current.LocalMedia.Roots) == 0 &&
		(cfg.LocalMedia.Enabled || len(cfg.LocalMedia.Roots) > 0) {
		seeded.LocalMedia = LocalMediaRuntimeSettings{
			Enabled:       cfg.LocalMedia.Enabled,
			Roots:         append([]string(nil), cfg.LocalMedia.Roots...),
			ScanMode:      cfg.LocalMedia.ScanMode,
			CleanupPolicy: cfg.LocalMedia.CleanupPolicy,
		}
		changed = true
	}

	if current.Metadata.AppleMusic.Source == SettingSourceDatabase &&
		current.AppleMusic.Storefront == "" &&
		current.AppleMusic.Language == "" &&
		current.AppleMusic.MediaUserToken == "" &&
		(cfg.Storefront != "" || cfg.Language != "" || cfg.MediaUserToken != "" ||
			cfg.LocalMedia.AppleMusic.MetadataEnhancement || cfg.LocalMedia.AppleMusic.LyricsEnhancement) {
		seeded.AppleMusic = AppleMusicRuntimeSettings{
			Storefront:          cfg.Storefront,
			Language:            cfg.Language,
			MediaUserToken:      cfg.MediaUserToken,
			MetadataEnhancement: cfg.LocalMedia.AppleMusic.MetadataEnhancement,
			LyricsEnhancement:   cfg.LocalMedia.AppleMusic.LyricsEnhancement,
			MatchThreshold:      cfg.LocalMedia.AppleMusic.MatchThreshold,
		}
		changed = true
	}

	if !changed {
		return current, nil
	}

	if err := s.ValidateRuntimeSettings(seeded, false); err != nil {
		return current, err
	}

	if !seeded.Email.IsEmpty() {
		if err := s.SetEmailSettings(ctx, &seeded.Email); err != nil {
			return nil, err
		}
		if err := s.setGroupSource(ctx, keyEmailSource, SettingSourceSeeded); err != nil {
			return nil, err
		}
	}
	if seeded.LocalMedia.Enabled || len(seeded.LocalMedia.Roots) > 0 {
		if err := s.Set(ctx, keyLocalMediaEnabled, strconv.FormatBool(seeded.LocalMedia.Enabled)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyLocalMediaRoots, joinStrings(seeded.LocalMedia.Roots)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyLocalMediaScanMode, string(seeded.LocalMedia.ScanMode)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyLocalMediaCleanupPolicy, string(seeded.LocalMedia.CleanupPolicy)); err != nil {
			return nil, err
		}
		if err := s.setGroupSource(ctx, keyLocalMediaSource, SettingSourceSeeded); err != nil {
			return nil, err
		}
	}
	if seeded.AppleMusic.Storefront != "" || seeded.AppleMusic.Language != "" || seeded.AppleMusic.MediaUserToken != "" ||
		seeded.AppleMusic.MetadataEnhancement || seeded.AppleMusic.LyricsEnhancement {
		if err := s.Set(ctx, keyAppleStorefront, strings.TrimSpace(seeded.AppleMusic.Storefront)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyAppleLanguage, strings.TrimSpace(seeded.AppleMusic.Language)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyAppleMediaUserToken, seeded.AppleMusic.MediaUserToken); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyAppleMetadataEnhancement, strconv.FormatBool(seeded.AppleMusic.MetadataEnhancement)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyAppleLyricsEnhancement, strconv.FormatBool(seeded.AppleMusic.LyricsEnhancement)); err != nil {
			return nil, err
		}
		if err := s.Set(ctx, keyAppleMatchThreshold, strconv.FormatFloat(seeded.AppleMusic.MatchThreshold, 'f', 3, 64)); err != nil {
			return nil, err
		}
		if err := s.setGroupSource(ctx, keyAppleMusicSource, SettingSourceSeeded); err != nil {
			return nil, err
		}
	}
	if err := s.Set(ctx, keyRuntimeCompleted, strconv.FormatBool(runtimeSettingsComplete(seeded))); err != nil {
		return nil, err
	}
	if err := s.Set(ctx, keyPendingRestart, "false"); err != nil {
		return nil, err
	}

	return s.GetRuntimeSettings(ctx)
}
