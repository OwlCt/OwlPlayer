package services

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/OwlCt/OwlPlayer/models"
)

func TestParseLocalTagsReadsMP4MetadataArtworkAndLyrics(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "Artist", "Album", "track.m4a")

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, buildTestM4AFile(testMP4Metadata{
		title:       "MP4 Title",
		artist:      "MP4 Artist",
		album:       "MP4 Album",
		trackNumber: 4,
		trackTotal:  11,
		discNumber:  2,
		discTotal:   3,
		genre:       "Alt Pop",
		composer:    "MP4 Composer",
		releaseDate: "2025-04-06",
		lyrics:      "first line\nsecond line",
		artwork:     []byte{0xff, 0xd8, 0xff, 0xdb},
	}), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	parsed, err := parseLocalTags(path)
	if err != nil {
		t.Fatalf("parseLocalTags() error = %v", err)
	}
	if parsed.Title != "MP4 Title" {
		t.Fatalf("expected title from MP4 tags, got %q", parsed.Title)
	}
	if parsed.Artist != "MP4 Artist" {
		t.Fatalf("expected artist from MP4 tags, got %q", parsed.Artist)
	}
	if parsed.Album != "MP4 Album" {
		t.Fatalf("expected album from MP4 tags, got %q", parsed.Album)
	}
	if parsed.TrackNumber != 4 || parsed.TrackTotal != 11 {
		t.Fatalf("expected track 4/11, got %d/%d", parsed.TrackNumber, parsed.TrackTotal)
	}
	if parsed.DiscNumber != 2 || parsed.DiscTotal != 3 {
		t.Fatalf("expected disc 2/3, got %d/%d", parsed.DiscNumber, parsed.DiscTotal)
	}
	if parsed.Composer != "MP4 Composer" {
		t.Fatalf("expected composer from MP4 tags, got %q", parsed.Composer)
	}
	if len(parsed.Genres) != 1 || parsed.Genres[0] != "Alt Pop" {
		t.Fatalf("expected genre from MP4 tags, got %#v", parsed.Genres)
	}
	if !parsed.LyricsPresent || parsed.LyricsText != "first line\nsecond line" {
		t.Fatalf("expected embedded lyrics from MP4 tags, got present=%v text=%q", parsed.LyricsPresent, parsed.LyricsText)
	}
	if parsed.LyricsFormat != "plain" {
		t.Fatalf("expected plain embedded lyrics format, got %q", parsed.LyricsFormat)
	}
	if parsed.ReleaseDate == nil || parsed.ReleaseDate.Format("2006-01-02") != "2025-04-06" {
		t.Fatalf("expected release date from MP4 tags, got %#v", parsed.ReleaseDate)
	}
	if parsed.ArtworkMIME != "image/jpeg" {
		t.Fatalf("expected embedded JPEG artwork, got %q", parsed.ArtworkMIME)
	}
	if len(parsed.ArtworkData) == 0 {
		t.Fatalf("expected embedded artwork data")
	}
}

