package services

import (
	"context"
	"testing"
	"time"

	"main/models"
)

func TestLocalLyricsServiceReturnsUnavailableAndSchedulesEnhancementWhenMappingMissing(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	service := NewLocalLyricsService(repo, nil, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			LyricsEnhancement:   true,
			MatchThreshold:      0.75,
		},
	}, "us", "en", "token", "user-token")
	service.cache = nil

	triggered := make(chan int64, 1)
	service.scheduleEnhancement = func(mediaID int64) {
		triggered <- mediaID
	}
	service.fetchLyrics = func(_, _, _, _, _ string) (string, string, error) {
		t.Fatalf("fetchLyrics should not be called when mapping is missing")
		return "", "", nil
	}

	result, err := service.GetLyrics(context.Background(), "42")
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if result.Available {
		t.Fatalf("expected unavailable lyrics response, got %#v", result)
	}

	select {
	case mediaID := <-triggered:
		if mediaID != 42 {
			t.Fatalf("expected enhancement trigger for media 42, got %d", mediaID)
		}
	case <-time.After(time.Second):
		t.Fatalf("expected enhancement trigger")
	}
}

func TestLocalLyricsServiceReturnsFetchedLyricsAndUpdatesMapping(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	_, err := repo.SaveLyricsMapping(context.Background(), &models.LyricsMapping{
		MediaID:          7,
		AppleMusicSongID: "apple-song-7",
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  0.92,
		Status:           models.LyricsMappingStatusMatched,
	})
	if err != nil {
		t.Fatalf("SaveLyricsMapping() error = %v", err)
	}

	service := NewLocalLyricsService(repo, nil, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			LyricsEnhancement:   true,
			MatchThreshold:      0.75,
		},
	}, "us", "en", "token", "user-token")
	service.cache = nil
	service.fetchLyrics = func(storefront, songID, language, token, userToken string) (string, string, error) {
		if storefront != "us" || songID != "apple-song-7" || language != "en" {
			t.Fatalf("unexpected fetchLyrics arguments: storefront=%q songID=%q language=%q", storefront, songID, language)
		}
		return "<tt></tt>", "lyrics", nil
	}

	result, err := service.GetLyrics(context.Background(), "7")
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if !result.Available || result.TTML != "<tt></tt>" || result.Type != "lyrics" {
		t.Fatalf("unexpected lyrics response: %#v", result)
	}

	mapping, err := repo.GetLyricsMappingByMediaID(context.Background(), 7)
	if err != nil {
		t.Fatalf("GetLyricsMappingByMediaID() error = %v", err)
	}
	if mapping == nil || mapping.Status != models.LyricsMappingStatusAvailable {
		t.Fatalf("expected available lyrics mapping, got %#v", mapping)
	}
	if mapping.LastRequestedAt == nil || mapping.LastSyncedAt == nil {
		t.Fatalf("expected lyrics mapping timestamps to be updated, got %#v", mapping)
	}
}

func TestLocalLyricsServiceMarksMappingErrorWhenFetchFails(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	_, err := repo.SaveLyricsMapping(context.Background(), &models.LyricsMapping{
		MediaID:          9,
		AppleMusicSongID: "apple-song-9",
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  0.87,
		Status:           models.LyricsMappingStatusMatched,
	})
	if err != nil {
		t.Fatalf("SaveLyricsMapping() error = %v", err)
	}

	service := NewLocalLyricsService(repo, nil, LocalMediaConfig{
		AppleMusic: LocalMediaAppleMusicConfig{
			MetadataEnhancement: true,
			LyricsEnhancement:   true,
			MatchThreshold:      0.75,
		},
	}, "us", "en", "token", "user-token")
	service.cache = nil
	service.fetchLyrics = func(_, _, _, _, _ string) (string, string, error) {
		return "", "", context.DeadlineExceeded
	}

	result, err := service.GetLyrics(context.Background(), "9")
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if result.Available {
		t.Fatalf("expected unavailable lyrics response on fetch failure, got %#v", result)
	}

	mapping, err := repo.GetLyricsMappingByMediaID(context.Background(), 9)
	if err != nil {
		t.Fatalf("GetLyricsMappingByMediaID() error = %v", err)
	}
	if mapping == nil || mapping.Status != models.LyricsMappingStatusError {
		t.Fatalf("expected error lyrics mapping, got %#v", mapping)
	}
	if mapping.ErrorMessage == "" {
		t.Fatalf("expected lyrics mapping error message to be stored")
	}
}
