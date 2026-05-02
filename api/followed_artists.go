package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"main/models"
	"main/services"
)

// FollowedArtistsHandler handles followed artists API endpoints
type FollowedArtistsHandler struct {
	followedArtistsService *services.FollowedArtistsService
	authMiddleware         *AuthMiddleware
}

// NewFollowedArtistsHandler creates a new FollowedArtistsHandler instance
func NewFollowedArtistsHandler(followedArtistsService *services.FollowedArtistsService, authMiddleware *AuthMiddleware) *FollowedArtistsHandler {
	return &FollowedArtistsHandler{
		followedArtistsService: followedArtistsService,
		authMiddleware:         authMiddleware,
	}
}

// RegisterRoutes registers followed artists routes on the given mux
func (h *FollowedArtistsHandler) RegisterRoutes(mux *http.ServeMux) {
	// All followed artists endpoints require authentication
	mux.HandleFunc("GET /api/followed-artists", h.authMiddleware.Authenticate(h.handleGetFollowedArtists))
	mux.HandleFunc("POST /api/followed-artists", h.authMiddleware.Authenticate(h.handleFollowArtist))
	mux.HandleFunc("DELETE /api/followed-artists/{artistId}", h.authMiddleware.Authenticate(h.handleUnfollowArtist))
	mux.HandleFunc("GET /api/followed-artists/{artistId}", h.authMiddleware.Authenticate(h.handleCheckFollowedArtist))
}

// =============================================================================
// Response Types
// =============================================================================

// GetFollowedArtistsResponse represents the response for getting followed artists
type GetFollowedArtistsResponse struct {
	Success bool                     `json:"success"`
	Artists []*models.FollowedArtist `json:"artists"`
	Count   int                      `json:"count"`
}

// FollowArtistResponse represents the response for following an artist
type FollowArtistResponse struct {
	Success bool                   `json:"success"`
	Artist  *models.FollowedArtist `json:"artist"`
	Message string                 `json:"message"`
}

// UnfollowArtistResponse represents the response for unfollowing an artist
type UnfollowArtistResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// CheckFollowedArtistResponse represents the response for checking if an artist is followed
type CheckFollowedArtistResponse struct {
	Success  bool `json:"success"`
	Followed bool `json:"followed"`
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodeArtistAlreadyFollowed = "ARTIST_ALREADY_FOLLOWED"
	ErrCodeArtistNotFollowed     = "ARTIST_NOT_FOLLOWED"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writeFollowedArtistsJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeFollowedArtistsError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writeFollowedArtistsJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetFollowedArtists returns all followed artists for the current user
// GET /api/followed-artists
func (h *FollowedArtistsHandler) handleGetFollowedArtists(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeFollowedArtistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	artists, err := h.followedArtistsService.GetFollowedArtists(r.Context(), claims.UserID)
	if err != nil {
		log.Printf("Error getting followed artists for user %s: %v", claims.UserID, err)
		writeFollowedArtistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get followed artists")
		return
	}

	// Return empty array instead of null
	if artists == nil {
		artists = []*models.FollowedArtist{}
	}

	writeFollowedArtistsJSON(w, http.StatusOK, GetFollowedArtistsResponse{
		Success: true,
		Artists: artists,
		Count:   len(artists),
	})
}

// handleFollowArtist adds an artist to the user's followed list
// POST /api/followed-artists
func (h *FollowedArtistsHandler) handleFollowArtist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeFollowedArtistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.FollowArtistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeFollowedArtistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.ArtistID == "" {
		writeFollowedArtistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Artist ID is required")
		return
	}
	if req.ArtistName == "" {
		writeFollowedArtistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Artist name is required")
		return
	}

	artist, err := h.followedArtistsService.FollowArtist(r.Context(), claims.UserID, &req)
	if err != nil {
		if errors.Is(err, services.ErrArtistAlreadyFollowed) {
			writeFollowedArtistsError(w, http.StatusConflict, ErrCodeArtistAlreadyFollowed, "Artist is already followed")
			return
		}
		log.Printf("Error following artist %s for user %s: %v", req.ArtistID, claims.UserID, err)
		writeFollowedArtistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to follow artist")
		return
	}

	writeFollowedArtistsJSON(w, http.StatusCreated, FollowArtistResponse{
		Success: true,
		Artist:  artist,
		Message: "Artist followed",
	})
}

// handleUnfollowArtist removes an artist from the user's followed list
// DELETE /api/followed-artists/{artistId}
func (h *FollowedArtistsHandler) handleUnfollowArtist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeFollowedArtistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Extract artistId from path
	artistID := r.PathValue("artistId")
	if artistID == "" {
		// Fallback for older Go versions
		path := r.URL.Path
		artistID = strings.TrimPrefix(path, "/api/followed-artists/")
	}

	if artistID == "" {
		writeFollowedArtistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Artist ID is required")
		return
	}

	err := h.followedArtistsService.UnfollowArtist(r.Context(), claims.UserID, artistID)
	if err != nil {
		if errors.Is(err, services.ErrArtistNotFollowed) {
			writeFollowedArtistsError(w, http.StatusNotFound, ErrCodeArtistNotFollowed, "Artist is not followed")
			return
		}
		writeFollowedArtistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to unfollow artist")
		return
	}

	writeFollowedArtistsJSON(w, http.StatusOK, UnfollowArtistResponse{
		Success: true,
		Message: "Artist unfollowed",
	})
}

// handleCheckFollowedArtist checks if an artist is followed by the user
// GET /api/followed-artists/{artistId}
func (h *FollowedArtistsHandler) handleCheckFollowedArtist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeFollowedArtistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Extract artistId from path
	artistID := r.PathValue("artistId")
	if artistID == "" {
		path := r.URL.Path
		artistID = strings.TrimPrefix(path, "/api/followed-artists/")
	}

	if artistID == "" {
		writeFollowedArtistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Artist ID is required")
		return
	}

	followed, err := h.followedArtistsService.IsFollowed(r.Context(), claims.UserID, artistID)
	if err != nil {
		writeFollowedArtistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to check followed status")
		return
	}

	writeFollowedArtistsJSON(w, http.StatusOK, CheckFollowedArtistResponse{
		Success:  true,
		Followed: followed,
	})
}
