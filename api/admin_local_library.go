package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
)

type AdminLocalLibraryHandler struct {
	service                *services.LocalLibraryAdminService
	metadataControlService *services.LocalMetadataControlService
	localLibraryService    *services.LocalLibraryService
	middleware             *AuthMiddleware
}

func NewAdminLocalLibraryHandler(service *services.LocalLibraryAdminService, metadataControlService *services.LocalMetadataControlService, localLibraryService *services.LocalLibraryService, middleware *AuthMiddleware) *AdminLocalLibraryHandler {
	return &AdminLocalLibraryHandler{
		service:                service,
		metadataControlService: metadataControlService,
		localLibraryService:    localLibraryService,
		middleware:             middleware,
	}
}

func (h *AdminLocalLibraryHandler) RegisterRoutes(mux *http.ServeMux) {
	adminChain := Chain(h.middleware.Authenticate, h.middleware.RequireAdmin)

	mux.HandleFunc("GET /api/admin/local-library/overview", adminChain(h.handleGetOverview))
	mux.HandleFunc("POST /api/admin/local-library/scan", adminChain(h.handleTriggerScan))
	mux.HandleFunc("POST /api/admin/local-library/scrape", adminChain(h.handleTriggerScrape))
	mux.HandleFunc("GET /api/admin/local-library/metadata/", adminChain(h.handleGetMetadataCorrection))
	mux.HandleFunc("PUT /api/admin/local-library/metadata/", adminChain(h.handleUpdateMetadataCorrection))
	mux.HandleFunc("DELETE /api/admin/local-library/metadata/", adminChain(h.handleDeleteMetadataCorrection))
}

type LocalLibraryOverviewResponse struct {
	Success  bool                           `json:"success"`
	Overview *services.LocalLibraryOverview `json:"overview"`
}

type LocalLibraryActionResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type LocalLibraryScanRequest struct {
	Mode string `json:"mode"`
}

type LocalLibraryScrapeRequest struct {
	Scope services.LocalLibraryScrapeScope `json:"scope"`
}

func (h *AdminLocalLibraryHandler) handleGetOverview(w http.ResponseWriter, r *http.Request) {
	if GetUserFromContext(r.Context()) == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	limit := 10
	if value := r.URL.Query().Get("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 && parsed <= 50 {
			limit = parsed
		}
	}

	overview, err := h.service.GetOverview(r.Context(), limit)
	if err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to load local library overview")
		return
	}

	writeAuthJSON(w, http.StatusOK, LocalLibraryOverviewResponse{Success: true, Overview: overview})
}

func (h *AdminLocalLibraryHandler) handleTriggerScan(w http.ResponseWriter, r *http.Request) {
	if GetUserFromContext(r.Context()) == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req LocalLibraryScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}
	if req.Mode == "" {
		req.Mode = "incremental"
	}

	err := h.service.StartScan(req.Mode, "admin")
	if err != nil {
		h.writeServiceError(w, err, "Failed to start local library scan")
		return
	}

	message := "Incremental scan started"
	if req.Mode == "full" {
		message = "Full scan started"
	}
	writeAuthJSON(w, http.StatusAccepted, LocalLibraryActionResponse{Success: true, Message: message})
}

func (h *AdminLocalLibraryHandler) handleTriggerScrape(w http.ResponseWriter, r *http.Request) {
	if GetUserFromContext(r.Context()) == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req LocalLibraryScrapeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}
	if req.Scope == "" {
		req.Scope = services.LocalLibraryScrapeScopeUnmatched
	}

	err := h.service.StartScrape(req.Scope)
	if err != nil {
		h.writeServiceError(w, err, "Failed to start local library scrape")
		return
	}

	message := "Metadata scrape started"
	if req.Scope == services.LocalLibraryScrapeScopeAll {
		message = "Full metadata scrape started"
	}
	writeAuthJSON(w, http.StatusAccepted, LocalLibraryActionResponse{Success: true, Message: message})
}

