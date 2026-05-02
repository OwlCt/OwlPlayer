package ampapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// SuggestionResp represents the API response from /search/suggestions
type SuggestionResp struct {
	Results struct {
		Suggestions []Suggestion `json:"suggestions"`
	} `json:"results"`
}

// Suggestion represents a single suggestion item
type Suggestion struct {
	Kind        string             `json:"kind"`        // "terms" or "topResults"
	DisplayTerm string             `json:"displayTerm"` // for terms
	SearchTerm  string             `json:"searchTerm"`  // for terms
	Content     *SuggestionContent `json:"content"`     // for topResults
}

// SuggestionContent represents content in topResults suggestions
type SuggestionContent struct {
	ID         string `json:"id"`
	Type       string `json:"type"` // "artists", "albums", "songs"
	Href       string `json:"href"`
	Attributes struct {
		Name       string `json:"name"`
		ArtistName string `json:"artistName,omitempty"` // for albums/songs
		Artwork    struct {
			URL    string `json:"url"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"artwork"`
	} `json:"attributes"`
}

// GetSuggestions fetches search suggestions from Apple Music API
func GetSuggestions(storefront, term, language, token string) (*SuggestionResp, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest("GET", fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/search/suggestions", storefront), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	query := url.Values{}
	query.Set("term", term)
	query.Set("types", "artists,albums,songs")
	query.Set("kinds", "terms,topResults")
	query.Set("l", language)
	req.URL.RawQuery = query.Encode()

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status: %s", do.Status)
	}

	obj := new(SuggestionResp)
	err = json.NewDecoder(do.Body).Decode(&obj)
	if err != nil {
		return nil, err
	}

	// Apply artwork URL proxy conversion
	for i := range obj.Results.Suggestions {
		if obj.Results.Suggestions[i].Content != nil {
			artworkURL := obj.Results.Suggestions[i].Content.Attributes.Artwork.URL
			if artworkURL != "" {
				obj.Results.Suggestions[i].Content.Attributes.Artwork.URL = convertToProxyURL(artworkURL)
			}
		}
	}

	return obj, nil
}

// convertToProxyURL converts Apple Music artwork URL to proxy URL
// Replaces {w}x{h} placeholder with actual size (80x80 for suggestions dropdown)
func convertToProxyURL(originalURL string) string {
	if originalURL == "" {
		return ""
	}
	// Replace {w}x{h} placeholder with actual size
	processed := strings.Replace(originalURL, "{w}x{h}", "80x80", 1)
	// Also handle {w} and {h} separately
	processed = strings.Replace(processed, "{w}", "80", 1)
	processed = strings.Replace(processed, "{h}", "80", 1)
	return "/api/image?url=" + url.QueryEscape(processed)
}
