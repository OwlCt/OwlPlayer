package services

import (
	"context"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	unknownArtistName = "Unknown Artist"
	unknownAlbumTitle = "Unknown Album"
)

type LocalMediaScanner struct {
	repo             LocalLibraryScanRepository
	config           LocalMediaConfig
	supportedFormats map[string]localMediaFormat
	enhancer         *LocalMetadataEnhancer
	probeAudioInfo   func(context.Context, string) (*localAudioProbeResult, error)
}

type localMediaFormat struct {
	mimeType  string
	container string
	codec     string
}

func NewLocalMediaScanner(repo LocalLibraryScanRepository, config LocalMediaConfig) *LocalMediaScanner {
	return &LocalMediaScanner{
		repo:             repo,
		config:           config,
		supportedFormats: defaultLocalMediaFormats(),
		probeAudioInfo:   probeLocalAudioStreamInfo,
	}
}

func (s *LocalMediaScanner) SetMetadataEnhancer(enhancer *LocalMetadataEnhancer) {
	s.enhancer = enhancer
}

func (s *LocalMediaScanner) RunConfiguredStartupScan(ctx context.Context) error {
	switch s.config.ScanMode {
	case models.LibraryScanModeStartupFull:
		_, err := s.RunFullScan(ctx, "startup")
		return err
	case models.LibraryScanModeStartupIncremental:
		_, err := s.RunIncrementalScan(ctx, "startup")
		return err
	default:
		return nil
	}
}

func (s *LocalMediaScanner) RunFullScan(ctx context.Context, triggerSource string) ([]*models.MediaScanTask, error) {
	return s.runScan(ctx, models.LibraryScanModeStartupFull, triggerSource, true)
}

func (s *LocalMediaScanner) RunIncrementalScan(ctx context.Context, triggerSource string) ([]*models.MediaScanTask, error) {
	return s.runScan(ctx, models.LibraryScanModeStartupIncremental, triggerSource, false)
}

func (s *LocalMediaScanner) ListRecentScanTasks(ctx context.Context, limit int) ([]*models.MediaScanTask, error) {
	return s.repo.ListScanTasks(ctx, limit)
}

func (s *LocalMediaScanner) runScan(ctx context.Context, scanMode models.LibraryScanMode, triggerSource string, forceRefresh bool) ([]*models.MediaScanTask, error) {
	var tasks []*models.MediaScanTask
	var failures []string

	for _, root := range s.config.Roots {
		task, err := s.scanRoot(ctx, root, scanMode, triggerSource, forceRefresh)
		if task != nil {
			tasks = append(tasks, task)
		}
		if err != nil {
			failures = append(failures, fmt.Sprintf("%s: %v", root, err))
		}
	}

	if len(failures) > 0 {
		return tasks, fmt.Errorf("local media scan completed with errors: %s", strings.Join(failures, "; "))
	}
	return tasks, nil
}

