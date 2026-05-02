package services

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/OwlCt/OwlPlayer/models"
)

var (
	ErrLocalPlaybackNotFound    = errors.New("local playback target not found")
	ErrLocalPlaybackUnavailable = errors.New("local playback target unavailable")
	ErrInvalidPlaybackOption    = errors.New("invalid playback option")
)

type LocalPlaybackRepository interface {
	GetMediaByID(ctx context.Context, id int64) (*models.LocalMedia, error)
	SaveMedia(ctx context.Context, media *models.LocalMedia) (*models.LocalMedia, error)
	SaveMediaFile(ctx context.Context, file *models.LocalMediaFile) (*models.LocalMediaFile, error)
	GetPrimaryMediaFileByMediaID(ctx context.Context, mediaID int64) (*models.LocalMediaFile, error)
}

type LocalPlaybackService struct {
	repo            LocalPlaybackRepository
	hlsCache        *HLSCacheService
	probeCodec      func(context.Context, *models.LocalMediaFile) (string, error)
	startTranscode  func(context.Context, string, localTranscodeProfile) (*localTranscodeStream, error)
	transcodeToFile func(context.Context, string, localDownloadTranscodeProfile) (string, error)
}

func NewLocalPlaybackService(repo LocalPlaybackRepository, hlsCache *HLSCacheService) *LocalPlaybackService {
	return &LocalPlaybackService{
		repo:            repo,
		hlsCache:        hlsCache,
		probeCodec:      probeAudioCodec,
		startTranscode:  startFLACTranscode,
		transcodeToFile: transcodeAudioToFile,
	}
}

type localTranscodeStream struct {
	output io.ReadCloser
	wait   func() error
}

type localTranscodeProfile struct {
	key         string
	contentType string
	ffmpegArgs  []string
}

type localDownloadTranscodeProfile struct {
	key           string
	contentType   string
	fileExtension string
	ffmpegArgs    []string
}

var (
	localTranscodeProfileFLAC = localTranscodeProfile{
		key:         "flac",
		contentType: "audio/flac",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "flac",
			"-compression_level", "5",
			"-f", "flac",
			"pipe:1",
		},
	}
	localTranscodeProfileAAC320 = localTranscodeProfile{
		key:         "aac_320",
		contentType: "audio/aac",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "aac",
			"-b:a", "320k",
			"-f", "adts",
			"pipe:1",
		},
	}
	localTranscodeProfileAAC256 = localTranscodeProfile{
		key:         "aac_256",
		contentType: "audio/aac",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "aac",
			"-b:a", "256k",
			"-f", "adts",
			"pipe:1",
		},
	}
	localTranscodeProfileAAC192 = localTranscodeProfile{
		key:         "aac_192",
		contentType: "audio/aac",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "aac",
			"-b:a", "192k",
			"-f", "adts",
			"pipe:1",
		},
	}
	localDownloadTranscodeProfileFLAC = localDownloadTranscodeProfile{
		key:           "flac",
		contentType:   "audio/flac",
		fileExtension: ".flac",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "flac",
			"-compression_level", "5",
			"-f", "flac",
		},
	}
	localDownloadTranscodeProfileAAC320 = localDownloadTranscodeProfile{
		key:           "aac_320",
		contentType:   "audio/mp4",
		fileExtension: ".m4a",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "aac",
			"-b:a", "320k",
			"-movflags", "+faststart",
			"-f", "ipod",
		},
	}
	localDownloadTranscodeProfileAAC256 = localDownloadTranscodeProfile{
		key:           "aac_256",
		contentType:   "audio/mp4",
		fileExtension: ".m4a",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "aac",
			"-b:a", "256k",
			"-movflags", "+faststart",
			"-f", "ipod",
		},
	}
	localDownloadTranscodeProfileAAC192 = localDownloadTranscodeProfile{
		key:           "aac_192",
		contentType:   "audio/mp4",
		fileExtension: ".m4a",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c:a", "aac",
			"-b:a", "192k",
			"-movflags", "+faststart",
			"-f", "ipod",
		},
	}
	localDownloadTranscodeProfileCopyFaststart = localDownloadTranscodeProfile{
		key:           "copy_faststart",
		contentType:   "audio/mp4",
		fileExtension: ".m4a",
		ffmpegArgs: []string{
			"-map_metadata", "-1",
			"-vn",
			"-c", "copy",
			"-movflags", "+faststart",
			"-f", "ipod",
		},
	}
)

