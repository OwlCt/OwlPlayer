package api

import (
	"encoding/json"
	"net/http"

	"main/services"
)

// AdminHLSCacheHandler handles HLS cache management API endpoints
type AdminHLSCacheHandler struct {
	hlsCache   *services.HLSCacheService
	middleware *AuthMiddleware
}

// NewAdminHLSCacheHandler creates a new AdminHLSCacheHandler instance
func NewAdminHLSCacheHandler(hlsCache *services.HLSCacheService, middleware *AuthMiddleware) *AdminHLSCacheHandler {
	return &AdminHLSCacheHandler{
		hlsCache:   hlsCache,
		middleware: middleware,
	}
}

// RegisterRoutes registers HLS cache management routes on the given mux
func (h *AdminHLSCacheHandler) RegisterRoutes(mux *http.ServeMux) {
	// All HLS cache routes require authentication and admin privileges
	adminChain := Chain(h.middleware.Authenticate, h.middleware.RequireAdmin)

	mux.HandleFunc("GET /api/admin/hls-cache-settings", adminChain(h.handleGetSettings))
	mux.HandleFunc("PUT /api/admin/hls-cache-settings", adminChain(h.handleUpdateSettings))
	mux.HandleFunc("GET /api/admin/hls-cache-stats", adminChain(h.handleGetStats))
	mux.HandleFunc("POST /api/admin/clear-hls-cache", adminChain(h.handleClearCache))
}

// =============================================================================
// Response Types
// =============================================================================

// HLSCacheSettingsResponse represents the response for HLS cache settings
type HLSCacheSettingsResponse struct {
	Success  bool                       `json:"success"`
	Settings *services.HLSCacheSettings `json:"settings"`
}

// HLSCacheStatsResponse represents the response for HLS cache statistics
type HLSCacheStatsResponse struct {
	Success bool                   `json:"success"`
	Stats   *services.HLSCacheStats `json:"stats"`
}

// HLSCacheClearResponse represents the response for clearing HLS cache
type HLSCacheClearResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}


// =============================================================================
// Handlers
// =============================================================================

// handleGetSettings handles getting current HLS cache settings
// GET /api/admin/hls-cache-settings
// _Requirements: 8.5_
func (h *AdminHLSCacheHandler) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.hlsCache == nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "HLS cache service not available")
		return
	}

	settings := h.hlsCache.GetSettings()

	writeAuthJSON(w, http.StatusOK, HLSCacheSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}

// handleUpdateSettings handles updating HLS cache settings
// PUT /api/admin/hls-cache-settings
// _Requirements: 8.6_
func (h *AdminHLSCacheHandler) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.hlsCache == nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "HLS cache service not available")
		return
	}

	// Parse request body
	var settings services.HLSCacheSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate settings
	if err := settings.Validate(); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
		return
	}

	// Update settings
	if err := h.hlsCache.UpdateSettings(&settings); err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update HLS cache settings: "+err.Error())
		return
	}

	writeAuthJSON(w, http.StatusOK, HLSCacheSettingsResponse{
		Success:  true,
		Settings: &settings,
	})
}

// handleGetStats handles getting HLS cache statistics
// GET /api/admin/hls-cache-stats
// _Requirements: 8.7_
func (h *AdminHLSCacheHandler) handleGetStats(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.hlsCache == nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "HLS cache service not available")
		return
	}

	stats := h.hlsCache.GetStats()

	writeAuthJSON(w, http.StatusOK, HLSCacheStatsResponse{
		Success: true,
		Stats:   stats,
	})
}

// handleClearCache handles clearing all HLS cached files
// POST /api/admin/clear-hls-cache
// _Requirements: 8.8_
func (h *AdminHLSCacheHandler) handleClearCache(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	if h.hlsCache == nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "HLS cache service not available")
		return
	}

	// Clear HLS cache
	if err := h.hlsCache.Clear(); err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to clear HLS cache: "+err.Error())
		return
	}

	writeAuthJSON(w, http.StatusOK, HLSCacheClearResponse{
		Success: true,
		Message: "HLS cache cleared successfully",
	})
}
