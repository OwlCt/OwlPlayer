package services

import (
	"context"
	"io"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/OwlCt/OwlPlayer/models"
)

type stubLocalPlaybackRepo struct {
	media      *models.LocalMedia
	file       *models.LocalMediaFile
	savedMedia *models.LocalMedia
	savedFile  *models.LocalMediaFile
}

func (r *stubLocalPlaybackRepo) GetMediaByID(_ context.Context, _ int64) (*models.LocalMedia, error) {
	return r.media, nil
}

func (r *stubLocalPlaybackRepo) SaveMedia(_ context.Context, media *models.LocalMedia) (*models.LocalMedia, error) {
	clone := *media
	r.savedMedia = &clone
	return media, nil
}

func (r *stubLocalPlaybackRepo) SaveMediaFile(_ context.Context, file *models.LocalMediaFile) (*models.LocalMediaFile, error) {
	clone := *file
	r.savedFile = &clone
	return file, nil
}

func (r *stubLocalPlaybackRepo) GetPrimaryMediaFileByMediaID(_ context.Context, _ int64) (*models.LocalMediaFile, error) {
	return r.file, nil
}

func TestLocalPlaybackServiceStreamDirectSupportsRange(t *testing.T) {
	dir := t.TempDir()
	audioPath := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(audioPath, []byte("abcdef"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 1,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            1,
			AbsolutePath:       audioPath,
			MIMEType:           "audio/mpeg",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, nil)
	req := httptest.NewRequest("GET", "/api/stream/1", nil)
	req.Header.Set("Range", "bytes=2-4")
	rec := httptest.NewRecorder()

	if err := service.StreamDirect(rec, req, "1"); err != nil {
		t.Fatalf("StreamDirect() error = %v", err)
	}

	if rec.Code != 206 {
		t.Fatalf("status = %d, want %d", rec.Code, 206)
	}
	if got := rec.Body.String(); got != "cde" {
		t.Fatalf("body = %q, want %q", got, "cde")
	}
	if got := rec.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("Accept-Ranges = %q, want %q", got, "bytes")
	}
}

func TestLocalPlaybackServiceMarksMissingFileUnavailable(t *testing.T) {
	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 7,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			ID:                 9,
			MediaID:            7,
			AbsolutePath:       filepath.Join(t.TempDir(), "missing.flac"),
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, nil)
	req := httptest.NewRequest("GET", "/api/stream/7", nil)
	rec := httptest.NewRecorder()

	err := service.StreamDirect(rec, req, "7")
	if err != ErrLocalPlaybackUnavailable {
		t.Fatalf("StreamDirect() error = %v, want %v", err, ErrLocalPlaybackUnavailable)
	}
	if repo.savedMedia == nil || repo.savedMedia.AvailabilityStatus != models.AvailabilityStatusUnavailable {
		t.Fatalf("saved media availability = %#v, want unavailable", repo.savedMedia)
	}
	if repo.savedFile == nil || repo.savedFile.AvailabilityStatus != models.AvailabilityStatusUnavailable {
		t.Fatalf("saved file availability = %#v, want unavailable", repo.savedFile)
	}
}

