package services

import (
	"strconv"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for System Settings
// =============================================================================

// genPositiveInt64 generates positive int64 values for valid settings
func genPositiveInt64() gopter.Gen {
	return gen.Int64Range(1, 10*1024*1024*1024) // 1 to 10GB
}

// genValidCacheSettings generates valid CacheSettings
func genValidCacheSettings() gopter.Gen {
	return gopter.CombineGens(
		genPositiveInt64(),
		genPositiveInt64(),
		genPositiveInt64(),
	).Map(func(vals []interface{}) *CacheSettings {
		return &CacheSettings{
			MaxCacheSize:   vals[0].(int64),
			MaxCacheAge:    vals[1].(int64),
			IdleExpiryTime: vals[2].(int64),
		}
	})
}

// genInvalidCacheSettings generates invalid CacheSettings (with non-positive values)
func genInvalidCacheSettings() gopter.Gen {
	return gopter.CombineGens(
		gen.Int64Range(-1000, 0),
		gen.Int64Range(-1000, 0),
		gen.Int64Range(-1000, 0),
		gen.IntRange(0, 2), // which field to make invalid
	).Map(func(vals []interface{}) *CacheSettings {
		invalidVal := vals[0].(int64)
		whichInvalid := vals[3].(int)

		settings := DefaultCacheSettings()
		switch whichInvalid {
		case 0:
			settings.MaxCacheSize = invalidVal
		case 1:
			settings.MaxCacheAge = invalidVal
		case 2:
			settings.IdleExpiryTime = invalidVal
		}
		return settings
	})
}

// =============================================================================
// Property Tests for System Settings
// =============================================================================

// **Feature: audio-cache-settings, Property 1: Settings Round Trip Consistency**
// **Validates: Requirements 1.2, 1.3, 1.4**
func TestProperty_SettingsRoundTripConsistency(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Valid cache settings round trip through mock store preserves all values
	properties.Property("valid settings round trip preserves all values", prop.ForAll(
		func(settings *CacheSettings) bool {
			if settings == nil {
				return true
			}

			store := NewMockSystemSettingsStore()
			store.SetCacheSettings(settings)
			retrieved := store.GetCacheSettings()

			return settings.MaxCacheSize == retrieved.MaxCacheSize &&
				settings.MaxCacheAge == retrieved.MaxCacheAge &&
				settings.IdleExpiryTime == retrieved.IdleExpiryTime
		},
		genValidCacheSettings(),
	))

	// Property: Multiple updates preserve the latest values
	properties.Property("multiple updates preserve latest values", prop.ForAll(
		func(settings1, settings2 *CacheSettings) bool {
			if settings1 == nil || settings2 == nil {
				return true
			}

			store := NewMockSystemSettingsStore()
			store.SetCacheSettings(settings1)
			store.SetCacheSettings(settings2)
			retrieved := store.GetCacheSettings()

			return settings2.MaxCacheSize == retrieved.MaxCacheSize &&
				settings2.MaxCacheAge == retrieved.MaxCacheAge &&
				settings2.IdleExpiryTime == retrieved.IdleExpiryTime
		},
		genValidCacheSettings(),
		genValidCacheSettings(),
	))

	// Property: Valid settings pass validation
	properties.Property("valid settings pass validation", prop.ForAll(
		func(settings *CacheSettings) bool {
			if settings == nil {
				return true
			}
			return settings.Validate() == nil
		},
		genValidCacheSettings(),
	))

	properties.TestingRun(t)
}

// **Feature: audio-cache-settings, Property 2: Invalid Settings Rejection**
// **Validates: Requirements 1.5**
func TestProperty_InvalidSettingsRejection(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Settings with non-positive max_cache_size fail validation
	properties.Property("non-positive max_cache_size fails validation", prop.ForAll(
		func(invalidSize int64) bool {
			if invalidSize > 0 {
				return true // Skip positive values
			}
			settings := &CacheSettings{
				MaxCacheSize:   invalidSize,
				MaxCacheAge:    30 * 24 * 60 * 60,
				IdleExpiryTime: 7 * 24 * 60 * 60,
			}
			return settings.Validate() != nil
		},
		gen.Int64Range(-1000, 0),
	))

	// Property: Settings with non-positive max_cache_age fail validation
	properties.Property("non-positive max_cache_age fails validation", prop.ForAll(
		func(invalidAge int64) bool {
			if invalidAge > 0 {
				return true // Skip positive values
			}
			settings := &CacheSettings{
				MaxCacheSize:   1024 * 1024 * 1024,
				MaxCacheAge:    invalidAge,
				IdleExpiryTime: 7 * 24 * 60 * 60,
			}
			return settings.Validate() != nil
		},
		gen.Int64Range(-1000, 0),
	))

	// Property: Settings with non-positive idle_expiry_time fail validation
	properties.Property("non-positive idle_expiry_time fails validation", prop.ForAll(
		func(invalidExpiry int64) bool {
			if invalidExpiry > 0 {
				return true // Skip positive values
			}
			settings := &CacheSettings{
				MaxCacheSize:   1024 * 1024 * 1024,
				MaxCacheAge:    30 * 24 * 60 * 60,
				IdleExpiryTime: invalidExpiry,
			}
			return settings.Validate() != nil
		},
		gen.Int64Range(-1000, 0),
	))

	// Property: Invalid settings are rejected by mock store
	properties.Property("invalid settings are rejected by store", prop.ForAll(
		func(settings *CacheSettings) bool {
			if settings == nil {
				return true
			}

			store := NewMockSystemSettingsStore()
			originalSettings := store.GetCacheSettings()

			err := store.SetCacheSettingsWithValidation(settings)

			if settings.Validate() != nil {
				// Invalid settings should be rejected
				if err == nil {
					return false
				}
				// Original settings should be preserved
				current := store.GetCacheSettings()
				return current.MaxCacheSize == originalSettings.MaxCacheSize &&
					current.MaxCacheAge == originalSettings.MaxCacheAge &&
					current.IdleExpiryTime == originalSettings.IdleExpiryTime
			}
			return true
		},
		genInvalidCacheSettings(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Mock Types for Property Tests
// =============================================================================

// MockSystemSettingsStore simulates the system settings store for testing
type MockSystemSettingsStore struct {
	settings map[string]string
}

// NewMockSystemSettingsStore creates a new mock store with default values
func NewMockSystemSettingsStore() *MockSystemSettingsStore {
	defaults := DefaultCacheSettings()
	return &MockSystemSettingsStore{
		settings: map[string]string{
			"cache.max_size":    "1073741824",
			"cache.max_age":     "2592000",
			"cache.idle_expiry": "604800",
			// Store actual values for comparison
			"_max_size":    formatInt64(defaults.MaxCacheSize),
			"_max_age":     formatInt64(defaults.MaxCacheAge),
			"_idle_expiry": formatInt64(defaults.IdleExpiryTime),
		},
	}
}

// SetCacheSettings stores cache settings without validation
func (s *MockSystemSettingsStore) SetCacheSettings(settings *CacheSettings) {
	s.settings["cache.max_size"] = formatInt64(settings.MaxCacheSize)
	s.settings["cache.max_age"] = formatInt64(settings.MaxCacheAge)
	s.settings["cache.idle_expiry"] = formatInt64(settings.IdleExpiryTime)
}

// SetCacheSettingsWithValidation stores cache settings with validation
func (s *MockSystemSettingsStore) SetCacheSettingsWithValidation(settings *CacheSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}
	s.SetCacheSettings(settings)
	return nil
}

// GetCacheSettings retrieves cache settings
func (s *MockSystemSettingsStore) GetCacheSettings() *CacheSettings {
	return &CacheSettings{
		MaxCacheSize:   parseInt64(s.settings["cache.max_size"]),
		MaxCacheAge:    parseInt64(s.settings["cache.max_age"]),
		IdleExpiryTime: parseInt64(s.settings["cache.idle_expiry"]),
	}
}

// formatInt64 converts int64 to string
func formatInt64(v int64) string {
	return strconv.FormatInt(v, 10)
}

// parseInt64 converts string to int64
func parseInt64(s string) int64 {
	v, _ := strconv.ParseInt(s, 10, 64)
	return v
}


// =============================================================================
// Property Test Generators for HLS Cache Settings
// =============================================================================

// genValidHLSCacheSettings generates valid HLSCacheSettings
func genValidHLSCacheSettings() gopter.Gen {
	return gopter.CombineGens(
		genPositiveInt64(),
		genPositiveInt64(),
		genPositiveInt64(),
	).Map(func(vals []interface{}) *HLSCacheSettings {
		return &HLSCacheSettings{
			MaxCacheSize:   vals[0].(int64),
			MaxCacheAge:    vals[1].(int64),
			IdleExpiryTime: vals[2].(int64),
		}
	})
}

// genInvalidHLSCacheSettings generates invalid HLSCacheSettings (with non-positive values)
func genInvalidHLSCacheSettings() gopter.Gen {
	return gopter.CombineGens(
		gen.Int64Range(-1000, 0),
		gen.Int64Range(-1000, 0),
		gen.Int64Range(-1000, 0),
		gen.IntRange(0, 2), // which field to make invalid
	).Map(func(vals []interface{}) *HLSCacheSettings {
		invalidVal := vals[0].(int64)
		whichInvalid := vals[3].(int)

		settings := DefaultHLSCacheSettings()
		switch whichInvalid {
		case 0:
			settings.MaxCacheSize = invalidVal
		case 1:
			settings.MaxCacheAge = invalidVal
		case 2:
			settings.IdleExpiryTime = invalidVal
		}
		return settings
	})
}

// =============================================================================
// Property Tests for HLS Cache Settings
// =============================================================================

// **Feature: idle-precache-hls, Property 9: Settings Validation Round Trip**
// **Validates: Requirements 5.4**
func TestProperty_HLSCacheSettingsRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Valid HLS cache settings round trip through mock store preserves all values
	properties.Property("valid HLS settings round trip preserves all values", prop.ForAll(
		func(settings *HLSCacheSettings) bool {
			if settings == nil {
				return true
			}

			store := NewMockHLSCacheSettingsStore()
			store.SetHLSCacheSettings(settings)
			retrieved := store.GetHLSCacheSettings()

			return settings.MaxCacheSize == retrieved.MaxCacheSize &&
				settings.MaxCacheAge == retrieved.MaxCacheAge &&
				settings.IdleExpiryTime == retrieved.IdleExpiryTime
		},
		genValidHLSCacheSettings(),
	))

	// Property: Multiple updates preserve the latest values
	properties.Property("multiple HLS settings updates preserve latest values", prop.ForAll(
		func(settings1, settings2 *HLSCacheSettings) bool {
			if settings1 == nil || settings2 == nil {
				return true
			}

			store := NewMockHLSCacheSettingsStore()
			store.SetHLSCacheSettings(settings1)
			store.SetHLSCacheSettings(settings2)
			retrieved := store.GetHLSCacheSettings()

			return settings2.MaxCacheSize == retrieved.MaxCacheSize &&
				settings2.MaxCacheAge == retrieved.MaxCacheAge &&
				settings2.IdleExpiryTime == retrieved.IdleExpiryTime
		},
		genValidHLSCacheSettings(),
		genValidHLSCacheSettings(),
	))

	// Property: Valid settings pass validation
	properties.Property("valid HLS settings pass validation", prop.ForAll(
		func(settings *HLSCacheSettings) bool {
			if settings == nil {
				return true
			}
			return settings.Validate() == nil
		},
		genValidHLSCacheSettings(),
	))

	properties.TestingRun(t)
}

// **Feature: idle-precache-hls, Property 9: HLS Settings Invalid Rejection**
// **Validates: Requirements 5.4**
func TestProperty_HLSCacheSettingsInvalidRejection(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Settings with non-positive max_cache_size fail validation
	properties.Property("non-positive HLS max_cache_size fails validation", prop.ForAll(
		func(invalidSize int64) bool {
			if invalidSize > 0 {
				return true // Skip positive values
			}
			settings := &HLSCacheSettings{
				MaxCacheSize:   invalidSize,
				MaxCacheAge:    30 * 24 * 60 * 60,
				IdleExpiryTime: 14 * 24 * 60 * 60,
			}
			return settings.Validate() != nil
		},
		gen.Int64Range(-1000, 0),
	))

	// Property: Settings with non-positive max_cache_age fail validation
	properties.Property("non-positive HLS max_cache_age fails validation", prop.ForAll(
		func(invalidAge int64) bool {
			if invalidAge > 0 {
				return true // Skip positive values
			}
			settings := &HLSCacheSettings{
				MaxCacheSize:   5 * 1024 * 1024 * 1024,
				MaxCacheAge:    invalidAge,
				IdleExpiryTime: 14 * 24 * 60 * 60,
			}
			return settings.Validate() != nil
		},
		gen.Int64Range(-1000, 0),
	))

	// Property: Settings with non-positive idle_expiry_time fail validation
	properties.Property("non-positive HLS idle_expiry_time fails validation", prop.ForAll(
		func(invalidExpiry int64) bool {
			if invalidExpiry > 0 {
				return true // Skip positive values
			}
			settings := &HLSCacheSettings{
				MaxCacheSize:   5 * 1024 * 1024 * 1024,
				MaxCacheAge:    30 * 24 * 60 * 60,
				IdleExpiryTime: invalidExpiry,
			}
			return settings.Validate() != nil
		},
		gen.Int64Range(-1000, 0),
	))

	// Property: Invalid settings are rejected by mock store
	properties.Property("invalid HLS settings are rejected by store", prop.ForAll(
		func(settings *HLSCacheSettings) bool {
			if settings == nil {
				return true
			}

			store := NewMockHLSCacheSettingsStore()
			originalSettings := store.GetHLSCacheSettings()

			err := store.SetHLSCacheSettingsWithValidation(settings)

			if settings.Validate() != nil {
				// Invalid settings should be rejected
				if err == nil {
					return false
				}
				// Original settings should be preserved
				current := store.GetHLSCacheSettings()
				return current.MaxCacheSize == originalSettings.MaxCacheSize &&
					current.MaxCacheAge == originalSettings.MaxCacheAge &&
					current.IdleExpiryTime == originalSettings.IdleExpiryTime
			}
			return true
		},
		genInvalidHLSCacheSettings(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Mock Types for HLS Cache Settings Property Tests
// =============================================================================

// MockHLSCacheSettingsStore simulates the HLS cache settings store for testing
type MockHLSCacheSettingsStore struct {
	settings map[string]string
}

// NewMockHLSCacheSettingsStore creates a new mock store with default values
func NewMockHLSCacheSettingsStore() *MockHLSCacheSettingsStore {
	defaults := DefaultHLSCacheSettings()
	return &MockHLSCacheSettingsStore{
		settings: map[string]string{
			"hls_cache.max_size":    formatInt64(defaults.MaxCacheSize),
			"hls_cache.max_age":     formatInt64(defaults.MaxCacheAge),
			"hls_cache.idle_expiry": formatInt64(defaults.IdleExpiryTime),
		},
	}
}

// SetHLSCacheSettings stores HLS cache settings without validation
func (s *MockHLSCacheSettingsStore) SetHLSCacheSettings(settings *HLSCacheSettings) {
	s.settings["hls_cache.max_size"] = formatInt64(settings.MaxCacheSize)
	s.settings["hls_cache.max_age"] = formatInt64(settings.MaxCacheAge)
	s.settings["hls_cache.idle_expiry"] = formatInt64(settings.IdleExpiryTime)
}

// SetHLSCacheSettingsWithValidation stores HLS cache settings with validation
func (s *MockHLSCacheSettingsStore) SetHLSCacheSettingsWithValidation(settings *HLSCacheSettings) error {
	if err := settings.Validate(); err != nil {
		return err
	}
	s.SetHLSCacheSettings(settings)
	return nil
}

// GetHLSCacheSettings retrieves HLS cache settings
func (s *MockHLSCacheSettingsStore) GetHLSCacheSettings() *HLSCacheSettings {
	return &HLSCacheSettings{
		MaxCacheSize:   parseInt64(s.settings["hls_cache.max_size"]),
		MaxCacheAge:    parseInt64(s.settings["hls_cache.max_age"]),
		IdleExpiryTime: parseInt64(s.settings["hls_cache.idle_expiry"]),
	}
}
