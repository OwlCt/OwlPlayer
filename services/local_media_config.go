package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/OwlCt/OwlPlayer/models"
)

type LocalMediaConfig struct {
	Enabled       bool                       `yaml:"enabled"`
	Roots         []string                   `yaml:"roots"`
	ScanMode      models.LibraryScanMode     `yaml:"scan-mode"`
	CleanupPolicy models.CleanupPolicy       `yaml:"cleanup-policy"`
	AppleMusic    LocalMediaAppleMusicConfig `yaml:"apple-music"`
}

type LocalMediaAppleMusicConfig struct {
	MetadataEnhancement bool    `yaml:"metadata-enhancement"`
	LyricsEnhancement   bool    `yaml:"lyrics-enhancement"`
	MatchThreshold      float64 `yaml:"match-threshold"`
}

func DefaultLocalMediaConfig() LocalMediaConfig {
	return LocalMediaConfig{
		Enabled:       false,
		ScanMode:      models.LibraryScanModeStartupIncremental,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: false,
			LyricsEnhancement:   false,
			MatchThreshold:      0.75,
		},
	}
}

func (c *LocalMediaConfig) ApplyDefaults() {
	defaults := DefaultLocalMediaConfig()

	if c.ScanMode == "" {
		c.ScanMode = defaults.ScanMode
	}
	if c.CleanupPolicy == "" {
		c.CleanupPolicy = defaults.CleanupPolicy
	}
	if c.AppleMusic.MatchThreshold == 0 {
		c.AppleMusic.MatchThreshold = defaults.AppleMusic.MatchThreshold
	}
}

func ValidateLocalMediaConfig(cfg *LocalMediaConfig) error {
	if cfg == nil {
		return fmt.Errorf("local media config is required")
	}

	cfg.ApplyDefaults()

	if cfg.AppleMusic.MatchThreshold < 0 || cfg.AppleMusic.MatchThreshold > 1 {
		return fmt.Errorf("local media apple music match threshold must be between 0 and 1")
	}

	switch cfg.ScanMode {
	case models.LibraryScanModeManual,
		models.LibraryScanModeStartupFull,
		models.LibraryScanModeStartupIncremental,
		models.LibraryScanModeScheduled:
	default:
		return fmt.Errorf("unsupported local media scan mode %q", cfg.ScanMode)
	}

	switch cfg.CleanupPolicy {
	case models.CleanupPolicyMarkUnavailable, models.CleanupPolicyDeleteMissing:
	default:
		return fmt.Errorf("unsupported local media cleanup policy %q", cfg.CleanupPolicy)
	}

	if cfg.AppleMusic.LyricsEnhancement && !cfg.AppleMusic.MetadataEnhancement {
		return fmt.Errorf("local media lyrics enhancement requires metadata enhancement to be enabled")
	}

	if !cfg.Enabled {
		return nil
	}

	if len(cfg.Roots) == 0 {
		return fmt.Errorf("local media roots must contain at least one directory when enabled")
	}

	normalizedRoots := make([]string, 0, len(cfg.Roots))
	seen := make(map[string]struct{}, len(cfg.Roots))

	for _, root := range cfg.Roots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}

		absoluteRoot, err := filepath.Abs(root)
		if err != nil {
			return fmt.Errorf("failed to normalize local media root %q: %w", root, err)
		}
		absoluteRoot = filepath.Clean(absoluteRoot)

		info, err := os.Stat(absoluteRoot)
		if err != nil {
			return fmt.Errorf("local media root %q is not accessible: %w", absoluteRoot, err)
		}
		if !info.IsDir() {
			return fmt.Errorf("local media root %q is not a directory", absoluteRoot)
		}

		key := strings.ToLower(absoluteRoot)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		normalizedRoots = append(normalizedRoots, absoluteRoot)
	}

	if len(normalizedRoots) == 0 {
		return fmt.Errorf("local media roots must contain at least one non-empty directory when enabled")
	}

	cfg.Roots = normalizedRoots
	return nil
}
