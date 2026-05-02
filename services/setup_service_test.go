package services

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func newMockWrappedDatabase(t *testing.T) (*Database, sqlmock.Sqlmock) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.MonitorPingsOption(true))
	if err != nil {
		t.Fatalf("sqlmock.New() error = %v", err)
	}

	t.Cleanup(func() {
		_ = sqlDB.Close()
	})

	return &Database{
		DB:     sqlDB,
		config: DefaultDatabaseConfig(),
	}, mock
}

func newTestJWTService() *JWTService {
	return NewJWTService(&JWTConfig{
		SecretKey:          "test-secret",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 24 * time.Hour,
	})
}

func TestSetupServiceGetStatusNeedsSetupForFreshDeployment(t *testing.T) {
	db, mock := newMockWrappedDatabase(t)
	mock.ExpectPing()
	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM users WHERE is_admin = true").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery("SELECT value FROM system_settings WHERE key = \\$1").
		WithArgs(keyRuntimeCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("false"))
	mock.ExpectQuery("SELECT value FROM system_settings WHERE key = \\$1").
		WithArgs(keyPendingRestart).
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("false"))

	manager := NewConfigFileManager("non-existent.yaml")
	service := NewSetupService(manager, db, NewSystemSettingsService(db), newTestJWTService(), nil)

	status, err := service.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus() error = %v", err)
	}

	if status.State != SetupStateNeedsSetup {
		t.Fatalf("state = %q, want %q", status.State, SetupStateNeedsSetup)
	}
	if !status.SetupRequired {
		t.Fatalf("setup_required = false, want true")
	}
	if status.HasInitialAdmin {
		t.Fatalf("has_initial_admin = true, want false")
	}
	if status.RuntimeConfigured {
		t.Fatalf("runtime_configured = true, want false")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSetupServiceBootstrapAdminRejectsSecondBootstrap(t *testing.T) {
	db, mock := newMockWrappedDatabase(t)
	mock.ExpectPing()
	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM users WHERE is_admin = true").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	t.Setenv("SETUP_BOOTSTRAP_TOKEN", "bootstrap-token")
	manager := NewConfigFileManager("non-existent.yaml")
	service := NewSetupService(manager, db, NewSystemSettingsService(db), newTestJWTService(), nil)

	_, _, err := service.BootstrapAdmin(context.Background(), &BootstrapAdminRequest{
		BootstrapToken: "bootstrap-token",
		Email:          "admin@example.com",
		Username:       "admin",
		Password:       "password123",
	})
	if err == nil {
		t.Fatalf("expected bootstrap admin conflict error")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

func TestSetupServiceTokenRequirementFollowsEnvironment(t *testing.T) {
	db, mock := newMockWrappedDatabase(t)
	mock.ExpectPing()
	mock.ExpectQuery("SELECT COUNT\\(\\*\\) FROM users WHERE is_admin = true").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery("SELECT value FROM system_settings WHERE key = \\$1").
		WithArgs(keyRuntimeCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("true"))
	mock.ExpectQuery("SELECT value FROM system_settings WHERE key = \\$1").
		WithArgs(keyPendingRestart).
		WillReturnRows(sqlmock.NewRows([]string{"value"}).AddRow("false"))

	if err := os.Unsetenv("SETUP_BOOTSTRAP_TOKEN"); err != nil {
		t.Fatalf("Unsetenv() error = %v", err)
	}

	manager := NewConfigFileManager("non-existent.yaml")
	service := NewSetupService(manager, db, NewSystemSettingsService(db), newTestJWTService(), nil)
	status, err := service.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus() error = %v", err)
	}
	if status.BootstrapTokenRequired {
		t.Fatalf("bootstrap_token_required = true, want false")
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("ExpectationsWereMet() error = %v", err)
	}
}

