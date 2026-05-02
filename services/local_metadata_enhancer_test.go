package services

import (
	"context"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/utils/ampapi"
)

func TestLocalMetadataEnhancerApplyRemoteMatchPreservesLocalCoreFields(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Local Artist",
		NormalizedName:     normalizeText("Local Artist"),
		ArtworkPath:        "cover/artist-local.jpg",
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}
	album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Local Album",
		NormalizedTitle:    normalizeText("Local Album"),
		PrimaryArtistID:    artist.ID,
		ArtworkPath:        "cover/album-local.jpg",
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	media, err := repo.SaveMedia(ctx, &models.LocalMedia{
		Title:              "Local Title",
		NormalizedTitle:    normalizeText("Local Title"),
		AlbumID:            album.ID,
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveMedia() error = %v", err)
	}

	match := &localRemoteMatchCandidate{Score: 0.93, Song: ampapi.SongRespData{ID: "remote-song-123"}}
	match.Song.Attributes.Name = "Remote Title"
	match.Song.Attributes.ArtistName = "Remote Artist"
	match.Song.Attributes.AlbumName = "Remote Album"
	match.Song.Attributes.GenreNames = []string{"Ambient", "Electronic"}
	match.Song.Attributes.HasLyrics = true
	match.Song.Attributes.ReleaseDate = "2024-05-01"
	match.Song.Attributes.ContentRating = "explicit"
	match.Song.Attributes.DurationInMillis = 180000
	match.Song.Attributes.TrackNumber = 1
	match.Song.Relationships.Albums.Data = append(match.Song.Relationships.Albums.Data, struct {
		ID         string `json:"id"`
		Type       string `json:"type"`
		Href       string `json:"href"`
		Attributes struct {
			ArtistName string `json:"artistName"`
			Artwork    struct {
				Width      int    `json:"width"`
				Height     int    `json:"height"`
				URL        string `json:"url"`
				BgColor    string `json:"bgColor"`
				TextColor1 string `json:"textColor1"`
				TextColor2 string `json:"textColor2"`
				TextColor3 string `json:"textColor3"`
				TextColor4 string `json:"textColor4"`
			} `json:"artwork"`
			GenreNames          []string `json:"genreNames"`
			IsCompilation       bool     `json:"isCompilation"`
			IsComplete          bool     `json:"isComplete"`
			IsMasteredForItunes bool     `json:"isMasteredForItunes"`
			IsPrerelease        bool     `json:"isPrerelease"`
			IsSingle            bool     `json:"isSingle"`
			Name                string   `json:"name"`
			PlayParams          struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
			} `json:"playParams"`
			ReleaseDate string `json:"releaseDate"`
			TrackCount  int    `json:"trackCount"`
			Upc         string `json:"upc"`
			URL         string `json:"url"`
			RecordLabel string `json:"recordLabel"`
			Copyright   string `json:"copyright"`
		} `json:"attributes"`
	}{
		ID: "remote-album-123",
		Attributes: struct {
			ArtistName string `json:"artistName"`
			Artwork    struct {
				Width      int    `json:"width"`
				Height     int    `json:"height"`
				URL        string `json:"url"`
				BgColor    string `json:"bgColor"`
				TextColor1 string `json:"textColor1"`
				TextColor2 string `json:"textColor2"`
				TextColor3 string `json:"textColor3"`
				TextColor4 string `json:"textColor4"`
			} `json:"artwork"`
			GenreNames          []string `json:"genreNames"`
			IsCompilation       bool     `json:"isCompilation"`
			IsComplete          bool     `json:"isComplete"`
			IsMasteredForItunes bool     `json:"isMasteredForItunes"`
			IsPrerelease        bool     `json:"isPrerelease"`
			IsSingle            bool     `json:"isSingle"`
			Name                string   `json:"name"`
			PlayParams          struct {
				ID   string `json:"id"`
				Kind string `json:"kind"`
			} `json:"playParams"`
			ReleaseDate string `json:"releaseDate"`
			TrackCount  int    `json:"trackCount"`
			Upc         string `json:"upc"`
			URL         string `json:"url"`
			RecordLabel string `json:"recordLabel"`
			Copyright   string `json:"copyright"`
		}{
			Name: "Remote Album",
			Artwork: struct {
				Width      int    `json:"width"`
				Height     int    `json:"height"`
				URL        string `json:"url"`
				BgColor    string `json:"bgColor"`
				TextColor1 string `json:"textColor1"`
				TextColor2 string `json:"textColor2"`
				TextColor3 string `json:"textColor3"`
				TextColor4 string `json:"textColor4"`
			}{
				URL: "https://example.com/album-art.jpg",
			},
		},
	})
	match.Song.Relationships.Artists.Data = append(match.Song.Relationships.Artists.Data, struct {
		ID         string `json:"id"`
		Type       string `json:"type"`
		Href       string `json:"href"`
		Attributes struct {
			Name    string `json:"name"`
			Artwork struct {
				URL string `json:"url"`
			} `json:"artwork"`
		} `json:"attributes"`
	}{
		ID: "remote-artist-123",
		Attributes: struct {
			Name    string `json:"name"`
			Artwork struct {
				URL string `json:"url"`
			} `json:"artwork"`
		}{
			Name: "Remote Artist",
			Artwork: struct {
				URL string `json:"url"`
			}{
				URL: "https://example.com/artist-art.jpg",
			},
		},
	})

	enhancer := NewLocalMetadataEnhancer(repo, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			MatchThreshold:      0.75,
		},
	}, "us", "en", "token", "user-token")

	if err := enhancer.applyRemoteMatch(ctx, media, album, artist, match); err != nil {
		t.Fatalf("applyRemoteMatch() error = %v", err)
	}

	savedMedia, err := repo.GetMediaByID(ctx, media.ID)
	if err != nil {
		t.Fatalf("GetMediaByID() error = %v", err)
	}
	if savedMedia.Title != "Local Title" {
		t.Fatalf("expected local title to be preserved, got %q", savedMedia.Title)
	}
	if savedMedia.AppleMusicSongID != "remote-song-123" {
		t.Fatalf("expected apple music id to be attached, got %q", savedMedia.AppleMusicSongID)
	}
	if len(savedMedia.Genres) != 2 || savedMedia.Genres[0] != "Ambient" {
		t.Fatalf("expected remote genres to fill missing genres, got %#v", savedMedia.Genres)
	}
	if savedMedia.ContentRating != "explicit" {
		t.Fatalf("expected content rating to be filled from remote match, got %q", savedMedia.ContentRating)
	}
	if !savedMedia.LyricsAvailable {
		t.Fatalf("expected lyrics availability to be enabled")
	}

	savedAlbum, err := repo.GetAlbumByID(ctx, album.ID)
	if err != nil {
		t.Fatalf("GetAlbumByID() error = %v", err)
	}
	if savedAlbum.Title != "Local Album" {
		t.Fatalf("expected local album title to be preserved, got %q", savedAlbum.Title)
	}
	if savedAlbum.ArtworkPath != "cover/album-local.jpg" {
		t.Fatalf("expected local album artwork path to remain, got %q", savedAlbum.ArtworkPath)
	}
	if savedAlbum.ArtworkURL != "" {
		t.Fatalf("expected remote album artwork not to override existing local artwork, got %q", savedAlbum.ArtworkURL)
	}

	savedArtist, err := repo.GetArtistByID(ctx, artist.ID)
	if err != nil {
		t.Fatalf("GetArtistByID() error = %v", err)
	}
	if savedArtist.Name != "Local Artist" {
		t.Fatalf("expected local artist name to be preserved, got %q", savedArtist.Name)
	}
	if savedArtist.ArtworkPath != "cover/artist-local.jpg" {
		t.Fatalf("expected local artist artwork path to remain, got %q", savedArtist.ArtworkPath)
	}
	if savedArtist.ArtworkURL != "" {
		t.Fatalf("expected remote artist artwork not to override existing local artwork, got %q", savedArtist.ArtworkURL)
	}

	if field := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeMedia, media.ID, "remote_title")]; field == nil || field.Source != models.MetadataSourceRemote {
		t.Fatalf("expected remote supplemental title field to be recorded, got %#v", field)
	}
	if field := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeAlbum, album.ID, "remote_title")]; field == nil || field.Source != models.MetadataSourceRemote {
		t.Fatalf("expected remote supplemental album title field to be recorded, got %#v", field)
	}
	if field := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeArtist, artist.ID, "remote_name")]; field == nil || field.Source != models.MetadataSourceRemote {
		t.Fatalf("expected remote supplemental artist name field to be recorded, got %#v", field)
	}

	mapping, err := repo.GetLyricsMappingByMediaID(ctx, media.ID)
	if err != nil {
		t.Fatalf("GetLyricsMappingByMediaID() error = %v", err)
	}
	if mapping == nil || mapping.Status != models.LyricsMappingStatusMatched {
		t.Fatalf("expected matched lyrics mapping, got %#v", mapping)
	}
	if mapping.AppleMusicSongID != "remote-song-123" {
		t.Fatalf("expected lyrics mapping to reference remote song id, got %q", mapping.AppleMusicSongID)
	}
}