func (s *LocalPlaybackService) StreamDirect(w http.ResponseWriter, r *http.Request, mediaID string) error {
	media, file, err := s.resolvePlayableFile(r.Context(), mediaID)
	if err != nil {
		return err
	}

	requestedProfile, err := parseLocalTranscodeProfile(r.URL.Query().Get("transcode"))
	if err != nil {
		return err
	}

	mode, codec, err := s.resolveDirectPlaybackMode(r.Context(), file)
	if err != nil {
		return fmt.Errorf("resolve local playback mode: %w", err)
	}
	if isOfflineDownloadRequest(r) {
		return s.streamOfflineDownload(w, r, media, file, mediaID, mode, codec, requestedProfile)
	}
	if requestedProfile != nil {
		log.Printf("Local direct stream using requested transcode for media %s (profile=%s, path=%s)", mediaID, requestedProfile.key, file.AbsolutePath)
		return s.streamTranscoded(w, r, file.AbsolutePath, *requestedProfile)
	}
	if mode == "transcode" {
		profile := defaultAutoTranscodeProfile(file)
		log.Printf("Local direct stream using compatibility transcode for media %s (codec=%s, profile=%s, path=%s)", mediaID, codec, profile.key, file.AbsolutePath)
		return s.streamTranscoded(w, r, file.AbsolutePath, profile)
	}

	handle, err := os.Open(file.AbsolutePath)
	if err != nil {
		if markErr := s.markUnavailable(r.Context(), media, file); markErr != nil {
			log.Printf("mark unavailable after open failure for media %s: %v", mediaID, markErr)
		}
		return ErrLocalPlaybackUnavailable
	}
	defer handle.Close()

	info, err := handle.Stat()
	if err != nil {
		return fmt.Errorf("stat local media file: %w", err)
	}

	contentType := detectPlaybackContentType(file)
	return serveFileContent(w, r, handle, filepath.Base(file.AbsolutePath), info.ModTime(), contentType)
}

func parseLocalTranscodeProfile(raw string) (*localTranscodeProfile, error) {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "", "auto":
		return nil, nil
	case "flac":
		profile := localTranscodeProfileFLAC
		return &profile, nil
	case "aac_320":
		profile := localTranscodeProfileAAC320
		return &profile, nil
	case "aac_256":
		profile := localTranscodeProfileAAC256
		return &profile, nil
	case "aac_192":
		profile := localTranscodeProfileAAC192
		return &profile, nil
	default:
		return nil, ErrInvalidPlaybackOption
	}
}

func isOfflineDownloadRequest(r *http.Request) bool {
	return r.URL.Query().Get("download") == "1"
}

func resolveDownloadTranscodeProfile(profile *localTranscodeProfile) localDownloadTranscodeProfile {
	if profile == nil {
		return localDownloadTranscodeProfileAAC256
	}

	switch profile.key {
	case "flac":
		return localDownloadTranscodeProfileFLAC
	case "aac_320":
		return localDownloadTranscodeProfileAAC320
	case "aac_192":
		return localDownloadTranscodeProfileAAC192
	case "aac_256":
		fallthrough
	default:
		return localDownloadTranscodeProfileAAC256
	}
}

func serveFileContent(
	w http.ResponseWriter,
	r *http.Request,
	handle *os.File,
	name string,
	modTime time.Time,
	contentType string,
) error {
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "private, max-age=0, must-revalidate")
	http.ServeContent(w, r, name, modTime, handle)
	return nil
}