func (s *LocalMediaScanner) scanRoot(ctx context.Context, root string, scanMode models.LibraryScanMode, triggerSource string, forceRefresh bool) (*models.MediaScanTask, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	if err := s.markStaleActiveTask(ctx, root); err != nil {
		return nil, err
	}

	task := &models.MediaScanTask{
		ScanMode:      scanMode,
		Status:        models.ScanTaskStatusQueued,
		LibraryRoot:   root,
		TriggerSource: triggerSource,
		Phase:         "queued",
		ScanContext: map[string]any{
			"cleanup_policy": string(s.config.CleanupPolicy),
			"root":           root,
		},
	}

	createdTask, err := s.repo.CreateScanTask(ctx, task)
	if err != nil {
		return nil, err
	}
	task = createdTask

	now := time.Now()
	task.Status = models.ScanTaskStatusRunning
	task.Phase = "discovering"
	task.StartedAt = &now
	if task, err = s.persistTask(ctx, task); err != nil {
		return task, err
	}

	existingFiles, err := s.repo.ListMediaFilesByLibraryRoot(ctx, root)
	if err != nil {
		return s.failTask(ctx, task, fmt.Errorf("list existing media files: %w", err))
	}

	existingByPath := make(map[string]*models.LocalMediaFile, len(existingFiles))
	for _, file := range existingFiles {
		existingByPath[pathKey(file.AbsolutePath)] = file
	}
	seenPaths := make(map[string]struct{}, len(existingFiles))

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			task.Errors++
			task.LastError = walkErr.Error()
			_, _ = s.persistTask(ctx, task)
			return nil
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		if !s.isSupportedAudioFile(path) {
			return nil
		}

		task.FilesDiscovered++
		task.Phase = "indexing"

		if err := s.indexFile(ctx, root, path, existingByPath, seenPaths, task, forceRefresh); err != nil {
			task.Errors++
			task.LastError = err.Error()
		}

		_, _ = s.persistTask(ctx, task)
		return nil
	})
	if walkErr != nil {
		return s.failTask(ctx, task, fmt.Errorf("walk media root: %w", walkErr))
	}

	task.Phase = "cleanup"
	if task, err = s.persistTask(ctx, task); err != nil {
		return task, err
	}

	for key, file := range existingByPath {
		if _, ok := seenPaths[key]; ok {
			continue
		}
		if err := s.handleMissingFile(ctx, file, task); err != nil {
			task.Errors++
			task.LastError = err.Error()
		}
	}

	completedAt := time.Now()
	task.CompletedAt = &completedAt
	task.Phase = "completed"
	switch {
	case task.Errors > 0 && (task.FilesIndexed > 0 || task.FilesUpdated > 0 || task.FilesUnavailable > 0):
		task.Status = models.ScanTaskStatusPartial
	case task.Errors > 0:
		task.Status = models.ScanTaskStatusFailed
	default:
		task.Status = models.ScanTaskStatusCompleted
	}

	task, err = s.persistTask(ctx, task)
	if err != nil {
		return task, err
	}

	log.Printf(
		"Local media scan finished for %s with status=%s discovered=%d indexed=%d updated=%d unavailable=%d errors=%d",
		root,
		task.Status,
		task.FilesDiscovered,
		task.FilesIndexed,
		task.FilesUpdated,
		task.FilesUnavailable,
		task.Errors,
	)

	if task.Status == models.ScanTaskStatusFailed {
		return task, fmt.Errorf("scan failed for %s", root)
	}
	return task, nil
}

func (s *LocalMediaScanner) indexFile(
	ctx context.Context,
	root string,
	absolutePath string,
	existingByPath map[string]*models.LocalMediaFile,
	seenPaths map[string]struct{},
	task *models.MediaScanTask,
	forceRefresh bool,
) error {
	info, err := os.Stat(absolutePath)
	if err != nil {
		return fmt.Errorf("stat %s: %w", absolutePath, err)
	}

	relativePath, err := filepath.Rel(root, absolutePath)
	if err != nil {
		return fmt.Errorf("calculate relative path for %s: %w", absolutePath, err)
	}

	key := pathKey(absolutePath)
	seenPaths[key] = struct{}{}
	existing := existingByPath[key]

	if existing != nil && !forceRefresh && existing.FileSizeBytes == info.Size() && existing.ModifiedAt.Equal(info.ModTime()) && existing.AvailabilityStatus == models.AvailabilityStatusAvailable {
		return nil
	}

	if existing != nil {
		return s.refreshExistingFile(ctx, root, relativePath, absolutePath, info, existing, task)
	}

	return s.createIndexedFile(ctx, root, relativePath, absolutePath, info, task)
}

