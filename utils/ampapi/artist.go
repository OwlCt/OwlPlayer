package ampapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

// GetArtistResp fetches artist details including albums and top songs
func GetArtistResp(storefront string, id string, language string, token string) (*ArtistResp, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	req, err := http.NewRequest("GET", fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/artists/%s", storefront, id), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	query := url.Values{}
	// Use views=full-albums,singles,featured-albums instead of include=albums
	// full-albums returns only one version per album (usually standard edition)
	// featured-albums returns "Essential Albums" shown on Apple Music web
	query.Set("views", "top-songs,full-albums,singles,featured-albums,live-albums,compilation-albums,appears-on-albums,playlists")
	query.Set("include[songs]", "artists,albums")
	// Include editorialVideo and editorialArtwork in fields to get motion video and landscape artwork
	// Note: fields[artists] limits returned fields, so we must include extended fields here
	query.Set("fields[artists]", "name,artwork,genreNames,url,editorialVideo,editorialArtwork")
	// Extend is still needed to request these fields from the API
	query.Set("extend", "editorialVideo,editorialArtwork")
	query.Set("l", language)
	req.URL.RawQuery = query.Encode()

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, errors.New(do.Status)
	}

	obj := new(ArtistResp)
	err = json.NewDecoder(do.Body).Decode(&obj)
	if err != nil {
		return nil, err
	}

	// Fetch all full albums if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.FullAlbums.Next != "" {
		next := obj.Data[0].Views.FullAlbums.Next
		for next != "" {
			moreAlbums, nextPage, err := fetchMoreAlbums(next, token)
			if err != nil {
				break // Stop on error but return what we have
			}
			obj.Data[0].Views.FullAlbums.Data = append(obj.Data[0].Views.FullAlbums.Data, moreAlbums...)
			next = nextPage
		}
	}

	// Fetch all singles if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.Singles.Next != "" {
		next := obj.Data[0].Views.Singles.Next
		for next != "" {
			moreAlbums, nextPage, err := fetchMoreAlbums(next, token)
			if err != nil {
				break // Stop on error but return what we have
			}
			obj.Data[0].Views.Singles.Data = append(obj.Data[0].Views.Singles.Data, moreAlbums...)
			next = nextPage
		}
	}

	// Fetch all top songs if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.TopSongs.Next != "" {
		next := obj.Data[0].Views.TopSongs.Next
		for next != "" {
			moreSongs, nextPage, err := fetchMoreTopSongs(next, token)
			if err != nil {
				break // Stop on error but return what we have
			}
			obj.Data[0].Views.TopSongs.Data = append(obj.Data[0].Views.TopSongs.Data, moreSongs...)
			next = nextPage
		}
	}

	// Fetch all featured albums (Essential Albums) if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.FeaturedAlbums.Next != "" {
		next := obj.Data[0].Views.FeaturedAlbums.Next
		for next != "" {
			moreAlbums, nextPage, err := fetchMoreAlbums(next, token)
			if err != nil {
				break // Stop on error but return what we have
			}
			obj.Data[0].Views.FeaturedAlbums.Data = append(obj.Data[0].Views.FeaturedAlbums.Data, moreAlbums...)
			next = nextPage
		}
	}

	// Fetch all live albums if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.LiveAlbums.Next != "" {
		next := obj.Data[0].Views.LiveAlbums.Next
		for next != "" {
			moreAlbums, nextPage, err := fetchMoreAlbums(next, token)
			if err != nil {
				break
			}
			obj.Data[0].Views.LiveAlbums.Data = append(obj.Data[0].Views.LiveAlbums.Data, moreAlbums...)
			next = nextPage
		}
	}

	// Fetch all compilation albums if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.CompilationAlbums.Next != "" {
		next := obj.Data[0].Views.CompilationAlbums.Next
		for next != "" {
			moreAlbums, nextPage, err := fetchMoreAlbums(next, token)
			if err != nil {
				break
			}
			obj.Data[0].Views.CompilationAlbums.Data = append(obj.Data[0].Views.CompilationAlbums.Data, moreAlbums...)
			next = nextPage
		}
	}

	// Fetch all appears-on albums if there are more pages
	if len(obj.Data) > 0 && obj.Data[0].Views.AppearsOnAlbums.Next != "" {
		next := obj.Data[0].Views.AppearsOnAlbums.Next
		for next != "" {
			moreAlbums, nextPage, err := fetchMoreAlbums(next, token)
			if err != nil {
				break
			}
			obj.Data[0].Views.AppearsOnAlbums.Data = append(obj.Data[0].Views.AppearsOnAlbums.Data, moreAlbums...)
			next = nextPage
		}
	}

	return obj, nil
}

