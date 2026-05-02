package api

import (
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
)

// PlaylistsDBHandler handles playlists API endpoints with database storage
type PlaylistsDBHandler struct {
	playlistsService     *services.PlaylistsDBService
	playlistCoverService *services.PlaylistCoverService
	authMiddleware       *AuthMiddleware
}

// NewPlaylistsDBHandler creates a new PlaylistsDBHandler instance
func NewPlaylistsDBHandler(playlistsService *services.PlaylistsDBService, playlistCoverService *services.PlaylistCoverService, authMiddleware *AuthMiddleware) *PlaylistsDBHandler {
	return &PlaylistsDBHandler{
		playlistsService:     playlistsService,
		playlistCoverService: playlistCoverService,
		authMiddleware:       authMiddleware,
	}
}

// RegisterRoutes registers playlists routes on the given mux
func (h *PlaylistsDBHandler) RegisterRoutes(mux *http.ServeMux) {
	// All playlists endpoints require authentication
	mux.HandleFunc("GET /api/playlists", h.authMiddleware.Authenticate(h.handleGetPlaylists))
	mux.HandleFunc("POST /api/playlists", h.authMiddleware.Authenticate(h.handleCreatePlaylist))
	mux.HandleFunc("GET /api/playlists/{id}", h.authMiddleware.Authenticate(h.handleGetPlaylist))
	mux.HandleFunc("PUT /api/playlists/{id}", h.authMiddleware.Authenticate(h.handleUpdatePlaylist))
	mux.HandleFunc("DELETE /api/playlists/{id}", h.authMiddleware.Authenticate(h.handleDeletePlaylist))
	mux.HandleFunc("GET /api/playlists/{id}/songs", h.authMiddleware.Authenticate(h.handleGetPlaylistSongs))
	mux.HandleFunc("POST /api/playlists/{id}/songs", h.authMiddleware.Authenticate(h.handleAddSongToPlaylist))
	mux.HandleFunc("DELETE /api/playlists/{id}/songs/{songId}", h.authMiddleware.Authenticate(h.handleRemoveSongFromPlaylist))
	mux.HandleFunc("PUT /api/playlists/{id}/songs/reorder", h.authMiddleware.Authenticate(h.handleReorderSongs))
	mux.HandleFunc("GET /api/song-playlists/{songId}", h.authMiddleware.Authenticate(h.handleGetSongPlaylists))
	// Playlist cover endpoints
	mux.HandleFunc("POST /api/playlists/{id}/cover", h.authMiddleware.Authenticate(h.handleUploadPlaylistCover))
	mux.HandleFunc("GET /api/playlist-covers/", h.handleServePlaylistCover)
}

// =============================================================================
// Response Types
// =============================================================================

// GetPlaylistsResponse represents the response for getting playlists
type GetPlaylistsResponse struct {
	Success   bool               `json:"success"`
	Playlists []*models.Playlist `json:"playlists"`
	Count     int                `json:"count"`
}

// PlaylistResponse represents the response for a single playlist
type PlaylistResponse struct {
	Success  bool             `json:"success"`
	Playlist *models.Playlist `json:"playlist"`
	Message  string           `json:"message,omitempty"`
}

// GetPlaylistSongsResponse represents the response for getting playlist songs
type GetPlaylistSongsResponse struct {
	Success bool                   `json:"success"`
	Songs   []*models.PlaylistSong `json:"songs"`
	Count   int                    `json:"count"`
}

// PlaylistSongResponse represents the response for a single playlist song operation
type PlaylistSongResponse struct {
	Success bool                 `json:"success"`
	Song    *models.PlaylistSong `json:"song,omitempty"`
	Message string               `json:"message"`
}

// GetSongPlaylistsResponse represents the response for getting playlists containing a song
type GetSongPlaylistsResponse struct {
	Success     bool     `json:"success"`
	PlaylistIDs []string `json:"playlist_ids"`
}

// UploadPlaylistCoverResponse represents the response for uploading a playlist cover
type UploadPlaylistCoverResponse struct {
	Success    bool   `json:"success"`
	ArtworkURL string `json:"artwork_url"`
	Message    string `json:"message"`
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodePlaylistNotFound      = "PLAYLIST_NOT_FOUND"
	ErrCodeSongAlreadyInPlaylist = "SONG_ALREADY_IN_PLAYLIST"
	ErrCodeSongNotInPlaylist     = "SONG_NOT_IN_PLAYLIST"
	ErrCodeCoverInvalidFormat    = "COVER_INVALID_FORMAT"
	ErrCodeCoverTooLarge         = "COVER_TOO_LARGE"
	ErrCodeCoverServiceNotConfig = "COVER_SERVICE_NOT_CONFIGURED"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writePlaylistsJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writePlaylistsError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writePlaylistsJSON(w, status, resp)
}

