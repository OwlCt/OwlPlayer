package services

import (
	"context"
	"fmt"
	"os"
	"strings"

	"main/models"
)

type SetupState string

const (
	SetupStateNeedsSetup      SetupState = "needs_setup"
	SetupStateRestartRequired SetupState = "restart_required"
	SetupStateReady           SetupState = "ready"
)

type BootstrapDatabaseSummary struct {
	Host    string        `json:"host"`
	Port    int           `json:"port"`
	User    string        `json:"user"`
	DBName  string        `json:"dbname"`
	SSLMode string        `json:"sslmode"`
	Source  SettingSource `json:"source"`
}

type SetupStatus struct {
	State                  SetupState              `json:"state"`
	SetupRequired          bool                    `json:"setup_required"`
	DatabaseConnected      bool                    `json:"database_connected"`
	BootstrapTokenRequired bool                    `json:"bootstrap_token_required"`
	HasInitialAdmin        bool                    `json:"has_initial_admin"`
	RuntimeConfigured      bool                    `json:"runtime_configured"`
	RestartRequired        bool                    `json:"restart_required"`
	Database               BootstrapDatabaseSummary `json:"database"`
}

type BootstrapAdminRequest struct {
	BootstrapToken string `json:"bootstrap_token"`
	Email          string `json:"email"`
	Username       string `json:"username"`
	Password       string `json:"password"`
}

type SetupService struct {
	configManager  *ConfigFileManager
	currentDB      *Database
	settingsSvc    *SystemSettingsService
	jwtService     *JWTService
	emailService   *EmailService
	bootstrapToken string
}

func NewSetupService(configManager *ConfigFileManager, currentDB *Database, settingsSvc *SystemSettingsService, jwtService *JWTService, emailService *EmailService) *SetupService {
	return &SetupService{
		configManager:  configManager,
		currentDB:      currentDB,
		settingsSvc:    settingsSvc,
		jwtService:     jwtService,
		emailService:   emailService,
		bootstrapToken: os.Getenv("SETUP_BOOTSTRAP_TOKEN"),
	}
}

func (s *SetupService) tokenRequired() bool {
	return strings.TrimSpace(s.bootstrapToken) != ""
}

func (s *SetupService) validateToken(token string) error {
	if !s.tokenRequired() {
		return nil
	}
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("bootstrap token is required")
	}
	if token != s.bootstrapToken {
		return fmt.Errorf("invalid bootstrap token")
	}
	return nil
}

func (s *SetupService) getBootstrapDatabaseSummary() BootstrapDatabaseSummary {
	summary := BootstrapDatabaseSummary{
		Source: SettingSourceBootstrapFile,
	}
	cfg, err := s.configManager.LoadOrDefault()
	if err != nil {
		return summary
	}
	summary.Host = cfg.Database.Host
	summary.Port = cfg.Database.Port
	summary.User = cfg.Database.User
	summary.DBName = cfg.Database.DBName
	summary.SSLMode = cfg.Database.SSLMode
	return summary
}

func ensureSetupDatabase(ctx context.Context, db *Database, jwtService *JWTService) error {
	if db == nil {
		return fmt.Errorf("database is required")
	}
	if err := db.RunMigrations(ctx, "migrations"); err != nil {
		return err
	}
	return NewUserService(db, nil, jwtService).EnsureSchema(ctx)
}

func (s *SetupService) useSetupDatabase(ctx context.Context) (*Database, *SystemSettingsService, func(), error) {
	if s.currentDB != nil {
		if err := s.currentDB.HealthCheck(ctx); err == nil {
			settingsSvc := s.settingsSvc
			if settingsSvc == nil {
				settingsSvc = NewSystemSettingsService(s.currentDB)
			}
			return s.currentDB, settingsSvc, func() {}, nil
		}
	}

	cfg, err := s.configManager.LoadOrDefault()
	if err != nil {
		return nil, nil, nil, err
	}
	cfg.Database.ApplyDefaults()

	db, err := NewDatabase(&cfg.Database)
	if err != nil {
		return nil, nil, nil, err
	}

	cleanup := func() { _ = db.Close() }
	if err := db.HealthCheck(ctx); err != nil {
		cleanup()
		return nil, nil, nil, err
	}
	if err := ensureSetupDatabase(ctx, db, s.jwtService); err != nil {
		cleanup()
		return nil, nil, nil, err
	}

	return db, NewSystemSettingsService(db), cleanup, nil
}

