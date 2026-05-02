package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/OwlCt/OwlPlayer/services"
)

type SetupHandler struct {
	setupService *services.SetupService
	jwtService   *services.JWTService
}

func NewSetupHandler(setupService *services.SetupService, jwtService *services.JWTService) *SetupHandler {
	return &SetupHandler{
		setupService: setupService,
		jwtService:   jwtService,
	}
}

func (h *SetupHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/setup/status", h.handleGetStatus)
	mux.HandleFunc("POST /api/setup/test-db", h.handleTestDB)
	mux.HandleFunc("PUT /api/setup/bootstrap-config", h.handleSaveBootstrapConfig)
	mux.HandleFunc("POST /api/setup/bootstrap-admin", h.handleBootstrapAdmin)
	mux.HandleFunc("PUT /api/setup/runtime-settings", h.handleSaveRuntimeSettings)
}

type SetupStatusResponse struct {
	Success bool                  `json:"success"`
	Status  *services.SetupStatus `json:"status"`
}

type SetupDatabaseRequest struct {
	BootstrapToken string                  `json:"bootstrap_token"`
	Database       services.DatabaseConfig `json:"database"`
}

type SetupDatabaseResponse struct {
	Success bool                  `json:"success"`
	Status  *services.SetupStatus `json:"status,omitempty"`
	Message string                `json:"message,omitempty"`
}

type SetupRuntimeSettingsRequest struct {
	BootstrapToken string                            `json:"bootstrap_token"`
	Settings       *services.RuntimeSettingsEnvelope `json:"settings"`
}

type SetupRuntimeSettingsResponse struct {
	Success  bool                              `json:"success"`
	Settings *services.RuntimeSettingsEnvelope `json:"settings"`
}

func (h *SetupHandler) handleGetStatus(w http.ResponseWriter, r *http.Request) {
	if h.setupService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Setup service unavailable")
		return
	}
	status, err := h.setupService.GetStatus(r.Context())
	if err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get setup status")
		return
	}
	writeAuthJSON(w, http.StatusOK, SetupStatusResponse{Success: true, Status: status})
}

func (h *SetupHandler) handleTestDB(w http.ResponseWriter, r *http.Request) {
	if h.setupService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Setup service unavailable")
		return
	}

	var req SetupDatabaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	if err := h.setupService.TestDatabase(r.Context(), req.BootstrapToken, &req.Database); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, fmt.Sprintf("Database connection failed: %v", err))
		return
	}

	writeAuthJSON(w, http.StatusOK, SetupDatabaseResponse{
		Success: true,
		Message: "Database connection successful",
	})
}

func (h *SetupHandler) handleSaveBootstrapConfig(w http.ResponseWriter, r *http.Request) {
	if h.setupService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Setup service unavailable")
		return
	}

	var req SetupDatabaseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	status, err := h.setupService.SaveBootstrapDatabase(r.Context(), req.BootstrapToken, &req.Database)
	if err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, fmt.Sprintf("Failed to save bootstrap config: %v", err))
		return
	}

	writeAuthJSON(w, http.StatusOK, SetupDatabaseResponse{
		Success: true,
		Status:  status,
		Message: "Bootstrap database config saved",
	})
}

func (h *SetupHandler) handleBootstrapAdmin(w http.ResponseWriter, r *http.Request) {
	if h.setupService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Setup service unavailable")
		return
	}

	var req services.BootstrapAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	tokenPair, user, err := h.setupService.BootstrapAdmin(r.Context(), &req)
	if err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
		return
	}

	writeAuthJSON(w, http.StatusCreated, LoginResponse{
		Success: true,
		User:    user.ToPublic(),
		Token: &TokenResponse{
			AccessToken:  tokenPair.AccessToken,
			RefreshToken: tokenPair.RefreshToken,
			ExpiresIn:    tokenPair.ExpiresIn,
		},
	})
}

func (h *SetupHandler) handleSaveRuntimeSettings(w http.ResponseWriter, r *http.Request) {
	if h.setupService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Setup service unavailable")
		return
	}

	var req SetupRuntimeSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	settings, err := h.setupService.SaveRuntimeSettings(r.Context(), req.BootstrapToken, req.Settings)
	if err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
		return
	}

	writeAuthJSON(w, http.StatusOK, SetupRuntimeSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}