func TestLocalMetadataEnhancerApplyRemoteMatchPrefetchesLyricsToCacheWhenEnabled(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Local Artist",
		NormalizedName:     normalizeText("Local Artist"),
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}
	album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Local Album",
		NormalizedTitle:    normalizeText("Local Album"),
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	media, err := repo.SaveMedia(ctx, &models.LocalMedia{
		Title:              "Local Title",
		NormalizedTitle:    normalizeText("Local Title"),
		AlbumID:            album.ID,
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveMedia() error = %v", err)
	}

	cache, err := NewMetadataCache(CacheConfig{Dir: t.TempDir(), MaxMemoryItems: 16})
	if err != nil {
		t.Fatalf("NewMetadataCache() error = %v", err)
	}

	enhancer := NewLocalMetadataEnhancer(repo, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			LyricsEnhancement:   true,
			MatchThreshold:      0.75,
		},
	}, "us", "zh-CN", "token", "user-token")
	enhancer.cache = cache

	const rawTTML = `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><head><metadata><iTunesMetadata><translations><translation xml:lang="zh-Hans"><text for="L1">翻译行</text></translation></translations></iTunesMetadata></metadata></head><body><div><p begin="0.000" end="5.000" itunes:key="L1"><span begin="0.000" end="1.000">hello</span></p></div></body></tt>`
	enhancer.fetchLyrics = func(storefront, songID, language, token, userToken string) (string, string, error) {
		if storefront != "us" || songID != "remote-song-lyrics" || language != "zh-CN" {
			t.Fatalf("unexpected fetchLyrics arguments: storefront=%q songID=%q language=%q", storefront, songID, language)
		}
		return rawTTML, "syllable-lyrics", nil
	}

	match := &localRemoteMatchCandidate{Score: 0.96, Song: ampapi.SongRespData{ID: "remote-song-lyrics"}}
	match.Song.Attributes.Name = "Remote Title"
	match.Song.Attributes.ArtistName = "Remote Artist"
	match.Song.Attributes.AlbumName = "Remote Album"
	match.Song.Attributes.HasLyrics = true

	if err := enhancer.applyRemoteMatch(ctx, media, album, artist, match); err != nil {
		t.Fatalf("applyRemoteMatch() error = %v", err)
	}

	mapping, err := repo.GetLyricsMappingByMediaID(ctx, media.ID)
	if err != nil {
		t.Fatalf("GetLyricsMappingByMediaID() error = %v", err)
	}
	if mapping == nil || mapping.Status != models.LyricsMappingStatusAvailable {
		t.Fatalf("expected available lyrics mapping after prefetch, got %#v", mapping)
	}

	var cached models.LyricsResponse
	if !cache.Get("lyrics", "local:"+strconv.FormatInt(media.ID, 10), &cached) {
		t.Fatalf("expected lyrics cache entry for local media")
	}
	if !cached.Available || cached.Type != "syllable-lyrics" {
		t.Fatalf("unexpected cached lyrics metadata: %#v", cached)
	}
	if cached.TTML != rawTTML {
		t.Fatalf("expected raw TTML to be cached unchanged, got %q", cached.TTML)
	}
}

