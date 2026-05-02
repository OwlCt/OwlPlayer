package api

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
)

// AdminSyncHandler handles admin sync-related API endpoints
type AdminSyncHandler struct {
	syncScheduler  *services.SyncJobScheduler
	snapshotSvc    *services.ArtistSnapshotService
	settingsSvc    *services.SystemSettingsService
	historySvc     *services.SyncHistoryService
	authMiddleware *AuthMiddleware
}

// NewAdminSyncHandler creates a new AdminSyncHandler instance
func NewAdminSyncHandler(syncScheduler *services.SyncJobScheduler, snapshotSvc *services.ArtistSnapshotService, settingsSvc *services.SystemSettingsService, historySvc *services.SyncHistoryService, authMiddleware *AuthMiddleware) *AdminSyncHandler {
	return &AdminSyncHandler{
		syncScheduler:  syncScheduler,
		snapshotSvc:    snapshotSvc,
		settingsSvc:    settingsSvc,
		historySvc:     historySvc,
		authMiddleware: authMiddleware,
	}
}

// RegisterRoutes registers admin sync routes on the given mux
func (h *AdminSyncHandler) RegisterRoutes(mux *http.ServeMux) {
	// All admin sync routes require authentication and admin privileges
	adminChain := Chain(h.authMiddleware.Authenticate, h.authMiddleware.RequireAdmin)

	mux.HandleFunc("POST /api/admin/sync/trigger", adminChain(h.handleTriggerSync))
	mux.HandleFunc("GET /api/admin/sync/status", adminChain(h.handleGetSyncStatus))
	mux.HandleFunc("GET /api/admin/sync/settings", adminChain(h.handleGetSyncSettings))
	mux.HandleFunc("PUT /api/admin/sync/settings", adminChain(h.handleUpdateSyncSettings))
	mux.HandleFunc("POST /api/admin/sync/clear-snapshots", adminChain(h.handleClearSnapshots))

	// Sync history routes
	mux.HandleFunc("GET /api/admin/sync/history", adminChain(h.handleGetSyncHistory))
	mux.HandleFunc("GET /api/admin/sync/history/{id}", adminChain(h.handleGetSyncHistoryDetail))
	mux.HandleFunc("POST /api/admin/sync/history/clear", adminChain(h.handleClearSyncHistory))

	// Artist resync routes
	mux.HandleFunc("POST /api/admin/sync/artist/{id}/resync", adminChain(h.handleResyncArtist))
	mux.HandleFunc("GET /api/admin/sync/artists", adminChain(h.handleGetSyncedArtists))
}

// =============================================================================
// Response Types
// =============================================================================

// SyncStatusResponse represents the response for sync status
type SyncStatusResponse struct {
	Success       bool              `json:"success"`
	IsRunning     bool              `json:"is_running"`
	LastResult    *SyncResultDetail `json:"last_result,omitempty"`
	SnapshotCount int               `json:"snapshot_count"`
}

// SyncResultDetail represents the details of a sync result
type SyncResultDetail struct {
	ProcessedArtists int    `json:"processed_artists"`
	NewReleases      int    `json:"new_releases"`
	Errors           int    `json:"errors"`
	Duration         string `json:"duration"`
	CompletedAt      string `json:"completed_at,omitempty"`
}

// TriggerSyncResponse represents the response for triggering a sync
type TriggerSyncResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// SyncSettingsResponse represents sync settings
type SyncSettingsResponse struct {
	Success  bool         `json:"success"`
	Settings SyncSettings `json:"settings"`
}

// SyncSettings represents configurable sync settings
type SyncSettings struct {
	IntervalHours   int  `json:"interval_hours"`
	RequestDelay    int  `json:"request_delay_ms"`
	ScheduleEnabled bool `json:"schedule_enabled"`
	ScheduleHour    int  `json:"schedule_hour"`
	ScheduleMinute  int  `json:"schedule_minute"`
}

// ClearSnapshotsResponse represents the response for clearing snapshots
type ClearSnapshotsResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Deleted int64  `json:"deleted"`
}

// SyncHistoryListResponse represents the response for sync history list
type SyncHistoryListResponse struct {
	Success   bool                  `json:"success"`
	Histories []*models.SyncHistory `json:"histories"`
	Count     int                   `json:"count"`
}

// SyncHistoryDetailResponse represents the response for sync history detail
type SyncHistoryDetailResponse struct {
	Success bool                `json:"success"`
	History *models.SyncHistory `json:"history"`
}

// ClearSyncHistoryResponse represents the response for clearing sync history
type ClearSyncHistoryResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Deleted int    `json:"deleted"`
}