// fetchMoreAlbums fetches additional albums from a pagination URL
func fetchMoreAlbums(nextURL string, token string) ([]AlbumRespData, string, error) {
	req, err := http.NewRequest("GET", fmt.Sprintf("https://amp-api.music.apple.com%s", nextURL), nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, "", errors.New(do.Status)
	}

	var resp struct {
		Data []AlbumRespData `json:"data"`
		Next string          `json:"next"`
	}
	err = json.NewDecoder(do.Body).Decode(&resp)
	if err != nil {
		return nil, "", err
	}

	return resp.Data, resp.Next, nil
}

// fetchMoreTopSongs fetches additional top songs from a pagination URL
func fetchMoreTopSongs(nextURL string, token string) ([]SongRespData, string, error) {
	// Parse the URL to add include[songs] parameter for albums relationship
	fullURL := fmt.Sprintf("https://amp-api.music.apple.com%s", nextURL)
	parsedURL, err := url.Parse(fullURL)
	if err != nil {
		return nil, "", err
	}
	query := parsedURL.Query()
	query.Set("include[songs]", "artists,albums")
	parsedURL.RawQuery = query.Encode()

	req, err := http.NewRequest("GET", parsedURL.String(), nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, "", errors.New(do.Status)
	}

	var resp struct {
		Data []SongRespData `json:"data"`
		Next string         `json:"next"`
	}
	err = json.NewDecoder(do.Body).Decode(&resp)
	if err != nil {
		return nil, "", err
	}

	return resp.Data, resp.Next, nil
}

// EditorialVideoAsset represents a video asset from editorialVideo
type EditorialVideoAsset struct {
	Video        string `json:"video"` // HLS stream URL (.m3u8)
	PreviewFrame struct {
		URL string `json:"url"`
	} `json:"previewFrame"`
}

// ArtworkAsset represents an artwork asset with dimensions and colors
type ArtworkAsset struct {
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	URL        string `json:"url"`
	BgColor    string `json:"bgColor"`
	TextColor1 string `json:"textColor1"`
}

// ArtistResp represents the response from the artist API
type ArtistResp struct {
	Data []ArtistRespData `json:"data"`
}

// ArtistRespData represents a single artist in the response
type ArtistRespData struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Href       string `json:"href"`
	Attributes struct {
		Name       string   `json:"name"`
		GenreNames []string `json:"genreNames"`
		URL        string   `json:"url"`
		Artwork    struct {
			Width      int    `json:"width"`
			Height     int    `json:"height"`
			URL        string `json:"url"`
			BgColor    string `json:"bgColor"`
			TextColor1 string `json:"textColor1"`
		} `json:"artwork"`
		EditorialVideo struct {
			MotionArtistWide16x9  *EditorialVideoAsset `json:"motionArtistWide16x9"`
			MotionArtistSquare1x1 *EditorialVideoAsset `json:"motionArtistSquare1x1"`
		} `json:"editorialVideo"`
		EditorialArtwork struct {
			CenteredFullscreenBackground *ArtworkAsset `json:"centeredFullscreenBackground"`
		} `json:"editorialArtwork"`
	} `json:"attributes"`
	Relationships struct {
		Albums struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"albums"`
	} `json:"relationships"`
	Views struct {
		TopSongs struct {
			Href string         `json:"href"`
			Next string         `json:"next"`
			Data []SongRespData `json:"data"`
		} `json:"top-songs"`
		FullAlbums struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"full-albums"`
		Singles struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"singles"`
		FeaturedAlbums struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"featured-albums"`
		LiveAlbums struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"live-albums"`
		CompilationAlbums struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"compilation-albums"`
		AppearsOnAlbums struct {
			Href string          `json:"href"`
			Next string          `json:"next"`
			Data []AlbumRespData `json:"data"`
		} `json:"appears-on-albums"`
		Playlists struct {
			Href string               `json:"href"`
			Next string               `json:"next"`
			Data []PlaylistSearchData `json:"data"`
		} `json:"playlists"`
	} `json:"views"`
}


