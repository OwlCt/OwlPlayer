package models

import (
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: streaming-player, Property 13: API response structure**
// *For any* API response, the JSON SHALL contain a "status" field with value
// "success" or "error", and either a "data" field or an "error" field
// **Validates: Requirements 7.2**
func TestAPIResponseStructure(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for success responses
	properties.Property("Success response has valid structure", prop.ForAll(
		func(data string) bool {
			resp := NewSuccessResponse(data)
			return resp.IsValid() &&
				resp.Status == "success" &&
				resp.Error == nil
		},
		gen.AnyString(),
	))

	// Generator for error responses
	properties.Property("Error response has valid structure", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true // Skip empty inputs
			}
			resp := NewErrorResponse(code, message)
			return resp.IsValid() &&
				resp.Status == "error" &&
				resp.Error != nil &&
				resp.Error.Code == code &&
				resp.Error.Message == message
		},
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
	))

	// Property: Status must be either "success" or "error"
	properties.Property("Status is always success or error", prop.ForAll(
		func(isSuccess bool, data string, code string, message string) bool {
			var resp *APIResponse
			if isSuccess {
				resp = NewSuccessResponse(data)
			} else {
				if code == "" {
					code = "TEST_ERROR"
				}
				if message == "" {
					message = "Test error message"
				}
				resp = NewErrorResponse(code, message)
			}
			return resp.Status == "success" || resp.Status == "error"
		},
		gen.Bool(),
		gen.AnyString(),
		gen.AnyString(),
		gen.AnyString(),
	))

	// Property: Success response never has error field
	properties.Property("Success response has no error", prop.ForAll(
		func(data interface{}) bool {
			resp := NewSuccessResponse(data)
			return resp.Error == nil
		},
		gen.AnyString(),
	))

	// Property: Error response always has error field with code and message
	properties.Property("Error response has error details", prop.ForAll(
		func(code, message string) bool {
			if code == "" || message == "" {
				return true
			}
			resp := NewErrorResponse(code, message)
			return resp.Error != nil &&
				resp.Error.Code != "" &&
				resp.Error.Message != ""
		},
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
	))

	properties.TestingRun(t)
}