func (s *LocalMediaScanner) refreshExistingFile(
	ctx context.Context,
	root string,
	relativePath string,
	absolutePath string,
	info os.FileInfo,
	existing *models.LocalMediaFile,
	task *models.MediaScanTask,
) error {
	media, err := s.repo.GetMediaByID(ctx, existing.MediaID)
	if err != nil {
		return fmt.Errorf("load media %d: %w", existing.MediaID, err)
	}
	if media == nil {
		return s.createIndexedFile(ctx, root, relativePath, absolutePath, info, task)
	}

	resolved, err := resolveLocalMetadata(root, absolutePath, relativePath)
	if err != nil {
		return fmt.Errorf("resolve local metadata %s: %w", absolutePath, err)
	}

	currentArtist, err := s.repo.GetArtistByID(ctx, media.PrimaryArtistID)
	if err != nil {
		return fmt.Errorf("load current artist %d: %w", media.PrimaryArtistID, err)
	}
	currentAlbum, err := s.repo.GetAlbumByID(ctx, media.AlbumID)
	if err != nil {
		return fmt.Errorf("load current album %d: %w", media.AlbumID, err)
	}

	artistName := resolvedStringValue(resolved.ArtistName, unknownArtistName)
	if keepExistingName(currentArtist, artistName) {
		artistName = currentArtist.Name
	}
	artist, err := s.getOrCreateArtist(ctx, artistName)
	if err != nil {
		return err
	}

	albumTitle := resolvedStringValue(resolved.AlbumTitle, unknownAlbumTitle)
	if keepExistingAlbum(currentAlbum, albumTitle, artist.ID) {
		albumTitle = currentAlbum.Title
	}
	album, err := s.getOrCreateAlbum(ctx, albumTitle, artist.ID)
	if err != nil {
		return err
	}

	applyResolvedMedia(ctx, s.repo, media, resolved)
	media.AlbumID = album.ID
	media.PrimaryArtistID = artist.ID
	media.AvailabilityStatus = models.AvailabilityStatusAvailable
	media, err = s.repo.SaveMedia(ctx, media)
	if err != nil {
		return fmt.Errorf("update media for %s: %w", absolutePath, err)
	}

	applyResolvedAlbum(ctx, s.repo, album, resolved)
	album.PrimaryArtistID = artist.ID
	album.AvailabilityStatus = models.AvailabilityStatusAvailable
	album, err = s.repo.SaveAlbum(ctx, album)
	if err != nil {
		return fmt.Errorf("update album for %s: %w", absolutePath, err)
	}

	applyResolvedArtist(ctx, s.repo, artist, resolved)
	artist.AvailabilityStatus = models.AvailabilityStatusAvailable
	artist, err = s.repo.SaveArtist(ctx, artist)
	if err != nil {
		return fmt.Errorf("update artist for %s: %w", absolutePath, err)
	}

	format := s.mediaFormatForPath(absolutePath)
	existing.LibraryRoot = root
	existing.RelativePath = relativePath
	existing.AbsolutePath = absolutePath
	existing.FileSizeBytes = info.Size()
	existing.ModifiedAt = info.ModTime()
	existing.MIMEType = format.mimeType
	existing.Container = format.container
	existing.Codec = format.codec
	existing.AvailabilityStatus = models.AvailabilityStatusAvailable
	s.populateMediaFileAudioInfo(ctx, existing)

	existing, err = s.repo.SaveMediaFile(ctx, existing)
	if err != nil {
		return fmt.Errorf("update media file %s: %w", absolutePath, err)
	}

	if err := s.persistResolvedMetadata(ctx, media, album, artist, existing, resolved); err != nil {
		return err
	}
	if currentAlbum != nil && currentAlbum.ID != 0 && currentAlbum.ID != album.ID {
		_ = s.repo.DeleteOrphanAlbums(ctx)
	}
	if currentArtist != nil && currentArtist.ID != 0 && currentArtist.ID != artist.ID {
		_ = s.repo.DeleteOrphanArtists(ctx)
	}

	s.enqueueMetadataEnhancement(media.ID)
	task.FilesUpdated++
	return nil
}

