package models

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: user-account-system, Property 26: User data serialization round-trip**
// **Validates: Requirements 9.4, 9.5**
//
// For any user object stored in PostgreSQL, serializing to JSON for API response
// and deserializing back SHALL preserve all non-sensitive fields, and sensitive
// fields (password_hash) SHALL never appear in JSON output.

func TestUserSerializationRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid User objects
	userGen := gen.Struct(reflect.TypeOf(User{}), map[string]gopter.Gen{
		"ID":              genUUID(),
		"Email":           genEmail(),
		"Username":        genUsername(),
		"PasswordHash":    genPasswordHash(),
		"AvatarURL":       genAvatarURL(),
		"IsEmailVerified": gen.Bool(),
		"IsActive":        gen.Bool(),
		"IsAdmin":         gen.Bool(),
		"UserGroup":       gen.OneConstOf(UserGroupNormal, UserGroupVIP),
		"CreatedAt":       genTime(),
		"UpdatedAt":       genTime(),
	})

	// Property: JSON serialization preserves non-sensitive fields
	properties.Property("JSON serialization preserves non-sensitive fields", prop.ForAll(
		func(user User) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(user)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded User
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all non-sensitive fields are preserved
			return decoded.ID == user.ID &&
				decoded.Email == user.Email &&
				decoded.Username == user.Username &&
				decoded.AvatarURL == user.AvatarURL &&
				decoded.IsEmailVerified == user.IsEmailVerified &&
				decoded.IsActive == user.IsActive &&
				decoded.IsAdmin == user.IsAdmin
		},
		userGen,
	))

	// Property: PasswordHash never appears in JSON output
	properties.Property("PasswordHash never appears in JSON output", prop.ForAll(
		func(user User) bool {
			jsonData, err := json.Marshal(user)
			if err != nil {
				return false
			}

			jsonStr := string(jsonData)

			// PasswordHash should never appear in JSON
			if strings.Contains(jsonStr, "password_hash") {
				return false
			}
			if strings.Contains(jsonStr, user.PasswordHash) && user.PasswordHash != "" {
				return false
			}

			return true
		},
		userGen,
	))

	// Property: ToPublic excludes sensitive data
	properties.Property("ToPublic excludes sensitive data and preserves public fields", prop.ForAll(
		func(user User) bool {
			public := user.ToPublic()

			// All public fields should match
			return public.ID == user.ID &&
				public.Email == user.Email &&
				public.Username == user.Username &&
				public.AvatarURL == user.AvatarURL &&
				public.IsEmailVerified == user.IsEmailVerified &&
				public.IsActive == user.IsActive &&
				public.IsAdmin == user.IsAdmin &&
				public.UserGroup == user.UserGroup
		},
		userGen,
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 3: User group field validity**
// **Validates: Requirements 2.1, 2.3**
//
// For any user in the system, the user_group field should contain either "normal" or "vip",
// and this field should be present in all user-related API responses.

func TestUserGroupFieldValidity(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid User objects with user_group
	userWithGroupGen := gen.Struct(reflect.TypeOf(User{}), map[string]gopter.Gen{
		"ID":              genUUID(),
		"Email":           genEmail(),
		"Username":        genUsername(),
		"PasswordHash":    genPasswordHash(),
		"AvatarURL":       genAvatarURL(),
		"IsEmailVerified": gen.Bool(),
		"IsActive":        gen.Bool(),
		"IsAdmin":         gen.Bool(),
		"UserGroup":       gen.OneConstOf(UserGroupNormal, UserGroupVIP),
		"CreatedAt":       genTime(),
		"UpdatedAt":       genTime(),
	})

	// Property: ValidUserGroup returns true only for valid group values
	properties.Property("ValidUserGroup accepts only 'normal' and 'vip'", prop.ForAll(
		func(group string) bool {
			isValid := ValidUserGroup(group)
			expectedValid := group == UserGroupNormal || group == UserGroupVIP
			return isValid == expectedValid
		},
		gen.AnyString(),
	))

	// Property: User group field is preserved in JSON serialization
	properties.Property("User group field is preserved in JSON serialization", prop.ForAll(
		func(user User) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(user)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded User
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check user_group is preserved
			return decoded.UserGroup == user.UserGroup
		},
		userWithGroupGen,
	))

	// Property: User group field appears in JSON output
	properties.Property("User group field appears in JSON output", prop.ForAll(
		func(user User) bool {
			jsonData, err := json.Marshal(user)
			if err != nil {
				return false
			}

			jsonStr := string(jsonData)
			// user_group should appear in JSON
			return strings.Contains(jsonStr, "user_group")
		},
		userWithGroupGen,
	))

	// Property: ToPublic preserves user_group field
	properties.Property("ToPublic preserves user_group field", prop.ForAll(
		func(user User) bool {
			public := user.ToPublic()
			return public.UserGroup == user.UserGroup
		},
		userWithGroupGen,
	))

	// Property: UserPublic JSON includes user_group
	properties.Property("UserPublic JSON includes user_group", prop.ForAll(
		func(user User) bool {
			public := user.ToPublic()
			jsonData, err := json.Marshal(public)
			if err != nil {
				return false
			}

			jsonStr := string(jsonData)
			return strings.Contains(jsonStr, "user_group")
		},
		userWithGroupGen,
	))

	properties.TestingRun(t)
}

// Helper generators

func genUUID() gopter.Gen {
	return gen.RegexMatch(`[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`)
}

func genEmail() gopter.Gen {
	return gen.AnyString().Map(func(s string) string {
		// Generate a simple valid email
		username := strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				return r
			}
			return 'a'
		}, s)
		if len(username) == 0 {
			username = "user"
		}
		if len(username) > 20 {
			username = username[:20]
		}
		return username + "@example.com"
	})
}

func genUsername() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "user"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genPasswordHash() gopter.Gen {
	// Generate bcrypt-like hash strings
	return gen.Const("$2a$10$" + strings.Repeat("x", 53))
}

func genAvatarURL() gopter.Gen {
	return gen.OneConstOf("", "/api/avatars/user123.png", "https://example.com/avatar.jpg")
}

func genTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}
