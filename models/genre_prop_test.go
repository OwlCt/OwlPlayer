package models

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
	"github.com/lib/pq"
)

// **Feature: personalized-recommendations, Property 1: Genre Data Round-Trip Consistency**
// *For any* genre array, serializing to JSON and deserializing back SHALL produce an identical array.
// **Validates: Requirements 10.3**
func TestGenreDataRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Property: Genre array round-trip via JSON produces identical result
	properties.Property("Genre array JSON round-trip preserves data", prop.ForAll(
		func(genres []string) bool {
			// Handle nil case - convert to empty slice for comparison
			if genres == nil {
				genres = []string{}
			}

			// Serialize to JSON
			data, err := json.Marshal(genres)
			if err != nil {
				return false
			}

			// Deserialize from JSON
			var result []string
			err = json.Unmarshal(data, &result)
			if err != nil {
				return false
			}

			// Handle nil result - convert to empty slice for comparison
			if result == nil {
				result = []string{}
			}

			return reflect.DeepEqual(genres, result)
		},
		gen.SliceOf(gen.AlphaString()),
	))

	// Property: pq.StringArray round-trip via JSON produces identical result
	properties.Property("pq.StringArray JSON round-trip preserves data", prop.ForAll(
		func(genres []string) bool {
			// Handle nil case
			if genres == nil {
				genres = []string{}
			}

			// Create pq.StringArray
			pgArray := pq.StringArray(genres)

			// Serialize to JSON
			data, err := json.Marshal(pgArray)
			if err != nil {
				return false
			}

			// Deserialize from JSON
			var result pq.StringArray
			err = json.Unmarshal(data, &result)
			if err != nil {
				return false
			}

			// Handle nil result
			if result == nil {
				result = pq.StringArray{}
			}

			return reflect.DeepEqual(pgArray, result)
		},
		gen.SliceOf(gen.AlphaString()),
	))

	// Property: Empty genre array round-trip
	properties.Property("Empty genre array round-trip", prop.ForAll(
		func(_ bool) bool {
			genres := []string{}

			data, err := json.Marshal(genres)
			if err != nil {
				return false
			}

			var result []string
			err = json.Unmarshal(data, &result)
			if err != nil {
				return false
			}

			// Empty array should remain empty
			return len(result) == 0
		},
		gen.Bool(),
	))

	// Property: Genre array with unicode characters round-trip
	properties.Property("Genre array with unicode round-trip", prop.ForAll(
		func(genres []string) bool {
			if genres == nil {
				genres = []string{}
			}

			// Add some unicode test data
			testGenres := append(genres, "国语流行", "日本流行", "한국 팝")

			data, err := json.Marshal(testGenres)
			if err != nil {
				return false
			}

			var result []string
			err = json.Unmarshal(data, &result)
			if err != nil {
				return false
			}

			return reflect.DeepEqual(testGenres, result)
		},
		gen.SliceOf(gen.AlphaString()),
	))

	properties.TestingRun(t)
}