func TestLocalMetadataEnhancerApplyRemoteMatchMarksLyricsErrorWhenPrefetchFails(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Local Artist",
		NormalizedName:     normalizeText("Local Artist"),
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}
	album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Local Album",
		NormalizedTitle:    normalizeText("Local Album"),
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	media, err := repo.SaveMedia(ctx, &models.LocalMedia{
		Title:              "Local Title",
		NormalizedTitle:    normalizeText("Local Title"),
		AlbumID:            album.ID,
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveMedia() error = %v", err)
	}

	enhancer := NewLocalMetadataEnhancer(repo, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			LyricsEnhancement:   true,
			MatchThreshold:      0.75,
		},
	}, "us", "en", "token", "user-token")
	enhancer.cache = nil
	enhancer.fetchLyrics = func(_, _, _, _, _ string) (string, string, error) {
		return "", "", context.DeadlineExceeded
	}

	match := &localRemoteMatchCandidate{Score: 0.91, Song: ampapi.SongRespData{ID: "remote-song-error"}}
	match.Song.Attributes.Name = "Remote Title"
	match.Song.Attributes.ArtistName = "Remote Artist"
	match.Song.Attributes.AlbumName = "Remote Album"
	match.Song.Attributes.HasLyrics = true

	if err := enhancer.applyRemoteMatch(ctx, media, album, artist, match); err == nil {
		t.Fatalf("expected applyRemoteMatch() to report lyric prefetch failure")
	}

	mapping, err := repo.GetLyricsMappingByMediaID(ctx, media.ID)
	if err != nil {
		t.Fatalf("GetLyricsMappingByMediaID() error = %v", err)
	}
	if mapping == nil || mapping.Status != models.LyricsMappingStatusError {
		t.Fatalf("expected lyrics mapping error after prefetch failure, got %#v", mapping)
	}
	if mapping.ErrorMessage == "" {
		t.Fatalf("expected lyrics mapping error message to be recorded")
	}
}

