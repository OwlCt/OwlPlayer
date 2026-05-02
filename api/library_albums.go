package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"main/models"
	"main/services"
)

// LibraryAlbumsHandler handles library albums API endpoints
type LibraryAlbumsHandler struct {
	libraryAlbumsService *services.LibraryAlbumsService
	authMiddleware       *AuthMiddleware
}

// NewLibraryAlbumsHandler creates a new LibraryAlbumsHandler instance
func NewLibraryAlbumsHandler(libraryAlbumsService *services.LibraryAlbumsService, authMiddleware *AuthMiddleware) *LibraryAlbumsHandler {
	return &LibraryAlbumsHandler{
		libraryAlbumsService: libraryAlbumsService,
		authMiddleware:       authMiddleware,
	}
}

// RegisterRoutes registers library albums routes on the given mux
func (h *LibraryAlbumsHandler) RegisterRoutes(mux *http.ServeMux) {
	// All library albums endpoints require authentication
	mux.HandleFunc("GET /api/library-albums", h.authMiddleware.Authenticate(h.handleGetLibraryAlbums))
	mux.HandleFunc("POST /api/library-albums", h.authMiddleware.Authenticate(h.handleAddLibraryAlbum))
	mux.HandleFunc("DELETE /api/library-albums/{albumId}", h.authMiddleware.Authenticate(h.handleRemoveLibraryAlbum))
	mux.HandleFunc("GET /api/library-albums/{albumId}", h.authMiddleware.Authenticate(h.handleCheckLibraryAlbum))
}

// =============================================================================
// Response Types
// =============================================================================

// GetLibraryAlbumsResponse represents the response for getting library albums
type GetLibraryAlbumsResponse struct {
	Success bool                   `json:"success"`
	Albums  []*models.LibraryAlbum `json:"albums"`
	Count   int                    `json:"count"`
}

// AddLibraryAlbumResponse represents the response for adding a library album
type AddLibraryAlbumResponse struct {
	Success bool                 `json:"success"`
	Album   *models.LibraryAlbum `json:"album"`
	Message string               `json:"message"`
}

// RemoveLibraryAlbumResponse represents the response for removing a library album
type RemoveLibraryAlbumResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// CheckLibraryAlbumResponse represents the response for checking if an album is saved
type CheckLibraryAlbumResponse struct {
	Success bool `json:"success"`
	Saved   bool `json:"saved"`
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodeAlbumAlreadySaved = "ALBUM_ALREADY_SAVED"
	ErrCodeAlbumNotSaved     = "ALBUM_NOT_SAVED"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writeLibraryAlbumsJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeLibraryAlbumsError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writeLibraryAlbumsJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetLibraryAlbums returns all saved albums for the current user
// GET /api/library-albums
func (h *LibraryAlbumsHandler) handleGetLibraryAlbums(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLibraryAlbumsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	albums, err := h.libraryAlbumsService.GetLibraryAlbums(r.Context(), claims.UserID)
	if err != nil {
		writeLibraryAlbumsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get library albums")
		return
	}

	// Return empty array instead of null
	if albums == nil {
		albums = []*models.LibraryAlbum{}
	}

	writeLibraryAlbumsJSON(w, http.StatusOK, GetLibraryAlbumsResponse{
		Success: true,
		Albums:  albums,
		Count:   len(albums),
	})
}

// handleAddLibraryAlbum adds an album to the user's library
// POST /api/library-albums
func (h *LibraryAlbumsHandler) handleAddLibraryAlbum(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLibraryAlbumsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.AddLibraryAlbumRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeLibraryAlbumsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.AlbumID == "" {
		writeLibraryAlbumsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Album ID is required")
		return
	}
	if req.AlbumName == "" {
		writeLibraryAlbumsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Album name is required")
		return
	}

	album, err := h.libraryAlbumsService.AddLibraryAlbum(r.Context(), claims.UserID, &req)
	if err != nil {
		if errors.Is(err, services.ErrAlbumAlreadySaved) {
			writeLibraryAlbumsError(w, http.StatusConflict, ErrCodeAlbumAlreadySaved, "Album is already saved")
			return
		}
		writeLibraryAlbumsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to add library album")
		return
	}

	writeLibraryAlbumsJSON(w, http.StatusCreated, AddLibraryAlbumResponse{
		Success: true,
		Album:   album,
		Message: "Album added to library",
	})
}

// handleRemoveLibraryAlbum removes an album from the user's library
// DELETE /api/library-albums/{albumId}
func (h *LibraryAlbumsHandler) handleRemoveLibraryAlbum(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLibraryAlbumsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Extract albumId from path
	albumID := r.PathValue("albumId")
	if albumID == "" {
		// Fallback for older Go versions
		path := r.URL.Path
		albumID = strings.TrimPrefix(path, "/api/library-albums/")
	}

	if albumID == "" {
		writeLibraryAlbumsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Album ID is required")
		return
	}

	err := h.libraryAlbumsService.RemoveLibraryAlbum(r.Context(), claims.UserID, albumID)
	if err != nil {
		if errors.Is(err, services.ErrAlbumNotSaved) {
			writeLibraryAlbumsError(w, http.StatusNotFound, ErrCodeAlbumNotSaved, "Album is not in library")
			return
		}
		writeLibraryAlbumsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to remove library album")
		return
	}

	writeLibraryAlbumsJSON(w, http.StatusOK, RemoveLibraryAlbumResponse{
		Success: true,
		Message: "Album removed from library",
	})
}

// handleCheckLibraryAlbum checks if an album is saved in the user's library
// GET /api/library-albums/{albumId}
func (h *LibraryAlbumsHandler) handleCheckLibraryAlbum(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeLibraryAlbumsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Extract albumId from path
	albumID := r.PathValue("albumId")
	if albumID == "" {
		path := r.URL.Path
		albumID = strings.TrimPrefix(path, "/api/library-albums/")
	}

	if albumID == "" {
		writeLibraryAlbumsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Album ID is required")
		return
	}

	saved, err := h.libraryAlbumsService.IsSaved(r.Context(), claims.UserID, albumID)
	if err != nil {
		writeLibraryAlbumsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to check saved status")
		return
	}

	writeLibraryAlbumsJSON(w, http.StatusOK, CheckLibraryAlbumResponse{
		Success: true,
		Saved:   saved,
	})
}