func (s *LocalPlaybackService) streamOfflineDownload(
	w http.ResponseWriter,
	r *http.Request,
	media *models.LocalMedia,
	file *models.LocalMediaFile,
	mediaID string,
	mode string,
	codec string,
	requestedProfile *localTranscodeProfile,
) error {
	if requestedProfile == nil && mode != "transcode" {
		// For M4A/MP4 files, apply faststart (copy without re-encoding) to ensure the
		// moov atom is at the front, making blob URL playback seekable in browsers.
		// For other formats (MP3, FLAC, etc.), serve directly - they are already seekable.
		ext := strings.ToLower(filepath.Ext(file.AbsolutePath))
		if ext == ".m4a" || ext == ".mp4" || ext == ".aac" {
			log.Printf("Local offline download applying faststart for media %s (path=%s)", mediaID, file.AbsolutePath)
			tempPath, convertErr := s.transcodeToFile(r.Context(), file.AbsolutePath, localDownloadTranscodeProfileCopyFaststart)
			if convertErr == nil {
				handle, openErr := os.Open(tempPath)
				if openErr != nil {
					_ = os.Remove(tempPath)
				} else {
					info, statErr := handle.Stat()
					if statErr != nil {
						_ = handle.Close()
						_ = os.Remove(tempPath)
					} else {
						serveErr := serveFileContent(w, r, handle, filepath.Base(tempPath), info.ModTime(), "audio/mp4")
						closeErr := handle.Close()
						removeErr := os.Remove(tempPath)
						if serveErr != nil {
							return serveErr
						}
						if closeErr != nil {
							return fmt.Errorf("close faststart output: %w", closeErr)
						}
						if removeErr != nil && !os.IsNotExist(removeErr) {
							log.Printf("remove faststart temp file failed for %s: %v", mediaID, removeErr)
						}
						return nil
					}
				}
			} else {
				log.Printf("Local offline download faststart conversion failed for %s, serving original: %v", mediaID, convertErr)
			}
		}

		handle, err := os.Open(file.AbsolutePath)
		if err != nil {
			if markErr := s.markUnavailable(r.Context(), media, file); markErr != nil {
				log.Printf("mark unavailable after open failure for media %s: %v", mediaID, markErr)
			}
			return ErrLocalPlaybackUnavailable
		}
		defer handle.Close()

		info, err := handle.Stat()
		if err != nil {
			return fmt.Errorf("stat local media file: %w", err)
		}

		log.Printf("Local offline download serving original media %s (path=%s)", mediaID, file.AbsolutePath)
		return serveFileContent(
			w,
			r,
			handle,
			filepath.Base(file.AbsolutePath),
			info.ModTime(),
			detectPlaybackContentType(file),
		)
	}

	downloadProfile := resolveDownloadTranscodeProfile(requestedProfile)
	if requestedProfile != nil {
		log.Printf("Local offline download using requested packaged transcode for media %s (profile=%s, path=%s)", mediaID, downloadProfile.key, file.AbsolutePath)
	} else {
		log.Printf("Local offline download using compatibility packaged transcode for media %s (codec=%s, profile=%s, path=%s)", mediaID, codec, downloadProfile.key, file.AbsolutePath)
	}

	tempPath, err := s.transcodeToFile(r.Context(), file.AbsolutePath, downloadProfile)
	if err != nil {
		return fmt.Errorf("transcode offline download: %w", err)
	}

	handle, err := os.Open(tempPath)
	if err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("open offline transcode output: %w", err)
	}

	info, err := handle.Stat()
	if err != nil {
		_ = handle.Close()
		_ = os.Remove(tempPath)
		return fmt.Errorf("stat offline transcode output: %w", err)
	}

	serveErr := serveFileContent(
		w,
		r,
		handle,
		filepath.Base(tempPath),
		info.ModTime(),
		downloadProfile.contentType,
	)
	closeErr := handle.Close()
	removeErr := os.Remove(tempPath)
	if serveErr != nil {
		return serveErr
	}
	if closeErr != nil {
		return fmt.Errorf("close offline transcode output: %w", closeErr)
	}
	if removeErr != nil && !os.IsNotExist(removeErr) {
		return fmt.Errorf("remove offline transcode output: %w", removeErr)
	}
	return nil
}

