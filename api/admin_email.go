package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/services"
)

type CreateAdminUserRequest struct {
	Email           string `json:"email"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	IsActive        *bool  `json:"is_active"`
	IsAdmin         *bool  `json:"is_admin"`
	IsEmailVerified *bool  `json:"is_email_verified"`
	UserGroup       string `json:"user_group"`
}

type CreateAdminUserResponse struct {
	Success bool                `json:"success"`
	User    *UserPublicResponse `json:"user"`
	Message string              `json:"message"`
}

type UpdateUserEmailRequest struct {
	Email string `json:"email"`
}

type EmailSettingsResponse struct {
	Success  bool                    `json:"success"`
	Settings *services.EmailSettings `json:"settings"`
}

func newUserPublicResponse(user *models.User) *UserPublicResponse {
	if user == nil {
		return nil
	}

	return &UserPublicResponse{
		ID:              user.ID,
		Email:           user.Email,
		Username:        user.Username,
		AvatarURL:       user.GetAvatarURLOrDefault(),
		IsEmailVerified: user.IsEmailVerified,
		IsActive:        user.IsActive,
		IsAdmin:         user.IsAdmin,
		UserGroup:       user.UserGroup,
		CreatedAt:       user.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
		UpdatedAt:       user.UpdatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

func boolValueOrDefault(value *bool, defaultValue bool) bool {
	if value == nil {
		return defaultValue
	}
	return *value
}

func emailConfigToSettings(config *services.EmailConfig) *services.EmailSettings {
	if config == nil {
		return &services.EmailSettings{}
	}

	return &services.EmailSettings{
		SMTPHost:     config.SMTPHost,
		SMTPPort:     config.SMTPPort,
		SMTPUser:     config.SMTPUser,
		SMTPPassword: config.SMTPPassword,
		FromAddress:  config.FromAddress,
		FromName:     config.FromName,
		UseTLS:       config.UseTLS,
	}
}

// handleCreateUser handles direct account creation from the admin panel.
func (h *AdminHandler) handleCreateUser(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var req CreateAdminUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	if req.Email == "" || req.Username == "" || req.Password == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email, username, and password are required")
		return
	}
	if len(req.Username) < 3 || len(req.Username) > 50 {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Username must be between 3 and 50 characters")
		return
	}
	if len(req.Password) < 8 {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Password must be at least 8 characters")
		return
	}

	user, err := h.userService.AdminCreateUser(r.Context(), claims.UserID, &services.AdminCreateUserRequest{
		Email:           req.Email,
		Username:        req.Username,
		Password:        req.Password,
		IsActive:        boolValueOrDefault(req.IsActive, true),
		IsAdmin:         boolValueOrDefault(req.IsAdmin, false),
		IsEmailVerified: boolValueOrDefault(req.IsEmailVerified, true),
		UserGroup:       req.UserGroup,
	})
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrInvalidEmail):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidEmail, "Invalid email format")
		case errors.Is(err, services.ErrEmailExists):
			writeAuthError(w, http.StatusBadRequest, ErrCodeEmailExists, "Email already registered")
		case errors.Is(err, services.ErrUsernameExists):
			writeAuthError(w, http.StatusBadRequest, ErrCodeUsernameExists, "Username already taken")
		case errors.Is(err, services.ErrInvalidGroup):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid user group. Must be 'normal' or 'vip'")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to create user")
		}
		return
	}

	writeAuthJSON(w, http.StatusCreated, CreateAdminUserResponse{
		Success: true,
		User:    newUserPublicResponse(user),
		Message: "User created successfully",
	})
}

// handleUpdateUserEmail lets admins update a user's email directly.
func (h *AdminHandler) handleUpdateUserEmail(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "/email")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	var req UpdateUserEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}
	if req.Email == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email is required")
		return
	}

	user, err := h.userService.AdminUpdateUserEmail(r.Context(), claims.UserID, userID, req.Email)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrInvalidEmail):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidEmail, "Invalid email format")
		case errors.Is(err, services.ErrNewEmailExists):
			writeAuthError(w, http.StatusBadRequest, ErrCodeNewEmailExists, "Email already registered")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update user email")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, CreateAdminUserResponse{
		Success: true,
		User:    newUserPublicResponse(user),
		Message: "User email updated successfully",
	})
}

// handleGetEmailSettings returns the effective email configuration.
func (h *AdminHandler) handleGetEmailSettings(w http.ResponseWriter, r *http.Request) {
	if h.emailService == nil && h.settingsService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Email settings are unavailable")
		return
	}

	settings := &services.EmailSettings{}
	if h.emailService != nil {
		settings = emailConfigToSettings(h.emailService.GetConfig())
	} else if h.settingsService != nil {
		loaded, err := h.settingsService.GetEmailSettings(r.Context())
		if err != nil {
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get email settings")
			return
		}
		settings = loaded
	}

	writeAuthJSON(w, http.StatusOK, EmailSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}

// handleUpdateEmailSettings updates SMTP configuration in system settings and runtime memory.
func (h *AdminHandler) handleUpdateEmailSettings(w http.ResponseWriter, r *http.Request) {
	if h.settingsService == nil {
		writeAuthError(w, http.StatusServiceUnavailable, ErrCodeInternalError, "Email settings are unavailable")
		return
	}

	var settings services.EmailSettings
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	if err := settings.Validate(); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, err.Error())
		return
	}

	if err := h.settingsService.SetEmailSettings(r.Context(), &settings); err != nil {
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update email settings")
		return
	}

	if h.emailService != nil {
		h.emailService.UpdateConfig(settings.ToEmailConfig())
	}

	writeAuthJSON(w, http.StatusOK, EmailSettingsResponse{
		Success:  true,
		Settings: &settings,
	})
}
