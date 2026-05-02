package services

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func TestBuildHLSConvertArgsMapsAudioOnly(t *testing.T) {
	args := buildHLSConvertArgs("input.m4a", hlsVariantAAC256, "segment%03d.ts", "playlist.m3u8")

	if !slices.Contains(args, "-map") {
		t.Fatalf("expected ffmpeg args to include -map: %v", args)
	}
	if !slices.Contains(args, "0:a:0") {
		t.Fatalf("expected ffmpeg args to map first audio stream only: %v", args)
	}
	if !slices.Contains(args, "-vn") {
		t.Fatalf("expected ffmpeg args to disable video streams: %v", args)
	}
}

func TestHLSCacheExistsRejectsOutdatedFormat(t *testing.T) {
	dir := t.TempDir()
	songID := "11"
	songDir := filepath.Join(dir, songID)
	if err := os.MkdirAll(songDir, 0755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}

	service := &HLSCacheService{
		hlsDir:   dir,
		metadata: NewHLSCacheMetadataStore(),
	}
	service.metadata.Set(songID, &HLSCacheMetadata{
		SongID:        songID,
		TotalSize:     1024,
		SegmentCount:  2,
		CachedAt:      time.Now(),
		LastAccessed:  time.Now(),
		FormatVersion: hlsVariantAAC256.formatVersion - 1,
	})

	if service.Exists(songID) {
		t.Fatalf("Exists(%q) = true, want false for outdated HLS cache format", songID)
	}
}

func TestBuildLosslessHLSConvertArgsUsesFLACAndFMP4(t *testing.T) {
	playlistPath := filepath.Join("tmp", "playlist.m3u8")
	args := buildHLSConvertArgs("input.flac", hlsVariantLossless, "segment%03d.m4s", playlistPath)

	if !slices.Contains(args, "flac") {
		t.Fatalf("expected ffmpeg args to use FLAC for lossless HLS: %v", args)
	}
	if !slices.Contains(args, "fmp4") {
		t.Fatalf("expected ffmpeg args to use fMP4 segments for lossless HLS: %v", args)
	}
	if !slices.Contains(args, "init.mp4") {
		t.Fatalf("expected ffmpeg args to include relative init filename for lossless HLS: %v", args)
	}
}

func TestVariantArtifactsReadyRejectsLosslessCacheMissingInit(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "playlist.m3u8"), []byte("#EXTM3U"), 0644); err != nil {
		t.Fatalf("WriteFile() playlist error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "segment000.m4s"), []byte("segment"), 0644); err != nil {
		t.Fatalf("WriteFile() segment error = %v", err)
	}

	if variantArtifactsReady(dir, hlsVariantLossless) {
		t.Fatalf("variantArtifactsReady() = true, want false when init.mp4 is missing")
	}
}

func TestVariantArtifactsReadyAcceptsCompleteLosslessCache(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "playlist.m3u8"), []byte("#EXTM3U"), 0644); err != nil {
		t.Fatalf("WriteFile() playlist error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "init.mp4"), []byte("init"), 0644); err != nil {
		t.Fatalf("WriteFile() init error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "segment000.m4s"), []byte("segment"), 0644); err != nil {
		t.Fatalf("WriteFile() segment error = %v", err)
	}

	if !variantArtifactsReady(dir, hlsVariantLossless) {
		t.Fatalf("variantArtifactsReady() = false, want true for complete lossless cache")
	}
}