func (h *AdminLocalLibraryHandler) handleGetMetadataCorrection(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	entityType, entityID, ok := parseLocalMetadataTarget(r.URL.Path)
	if !ok {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid metadata target")
		return
	}
	if h.metadataControlService == nil || h.localLibraryService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Metadata correction is unavailable")
		return
	}

	switch entityType {
	case models.LocalEntityTypeArtist:
		artist, err := h.localLibraryService.GetArtistDetail(r.Context(), claims.UserID, strconv.FormatInt(entityID, 10))
		if err != nil || artist == nil {
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "Artist not found")
			return
		}
		payload, err := h.metadataControlService.GetArtistCorrection(r.Context(), claims.UserID, entityID, h.localLibraryService.LocalArtworkURLForArtist(r.Context(), entityID), artist.ArtworkWidth, artist.ArtworkHeight)
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to load artist metadata correction")
			return
		}
		writeAuthJSON(w, http.StatusOK, map[string]any{"success": true, "payload": payload})
	case models.LocalEntityTypeAlbum:
		localArtwork := h.localLibraryService.LocalArtworkURLForAlbum(r.Context(), entityID)
		payload, err := h.metadataControlService.GetAlbumCorrection(r.Context(), claims.UserID, entityID, localArtwork)
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to load album metadata correction")
			return
		}
		writeAuthJSON(w, http.StatusOK, map[string]any{"success": true, "payload": payload})
	default:
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Unsupported metadata target")
	}
}

func (h *AdminLocalLibraryHandler) handleUpdateMetadataCorrection(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	entityType, entityID, ok := parseLocalMetadataTarget(r.URL.Path)
	if !ok {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid metadata target")
		return
	}
	if h.metadataControlService == nil || h.localLibraryService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Metadata correction is unavailable")
		return
	}

	var update services.MetadataControlUpdate
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	switch entityType {
	case models.LocalEntityTypeArtist:
		payload, err := h.metadataControlService.UpdateArtistCorrection(
			r.Context(),
			claims.UserID,
			claims.UserID,
			entityID,
			h.localLibraryService.LocalArtworkURLForArtist(r.Context(), entityID),
			0,
			0,
			&update,
		)
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update artist metadata correction")
			return
		}
		writeAuthJSON(w, http.StatusOK, map[string]any{"success": true, "payload": payload})
	case models.LocalEntityTypeAlbum:
		payload, err := h.metadataControlService.UpdateAlbumCorrection(
			r.Context(),
			claims.UserID,
			claims.UserID,
			entityID,
			h.localLibraryService.LocalArtworkURLForAlbum(r.Context(), entityID),
			&update,
		)
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update album metadata correction")
			return
		}
		writeAuthJSON(w, http.StatusOK, map[string]any{"success": true, "payload": payload})
	default:
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Unsupported metadata target")
	}
}

func (h *AdminLocalLibraryHandler) handleDeleteMetadataCorrection(w http.ResponseWriter, r *http.Request) {
	entityType, entityID, ok := parseLocalMetadataTarget(r.URL.Path)
	if !ok {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid metadata target")
		return
	}
	if h.metadataControlService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Metadata correction is unavailable")
		return
	}
	if err := h.metadataControlService.DeleteEntityControl(r.Context(), entityType, entityID); err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to clear metadata correction")
		return
	}
	writeAuthJSON(w, http.StatusOK, map[string]any{"success": true})
}

func parseLocalMetadataTarget(path string) (models.LocalEntityType, int64, bool) {
	trimmed := strings.TrimPrefix(path, "/api/admin/local-library/metadata/")
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) < 2 {
		return "", 0, false
	}
	entityType := models.LocalEntityType(parts[0])
	switch entityType {
	case models.LocalEntityTypeArtist, models.LocalEntityTypeAlbum, models.LocalEntityTypeMedia:
	default:
		return "", 0, false
	}
	entityID, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || entityID <= 0 {
		return "", 0, false
	}
	return entityType, entityID, true
}

func (h *AdminLocalLibraryHandler) writeServiceError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case services.IsLocalLibraryConflictError(err):
		writeAuthError(w, http.StatusConflict, ErrCodeInvalidRequest, err.Error())
	case services.IsLocalLibraryValidationError(err):
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
	case services.IsLocalLibraryUnavailableError(err):
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, err.Error())
	default:
		if errors.Is(err, services.ErrLocalLibraryDisabled) {
			writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, err.Error())
			return
		}
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, fallback)
	}
}
