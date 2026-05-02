package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"main/models"
	"main/services"
)

func parseInt(s string) (int, error) {
	return strconv.Atoi(s)
}

// RecentlyPlayedHandler handles recently played API endpoints
type RecentlyPlayedHandler struct {
	recentlyPlayedService *services.RecentlyPlayedService
	authMiddleware        *AuthMiddleware
}

// NewRecentlyPlayedHandler creates a new RecentlyPlayedHandler instance
func NewRecentlyPlayedHandler(recentlyPlayedService *services.RecentlyPlayedService, authMiddleware *AuthMiddleware) *RecentlyPlayedHandler {
	return &RecentlyPlayedHandler{
		recentlyPlayedService: recentlyPlayedService,
		authMiddleware:        authMiddleware,
	}
}

// RegisterRoutes registers recently played routes on the given mux
func (h *RecentlyPlayedHandler) RegisterRoutes(mux *http.ServeMux) {
	// All recently played endpoints require authentication
	mux.HandleFunc("GET /api/recently-played", h.authMiddleware.Authenticate(h.handleGetRecentlyPlayed))
	mux.HandleFunc("POST /api/recently-played", h.authMiddleware.Authenticate(h.handleRecordPlay))
	mux.HandleFunc("DELETE /api/recently-played", h.authMiddleware.Authenticate(h.handleClearHistory))
}

// =============================================================================
// Response Types
// =============================================================================

// GetRecentlyPlayedResponse represents the response for getting recently played items
type GetRecentlyPlayedResponse struct {
	Success bool                         `json:"success"`
	Items   []*models.RecentlyPlayedItem `json:"items"`
	Count   int                          `json:"count"`
}

// GetRecentlyPlayedWithDetailsResponse represents the response with full details
type GetRecentlyPlayedWithDetailsResponse struct {
	Success bool                                    `json:"success"`
	Items   []*models.RecentlyPlayedItemWithDetails `json:"items"`
	Count   int                                     `json:"count"`
}

// RecordPlayResponse represents the response for recording a play
type RecordPlayResponse struct {
	Success bool                   `json:"success"`
	Item    *models.RecentlyPlayed `json:"item"`
	Message string                 `json:"message"`
}

// ClearHistoryResponse represents the response for clearing history
type ClearHistoryResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// =============================================================================
// Helper Functions
// =============================================================================

func writeRecentlyPlayedJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeRecentlyPlayedError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writeRecentlyPlayedJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetRecentlyPlayed returns all recently played items for the current user
// GET /api/recently-played
func (h *RecentlyPlayedHandler) handleGetRecentlyPlayed(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeRecentlyPlayedError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get limit from query params, default to 8
	limit := 8
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := parseInt(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	items, err := h.recentlyPlayedService.GetRecentlyPlayedWithDetails(r.Context(), claims.UserID, limit)
	if err != nil {
		log.Printf("Error getting recently played for user %s: %v", claims.UserID, err)
		writeRecentlyPlayedError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get recently played")
		return
	}

	// Return empty array instead of null
	if items == nil {
		items = []*models.RecentlyPlayedItemWithDetails{}
	}

	writeRecentlyPlayedJSON(w, http.StatusOK, GetRecentlyPlayedWithDetailsResponse{
		Success: true,
		Items:   items,
		Count:   len(items),
	})
}

// handleRecordPlay records a play for an item
// POST /api/recently-played
func (h *RecentlyPlayedHandler) handleRecordPlay(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeRecentlyPlayedError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.RecordPlayRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeRecentlyPlayedError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.ItemType == "" {
		writeRecentlyPlayedError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Item type is required")
		return
	}
	if req.ItemID == "" {
		writeRecentlyPlayedError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Item ID is required")
		return
	}

	// Validate item type
	validTypes := map[string]bool{
		"playlist":    true,
		"album":       true,
		"artist":      true,
		"liked-songs": true,
		"daily-mix":   true,
	}
	if !validTypes[req.ItemType] {
		writeRecentlyPlayedError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid item type")
		return
	}

	item, err := h.recentlyPlayedService.RecordPlay(r.Context(), claims.UserID, &req)
	if err != nil {
		log.Printf("Error recording play for user %s: %v", claims.UserID, err)
		writeRecentlyPlayedError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to record play")
		return
	}

	writeRecentlyPlayedJSON(w, http.StatusOK, RecordPlayResponse{
		Success: true,
		Item:    item,
		Message: "Play recorded",
	})
}

// handleClearHistory clears all recently played history for the current user
// DELETE /api/recently-played
func (h *RecentlyPlayedHandler) handleClearHistory(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeRecentlyPlayedError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	err := h.recentlyPlayedService.ClearHistory(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("Error clearing history for user %s: %v", claims.UserID, err)
		writeRecentlyPlayedError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to clear history")
		return
	}

	writeRecentlyPlayedJSON(w, http.StatusOK, ClearHistoryResponse{
		Success: true,
		Message: "History cleared",
	})
}
