package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/OwlCt/OwlPlayer/services"
)

// AdminHandler handles admin-related API endpoints
type AdminHandler struct {
	userService     *services.UserService
	settingsService *services.SystemSettingsService
	emailService    *services.EmailService
	middleware      *AuthMiddleware
}

// NewAdminHandler creates a new AdminHandler instance
func NewAdminHandler(userService *services.UserService, middleware *AuthMiddleware) *AdminHandler {
	return &AdminHandler{
		userService: userService,
		middleware:  middleware,
	}
}

// SetSystemSettingsService sets the system settings service used by admin settings endpoints.
func (h *AdminHandler) SetSystemSettingsService(settingsService *services.SystemSettingsService) {
	h.settingsService = settingsService
}

// SetEmailService sets the runtime email service used by admin settings endpoints.
func (h *AdminHandler) SetEmailService(emailService *services.EmailService) {
	h.emailService = emailService
}

// RegisterRoutes registers admin routes on the given mux
func (h *AdminHandler) RegisterRoutes(mux *http.ServeMux) {
	// All admin routes require authentication and admin privileges
	adminChain := Chain(h.middleware.Authenticate, h.middleware.RequireAdmin)

	mux.HandleFunc("GET /api/admin/users", adminChain(h.handleListUsers))
	mux.HandleFunc("POST /api/admin/users", adminChain(h.handleCreateUser))
	mux.HandleFunc("POST /api/admin/users/{id}/activate", adminChain(h.handleActivateUser))
	mux.HandleFunc("POST /api/admin/users/{id}/deactivate", adminChain(h.handleDeactivateUser))
	mux.HandleFunc("POST /api/admin/users/{id}/grant-admin", adminChain(h.handleGrantAdmin))
	mux.HandleFunc("POST /api/admin/users/{id}/revoke-admin", adminChain(h.handleRevokeAdmin))
	mux.HandleFunc("DELETE /api/admin/users/{id}", adminChain(h.handleDeleteUser))
	mux.HandleFunc("POST /api/admin/users/{id}/set-group", adminChain(h.handleSetUserGroup))
	mux.HandleFunc("PUT /api/admin/users/{id}/email", adminChain(h.handleUpdateUserEmail))
	mux.HandleFunc("GET /api/admin/settings/email", adminChain(h.handleGetEmailSettings))
	mux.HandleFunc("PUT /api/admin/settings/email", adminChain(h.handleUpdateEmailSettings))
}

// =============================================================================
// Response Types
// =============================================================================

// UserListResponse represents the response for listing users
type UserListResponse struct {
	Success    bool                  `json:"success"`
	Users      []*UserPublicResponse `json:"users"`
	Pagination *PaginationResponse   `json:"pagination"`
}

// UserPublicResponse represents a user in API responses
type UserPublicResponse struct {
	ID              string `json:"id"`
	Email           string `json:"email"`
	Username        string `json:"username"`
	AvatarURL       string `json:"avatar_url"`
	IsEmailVerified bool   `json:"is_email_verified"`
	IsActive        bool   `json:"is_active"`
	IsAdmin         bool   `json:"is_admin"`
	UserGroup       string `json:"user_group"`
	CreatedAt       string `json:"created_at"`
	UpdatedAt       string `json:"updated_at"`
}

// PaginationResponse represents pagination info in API responses
type PaginationResponse struct {
	Total      int `json:"total"`
	Page       int `json:"page"`
	Limit      int `json:"limit"`
	TotalPages int `json:"total_pages"`
}

// AdminActionResponse represents a generic admin action response
type AdminActionResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// =============================================================================
// Handlers
// =============================================================================