func (s *LocalPlaybackService) StreamHLS(w http.ResponseWriter, r *http.Request, mediaID string) error {
	if s.hlsCache == nil {
		return ErrLocalPlaybackUnavailable
	}

	_, file, err := s.resolvePlayableFile(r.Context(), mediaID)
	if err != nil {
		return err
	}
	requestPath := strings.TrimPrefix(r.URL.Path, "/")
	rawQuality := r.URL.Query().Get("quality")
	resolution, err := s.resolveRequestedHLSVariant(r.Context(), mediaID, file, requestPath, rawQuality)
	if err != nil {
		return err
	}
	log.Printf(
		"Local HLS variant resolved for media %s: path=%q quality=%q requested=%s actual=%s source=%s downgraded=%t fallback=%q",
		mediaID,
		requestPath,
		rawQuality,
		resolution.requestedQuality,
		resolution.actualVariant.key,
		resolution.sourceQualityClass,
		resolution.isDowngraded,
		resolution.fallbackReason,
	)

	if requestPath == "" || requestPath == "playlist.m3u8" {
		if resolution.requestedVariant.key == hlsVariantLossless.key && resolution.actualVariant.key != hlsVariantLossless.key {
			if err := s.hlsCache.DeleteVariant(mediaID, hlsVariantLossless); err != nil {
				log.Printf("remove stale pseudo-lossless cache for media %s: %v", mediaID, err)
			}
		}
		if !s.hlsCache.ExistsVariant(mediaID, resolution.actualVariant) {
			if err := s.hlsCache.ConvertToHLSVariant(mediaID, file.AbsolutePath, resolution.actualVariant); err != nil {
				return fmt.Errorf("generate local HLS output: %w", err)
			}
		}
		s.hlsCache.BindResolvedVariant(mediaID, resolution)
		if err := s.hlsCache.UpdateAccessTimeVariant(mediaID, resolution.actualVariant); err != nil {
			log.Printf("update HLS access time for media %s: %v", mediaID, err)
		}
		return s.serveHLSPlaylist(w, r, mediaID, resolution)
	}

	s.hlsCache.BindResolvedVariant(mediaID, resolution)
	if err := s.hlsCache.UpdateAccessTimeVariant(mediaID, resolution.actualVariant); err != nil {
		log.Printf("update HLS access time for media %s: %v", mediaID, err)
	}

	segmentName := filepath.Base(requestPath)
	segmentPath := filepath.Join(s.hlsCache.GetVariantPath(mediaID, resolution.actualVariant), segmentName)
	if _, err := os.Stat(segmentPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrLocalPlaybackUnavailable
		}
		return fmt.Errorf("stat HLS segment: %w", err)
	}

	switch strings.ToLower(filepath.Ext(segmentName)) {
	case ".m4s", ".mp4":
		w.Header().Set("Content-Type", "audio/mp4")
	default:
		w.Header().Set("Content-Type", resolution.actualVariant.segmentMimeType)
	}
	w.Header().Set("Cache-Control", "private, max-age=3600")
	http.ServeFile(w, r, segmentPath)
	return nil
}

func (s *LocalPlaybackService) resolveRequestedHLSVariant(
	ctx context.Context,
	mediaID string,
	file *models.LocalMediaFile,
	requestPath string,
	rawQuality string,
) (localHLSVariantResolution, error) {
	if strings.TrimSpace(rawQuality) == "" && requestPath != "" && requestPath != "playlist.m3u8" {
		if bound, ok := s.hlsCache.GetResolvedVariant(mediaID); ok {
			return bound, nil
		}
		return localHLSVariantResolution{}, ErrLocalPlaybackUnavailable
	}

	requestedVariant, err := resolveHLSVariant(rawQuality)
	if err != nil {
		return localHLSVariantResolution{}, err
	}

	codec, sourceQualityClass, err := s.resolveSourceCodecAndQuality(ctx, file)
	if err != nil {
		return localHLSVariantResolution{}, err
	}
	_ = codec

	return resolveLocalHLSVariant(requestedVariant, sourceQualityClass, file.Bitrate), nil
}

