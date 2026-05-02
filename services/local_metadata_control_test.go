package services

import (
	"testing"
	"time"

	"github.com/OwlCt/OwlPlayer/models"
)

func TestResolveArtistPresentationPrefersManualOverride(t *testing.T) {
	local := metadataArtistValues{
		Name:       "Local Artist",
		ArtworkURL: "/local.jpg",
		Genres:     []string{"Local"},
	}
	remote := &metadataArtistValues{
		Name:           "Remote Artist",
		ArtworkURL:     "https://remote/artist.jpg",
		Genres:         []string{"Pop"},
		MotionVideoURL: "https://remote/video.m3u8",
	}
	control := &models.LocalEntityMetadataControl{
		OverrideMode: models.MetadataOverrideModeManualOverride,
		ManualData: map[string]any{
			"name":       "Manual Artist",
			"artworkUrl": "https://manual/artist.jpg",
			"genres":     []any{"Manual", "Alt"},
		},
	}

	resolved, state := resolveArtistPresentation(local, remote, true, control)

	if resolved.Name != "Manual Artist" {
		t.Fatalf("expected manual name to win, got %q", resolved.Name)
	}
	if resolved.ArtworkURL != "https://manual/artist.jpg" {
		t.Fatalf("expected manual artwork to win, got %q", resolved.ArtworkURL)
	}
	if len(resolved.Genres) != 2 || resolved.Genres[0] != "Manual" {
		t.Fatalf("expected manual genres to win, got %#v", resolved.Genres)
	}
	if !state.UsesManualOverride {
		t.Fatalf("expected manual override state")
	}
	if state.UsesAppleMusic {
		t.Fatalf("expected Apple Music state to remain false when override is manual")
	}
}

func TestResolveAlbumPresentationFallsBackToLocalWhenAdminDisablesEnhancement(t *testing.T) {
	local := metadataAlbumValues{
		Name:        "Local Album",
		ArtworkURL:  "/local-album.jpg",
		ReleaseDate: "2020-01-02",
		ArtistName:  "Local Artist",
	}
	remote := &metadataAlbumValues{
		Name:        "Remote Album",
		ArtworkURL:  "https://remote/album.jpg",
		ReleaseDate: "2024-08-09",
		ArtistName:  "Remote Artist",
	}
	resolved, state := resolveAlbumPresentation(local, remote, false, nil)

	if resolved != local {
		t.Fatalf("expected local album metadata when admin enhancement is disabled, got %#v", resolved)
	}
	if state.UsesAppleMusic {
		t.Fatalf("expected Apple Music state to remain false")
	}
	if state.DisplaySource != "local" {
		t.Fatalf("expected local display source, got %q", state.DisplaySource)
	}
}

func TestResolveAlbumPresentationPreferAppleStillAllowsManualFields(t *testing.T) {
	local := metadataAlbumValues{Name: "Local Album", ArtistName: "Local Artist"}
	remote := &metadataAlbumValues{
		Name:        "Remote Album",
		ArtworkURL:  "https://remote/album.jpg",
		ReleaseDate: "2024-08-09",
		ArtistName:  "Remote Artist",
	}
	control := &models.LocalEntityMetadataControl{
		OverrideMode: models.MetadataOverrideModePreferApple,
		ManualData: map[string]any{
			"artistName": "Manual Artist",
		},
	}

	resolved, state := resolveAlbumPresentation(local, remote, false, control)

	if resolved.Name != "Remote Album" {
		t.Fatalf("expected prefer_am to use remote album name, got %q", resolved.Name)
	}
	if resolved.ArtistName != "Manual Artist" {
		t.Fatalf("expected manual artist name to override remote value, got %q", resolved.ArtistName)
	}
	if !state.UsesAppleMusic || !state.UsesManualOverride {
		t.Fatalf("expected mixed state with manual override, got %#v", state)
	}
}

func TestBuildFeaturedSongsSortsHistoryAndFallsBackToLibrary(t *testing.T) {
	now := time.Now()
	librarySongs := []models.SongItem{
		{ID: "song-1", Name: "Song 1", AvailabilityStatus: string(models.AvailabilityStatusAvailable)},
		{ID: "song-2", Name: "Song 2", AvailabilityStatus: string(models.AvailabilityStatusStale)},
		{ID: "song-3", Name: "Song 3", AvailabilityStatus: string(models.AvailabilityStatusAvailable)},
	}
	stats := []artistSongPlayStat{
		{SongID: "song-2", PlayCount: 10, LastPlayedAt: now.Add(-2 * time.Hour)},
		{SongID: "song-1", PlayCount: 10, LastPlayedAt: now.Add(-1 * time.Hour)},
		{SongID: "song-3", PlayCount: 3, LastPlayedAt: now.Add(-30 * time.Minute)},
	}

	featured, source := buildFeaturedSongs(librarySongs, stats, 2)
	if source != "history" {
		t.Fatalf("expected history source, got %q", source)
	}
	if len(featured) != 2 {
		t.Fatalf("expected 2 featured songs, got %d", len(featured))
	}
	if featured[0].ID != "song-1" || featured[1].ID != "song-2" {
		t.Fatalf("expected play count then recency order, got %#v", featured)
	}

	fallback, fallbackSource := buildFeaturedSongs(librarySongs, nil, 2)
	if fallbackSource != "library_fallback" {
		t.Fatalf("expected library fallback source, got %q", fallbackSource)
	}
	if len(fallback) != 2 || fallback[0].ID != "song-1" || fallback[1].ID != "song-2" {
		t.Fatalf("expected library fallback order, got %#v", fallback)
	}
}
