package services

import (
	"context"
	"encoding/json"
	"strconv"
	"testing"
	"time"

	"main/models"
)

func TestBuildLocalSuggestionContentsRespectsOrderAndLimit(t *testing.T) {
	result := &models.SearchResultWithTop{
		Order: []string{"songs", "albums", "artists"},
		Artists: []models.ArtistItem{
			{ID: "artist-1", Name: "许嵩", ArtworkURL: "/api/artwork/artist/1"},
			{ID: "artist-2", Name: "Artist 2", ArtworkURL: "/api/artwork/artist/2"},
		},
		Albums: []models.AlbumItem{
			{ID: "album-1", Name: "许嵩 No.1", ArtistName: "许嵩", ArtworkURL: "/api/artwork/album/1"},
			{ID: "album-2", Name: "Album 2", ArtistName: "Artist 2", ArtworkURL: "/api/artwork/album/2"},
		},
		Songs: []models.SongItem{
			{ID: "song-1", Name: "Play With Style", ArtistName: "许嵩", ArtworkURL: "/api/artwork/album/1"},
			{ID: "song-2", Name: "Song 2", ArtistName: "Artist 2", ArtworkURL: "/api/artwork/album/2"},
			{ID: "song-3", Name: "Song 3", ArtistName: "Artist 3", ArtworkURL: "/api/artwork/album/3"},
			{ID: "song-4", Name: "Song 4", ArtistName: "Artist 4", ArtworkURL: "/api/artwork/album/4"},
		},
	}

	contents := buildLocalSuggestionContents("许嵩", result)
	if len(contents) != 6 {
		t.Fatalf("expected 6 suggestion items, got %d", len(contents))
	}

	topExpectedTypes := []string{"artist", "album", "song"}
	for i, expectedType := range topExpectedTypes {
		if contents[i].Type != expectedType {
			t.Fatalf("expected top item %d to be %q, got %q", i, expectedType, contents[i].Type)
		}
	}

	if contents[0].Name != "许嵩" {
		t.Fatalf("expected exact artist match first, got %q", contents[0].Name)
	}
	if contents[1].Type != "album" || contents[1].Subtitle != "许嵩" {
		t.Fatalf("expected related album second, got %#v", contents[1])
	}
	if contents[2].Type != "song" || contents[2].Subtitle != "许嵩" {
		t.Fatalf("expected related song after artist and album, got %#v", contents[2])
	}
}

func TestInferAlbumReleaseDateFromTracksUsesEarliestTrackDate(t *testing.T) {
	first := time.Date(2023, 5, 20, 0, 0, 0, 0, time.UTC)
	second := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)

	releaseDate := inferAlbumReleaseDateFromTracks([]*models.LocalMedia{
		{ReleaseDate: &second},
		nil,
		{ReleaseDate: &first},
	})

	if releaseDate == nil {
		t.Fatal("expected inferred release date, got nil")
	}
	if !releaseDate.Equal(first) {
		t.Fatalf("expected earliest track date %s, got %s", first.Format("2006-01-02"), releaseDate.Format("2006-01-02"))
	}
}

