package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"main/models"
	"main/services"
)

type slowScanRepo struct {
	delay  time.Duration
	taskID int64
}

func (r *slowScanRepo) SaveArtist(context.Context, *models.LocalArtist) (*models.LocalArtist, error) {
	return nil, nil
}

func (r *slowScanRepo) GetArtistByID(context.Context, int64) (*models.LocalArtist, error) {
	return nil, nil
}

func (r *slowScanRepo) SaveAlbum(context.Context, *models.LocalAlbum) (*models.LocalAlbum, error) {
	return nil, nil
}

func (r *slowScanRepo) GetAlbumByID(context.Context, int64) (*models.LocalAlbum, error) {
	return nil, nil
}

func (r *slowScanRepo) ListAlbumsByPrimaryArtistID(context.Context, int64) ([]*models.LocalAlbum, error) {
	return nil, nil
}

func (r *slowScanRepo) SaveMedia(context.Context, *models.LocalMedia) (*models.LocalMedia, error) {
	return nil, nil
}

func (r *slowScanRepo) GetMediaByID(context.Context, int64) (*models.LocalMedia, error) {
	return nil, nil
}

func (r *slowScanRepo) FindMediaByAlbumID(context.Context, int64) ([]*models.LocalMedia, error) {
	return nil, nil
}

func (r *slowScanRepo) FindMediaByPrimaryArtistID(context.Context, int64) ([]*models.LocalMedia, error) {
	return nil, nil
}

func (r *slowScanRepo) SaveMediaFile(context.Context, *models.LocalMediaFile) (*models.LocalMediaFile, error) {
	return nil, nil
}

func (r *slowScanRepo) GetMediaFileByID(context.Context, int64) (*models.LocalMediaFile, error) {
	return nil, nil
}

func (r *slowScanRepo) GetMediaFileByAbsolutePath(context.Context, string) (*models.LocalMediaFile, error) {
	return nil, nil
}

func (r *slowScanRepo) GetPrimaryMediaFileByMediaID(context.Context, int64) (*models.LocalMediaFile, error) {
	return nil, nil
}

func (r *slowScanRepo) SaveMetadataField(context.Context, *models.MetadataField) (*models.MetadataField, error) {
	return nil, nil
}

func (r *slowScanRepo) ListMetadataFields(context.Context, models.LocalEntityType, int64) ([]*models.MetadataField, error) {
	return nil, nil
}

func (r *slowScanRepo) SaveLyricsMapping(context.Context, *models.LyricsMapping) (*models.LyricsMapping, error) {
	return nil, nil
}

func (r *slowScanRepo) GetLyricsMappingByMediaID(context.Context, int64) (*models.LyricsMapping, error) {
	return nil, nil
}

func (r *slowScanRepo) CreateScanTask(_ context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	r.taskID++
	copy := *task
	copy.ID = r.taskID
	return &copy, nil
}

func (r *slowScanRepo) UpdateScanTask(_ context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	copy := *task
	return &copy, nil
}

func (r *slowScanRepo) GetActiveScanTask(context.Context, string) (*models.MediaScanTask, error) {
	return nil, nil
}

func (r *slowScanRepo) ListScanTasks(context.Context, int) ([]*models.MediaScanTask, error) {
	return []*models.MediaScanTask{}, nil
}

func (r *slowScanRepo) GetArtistByNormalizedName(context.Context, string) (*models.LocalArtist, error) {
	return nil, nil
}

func (r *slowScanRepo) GetAlbumByNormalizedTitle(context.Context, string, int64) (*models.LocalAlbum, error) {
	return nil, nil
}

func (r *slowScanRepo) ListMediaFilesByLibraryRoot(context.Context, string) ([]*models.LocalMediaFile, error) {
	time.Sleep(r.delay)
	return []*models.LocalMediaFile{}, nil
}

func (r *slowScanRepo) DeleteMedia(context.Context, int64) error {
	return nil
}

func (r *slowScanRepo) DeleteMediaFile(context.Context, int64) error {
	return nil
}

func (r *slowScanRepo) DeleteOrphanAlbums(context.Context) error {
	return nil
}

func (r *slowScanRepo) DeleteOrphanArtists(context.Context) error {
	return nil
}

func newAdminAuth(t *testing.T) (*AuthMiddleware, string) {
	t.Helper()
	jwtService := services.NewJWTService(&services.JWTConfig{
		SecretKey:          "test-secret-key-for-local-library-admin",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 24 * time.Hour,
	})
	middleware := NewAuthMiddleware(jwtService, nil)
	tokenPair, err := jwtService.GenerateTokenPair("admin-1", "admin@example.com", "admin", true, true)
	if err != nil {
		t.Fatalf("GenerateTokenPair() error = %v", err)
	}
	return middleware, tokenPair.AccessToken
}

func TestAdminLocalLibraryOverviewDisabledReturnsOverview(t *testing.T) {
	middleware, token := newAdminAuth(t)
	handler := NewAdminLocalLibraryHandler(
		services.NewLocalLibraryAdminService(nil, nil, nil, nil, services.LocalMediaConfig{}),
		nil,
		nil,
		middleware,
	)

	req := httptest.NewRequest(http.MethodGet, "/api/admin/local-library/overview", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rr := httptest.NewRecorder()

	Chain(middleware.Authenticate, middleware.RequireAdmin)(handler.handleGetOverview).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rr.Code)
	}

	var resp LocalLibraryOverviewResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if !resp.Success || resp.Overview == nil {
		t.Fatalf("expected success overview response, got %+v", resp)
	}
	if resp.Overview.Enabled {
		t.Fatalf("expected disabled local library overview")
	}
	if resp.Overview.DisabledReason == "" {
		t.Fatalf("expected disabled reason to be populated")
	}
}

func TestAdminLocalLibraryScanConflictReturnsConflict(t *testing.T) {
	middleware, token := newAdminAuth(t)
	repo := &slowScanRepo{delay: 300 * time.Millisecond}
	cfg := services.LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{t.TempDir()},
		ScanMode:      models.LibraryScanModeManual,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	}
	scanner := services.NewLocalMediaScanner(repo, cfg)
	service := services.NewLocalLibraryAdminService(nil, repo, scanner, nil, cfg)
	handler := NewAdminLocalLibraryHandler(service, nil, nil, middleware)

	if err := service.StartScan("incremental", "test"); err != nil {
		t.Fatalf("StartScan() error = %v", err)
	}
	defer time.Sleep(350 * time.Millisecond)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/local-library/scan", bytes.NewBufferString(`{"mode":"full"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	Chain(middleware.Authenticate, middleware.RequireAdmin)(handler.handleTriggerScan).ServeHTTP(rr, req)

	if rr.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d body=%s", rr.Code, rr.Body.String())
	}
}

func TestAdminLocalLibraryScrapeDisabledReturnsServiceUnavailable(t *testing.T) {
	middleware, token := newAdminAuth(t)
	cfg := services.LocalMediaConfig{Enabled: true}
	service := services.NewLocalLibraryAdminService(nil, nil, nil, nil, cfg)
	handler := NewAdminLocalLibraryHandler(service, nil, nil, middleware)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/local-library/scrape", bytes.NewBufferString(`{"scope":"unmatched"}`))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()

	Chain(middleware.Authenticate, middleware.RequireAdmin)(handler.handleTriggerScrape).ServeHTTP(rr, req)

	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body=%s", rr.Code, rr.Body.String())
	}
}
