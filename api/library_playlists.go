package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/OwlCt/OwlPlayer/services"
)

// LibraryPlaylistsHandler handles library playlists API endpoints
type LibraryPlaylistsHandler struct {
	libraryPlaylistsService *services.LibraryPlaylistsService
	authMiddleware          *AuthMiddleware
}

// NewLibraryPlaylistsHandler creates a new LibraryPlaylistsHandler instance
func NewLibraryPlaylistsHandler(libraryPlaylistsService *services.LibraryPlaylistsService, authMiddleware *AuthMiddleware) *LibraryPlaylistsHandler {
	return &LibraryPlaylistsHandler{
		libraryPlaylistsService: libraryPlaylistsService,
		authMiddleware:          authMiddleware,
	}
}

// RegisterRoutes registers library playlists routes on the given mux
func (h *LibraryPlaylistsHandler) RegisterRoutes(mux *http.ServeMux) {
	// All routes require authentication and active account
	authChain := Chain(h.authMiddleware.Authenticate, h.authMiddleware.RequireActive)

	mux.HandleFunc("GET /api/library-playlists", authChain(h.handleGetLibraryPlaylists))
	mux.HandleFunc("POST /api/library-playlists", authChain(h.handleAddLibraryPlaylist))
	mux.HandleFunc("DELETE /api/library-playlists/{playlistId}", authChain(h.handleRemoveLibraryPlaylist))
	mux.HandleFunc("GET /api/library-playlists/{playlistId}/check", authChain(h.handleCheckLibraryPlaylist))
}

// AddLibraryPlaylistRequest represents the request body for adding a playlist to library
type AddLibraryPlaylistRequest struct {
	PlaylistID   string `json:"playlist_id"`
	PlaylistName string `json:"playlist_name"`
	CuratorName  string `json:"curator_name,omitempty"`
	ArtworkURL   string `json:"artwork_url,omitempty"`
}

// handleGetLibraryPlaylists handles GET /api/library-playlists
func (h *LibraryPlaylistsHandler) handleGetLibraryPlaylists(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlists, err := h.libraryPlaylistsService.GetLibraryPlaylists(r.Context(), claims.UserID)
	if err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get library playlists")
		return
	}

	writeAuthJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"playlists": playlists,
	})
}

// handleAddLibraryPlaylist handles POST /api/library-playlists
func (h *LibraryPlaylistsHandler) handleAddLibraryPlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req AddLibraryPlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate playlist ID (must start with "pl.")
	if !strings.HasPrefix(req.PlaylistID, "pl.") {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid Apple Music playlist ID")
		return
	}

	if req.PlaylistName == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist name is required")
		return
	}

	playlist := &services.LibraryPlaylist{
		PlaylistID:   req.PlaylistID,
		PlaylistName: req.PlaylistName,
		CuratorName:  req.CuratorName,
		ArtworkURL:   req.ArtworkURL,
	}

	result, err := h.libraryPlaylistsService.AddLibraryPlaylist(r.Context(), claims.UserID, playlist)
	if err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to add playlist to library")
		return
	}

	writeAuthJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"playlist": result,
	})
}

// handleRemoveLibraryPlaylist handles DELETE /api/library-playlists/{playlistId}
func (h *LibraryPlaylistsHandler) handleRemoveLibraryPlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := r.PathValue("playlistId")
	if playlistID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	err := h.libraryPlaylistsService.RemoveLibraryPlaylist(r.Context(), claims.UserID, playlistID)
	if err != nil {
		if errors.Is(err, services.ErrLibraryPlaylistNotFound) {
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "Playlist not in library")
			return
		}
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to remove playlist from library")
		return
	}

	writeAuthJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// handleCheckLibraryPlaylist handles GET /api/library-playlists/{playlistId}/check
func (h *LibraryPlaylistsHandler) handleCheckLibraryPlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := r.PathValue("playlistId")
	if playlistID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	inLibrary, err := h.libraryPlaylistsService.IsInLibrary(r.Context(), claims.UserID, playlistID)
	if err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to check library status")
		return
	}

	writeAuthJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"in_library": inLibrary,
	})
}