func TestLocalLyricsServiceKeepsEmbeddedLyricsWhenAppleLyricsAreNotRicher(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	root := t.TempDir()
	path := filepath.Join(root, "Artist", "Album", "song.mp3")

	writeTaggedMP3File(t, path, taggedMP3Input{lyrics: "embedded lyric"})
	writeLyricsSidecar(t, strings.TrimSuffix(path, filepath.Ext(path))+".ttml", `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0.000" end="5.000">sidecar lyric</p></div></body></tt>`)

	mediaID := saveTestMediaFile(t, repo, path)
	_, err := repo.SaveLyricsMapping(context.Background(), &models.LyricsMapping{
		MediaID:          mediaID,
		AppleMusicSongID: "apple-song-embedded",
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  0.99,
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
		return `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0.000" end="5.000">apple lyric</p></div></body></tt>`, "lyrics", nil
	}

	result, err := service.GetLyrics(context.Background(), strconv.FormatInt(mediaID, 10))
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if !result.Available || result.Type != "lyrics" {
		t.Fatalf("expected available normalized lyrics, got %#v", result)
	}
	if !strings.Contains(result.TTML, "embedded lyric") {
		t.Fatalf("expected embedded lyric in TTML, got %q", result.TTML)
	}
	if strings.Contains(result.TTML, "sidecar lyric") {
		t.Fatalf("expected embedded lyrics to win over sidecar TTML, got %q", result.TTML)
	}
	if strings.Contains(result.TTML, "apple lyric") {
		t.Fatalf("expected embedded lyrics to win when Apple lyrics are not richer, got %q", result.TTML)
	}
}

func TestLocalLyricsServiceKeepsSidecarTTMLWhenAppleLyricsAreNotRicher(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	root := t.TempDir()
	path := filepath.Join(root, "Artist", "Album", "song.mp3")

	writeTestFile(t, path)
	writeLyricsSidecar(t, strings.TrimSuffix(path, filepath.Ext(path))+".ttml", `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1.000" end="3.000">ttml lyric</p></div></body></tt>`)
	writeLyricsSidecar(t, strings.TrimSuffix(path, filepath.Ext(path))+".lrc", "[00:01.00]lrc lyric")

	mediaID := saveTestMediaFile(t, repo, path)
	_, err := repo.SaveLyricsMapping(context.Background(), &models.LyricsMapping{
		MediaID:          mediaID,
		AppleMusicSongID: "apple-song-sidecar-ttml",
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  0.99,
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
		return `<tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="1.000" end="3.000">apple lyric</p></div></body></tt>`, "lyrics", nil
	}

	result, err := service.GetLyrics(context.Background(), strconv.FormatInt(mediaID, 10))
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if !result.Available || result.Type != "lyrics" {
		t.Fatalf("expected available TTML lyrics, got %#v", result)
	}
	if !strings.Contains(result.TTML, "ttml lyric") {
		t.Fatalf("expected TTML sidecar to be returned, got %q", result.TTML)
	}
	if strings.Contains(result.TTML, "lrc lyric") {
		t.Fatalf("expected TTML sidecar to win over LRC, got %q", result.TTML)
	}
	if strings.Contains(result.TTML, "apple lyric") {
		t.Fatalf("expected sidecar TTML to win when Apple lyrics are not richer, got %q", result.TTML)
	}
}

func TestLocalLyricsServicePrefersRicherAppleLyricsOverSidecarLRC(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	root := t.TempDir()
	path := filepath.Join(root, "Artist", "Album", "song.mp3")

	writeTestFile(t, path)
	writeLyricsSidecar(t, strings.TrimSuffix(path, filepath.Ext(path))+".lrc", "[00:01.00]line one\n[00:03.00]line two")

	mediaID := saveTestMediaFile(t, repo, path)
	_, err := repo.SaveLyricsMapping(context.Background(), &models.LyricsMapping{
		MediaID:          mediaID,
		AppleMusicSongID: "apple-song-sidecar-lrc",
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  0.99,
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
		return `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:itunes="http://music.apple.com/lyric-ttml-internal" itunes:timing="Word"><head><metadata><iTunesMetadata><translations><translation xml:lang="zh-Hans"><text for="L1">翻译行</text></translation></translations></iTunesMetadata></metadata></head><body><div><p begin="0.000" end="2.000" itunes:key="L1"><span begin="0.000" end="0.900">apple</span><span begin="0.900" end="2.000"> lyric</span></p></div></body></tt>`, "syllable-lyrics", nil
	}

	result, err := service.GetLyrics(context.Background(), strconv.FormatInt(mediaID, 10))
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if !result.Available || result.Type != "syllable-lyrics" {
		t.Fatalf("expected richer Apple lyrics to win, got %#v", result)
	}
	if !strings.Contains(result.TTML, "translation") && !strings.Contains(result.TTML, "翻译行") {
		t.Fatalf("expected Apple lyrics with translation to be returned, got %q", result.TTML)
	}
}

func TestLocalLyricsServiceFallsBackToLocalLyricsWhenAppleFetchFails(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	root := t.TempDir()
	path := filepath.Join(root, "Artist", "Album", "song.mp3")

	writeTestFile(t, path)
	writeLyricsSidecar(t, strings.TrimSuffix(path, filepath.Ext(path))+".lrc", "[00:01.00]line one\n[00:03.00]line two")

	mediaID := saveTestMediaFile(t, repo, path)
	_, err := repo.SaveLyricsMapping(context.Background(), &models.LyricsMapping{
		MediaID:          mediaID,
		AppleMusicSongID: "apple-song-sidecar-lrc",
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  0.99,
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

	result, err := service.GetLyrics(context.Background(), strconv.FormatInt(mediaID, 10))
	if err != nil {
		t.Fatalf("GetLyrics() error = %v", err)
	}
	if !result.Available || result.Type != "lyrics" {
		t.Fatalf("expected local lyrics fallback when Apple fetch fails, got %#v", result)
	}
	if !strings.Contains(result.TTML, "line one") || !strings.Contains(result.TTML, "line two") {
		t.Fatalf("expected local sidecar lyrics in TTML, got %q", result.TTML)
	}

	mapping, err := repo.GetLyricsMappingByMediaID(context.Background(), mediaID)
	if err != nil {
		t.Fatalf("GetLyricsMappingByMediaID() error = %v", err)
	}
	if mapping == nil || mapping.Status != models.LyricsMappingStatusError {
		t.Fatalf("expected mapping error to be recorded, got %#v", mapping)
	}
}

func TestLocalMediaScannerPersistsMotionArtworkAndArtistArtworkFallback(t *testing.T) {
	root := t.TempDir()
	songPath := filepath.Join(root, "Artist Fallback", "Album One", "song.mp3")
	coverPath := filepath.Join(root, "Artist Fallback", "Album One", "cover.jpg")
	motionPath := filepath.Join(root, "Artist Fallback", "Album One", "motion.mp4")

	writeTestFile(t, songPath)
	writeTestFile(t, coverPath)
	writeTestFile(t, motionPath)

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupFull,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	if _, err := scanner.RunFullScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}

	var album *models.LocalAlbum
	for _, item := range repo.albums {
		album = item
	}
	if album == nil {
		t.Fatalf("expected album to be persisted")
	}
	if pathKey(album.ArtworkPath) != pathKey(coverPath) {
		t.Fatalf("expected album artwork path %q, got %q", coverPath, album.ArtworkPath)
	}

	var artist *models.LocalArtist
	for _, item := range repo.artists {
		artist = item
	}
	if artist == nil {
		t.Fatalf("expected artist to be persisted")
	}
	if pathKey(artist.ArtworkPath) != pathKey(coverPath) {
		t.Fatalf("expected artist fallback artwork path %q, got %q", coverPath, artist.ArtworkPath)
	}

	field := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeAlbum, album.ID, "motion_artwork")]
	if field == nil {
		t.Fatalf("expected motion artwork metadata field to be persisted")
	}
	if value, ok := field.Details["value"].(string); !ok || pathKey(value) != pathKey(motionPath) {
		t.Fatalf("expected motion artwork path %q, got %#v", motionPath, field.Details)
	}
}

func TestLocalMediaScannerUsesArtistDirectoryArtworkBeforeAlbumFallback(t *testing.T) {
	root := t.TempDir()
	songPath := filepath.Join(root, "Artist Priority", "Album One", "song.mp3")
	coverPath := filepath.Join(root, "Artist Priority", "Album One", "cover.jpg")
	artistPath := filepath.Join(root, "Artist Priority", "artist.png")

	writeTestFile(t, songPath)
	writeTestFile(t, coverPath)
	writeTestFile(t, artistPath)

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupFull,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	if _, err := scanner.RunFullScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}

	var artist *models.LocalArtist
	for _, item := range repo.artists {
		artist = item
	}
	if artist == nil {
		t.Fatalf("expected artist to be persisted")
	}
	if pathKey(artist.ArtworkPath) != pathKey(artistPath) {
		t.Fatalf("expected artist directory artwork %q, got %q", artistPath, artist.ArtworkPath)
	}
}

func TestLocalMediaScannerPersistsWAVDuration(t *testing.T) {
	root := t.TempDir()
	songPath := filepath.Join(root, "Artist Duration", "Album One", "song.wav")

	if err := os.MkdirAll(filepath.Dir(songPath), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(songPath, buildTestWAV(2, 44100, 16), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupFull,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	if _, err := scanner.RunFullScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}

	var media *models.LocalMedia
	for _, item := range repo.media {
		media = item
	}
	if media == nil {
		t.Fatalf("expected media to be persisted")
	}
	if media.DurationMs < 1950 || media.DurationMs > 2050 {
		t.Fatalf("expected duration around 2000ms, got %d", media.DurationMs)
	}

	field := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeMedia, media.ID, "duration_ms")]
	if field == nil {
		t.Fatalf("expected duration_ms metadata field to be persisted")
	}
}

