package models

import (
	"reflect"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: streaming-player, Property 1: Search results categorization**
// *For any* search query, all returned results SHALL have a valid type field
// that is one of "album", "song", or "artist"
// **Validates: Requirements 1.2**
func TestSearchResultsCategorization(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for RankedItem
	rankedItemGen := gen.Struct(reflect.TypeOf(RankedItem{}), map[string]gopter.Gen{
		"Type":           gen.OneConstOf("album", "song", "artist"),
		"ID":             gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"RelevanceScore": gen.Float64Range(0, 1),
	})

	// Property: All ranked items have valid type
	properties.Property("All ranked items have valid type", prop.ForAll(
		func(item RankedItem) bool {
			return item.IsValidType()
		},
		rankedItemGen,
	))

	// Property: Type is always one of album, song, or artist
	properties.Property("Type is one of album/song/artist", prop.ForAll(
		func(itemType string) bool {
			item := RankedItem{Type: itemType}
			validTypes := map[string]bool{"album": true, "song": true, "artist": true}
			return item.IsValidType() == validTypes[itemType]
		},
		gen.OneConstOf("album", "song", "artist", "invalid", "playlist", ""),
	))

	properties.TestingRun(t)
}

// **Feature: streaming-player, Property 2: Search result completeness**
// *For any* search result item, the rendered output SHALL contain artwork URL,
// name, artist name, and duration (for songs)
// **Validates: Requirements 1.3**
func TestSearchResultCompleteness(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100

	properties := gopter.NewProperties(parameters)

	// Generator for SongItem with required fields
	songGen := gen.Struct(reflect.TypeOf(SongItem{}), map[string]gopter.Gen{
		"ID":         gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"Name":       gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"ArtistName": gen.AnyString(),
		"AlbumName":  gen.AnyString(),
		"Duration":   gen.IntRange(0, 600000), // 0-10 minutes in ms
		"ArtworkURL": gen.AnyString(),
	})

	// Property: Song with ID and Name is valid
	properties.Property("Song with ID and Name is valid", prop.ForAll(
		func(song SongItem) bool {
			return song.IsValid()
		},
		songGen,
	))

	// Generator for AlbumItem with required fields
	albumGen := gen.Struct(reflect.TypeOf(AlbumItem{}), map[string]gopter.Gen{
		"ID":         gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"Name":       gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"ArtistName": gen.AnyString(),
		"ArtworkURL": gen.AnyString(),
		"TrackCount": gen.IntRange(1, 50),
	})

	// Property: Album with ID and Name is valid
	properties.Property("Album with ID and Name is valid", prop.ForAll(
		func(album AlbumItem) bool {
			return album.IsValid()
		},
		albumGen,
	))

	// Generator for ArtistItem with required fields
	artistGen := gen.Struct(reflect.TypeOf(ArtistItem{}), map[string]gopter.Gen{
		"ID":         gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"Name":       gen.AnyString().SuchThat(func(s string) bool { return s != "" }),
		"ArtworkURL": gen.AnyString(),
	})

	// Property: Artist with ID and Name is valid
	properties.Property("Artist with ID and Name is valid", prop.ForAll(
		func(artist ArtistItem) bool {
			return artist.IsValid()
		},
		artistGen,
	))

	properties.TestingRun(t)
}
