package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"main/services"
)

// UserHandler handles user settings API endpoints
type UserHandler struct {
	userService    *services.UserService
	avatarService  *services.AvatarService
	authMiddleware *AuthMiddleware
}

// NewUserHandler creates a new UserHandler instance
func NewUserHandler(userService *services.UserService, avatarService *services.AvatarService, authMiddleware *AuthMiddleware) *UserHandler {
	return &UserHandler{
		userService:    userService,
		avatarService:  avatarService,
		authMiddleware: authMiddleware,
	}
}

// RegisterRoutes registers user settings routes on the given mux
func (h *UserHandler) RegisterRoutes(mux *http.ServeMux) {
	// All user settings endpoints require authentication and active status
	mux.HandleFunc("GET /api/user/settings", h.authMiddleware.Authenticate(h.authMiddleware.RequireActive(h.handleGetSettings)))
	mux.HandleFunc("PUT /api/user/settings/ios-lossless-hls", h.authMiddleware.Authenticate(h.authMiddleware.RequireActive(h.handleUpdateIOSLosslessHLS)))
	mux.HandleFunc("POST /api/user/change-email", h.authMiddleware.Authenticate(h.authMiddleware.RequireActive(h.handleRequestEmailChange)))
	mux.HandleFunc("POST /api/user/confirm-email", h.authMiddleware.Authenticate(h.authMiddleware.RequireActive(h.handleConfirmEmailChange)))
	mux.HandleFunc("POST /api/user/change-password", h.authMiddleware.Authenticate(h.authMiddleware.RequireActive(h.handleChangePassword)))

	// Avatar endpoints
	mux.HandleFunc("PUT /api/user/avatar", h.authMiddleware.Authenticate(h.authMiddleware.RequireActive(h.handleAvatarUpload)))
	mux.HandleFunc("GET /api/avatars/", h.handleServeAvatar)
}

// =============================================================================
// Request/Response Types
// =============================================================================

// GetSettingsResponse represents the user settings response
type GetSettingsResponse struct {
	Success  bool                   `json:"success"`
	Settings *services.UserSettings `json:"settings"`
}

type UpdateIOSLosslessHLSRequest struct {
	Enabled bool `json:"enabled"`
}

// RequestEmailChangeRequest represents an email change request
type RequestEmailChangeRequest struct {
	NewEmail string `json:"new_email"`
}

// RequestEmailChangeResponse represents a successful email change request response
type RequestEmailChangeResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ConfirmEmailChangeRequest represents an email change confirmation request
type ConfirmEmailChangeRequest struct {
	Code string `json:"code"`
}

// ConfirmEmailChangeResponse represents a successful email change confirmation response
type ConfirmEmailChangeResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ChangePasswordRequest represents a password change request
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePasswordResponse represents a successful password change response
type ChangePasswordResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodeNewEmailExists    = "EMAIL_ALREADY_EXISTS"
	ErrCodePasswordIncorrect = "PASSWORD_INCORRECT"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writeUserJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeUserError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writeUserJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleGetSettings returns the current user's settings with masked email
// GET /api/user/settings
func (h *UserHandler) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	// Get user claims from context (set by auth middleware)
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	userID := claims.UserID

	// Get user settings
	settings, err := h.userService.GetSettings(r.Context(), userID)
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
			return
		}
		writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get settings")
		return
	}

	// Return success response
	writeUserJSON(w, http.StatusOK, GetSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}

func (h *UserHandler) handleUpdateIOSLosslessHLS(w http.ResponseWriter, r *http.Request) {
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	var payload UpdateIOSLosslessHLSRequest
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	if err := h.userService.SetIOSLosslessHLSEnabled(r.Context(), claims.UserID, payload.Enabled); err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
			return
		}
		writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update iOS lossless HLS setting")
		return
	}

	settings, err := h.userService.GetSettings(r.Context(), claims.UserID)
	if err != nil {
		writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get updated settings")
		return
	}

	writeUserJSON(w, http.StatusOK, GetSettingsResponse{
		Success:  true,
		Settings: settings,
	})
}

