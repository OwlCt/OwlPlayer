package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"main/models"
	"main/services"
)

// AuthHandler handles authentication-related API endpoints
type AuthHandler struct {
	userService *services.UserService
	jwtService  *services.JWTService
}

// NewAuthHandler creates a new AuthHandler instance
func NewAuthHandler(userService *services.UserService, jwtService *services.JWTService) *AuthHandler {
	return &AuthHandler{
		userService: userService,
		jwtService:  jwtService,
	}
}

// RegisterRoutes registers auth routes on the given mux
func (h *AuthHandler) RegisterRoutes(mux *http.ServeMux, authMiddleware *AuthMiddleware) {
	mux.HandleFunc("POST /api/auth/register", h.handleRegister)
	mux.HandleFunc("POST /api/auth/verify-email", h.handleVerifyEmail)
	mux.HandleFunc("POST /api/auth/resend-code", h.handleResendCode)
	mux.HandleFunc("POST /api/auth/login", h.handleLogin)
	mux.HandleFunc("POST /api/auth/refresh", h.handleRefresh)
	mux.HandleFunc("POST /api/auth/forgot-password", h.handleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", h.handleResetPassword)
	mux.HandleFunc("POST /api/auth/send-login-code", h.handleSendLoginCode)
	mux.HandleFunc("POST /api/auth/login-with-code", h.handleLoginWithCode)
	mux.HandleFunc("GET /api/auth/me", authMiddleware.Authenticate(h.handleGetCurrentUser))
}

// =============================================================================
// Request/Response Types
// =============================================================================

// RegisterRequest represents a user registration request
type RegisterRequest struct {
	Email    string `json:"email"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// RegisterResponse represents a successful registration response
type RegisterResponse struct {
	Success              bool               `json:"success"`
	User                 *models.UserPublic `json:"user"`
	Message              string             `json:"message"`
	VerificationRequired bool               `json:"verification_required"`
}

// ErrorResponse represents an error response
type ErrorResponse struct {
	Success bool `json:"success"`
	Error   struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// =============================================================================
// Error Codes
// =============================================================================

const (
	ErrCodeInvalidEmail       = "REGISTER_INVALID_EMAIL"
	ErrCodeEmailExists        = "REGISTER_EMAIL_EXISTS"
	ErrCodeUsernameExists     = "REGISTER_USERNAME_EXISTS"
	ErrCodeInvalidRequest     = "INVALID_REQUEST"
	ErrCodeInternalError      = "INTERNAL_ERROR"
	ErrCodeInvalidCredentials = "AUTH_INVALID_CREDENTIALS"
	ErrCodeEmailNotVerified   = "AUTH_EMAIL_NOT_VERIFIED"
	ErrCodeAccountInactive    = "AUTH_ACCOUNT_INACTIVE"
	ErrCodeTokenExpired       = "AUTH_TOKEN_EXPIRED"
	ErrCodeTokenInvalid       = "AUTH_TOKEN_INVALID"
	ErrCodeVerifyCodeInvalid  = "VERIFY_CODE_INVALID"
	ErrCodeVerifyCodeExpired  = "VERIFY_CODE_EXPIRED"
	ErrCodeNotAdmin           = "AUTH_NOT_ADMIN"
	ErrCodePasswordTooShort   = "PASSWORD_TOO_SHORT"
)

// =============================================================================
// Helper Functions
// =============================================================================

func writeAuthJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeAuthError(w http.ResponseWriter, status int, code, message string) {
	resp := ErrorResponse{
		Success: false,
	}
	resp.Error.Code = code
	resp.Error.Message = message
	writeAuthJSON(w, status, resp)
}

// =============================================================================
// Handlers
// =============================================================================

// handleRegister handles user registration
// POST /api/auth/register
func (h *AuthHandler) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Email == "" || req.Username == "" || req.Password == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email, username, and password are required")
		return
	}

	// Validate password length
	if len(req.Password) < 8 {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Password must be at least 8 characters")
		return
	}

	// Validate username length
	if len(req.Username) < 3 || len(req.Username) > 50 {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Username must be between 3 and 50 characters")
		return
	}

	// Register user
	user, err := h.userService.Register(r.Context(), &services.RegisterRequest{
		Email:    req.Email,
		Username: req.Username,
		Password: req.Password,
	})

	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidEmail):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidEmail, "Invalid email format")
		case errors.Is(err, services.ErrEmailExists):
			writeAuthError(w, http.StatusBadRequest, ErrCodeEmailExists, "Email already registered")
		case errors.Is(err, services.ErrUsernameExists):
			writeAuthError(w, http.StatusBadRequest, ErrCodeUsernameExists, "Username already taken")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Registration failed")
		}
		return
	}

	// Return success response
	message := "Registration successful"
	if !user.IsActive {
		message = "Registration successful. Please wait for an administrator to activate your account."
	}
	writeAuthJSON(w, http.StatusCreated, RegisterResponse{
		Success:              true,
		User:                 user.ToPublic(),
		Message:              message,
		VerificationRequired: false,
	})
}

// VerifyEmailRequest represents an email verification request
type VerifyEmailRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// VerifyEmailResponse represents a successful email verification response
type VerifyEmailResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// ResendCodeRequest represents a resend verification code request
type ResendCodeRequest struct {
	Email string `json:"email"`
}

// ResendCodeResponse represents a successful resend code response
type ResendCodeResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// handleVerifyEmail handles email verification
// POST /api/auth/verify-email
func (h *AuthHandler) handleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req VerifyEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Email == "" || req.Code == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email and code are required")
		return
	}

	// Verify email
	err := h.userService.VerifyEmailByEmail(r.Context(), req.Email, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		case errors.Is(err, services.ErrCodeInvalid):
			writeAuthError(w, http.StatusBadRequest, ErrCodeVerifyCodeInvalid, "Invalid verification code")
		case errors.Is(err, services.ErrCodeExpired):
			writeAuthError(w, http.StatusBadRequest, ErrCodeVerifyCodeExpired, "Verification code has expired")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Verification failed")
		}
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, VerifyEmailResponse{
		Success: true,
		Message: "Email verified successfully",
	})
}

// handleResendCode handles resending verification code
// POST /api/auth/resend-code
func (h *AuthHandler) handleResendCode(w http.ResponseWriter, r *http.Request) {
	var req ResendCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Email == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email is required")
		return
	}

	// Resend verification code
	err := h.userService.ResendVerificationCodeByEmail(r.Context(), req.Email)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrUserNotFound):
			// Don't reveal if user exists or not for security
			writeAuthJSON(w, http.StatusOK, ResendCodeResponse{
				Success: true,
				Message: "If the email is registered, a verification code has been sent",
			})
			return
		case err.Error() == "email already verified":
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email is already verified")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to send verification code")
		}
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, ResendCodeResponse{
		Success: true,
		Message: "Verification code sent successfully",
	})
}

// LoginRequest represents a user login request
type LoginRequest struct {
	Identifier string `json:"identifier"` // Email or username
	Password   string `json:"password"`
}

// LoginResponse represents a successful login response
type LoginResponse struct {
	Success bool               `json:"success"`
	User    *models.UserPublic `json:"user"`
	Token   *TokenResponse     `json:"token"`
}

// TokenResponse represents JWT token information
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int64  `json:"expires_in"`
}

// RefreshRequest represents a token refresh request
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshResponse represents a successful token refresh response
type RefreshResponse struct {
	Success bool           `json:"success"`
	Token   *TokenResponse `json:"token"`
}

// handleLogin handles user login
// POST /api/auth/login
func (h *AuthHandler) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Identifier == "" || req.Password == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Identifier and password are required")
		return
	}

	// Login user
	tokenPair, user, err := h.userService.Login(r.Context(), &services.LoginRequest{
		Identifier: req.Identifier,
		Password:   req.Password,
	})

	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidCredentials):
			writeAuthError(w, http.StatusUnauthorized, ErrCodeInvalidCredentials, "Invalid email/username or password")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Login failed")
		}
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, LoginResponse{
		Success: true,
		User:    user.ToPublic(),
		Token: &TokenResponse{
			AccessToken:  tokenPair.AccessToken,
			RefreshToken: tokenPair.RefreshToken,
			ExpiresIn:    tokenPair.ExpiresIn,
		},
	})
}

// handleRefresh handles token refresh
// POST /api/auth/refresh
func (h *AuthHandler) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.RefreshToken == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Refresh token is required")
		return
	}

	// Refresh token
	tokenPair, err := h.jwtService.RefreshAccessToken(req.RefreshToken)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrTokenExpired):
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenExpired, "Refresh token has expired")
		case errors.Is(err, services.ErrTokenInvalid):
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Invalid refresh token")
		default:
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Token refresh failed")
		}
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, RefreshResponse{
		Success: true,
		Token: &TokenResponse{
			AccessToken:  tokenPair.AccessToken,
			RefreshToken: tokenPair.RefreshToken,
			ExpiresIn:    tokenPair.ExpiresIn,
		},
	})
}

// =============================================================================
// Password Reset Handlers (Feature: password-recovery-email-login)
// =============================================================================

// ForgotPasswordRequest represents a forgot password request
type ForgotPasswordRequest struct {
	Email string `json:"email"`
}

// ForgotPasswordResponse represents a forgot password response
type ForgotPasswordResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// handleForgotPassword handles password reset request
// POST /api/auth/forgot-password
func (h *AuthHandler) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req ForgotPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "请求格式错误")
		return
	}

	// Validate required fields
	if req.Email == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "请输入邮箱地址")
		return
	}

	// Request password reset
	err := h.userService.RequestPasswordReset(r.Context(), req.Email)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidEmail):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidEmail, "请输入有效的邮箱地址")
		default:
			// Don't reveal internal errors - return success for security
			writeAuthJSON(w, http.StatusOK, ForgotPasswordResponse{
				Success: true,
				Message: "如果该邮箱已注册，验证码已发送",
			})
			return
		}
		return
	}

	// Return success response (always return success for security)
	writeAuthJSON(w, http.StatusOK, ForgotPasswordResponse{
		Success: true,
		Message: "如果该邮箱已注册，验证码已发送",
	})
}

// ResetPasswordRequest represents a password reset request
type ResetPasswordRequest struct {
	Email       string `json:"email"`
	Code        string `json:"code"`
	NewPassword string `json:"new_password"`
}

// ResetPasswordResponse represents a password reset response
type ResetPasswordResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// handleResetPassword handles password reset
// POST /api/auth/reset-password
func (h *AuthHandler) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req ResetPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Email == "" || req.Code == "" || req.NewPassword == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email, code, and new password are required")
		return
	}

	// Reset password
	err := h.userService.ResetPassword(r.Context(), req.Email, req.Code, req.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrUserNotFound):
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
		case errors.Is(err, services.ErrCodeInvalid):
			writeAuthError(w, http.StatusBadRequest, ErrCodeVerifyCodeInvalid, "验证码错误")
		case errors.Is(err, services.ErrCodeExpired):
			writeAuthError(w, http.StatusBadRequest, ErrCodeVerifyCodeExpired, "验证码已过期，请重新获取")
		case errors.Is(err, services.ErrPasswordTooShort):
			writeAuthError(w, http.StatusBadRequest, ErrCodePasswordTooShort, "密码长度至少8位")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Password reset failed")
		}
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, ResetPasswordResponse{
		Success: true,
		Message: "密码重置成功",
	})
}

// =============================================================================
// Email Login Handlers (Feature: password-recovery-email-login)
// =============================================================================

// SendLoginCodeRequest represents a send login code request
type SendLoginCodeRequest struct {
	Email string `json:"email"`
}

// SendLoginCodeResponse represents a send login code response
type SendLoginCodeResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// handleSendLoginCode handles sending login verification code
// POST /api/auth/send-login-code
func (h *AuthHandler) handleSendLoginCode(w http.ResponseWriter, r *http.Request) {
	var req SendLoginCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "请求格式错误")
		return
	}

	// Validate required fields
	if req.Email == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "请输入邮箱地址")
		return
	}

	// Send login code
	err := h.userService.SendLoginCodeByEmail(r.Context(), req.Email)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidEmail):
			writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidEmail, "请输入有效的邮箱地址")
		default:
			// Don't reveal internal errors - return success for security
			writeAuthJSON(w, http.StatusOK, SendLoginCodeResponse{
				Success: true,
				Message: "如果该邮箱已注册，验证码已发送",
			})
			return
		}
		return
	}

	// Return success response (always return success for security)
	writeAuthJSON(w, http.StatusOK, SendLoginCodeResponse{
		Success: true,
		Message: "如果该邮箱已注册，验证码已发送",
	})
}

// LoginWithCodeRequest represents a login with code request
type LoginWithCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

// handleLoginWithCode handles login with verification code
// POST /api/auth/login-with-code
func (h *AuthHandler) handleLoginWithCode(w http.ResponseWriter, r *http.Request) {
	var req LoginWithCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Invalid request body")
		return
	}

	// Validate required fields
	if req.Email == "" || req.Code == "" {
		writeAuthError(w, http.StatusBadRequest, ErrCodeInvalidRequest, "Email and code are required")
		return
	}

	// Login with code
	tokenPair, user, err := h.userService.LoginWithCode(r.Context(), req.Email, req.Code)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrInvalidCredentials):
			writeAuthError(w, http.StatusUnauthorized, ErrCodeInvalidCredentials, "Invalid email or verification code")
		case errors.Is(err, services.ErrCodeInvalid):
			writeAuthError(w, http.StatusBadRequest, ErrCodeVerifyCodeInvalid, "验证码错误")
		case errors.Is(err, services.ErrCodeExpired):
			writeAuthError(w, http.StatusBadRequest, ErrCodeVerifyCodeExpired, "验证码已过期，请重新获取")
		default:
			writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Login failed")
		}
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, LoginResponse{
		Success: true,
		User:    user.ToPublic(),
		Token: &TokenResponse{
			AccessToken:  tokenPair.AccessToken,
			RefreshToken: tokenPair.RefreshToken,
			ExpiresIn:    tokenPair.ExpiresIn,
		},
	})
}

// =============================================================================
// Get Current User Handler
// =============================================================================

// GetCurrentUserResponse represents the current user response
type GetCurrentUserResponse struct {
	Success bool               `json:"success"`
	Data    *models.UserPublic `json:"data"`
}

// handleGetCurrentUser returns the current authenticated user
// GET /api/auth/me
func (h *AuthHandler) handleGetCurrentUser(w http.ResponseWriter, r *http.Request) {
	// Get user claims from context (set by auth middleware)
	claims := GetUserFromContext(r.Context())
	if claims == nil {
		writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
		return
	}

	// Get full user from database
	user, err := h.userService.GetUserByID(r.Context(), claims.UserID)
	if err != nil {
		if errors.Is(err, services.ErrUserNotFound) {
			writeAuthError(w, http.StatusNotFound, ErrCodeInvalidRequest, "User not found")
			return
		}
		writeAuthError(w, http.StatusInternalServerError, ErrCodeInternalError, "Failed to get user")
		return
	}

	// Return success response
	writeAuthJSON(w, http.StatusOK, GetCurrentUserResponse{
		Success: true,
		Data:    user.ToPublic(),
	})
}