func TestLocalMetadataEnhancerSearchMatchCandidatesRetriesRateLimit(t *testing.T) {
	enhancer := NewLocalMetadataEnhancer(nil, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
		},
	}, "us", "en", "token", "user-token")
	enhancer.searchInterval = 0
	enhancer.maxSearchRetry = 3

	attempts := 0
	sleeps := make([]time.Duration, 0, 2)
	enhancer.searchFn = func(storefront, term, types, language, token string, limit, offset int) (*ampapi.SearchResp, error) {
		attempts++
		if attempts < 3 {
			return nil, &ampapi.APIStatusError{
				StatusCode: http.StatusTooManyRequests,
				Status:     "429 Too Many Requests",
				RetryAfter: 25 * time.Millisecond,
			}
		}
		return &ampapi.SearchResp{}, nil
	}
	enhancer.sleepFn = func(ctx context.Context, delay time.Duration) error {
		sleeps = append(sleeps, delay)
		return nil
	}

	if _, err := enhancer.searchMatchCandidates(context.Background(), "G.E.M."); err != nil {
		t.Fatalf("searchMatchCandidates() error = %v", err)
	}
	if attempts != 3 {
		t.Fatalf("expected 3 attempts, got %d", attempts)
	}
	if len(sleeps) != 2 {
		t.Fatalf("expected 2 retry sleeps, got %d", len(sleeps))
	}
	if sleeps[0] != 25*time.Millisecond || sleeps[1] != 25*time.Millisecond {
		t.Fatalf("expected retry-after based sleeps, got %#v", sleeps)
	}
}

func TestLocalMetadataEnhancerApplyRemoteMatchPersistsReleaseTypeClassification(t *testing.T) {
	tests := []struct {
		name        string
		albumName   string
		trackCount  int
		isSingle    bool
		expected    models.ReleaseType
		expectedAPI bool
	}{
		{
			name:        "single from single suffix",
			albumName:   "Glow - Single",
			trackCount:  3,
			isSingle:    true,
			expected:    models.ReleaseTypeSingle,
			expectedAPI: true,
		},
		{
			name:        "ep from short release",
			albumName:   "Glow",
			trackCount:  4,
			isSingle:    true,
			expected:    models.ReleaseTypeEP,
			expectedAPI: true,
		},
		{
			name:        "album fallback when album relationship missing",
			albumName:   "",
			trackCount:  0,
			isSingle:    false,
			expected:    models.ReleaseTypeAlbum,
			expectedAPI: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := newInMemoryLocalLibraryRepo()
			ctx := context.Background()

			artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
				Name:               "Local Artist",
				NormalizedName:     normalizeText("Local Artist"),
				AvailabilityStatus: models.AvailabilityStatusAvailable,
			})
			if err != nil {
				t.Fatalf("SaveArtist() error = %v", err)
			}
			album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
				Title:              "Local Album",
				NormalizedTitle:    normalizeText("Local Album"),
				PrimaryArtistID:    artist.ID,
				AvailabilityStatus: models.AvailabilityStatusAvailable,
			})
			if err != nil {
				t.Fatalf("SaveAlbum() error = %v", err)
			}
			media, err := repo.SaveMedia(ctx, &models.LocalMedia{
				Title:              "Local Title",
				NormalizedTitle:    normalizeText("Local Title"),
				AlbumID:            album.ID,
				PrimaryArtistID:    artist.ID,
				AvailabilityStatus: models.AvailabilityStatusAvailable,
			})
			if err != nil {
				t.Fatalf("SaveMedia() error = %v", err)
			}

			match := buildRemoteMatchCandidate("remote-song-release-type", tt.albumName, tt.trackCount, tt.isSingle, tt.expectedAPI)

			enhancer := NewLocalMetadataEnhancer(repo, LocalMediaConfig{
				AppleMusic: LocalMediaAppleMusicConfig{
					MetadataEnhancement: true,
					MatchThreshold:      0.75,
				},
			}, "us", "en", "token", "user-token")

			if err := enhancer.applyRemoteMatch(ctx, media, album, artist, match); err != nil {
				t.Fatalf("applyRemoteMatch() error = %v", err)
			}

			field := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeAlbum, album.ID, "release_type")]
			if field == nil {
				t.Fatalf("expected release_type metadata field to be persisted")
			}
			value, ok := field.Details["value"].(string)
			if !ok {
				t.Fatalf("expected release_type metadata field value, got %#v", field.Details)
			}
			if value != string(tt.expected) {
				t.Fatalf("expected release_type %q, got %q", tt.expected, value)
			}
		})
	}
}

