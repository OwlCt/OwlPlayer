package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"main/services"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// Test JWT configuration for property tests
func newTestJWTConfig() *services.JWTConfig {
	return &services.JWTConfig{
		SecretKey:          "test-secret-key-for-property-testing-12345",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
	}
}

// **Feature: user-account-system, Property 23: Unauthenticated request returns 401**
// **Validates: Requirements 8.1**
func TestProperty_UnauthenticatedRequestReturns401(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtService := services.NewJWTService(newTestJWTConfig())
	middleware := NewAuthMiddleware(jwtService, nil)

	// Generator for various invalid/missing auth headers
	invalidAuthHeaders := gen.OneConstOf(
		"",                   // No header
		"Basic abc123",       // Wrong scheme
		"Bearer",             // Missing token
		"Bearer ",            // Empty token
		"InvalidFormat",      // No scheme
		"bearer invalid.jwt", // Invalid JWT format
	)

	properties.Property("Unauthenticated request returns 401", prop.ForAll(
		func(authHeader string) bool {
			req := httptest.NewRequest("GET", "/protected", nil)
			if authHeader != "" {
				req.Header.Set("Authorization", authHeader)
			}

			rr := httptest.NewRecorder()
			handler := middleware.Authenticate(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			handler.ServeHTTP(rr, req)
			return rr.Code == http.StatusUnauthorized
		},
		invalidAuthHeaders,
	))

	properties.TestingRun(t)
}

// **Feature: user-account-system, Property 25: Expired token returns 401**
// **Validates: Requirements 8.4**
func TestProperty_ExpiredTokenReturns401(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Use a very short expiry for testing
	expiredConfig := &services.JWTConfig{
		SecretKey:          "test-secret-key-for-property-testing-12345",
		AccessTokenExpiry:  -1 * time.Hour, // Already expired
		RefreshTokenExpiry: 7 * 24 * time.Hour,
	}
	expiredJWTService := services.NewJWTService(expiredConfig)

	// Use normal config for middleware validation
	normalConfig := newTestJWTConfig()
	normalJWTService := services.NewJWTService(normalConfig)
	middleware := NewAuthMiddleware(normalJWTService, nil)

	// Simple generators that don't filter
	userIDGen := gen.AnyString().Map(func(s string) string {
		if len(s) < 3 {
			return "user" + s
		}
		return s
	})
	emailGen := gen.AnyString().Map(func(s string) string {
		return "test@example.com"
	})
	usernameGen := gen.AnyString().Map(func(s string) string {
		return "testuser"
	})

	properties.Property("Expired token returns 401", prop.ForAll(
		func(userID, email, username string) bool {
			// Generate an expired token
			tokenPair, err := expiredJWTService.GenerateTokenPair(userID, email, username, false, true)
			if err != nil {
				return false
			}

			req := httptest.NewRequest("GET", "/protected", nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()
			handler := middleware.Authenticate(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})

			handler.ServeHTTP(rr, req)
			return rr.Code == http.StatusUnauthorized
		},
		userIDGen,
		emailGen,
		usernameGen,
	))

	properties.TestingRun(t)
}

// **Feature: user-account-system, Property 12: Inactive user access returns 403**
// **Validates: Requirements 4.1, 8.2**
func TestProperty_InactiveUserAccessReturns403(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtService := services.NewJWTService(newTestJWTConfig())
	middleware := NewAuthMiddleware(jwtService, nil)

	// Simple generators
	indexGen := gen.IntRange(0, 1000)
	isAdminGen := gen.Bool()

	properties.Property("Inactive user access returns 403", prop.ForAll(
		func(index int, isAdmin bool) bool {
			userID := "user-" + string(rune('a'+index%26))
			email := "test@example.com"
			username := "testuser"

			// Generate token for inactive user (isActive = false)
			tokenPair, err := jwtService.GenerateTokenPair(userID, email, username, isAdmin, false)
			if err != nil {
				return false
			}

			req := httptest.NewRequest("GET", "/protected", nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()

			// Chain Authenticate and RequireActive
			handler := middleware.Authenticate(middleware.RequireActive(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			handler.ServeHTTP(rr, req)
			return rr.Code == http.StatusForbidden
		},
		indexGen,
		isAdminGen,
	))

	properties.TestingRun(t)
}

// **Feature: user-account-system, Property 24: Active user can access protected endpoints**
// **Validates: Requirements 8.3**
func TestProperty_ActiveUserCanAccessProtectedEndpoints(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtService := services.NewJWTService(newTestJWTConfig())
	middleware := NewAuthMiddleware(jwtService, nil)

	// Simple generators
	indexGen := gen.IntRange(0, 1000)
	isAdminGen := gen.Bool()

	properties.Property("Active user can access protected endpoints", prop.ForAll(
		func(index int, isAdmin bool) bool {
			userID := "user-" + string(rune('a'+index%26))
			email := "test@example.com"
			username := "testuser"

			// Generate token for active user (isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(userID, email, username, isAdmin, true)
			if err != nil {
				return false
			}

			req := httptest.NewRequest("GET", "/protected", nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()

			// Chain Authenticate and RequireActive
			handler := middleware.Authenticate(middleware.RequireActive(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))

			handler.ServeHTTP(rr, req)
			return rr.Code == http.StatusOK
		},
		indexGen,
		isAdminGen,
	))

	properties.TestingRun(t)
}

// **Feature: user-account-system, Property 16: Non-admin cannot access admin functions**
// **Validates: Requirements 5.5**
func TestProperty_NonAdminCannotAccessAdminFunctions(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtService := services.NewJWTService(newTestJWTConfig())
	middleware := NewAuthMiddleware(jwtService, nil)

	// Simple generator
	indexGen := gen.IntRange(0, 1000)

	properties.Property("Non-admin cannot access admin functions", prop.ForAll(
		func(index int) bool {
			userID := "user-" + string(rune('a'+index%26))
			email := "test@example.com"
			username := "testuser"

			// Generate token for non-admin user (isAdmin = false, isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(userID, email, username, false, true)
			if err != nil {
				return false
			}

			req := httptest.NewRequest("GET", "/admin/users", nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()

			// Chain Authenticate, RequireActive, and RequireAdmin
			handler := middleware.Authenticate(middleware.RequireActive(middleware.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})))

			handler.ServeHTTP(rr, req)
			return rr.Code == http.StatusForbidden
		},
		indexGen,
	))

	properties.TestingRun(t)
}

// Test that admin users CAN access admin functions
func TestProperty_AdminCanAccessAdminFunctions(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtService := services.NewJWTService(newTestJWTConfig())
	middleware := NewAuthMiddleware(jwtService, nil)

	// Simple generator
	indexGen := gen.IntRange(0, 1000)

	properties.Property("Admin can access admin functions", prop.ForAll(
		func(index int) bool {
			userID := "user-" + string(rune('a'+index%26))
			email := "admin@example.com"
			username := "adminuser"

			// Generate token for admin user (isAdmin = true, isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(userID, email, username, true, true)
			if err != nil {
				return false
			}

			req := httptest.NewRequest("GET", "/admin/users", nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()

			// Chain Authenticate, RequireActive, and RequireAdmin
			handler := middleware.Authenticate(middleware.RequireActive(middleware.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
			})))

			handler.ServeHTTP(rr, req)
			return rr.Code == http.StatusOK
		},
		indexGen,
	))

	properties.TestingRun(t)
}

// Test that user claims are correctly attached to context
func TestProperty_UserClaimsAttachedToContext(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtService := services.NewJWTService(newTestJWTConfig())
	middleware := NewAuthMiddleware(jwtService, nil)

	// Simple generators
	indexGen := gen.IntRange(0, 1000)
	isAdminGen := gen.Bool()
	isActiveGen := gen.Bool()

	properties.Property("User claims are correctly attached to context", prop.ForAll(
		func(index int, isAdmin, isActive bool) bool {
			userID := "user-" + string(rune('a'+index%26))
			email := "test@example.com"
			username := "testuser"

			tokenPair, err := jwtService.GenerateTokenPair(userID, email, username, isAdmin, isActive)
			if err != nil {
				return false
			}

			req := httptest.NewRequest("GET", "/protected", nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			var extractedClaims *services.TokenClaims
			rr := httptest.NewRecorder()

			handler := middleware.Authenticate(func(w http.ResponseWriter, r *http.Request) {
				extractedClaims = GetUserFromContext(r.Context())
				w.WriteHeader(http.StatusOK)
			})

			handler.ServeHTTP(rr, req)

			if rr.Code != http.StatusOK {
				return false
			}

			if extractedClaims == nil {
				return false
			}

			return extractedClaims.UserID == userID &&
				extractedClaims.Email == email &&
				extractedClaims.Username == username &&
				extractedClaims.IsAdmin == isAdmin &&
				extractedClaims.IsActive == isActive
		},
		indexGen,
		isAdminGen,
		isActiveGen,
	))

	properties.TestingRun(t)
}