// extractPlaylistID extracts playlist ID from request path
func extractPlaylistID(r *http.Request) string {
	id := r.PathValue("id")
	if id == "" {
		// Fallback for older Go versions
		path := r.URL.Path
		parts := strings.Split(path, "/")
		for i, part := range parts {
			if part == "playlists" && i+1 < len(parts) {
				return parts[i+1]
			}
		}
	}
	return id
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetPlaylists returns all playlists for the current user
// GET /api/playlists
func (h *PlaylistsDBHandler) handleGetPlaylists(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlists, err := h.playlistsService.GetPlaylists(r.Context(), claims.UserID)
	if err != nil {
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get playlists")
		return
	}

	// Return empty array instead of null
	if playlists == nil {
		playlists = []*models.Playlist{}
	}

	writePlaylistsJSON(w, http.StatusOK, GetPlaylistsResponse{
		Success:   true,
		Playlists: playlists,
		Count:     len(playlists),
	})
}

// handleCreatePlaylist creates a new playlist
// POST /api/playlists
func (h *PlaylistsDBHandler) handleCreatePlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req models.CreatePlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Name == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist name is required")
		return
	}

	playlist, err := h.playlistsService.CreatePlaylist(r.Context(), claims.UserID, req.Name, req.Description)
	if err != nil {
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to create playlist")
		return
	}

	writePlaylistsJSON(w, http.StatusCreated, PlaylistResponse{
		Success:  true,
		Playlist: playlist,
		Message:  "Playlist created successfully",
	})
}

// handleGetPlaylist returns a single playlist
// GET /api/playlists/{id}
func (h *PlaylistsDBHandler) handleGetPlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	playlist, err := h.playlistsService.GetPlaylist(r.Context(), claims.UserID, playlistID)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		log.Printf("[ERROR] handleGetPlaylist failed for user=%s, playlist=%s: %v", claims.UserID, playlistID, err)
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get playlist")
		return
	}

	writePlaylistsJSON(w, http.StatusOK, PlaylistResponse{
		Success:  true,
		Playlist: playlist,
	})
}

// handleUpdatePlaylist updates a playlist
// PUT /api/playlists/{id}
// **Feature: playlist-edit-modal, Property 10: Cover removal persistence**
func (h *PlaylistsDBHandler) handleUpdatePlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	var req models.UpdatePlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Debug log
	log.Printf("[DEBUG] UpdatePlaylist request: name=%q, description=%q, clear_description=%v, clear_artwork=%v",
		req.Name, req.Description, req.ClearDescription, req.ClearArtwork)

	// If clearing artwork, get the current playlist to delete the file
	var oldArtworkURL string
	if req.ClearArtwork && h.playlistCoverService != nil {
		oldPlaylist, err := h.playlistsService.GetPlaylist(r.Context(), claims.UserID, playlistID)
		if err == nil && oldPlaylist.ArtworkURL != "" {
			oldArtworkURL = oldPlaylist.ArtworkURL
		}
	}

	playlist, err := h.playlistsService.UpdatePlaylist(r.Context(), claims.UserID, playlistID, &req)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update playlist")
		return
	}

	// Delete old cover file if artwork was cleared
	if req.ClearArtwork && oldArtworkURL != "" && h.playlistCoverService != nil {
		_ = h.playlistCoverService.DeletePlaylistCoverByURL(oldArtworkURL)
	}

	writePlaylistsJSON(w, http.StatusOK, PlaylistResponse{
		Success:  true,
		Playlist: playlist,
		Message:  "Playlist updated successfully",
	})
}

// handleDeletePlaylist deletes a playlist
// DELETE /api/playlists/{id}
func (h *PlaylistsDBHandler) handleDeletePlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	// Get playlist first to retrieve artwork URL for cleanup
	var artworkURL string
	if h.playlistCoverService != nil {
		playlist, err := h.playlistsService.GetPlaylist(r.Context(), claims.UserID, playlistID)
		if err == nil && playlist.ArtworkURL != "" {
			artworkURL = playlist.ArtworkURL
		}
	}

	err := h.playlistsService.DeletePlaylist(r.Context(), claims.UserID, playlistID)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to delete playlist")
		return
	}

	// Delete cover file if exists
	if artworkURL != "" && h.playlistCoverService != nil {
		_ = h.playlistCoverService.DeletePlaylistCoverByURL(artworkURL)
	}

	writePlaylistsJSON(w, http.StatusOK, PlaylistSongResponse{
		Success: true,
		Message: "Playlist deleted successfully",
	})
}

