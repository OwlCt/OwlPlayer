package ampapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
)

// ChartsResp represents the response from the charts API
type ChartsResp struct {
	Results ChartsResults `json:"results"`
}

// ChartsResults contains different chart types
type ChartsResults struct {
	Songs     []ChartSection `json:"songs,omitempty"`
	Albums    []ChartSection `json:"albums,omitempty"`
	Playlists []ChartSection `json:"playlists,omitempty"`
}

// ChartSection represents a chart category
type ChartSection struct {
	Chart string      `json:"chart"`
	Name  string      `json:"name"`
	Href  string      `json:"href"`
	Next  string      `json:"next,omitempty"`
	Data  []ChartItem `json:"data"`
}

// ChartItem represents an item in the chart
type ChartItem struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	Href       string          `json:"href"`
	Attributes ChartAttributes `json:"attributes"`
}

// ChartAttributes contains the item details
type ChartAttributes struct {
	Name        string   `json:"name"`
	ArtistName  string   `json:"artistName,omitempty"`
	CuratorName string   `json:"curatorName,omitempty"`
	GenreNames  []string `json:"genreNames,omitempty"`
	URL         string   `json:"url"`
	Artwork     struct {
		Width      int    `json:"width"`
		Height     int    `json:"height"`
		URL        string `json:"url"`
		BgColor    string `json:"bgColor"`
		TextColor1 string `json:"textColor1"`
	} `json:"artwork"`
	PlayParams struct {
		ID   string `json:"id"`
		Kind string `json:"kind"`
	} `json:"playParams,omitempty"`
	// Playlist specific
	Description      *EditorialNotes `json:"description,omitempty"`
	LastModifiedDate string          `json:"lastModifiedDate,omitempty"`
	// Song/Album specific
	ReleaseDate   string `json:"releaseDate,omitempty"`
	TrackCount    int    `json:"trackCount,omitempty"`
	DurationInMs  int    `json:"durationInMillis,omitempty"`
	ContentRating string `json:"contentRating,omitempty"`
}

// EditorialNotes for playlist descriptions
type EditorialNotes struct {
	Standard string `json:"standard,omitempty"`
	Short    string `json:"short,omitempty"`
}

// GetCharts fetches charts from Apple Music API
// types can be: "songs", "albums", "playlists" (comma separated)
// genre is optional, e.g., "20" for Alternative
func GetCharts(storefront, types, language, token string, limit int) (*ChartsResp, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest("GET", fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/charts", storefront), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	query := url.Values{}
	query.Set("types", types)
	query.Set("l", language)
	if limit > 0 {
		query.Set("limit", fmt.Sprintf("%d", limit))
	}
	req.URL.RawQuery = query.Encode()

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("API request failed with status: %s", do.Status)
	}

	obj := new(ChartsResp)
	err = json.NewDecoder(do.Body).Decode(&obj)
	if err != nil {
		return nil, err
	}

	return obj, nil
}