func TestLocalLibraryServiceReturnsMotionVideoURLForLocalAlbum(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Artist",
		NormalizedName:     normalizeText("Artist"),
		SortName:           "Artist",
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}
	album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Album",
		NormalizedTitle:    normalizeText("Album"),
		SortTitle:          "Album",
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	_, err = repo.SaveMedia(ctx, &models.LocalMedia{
		Title:              "Song",
		NormalizedTitle:    normalizeText("Song"),
		AlbumID:            album.ID,
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveMedia() error = %v", err)
	}
	_, err = repo.SaveMetadataField(ctx, &models.MetadataField{
		EntityType: models.LocalEntityTypeAlbum,
		EntityID:   album.ID,
		FieldName:  "motion_artwork",
		Source:     models.MetadataSourceDirectory,
		Confidence: 0.82,
		Details: map[string]any{
			"value": filepath.Join("C:", "motion", "album.mp4"),
		},
	})
	if err != nil {
		t.Fatalf("SaveMetadataField() error = %v", err)
	}

	service := NewLocalLibraryService(nil, repo)
	detail, err := service.GetAlbumDetail(ctx, "", strconv.FormatInt(album.ID, 10))
	if err != nil {
		t.Fatalf("GetAlbumDetail() error = %v", err)
	}
	expected := "/api/artwork/album/" + strconv.FormatInt(album.ID, 10) + "/motion"
	if detail.MotionVideoURL != expected {
		t.Fatalf("expected motion video URL %q, got %q", expected, detail.MotionVideoURL)
	}
}