// ArtistResyncResponse represents the response for artist resync
type ArtistResyncResponse struct {
	Success bool                         `json:"success"`
	Result  *services.ArtistResyncResult `json:"result"`
}

// SyncedArtistsResponse represents the response for synced artists list
type SyncedArtistsResponse struct {
	Success bool                     `json:"success"`
	Artists []*services.SyncedArtist `json:"artists"`
	Count   int                      `json:"count"`
}

// =============================================================================
// Helper Functions
// =============================================================================

func writeAdminSyncJSON(w http.ResponseWriter, status int, data interface{}) {
	writeAuthJSON(w, status, data)
}

func writeAdminSyncError(w http.ResponseWriter, status int, code, message string) {
	writeAuthError(w, status, code, message)
}

// =============================================================================
// Handlers
// =============================================================================

// handleTriggerSync triggers a manual sync job
// POST /api/admin/sync/trigger
func (h *AdminSyncHandler) handleTriggerSync(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Check if sync is already running
	if h.syncScheduler.IsRunning() {
		writeAdminSyncError(w, http.StatusConflict, "SYNC_ALREADY_RUNNING", "A sync job is already running")
		return
	}

	// Trigger sync in background with a detached context
	// Using context.Background() because r.Context() will be cancelled when the HTTP request completes
	go func() {
		_, _ = h.syncScheduler.RunOnce(context.Background())
	}()

	writeAdminSyncJSON(w, http.StatusAccepted, TriggerSyncResponse{
		Success: true,
		Message: "Sync job triggered successfully",
	})
}

// handleGetSyncStatus returns the current sync status
// GET /api/admin/sync/status
func (h *AdminSyncHandler) handleGetSyncStatus(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	isRunning := h.syncScheduler.IsRunning()
	lastResult := h.syncScheduler.GetLastResult()

	// Get snapshot count
	snapshotCount, _ := h.snapshotSvc.GetSnapshotCount(r.Context())

	response := SyncStatusResponse{
		Success:       true,
		IsRunning:     isRunning,
		SnapshotCount: snapshotCount,
	}

	if lastResult != nil {
		response.LastResult = &SyncResultDetail{
			ProcessedArtists: lastResult.ProcessedArtists,
			NewReleases:      lastResult.NewReleases,
			Errors:           lastResult.Errors,
			Duration:         lastResult.Duration.String(),
		}
		// Get completed_at from database
		if h.settingsSvc != nil {
			if dbResult, err := h.settingsSvc.GetLastSyncResult(r.Context()); err == nil && dbResult != nil {
				response.LastResult.CompletedAt = dbResult.CompletedAt
			}
		}
	}

	writeAdminSyncJSON(w, http.StatusOK, response)
}

// handleGetSyncSettings returns the current sync settings
// GET /api/admin/sync/settings
func (h *AdminSyncHandler) handleGetSyncSettings(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	settings := h.syncScheduler.GetSettings()

	writeAdminSyncJSON(w, http.StatusOK, SyncSettingsResponse{
		Success: true,
		Settings: SyncSettings{
			IntervalHours:   settings.IntervalHours,
			RequestDelay:    settings.RequestDelayMs,
			ScheduleEnabled: settings.ScheduleEnabled,
			ScheduleHour:    settings.ScheduleHour,
			ScheduleMinute:  settings.ScheduleMinute,
		},
	})
}

// handleUpdateSyncSettings updates the sync settings
// PUT /api/admin/sync/settings
func (h *AdminSyncHandler) handleUpdateSyncSettings(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req SyncSettings
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_REQUEST", "Invalid request body")
		return
	}

	// Validate settings
	if req.IntervalHours < 1 || req.IntervalHours > 168 {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_INTERVAL", "Interval must be between 1 and 168 hours")
		return
	}
	if req.RequestDelay < 0 || req.RequestDelay > 60000 {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_DELAY", "Request delay must be between 0 and 60000 ms")
		return
	}
	// Validate schedule time
	if req.ScheduleHour < 0 || req.ScheduleHour > 23 {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_SCHEDULE_HOUR", "Schedule hour must be between 0 and 23")
		return
	}
	if req.ScheduleMinute < 0 || req.ScheduleMinute > 59 {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_SCHEDULE_MINUTE", "Schedule minute must be between 0 and 59")
		return
	}

	h.syncScheduler.UpdateSettings(req.IntervalHours, req.RequestDelay)
	h.syncScheduler.UpdateScheduleSettings(req.ScheduleEnabled, req.ScheduleHour, req.ScheduleMinute)

	// Persist settings to database
	if err := h.syncScheduler.SaveSettingsToDB(r.Context()); err != nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "SAVE_FAILED", "Failed to save settings to database")
		return
	}

	writeAdminSyncJSON(w, http.StatusOK, SyncSettingsResponse{
		Success: true,
		Settings: SyncSettings{
			IntervalHours:   req.IntervalHours,
			RequestDelay:    req.RequestDelay,
			ScheduleEnabled: req.ScheduleEnabled,
			ScheduleHour:    req.ScheduleHour,
			ScheduleMinute:  req.ScheduleMinute,
		},
	})
}