func (s *LocalPlaybackService) resolveSourceCodecAndQuality(
	ctx context.Context,
	file *models.LocalMediaFile,
) (string, localSourceQualityClass, error) {
	codec := normalizeAudioCodec(codecHintForFile(file))
	sourceQualityClass := localSourceQualityClassFromFile(file)
	if !localSourceQualityNeedsProbe(file, codec) {
		return codec, sourceQualityClass, nil
	}

	if s != nil && s.probeCodec != nil {
		probedCodec, err := s.probeCodec(ctx, file)
		if err != nil {
			log.Printf("Local playback codec probe failed for %s: %v", file.AbsolutePath, err)
			if localAudioContainerIsAmbiguous(file) {
				return codec, localSourceQualityUnknown, nil
			}
			return codec, sourceQualityClass, nil
		}

		probedCodec = normalizeAudioCodec(probedCodec)
		if probedCodec != "" {
			codec = probedCodec
			sourceQualityClass = classifyLocalSourceQuality(probedCodec)
		} else if localAudioContainerIsAmbiguous(file) {
			sourceQualityClass = localSourceQualityUnknown
		}
	}

	return codec, sourceQualityClass, nil
}

func (s *LocalPlaybackService) serveHLSPlaylist(
	w http.ResponseWriter,
	r *http.Request,
	mediaID string,
	resolution localHLSVariantResolution,
) error {
	playlistPath := filepath.Join(s.hlsCache.GetVariantPath(mediaID, resolution.actualVariant), "playlist.m3u8")
	data, err := os.ReadFile(playlistPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrLocalPlaybackUnavailable
		}
		return fmt.Errorf("read local HLS playlist: %w", err)
	}

	lines := strings.Split(string(data), "\n")
	modified := make([]string, 0, len(lines))
	querySuffix := rewriteHLSQueryForActualVariant("", resolution.actualVariant)
	if r != nil && r.URL != nil {
		querySuffix = rewriteHLSQueryForActualVariant(r.URL.RawQuery, resolution.actualVariant)
	}
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, `URI="`) {
			modified = append(modified, rewriteHLSURIAttribute(line, mediaID, querySuffix))
			continue
		}
		if isRewritableHLSMediaReference(trimmed) {
			modified = append(modified, fmt.Sprintf("/api/stream/%s/%s%s", mediaID, hlsMediaReferenceName(trimmed), querySuffix))
			continue
		}
		modified = append(modified, line)
	}

	w.Header().Set("Content-Type", "application/vnd.apple.mpegurl")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("X-Owl-HLS-Resolved-Variant", resolution.actualVariant.key)
	_, _ = w.Write([]byte(strings.Join(modified, "\n")))
	return nil
}

func isRewritableHLSMediaReference(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" || strings.HasPrefix(line, "#") {
		return false
	}

	lower := strings.ToLower(line)
	if strings.HasPrefix(lower, "http://") ||
		strings.HasPrefix(lower, "https://") ||
		strings.HasPrefix(lower, "//") ||
		strings.HasPrefix(lower, "data:") ||
		strings.HasPrefix(lower, "blob:") {
		return false
	}

	ext := strings.ToLower(path.Ext(normalizeHLSReferencePath(line)))
	return ext == ".ts" || ext == ".m4s" || ext == ".mp4"
}

func rewriteHLSURIAttribute(line string, mediaID string, querySuffix string) string {
	const marker = `URI="`
	start := strings.Index(line, marker)
	if start < 0 {
		return line
	}
	start += len(marker)
	end := strings.Index(line[start:], `"`)
	if end < 0 {
		return line
	}
	end += start
	target := line[start:end]
	if !isRewritableHLSMediaReference(target) {
		return line
	}
	replacement := fmt.Sprintf("/api/stream/%s/%s%s", mediaID, hlsMediaReferenceName(target), querySuffix)
	return line[:start] + replacement + line[end:]
}

func rewriteHLSQueryForActualVariant(rawQuery string, actualVariant hlsVariant) string {
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		values = url.Values{}
	}
	values.Del("transcode")
	values.Set("quality", actualVariant.key)
	encoded := values.Encode()
	if encoded == "" {
		return ""
	}
	return "?" + encoded
}

func hlsMediaReferenceName(target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return target
	}

	base := path.Base(normalizeHLSReferencePath(target))
	if base == "." || base == "/" {
		return target
	}

	return base
}

