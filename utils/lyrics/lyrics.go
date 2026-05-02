package lyrics

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
)

// SongLyrics represents the API response structure for lyrics
type SongLyrics struct {
	Data []struct {
		Id         string `json:"id"`
		Type       string `json:"type"`
		Attributes struct {
			Ttml              string `json:"ttml"`
			TtmlLocalizations string `json:"ttmlLocalizations"`
			PlayParams        struct {
				Id          string `json:"id"`
				Kind        string `json:"kind"`
				CatalogId   string `json:"catalogId"`
				DisplayType int    `json:"displayType"`
			} `json:"playParams"`
		} `json:"attributes"`
	} `json:"data"`
}

// GetTTML retrieves raw TTML lyrics, trying syllable-lyrics first then falling back to lyrics
// Returns: ttml string, lrcType used, error
func GetTTML(storefront, songId, language, token, mediaUserToken string) (string, string, error) {
	if len(mediaUserToken) < 50 {
		return "", "", errors.New("MediaUserToken not set")
	}

	// Try syllable-lyrics first (word-by-word timing)
	ttml, err := getSongLyrics(songId, storefront, token, mediaUserToken, "syllable-lyrics", language)
	if err == nil && ttml != "" {
		return ttml, "syllable-lyrics", nil
	}

	// Fall back to regular lyrics (line-by-line timing)
	ttml, err = getSongLyrics(songId, storefront, token, mediaUserToken, "lyrics", language)
	if err == nil && ttml != "" {
		return ttml, "lyrics", nil
	}

	// No lyrics available
	if err != nil {
		return "", "", err
	}
	return "", "", errors.New("no lyrics available")
}

// getSongLyrics fetches lyrics from Apple Music API
func getSongLyrics(songId string, storefront string, token string, userToken string, lrcType string, language string) (string, error) {
	req, err := http.NewRequest("GET",
		fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/songs/%s/%s?l=%s&extend=ttmlLocalizations", storefront, songId, lrcType, language), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Origin", "https://music.apple.com")
	req.Header.Set("Referer", "https://music.apple.com/")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	cookie := http.Cookie{Name: "media-user-token", Value: userToken}
	req.AddCookie(&cookie)
	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer do.Body.Close()
	obj := new(SongLyrics)
	_ = json.NewDecoder(do.Body).Decode(&obj)
	if obj.Data != nil && len(obj.Data) > 0 {
		if len(obj.Data[0].Attributes.Ttml) > 0 {
			return obj.Data[0].Attributes.Ttml, nil
		}
		return obj.Data[0].Attributes.TtmlLocalizations, nil
	}
	return "", errors.New("failed to get lyrics")
}
