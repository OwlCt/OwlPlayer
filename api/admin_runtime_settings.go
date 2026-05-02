package api

import (
	"encoding/json"
	"net/http"

	"main/services"
)

type AdminRuntimeSettingsHandler struct {
	settingsService *services.SystemSettingsService
	emailService    *services.EmailService
	middleware      *AuthMiddleware
}

func NewAdminRuntimeSettingsHandler(settingsService *services.SystemSettingsService, emailService *services.EmailService, middleware *AuthMiddleware) *AdminRuntimeSettingsHandler {
	return &AdminRuntimeSettingsHandler{
		settingsService: settingsService,
		emailService:    emailService,
		middleware:      middleware,
	}
}

func (h *AdminRuntimeSettingsHandler) RegisterRoutes(mux *http.ServeMux) {
	adminChain := Chain(h.middleware.Authenticate, h.middleware.RequireAdmin)
	mux.HandleFunc("GET /api/admin/settings/runtime", adminChain(h.handleGetRuntimeSettings))
	mux.HandleFunc("PUT /api/admin/settings/runtime", adminChain(h.handleUpdateRuntimeSettings))
}

type AdminRuntimeSettingsResponse struct {
	Success  bool                            `json:"success"`
	Settings *services.RuntimeSettingsEnvelope `json:"settings"`
}

func (h *AdminRuntimeSettingsHandler) handleGetRuntimeSettings(w http.ResponseWriter, r *http.Request) {
	if h.settingsService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Runtime settings unavailable")
		return
	}

	settings, err := h.settingsService.GetRuntimeSettings(r.Context())
	if err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to load runtime settings")
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminRuntimeSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}

func (h *AdminRuntimeSettingsHandler) handleUpdateRuntimeSettings(w http.ResponseWriter, r *http.Request) {
	if h.settingsService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Runtime settings unavailable")
		return
	}

	var req struct {
		Settings *services.RuntimeSettingsEnvelope `json:"settings"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	settings, err := h.settingsService.SetRuntimeSettings(r.Context(), req.Settings, services.SettingSourceDatabase, false)
	if err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
		return
	}

	if h.emailService != nil {
		h.emailService.UpdateConfig(settings.Email.ToEmailConfig())
	}

	writeAuthJSON(w, http.StatusOK, AdminRuntimeSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}

