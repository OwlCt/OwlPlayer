package services

import (
	"context"
	"fmt"
	"os"

	"github.com/OwlCt/OwlPlayer/utils/structs"

	"gopkg.in/yaml.v3"
)

// FileJWTConfig stores JWT bootstrap settings as serialized in YAML.
type FileJWTConfig struct {
	SecretKey          string `yaml:"secret-key"`
	AccessTokenExpiry  int    `yaml:"access-token-expiry"`
	RefreshTokenExpiry int    `yaml:"refresh-token-expiry"`
}

// FileSyncConfig keeps parsing compatibility for legacy sync config blocks.
type FileSyncConfig struct {
	Enabled        bool `yaml:"enabled"`
	RunOnStart     bool `yaml:"run-on-start"`
	IntervalHours  int  `yaml:"interval-hours"`
	RequestDelayMs int  `yaml:"request-delay-ms"`
}

// FileAppConfig is the bootstrap + legacy runtime config as stored on disk.
type FileAppConfig struct {
	structs.ConfigSet `yaml:",inline"`
	Database          DatabaseConfig   `yaml:"database"`
	JWT               FileJWTConfig    `yaml:"jwt"`
	Email             EmailConfig      `yaml:"email"`
	Sync              FileSyncConfig   `yaml:"sync"`
	LocalMedia        LocalMediaConfig `yaml:"local-media"`
}

// ConfigFileManager reads and writes bootstrap configuration files.
type ConfigFileManager struct {
	path string
}

// NewConfigFileManager creates a new config file manager.
func NewConfigFileManager(path string) *ConfigFileManager {
	return &ConfigFileManager{path: path}
}

// GetConfigPath resolves the active bootstrap config path.
func GetConfigPath() string {
	configPath := os.Getenv("CONFIG_PATH")
	if configPath == "" {
		return "config.yaml"
	}
	return configPath
}

// Load reads the config file into a typed structure.
func (m *ConfigFileManager) Load() (*FileAppConfig, error) {
	data, err := os.ReadFile(m.path)
	if err != nil {
		return nil, err
	}

	var cfg FileAppConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	cfg.Database.ApplyDefaults()
	return &cfg, nil
}

// LoadOrDefault reads the config file or returns an empty typed structure when absent.
func (m *ConfigFileManager) LoadOrDefault() (*FileAppConfig, error) {
	cfg, err := m.Load()
	if err == nil {
		return cfg, nil
	}
	if os.IsNotExist(err) {
		return &FileAppConfig{
			Database: *DefaultDatabaseConfig(),
		}, nil
	}
	return nil, err
}

func (m *ConfigFileManager) loadRaw() (map[string]any, error) {
	raw := map[string]any{}
	data, err := os.ReadFile(m.path)
	if err != nil {
		if os.IsNotExist(err) {
			return raw, nil
		}
		return nil, err
	}
	if len(data) == 0 {
		return raw, nil
	}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

// SaveBootstrapDatabase writes the database bootstrap settings back to the config file.
func (m *ConfigFileManager) SaveBootstrapDatabase(cfg *DatabaseConfig) error {
	if cfg == nil {
		return fmt.Errorf("database config is required")
	}

	raw, err := m.loadRaw()
	if err != nil {
		return err
	}

	normalized := *cfg
	normalized.ApplyDefaults()

	raw["database"] = map[string]any{
		"host":           normalized.Host,
		"port":           normalized.Port,
		"user":           normalized.User,
		"password":       normalized.Password,
		"dbname":         normalized.DBName,
		"sslmode":        normalized.SSLMode,
		"max-open-conns": normalized.MaxOpenConns,
		"max-idle-conns": normalized.MaxIdleConns,
	}

	data, err := yaml.Marshal(raw)
	if err != nil {
		return err
	}
	return os.WriteFile(m.path, data, 0644)
}

// TestDatabaseConfig verifies that a database config can be connected to.
func TestDatabaseConfig(ctx context.Context, cfg *DatabaseConfig) error {
	if cfg == nil {
		return fmt.Errorf("database config is required")
	}
	normalized := *cfg
	normalized.ApplyDefaults()

	db, err := NewDatabase(&normalized)
	if err != nil {
		return err
	}
	defer db.Close()

	return db.HealthCheck(ctx)
}