func queryHasInitialAdmin(ctx context.Context, db *Database) (bool, error) {
	var count int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE is_admin = true").Scan(&count); err != nil {
		return false, err
	}
	return count > 0, nil
}

func (s *SetupService) GetStatus(ctx context.Context) (*SetupStatus, error) {
	status := &SetupStatus{
		State:                  SetupStateNeedsSetup,
		SetupRequired:          true,
		BootstrapTokenRequired: s.tokenRequired(),
		Database:               s.getBootstrapDatabaseSummary(),
	}

	db, settingsSvc, cleanup, err := s.useSetupDatabase(ctx)
	if err != nil {
		return status, nil
	}
	defer cleanup()

	status.DatabaseConnected = true

	hasAdmin, err := queryHasInitialAdmin(ctx, db)
	if err != nil {
		return nil, err
	}
	status.HasInitialAdmin = hasAdmin

	runtimeConfigured, err := settingsSvc.RuntimeSettingsComplete(ctx)
	if err != nil {
		return nil, err
	}
	status.RuntimeConfigured = runtimeConfigured

	restartRequired, err := settingsSvc.GetPendingRestart(ctx)
	if err != nil {
		return nil, err
	}
	status.RestartRequired = restartRequired

	switch {
	case !status.HasInitialAdmin || !status.RuntimeConfigured:
		status.State = SetupStateNeedsSetup
		status.SetupRequired = true
	case restartRequired:
		status.State = SetupStateRestartRequired
		status.SetupRequired = true
	default:
		status.State = SetupStateReady
		status.SetupRequired = false
	}

	return status, nil
}

func (s *SetupService) TestDatabase(ctx context.Context, token string, cfg *DatabaseConfig) error {
	if err := s.validateToken(token); err != nil {
		return err
	}
	return TestDatabaseConfig(ctx, cfg)
}

func (s *SetupService) SaveBootstrapDatabase(ctx context.Context, token string, cfg *DatabaseConfig) (*SetupStatus, error) {
	if err := s.validateToken(token); err != nil {
		return nil, err
	}
	if err := TestDatabaseConfig(ctx, cfg); err != nil {
		return nil, err
	}
	if err := s.configManager.SaveBootstrapDatabase(cfg); err != nil {
		return nil, err
	}

	db, _, cleanup, err := s.useSetupDatabase(ctx)
	if err == nil {
		defer cleanup()
		_ = ensureSetupDatabase(ctx, db, s.jwtService)
	}

	return s.GetStatus(ctx)
}

func (s *SetupService) BootstrapAdmin(ctx context.Context, req *BootstrapAdminRequest) (*TokenPair, *models.User, error) {
	if req == nil {
		return nil, nil, fmt.Errorf("request is required")
	}
	if err := s.validateToken(req.BootstrapToken); err != nil {
		return nil, nil, err
	}

	db, _, cleanup, err := s.useSetupDatabase(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer cleanup()

	hasAdmin, err := queryHasInitialAdmin(ctx, db)
	if err != nil {
		return nil, nil, err
	}
	if hasAdmin {
		return nil, nil, fmt.Errorf("initial administrator already exists")
	}

	userService := NewUserService(db, s.emailService, s.jwtService)
	user, err := userService.Register(ctx, &RegisterRequest{
		Email:    req.Email,
		Username: req.Username,
		Password: req.Password,
	})
	if err != nil {
		return nil, nil, err
	}

	if s.jwtService == nil {
		return nil, nil, fmt.Errorf("JWT service is not configured")
	}

	tokenPair, err := s.jwtService.GenerateTokenPair(user.ID, user.Email, user.Username, user.IsAdmin, user.IsActive)
	if err != nil {
		return nil, nil, err
	}

	return tokenPair, user, nil
}

func (s *SetupService) SaveRuntimeSettings(ctx context.Context, token string, settings *RuntimeSettingsEnvelope) (*RuntimeSettingsEnvelope, error) {
	if err := s.validateToken(token); err != nil {
		return nil, err
	}

	db, settingsSvc, cleanup, err := s.useSetupDatabase(ctx)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	saved, err := settingsSvc.SetRuntimeSettings(ctx, settings, SettingSourceDatabase, true)
	if err != nil {
		return nil, err
	}

	// SMTP settings apply immediately for the current process when the active DB is already loaded.
	if s.emailService != nil && s.currentDB != nil && db == s.currentDB {
		s.emailService.UpdateConfig(saved.Email.ToEmailConfig())
	}

	return saved, nil
}
