package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
)

// ServerMux is an alias for http.ServeMux to allow external route registration
type ServerMux = http.ServeMux

// Server is the HTTP API server
type Server struct {
	config          *ServerConfig
	router          *http.ServeMux
	localLibrarySvc *services.LocalLibraryService
	localPlayback   *services.LocalPlaybackService
	localLyricsSvc  *services.LocalLyricsService
	authMiddleware  *AuthMiddleware
	userSvc         *services.UserService
}

// NewServer creates a new API server
func NewServer(config *ServerConfig) (*Server, error) {
	server := &Server{
		config: config,
		router: http.NewServeMux(),
	}

	server.registerRoutes()
	return server, nil
}

// registerRoutes sets up all API routes
// Note: Auth middleware is applied after server creation via SetAuthMiddleware
// All routes except auth endpoints require authentication
func (s *Server) registerRoutes() {
	// Protected endpoints - require authentication and active account
	// Search endpoints
	s.router.HandleFunc("/api/search", s.protectedMiddleware(s.handleSearch))
	s.router.HandleFunc("/api/search/suggestions", s.protectedMiddleware(s.handleSearchSuggestions))

	// Song detail endpoint
	s.router.HandleFunc("/api/song/", s.protectedMiddleware(s.handleSongDetail))

	// Album detail endpoint
	s.router.HandleFunc("/api/album/", s.protectedMiddleware(s.handleAlbumDetail))

	// Artist detail endpoint
	s.router.HandleFunc("/api/artist/", s.protectedMiddleware(s.handleArtistDetail))

	// Stream endpoints
	s.router.HandleFunc("/api/stream/", s.protectedMiddleware(s.handleStream))

	// Lyrics endpoints
	s.router.HandleFunc("/api/lyrics/", s.protectedMiddleware(s.handleLyrics))

	// Image proxy endpoint (protected)
	s.router.HandleFunc("/api/image", s.protectedMiddleware(s.handleImageProxy))
	s.router.HandleFunc("/api/artwork/", s.protectedMiddleware(s.handleArtwork))

	// Static files (frontend) - public, frontend handles auth
	// Use SPA-friendly handler that falls back to index.html for client-side routing
	if s.config.StaticDir != "" {
		s.router.HandleFunc("/", s.handleStaticFiles)
	}
}

// handleStaticFiles serves static files with SPA fallback support
// For paths that don't match existing files, it returns index.html
// API routes are handled by other handlers, not this one
func (s *Server) handleStaticFiles(w http.ResponseWriter, r *http.Request) {
	// Skip API routes - they should be handled by specific handlers
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "API endpoint not found")
		return
	}

	// Clean the path
	path := r.URL.Path
	if path == "/" {
		path = "/index.html"
	}

	// Build the file path
	filePath := filepath.Join(s.config.StaticDir, path)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		// File doesn't exist, serve index.html for SPA routing
		http.ServeFile(w, r, filepath.Join(s.config.StaticDir, "index.html"))
		return
	}

	// Serve the actual file
	http.ServeFile(w, r, filePath)
}

// corsMiddleware adds CORS headers
func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", s.config.CORSOrigins)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// writeJSON writes a JSON response
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, models.NewErrorResponse(code, message))
}

