package services

import (
	"path/filepath"
	"testing"

	"main/models"
)

func TestValidateLocalMediaConfigDisabledAppliesDefaults(t *testing.T) {
	cfg := &LocalMediaConfig{}

	if err := ValidateLocalMediaConfig(cfg); err != nil {
		t.Fatalf("ValidateLocalMediaConfig() error = %v", err)
	}

	if cfg.ScanMode != models.LibraryScanModeStartupIncremental {
		t.Fatalf("expected default scan mode %q, got %q", models.LibraryScanModeStartupIncremental, cfg.ScanMode)
	}
	if cfg.CleanupPolicy != models.CleanupPolicyMarkUnavailable {
		t.Fatalf("expected default cleanup policy %q, got %q", models.CleanupPolicyMarkUnavailable, cfg.CleanupPolicy)
	}
	if cfg.AppleMusic.MatchThreshold != 0.75 {
		t.Fatalf("expected default match threshold 0.75, got %v", cfg.AppleMusic.MatchThreshold)
	}
}

func TestValidateLocalMediaConfigRejectsInvalidScanMode(t *testing.T) {
	root := t.TempDir()
	cfg := &LocalMediaConfig{
		Enabled:  true,
		Roots:    []string{root},
		ScanMode: "invalid",
	}

	if err := ValidateLocalMediaConfig(cfg); err == nil {
		t.Fatalf("expected invalid scan mode error")
	}
}

func TestValidateLocalMediaConfigRequiresRootsWhenEnabled(t *testing.T) {
	cfg := &LocalMediaConfig{
		Enabled: true,
	}

	if err := ValidateLocalMediaConfig(cfg); err == nil {
		t.Fatalf("expected missing roots error")
	}
}

func TestValidateLocalMediaConfigNormalizesAndDeduplicatesRoots(t *testing.T) {
	root := t.TempDir()
	cfg := &LocalMediaConfig{
		Enabled:  true,
		Roots:    []string{root, filepath.Join(root, ".")},
		ScanMode: models.LibraryScanModeStartupFull,
	}

	if err := ValidateLocalMediaConfig(cfg); err != nil {
		t.Fatalf("ValidateLocalMediaConfig() error = %v", err)
	}

	if len(cfg.Roots) != 1 {
		t.Fatalf("expected deduplicated root list, got %d entries", len(cfg.Roots))
	}
}

func TestValidateLocalMediaConfigRejectsLyricsWithoutMetadataEnhancement(t *testing.T) {
	root := t.TempDir()
	cfg := &LocalMediaConfig{
		Enabled:  true,
		Roots:    []string{root},
		ScanMode: models.LibraryScanModeManual,
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: false,
			LyricsEnhancement:   true,
			MatchThreshold:      0.9,
		},
	}

	if err := ValidateLocalMediaConfig(cfg); err == nil {
		t.Fatalf("expected lyrics enhancement dependency error")
	}
}
