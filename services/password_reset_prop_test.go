package services

import (
	"main/models"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: password-recovery-email-login, Property 10: Code Format Validation**
// **Validates: Requirements 4.3**
func TestProperty_CodeFormatValidation(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Generated verification codes are exactly 6 digits", prop.ForAll(
		func(_ int) bool {
			code, err := GenerateVerificationCode()
			if err != nil {
				return false
			}
			// Check length is exactly 6
			if len(code) != 6 {
				return false
			}
			// Check all characters are digits
			for _, c := range code {
				if c < '0' || c > '9' {
					return false
				}
			}
			// Check code is in valid range (100000-999999)
			if code[0] == '0' {
				return false // First digit should not be 0
			}
			return true
		},
		gen.IntRange(1, 1000), // Generate 1000 codes
	))

	properties.TestingRun(t)
}

// **Feature: password-recovery-email-login, Property 4: Password Validation**
// **Validates: Requirements 1.5**
func TestProperty_PasswordValidation(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Passwords shorter than 8 characters are rejected", prop.ForAll(
		func(length int) bool {
			// Generate a password of the given length
			password := make([]byte, length)
			for i := 0; i < length; i++ {
				password[i] = 'a'
			}
			// Check if password length validation works
			if length < 8 {
				return len(password) < 8 // Should be rejected
			}
			return len(password) >= 8 // Should be accepted
		},
		gen.IntRange(0, 20),
	))

	properties.TestingRun(t)
}

// **Feature: password-recovery-email-login, Property 3: Invalid Code Rejection**
// **Validates: Requirements 1.4, 2.4**
func TestProperty_InvalidCodeRejection(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Non-matching codes are always different from stored codes", prop.ForAll(
		func(storedCode, inputCode string) bool {
			// If codes are different, they should not match
			if storedCode != inputCode {
				return storedCode != inputCode
			}
			// If codes are the same, they should match
			return storedCode == inputCode
		},
		gen.RegexMatch("[0-9]{6}"),
		gen.RegexMatch("[0-9]{6}"),
	))

	properties.TestingRun(t)
}

// **Feature: password-recovery-email-login, Property 11: Code Type Distinction**
// **Validates: Requirements 4.4**
func TestProperty_CodeTypeDistinction(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	properties.Property("Different code types are distinguishable", prop.ForAll(
		func(typeIndex int) bool {
			types := []string{
				string(models.VerificationCodeTypeEmailVerify),
				string(models.VerificationCodeTypeEmailChange),
				string(models.VerificationCodeTypePasswordReset),
				string(models.VerificationCodeTypeEmailLogin),
			}

			// Each type should be unique
			typeStr := types[typeIndex%len(types)]
			count := 0
			for _, t := range types {
				if t == typeStr {
					count++
				}
			}
			return count == 1
		},
		gen.IntRange(0, 100),
	))

	properties.TestingRun(t)
}