func (s *LocalMediaScanner) createIndexedFile(
	ctx context.Context,
	root string,
	relativePath string,
	absolutePath string,
	info os.FileInfo,
	task *models.MediaScanTask,
) error {
	resolved, err := resolveLocalMetadata(root, absolutePath, relativePath)
	if err != nil {
		return fmt.Errorf("resolve local metadata %s: %w", absolutePath, err)
	}

	artist, err := s.getOrCreateArtist(ctx, resolvedStringValue(resolved.ArtistName, unknownArtistName))
	if err != nil {
		return err
	}
	album, err := s.getOrCreateAlbum(ctx, resolvedStringValue(resolved.AlbumTitle, unknownAlbumTitle), artist.ID)
	if err != nil {
		return err
	}

	applyResolvedArtist(ctx, s.repo, artist, resolved)
	artist.AvailabilityStatus = models.AvailabilityStatusAvailable
	artist, err = s.repo.SaveArtist(ctx, artist)
	if err != nil {
		return fmt.Errorf("create artist metadata for %s: %w", absolutePath, err)
	}

	applyResolvedAlbum(ctx, s.repo, album, resolved)
	album.PrimaryArtistID = artist.ID
	album.AvailabilityStatus = models.AvailabilityStatusAvailable
	album, err = s.repo.SaveAlbum(ctx, album)
	if err != nil {
		return fmt.Errorf("create album metadata for %s: %w", absolutePath, err)
	}

	media := &models.LocalMedia{
		Title:              resolvedStringValue(resolved.Title, deriveTrackTitle(absolutePath)),
		NormalizedTitle:    normalizeText(resolvedStringValue(resolved.Title, deriveTrackTitle(absolutePath))),
		SortTitle:          resolvedStringValue(resolved.Title, deriveTrackTitle(absolutePath)),
		AlbumID:            album.ID,
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	}
	applyResolvedMedia(ctx, s.repo, media, resolved)
	media, err = s.repo.SaveMedia(ctx, media)
	if err != nil {
		return fmt.Errorf("create media for %s: %w", absolutePath, err)
	}

	format := s.mediaFormatForPath(absolutePath)
	file := &models.LocalMediaFile{
		MediaID:            media.ID,
		LibraryRoot:        root,
		RelativePath:       relativePath,
		AbsolutePath:       absolutePath,
		FileSizeBytes:      info.Size(),
		ModifiedAt:         info.ModTime(),
		MIMEType:           format.mimeType,
		Container:          format.container,
		Codec:              format.codec,
		IsPrimary:          true,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	}
	s.populateMediaFileAudioInfo(ctx, file)
	file, err = s.repo.SaveMediaFile(ctx, file)
	if err != nil {
		return fmt.Errorf("create media file for %s: %w", absolutePath, err)
	}

	if err := s.persistResolvedMetadata(ctx, media, album, artist, file, resolved); err != nil {
		return err
	}

	s.enqueueMetadataEnhancement(media.ID)
	task.FilesIndexed++
	return nil
}

func (s *LocalMediaScanner) populateMediaFileAudioInfo(ctx context.Context, file *models.LocalMediaFile) {
	if file == nil || s.probeAudioInfo == nil {
		return
	}
	shouldProbe := localAudioContainerIsAmbiguous(file) || localAudioInfoNeedsProbe(
		file,
		file.Codec,
		file.Bitrate,
		inferBitDepthFromCodec(file.Codec),
		file.SampleRate,
		file.Channels,
	)
	if !shouldProbe {
		return
	}

	probed, err := s.probeAudioInfo(ctx, file.AbsolutePath)
	if err != nil || probed == nil {
		if err != nil {
			log.Printf("Warning: failed to probe audio info for %s: %v", file.AbsolutePath, err)
		}
		if localAudioContainerIsAmbiguous(file) {
			file.Codec = ""
		}
		return
	}

	if strings.TrimSpace(probed.Codec) != "" {
		file.Codec = normalizeAudioCodec(probed.Codec)
	} else if localAudioContainerIsAmbiguous(file) {
		file.Codec = ""
	}
	if probed.Bitrate > 0 {
		file.Bitrate = probed.Bitrate
	}
	if probed.SampleRate > 0 {
		file.SampleRate = probed.SampleRate
	}
	if probed.Channels > 0 {
		file.Channels = probed.Channels
	}
}

