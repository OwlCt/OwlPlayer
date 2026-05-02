package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
)

// PlayHistoryHandler handles play history API endpoints
type PlayHistoryHandler struct {
	playHistoryService *services.PlayHistoryService
	authMiddleware     *AuthMiddleware
}

// NewPlayHistoryHandler creates a new PlayHistoryHandler instance
func NewPlayHistoryHandler(playHistoryService *services.PlayHistoryService, authMiddleware *AuthMiddleware) *PlayHistoryHandler {
	return &PlayHistoryHandler{
		playHistoryService: playHistoryService,
		authMiddleware:     authMiddleware,
	}
}

// RegisterRoutes registers play history routes on the given mux
func (h *PlayHistoryHandler) RegisterRoutes(mux *http.ServeMux) {
	// All play history endpoints require authentication
	mux.HandleFunc("GET /api/play-history", h.authMiddleware.Authenticate(h.handleGetPlayHistory))
	mux.HandleFunc("POST /api/play-history", h.authMiddleware.Authenticate(h.handleRecordPlay))
	mux.HandleFunc("DELETE /api/play-history", h.authMiddleware.Authenticate(h.handleClearHistory))
	mux.HandleFunc("GET /api/play-history/top-artists", h.authMiddleware.Authenticate(h.handleGetTopArtists))
	mux.HandleFunc("GET /api/play-history/top-tracks", h.authMiddleware.Authenticate(h.handleGetTopTracks))
}

// =============================================================================
// Response Types
// =============================================================================

// GetPlayHistoryResponse represents the response for getting play history
type GetPlayHistoryResponse struct {
	Success bool                      `json:"success"`
	Items   []*models.PlayHistoryItem `json:"items"`
	Count   int                       `json:"count"`
}

// RecordPlayHistoryResponse represents the response for recording a play
type RecordPlayHistoryResponse struct {
	Success bool                `json:"success"`
	Item    *models.PlayHistory `json:"item"`
	Message string              `json:"message"`
}

// ClearPlayHistoryResponse represents the response for clearing history
type ClearPlayHistoryResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// GetTopArtistsResponse represents the response for getting top artists
type GetTopArtistsResponse struct {
	Success bool                    `json:"success"`
	Items   []*models.TopArtistItem `json:"items"`
	Count   int                     `json:"count"`
}

// GetTopTracksResponse represents the response for getting top tracks
type GetTopTracksResponse struct {
	Success bool                   `json:"success"`
	Items   []*models.TopTrackItem `json:"items"`
	Count   int                    `json:"count"`
}

// =============================================================================
// Helper Functions
// =============================================================================

func writePlayHistoryJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writePlayHistoryError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writePlayHistoryJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetPlayHistory returns play history for the current user
// GET /api/play-history?limit=50&offset=0
func (h *PlayHistoryHandler) handleGetPlayHistory(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlayHistoryError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Parse pagination parameters
	limit := 50
	offset := 0
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if parsed, err := strconv.Atoi(o); err == nil && parsed >= 0 {
			offset = parsed
		}
	}

	items, err := h.playHistoryService.GetPlayHistory(r.Context(), claims.UserID, limit, offset)
	if err != nil {
		log.Printf("Error getting play history for user %s: %v", claims.UserID, err)
		writePlayHistoryError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get play history")
		return
	}

	// Return empty array instead of null
	if items == nil {
		items = []*models.PlayHistoryItem{}
	}

	writePlayHistoryJSON(w, http.StatusOK, GetPlayHistoryResponse{
		Success: true,
		Items:   items,
		Count:   len(items),
	})
}

// handleRecordPlay records a play event
// POST /api/play-history
func (h *PlayHistoryHandler) handleRecordPlay(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlayHistoryError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.RecordPlayHistoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.SongID == "" {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}
	if req.SongName == "" {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song name is required")
		return
	}
	if req.ArtistID == "" {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Artist ID is required")
		return
	}
	if req.ArtistName == "" {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Artist name is required")
		return
	}
	if req.AlbumID == "" {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Album ID is required")
		return
	}
	if req.AlbumName == "" {
		writePlayHistoryError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Album name is required")
		return
	}

	item, err := h.playHistoryService.RecordPlay(r.Context(), claims.UserID, &req)
	if err != nil {
		log.Printf("Error recording play for user %s: %v", claims.UserID, err)
		writePlayHistoryError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to record play")
		return
	}

	writePlayHistoryJSON(w, http.StatusOK, RecordPlayHistoryResponse{
		Success: true,
		Item:    item,
		Message: "Play recorded",
	})
}

// handleClearHistory clears all play history for the current user
// DELETE /api/play-history
func (h *PlayHistoryHandler) handleClearHistory(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlayHistoryError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	err := h.playHistoryService.ClearHistory(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("Error clearing play history for user %s: %v", claims.UserID, err)
		writePlayHistoryError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to clear play history")
		return
	}

	writePlayHistoryJSON(w, http.StatusOK, ClearPlayHistoryResponse{
		Success: true,
		Message: "Play history cleared",
	})
}

// handleGetTopArtists returns top artists for the current month
// GET /api/play-history/top-artists?limit=4
func (h *PlayHistoryHandler) handleGetTopArtists(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlayHistoryError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Parse limit parameter
	limit := 4
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	items, err := h.playHistoryService.GetTopArtists(r.Context(), claims.UserID, limit)
	if err != nil {
		log.Printf("Error getting top artists for user %s: %v", claims.UserID, err)
		writePlayHistoryError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get top artists")
		return
	}

	// Return empty array instead of null
	if items == nil {
		items = []*models.TopArtistItem{}
	}

	writePlayHistoryJSON(w, http.StatusOK, GetTopArtistsResponse{
		Success: true,
		Items:   items,
		Count:   len(items),
	})
}

// handleGetTopTracks returns top tracks for the current month
// GET /api/play-history/top-tracks?limit=4
func (h *PlayHistoryHandler) handleGetTopTracks(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlayHistoryError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Parse limit parameter
	limit := 4
	if l := r.URL.Query().Get("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	items, err := h.playHistoryService.GetTopTracks(r.Context(), claims.UserID, limit)
	if err != nil {
		log.Printf("Error getting top tracks for user %s: %v", claims.UserID, err)
		writePlayHistoryError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get top tracks")
		return
	}

	// Return empty array instead of null
	if items == nil {
		items = []*models.TopTrackItem{}
	}

	writePlayHistoryJSON(w, http.StatusOK, GetTopTracksResponse{
		Success: true,
		Items:   items,
		Count:   len(items),
	})
}