// handleClearSnapshots clears all artist snapshots
// POST /api/admin/sync/clear-snapshots
func (h *AdminSyncHandler) handleClearSnapshots(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	deleted, err := h.snapshotSvc.DeleteAllSnapshots(r.Context())
	if err != nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "CLEAR_FAILED", "Failed to clear snapshots")
		return
	}

	writeAdminSyncJSON(w, http.StatusOK, ClearSnapshotsResponse{
		Success: true,
		Message: "All artist snapshots cleared successfully",
		Deleted: deleted,
	})
}

// handleGetSyncHistory returns the sync history list
// GET /api/admin/sync/history
func (h *AdminSyncHandler) handleGetSyncHistory(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.historySvc == nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "SERVICE_UNAVAILABLE", "Sync history service not available")
		return
	}

	histories, err := h.historySvc.GetRecentHistory(r.Context(), 7)
	if err != nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "FETCH_FAILED", "Failed to get sync history")
		return
	}

	if histories == nil {
		histories = []*models.SyncHistory{}
	}

	writeAdminSyncJSON(w, http.StatusOK, SyncHistoryListResponse{
		Success:   true,
		Histories: histories,
		Count:     len(histories),
	})
}

// handleGetSyncHistoryDetail returns a specific sync history record
// GET /api/admin/sync/history/{id}
func (h *AdminSyncHandler) handleGetSyncHistoryDetail(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.historySvc == nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "SERVICE_UNAVAILABLE", "Sync history service not available")
		return
	}

	historyID := r.PathValue("id")
	if historyID == "" {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_ID", "History ID is required")
		return
	}

	history, err := h.historySvc.GetHistory(r.Context(), historyID)
	if err != nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "FETCH_FAILED", "Failed to get sync history")
		return
	}

	if history == nil {
		writeAdminSyncError(w, http.StatusNotFound, "NOT_FOUND", "Sync history not found")
		return
	}

	writeAdminSyncJSON(w, http.StatusOK, SyncHistoryDetailResponse{
		Success: true,
		History: history,
	})
}

// handleClearSyncHistory clears all sync history records
// POST /api/admin/sync/history/clear
func (h *AdminSyncHandler) handleClearSyncHistory(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.historySvc == nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "SERVICE_UNAVAILABLE", "Sync history service not available")
		return
	}

	deleted, err := h.historySvc.ClearAllHistory(r.Context())
	if err != nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "CLEAR_FAILED", "Failed to clear sync history")
		return
	}

	writeAdminSyncJSON(w, http.StatusOK, ClearSyncHistoryResponse{
		Success: true,
		Message: "All sync history cleared successfully",
		Deleted: deleted,
	})
}

// handleResyncArtist triggers a resync for a single artist
// POST /api/admin/sync/artist/{id}/resync
func (h *AdminSyncHandler) handleResyncArtist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	artistID := r.PathValue("id")
	if artistID == "" {
		writeAdminSyncError(w, http.StatusBadRequest, "INVALID_ID", "Artist ID is required")
		return
	}

	result, err := h.syncScheduler.ResyncArtist(r.Context(), artistID)
	if err != nil {
		writeAdminSyncJSON(w, http.StatusOK, ArtistResyncResponse{
			Success: false,
			Result:  result,
		})
		return
	}

	writeAdminSyncJSON(w, http.StatusOK, ArtistResyncResponse{
		Success: true,
		Result:  result,
	})
}

// handleGetSyncedArtists returns the list of synced artists
// GET /api/admin/sync/artists
func (h *AdminSyncHandler) handleGetSyncedArtists(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAdminSyncError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	artists, err := h.snapshotSvc.GetAllSnapshots(r.Context())
	if err != nil {
		writeAdminSyncError(w, http.StatusInternalServerError, "FETCH_FAILED", "Failed to get synced artists")
		return
	}

	if artists == nil {
		artists = []*services.SyncedArtist{}
	}

	writeAdminSyncJSON(w, http.StatusOK, SyncedArtistsResponse{
		Success: true,
		Artists: artists,
		Count:   len(artists),
	})
}