func (s *LocalMediaScanner) handleMissingFile(ctx context.Context, file *models.LocalMediaFile, task *models.MediaScanTask) error {
	switch s.config.CleanupPolicy {
	case models.CleanupPolicyDeleteMissing:
		if err := s.repo.DeleteMediaFile(ctx, file.ID); err != nil {
			return fmt.Errorf("delete missing media file %s: %w", file.AbsolutePath, err)
		}
		if err := s.repo.DeleteMedia(ctx, file.MediaID); err != nil {
			return fmt.Errorf("delete missing media record %d: %w", file.MediaID, err)
		}
		if err := s.repo.DeleteOrphanAlbums(ctx); err != nil {
			return fmt.Errorf("delete orphan albums: %w", err)
		}
		if err := s.repo.DeleteOrphanArtists(ctx); err != nil {
			return fmt.Errorf("delete orphan artists: %w", err)
		}
	default:
		file.AvailabilityStatus = models.AvailabilityStatusUnavailable
		if _, err := s.repo.SaveMediaFile(ctx, file); err != nil {
			return fmt.Errorf("mark media file unavailable %s: %w", file.AbsolutePath, err)
		}

		media, err := s.repo.GetMediaByID(ctx, file.MediaID)
		if err != nil {
			return fmt.Errorf("load media %d for missing file: %w", file.MediaID, err)
		}
		if media != nil {
			media.AvailabilityStatus = models.AvailabilityStatusUnavailable
			if _, err := s.repo.SaveMedia(ctx, media); err != nil {
				return fmt.Errorf("mark media unavailable %d: %w", media.ID, err)
			}
		}
	}

	task.FilesUnavailable++
	return nil
}

func (s *LocalMediaScanner) getOrCreateArtist(ctx context.Context, name string) (*models.LocalArtist, error) {
	normalized := normalizeText(name)
	artist, err := s.repo.GetArtistByNormalizedName(ctx, normalized)
	if err != nil {
		return nil, fmt.Errorf("lookup artist %q: %w", name, err)
	}
	if artist != nil {
		if artist.AvailabilityStatus != models.AvailabilityStatusAvailable {
			artist.AvailabilityStatus = models.AvailabilityStatusAvailable
			return s.repo.SaveArtist(ctx, artist)
		}
		return artist, nil
	}

	artist, err = s.repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               name,
		NormalizedName:     normalized,
		SortName:           name,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		return nil, fmt.Errorf("create artist %q: %w", name, err)
	}
	return artist, nil
}

func (s *LocalMediaScanner) getOrCreateAlbum(ctx context.Context, title string, primaryArtistID int64) (*models.LocalAlbum, error) {
	normalized := normalizeText(title)
	album, err := s.repo.GetAlbumByNormalizedTitle(ctx, normalized, primaryArtistID)
	if err != nil {
		return nil, fmt.Errorf("lookup album %q: %w", title, err)
	}
	if album != nil {
		if album.AvailabilityStatus != models.AvailabilityStatusAvailable {
			album.AvailabilityStatus = models.AvailabilityStatusAvailable
			return s.repo.SaveAlbum(ctx, album)
		}
		return album, nil
	}

	album, err = s.repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              title,
		NormalizedTitle:    normalized,
		SortTitle:          title,
		PrimaryArtistID:    primaryArtistID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		return nil, fmt.Errorf("create album %q: %w", title, err)
	}
	return album, nil
}

