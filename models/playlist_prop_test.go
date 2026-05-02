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

// **Feature: sidebar-library-expand, Property 6: Playlist JSON Serialization Round-Trip**
// **Validates: Requirements 7.5, 7.6**
//
// For any valid Playlist object, serializing to JSON and then deserializing
// should produce an equivalent object.

func TestPlaylistJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid Playlist objects
	playlistGen := gen.Struct(reflect.TypeOf(Playlist{}), map[string]gopter.Gen{
		"ID":          genPlaylistUUID(),
		"UserID":      genPlaylistUUID(),
		"Name":        genPlaylistName(),
		"Description": genPlaylistDescription(),
		"ArtworkURL":  genPlaylistArtworkURL(),
		"SongCount":   gen.IntRange(0, 1000),
		"CreatedAt":   genPlaylistTime(),
		"UpdatedAt":   genPlaylistTime(),
	})

	// Property: Playlist JSON serialization round-trip preserves all fields
	properties.Property("Playlist JSON serialization round-trip preserves all fields", prop.ForAll(
		func(playlist Playlist) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(playlist)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded Playlist
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.ID == playlist.ID &&
				decoded.UserID == playlist.UserID &&
				decoded.Name == playlist.Name &&
				decoded.Description == playlist.Description &&
				decoded.ArtworkURL == playlist.ArtworkURL &&
				decoded.SongCount == playlist.SongCount &&
				decoded.CreatedAt.Unix() == playlist.CreatedAt.Unix() &&
				decoded.UpdatedAt.Unix() == playlist.UpdatedAt.Unix()
		},
		playlistGen,
	))

	properties.TestingRun(t)
}

func TestPlaylistSongJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid PlaylistSong objects
	playlistSongGen := gen.Struct(reflect.TypeOf(PlaylistSong{}), map[string]gopter.Gen{
		"ID":         genPlaylistUUID(),
		"PlaylistID": genPlaylistUUID(),
		"SongID":     genPlaylistSongID(),
		"SongName":   genPlaylistSongName(),
		"ArtistName": genPlaylistArtistName(),
		"AlbumName":  genPlaylistAlbumName(),
		"AlbumID":    genPlaylistAlbumID(),
		"Duration":   gen.IntRange(30, 600),
		"ArtworkURL": genPlaylistArtworkURL(),
		"HasLyrics":  gen.Bool(),
		"Position":   gen.IntRange(0, 1000),
		"CreatedAt":  genPlaylistTime(),
	})

	// Property: PlaylistSong JSON serialization round-trip preserves all fields
	properties.Property("PlaylistSong JSON serialization round-trip preserves all fields", prop.ForAll(
		func(song PlaylistSong) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(song)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded PlaylistSong
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.ID == song.ID &&
				decoded.PlaylistID == song.PlaylistID &&
				decoded.SongID == song.SongID &&
				decoded.SongName == song.SongName &&
				decoded.ArtistName == song.ArtistName &&
				decoded.AlbumName == song.AlbumName &&
				decoded.AlbumID == song.AlbumID &&
				decoded.Duration == song.Duration &&
				decoded.ArtworkURL == song.ArtworkURL &&
				decoded.HasLyrics == song.HasLyrics &&
				decoded.Position == song.Position &&
				decoded.CreatedAt.Unix() == song.CreatedAt.Unix()
		},
		playlistSongGen,
	))

	properties.TestingRun(t)
}

// Helper generators for Playlist

func genPlaylistUUID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "00000000-0000-0000-0000-000000000000"
		}
		if len(s) > 36 {
			return s[:36]
		}
		return s
	})
}

func genPlaylistName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "My Playlist"
		}
		if len(s) > 100 {
			return s[:100]
		}
		return s
	})
}

func genPlaylistDescription() gopter.Gen {
	return gen.OneConstOf("", "A great playlist", "My favorite songs", "Workout mix")
}

func genPlaylistArtworkURL() gopter.Gen {
	return gen.OneConstOf("", "https://example.com/artwork.jpg", "/api/artwork/playlist.png")
}

func genPlaylistSongID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "song123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genPlaylistSongName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "Song Name"
		}
		if len(s) > 100 {
			return s[:100]
		}
		return s
	})
}

func genPlaylistArtistName() gopter.Gen {
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

func genPlaylistAlbumName() gopter.Gen {
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

func genPlaylistAlbumID() gopter.Gen {
	return gen.OneConstOf("", "album123", "album456", "album789")
}

func genPlaylistTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}