func TestRecentlyPlayedServiceUsesLocalSnapshotsForAlbumAndArtist(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Local Artist",
		NormalizedName:     normalizeText("Local Artist"),
		SortName:           "Local Artist",
		ArtworkPath:        filepath.Join("C:", "art", "artist.jpg"),
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}
	album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Local Album",
		NormalizedTitle:    normalizeText("Local Album"),
		SortTitle:          "Local Album",
		PrimaryArtistID:    artist.ID,
		ArtworkPath:        filepath.Join("C:", "art", "album.jpg"),
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}

	service := NewRecentlyPlayedService(nil)
	service.SetLocalLibraryRepository(repo)

	albumItem := &models.RecentlyPlayedItemWithDetails{ItemID: strconv.FormatInt(album.ID, 10)}
	service.fillAlbumDetails(ctx, "user-1", albumItem)
	if albumItem.Name != "Local Album" || albumItem.Subtitle != "Local Artist" {
		t.Fatalf("expected local album snapshot details, got %#v", albumItem)
	}
	if albumItem.ArtworkURL != "/api/artwork/album/"+strconv.FormatInt(album.ID, 10) {
		t.Fatalf("expected local album artwork URL, got %q", albumItem.ArtworkURL)
	}

	artistItem := &models.RecentlyPlayedItemWithDetails{ItemID: strconv.FormatInt(artist.ID, 10)}
	service.fillArtistDetails(ctx, "user-1", artistItem)
	if artistItem.Name != "Local Artist" || artistItem.Subtitle != "艺人" {
		t.Fatalf("expected local artist snapshot details, got %#v", artistItem)
	}
	if artistItem.ArtworkURL != "/api/artwork/artist/"+strconv.FormatInt(artist.ID, 10) {
		t.Fatalf("expected local artist artwork URL, got %q", artistItem.ArtworkURL)
	}
}

func saveTestMediaFile(t *testing.T, repo *inMemoryLocalLibraryRepo, path string) int64 {
	t.Helper()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Artist",
		NormalizedName:     normalizeText("Artist"),
		SortName:           "Artist",
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}
	album, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Album",
		NormalizedTitle:    normalizeText("Album"),
		SortTitle:          "Album",
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	media, err := repo.SaveMedia(ctx, &models.LocalMedia{
		Title:              "Song",
		NormalizedTitle:    normalizeText("Song"),
		AlbumID:            album.ID,
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveMedia() error = %v", err)
	}
	if _, err := repo.SaveMediaFile(ctx, &models.LocalMediaFile{
		MediaID:            media.ID,
		LibraryRoot:        filepath.Dir(filepath.Dir(path)),
		RelativePath:       filepath.Base(path),
		AbsolutePath:       path,
		FileSizeBytes:      1024,
		IsPrimary:          true,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	}); err != nil {
		t.Fatalf("SaveMediaFile() error = %v", err)
	}
	return media.ID
}

