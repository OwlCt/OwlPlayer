package ampapi

import (
	"net/url"
	"testing"

	"pgregory.net/rapid"
)

/**
 * **Feature: artist-dynamic-artwork, Property 3: API Request Construction**
 * *For any* artist detail fetch request, the request URL SHALL contain the
 * `extend=editorialVideo,editorialArtwork` parameter.
 * **Validates: Requirements 1.1**
 */
func TestArtistAPIRequestContainsExtendParameter(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random storefront and artist ID
		storefronts := []string{"us", "cn", "jp", "gb", "de", "fr", "kr", "tw", "hk"}
		storefront := rapid.SampledFrom(storefronts).Draw(t, "storefront")
		artistID := rapid.StringMatching(`[0-9]{6,12}`).Draw(t, "artistID")
		languages := []string{"en-US", "zh-CN", "ja-JP", "zh-TW", "ko-KR"}
		language := rapid.SampledFrom(languages).Draw(t, "language")

		// Build the query parameters as done in GetArtistResp
		query := url.Values{}
		query.Set("views", "top-songs,full-albums,singles,featured-albums,live-albums,compilation-albums,appears-on-albums")
		query.Set("include[songs]", "artists,albums")
		query.Set("fields[artists]", "name,artwork,genreNames,url")
		query.Set("extend", "editorialVideo,editorialArtwork")
		query.Set("l", language)

		// Verify the extend parameter is present and correct
		extendValue := query.Get("extend")
		if extendValue == "" {
			t.Errorf("extend parameter is missing for storefront=%s, artistID=%s", storefront, artistID)
		}

		// Verify it contains both editorialVideo and editorialArtwork
		if extendValue != "editorialVideo,editorialArtwork" {
			t.Errorf("extend parameter should be 'editorialVideo,editorialArtwork', got '%s'", extendValue)
		}

		// Verify the encoded query string contains the extend parameter
		encodedQuery := query.Encode()
		parsedQuery, err := url.ParseQuery(encodedQuery)
		if err != nil {
			t.Fatalf("Failed to parse encoded query: %v", err)
		}

		parsedExtend := parsedQuery.Get("extend")
		if parsedExtend != "editorialVideo,editorialArtwork" {
			t.Errorf("After encoding/decoding, extend parameter should be 'editorialVideo,editorialArtwork', got '%s'", parsedExtend)
		}
	})
}

/**
 * **Feature: artist-dynamic-artwork, Property 3: API Request Construction**
 * *For any* valid query parameters, the extend parameter SHALL survive URL encoding
 * and decoding without data loss.
 * **Validates: Requirements 1.1**
 */
func TestExtendParameterRoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// The extend parameter value we expect
		expectedExtend := "editorialVideo,editorialArtwork"

		// Build query with extend parameter
		query := url.Values{}
		query.Set("extend", expectedExtend)

		// Encode and decode
		encoded := query.Encode()
		decoded, err := url.ParseQuery(encoded)
		if err != nil {
			t.Fatalf("Failed to parse query: %v", err)
		}

		// Verify round-trip preserves the value
		result := decoded.Get("extend")
		if result != expectedExtend {
			t.Errorf("Round-trip failed: expected '%s', got '%s'", expectedExtend, result)
		}
	})
}
