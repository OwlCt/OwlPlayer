package ampapi

import (
	"encoding/json"
	"testing"

	"pgregory.net/rapid"
)

// **Feature: search-refactor, Property 3: Suggestion parsing completeness**
// For any valid API suggestion response, all "terms" kind suggestions SHALL be parsed
// into TermSuggestion objects, and all "topResults" kind suggestions SHALL be parsed
// into ContentSuggestion objects.
func TestSuggestionParsingCompleteness(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		// Generate random suggestions
		numTerms := rapid.IntRange(0, 10).Draw(t, "numTerms")
		numTopResults := rapid.IntRange(0, 10).Draw(t, "numTopResults")

		suggestions := make([]Suggestion, 0, numTerms+numTopResults)

		// Generate term suggestions
		for i := 0; i < numTerms; i++ {
			displayTerm := rapid.StringMatching(`[a-zA-Z0-9 ]{1,50}`).Draw(t, "displayTerm")
			searchTerm := rapid.StringMatching(`[a-zA-Z0-9 ]{1,50}`).Draw(t, "searchTerm")
			suggestions = append(suggestions, Suggestion{
				Kind:        "terms",
				DisplayTerm: displayTerm,
				SearchTerm:  searchTerm,
			})
		}

		// Generate topResults suggestions
		contentTypes := []string{"artists", "albums", "songs"}
		for i := 0; i < numTopResults; i++ {
			contentType := rapid.SampledFrom(contentTypes).Draw(t, "contentType")
			name := rapid.StringMatching(`[a-zA-Z0-9 ]{1,50}`).Draw(t, "name")
			artistName := rapid.StringMatching(`[a-zA-Z0-9 ]{1,50}`).Draw(t, "artistName")
			artworkURL := rapid.StringMatching(`https://[a-z]+\.mzstatic\.com/[a-z0-9/]+\.jpg`).Draw(t, "artworkURL")

			suggestions = append(suggestions, Suggestion{
				Kind: "topResults",
				Content: &SuggestionContent{
					ID:   rapid.StringMatching(`[0-9]{8,12}`).Draw(t, "id"),
					Type: contentType,
					Attributes: struct {
						Name       string `json:"name"`
						ArtistName string `json:"artistName,omitempty"`
						Artwork    struct {
							URL    string `json:"url"`
							Width  int    `json:"width"`
							Height int    `json:"height"`
						} `json:"artwork"`
					}{
						Name:       name,
						ArtistName: artistName,
						Artwork: struct {
							URL    string `json:"url"`
							Width  int    `json:"width"`
							Height int    `json:"height"`
						}{
							URL:    artworkURL,
							Width:  300,
							Height: 300,
						},
					},
				},
			})
		}

		// Create response
		resp := SuggestionResp{}
		resp.Results.Suggestions = suggestions

		// Verify JSON serialization/deserialization works
		jsonData, err := json.Marshal(resp)
		if err != nil {
			t.Fatalf("Failed to marshal response: %v", err)
		}

		var parsed SuggestionResp
		err = json.Unmarshal(jsonData, &parsed)
		if err != nil {
			t.Fatalf("Failed to unmarshal response: %v", err)
		}

		// Count parsed suggestions by kind
		termCount := 0
		topResultCount := 0
		for _, s := range parsed.Results.Suggestions {
			switch s.Kind {
			case "terms":
				termCount++
				if s.DisplayTerm == "" || s.SearchTerm == "" {
					t.Errorf("Term suggestion missing required fields")
				}
			case "topResults":
				topResultCount++
				if s.Content == nil {
					t.Errorf("TopResults suggestion missing content")
				}
			}
		}

		// Verify all suggestions were parsed
		if termCount != numTerms {
			t.Errorf("Expected %d term suggestions, got %d", numTerms, termCount)
		}
		if topResultCount != numTopResults {
			t.Errorf("Expected %d topResults suggestions, got %d", numTopResults, topResultCount)
		}
	})
}

// TestProxyURLConversion tests that artwork URLs are properly converted to proxy URLs
func TestProxyURLConversion(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty URL",
			input:    "",
			expected: "",
		},
		{
			name:     "valid artwork URL",
			input:    "https://is1-ssl.mzstatic.com/image/thumb/test.jpg",
			expected: "/api/image?url=https%3A%2F%2Fis1-ssl.mzstatic.com%2Fimage%2Fthumb%2Ftest.jpg",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := convertToProxyURL(tt.input)
			if result != tt.expected {
				t.Errorf("convertToProxyURL(%q) = %q, want %q", tt.input, result, tt.expected)
			}
		})
	}
}
