package ampapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

type APIStatusError struct {
	StatusCode int
	Status     string
	RetryAfter time.Duration
}

func (e *APIStatusError) Error() string {
	if e == nil {
		return "API request failed"
	}
	return fmt.Sprintf("API request failed with status: %s", e.Status)
}

func parseRetryAfter(value string) time.Duration {
	if value == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(value); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	if when, err := http.ParseTime(value); err == nil {
		delay := time.Until(when)
		if delay > 0 {
			return delay
		}
	}
	return 0
}

// SearchResp represents the top-level response from the search API.
type SearchResp struct {
	Results SearchResults `json:"results"`
	Meta    *SearchMeta   `json:"meta,omitempty"`
}

// SearchMeta contains metadata about the search results
type SearchMeta struct {
	Results SearchMetaResults `json:"results"`
}

// SearchMetaResults contains the order of result types
type SearchMetaResults struct {
	Order   []string `json:"order"`
	RawData string   `json:"rawData,omitempty"`
}

// SearchResults contains the different types of search results.
type SearchResults struct {
	Songs      *SongResults     `json:"songs,omitempty"`
	Albums     *AlbumResults    `json:"albums,omitempty"`
	Artists    *ArtistResults   `json:"artists,omitempty"`
	Playlists  *PlaylistResults `json:"playlists,omitempty"`
	TopResults *TopResultsData  `json:"top,omitempty"`
}

// TopResultsData contains the top/best match results
type TopResultsData struct {
	Href string          `json:"href"`
	Next string          `json:"next"`
	Data []TopResultItem `json:"data"`
}

// TopResultItem represents a single top result item (can be song, album, or artist)
type TopResultItem struct {
	ID         string             `json:"id"`
	Type       string             `json:"type"` // "songs", "albums", "artists"
	Href       string             `json:"href"`
	Attributes TopResultItemAttrs `json:"attributes"`
}

// TopResultItemAttrs contains common attributes for top result items
type TopResultItemAttrs struct {
	Name       string `json:"name"`
	ArtistName string `json:"artistName,omitempty"` // for songs and albums
	AlbumName  string `json:"albumName,omitempty"`  // for songs
	Artwork    struct {
		URL string `json:"url"`
	} `json:"artwork"`
}

// PlaylistResults contains a list of playlist search results.
type PlaylistResults struct {
	Href string               `json:"href"`
	Next string               `json:"next"`
	Data []PlaylistSearchData `json:"data"`
}

// PlaylistSearchData represents a playlist in search results.
type PlaylistSearchData struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Href       string `json:"href"`
	Attributes struct {
		Name        string `json:"name"`
		CuratorName string `json:"curatorName"`
		Description struct {
			Standard string `json:"standard"`
			Short    string `json:"short"`
		} `json:"description"`
		URL     string `json:"url"`
		Artwork struct {
			Width      int    `json:"width"`
			Height     int    `json:"height"`
			URL        string `json:"url"`
			BgColor    string `json:"bgColor"`
			TextColor1 string `json:"textColor1"`
		} `json:"artwork"`
		PlayParams struct {
			ID   string `json:"id"`
			Kind string `json:"kind"`
		} `json:"playParams"`
		TrackCount int `json:"trackCount"`
	} `json:"attributes"`
}

// SongResults contains a list of song search results.
type SongResults struct {
	Href string         `json:"href"`
	Next string         `json:"next"`
	Data []SongRespData `json:"data"`
}

// AlbumResults contains a list of album search results.
type AlbumResults struct {
	Href string          `json:"href"`
	Next string          `json:"next"`
	Data []AlbumRespData `json:"data"`
}

// ArtistResults contains a list of artist search results.
type ArtistResults struct {
	Href string `json:"href"`
	Next string `json:"next"`
	Data []struct {
		ID         string `json:"id"`
		Type       string `json:"type"`
		Href       string `json:"href"`
		Attributes struct {
			Name       string   `json:"name"`
			GenreNames []string `json:"genreNames"`
			URL        string   `json:"url"`
			Artwork    struct {
				URL string `json:"url"`
			} `json:"artwork"`
		} `json:"attributes"`
	} `json:"data"`
}

// Search performs a search query against the Apple Music API.
func Search(storefront, term, types, language, token string, limit, offset int) (*SearchResp, error) {
	return SearchWithOptions(storefront, term, types, language, token, limit, offset, false)
}

// SearchWithTopResults performs a search query with topResults included.
func SearchWithTopResults(storefront, term, types, language, token string, limit, offset int) (*SearchResp, error) {
	return SearchWithOptions(storefront, term, types, language, token, limit, offset, true)
}

// SearchWithOptions performs a search query with configurable options.
func SearchWithOptions(storefront, term, types, language, token string, limit, offset int, includeTopResults bool) (*SearchResp, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest("GET", fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/search", storefront), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	query := url.Values{}
	query.Set("term", term)
	query.Set("types", types)
	query.Set("limit", fmt.Sprintf("%d", limit))
	query.Set("offset", fmt.Sprintf("%d", offset))
	query.Set("l", language)
	query.Set("include[songs]", "artists,albums")
	query.Set("include[albums]", "artists")
	if includeTopResults {
		query.Set("with", "topResults")
	}
	req.URL.RawQuery = query.Encode()

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, &APIStatusError{
			StatusCode: do.StatusCode,
			Status:     do.Status,
			RetryAfter: parseRetryAfter(do.Header.Get("Retry-After")),
		}
	}

	obj := new(SearchResp)
	err = json.NewDecoder(do.Body).Decode(&obj)
	if err != nil {
		return nil, err
	}

	return obj, nil
}
