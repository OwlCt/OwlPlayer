package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConfigFileManagerSaveBootstrapDatabasePreservesOtherSections(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.yaml")

	initial := `
jwt:
  secret-key: "secret"
local-media:
  enabled: true
  roots:
    - "/music"
database:
  host: "postgres"
  port: 5432
  user: "owlplayer"
  password: "old"
  dbname: "owlplayer"
  sslmode: "disable"
`
	if err := os.WriteFile(path, []byte(strings.TrimSpace(initial)), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	manager := NewConfigFileManager(path)
	err := manager.SaveBootstrapDatabase(&DatabaseConfig{
		Host:     "db.example.com",
		Port:     5433,
		User:     "external",
		Password: "new-password",
		DBName:   "owlplayer_prod",
		SSLMode:  "require",
	})
	if err != nil {
		t.Fatalf("SaveBootstrapDatabase() error = %v", err)
	}

	cfg, err := manager.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}

	if cfg.Database.Host != "db.example.com" || cfg.Database.Port != 5433 {
		t.Fatalf("database host/port not updated: %#v", cfg.Database)
	}
	if cfg.JWT.SecretKey != "secret" {
		t.Fatalf("jwt secret not preserved")
	}
	if !cfg.LocalMedia.Enabled || len(cfg.LocalMedia.Roots) != 1 || cfg.LocalMedia.Roots[0] != "/music" {
		t.Fatalf("local media settings not preserved: %#v", cfg.LocalMedia)
	}
}