func TestLocalPlaybackServiceStreamDirectTranscodesAmbiguousALACM4AToCompatibilityAAC(t *testing.T) {
	dir := t.TempDir()
	audioPath := filepath.Join(dir, "track.m4a")
	if err := os.WriteFile(audioPath, []byte("not-a-real-audio-file"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 12,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            12,
			AbsolutePath:       audioPath,
			MIMEType:           "audio/mp4",
			Container:          "mp4",
			Codec:              "aac",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, nil)
	service.probeCodec = func(_ context.Context, file *models.LocalMediaFile) (string, error) {
		if file.AbsolutePath != audioPath {
			t.Fatalf("probeCodec() path = %q, want %q", file.AbsolutePath, audioPath)
		}
		return "alac", nil
	}
	service.startTranscode = func(_ context.Context, sourcePath string, profile localTranscodeProfile) (*localTranscodeStream, error) {
		if sourcePath != audioPath {
			t.Fatalf("startTranscode() path = %q, want %q", sourcePath, audioPath)
		}
		if profile.key != "aac_320" {
			t.Fatalf("profile.key = %q, want %q", profile.key, "aac_320")
		}
		return &localTranscodeStream{
			output: io.NopCloser(strings.NewReader("transcoded-aac")),
			wait: func() error {
				return nil
			},
		}, nil
	}

	req := httptest.NewRequest("GET", "/api/stream/12", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamDirect(rec, req, "12"); err != nil {
		t.Fatalf("StreamDirect() error = %v", err)
	}

	if rec.Code != 200 {
		t.Fatalf("status = %d, want %d", rec.Code, 200)
	}
	if got := rec.Body.String(); got != "transcoded-aac" {
		t.Fatalf("body = %q, want %q", got, "transcoded-aac")
	}
	if got := rec.Header().Get("Content-Type"); got != "audio/aac" {
		t.Fatalf("Content-Type = %q, want %q", got, "audio/aac")
	}
	if got := rec.Header().Get("Accept-Ranges"); got != "none" {
		t.Fatalf("Accept-Ranges = %q, want %q", got, "none")
	}
}

func TestLocalPlaybackServiceStreamDirectTranscodesFLACToCompatibilityAAC(t *testing.T) {
	dir := t.TempDir()
	audioPath := filepath.Join(dir, "track.flac")
	if err := os.WriteFile(audioPath, []byte("not-a-real-audio-file"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 15,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            15,
			AbsolutePath:       audioPath,
			MIMEType:           "audio/flac",
			Container:          "flac",
			Codec:              "flac",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, nil)
	service.startTranscode = func(_ context.Context, sourcePath string, profile localTranscodeProfile) (*localTranscodeStream, error) {
		if sourcePath != audioPath {
			t.Fatalf("startTranscode() path = %q, want %q", sourcePath, audioPath)
		}
		if profile.key != "aac_320" {
			t.Fatalf("profile.key = %q, want %q", profile.key, "aac_320")
		}
		return &localTranscodeStream{
			output: io.NopCloser(strings.NewReader("compat-aac")),
			wait: func() error {
				return nil
			},
		}, nil
	}

	req := httptest.NewRequest("GET", "/api/stream/15", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamDirect(rec, req, "15"); err != nil {
		t.Fatalf("StreamDirect() error = %v", err)
	}

	if got := rec.Body.String(); got != "compat-aac" {
		t.Fatalf("body = %q, want %q", got, "compat-aac")
	}
	if got := rec.Header().Get("Content-Type"); got != "audio/aac" {
		t.Fatalf("Content-Type = %q, want %q", got, "audio/aac")
	}
}

func TestLocalPlaybackServiceStreamDirectUsesRequestedAACTranscodeProfile(t *testing.T) {
	dir := t.TempDir()
	audioPath := filepath.Join(dir, "track.flac")
	if err := os.WriteFile(audioPath, []byte("not-a-real-audio-file"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 13,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            13,
			AbsolutePath:       audioPath,
			MIMEType:           "audio/flac",
			Container:          "flac",
			Codec:              "flac",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, nil)
	service.startTranscode = func(_ context.Context, sourcePath string, profile localTranscodeProfile) (*localTranscodeStream, error) {
		if sourcePath != audioPath {
			t.Fatalf("startTranscode() path = %q, want %q", sourcePath, audioPath)
		}
		if profile.key != "aac_320" {
			t.Fatalf("profile.key = %q, want %q", profile.key, "aac_320")
		}
		return &localTranscodeStream{
			output: io.NopCloser(strings.NewReader("transcoded-aac")),
			wait: func() error {
				return nil
			},
		}, nil
	}

	req := httptest.NewRequest("GET", "/api/stream/13?transcode=aac_320", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamDirect(rec, req, "13"); err != nil {
		t.Fatalf("StreamDirect() error = %v", err)
	}

	if got := rec.Body.String(); got != "transcoded-aac" {
		t.Fatalf("body = %q, want %q", got, "transcoded-aac")
	}
	if got := rec.Header().Get("Content-Type"); got != "audio/aac" {
		t.Fatalf("Content-Type = %q, want %q", got, "audio/aac")
	}
}

func TestLocalPlaybackServiceStreamDirectDownloadPackagesCompatibilityAACAsSeekableFile(t *testing.T) {
	dir := t.TempDir()
	audioPath := filepath.Join(dir, "track.flac")
	if err := os.WriteFile(audioPath, []byte("not-a-real-audio-file"), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 21,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            21,
			AbsolutePath:       audioPath,
			MIMEType:           "audio/flac",
			Container:          "flac",
			Codec:              "flac",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, nil)
	service.transcodeToFile = func(_ context.Context, sourcePath string, profile localDownloadTranscodeProfile) (string, error) {
		if sourcePath != audioPath {
			t.Fatalf("transcodeToFile() path = %q, want %q", sourcePath, audioPath)
		}
		if profile.key != "aac_256" {
			t.Fatalf("profile.key = %q, want %q", profile.key, "aac_256")
		}

		outputPath := filepath.Join(dir, "offline-packaged.m4a")
		if err := os.WriteFile(outputPath, []byte("packaged-aac"), 0644); err != nil {
			t.Fatalf("WriteFile() output error = %v", err)
		}
		return outputPath, nil
	}

	req := httptest.NewRequest("GET", "/api/stream/21?download=1", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamDirect(rec, req, "21"); err != nil {
		t.Fatalf("StreamDirect() error = %v", err)
	}

	if got := rec.Body.String(); got != "packaged-aac" {
		t.Fatalf("body = %q, want %q", got, "packaged-aac")
	}
	if got := rec.Header().Get("Content-Type"); got != "audio/mp4" {
		t.Fatalf("Content-Type = %q, want %q", got, "audio/mp4")
	}
	if got := rec.Header().Get("Accept-Ranges"); got != "bytes" {
		t.Fatalf("Accept-Ranges = %q, want %q", got, "bytes")
	}
}

func TestLocalPlaybackServiceServeHLSPlaylistPreservesQueryStringForSegments(t *testing.T) {
	dir := t.TempDir()
	songID := "42"
	songDir := filepath.Join(dir, songID)
	if err := os.MkdirAll(songDir, 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	playlist := strings.Join([]string{
		"#EXTM3U",
		"#EXT-X-VERSION:3",
		"#EXTINF:10.0,",
		"segment000.ts",
		"#EXTINF:10.0,",
		"segment001.ts",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(songDir, "playlist.m3u8"), []byte(playlist), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	service := NewLocalPlaybackService(nil, &HLSCacheService{hlsDir: dir})
	req := httptest.NewRequest("GET", "/api/stream/42/playlist.m3u8?token=test-token&_t=123", nil)
	rec := httptest.NewRecorder()

	if err := service.serveHLSPlaylist(rec, req, songID, localHLSVariantResolution{
		requestedQuality: "aac_256",
		requestedVariant: hlsVariantAAC256,
		actualVariant:    hlsVariantAAC256,
	}); err != nil {
		t.Fatalf("serveHLSPlaylist() error = %v", err)
	}

	body := rec.Body.String()
	if !strings.Contains(body, "/api/stream/42/segment000.ts?") {
		t.Fatalf("playlist body missing first segment query propagation: %q", body)
	}
	segmentQuery := mustExtractQueryValue(t, body, "/api/stream/42/segment000.ts?")
	if segmentQuery.Get("token") != "test-token" || segmentQuery.Get("_t") != "123" || segmentQuery.Get("quality") != "aac_256" {
		t.Fatalf("segment query = %q, want token/_t preserved and quality=aac_256", segmentQuery.Encode())
	}
	if !strings.Contains(body, "/api/stream/42/segment001.ts?") {
		t.Fatalf("playlist body missing second segment query propagation: %q", body)
	}
	if got := rec.Header().Get("X-Owl-HLS-Resolved-Variant"); got != "aac_256" {
		t.Fatalf("X-Owl-HLS-Resolved-Variant = %q, want %q", got, "aac_256")
	}
}

func TestLocalPlaybackServiceServeLosslessHLSPlaylistRewritesInitMapAndSegments(t *testing.T) {
	dir := t.TempDir()
	songID := "77"
	songDir := filepath.Join(dir, songID+"__lossless")
	if err := os.MkdirAll(songDir, 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	playlist := strings.Join([]string{
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		`#EXT-X-MAP:URI="init.mp4"`,
		"#EXTINF:10.0,",
		"segment000.m4s",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(songDir, "playlist.m3u8"), []byte(playlist), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	service := NewLocalPlaybackService(nil, &HLSCacheService{hlsDir: dir})
	req := httptest.NewRequest("GET", "/api/stream/77/playlist.m3u8?token=test-token&quality=lossless", nil)
	rec := httptest.NewRecorder()

	if err := service.serveHLSPlaylist(rec, req, songID, localHLSVariantResolution{
		requestedQuality: "lossless",
		requestedVariant: hlsVariantLossless,
		actualVariant:    hlsVariantLossless,
	}); err != nil {
		t.Fatalf("serveHLSPlaylist() error = %v", err)
	}

	body := rec.Body.String()
	initQuery := mustExtractQueryValue(t, body, `/api/stream/77/init.mp4?`)
	if initQuery.Get("token") != "test-token" || initQuery.Get("quality") != "lossless" {
		t.Fatalf("init query = %q, want token preserved and quality=lossless", initQuery.Encode())
	}
	segmentQuery := mustExtractQueryValue(t, body, "/api/stream/77/segment000.m4s?")
	if segmentQuery.Get("token") != "test-token" || segmentQuery.Get("quality") != "lossless" {
		t.Fatalf("segment query = %q, want token preserved and quality=lossless", segmentQuery.Encode())
	}
}

func TestLocalPlaybackServiceServeLosslessHLSPlaylistRewritesAbsoluteInitMap(t *testing.T) {
	dir := t.TempDir()
	songID := "78"
	songDir := filepath.Join(dir, songID+"__lossless")
	if err := os.MkdirAll(songDir, 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	absoluteInitPath := "/tmp/owlplayer-hls/init.mp4"
	playlist := strings.Join([]string{
		"#EXTM3U",
		"#EXT-X-VERSION:7",
		`#EXT-X-MAP:URI="` + absoluteInitPath + `"`,
		"#EXTINF:10.0,",
		"segment000.m4s",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(songDir, "playlist.m3u8"), []byte(playlist), 0644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	service := NewLocalPlaybackService(nil, &HLSCacheService{hlsDir: dir})
	req := httptest.NewRequest("GET", "/api/stream/78/playlist.m3u8?quality=lossless", nil)
	rec := httptest.NewRecorder()

	if err := service.serveHLSPlaylist(rec, req, songID, localHLSVariantResolution{
		requestedQuality: "lossless",
		requestedVariant: hlsVariantLossless,
		actualVariant:    hlsVariantLossless,
	}); err != nil {
		t.Fatalf("serveHLSPlaylist() error = %v", err)
	}

	body := rec.Body.String()
	initQuery := mustExtractQueryValue(t, body, `/api/stream/78/init.mp4?`)
	if initQuery.Get("quality") != "lossless" {
		t.Fatalf("init query = %q, want quality=lossless", initQuery.Encode())
	}
}

func TestLocalPlaybackServiceStreamHLSServesLosslessInitWithoutQualityQuery(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "track.m4a")
	if err := os.WriteFile(sourcePath, []byte("source-audio"), 0644); err != nil {
		t.Fatalf("WriteFile() source error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 172,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            172,
			AbsolutePath:       sourcePath,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	songDir := filepath.Join(dir, "172__lossless")
	if err := os.MkdirAll(songDir, 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(songDir, "init.mp4"), []byte("lossless-init"), 0644); err != nil {
		t.Fatalf("WriteFile() init error = %v", err)
	}

	service := NewLocalPlaybackService(repo, &HLSCacheService{
		hlsDir:       dir,
		metadata:     NewHLSCacheMetadataStore(),
		metadataPath: filepath.Join(dir, "metadata.json"),
	})
	service.hlsCache.BindResolvedVariant("172", localHLSVariantResolution{
		requestedQuality: "lossless",
		requestedVariant: hlsVariantLossless,
		actualVariant:    hlsVariantLossless,
	})
	req := httptest.NewRequest("GET", "/init.mp4", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamHLS(rec, req, "172"); err != nil {
		t.Fatalf("StreamHLS() error = %v", err)
	}

	if rec.Code != 200 {
		t.Fatalf("status = %d, want %d", rec.Code, 200)
	}
	if got := rec.Body.String(); got != "lossless-init" {
		t.Fatalf("body = %q, want %q", got, "lossless-init")
	}
	if got := rec.Header().Get("Content-Type"); got != "audio/mp4" {
		t.Fatalf("Content-Type = %q, want %q", got, "audio/mp4")
	}
}

func TestLocalPlaybackServiceStreamHLSMissingSegmentDoesNotMarkMediaUnavailable(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "track.m4a")
	if err := os.WriteFile(sourcePath, []byte("source-audio"), 0644); err != nil {
		t.Fatalf("WriteFile() source error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 263,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			ID:                 9,
			MediaID:            263,
			AbsolutePath:       sourcePath,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	service := NewLocalPlaybackService(repo, &HLSCacheService{
		hlsDir:       dir,
		metadata:     NewHLSCacheMetadataStore(),
		metadataPath: filepath.Join(dir, "metadata.json"),
	})
	req := httptest.NewRequest("GET", "/segment000.m4s", nil)
	rec := httptest.NewRecorder()

	err := service.StreamHLS(rec, req, "263")
	if err != ErrLocalPlaybackUnavailable {
		t.Fatalf("StreamHLS() error = %v, want %v", err, ErrLocalPlaybackUnavailable)
	}
	if repo.savedMedia != nil {
		t.Fatalf("saved media = %#v, want nil", repo.savedMedia)
	}
	if repo.savedFile != nil {
		t.Fatalf("saved file = %#v, want nil", repo.savedFile)
	}
}

func TestLocalPlaybackServiceStreamHLSDowngradesLosslessRequestForLossySource(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(sourcePath, []byte("source-audio"), 0644); err != nil {
		t.Fatalf("WriteFile() source error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 345,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            345,
			AbsolutePath:       sourcePath,
			Container:          "mp3",
			Codec:              "mp3",
			Bitrate:            320000,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	actualDir := filepath.Join(dir, "345__aac_320")
	if err := os.MkdirAll(actualDir, 0755); err != nil {
		t.Fatalf("MkdirAll() actual error = %v", err)
	}
	playlist := strings.Join([]string{
		"#EXTM3U",
		"#EXT-X-VERSION:3",
		"#EXTINF:10.0,",
		"segment000.ts",
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(actualDir, "playlist.m3u8"), []byte(playlist), 0644); err != nil {
		t.Fatalf("WriteFile() playlist error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(actualDir, "segment000.ts"), []byte("aac320"), 0644); err != nil {
		t.Fatalf("WriteFile() segment error = %v", err)
	}

	staleLosslessDir := filepath.Join(dir, "345__lossless")
	if err := os.MkdirAll(staleLosslessDir, 0755); err != nil {
		t.Fatalf("MkdirAll() stale error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleLosslessDir, "playlist.m3u8"), []byte("#EXTM3U"), 0644); err != nil {
		t.Fatalf("WriteFile() stale playlist error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleLosslessDir, "init.mp4"), []byte("init"), 0644); err != nil {
		t.Fatalf("WriteFile() stale init error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(staleLosslessDir, "segment000.m4s"), []byte("lossless"), 0644); err != nil {
		t.Fatalf("WriteFile() stale segment error = %v", err)
	}

	cache := &HLSCacheService{
		hlsDir:          dir,
		metadata:        NewHLSCacheMetadataStore(),
		metadataPath:    filepath.Join(dir, "metadata.json"),
		resolvedVariant: make(map[string]localHLSVariantResolution),
	}
	cache.metadata.Set("345__aac_320", &HLSCacheMetadata{
		SongID:        "345",
		Variant:       hlsVariantAAC320.key,
		TotalSize:     123,
		SegmentCount:  1,
		CachedAt:      time.Now(),
		LastAccessed:  time.Now(),
		FormatVersion: hlsVariantAAC320.formatVersion,
	})
	cache.metadata.Set("345__lossless", &HLSCacheMetadata{
		SongID:        "345",
		Variant:       hlsVariantLossless.key,
		TotalSize:     456,
		SegmentCount:  1,
		CachedAt:      time.Now(),
		LastAccessed:  time.Now(),
		FormatVersion: hlsVariantLossless.formatVersion,
	})

	service := NewLocalPlaybackService(repo, cache)
	req := httptest.NewRequest("GET", "/playlist.m3u8?quality=lossless&token=test-token", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamHLS(rec, req, "345"); err != nil {
		t.Fatalf("StreamHLS() error = %v", err)
	}

	body := rec.Body.String()
	segmentQuery := mustExtractQueryValue(t, body, "/api/stream/345/segment000.ts?")
	if segmentQuery.Get("quality") != "aac_320" || segmentQuery.Get("token") != "test-token" {
		t.Fatalf("segment query = %q, want quality=aac_320 with token preserved", segmentQuery.Encode())
	}
	if got := rec.Header().Get("X-Owl-HLS-Resolved-Variant"); got != "aac_320" {
		t.Fatalf("X-Owl-HLS-Resolved-Variant = %q, want %q", got, "aac_320")
	}
	if _, err := os.Stat(staleLosslessDir); !os.IsNotExist(err) {
		t.Fatalf("expected stale pseudo-lossless cache to be removed, stat err = %v", err)
	}
	if bound, ok := cache.GetResolvedVariant("345"); !ok || bound.actualVariant.key != hlsVariantAAC320.key || !bound.isDowngraded {
		t.Fatalf("resolved variant binding = %#v, want downgraded aac_320", bound)
	}
}

func TestLocalPlaybackServiceStreamHLSQuerylessAssetRequiresBinding(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(sourcePath, []byte("source-audio"), 0644); err != nil {
		t.Fatalf("WriteFile() source error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 511,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            511,
			AbsolutePath:       sourcePath,
			Container:          "mp3",
			Codec:              "mp3",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	actualDir := filepath.Join(dir, "511__aac_256")
	if err := os.MkdirAll(actualDir, 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(actualDir, "segment000.ts"), []byte("aac256"), 0644); err != nil {
		t.Fatalf("WriteFile() segment error = %v", err)
	}

	service := NewLocalPlaybackService(repo, &HLSCacheService{
		hlsDir:       dir,
		metadata:     NewHLSCacheMetadataStore(),
		metadataPath: filepath.Join(dir, "metadata.json"),
	})
	req := httptest.NewRequest("GET", "/segment000.ts", nil)
	rec := httptest.NewRecorder()

	err := service.StreamHLS(rec, req, "511")
	if err != ErrLocalPlaybackUnavailable {
		t.Fatalf("StreamHLS() error = %v, want %v when binding is missing", err, ErrLocalPlaybackUnavailable)
	}
}

func TestLocalPlaybackServiceStreamHLSQuerylessAssetUsesBoundActualVariant(t *testing.T) {
	dir := t.TempDir()
	sourcePath := filepath.Join(dir, "track.mp3")
	if err := os.WriteFile(sourcePath, []byte("source-audio"), 0644); err != nil {
		t.Fatalf("WriteFile() source error = %v", err)
	}

	repo := &stubLocalPlaybackRepo{
		media: &models.LocalMedia{
			ID:                 612,
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
		file: &models.LocalMediaFile{
			MediaID:            612,
			AbsolutePath:       sourcePath,
			Container:          "mp3",
			Codec:              "mp3",
			AvailabilityStatus: models.AvailabilityStatusAvailable,
		},
	}

	boundDir := filepath.Join(dir, "612__aac_192")
	if err := os.MkdirAll(boundDir, 0755); err != nil {
		t.Fatalf("MkdirAll() bound error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(boundDir, "segment000.ts"), []byte("bound-aac192"), 0644); err != nil {
		t.Fatalf("WriteFile() bound segment error = %v", err)
	}

	otherDir := filepath.Join(dir, "612__aac_320")
	if err := os.MkdirAll(otherDir, 0755); err != nil {
		t.Fatalf("MkdirAll() other error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(otherDir, "segment000.ts"), []byte("other-aac320"), 0644); err != nil {
		t.Fatalf("WriteFile() other segment error = %v", err)
	}

	cache := &HLSCacheService{
		hlsDir:          dir,
		metadata:        NewHLSCacheMetadataStore(),
		metadataPath:    filepath.Join(dir, "metadata.json"),
		resolvedVariant: make(map[string]localHLSVariantResolution),
	}
	cache.BindResolvedVariant("612", localHLSVariantResolution{
		requestedQuality:   "lossless",
		requestedVariant:   hlsVariantLossless,
		actualVariant:      hlsVariantAAC192,
		sourceQualityClass: localSourceQualityLossy,
		isDowngraded:       true,
		fallbackReason:     localHLSFallbackReasonSourceLossy,
	})

	service := NewLocalPlaybackService(repo, cache)
	req := httptest.NewRequest("GET", "/segment000.ts", nil)
	rec := httptest.NewRecorder()

	if err := service.StreamHLS(rec, req, "612"); err != nil {
		t.Fatalf("StreamHLS() error = %v", err)
	}
	if got := rec.Body.String(); got != "bound-aac192" {
		t.Fatalf("body = %q, want %q", got, "bound-aac192")
	}
}

func mustExtractQueryValue(t *testing.T, body string, prefix string) url.Values {
	t.Helper()

	start := strings.Index(body, prefix)
	if start < 0 {
		t.Fatalf("body %q missing prefix %q", body, prefix)
	}
	start += len(prefix)

	end := strings.IndexAny(body[start:], "\"\n")
	if end < 0 {
		end = len(body) - start
	}

	values, err := url.ParseQuery(body[start : start+end])
	if err != nil {
		t.Fatalf("ParseQuery() error = %v", err)
	}
	return values
}
