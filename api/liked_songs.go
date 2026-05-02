package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"main/models"
	"main/services"
)

// LikedSongsHandler handles liked songs API endpoints
type LikedSongsHandler struct {
	likedSongsService *services.LikedSongsService
	authMiddleware    *AuthMiddleware
}

// NewLikedSongsHandler creates a new LikedSongsHandler instance
func NewLikedSongsHandler(likedSongsService *services.LikedSongsService, authMiddleware *AuthMiddleware) *LikedSongsHandler {
	return &LikedSongsHandler{
		likedSongsService: likedSongsService,
		authMiddleware:    authMiddleware,
	}
}

// RegisterRoutes registers liked songs routes on the given mux
func (h *LikedSongsHandler) RegisterRoutes(mux *http.ServeMux) {
	// All liked songs endpoints require authentication
	mux.HandleFunc("GET /api/liked-songs", h.authMiddleware.Authenticate(h.handleGetLikedSongs))
	mux.HandleFunc("POST /api/liked-songs", h.authMiddleware.Authenticate(h.handleAddLikedSong))
	mux.HandleFunc("DELETE /api/liked-songs/{songId}", h.authMiddleware.Authenticate(h.handleRemoveLikedSong))
	mux.HandleFunc("GET /api/liked-songs/{songId}", h.authMiddleware.Authenticate(h.handleCheckLikedSong))
	mux.HandleFunc("POST /api/liked-songs/batch", h.authMiddleware.Authenticate(h.handleBatchCheckLiked))
}

// =============================================================================
// Response Types
// =============================================================================

// GetLikedSongsResponse represents the response for getting liked songs
type GetLikedSongsResponse struct {
	Success bool                `json:"success"`
	Songs   []*models.LikedSong `json:"songs"`
	Count   int                 `json:"count"`
}

// AddLikedSongResponse represents the response for adding a liked song
type AddLikedSongResponse struct {
	Success bool              `json:"success"`
	Song    *models.LikedSong `json:"song"`
	Message string            `json:"message"`
}

// RemoveLikedSongResponse represents the response for removing a liked song
type RemoveLikedSongResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// CheckLikedSongResponse represents the response for checking if a song is liked
type CheckLikedSongResponse struct {
	Success bool `json:"success"`
	Liked   bool `json:"liked"`
}

// BatchCheckLikedResponse represents the response for batch checking liked songs
type BatchCheckLikedResponse struct {
	Success     bool            `json:"success"`
	LikedStatus map[string]bool `json:"liked_status"`
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodeSongAlreadyLiked = "SONG_ALREADY_LIKED"
	ErrCodeSongNotLiked     = "SONG_NOT_LIKED"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writeLikedSongsJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeLikedSongsError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writeLikedSongsJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetLikedSongs returns all liked songs for the current user
// GET /api/liked-songs
func (h *LikedSongsHandler) handleGetLikedSongs(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLikedSongsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	songs, err := h.likedSongsService.GetLikedSongs(r.Context(), claims.UserID)
	if err != nil {
		writeLikedSongsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get liked songs")
		return
	}

	// Return empty array instead of null
	if songs == nil {
		songs = []*models.LikedSong{}
	}

	writeLikedSongsJSON(w, http.StatusOK, GetLikedSongsResponse{
		Success: true,
		Songs:   songs,
		Count:   len(songs),
	})
}

// handleAddLikedSong adds a song to the user's liked songs
// POST /api/liked-songs
func (h *LikedSongsHandler) handleAddLikedSong(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLikedSongsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.AddLikedSongRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeLikedSongsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.SongID == "" {
		writeLikedSongsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}
	if req.SongName == "" {
		writeLikedSongsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song name is required")
		return
	}

	song := req.ToSongItem()
	likedSong, err := h.likedSongsService.AddLikedSong(r.Context(), claims.UserID, song)
	if err != nil {
		if errors.Is(err, services.ErrSongAlreadyLiked) {
			writeLikedSongsError(w, http.StatusConflict, ErrCodeSongAlreadyLiked, "Song is already liked")
			return
		}
		writeLikedSongsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to add liked song")
		return
	}

	writeLikedSongsJSON(w, http.StatusCreated, AddLikedSongResponse{
		Success: true,
		Song:    likedSong,
		Message: "Song added to liked songs",
	})
}

// handleRemoveLikedSong removes a song from the user's liked songs
// DELETE /api/liked-songs/{songId}
func (h *LikedSongsHandler) handleRemoveLikedSong(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLikedSongsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Extract songId from path
	songID := r.PathValue("songId")
	if songID == "" {
		// Fallback for older Go versions
		path := r.URL.Path
		songID = strings.TrimPrefix(path, "/api/liked-songs/")
	}

	if songID == "" {
		writeLikedSongsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	err := h.likedSongsService.RemoveLikedSong(r.Context(), claims.UserID, songID)
	if err != nil {
		if errors.Is(err, services.ErrSongNotLiked) {
			writeLikedSongsError(w, http.StatusNotFound, ErrCodeSongNotLiked, "Song is not in liked songs")
			return
		}
		writeLikedSongsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to remove liked song")
		return
	}

	writeLikedSongsJSON(w, http.StatusOK, RemoveLikedSongResponse{
		Success: true,
		Message: "Song removed from liked songs",
	})
}

// handleCheckLikedSong checks if a song is liked by the current user
// GET /api/liked-songs/{songId}
func (h *LikedSongsHandler) handleCheckLikedSong(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLikedSongsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Extract songId from path
	songID := r.PathValue("songId")
	if songID == "" {
		path := r.URL.Path
		songID = strings.TrimPrefix(path, "/api/liked-songs/")
	}

	if songID == "" {
		writeLikedSongsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	liked, err := h.likedSongsService.IsLiked(r.Context(), claims.UserID, songID)
	if err != nil {
		writeLikedSongsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to check liked status")
		return
	}

	writeLikedSongsJSON(w, http.StatusOK, CheckLikedSongResponse{
		Success: true,
		Liked:   liked,
	})
}

// handleBatchCheckLiked checks if multiple songs are liked by the current user
// POST /api/liked-songs/batch
func (h *LikedSongsHandler) handleBatchCheckLiked(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLikedSongsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.BatchCheckLikedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeLikedSongsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	if len(req.SongIDs) == 0 {
		writeLikedSongsJSON(w, http.StatusOK, BatchCheckLikedResponse{
			Success:     true,
			LikedStatus: make(map[string]bool),
		})
		return
	}

	likedStatus, err := h.likedSongsService.BatchCheckLiked(r.Context(), claims.UserID, req.SongIDs)
	if err != nil {
		writeLikedSongsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to check liked status")
		return
	}

	writeLikedSongsJSON(w, http.StatusOK, BatchCheckLikedResponse{
		Success:     true,
		LikedStatus: likedStatus,
	})
}