func normalizeHLSReferencePath(target string) string {
	target = strings.TrimSpace(target)
	if cut := strings.IndexAny(target, "?#"); cut >= 0 {
		target = target[:cut]
	}
	return strings.ReplaceAll(target, "\\", "/")
}

func (s *LocalPlaybackService) resolvePlayableFile(ctx context.Context, mediaID string) (*models.LocalMedia, *models.LocalMediaFile, error) {
	if s == nil || s.repo == nil {
		return nil, nil, ErrLocalPlaybackUnavailable
	}

	parsedID, err := strconv.ParseInt(mediaID, 10, 64)
	if err != nil {
		return nil, nil, ErrLocalPlaybackNotFound
	}

	media, err := s.repo.GetMediaByID(ctx, parsedID)
	if err != nil {
		return nil, nil, err
	}
	if media == nil {
		return nil, nil, ErrLocalPlaybackNotFound
	}

	file, err := s.repo.GetPrimaryMediaFileByMediaID(ctx, parsedID)
	if err != nil {
		return nil, nil, err
	}
	if file == nil {
		return nil, nil, ErrLocalPlaybackUnavailable
	}
	if media.AvailabilityStatus != models.AvailabilityStatusAvailable || file.AvailabilityStatus != models.AvailabilityStatusAvailable {
		return nil, nil, ErrLocalPlaybackUnavailable
	}
	if file.AbsolutePath == "" {
		return nil, nil, ErrLocalPlaybackUnavailable
	}
	if _, err := os.Stat(file.AbsolutePath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			if markErr := s.markUnavailable(ctx, media, file); markErr != nil {
				log.Printf("mark unavailable after missing local file for media %s: %v", mediaID, markErr)
			}
			return nil, nil, ErrLocalPlaybackUnavailable
		}
		return nil, nil, fmt.Errorf("stat local media file: %w", err)
	}

	return media, file, nil
}

func (s *LocalPlaybackService) markUnavailable(ctx context.Context, media *models.LocalMedia, file *models.LocalMediaFile) error {
	if s == nil || s.repo == nil {
		return nil
	}

	if file != nil && file.AvailabilityStatus != models.AvailabilityStatusUnavailable {
		file.AvailabilityStatus = models.AvailabilityStatusUnavailable
		if _, err := s.repo.SaveMediaFile(ctx, file); err != nil {
			return err
		}
	}

	if media != nil && media.AvailabilityStatus != models.AvailabilityStatusUnavailable {
		media.AvailabilityStatus = models.AvailabilityStatusUnavailable
		if _, err := s.repo.SaveMedia(ctx, media); err != nil {
			return err
		}
	}

	return nil
}

func detectPlaybackContentType(file *models.LocalMediaFile) string {
	if file != nil && file.MIMEType != "" {
		return file.MIMEType
	}
	if file != nil {
		if byExt := mime.TypeByExtension(filepath.Ext(file.AbsolutePath)); byExt != "" {
			return byExt
		}
	}
	return "application/octet-stream"
}

func (s *LocalPlaybackService) resolveDirectPlaybackMode(ctx context.Context, file *models.LocalMediaFile) (string, string, error) {
	codec, sourceQualityClass, err := s.resolveSourceCodecAndQuality(ctx, file)
	if err != nil {
		return "", "", err
	}
	if codecRequiresTranscode(codec) {
		return "transcode", codec, nil
	}
	if sourceQualityClass == localSourceQualityUnknown && fileHasAmbiguousBrowserSupport(file) {
		return "transcode", codec, nil
	}
	return "direct", codec, nil
}