// handleSearch handles search requests
func (s *Server) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Query parameter 'q' is required")
		return
	}

	searchType := r.URL.Query().Get("type")
	if searchType == "" {
		searchType = "all"
	}

	// Check for pagination parameters
	offsetStr := r.URL.Query().Get("offset")
	limitStr := r.URL.Query().Get("limit")

	// If pagination parameters are provided, use paginated search
	if offsetStr != "" || limitStr != "" {
		offset := 0
		limit := 20 // default limit
		if offsetStr != "" {
			fmt.Sscanf(offsetStr, "%d", &offset)
		}
		if limitStr != "" {
			fmt.Sscanf(limitStr, "%d", &limit)
		}

		// Validate limit
		if limit <= 0 || limit > 50 {
			limit = 20
		}

		log.Printf("Paginated search request: query=%s, type=%s, offset=%d, limit=%d", query, searchType, offset, limit)

		var (
			results interface{}
			err     error
		)
		if s.localLibrarySvc == nil {
			writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
			return
		}
		results, err = s.localLibrarySvc.SearchPaginated(r.Context(), query, searchType, limit, offset)
		if err != nil {
			log.Printf("Paginated search error: %v", err)
			writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
			return
		}

		writeJSON(w, http.StatusOK, models.NewSuccessResponse(results))
		return
	}

	log.Printf("Search request: query=%s, type=%s", query, searchType)

	// For "all" type searches, use SearchWithTopResults to include topResults and order
	// Requirements: 2.1, 4.1
	if searchType == "all" {
		var (
			results interface{}
			err     error
		)
		if s.localLibrarySvc == nil {
			writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
			return
		}
		results, err = s.localLibrarySvc.SearchWithTopResults(r.Context(), query)
		if err != nil {
			log.Printf("Search error: %v", err)
			writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, models.NewSuccessResponse(results))
		return
	}

	// For specific type searches, use the regular Search method
	var (
		results *models.SearchResult
		err     error
	)
	if s.localLibrarySvc == nil {
		writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
		return
	}
	results, err = s.localLibrarySvc.Search(r.Context(), query, searchType)
	if err != nil {
		log.Printf("Search error: %v", err)
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, models.NewSuccessResponse(results))
}

// handleSearchSuggestions handles search suggestion requests
func (s *Server) handleSearchSuggestions(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	term := r.URL.Query().Get("term")
	if term == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Query parameter 'term' is required")
		return
	}

	log.Printf("Search suggestions request: term=%s", term)

	var (
		suggestions *models.SuggestionResult
		err         error
	)
	if s.localLibrarySvc == nil {
		writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
		return
	}
	suggestions, err = s.localLibrarySvc.GetSuggestions(r.Context(), term)
	if err != nil {
		log.Printf("Search suggestions error: %v", err)
		// Per requirement 7.1: hide dropdown on error, allow manual search
		// Return empty result instead of error to allow graceful degradation
		writeJSON(w, http.StatusOK, models.NewSuccessResponse(&models.SuggestionResult{
			Terms:    []models.TermSuggestion{},
			Contents: []models.ContentSuggestion{},
		}))
		return
	}

	writeJSON(w, http.StatusOK, models.NewSuccessResponse(suggestions))
}

// handleStream handles streaming requests
// Supports both HLS (/api/stream/{songId}/playlist.m3u8) and direct (/api/stream/{songId})
func (s *Server) handleStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	// Extract path after /api/stream/
	path := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	if path == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	// Parse path: could be {songId}, {songId}/playlist.m3u8, or {songId}/segment000.ts
	parts := strings.SplitN(path, "/", 2)
	songID := parts[0]

	if s.localPlayback == nil {
		writeError(w, http.StatusGone, models.ErrCodeInvalidRequest, "Apple Music streaming has been retired; local playback is not configured")
		return
	}

	var err error
	if len(parts) == 1 {
		log.Printf("Local direct stream request for media: %s", songID)
		err = s.localPlayback.StreamDirect(w, r, songID)
	} else {
		log.Printf("Local HLS request for media: %s, file: %s", songID, parts[1])
		r.URL.Path = "/" + parts[1]
		err = s.localPlayback.StreamHLS(w, r, songID)
	}

	if err != nil {
		log.Printf("Stream error: %v", err)
		switch {
		case errors.Is(err, services.ErrInvalidPlaybackOption):
			writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Invalid playback option")
		case errors.Is(err, services.ErrLocalPlaybackNotFound):
			writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Local media item not found")
		case errors.Is(err, services.ErrLocalPlaybackUnavailable):
			writeError(w, http.StatusConflict, models.ErrCodeInvalidRequest, "Local media item is unavailable")
		default:
			writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		}
		return
	}
}