// handleGetPlaylistSongs returns all songs in a playlist
// GET /api/playlists/{id}/songs
func (h *PlaylistsDBHandler) handleGetPlaylistSongs(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	songs, err := h.playlistsService.GetPlaylistSongs(r.Context(), claims.UserID, playlistID)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get playlist songs")
		return
	}

	// Return empty array instead of null
	if songs == nil {
		songs = []*models.PlaylistSong{}
	}

	writePlaylistsJSON(w, http.StatusOK, GetPlaylistSongsResponse{
		Success: true,
		Songs:   songs,
		Count:   len(songs),
	})
}

// handleAddSongToPlaylist adds a song to a playlist
// POST /api/playlists/{id}/songs
func (h *PlaylistsDBHandler) handleAddSongToPlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	var req models.AddPlaylistSongRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.SongID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}
	if req.SongName == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song name is required")
		return
	}

	song, err := h.playlistsService.AddSongToPlaylist(r.Context(), claims.UserID, playlistID, &req)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		if errors.Is(err, services.ErrSongAlreadyInPlaylist) {
			writePlaylistsError(w, http.StatusConflict, ErrCodeSongAlreadyInPlaylist, "Song is already in playlist")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to add song to playlist")
		return
	}

	writePlaylistsJSON(w, http.StatusCreated, PlaylistSongResponse{
		Success: true,
		Song:    song,
		Message: "Song added to playlist",
	})
}

// handleRemoveSongFromPlaylist removes a song from a playlist
// DELETE /api/playlists/{id}/songs/{songId}
func (h *PlaylistsDBHandler) handleRemoveSongFromPlaylist(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	songID := r.PathValue("songId")
	if songID == "" {
		// Fallback for older Go versions
		path := r.URL.Path
		parts := strings.Split(path, "/")
		if len(parts) > 0 {
			songID = parts[len(parts)-1]
		}
	}

	if songID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	err := h.playlistsService.RemoveSongFromPlaylist(r.Context(), claims.UserID, playlistID, songID)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		if errors.Is(err, services.ErrSongNotInPlaylist) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodeSongNotInPlaylist, "Song is not in playlist")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to remove song from playlist")
		return
	}

	writePlaylistsJSON(w, http.StatusOK, PlaylistSongResponse{
		Success: true,
		Message: "Song removed from playlist",
	})
}

// handleReorderSongs reorders songs in a playlist
// PUT /api/playlists/{id}/songs/reorder
func (h *PlaylistsDBHandler) handleReorderSongs(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	var req models.ReorderSongsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	if len(req.SongIDs) == 0 {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song IDs are required")
		return
	}

	err := h.playlistsService.ReorderSongs(r.Context(), claims.UserID, playlistID, req.SongIDs)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to reorder songs")
		return
	}

	writePlaylistsJSON(w, http.StatusOK, PlaylistSongResponse{
		Success: true,
		Message: "Songs reordered successfully",
	})
}

// handleGetSongPlaylists returns all playlists containing a specific song
// GET /api/song-playlists/{songId}
func (h *PlaylistsDBHandler) handleGetSongPlaylists(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	songID := r.PathValue("songId")
	if songID == "" {
		// Fallback for older Go versions
		path := r.URL.Path
		parts := strings.Split(path, "/")
		if len(parts) > 0 {
			songID = parts[len(parts)-1]
		}
	}

	if songID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	playlistIDs, err := h.playlistsService.GetSongPlaylists(r.Context(), claims.UserID, songID)
	if err != nil {
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get song playlists")
		return
	}

	// Return empty array instead of null
	if playlistIDs == nil {
		playlistIDs = []string{}
	}

	writePlaylistsJSON(w, http.StatusOK, GetSongPlaylistsResponse{
		Success:     true,
		PlaylistIDs: playlistIDs,
	})
}

// =============================================================================
// Playlist Cover Handlers
// =============================================================================