func TestParseLocalAudioProbeOutputIncludesBitDepth(t *testing.T) {
	payload := map[string]any{
		"streams": []map[string]any{
			{
				"codec_name":          "alac",
				"bit_rate":            "921600",
				"bits_per_sample":     "24",
				"bits_per_raw_sample": "0",
				"sample_rate":         "48000",
				"channels":            2,
			},
		},
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	probed, err := parseLocalAudioProbeOutput(raw)
	if err != nil {
		t.Fatalf("parseLocalAudioProbeOutput returned error: %v", err)
	}
	if probed.BitDepth != 24 {
		t.Fatalf("expected bit depth 24, got %d", probed.BitDepth)
	}
	if probed.SampleRate != 48000 {
		t.Fatalf("expected sample rate 48000, got %d", probed.SampleRate)
	}
}

func TestParseLocalAudioProbeOutputAcceptsNumericFields(t *testing.T) {
	payload := map[string]any{
		"streams": []map[string]any{
			{
				"codec_name":          "alac",
				"bit_rate":            921600,
				"bits_per_sample":     24,
				"bits_per_raw_sample": 0,
				"sample_rate":         48000,
				"channels":            2,
			},
		},
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	probed, err := parseLocalAudioProbeOutput(raw)
	if err != nil {
		t.Fatalf("parseLocalAudioProbeOutput returned error: %v", err)
	}
	if probed.Bitrate != 921600 {
		t.Fatalf("expected bitrate 921600, got %d", probed.Bitrate)
	}
	if probed.BitDepth != 24 {
		t.Fatalf("expected bit depth 24, got %d", probed.BitDepth)
	}
	if probed.SampleRate != 48000 {
		t.Fatalf("expected sample rate 48000, got %d", probed.SampleRate)
	}
}

func TestParseLocalAudioProbeOutputFallsBackToCodecForBitDepth(t *testing.T) {
	payload := map[string]any{
		"streams": []map[string]any{
			{
				"codec_name":          "pcm_s24le",
				"bit_rate":            "2304000",
				"bits_per_sample":     "0",
				"bits_per_raw_sample": "0",
				"sample_rate":         "48000",
				"channels":            2,
			},
		},
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	probed, err := parseLocalAudioProbeOutput(raw)
	if err != nil {
		t.Fatalf("parseLocalAudioProbeOutput returned error: %v", err)
	}
	if probed.BitDepth != 24 {
		t.Fatalf("expected fallback bit depth 24, got %d", probed.BitDepth)
	}
}

func TestLocalAudioInfoNeedsProbeSkipsKnownLossyWithoutBitDepth(t *testing.T) {
	file := &models.LocalMediaFile{
		AbsolutePath: "track.mp3",
		Container:    "mp3",
		Codec:        "mp3",
	}

	if localAudioInfoNeedsProbe(file, file.Codec, 0, 0, 0, 0) {
		t.Fatal("expected known lossy source without bitDepth to skip extra probe")
	}
	if got := localSourceQualityClassFromFile(file); got != localSourceQualityLossy {
		t.Fatalf("source quality class = %s, want %s", got, localSourceQualityLossy)
	}
}

func TestLocalAudioInfoNeedsProbeAllowsAmbiguousContainer(t *testing.T) {
	file := &models.LocalMediaFile{
		AbsolutePath: "track.m4a",
		Container:    "mp4",
		Codec:        "aac",
	}

	if !localAudioInfoNeedsProbe(file, file.Codec, 0, 0, 0, 0) {
		t.Fatal("expected ambiguous mp4 container to remain probe-eligible")
	}
	if got := localSourceQualityClassFromFile(file); got != localSourceQualityUnknown {
		t.Fatalf("source quality class = %s, want %s before probe", got, localSourceQualityUnknown)
	}
}

func TestLocalAudioInfoNeedsLosslessDetailProbeRequiresMissingBitDepth(t *testing.T) {
	if !localAudioInfoNeedsLosslessDetailProbe("alac", 2304000, 0, 48000, 2) {
		t.Fatal("expected lossless source with missing bit depth to require detail probe")
	}
	if localAudioInfoNeedsLosslessDetailProbe("alac", 2304000, 24, 48000, 2) {
		t.Fatal("expected complete lossless source info to skip detail probe")
	}
}

func TestLocalAudioInfoNeedsLosslessDetailProbeSkipsLossySources(t *testing.T) {
	if localAudioInfoNeedsLosslessDetailProbe("aac", 320000, 0, 44100, 2) {
		t.Fatal("expected lossy source to skip lossless detail probe")
	}
}

func TestLocalAlbumDetailIncludesOrderedRelatedShelvesWithoutAppearsOn(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryLocalLibraryRepo()
	service := NewLocalLibraryService(nil, repo)

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "测试艺人",
		NormalizedName:     "测试艺人",
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}

	currentReleaseDate := time.Date(2024, 1, 10, 0, 0, 0, 0, time.UTC)
	currentAlbum, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "当前专辑",
		NormalizedTitle:    "当前专辑",
		PrimaryArtistID:    artist.ID,
		ReleaseDate:        &currentReleaseDate,
		TotalTracks:        2,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum(current) error = %v", err)
	}

	newerReleaseDate := time.Date(2025, 2, 10, 0, 0, 0, 0, time.UTC)
	newerAlbum, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "新专辑",
		NormalizedTitle:    "新专辑",
		PrimaryArtistID:    artist.ID,
		ReleaseDate:        &newerReleaseDate,
		TotalTracks:        2,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum(newer) error = %v", err)
	}

	olderReleaseDate := time.Date(2023, 6, 1, 0, 0, 0, 0, time.UTC)
	olderEP, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "旧 EP",
		NormalizedTitle:    "旧 ep",
		PrimaryArtistID:    artist.ID,
		ReleaseDate:        &olderReleaseDate,
		TotalTracks:        1,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum(older) error = %v", err)
	}
	if _, err := repo.SaveMetadataField(ctx, &models.MetadataField{
		EntityType: models.LocalEntityTypeAlbum,
		EntityID:   olderEP.ID,
		FieldName:  "release_type",
		Source:     models.MetadataSourceRemote,
		Confidence: 1,
		Details: map[string]any{
			"value": "ep",
		},
	}); err != nil {
		t.Fatalf("SaveMetadataField() error = %v", err)
	}

	saveTrack := func(albumID int64, title string, trackNumber int) {
		if _, err := repo.SaveMedia(ctx, &models.LocalMedia{
			Title:              title,
			NormalizedTitle:    title,
			AlbumID:            albumID,
			PrimaryArtistID:    artist.ID,
			DurationMs:         180000,
			TrackNumber:        trackNumber,
			DiscNumber:         1,
			LyricsAvailable:    true,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		}); err != nil {
			t.Fatalf("SaveMedia(%s) error = %v", title, err)
		}
	}

	saveTrack(currentAlbum.ID, "当前歌曲 1", 1)
	saveTrack(currentAlbum.ID, "当前歌曲 2", 2)
	saveTrack(newerAlbum.ID, "新专辑歌曲 1", 1)
	saveTrack(newerAlbum.ID, "新专辑歌曲 2", 2)
	saveTrack(olderEP.ID, "旧 EP 歌曲", 1)

	detail, err := service.GetAlbumDetail(ctx, "", strconv.FormatInt(currentAlbum.ID, 10))
	if err != nil {
		t.Fatalf("GetAlbumDetail() error = %v", err)
	}
	if detail.LocalRelatedContent == nil {
		t.Fatal("expected local related content on local album detail")
	}

	shelves := detail.LocalRelatedContent.Shelves
	if len(shelves) != 2 {
		t.Fatalf("expected 2 local related shelves, got %d", len(shelves))
	}
	if shelves[0].ID != models.LocalAlbumRelatedShelfMoreByArtist {
		t.Fatalf("expected first shelf %q, got %q", models.LocalAlbumRelatedShelfMoreByArtist, shelves[0].ID)
	}
	if shelves[0].Title != "更多测试艺人的作品" {
		t.Fatalf("expected more-by-artist title, got %q", shelves[0].Title)
	}
	if len(shelves[0].Albums) != 2 {
		t.Fatalf("expected 2 same-artist releases, got %d", len(shelves[0].Albums))
	}
	if shelves[0].Albums[0].ID != strconv.FormatInt(newerAlbum.ID, 10) || shelves[0].Albums[1].ID != strconv.FormatInt(olderEP.ID, 10) {
		t.Fatalf("expected ordered same-artist releases without current album, got %#v", shelves[0].Albums)
	}
	for _, item := range shelves[0].Albums {
		if item.ID == strconv.FormatInt(currentAlbum.ID, 10) {
			t.Fatalf("expected current album %d to be excluded from more-by-artist shelf", currentAlbum.ID)
		}
	}

	if shelves[1].ID != models.LocalAlbumRelatedShelfArtistSongs {
		t.Fatalf("expected second shelf %q, got %q", models.LocalAlbumRelatedShelfArtistSongs, shelves[1].ID)
	}
	if shelves[1].Title != "先听这几首" {
		t.Fatalf("expected fallback featured-song copy, got %q", shelves[1].Title)
	}
	if len(shelves[1].Songs) == 0 {
		t.Fatal("expected artist songs shelf to include featured songs")
	}

	for _, shelf := range shelves {
		if shelf.ID == "appears-on" {
			t.Fatal("expected local album related content to omit unsupported appears-on shelf")
		}
	}
}

func TestBuildLocalAlbumRelatedShelvesUsesHistoryCopyWhenAvailable(t *testing.T) {
	shelves := buildLocalAlbumRelatedShelves("album-current", "测试艺人", &localArtistCatalog{
		albums: []models.AlbumItem{
			{ID: "album-current", Name: "当前专辑", ReleaseDate: "2024-01-01"},
			{ID: "album-other", Name: "其他专辑", ReleaseDate: "2025-01-01"},
		},
		featuredSongs: []models.SongItem{
			{ID: "song-1", Name: "常听歌曲"},
		},
		featuredSongsSource: "history",
	})

	if len(shelves) != 2 {
		t.Fatalf("expected 2 shelves, got %d", len(shelves))
	}
	if shelves[1].Title != "你常听的歌曲" {
		t.Fatalf("expected history featured-song copy, got %q", shelves[1].Title)
	}
}