// SimilarArtist represents a similar artist from the API
type SimilarArtist struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Href       string `json:"href"`
	Attributes struct {
		Name       string   `json:"name"`
		GenreNames []string `json:"genreNames"`
		URL        string   `json:"url"`
		Artwork    struct {
			Width  int    `json:"width"`
			Height int    `json:"height"`
			URL    string `json:"url"`
		} `json:"artwork"`
	} `json:"attributes"`
}

// SimilarArtistsResp represents the response from /view/similar-artists endpoint
type SimilarArtistsResp struct {
	Data []SimilarArtist `json:"data"`
	Next string          `json:"next"`
}

// GetSimilarArtists fetches similar artists for a given artist ID using the /view/similar-artists endpoint
// Supports pagination to fetch all similar artists
func GetSimilarArtists(storefront string, artistID string, language string, token string) (*SimilarArtistsResp, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	apiURL := fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/artists/%s/view/similar-artists", storefront, artistID)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	query := url.Values{}
	query.Set("l", language)
	req.URL.RawQuery = query.Encode()

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, errors.New(do.Status)
	}

	obj := new(SimilarArtistsResp)
	err = json.NewDecoder(do.Body).Decode(&obj)
	if err != nil {
		return nil, err
	}

	return obj, nil
}

// GetSimilarArtistsAll fetches all similar artists with pagination
func GetSimilarArtistsAll(storefront string, artistID string, language string, token string) (*SimilarArtistsResp, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	// Get first page
	result, err := GetSimilarArtists(storefront, artistID, language, token)
	if err != nil {
		return nil, err
	}

	// Fetch all pages
	for result.Next != "" {
		moreArtists, nextPage, err := fetchMoreSimilarArtists(result.Next, token)
		if err != nil {
			break // Stop on error but return what we have
		}
		result.Data = append(result.Data, moreArtists...)
		result.Next = nextPage
	}

	return result, nil
}

// fetchMoreSimilarArtists fetches additional similar artists from a pagination URL
func fetchMoreSimilarArtists(nextURL string, token string) ([]SimilarArtist, string, error) {
	req, err := http.NewRequest("GET", fmt.Sprintf("https://amp-api.music.apple.com%s", nextURL), nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	do, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer do.Body.Close()

	if do.StatusCode != http.StatusOK {
		return nil, "", errors.New(do.Status)
	}

	var resp SimilarArtistsResp
	err = json.NewDecoder(do.Body).Decode(&resp)
	if err != nil {
		return nil, "", err
	}

	return resp.Data, resp.Next, nil
}

// GetArtistTopSongs fetches top songs for a given artist ID using the /view/top-songs endpoint
func GetArtistTopSongs(storefront string, artistID string, language string, token string, limit int) ([]SongRespData, error) {
	var err error
	if token == "" {
		token, err = GetToken()
		if err != nil {
			return nil, err
		}
	}

	apiURL := fmt.Sprintf("https://amp-api.music.apple.com/v1/catalog/%s/artists/%s/view/top-songs", storefront, artistID)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
	req.Header.Set("Origin", "https://music.apple.com")

	query := url.Values{}
	query.Set("l", language)
	query.Set("include[songs]", "artists,albums")
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
		return nil, errors.New(do.Status)
	}

	var resp struct {
		Data []SongRespData `json:"data"`
		Next string         `json:"next"`
	}
	err = json.NewDecoder(do.Body).Decode(&resp)
	if err != nil {
		return nil, err
	}

	return resp.Data, nil
}