func buildRemoteMatchCandidate(songID, albumName string, trackCount int, isSingle bool, includeAlbum bool) *localRemoteMatchCandidate {
	match := &localRemoteMatchCandidate{Score: 0.93, Song: ampapi.SongRespData{ID: songID}}
	match.Song.Attributes.Name = "Remote Title"
	match.Song.Attributes.ArtistName = "Remote Artist"
	match.Song.Attributes.AlbumName = "Remote Album"

	if includeAlbum {
		match.Song.Relationships.Albums.Data = append(match.Song.Relationships.Albums.Data, struct {
			ID         string `json:"id"`
			Type       string `json:"type"`
			Href       string `json:"href"`
			Attributes struct {
				ArtistName string `json:"artistName"`
				Artwork    struct {
					Width      int    `json:"width"`
					Height     int    `json:"height"`
					URL        string `json:"url"`
					BgColor    string `json:"bgColor"`
					TextColor1 string `json:"textColor1"`
					TextColor2 string `json:"textColor2"`
					TextColor3 string `json:"textColor3"`
					TextColor4 string `json:"textColor4"`
				} `json:"artwork"`
				GenreNames          []string `json:"genreNames"`
				IsCompilation       bool     `json:"isCompilation"`
				IsComplete          bool     `json:"isComplete"`
				IsMasteredForItunes bool     `json:"isMasteredForItunes"`
				IsPrerelease        bool     `json:"isPrerelease"`
				IsSingle            bool     `json:"isSingle"`
				Name                string   `json:"name"`
				PlayParams          struct {
					ID   string `json:"id"`
					Kind string `json:"kind"`
				} `json:"playParams"`
				ReleaseDate string `json:"releaseDate"`
				TrackCount  int    `json:"trackCount"`
				Upc         string `json:"upc"`
				URL         string `json:"url"`
				RecordLabel string `json:"recordLabel"`
				Copyright   string `json:"copyright"`
			} `json:"attributes"`
		}{
			ID: "remote-album-release-type",
			Attributes: struct {
				ArtistName string `json:"artistName"`
				Artwork    struct {
					Width      int    `json:"width"`
					Height     int    `json:"height"`
					URL        string `json:"url"`
					BgColor    string `json:"bgColor"`
					TextColor1 string `json:"textColor1"`
					TextColor2 string `json:"textColor2"`
					TextColor3 string `json:"textColor3"`
					TextColor4 string `json:"textColor4"`
				} `json:"artwork"`
				GenreNames          []string `json:"genreNames"`
				IsCompilation       bool     `json:"isCompilation"`
				IsComplete          bool     `json:"isComplete"`
				IsMasteredForItunes bool     `json:"isMasteredForItunes"`
				IsPrerelease        bool     `json:"isPrerelease"`
				IsSingle            bool     `json:"isSingle"`
				Name                string   `json:"name"`
				PlayParams          struct {
					ID   string `json:"id"`
					Kind string `json:"kind"`
				} `json:"playParams"`
				ReleaseDate string `json:"releaseDate"`
				TrackCount  int    `json:"trackCount"`
				Upc         string `json:"upc"`
				URL         string `json:"url"`
				RecordLabel string `json:"recordLabel"`
				Copyright   string `json:"copyright"`
			}{
				Name:       albumName,
				IsSingle:   isSingle,
				TrackCount: trackCount,
			},
		})
	}

	return match
}