// handleRequestEmailChange initiates an email change by sending a verification code
// POST /api/user/change-email
func (h *UserHandler) handleRequestEmailChange(w http.ResponseWriter, r *http.Request) {
	var req RequestEmailChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.NewEmail == "" {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "New email is required")
		return
	}

	// Get user claims from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	userID := claims.UserID

	// Request email change
	err := h.userService.RequestEmailChange(r.Context(), userID, req.NewEmail)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidEmail):
			writeUserError(w, http.StatusBadRequest, ErrCodeInvalidEmail, "Invalid email format")
		case errors.Is(err, services.ErrNewEmailExists):
			writeUserError(w, http.StatusBadRequest, ErrCodeNewEmailExists, "Email already registered")
		case errors.Is(err, services.ErrUserNotFound):
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to request email change")
		}
		return
	}

	// Return success response
	writeUserJSON(w, http.StatusOK, RequestEmailChangeResponse{
		Success: true,
		Message: "Verification code sent to new email address",
	})
}

// handleConfirmEmailChange confirms the email change using the verification code
// POST /api/user/confirm-email
func (h *UserHandler) handleConfirmEmailChange(w http.ResponseWriter, r *http.Request) {
	var req ConfirmEmailChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Code == "" {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Verification code is required")
		return
	}

	// Get user claims from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	userID := claims.UserID

	// Confirm email change
	err := h.userService.ConfirmEmailChange(r.Context(), userID, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrCodeInvalid):
			writeUserError(w, http.StatusBadRequest, ErrCodeVerifyCodeInvalid, "Invalid verification code")
		case errors.Is(err, services.ErrCodeExpired):
			writeUserError(w, http.StatusBadRequest, ErrCodeVerifyCodeExpired, "Verification code has expired")
		case errors.Is(err, services.ErrNewEmailExists):
			writeUserError(w, http.StatusBadRequest, ErrCodeNewEmailExists, "Email already registered")
		case errors.Is(err, services.ErrUserNotFound):
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to confirm email change")
		}
		return
	}

	// Return success response
	writeUserJSON(w, http.StatusOK, ConfirmEmailChangeResponse{
		Success: true,
		Message: "Email changed successfully",
	})
}

// handleChangePassword changes the user's password
// POST /api/user/change-password
func (h *UserHandler) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.CurrentPassword == "" || req.NewPassword == "" {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Current password and new password are required")
		return
	}

	// Validate new password length
	if len(req.NewPassword) < 8 {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "New password must be at least 8 characters")
		return
	}

	// Get user claims from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	userID := claims.UserID

	// Change password
	err := h.userService.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrPasswordIncorrect):
			writeUserError(w, http.StatusBadRequest, ErrCodePasswordIncorrect, "Current password is incorrect")
		case errors.Is(err, services.ErrUserNotFound):
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to change password")
		}
		return
	}

	// Return success response
	writeUserJSON(w, http.StatusOK, ChangePasswordResponse{
		Success: true,
		Message: "Password changed successfully",
	})
}

// =============================================================================
// Avatar Types and Error Codes
// =============================================================================

// AvatarUploadResponse represents a successful avatar upload response
type AvatarUploadResponse struct {
	Success   bool   `json:"success"`
	AvatarURL string `json:"avatar_url"`
	Message   string `json:"message"`
}

const (
	ErrCodeAvatarInvalidFormat = "AVATAR_INVALID_FORMAT"
	ErrCodeAvatarTooLarge      = "AVATAR_TOO_LARGE"
)

// =============================================================================
// Avatar Handlers
// =============================================================================