// handleSongDetail handles song detail requests
func (s *Server) handleSongDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	// Extract song ID from path: /api/song/{songId}
	songID := strings.TrimPrefix(r.URL.Path, "/api/song/")
	if songID == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	log.Printf("Song detail request: songId=%s", songID)

	var (
		detail interface{}
		err    error
	)
	if s.localLibrarySvc == nil {
		writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
		return
	}
	detail, err = s.localLibrarySvc.GetSongDetail(r.Context(), songID)
	if err != nil {
		log.Printf("Song detail error: %v", err)
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		return
	}

	if detail == nil {
		writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Song not found")
		return
	}

	writeJSON(w, http.StatusOK, models.NewSuccessResponse(detail))
}

// handleLyrics handles lyrics requests
func (s *Server) handleLyrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	// Extract song ID from path: /api/lyrics/{songId}
	songID := strings.TrimPrefix(r.URL.Path, "/api/lyrics/")
	if songID == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Song ID is required")
		return
	}

	// Get raw TTML lyrics (frontend handles parsing and Chinese variant selection)
	var (
		lyrics interface{}
		err    error
	)
	if s.localLyricsSvc == nil {
		writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local lyrics service unavailable")
		return
	}
	lyrics, err = s.localLyricsSvc.GetLyrics(r.Context(), songID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, models.NewSuccessResponse(lyrics))
}

// handleImageProxy proxies and caches images from Apple Music CDN
func (s *Server) handleImageProxy(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	// Get URL from query parameter
	imageURL := r.URL.Query().Get("url")
	if imageURL == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "URL parameter is required")
		return
	}

	// Get image from cache or download
	cache := services.GetImageCache()
	if cache == nil {
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, "Image cache not available")
		return
	}

	data, contentType, err := cache.Get(imageURL)
	if err != nil {
		log.Printf("Image proxy error: %v", err)
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		return
	}

	// Set cache headers
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 24 hours
	w.Header().Set("Content-Length", fmt.Sprintf("%d", len(data)))
	w.Write(data)
}

// handleAlbumDetail handles album detail requests
func (s *Server) handleAlbumDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	// Extract album ID from path: /api/album/{albumId} or /api/album/{albumId}/other-versions
	path := strings.TrimPrefix(r.URL.Path, "/api/album/")
	parts := strings.Split(path, "/")
	albumID := parts[0]

	if albumID == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Album ID is required")
		return
	}

	if len(parts) > 1 {
		writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Album sub-view endpoints are not available")
		return
	}

	log.Printf("Album detail request: albumId=%s", albumID)

	var (
		detail interface{}
		err    error
	)
	claims := GetUserFromContext(r.Context())
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	if s.localLibrarySvc == nil {
		writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
		return
	}
	detail, err = s.localLibrarySvc.GetAlbumDetail(r.Context(), userID, albumID)
	if err != nil {
		log.Printf("Album detail error: %v", err)
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		return
	}

	if detail == nil {
		writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Album not found")
		return
	}

	writeJSON(w, http.StatusOK, models.NewSuccessResponse(detail))
}

// parseOffsetLimit parses offset and limit query parameters
func parseOffsetLimit(r *http.Request, defaultOffset, defaultLimit int) (int, int) {
	offset := defaultOffset
	limit := defaultLimit
	if offsetStr := r.URL.Query().Get("offset"); offsetStr != "" {
		if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
			offset = v
		}
	}
	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}
	return offset, limit
}

func (s *Server) SetLocalLibraryServices(librarySvc *services.LocalLibraryService, lyricsSvc *services.LocalLyricsService) {
	s.localLibrarySvc = librarySvc
	s.localLyricsSvc = lyricsSvc
}

func (s *Server) SetLocalPlaybackService(playbackSvc *services.LocalPlaybackService) {
	s.localPlayback = playbackSvc
}

