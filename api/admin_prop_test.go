package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"main/services"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: admin-user-management, Property 2: Non-admin users cannot perform admin operations**
// **Validates: Requirements 1.3, 3.3**
func TestProperty_NonAdminCannotDeleteUser(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtConfig := &services.JWTConfig{
		SecretKey:          "test-secret-key-for-property-testing-12345",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
	}
	jwtService := services.NewJWTService(jwtConfig)
	middleware := NewAuthMiddleware(jwtService, nil)

	// Create admin handler with nil user service (we only test authorization)
	adminHandler := NewAdminHandler(nil, middleware)

	// Generator for user IDs
	userIDGen := gen.Identifier().SuchThat(func(s string) bool {
		return len(s) > 0
	})

	properties.Property("Non-admin cannot delete user", prop.ForAll(
		func(nonAdminUserID, targetUserID string) bool {
			// Generate token for non-admin user (isAdmin = false, isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(nonAdminUserID, "user@example.com", "testuser", false, true)
			if err != nil {
				return false
			}

			// Create DELETE request to delete user endpoint
			req := httptest.NewRequest("DELETE", "/api/admin/users/"+targetUserID, nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()

			// Apply the admin middleware chain
			handler := Chain(middleware.Authenticate, middleware.RequireAdmin)(adminHandler.handleDeleteUser)
			handler.ServeHTTP(rr, req)

			// Non-admin should get 403 Forbidden
			return rr.Code == http.StatusForbidden
		},
		userIDGen,
		userIDGen,
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 2: Non-admin users cannot perform admin operations**
// **Validates: Requirements 1.3, 3.3**
func TestProperty_NonAdminCannotSetUserGroup(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtConfig := &services.JWTConfig{
		SecretKey:          "test-secret-key-for-property-testing-12345",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
	}
	jwtService := services.NewJWTService(jwtConfig)
	middleware := NewAuthMiddleware(jwtService, nil)

	// Create admin handler with nil user service (we only test authorization)
	adminHandler := NewAdminHandler(nil, middleware)

	// Generator for user IDs
	userIDGen := gen.Identifier().SuchThat(func(s string) bool {
		return len(s) > 0
	})

	// Generator for group values
	groupGen := gen.OneConstOf("normal", "vip")

	properties.Property("Non-admin cannot set user group", prop.ForAll(
		func(nonAdminUserID, targetUserID, group string) bool {
			// Generate token for non-admin user (isAdmin = false, isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(nonAdminUserID, "user@example.com", "testuser", false, true)
			if err != nil {
				return false
			}

			// Create request body
			reqBody := SetUserGroupRequest{Group: group}
			bodyBytes, _ := json.Marshal(reqBody)

			// Create POST request to set-group endpoint
			req := httptest.NewRequest("POST", "/api/admin/users/"+targetUserID+"/set-group", bytes.NewReader(bodyBytes))
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()

			// Apply the admin middleware chain
			handler := Chain(middleware.Authenticate, middleware.RequireAdmin)(adminHandler.handleSetUserGroup)
			handler.ServeHTTP(rr, req)

			// Non-admin should get 403 Forbidden
			return rr.Code == http.StatusForbidden
		},
		userIDGen,
		userIDGen,
		groupGen,
	))

	properties.TestingRun(t)
}

// Test that admin users CAN access delete user endpoint (authorization passes)
func TestProperty_AdminCanAccessDeleteUserEndpoint(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtConfig := &services.JWTConfig{
		SecretKey:          "test-secret-key-for-property-testing-12345",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
	}
	jwtService := services.NewJWTService(jwtConfig)
	middleware := NewAuthMiddleware(jwtService, nil)

	// Generator for user IDs
	userIDGen := gen.Identifier().SuchThat(func(s string) bool {
		return len(s) > 0
	})

	properties.Property("Admin can access delete user endpoint (authorization passes)", prop.ForAll(
		func(adminUserID, targetUserID string) bool {
			// Generate token for admin user (isAdmin = true, isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(adminUserID, "admin@example.com", "adminuser", true, true)
			if err != nil {
				return false
			}

			// Create DELETE request to delete user endpoint
			req := httptest.NewRequest("DELETE", "/api/admin/users/"+targetUserID, nil)
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)

			rr := httptest.NewRecorder()

			// Use a mock handler that just returns 200 to test authorization passes
			handler := Chain(middleware.Authenticate, middleware.RequireAdmin)(func(w http.ResponseWriter, r *http.Request) {
				// Authorization passed, return OK
				w.WriteHeader(http.StatusOK)
			})
			handler.ServeHTTP(rr, req)

			// Admin should pass authorization (get 200 from our mock handler)
			return rr.Code == http.StatusOK
		},
		userIDGen,
		userIDGen,
	))

	properties.TestingRun(t)
}

// Test that admin users CAN access set user group endpoint (authorization passes)
func TestProperty_AdminCanAccessSetUserGroupEndpoint(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	jwtConfig := &services.JWTConfig{
		SecretKey:          "test-secret-key-for-property-testing-12345",
		AccessTokenExpiry:  15 * time.Minute,
		RefreshTokenExpiry: 7 * 24 * time.Hour,
	}
	jwtService := services.NewJWTService(jwtConfig)
	middleware := NewAuthMiddleware(jwtService, nil)

	// Generator for user IDs
	userIDGen := gen.Identifier().SuchThat(func(s string) bool {
		return len(s) > 0
	})

	// Generator for group values
	groupGen := gen.OneConstOf("normal", "vip")

	properties.Property("Admin can access set user group endpoint (authorization passes)", prop.ForAll(
		func(adminUserID, targetUserID, group string) bool {
			// Generate token for admin user (isAdmin = true, isActive = true)
			tokenPair, err := jwtService.GenerateTokenPair(adminUserID, "admin@example.com", "adminuser", true, true)
			if err != nil {
				return false
			}

			// Create request body
			reqBody := SetUserGroupRequest{Group: group}
			bodyBytes, _ := json.Marshal(reqBody)

			// Create POST request to set-group endpoint
			req := httptest.NewRequest("POST", "/api/admin/users/"+targetUserID+"/set-group", bytes.NewReader(bodyBytes))
			req.Header.Set("Authorization", "Bearer "+tokenPair.AccessToken)
			req.Header.Set("Content-Type", "application/json")

			rr := httptest.NewRecorder()

			// Use a mock handler that just returns 200 to test authorization passes
			handler := Chain(middleware.Authenticate, middleware.RequireAdmin)(func(w http.ResponseWriter, r *http.Request) {
				// Authorization passed, return OK
				w.WriteHeader(http.StatusOK)
			})
			handler.ServeHTTP(rr, req)

			// Admin should pass authorization (get 200 from our mock handler)
			return rr.Code == http.StatusOK
		},
		userIDGen,
		userIDGen,
		groupGen,
	))

	properties.TestingRun(t)
}