// handleAvatarUpload handles avatar upload requests
// PUT /api/user/avatar
func (h *UserHandler) handleAvatarUpload(w http.ResponseWriter, r *http.Request) {
	// Get user claims from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	userID := claims.UserID

	// Check if avatar service is configured
	if h.avatarService == nil {
		writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Avatar service not configured")
		return
	}

	// Parse multipart form (max 10MB for the entire request)
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Failed to parse form data")
		return
	}

	// Get the file from the form
	file, _, err := r.FormFile("avatar")
	if err != nil {
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Avatar file is required")
		return
	}
	defer file.Close()

	// Read file data with size limit
	data, err := h.avatarService.ReadAvatarFromReader(file)
	if err != nil {
		if errors.Is(err, services.ErrAvatarTooLarge) {
			writeUserError(w, http.StatusBadRequest, ErrCodeAvatarTooLarge, "Image size exceeds 5MB limit")
			return
		}
		writeUserError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Failed to read avatar file")
		return
	}

	// Upload avatar using user service
	avatarURL, err := h.userService.UploadAvatar(r.Context(), userID, h.avatarService, data)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrAvatarInvalidFormat):
			writeUserError(w, http.StatusBadRequest, ErrCodeAvatarInvalidFormat, "Invalid image format. Supported formats: JPEG, PNG, GIF, WebP")
		case errors.Is(err, services.ErrAvatarTooLarge):
			writeUserError(w, http.StatusBadRequest, ErrCodeAvatarTooLarge, "Image size exceeds 5MB limit")
		case errors.Is(err, services.ErrUserNotFound):
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to upload avatar")
		}
		return
	}

	// Return success response
	writeUserJSON(w, http.StatusOK, AvatarUploadResponse{
		Success:   true,
		AvatarURL: avatarURL,
		Message:   "Avatar uploaded successfully",
	})
}

// handleServeAvatar serves avatar images
// GET /api/avatars/{filename}
func (h *UserHandler) handleServeAvatar(w http.ResponseWriter, r *http.Request) {
	// Check if avatar service is configured
	if h.avatarService == nil {
		http.Error(w, "Avatar service not configured", http.StatusInternalServerError)
		return
	}

	// Extract filename from path
	path := r.URL.Path
	filename := strings.TrimPrefix(path, "/api/avatars/")
	if filename == "" || filename == path {
		http.Error(w, "Avatar not found", http.StatusNotFound)
		return
	}

	// Sanitize filename to prevent directory traversal
	filename = filepath.Base(filename)
	if filename == "." || filename == ".." {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	// Get avatar path
	avatarPath := h.avatarService.GetAvatarPath(filename)

	// Check if file exists
	if _, err := os.Stat(avatarPath); os.IsNotExist(err) {
		// Try to serve default avatar
		defaultPath := h.avatarService.GetAvatarPath(h.avatarService.GetConfig().DefaultAvatar)
		if _, err := os.Stat(defaultPath); os.IsNotExist(err) {
			http.Error(w, "Avatar not found", http.StatusNotFound)
			return
		}
		avatarPath = defaultPath
	}

	// Determine content type based on extension
	ext := strings.ToLower(filepath.Ext(filename))
	contentType := "application/octet-stream"
	switch ext {
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".png":
		contentType = "image/png"
	case ".gif":
		contentType = "image/gif"
	case ".webp":
		contentType = "image/webp"
	case ".svg":
		contentType = "image/svg+xml"
	}

	// Set content type header
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 24 hours

	// Serve the file
	http.ServeFile(w, r, avatarPath)
}

// handleGetAvatar returns the current user's avatar URL
// GET /api/user/avatar
func (h *UserHandler) handleGetAvatar(w http.ResponseWriter, r *http.Request) {
	// Get user claims from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeUserError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}
	userID := claims.UserID

	// Check if avatar service is configured
	if h.avatarService == nil {
		writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Avatar service not configured")
		return
	}

	// Get avatar URL
	avatarURL, err := h.userService.GetAvatarURL(r.Context(), userID, h.avatarService)
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			writeUserError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
			return
		}
		writeUserError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get avatar")
		return
	}

	// Return success response
	writeUserJSON(w, http.StatusOK, map[string]interface{}{
		"success":    true,
		"avatar_url": avatarURL,
	})
}