func (s *LocalMediaScanner) markStaleActiveTask(ctx context.Context, root string) error {
	activeTask, err := s.repo.GetActiveScanTask(ctx, root)
	if err != nil {
		return fmt.Errorf("load active scan task for %s: %w", root, err)
	}
	if activeTask == nil {
		return nil
	}

	now := time.Now()
	activeTask.Status = models.ScanTaskStatusStale
	activeTask.Phase = "stale"
	activeTask.CompletedAt = &now
	if activeTask.LastError == "" {
		activeTask.LastError = "scan task superseded by a newer run"
	}
	_, err = s.repo.UpdateScanTask(ctx, activeTask)
	if err != nil {
		return fmt.Errorf("mark active scan task stale for %s: %w", root, err)
	}
	return nil
}

func (s *LocalMediaScanner) failTask(ctx context.Context, task *models.MediaScanTask, err error) (*models.MediaScanTask, error) {
	now := time.Now()
	task.Status = models.ScanTaskStatusFailed
	task.Phase = "failed"
	task.LastError = err.Error()
	task.CompletedAt = &now
	persisted, updateErr := s.persistTask(ctx, task)
	if updateErr != nil {
		return persisted, fmt.Errorf("%v; additionally failed to persist task state: %w", err, updateErr)
	}
	return persisted, err
}

func (s *LocalMediaScanner) persistTask(ctx context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	return s.repo.UpdateScanTask(ctx, task)
}

func (s *LocalMediaScanner) isSupportedAudioFile(path string) bool {
	_, ok := s.supportedFormats[strings.ToLower(filepath.Ext(path))]
	return ok
}

func (s *LocalMediaScanner) mediaFormatForPath(path string) localMediaFormat {
	if format, ok := s.supportedFormats[strings.ToLower(filepath.Ext(path))]; ok {
		return format
	}
	return localMediaFormat{}
}

func defaultLocalMediaFormats() map[string]localMediaFormat {
	return map[string]localMediaFormat{
		".aac":  {mimeType: "audio/aac", container: "aac", codec: "aac"},
		".alac": {mimeType: "audio/mp4", container: "mp4", codec: "alac"},
		".flac": {mimeType: "audio/flac", container: "flac", codec: "flac"},
		".m4a":  {mimeType: "audio/mp4", container: "mp4", codec: "aac"},
		".mp3":  {mimeType: "audio/mpeg", container: "mp3", codec: "mp3"},
		".ogg":  {mimeType: "audio/ogg", container: "ogg", codec: "vorbis"},
		".wav":  {mimeType: "audio/wav", container: "wav", codec: "pcm"},
	}
}

func deriveTrackTitle(path string) string {
	base := filepath.Base(path)
	ext := filepath.Ext(base)
	title := strings.TrimSpace(strings.TrimSuffix(base, ext))
	if title == "" {
		return "Unknown Track"
	}
	return title
}

func deriveArtistName(relativePath string) string {
	directory := filepath.Dir(relativePath)
	if directory == "." {
		return unknownArtistName
	}

	parts := splitPath(directory)
	switch len(parts) {
	case 0:
		return unknownArtistName
	case 1:
		return parts[0]
	default:
		return parts[len(parts)-2]
	}
}

func deriveAlbumTitle(relativePath string) string {
	directory := filepath.Dir(relativePath)
	if directory == "." {
		return unknownAlbumTitle
	}

	parts := splitPath(directory)
	if len(parts) == 0 {
		return unknownAlbumTitle
	}
	if len(parts) == 1 {
		return unknownAlbumTitle
	}
	return parts[len(parts)-1]
}

func splitPath(path string) []string {
	parts := strings.Split(filepath.Clean(path), string(filepath.Separator))
	filtered := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" || part == "." {
			continue
		}
		filtered = append(filtered, part)
	}
	return filtered
}

func normalizeText(value string) string {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" {
		return ""
	}

	replacer := strings.NewReplacer("_", " ", "-", " ")
	value = replacer.Replace(value)
	return strings.Join(strings.Fields(value), " ")
}

func pathKey(path string) string {
	clean := filepath.Clean(path)
	if runtime.GOOS == "windows" {
		return strings.ToLower(clean)
	}
	return clean
}