func (s *LocalPlaybackService) streamTranscoded(w http.ResponseWriter, r *http.Request, sourcePath string, profile localTranscodeProfile) error {
	if s == nil || s.startTranscode == nil {
		return ErrLocalPlaybackUnavailable
	}

	stream, err := s.startTranscode(r.Context(), sourcePath, profile)
	if err != nil {
		return fmt.Errorf("start live transcode: %w", err)
	}
	defer stream.output.Close()

	firstChunk := make([]byte, 32*1024)
	n, readErr := stream.output.Read(firstChunk)
	if n == 0 {
		waitErr := stream.wait()
		switch {
		case waitErr != nil:
			return fmt.Errorf("ffmpeg live transcode failed: %w", waitErr)
		case readErr != nil && !errors.Is(readErr, io.EOF):
			return fmt.Errorf("read transcoded audio: %w", readErr)
		default:
			return ErrLocalPlaybackUnavailable
		}
	}
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return fmt.Errorf("read transcoded audio: %w", readErr)
	}

	w.Header().Set("Content-Type", profile.contentType)
	w.Header().Set("Accept-Ranges", "none")
	w.Header().Set("Cache-Control", "private, no-store")

	if _, err := w.Write(firstChunk[:n]); err != nil {
		if isClientDisconnectError(err) || r.Context().Err() != nil {
			return nil
		}
		return fmt.Errorf("write transcoded audio: %w", err)
	}

	if flusher, ok := w.(http.Flusher); ok {
		flusher.Flush()
	}

	if readErr == nil {
		if _, err := io.Copy(w, stream.output); err != nil {
			if isClientDisconnectError(err) || r.Context().Err() != nil {
				return nil
			}
			log.Printf("Local live transcode stream copy failed for %s: %v", sourcePath, err)
			return nil
		}
	}

	if err := stream.wait(); err != nil {
		if r.Context().Err() != nil {
			return nil
		}
		log.Printf("Local live transcode exited with error for %s: %v", sourcePath, err)
	}
	return nil
}

func codecRequiresTranscode(codec string) bool {
	switch normalizeAudioCodec(codec) {
	case "alac", "apple lossless", "flac", "pcm":
		return true
	default:
		return false
	}
}

func defaultAutoTranscodeProfile(file *models.LocalMediaFile) localTranscodeProfile {
	// Match the old downloader project's playback bias: prefer a browser-safe AAC
	// output for automatic compatibility fallback, while still allowing explicit
	// FLAC selection via `?transcode=flac`.
	return localTranscodeProfileAAC320
}

func probeAudioCodec(ctx context.Context, file *models.LocalMediaFile) (string, error) {
	if file == nil || file.AbsolutePath == "" {
		return "", nil
	}

	cmd := exec.CommandContext(
		ctx,
		"ffprobe",
		"-v", "error",
		"-select_streams", "a:0",
		"-show_entries", "stream=codec_name",
		"-of", "default=noprint_wrappers=1:nokey=1",
		file.AbsolutePath,
	)

	output, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func startFLACTranscode(ctx context.Context, sourcePath string, profile localTranscodeProfile) (*localTranscodeStream, error) {
	args := []string{
		"-v", "error",
		"-nostdin",
		"-i", sourcePath,
	}
	args = append(args, profile.ffmpegArgs...)
	cmd := exec.CommandContext(ctx, "ffmpeg", args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	var stderrBuffer bytes.Buffer
	done := make(chan struct{})
	go func() {
		_, _ = io.Copy(&stderrBuffer, stderr)
		close(done)
	}()

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return &localTranscodeStream{
		output: stdout,
		wait: func() error {
			err := cmd.Wait()
			<-done
			if err != nil {
				message := strings.TrimSpace(stderrBuffer.String())
				if message != "" {
					return fmt.Errorf("%w: %s", err, message)
				}
				return err
			}
			return nil
		},
	}, nil
}

func transcodeAudioToFile(ctx context.Context, sourcePath string, profile localDownloadTranscodeProfile) (string, error) {
	tempFile, err := os.CreateTemp("", "owlplayer-offline-*"+profile.fileExtension)
	if err != nil {
		return "", err
	}
	tempPath := tempFile.Name()
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		return "", err
	}

	args := []string{
		"-v", "error",
		"-nostdin",
		"-y",
		"-i", sourcePath,
	}
	args = append(args, profile.ffmpegArgs...)
	args = append(args, tempPath)

	cmd := exec.CommandContext(ctx, "ffmpeg", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		_ = os.Remove(tempPath)
		message := strings.TrimSpace(string(output))
		if message != "" {
			return "", fmt.Errorf("%w: %s", err, message)
		}
		return "", err
	}

	return tempPath, nil
}

func isClientDisconnectError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "broken pipe") || strings.Contains(message, "connection reset by peer")
}
