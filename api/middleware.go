package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/OwlCt/OwlPlayer/services"
)

// ContextKey is a type for context keys
type ContextKey string

const (
	// ContextKeyUser is the context key for the authenticated user claims
	ContextKeyUser ContextKey = "user"
)

// AuthMiddleware handles authentication and authorization
type AuthMiddleware struct {
	jwtService  *services.JWTService
	userService *services.UserService
}

// NewAuthMiddleware creates a new AuthMiddleware instance
func NewAuthMiddleware(jwtService *services.JWTService, userService *services.UserService) *AuthMiddleware {
	return &AuthMiddleware{
		jwtService:  jwtService,
		userService: userService,
	}
}

// Authenticate validates JWT from Authorization header (or query param for sendBeacon) and attaches user info to context
// Returns 401 if token is missing, invalid, or expired
// **Feature: user-account-system, Property 23: Unauthenticated request returns 401**
// **Feature: user-account-system, Property 25: Expired token returns 401**
func (m *AuthMiddleware) Authenticate(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var tokenString string

		// First try Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" {
			// Check Bearer prefix
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
				tokenString = parts[1]
			} else {
				writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Invalid authorization header format")
				return
			}
		}

		// Fallback to query parameter (for sendBeacon API which can't set headers)
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}

		if tokenString == "" {
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authorization header or token parameter is required")
			return
		}

		// Validate access token
		claims, err := m.jwtService.ValidateAccessToken(tokenString)
		if err != nil {
			if err == services.ErrTokenExpired {
				writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenExpired, "Token has expired")
				return
			}
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Invalid token")
			return
		}

		// Attach claims to request context
		ctx := context.WithValue(r.Context(), ContextKeyUser, claims)
		next(w, r.WithContext(ctx))
	}
}

// RequireActive ensures the authenticated user has an active account
// Returns 403 if user is not active
// **Feature: user-account-system, Property 12: Inactive user access returns 403**
// **Feature: user-account-system, Property 24: Active user can access protected endpoints**
func (m *AuthMiddleware) RequireActive(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserFromContext(r.Context())
		if claims == nil {
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
			return
		}

		if !claims.IsActive {
			writeAuthError(w, http.StatusForbidden, ErrCodeAccountInactive, "Account is not activated. Please contact an administrator for activation.")
			return
		}

		next(w, r)
	}
}

// RequireAdmin ensures the authenticated user has admin privileges
// Returns 403 if user is not an admin
// **Feature: user-account-system, Property 16: Non-admin cannot access admin functions**
func (m *AuthMiddleware) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserFromContext(r.Context())
		if claims == nil {
			writeAuthError(w, http.StatusUnauthorized, ErrCodeTokenInvalid, "Authentication required")
			return
		}

		if !claims.IsAdmin {
			writeAuthError(w, http.StatusForbidden, ErrCodeNotAdmin, "Admin privileges required")
			return
		}

		next(w, r)
	}
}

// GetUserFromContext retrieves the user claims from the request context
func GetUserFromContext(ctx context.Context) *services.TokenClaims {
	claims, ok := ctx.Value(ContextKeyUser).(*services.TokenClaims)
	if !ok {
		return nil
	}
	return claims
}

// Chain combines multiple middleware functions
func Chain(middlewares ...func(http.HandlerFunc) http.HandlerFunc) func(http.HandlerFunc) http.HandlerFunc {
	return func(final http.HandlerFunc) http.HandlerFunc {
		for i := len(middlewares) - 1; i >= 0; i-- {
			final = middlewares[i](final)
		}
		return final
	}
}