// handleListUsers handles listing all users with pagination
// GET /api/admin/users?page=1&limit=20
func (h *AdminHandler) handleListUsers(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Parse pagination parameters
	page := 1
	limit := 20

	if pageStr := r.URL.Query().Get("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	// List users
	result, err := h.userService.ListUsers(r.Context(), claims.UserID, page, limit)
	if err != nil {
		if errors.Is(err, services.ErrNotAdmin) {
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
			return
		}
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to list users")
		return
	}

	// Convert users to response format
	users := make([]*UserPublicResponse, len(result.Users))
	for i, user := range result.Users {
		users[i] = &UserPublicResponse{
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

	writeAuthJSON(w, http.StatusOK, UserListResponse{
		Success: true,
		Users:   users,
		Pagination: &PaginationResponse{
			Total:      result.Total,
			Page:       result.Page,
			Limit:      result.Limit,
			TotalPages: result.TotalPages,
		},
	})
}

// handleActivateUser handles activating a user account
// POST /api/admin/users/{id}/activate
func (h *AdminHandler) handleActivateUser(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get user ID from path
	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "/activate")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	// Activate user
	err := h.userService.ActivateUser(r.Context(), claims.UserID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to activate user")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminActionResponse{
		Success: true,
		Message: "User activated successfully",
	})
}

// handleDeactivateUser handles deactivating a user account
// POST /api/admin/users/{id}/deactivate
func (h *AdminHandler) handleDeactivateUser(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get user ID from path
	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "/deactivate")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	// Deactivate user
	err := h.userService.DeactivateUser(r.Context(), claims.UserID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		case err.Error() == "cannot deactivate your own account":
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Cannot deactivate your own account")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to deactivate user")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminActionResponse{
		Success: true,
		Message: "User deactivated successfully",
	})
}

// handleGrantAdmin handles granting admin privileges to a user
// POST /api/admin/users/{id}/grant-admin
func (h *AdminHandler) handleGrantAdmin(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get user ID from path
	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "/grant-admin")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	// Grant admin
	err := h.userService.GrantAdmin(r.Context(), claims.UserID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to grant admin privileges")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminActionResponse{
		Success: true,
		Message: "Admin privileges granted successfully",
	})
}

// handleRevokeAdmin handles revoking admin privileges from a user
// POST /api/admin/users/{id}/revoke-admin
func (h *AdminHandler) handleRevokeAdmin(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get user ID from path
	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "/revoke-admin")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	// Revoke admin
	err := h.userService.RevokeAdmin(r.Context(), claims.UserID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		case err.Error() == "cannot revoke your own admin privileges":
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Cannot revoke your own admin privileges")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to revoke admin privileges")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminActionResponse{
		Success: true,
		Message: "Admin privileges revoked successfully",
	})
}

// handleDeleteUser handles deleting a user account
// DELETE /api/admin/users/{id}
func (h *AdminHandler) handleDeleteUser(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get user ID from path
	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	// Delete user
	err := h.userService.DeleteUser(r.Context(), claims.UserID, userID)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		case errors.Is(err, services.ErrCannotDeleteSelf):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Cannot delete your own account")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to delete user")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminActionResponse{
		Success: true,
		Message: "User deleted successfully",
	})
}

// SetUserGroupRequest represents the request body for setting user group
type SetUserGroupRequest struct {
	Group string `json:"group"`
}

// handleSetUserGroup handles setting a user's group
// POST /api/admin/users/{id}/set-group
func (h *AdminHandler) handleSetUserGroup(w http.ResponseWriter, r *http.Request) {
	// Get admin user from context
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get user ID from path
	userID := extractUserIDFromPath(r.URL.Path, "/api/admin/users/", "/set-group")
	if userID == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "User ID is required")
		return
	}

	// Parse request body
	var req SetUserGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Set user group
	err := h.userService.SetUserGroup(r.Context(), claims.UserID, userID, req.Group)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrNotAdmin):
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		case errors.Is(err, services.ErrInvalidGroup):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid user group. Must be 'normal' or 'vip'")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to update user group")
		}
		return
	}

	writeAuthJSON(w, http.StatusOK, AdminActionResponse{
		Success: true,
		Message: "User group updated successfully",
	})
}

// =============================================================================
// Helper Functions
// =============================================================================

// extractUserIDFromPath extracts the user ID from a URL path
// e.g., "/api/admin/users/123/activate" -> "123"
func extractUserIDFromPath(path, prefix, suffix string) string {
	// Remove prefix
	path = strings.TrimPrefix(path, prefix)
	// Remove suffix
	path = strings.TrimSuffix(path, suffix)
	return path
}
