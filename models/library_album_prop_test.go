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

// **Feature: library-albums, Property 5: JSON Serialization Round-Trip**
// **Validates: Requirements 5.3, 5.4**
//
// For any valid LibraryAlbum object, serializing to JSON and then deserializing
// should produce an equivalent object.

func TestLibraryAlbumJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid LibraryAlbum objects
	libraryAlbumGen := gen.Struct(reflect.TypeOf(LibraryAlbum{}), map[string]gopter.Gen{
		"ID":          genUUID(),
		"UserID":      genUUID(),
		"AlbumID":     genAlbumID(),
		"AlbumName":   genAlbumName(),
		"ArtistName":  genArtistName(),
		"ArtworkURL":  genLibraryAlbumArtworkURL(),
		"ReleaseDate": genReleaseDate(),
		"TrackCount":  gen.IntRange(1, 50),
		"CreatedAt":   genLibraryAlbumTime(),
	})

	// Property: JSON serialization round-trip preserves all fields
	properties.Property("JSON serialization round-trip preserves all fields", prop.ForAll(
		func(album LibraryAlbum) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(album)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded LibraryAlbum
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.ID == album.ID &&
				decoded.UserID == album.UserID &&
				decoded.AlbumID == album.AlbumID &&
				decoded.AlbumName == album.AlbumName &&
				decoded.ArtistName == album.ArtistName &&
				decoded.ArtworkURL == album.ArtworkURL &&
				decoded.ReleaseDate == album.ReleaseDate &&
				decoded.TrackCount == album.TrackCount &&
				decoded.CreatedAt.Unix() == album.CreatedAt.Unix()
		},
		libraryAlbumGen,
	))

	// Property: AddLibraryAlbumRequest JSON round-trip
	addRequestGen := gen.Struct(reflect.TypeOf(AddLibraryAlbumRequest{}), map[string]gopter.Gen{
		"AlbumID":     genAlbumID(),
		"AlbumName":   genAlbumName(),
		"ArtistName":  genArtistName(),
		"ArtworkURL":  genLibraryAlbumArtworkURL(),
		"ReleaseDate": genReleaseDate(),
		"TrackCount":  gen.IntRange(1, 50),
	})

	properties.Property("AddLibraryAlbumRequest JSON round-trip preserves all fields", prop.ForAll(
		func(req AddLibraryAlbumRequest) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(req)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded AddLibraryAlbumRequest
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.AlbumID == req.AlbumID &&
				decoded.AlbumName == req.AlbumName &&
				decoded.ArtistName == req.ArtistName &&
				decoded.ArtworkURL == req.ArtworkURL &&
				decoded.ReleaseDate == req.ReleaseDate &&
				decoded.TrackCount == req.TrackCount
		},
		addRequestGen,
	))

	properties.TestingRun(t)
}

// Helper generators for LibraryAlbum

func genAlbumID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "album123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genAlbumName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "Album Name"
		}
		if len(s) > 100 {
			return s[:100]
		}
		return s
	})
}

func genArtistName() gopter.Gen {
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

func genLibraryAlbumArtworkURL() gopter.Gen {
	return gen.OneConstOf("", "https://example.com/artwork.jpg", "/api/artwork/album123.png")
}

func genReleaseDate() gopter.Gen {
	return gen.OneConstOf("", "2024-01-15", "2023-06-30", "2020-12-01")
}

func genLibraryAlbumTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}
