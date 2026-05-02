package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"main/models"
	"main/services"
)

// PlaybackStateHandler handles playback state API endpoints
type PlaybackStateHandler struct {
	playbackStateService *services.PlaybackStateService
	authMiddleware       *AuthMiddleware
}

// NewPlaybackStateHandler creates a new PlaybackStateHandler instance
func NewPlaybackStateHandler(playbackStateService *services.PlaybackStateService, authMiddleware *AuthMiddleware) *PlaybackStateHandler {
	return &PlaybackStateHandler{
		playbackStateService: playbackStateService,
		authMiddleware:       authMiddleware,
	}
}

// RegisterRoutes registers playback state routes on the given mux
func (h *PlaybackStateHandler) RegisterRoutes(mux *http.ServeMux) {
	// All playback state endpoints require authentication
	mux.HandleFunc("GET /api/playback-state", h.authMiddleware.Authenticate(h.handleGetPlaybackState))
	mux.HandleFunc("POST /api/playback-state", h.authMiddleware.Authenticate(h.handleSavePlaybackState))
	mux.HandleFunc("DELETE /api/playback-state", h.authMiddleware.Authenticate(h.handleDeletePlaybackState))
	mux.HandleFunc("POST /api/playback-state/progress", h.authMiddleware.Authenticate(h.handleSavePlaybackProgress))
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodePlaybackStateNotFound = "PLAYBACK_STATE_NOT_FOUND"
	ErrCodeInvalidPlayMode       = "INVALID_PLAY_MODE"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writePlaybackStateJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")
	w.Header().Add("Vary", "Authorization")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func derefString(p *string) string {
	if p == nil {
		return "NULL"
	}
	return *p
}

func writePlaybackStateError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writePlaybackStateJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetPlaybackState returns the playback state for the current user
// GET /api/playback-state
func (h *PlaybackStateHandler) handleGetPlaybackState(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaybackStateError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	state, err := h.playbackStateService.LoadPlaybackState(r.Context(), claims.UserID)
	if err != nil {
		if errors.Is(err, services.ErrPlaybackStateNotFound) {
			// Return empty state instead of error for new users
			writePlaybackStateJSON(w, http.StatusOK, models.GetPlaybackStateResponse{
				Success: true,
				State:   nil,
			})
			return
		}
		log.Printf("Failed to load playback state for user %s: %v", claims.UserID, err)
		writePlaybackStateError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get playback state")
		return
	}

	writePlaybackStateJSON(w, http.StatusOK, models.GetPlaybackStateResponse{
		Success: true,
		State:   state,
	})
}

// handleSavePlaybackState saves the playback state for the current user
// POST /api/playback-state
func (h *PlaybackStateHandler) handleSavePlaybackState(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaybackStateError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.SavePlaybackStateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlaybackStateError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate request
	if !req.Validate() {
		writePlaybackStateError(w, http.StatusBadRequest, ErrCodeInvalidPlayMode, "Invalid play mode or parameters")
		return
	}

	state := req.ToPlaybackState(claims.UserID)
	
	// Debug: log request source info to track where saves are coming from
	userAgent := r.Header.Get("User-Agent")
	contentType := r.Header.Get("Content-Type")
	referer := r.Header.Get("Referer")
	log.Printf("[PlaybackState] Save full state user=%s queue_len=%d index=%d position=%.2f shuffled=%t source_type=%s source_id=%s source_name=%s | UA=%s CT=%s Ref=%s",
		claims.UserID,
		len(state.QueueSongs),
		state.CurrentIndex,
		state.Position,
		state.IsShuffled,
		derefString(state.QueueSourceType),
		derefString(state.QueueSourceID),
		derefString(state.QueueSourceName),
		userAgent,
		contentType,
		referer,
	)
	err := h.playbackStateService.SavePlaybackState(r.Context(), state)
	if err != nil {
		if errors.Is(err, services.ErrInvalidPlayMode) {
			writePlaybackStateError(w, http.StatusBadRequest, ErrCodeInvalidPlayMode, "Invalid play mode")
			return
		}
		log.Printf("[PlaybackState] Save full state failed user=%s err=%v", claims.UserID, err)
		writePlaybackStateError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to save playback state")
		return
	}

	writePlaybackStateJSON(w, http.StatusOK, models.SavePlaybackStateResponse{
		Success: true,
		Message: "Playback state saved",
	})
}

// handleSavePlaybackProgress saves only the progress for the current user (lightweight)
// POST /api/playback-state/progress
func (h *PlaybackStateHandler) handleSavePlaybackProgress(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaybackStateError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.SavePlaybackProgressRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlaybackStateError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate request
	if !req.Validate() {
		writePlaybackStateError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid progress parameters")
		return
	}

	err := h.playbackStateService.SavePlaybackProgress(r.Context(), claims.UserID, req.CurrentIndex, req.Position, req.Volume)
	if err != nil {
		if errors.Is(err, services.ErrPlaybackStateNotFound) {
			// No existing state to update - this is expected for new users
			writePlaybackStateError(w, http.StatusNotFound, ErrCodePlaybackStateNotFound, "No playback state found to update")
			return
		}
		log.Printf("[PlaybackState] Save progress failed user=%s index=%d position=%.2f err=%v", claims.UserID, req.CurrentIndex, req.Position, err)
		writePlaybackStateError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to save playback progress")
		return
	}

	writePlaybackStateJSON(w, http.StatusOK, models.SavePlaybackProgressResponse{
		Success: true,
		Message: "Playback progress saved",
	})
}

// handleDeletePlaybackState deletes the playback state for the current user
// DELETE /api/playback-state
func (h *PlaybackStateHandler) handleDeletePlaybackState(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaybackStateError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	log.Printf("[PlaybackState] Delete state user=%s", claims.UserID)

	err := h.playbackStateService.DeletePlaybackState(r.Context(), claims.UserID)
	if err != nil {
		if errors.Is(err, services.ErrPlaybackStateNotFound) {
			// Not found is OK - state was already deleted or never existed
			writePlaybackStateJSON(w, http.StatusOK, map[string]interface{}{
				"success": true,
				"message": "Playback state deleted",
			})
			return
		}
		log.Printf("[PlaybackState] Delete state failed user=%s err=%v", claims.UserID, err)
		writePlaybackStateError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to delete playback state")
		return
	}

	writePlaybackStateJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Playback state deleted",
	})
}
