package models

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: artist-follow, Property 9: Follow/unfollow database round-trip**
// **Validates: Requirements 5.1, 5.2, 5.3**
//
// For any valid FollowedArtist object, serializing to JSON and then deserializing
// should produce an equivalent object.

func TestFollowedArtistJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid FollowedArtist objects
	followedArtistGen := gen.Struct(reflect.TypeOf(FollowedArtist{}), map[string]gopter.Gen{
		"ID":         genUUID(),
		"UserID":     genUUID(),
		"ArtistID":   genFollowedArtistID(),
		"ArtistName": genFollowedArtistName(),
		"ArtworkURL": genFollowedArtistArtworkURL(),
		"CreatedAt":  genFollowedArtistTime(),
	})

	// Property: JSON serialization round-trip preserves all fields
	properties.Property("JSON serialization round-trip preserves all fields", prop.ForAll(
		func(artist FollowedArtist) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(artist)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded FollowedArtist
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.ID == artist.ID &&
				decoded.UserID == artist.UserID &&
				decoded.ArtistID == artist.ArtistID &&
				decoded.ArtistName == artist.ArtistName &&
				decoded.ArtworkURL == artist.ArtworkURL &&
				decoded.CreatedAt.Unix() == artist.CreatedAt.Unix()
		},
		followedArtistGen,
	))

	// Property: FollowArtistRequest JSON round-trip
	followRequestGen := gen.Struct(reflect.TypeOf(FollowArtistRequest{}), map[string]gopter.Gen{
		"ArtistID":   genFollowedArtistID(),
		"ArtistName": genFollowedArtistName(),
		"ArtworkURL": genFollowedArtistArtworkURL(),
	})

	properties.Property("FollowArtistRequest JSON round-trip preserves all fields", prop.ForAll(
		func(req FollowArtistRequest) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(req)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded FollowArtistRequest
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.ArtistID == req.ArtistID &&
				decoded.ArtistName == req.ArtistName &&
				decoded.ArtworkURL == req.ArtworkURL
		},
		followRequestGen,
	))

	properties.TestingRun(t)
}

// Helper generators for FollowedArtist

func genFollowedArtistID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "artist123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genFollowedArtistName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "Artist Name"
		}
		if len(s) > 100 {
			return s[:100]
		}
		return s
	})
}

func genFollowedArtistArtworkURL() gopter.Gen {
	return gen.OneConstOf("", "https://example.com/artist.jpg", "/api/artwork/artist123.png")
}

func genFollowedArtistTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}