// handleArtistDetail handles artist detail requests
func (s *Server) handleArtistDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	// Extract artist ID from path: /api/artist/{artistId}
	artistID := strings.TrimPrefix(r.URL.Path, "/api/artist/")
	if artistID == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Artist ID is required")
		return
	}

	log.Printf("Artist detail request: artistId=%s", artistID)

	var (
		detail interface{}
		err    error
	)
	claims := GetUserFromContext(r.Context())
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	if s.localLibrarySvc == nil {
		writeError(w, http.StatusServiceUnavailable, models.ErrCodeInternalError, "Local library service unavailable")
		return
	}
	detail, err = s.localLibrarySvc.GetArtistDetail(r.Context(), userID, artistID)
	if err != nil {
		log.Printf("Artist detail error: %v", err)
		writeError(w, http.StatusInternalServerError, models.ErrCodeInternalError, err.Error())
		return
	}

	if detail == nil {
		writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Artist not found")
		return
	}

	writeJSON(w, http.StatusOK, models.NewSuccessResponse(detail))
}

// Start starts the HTTP server
func (s *Server) Start() error {
	addr := s.config.Host + ":" + s.config.Port
	log.Printf("Starting API server on %s", addr)
	return http.ListenAndServe(addr, s.router)
}

// Handler returns the HTTP handler
func (s *Server) Handler() http.Handler {
	return s.router
}

// Mux returns the underlying ServeMux for route registration
func (s *Server) Mux() *http.ServeMux {
	return s.router
}

// CORSMiddleware returns the CORS middleware function for use by other handlers
func (s *Server) CORSMiddleware() func(http.HandlerFunc) http.HandlerFunc {
	return s.corsMiddleware
}

// SetAuthMiddleware sets the authentication middleware for protected routes
func (s *Server) SetAuthMiddleware(middleware *AuthMiddleware) {
	s.authMiddleware = middleware
}

// SetUserService sets the user service for user preferences
func (s *Server) SetUserService(userSvc *services.UserService) {
	s.userSvc = userSvc
}

func (s *Server) handleArtwork(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, models.ErrCodeInvalidRequest, "Method not allowed")
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/artwork/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		writeError(w, http.StatusBadRequest, models.ErrCodeInvalidRequest, "Artwork entity type and id are required")
		return
	}

	if len(parts) >= 3 && parts[0] == "album" && parts[2] == "motion" {
		localPath, err := s.localLibrarySvc.ResolveMotionArtwork(r.Context(), parts[1])
		if err != nil {
			writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, err.Error())
			return
		}
		if localPath == "" {
			writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Motion artwork not found")
			return
		}
		http.ServeFile(w, r, localPath)
		return
	}

	localPath, remoteURL, err := s.localLibrarySvc.ResolveArtwork(parts[0], parts[1])
	if err != nil {
		writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, err.Error())
		return
	}
	if localPath != "" {
		http.ServeFile(w, r, localPath)
		return
	}
	if remoteURL != "" {
		http.Redirect(w, r, remoteURL, http.StatusTemporaryRedirect)
		return
	}

	writeError(w, http.StatusNotFound, models.ErrCodeInvalidRequest, "Artwork not found")
}

// protectedMiddleware wraps a handler with authentication and active user checks
// Requires user to be logged in and have an active account
// If auth middleware is not set, it just applies CORS (for development/testing)
func (s *Server) protectedMiddleware(next http.HandlerFunc) http.HandlerFunc {
	if s.authMiddleware != nil {
		return s.authMiddleware.Authenticate(s.authMiddleware.RequireActive(s.corsMiddleware(next)))
	}
	return s.corsMiddleware(next)
}

// adminMiddleware wraps a handler with authentication, active user, and admin checks
// Requires user to be logged in, have an active account, and be an admin
func (s *Server) adminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	if s.authMiddleware != nil {
		return s.authMiddleware.Authenticate(s.authMiddleware.RequireActive(s.authMiddleware.RequireAdmin(s.corsMiddleware(next))))
	}
	return s.corsMiddleware(next)
}