// handleUploadPlaylistCover handles playlist cover upload requests
// POST /api/playlists/{id}/cover
func (h *PlaylistsDBHandler) handleUploadPlaylistCover(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writePlaylistsError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Check if cover service is configured
	if h.playlistCoverService == nil {
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeCoverServiceNotConfig, "Playlist cover service not configured")
		return
	}

	playlistID := extractPlaylistID(r)
	if playlistID == "" {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Playlist ID is required")
		return
	}

	// Verify playlist belongs to user
	playlist, err := h.playlistsService.GetPlaylist(r.Context(), claims.UserID, playlistID)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistNotFound) {
			writePlaylistsError(w, http.StatusNotFound, ErrCodePlaylistNotFound, "Playlist not found")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get playlist")
		return
	}

	// Parse multipart form (max 10MB for the entire request)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Failed to parse form data")
		return
	}

	// Get the file from the form
	file, _, err := r.FormFile("cover")
	if err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Cover file is required")
		return
	}
	defer file.Close()

	// Read file data with size limit
	config := h.playlistCoverService.GetConfig()
	limitedReader := io.LimitReader(file, config.MaxSizeBytes+1)
	data, err := io.ReadAll(limitedReader)
	if err != nil {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Failed to read cover file")
		return
	}

	// Check if file exceeds size limit
	if int64(len(data)) > config.MaxSizeBytes {
		writePlaylistsError(w, http.StatusBadRequest, ErrCodeCoverTooLarge, "Image size exceeds 5MB limit")
		return
	}

	// Delete old cover if exists
	if playlist.ArtworkURL != "" {
		_ = h.playlistCoverService.DeletePlaylistCoverByURL(playlist.ArtworkURL)
	}

	// Save new cover
	filename, err := h.playlistCoverService.SavePlaylistCover(r.Context(), playlistID, data)
	if err != nil {
		if errors.Is(err, services.ErrPlaylistCoverInvalidFormat) {
			writePlaylistsError(w, http.StatusBadRequest, ErrCodeCoverInvalidFormat, "Invalid image format. Supported formats: JPEG, PNG, WebP")
			return
		}
		if errors.Is(err, services.ErrPlaylistCoverTooLarge) {
			writePlaylistsError(w, http.StatusBadRequest, ErrCodeCoverTooLarge, "Image size exceeds 5MB limit")
			return
		}
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to save cover")
		return
	}

	// Get the cover URL
	artworkURL := h.playlistCoverService.GetPlaylistCoverURL(filename)

	// Update playlist with new artwork URL
	updateReq := &models.UpdatePlaylistRequest{
		ArtworkURL: artworkURL,
	}
	_, err = h.playlistsService.UpdatePlaylist(r.Context(), claims.UserID, playlistID, updateReq)
	if err != nil {
		// Try to clean up the uploaded file
		_ = h.playlistCoverService.DeletePlaylistCover(filename)
		writePlaylistsError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update playlist")
		return
	}

	writePlaylistsJSON(w, http.StatusOK, UploadPlaylistCoverResponse{
		Success:    true,
		ArtworkURL: artworkURL,
		Message:    "Cover uploaded successfully",
	})
}

// handleServePlaylistCover serves playlist cover images
// GET /api/playlist-covers/{filename}
func (h *PlaylistsDBHandler) handleServePlaylistCover(w http.ResponseWriter, r *http.Request) {
	// Check if cover service is configured
	if h.playlistCoverService == nil {
		http.Error(w, "Playlist cover service not configured", http.StatusInternalServerError)
		return
	}

	// Extract filename from path
	path := r.URL.Path
	filename := strings.TrimPrefix(path, "/api/playlist-covers/")
	if filename == "" || filename == path {
		http.Error(w, "Cover not found", http.StatusNotFound)
		return
	}

	// Sanitize filename to prevent directory traversal
	filename = filepath.Base(filename)
	if filename == "." || filename == ".." {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	// Get cover path
	coverPath := h.playlistCoverService.GetPlaylistCoverPath(filename)

	// Check if file exists
	if _, err := os.Stat(coverPath); os.IsNotExist(err) {
		http.Error(w, "Cover not found", http.StatusNotFound)
		return
	}

	// Determine content type based on extension
	ext := strings.ToLower(filepath.Ext(filename))
	contentType := "application/octet-stream"
	switch ext {
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".webp":
		contentType = "image/webp"
	}

	// Set content type header
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 24 hours

	// Serve the file
	http.ServeFile(w, r, coverPath)
}