func writeLyricsSidecar(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}

type testMP4Metadata struct {
	title       string
	artist      string
	album       string
	trackNumber int
	trackTotal  int
	discNumber  int
	discTotal   int
	genre       string
	composer    string
	releaseDate string
	lyrics      string
	artwork     []byte
}

func buildTestM4AFile(meta testMP4Metadata) []byte {
	items := []byte{}
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'n', 'a', 'm'), meta.title)...)
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'A', 'R', 'T'), meta.artist)...)
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'a', 'l', 'b'), meta.album)...)
	items = append(items, buildMP4IndexItem("trkn", meta.trackNumber, meta.trackTotal)...)
	items = append(items, buildMP4IndexItem("disk", meta.discNumber, meta.discTotal)...)
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'g', 'e', 'n'), meta.genre)...)
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'w', 'r', 't'), meta.composer)...)
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'd', 'a', 'y'), meta.releaseDate)...)
	items = append(items, buildMP4StringItem(mp4AtomType(0xa9, 'l', 'y', 'r'), meta.lyrics)...)
	items = append(items, buildMP4ArtworkItem(meta.artwork)...)

	ilst := buildMP4Atom("ilst", items)
	metaAtom := buildMP4Atom("meta", append(make([]byte, 4), ilst...))
	udta := buildMP4Atom("udta", metaAtom)
	moov := buildMP4Atom("moov", udta)
	return append(buildMP4Atom("ftyp", []byte("M4A test")), moov...)
}

func buildTestWAV(seconds int, sampleRate int, bitsPerSample int) []byte {
	channels := 1
	bytesPerSample := bitsPerSample / 8
	dataSize := seconds * sampleRate * channels * bytesPerSample
	fileSize := 36 + dataSize

	result := make([]byte, 44+dataSize)
	copy(result[0:4], []byte("RIFF"))
	binary.LittleEndian.PutUint32(result[4:8], uint32(fileSize))
	copy(result[8:12], []byte("WAVE"))
	copy(result[12:16], []byte("fmt "))
	binary.LittleEndian.PutUint32(result[16:20], 16)
	binary.LittleEndian.PutUint16(result[20:22], 1)
	binary.LittleEndian.PutUint16(result[22:24], uint16(channels))
	binary.LittleEndian.PutUint32(result[24:28], uint32(sampleRate))
	byteRate := sampleRate * channels * bytesPerSample
	binary.LittleEndian.PutUint32(result[28:32], uint32(byteRate))
	blockAlign := channels * bytesPerSample
	binary.LittleEndian.PutUint16(result[32:34], uint16(blockAlign))
	binary.LittleEndian.PutUint16(result[34:36], uint16(bitsPerSample))
	copy(result[36:40], []byte("data"))
	binary.LittleEndian.PutUint32(result[40:44], uint32(dataSize))
	return result
}

func buildMP4Atom(atomType string, payload []byte) []byte {
	result := make([]byte, 8+len(payload))
	binary.BigEndian.PutUint32(result[:4], uint32(len(result)))
	copy(result[4:8], []byte(atomType))
	copy(result[8:], payload)
	return result
}

func buildMP4StringItem(atomType, value string) []byte {
	return buildMP4Atom(atomType, buildMP4DataAtom(1, []byte(value)))
}

func buildMP4IndexItem(atomType string, number, total int) []byte {
	value := make([]byte, 8)
	binary.BigEndian.PutUint16(value[2:4], uint16(number))
	binary.BigEndian.PutUint16(value[4:6], uint16(total))
	return buildMP4Atom(atomType, buildMP4DataAtom(0, value))
}

func buildMP4ArtworkItem(image []byte) []byte {
	return buildMP4Atom("covr", buildMP4DataAtom(13, image))
}

func buildMP4DataAtom(dataType uint32, value []byte) []byte {
	payload := make([]byte, 8+len(value))
	binary.BigEndian.PutUint32(payload[:4], dataType)
	copy(payload[8:], value)
	return buildMP4Atom("data", payload)
}

func mp4AtomType(a byte, b, c, d rune) string {
	return string([]byte{a, byte(b), byte(c), byte(d)})
}
