package services

import (
	"context"
	"encoding/binary"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"
	"time"

	"main/models"
	"main/utils/ampapi"
)

func TestLocalMediaScannerRunFullScanIndexesSupportedFilesAndPersistsCompletedTask(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "Artist A", "Album A", "song-1.mp3"))
	writeTestFile(t, filepath.Join(root, "Artist A", "Album A", "song-2.flac"))
	writeTestFile(t, filepath.Join(root, "Artist A", "Album A", "cover.txt"))

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupFull,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	tasks, err := scanner.RunFullScan(context.Background(), "manual")
	if err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}

	task := tasks[0]
	if task.Status != models.ScanTaskStatusCompleted {
		t.Fatalf("expected task status completed, got %s", task.Status)
	}
	if task.FilesDiscovered != 2 {
		t.Fatalf("expected 2 discovered files, got %d", task.FilesDiscovered)
	}
	if task.FilesIndexed != 2 {
		t.Fatalf("expected 2 indexed files, got %d", task.FilesIndexed)
	}
	if task.Errors != 0 {
		t.Fatalf("expected 0 errors, got %d", task.Errors)
	}

	if len(repo.media) != 2 {
		t.Fatalf("expected 2 media records, got %d", len(repo.media))
	}
	if len(repo.files) != 2 {
		t.Fatalf("expected 2 media files, got %d", len(repo.files))
	}
	if len(repo.artists) != 1 {
		t.Fatalf("expected 1 artist, got %d", len(repo.artists))
	}
	if len(repo.albums) != 1 {
		t.Fatalf("expected 1 album, got %d", len(repo.albums))
	}
}

func TestLocalMediaScannerRunFullScanPersistsProbedAudioInfo(t *testing.T) {
	root := t.TempDir()
	songPath := filepath.Join(root, "Artist Probe", "Album Probe", "song-1.m4a")
	writeTestFile(t, songPath)

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupFull,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})
	scanner.probeAudioInfo = func(_ context.Context, absolutePath string) (*localAudioProbeResult, error) {
		if absolutePath != songPath {
			t.Fatalf("probeAudioInfo() path = %q, want %q", absolutePath, songPath)
		}
		return &localAudioProbeResult{
			Codec:      "alac",
			Bitrate:    921600,
			SampleRate: 96000,
			Channels:   2,
		}, nil
	}

	if _, err := scanner.RunFullScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}

	file, err := repo.GetMediaFileByAbsolutePath(context.Background(), songPath)
	if err != nil {
		t.Fatalf("GetMediaFileByAbsolutePath() error = %v", err)
	}
	if file == nil {
		t.Fatal("expected media file to be saved")
	}
	if file.Codec != "alac" || file.Bitrate != 921600 || file.SampleRate != 96000 || file.Channels != 2 {
		t.Fatalf("expected probed audio info to be persisted, got %#v", file)
	}
}

func TestLocalMediaScannerRunIncrementalScanUpdatesChangedFilesAndMarksMissingUnavailable(t *testing.T) {
	root := t.TempDir()
	song1 := filepath.Join(root, "Artist B", "Album B", "song-1.mp3")
	song2 := filepath.Join(root, "Artist B", "Album B", "song-2.mp3")
	writeTestFile(t, song1)
	writeTestFile(t, song2)

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupIncremental,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	if _, err := scanner.RunFullScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}

	writeTestFileWithTime(t, song1, time.Now().Add(2*time.Second))
	if err := os.Remove(song2); err != nil {
		t.Fatalf("Remove(%s) error = %v", song2, err)
	}
	writeTestFile(t, filepath.Join(root, "Artist B", "Album B", "song-3.m4a"))

	tasks, err := scanner.RunIncrementalScan(context.Background(), "manual")
	if err != nil {
		t.Fatalf("RunIncrementalScan() error = %v", err)
	}

	task := tasks[0]
	if task.Status != models.ScanTaskStatusCompleted {
		t.Fatalf("expected task status completed, got %s", task.Status)
	}
	if task.FilesIndexed != 1 {
		t.Fatalf("expected 1 indexed file, got %d", task.FilesIndexed)
	}
	if task.FilesUpdated != 1 {
		t.Fatalf("expected 1 updated file, got %d", task.FilesUpdated)
	}
	if task.FilesUnavailable != 1 {
		t.Fatalf("expected 1 unavailable file, got %d", task.FilesUnavailable)
	}

	missingFile, err := repo.GetMediaFileByAbsolutePath(context.Background(), song2)
	if err != nil {
		t.Fatalf("GetMediaFileByAbsolutePath() error = %v", err)
	}
	if missingFile == nil {
		t.Fatalf("expected missing file record to remain present")
	}
	if missingFile.AvailabilityStatus != models.AvailabilityStatusUnavailable {
		t.Fatalf("expected missing file to be unavailable, got %s", missingFile.AvailabilityStatus)
	}

	missingMedia, err := repo.GetMediaByID(context.Background(), missingFile.MediaID)
	if err != nil {
		t.Fatalf("GetMediaByID() error = %v", err)
	}
	if missingMedia == nil || missingMedia.AvailabilityStatus != models.AvailabilityStatusUnavailable {
		t.Fatalf("expected missing media to be unavailable, got %#v", missingMedia)
	}
}

func TestLocalMediaScannerRunIncrementalScanRefreshesProbedAudioInfo(t *testing.T) {
	root := t.TempDir()
	songPath := filepath.Join(root, "Artist Update", "Album Update", "song-1.m4a")
	writeTestFile(t, songPath)

	repo := newInMemoryLocalLibraryRepo()
	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupIncremental,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	probeBitrate := 256000
	scanner.probeAudioInfo = func(_ context.Context, _ string) (*localAudioProbeResult, error) {
		return &localAudioProbeResult{
			Codec:      "aac",
			Bitrate:    probeBitrate,
			SampleRate: 44100,
			Channels:   2,
		}, nil
	}

	if _, err := scanner.RunFullScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunFullScan() error = %v", err)
	}

	probeBitrate = 320000
	writeTestFileWithTime(t, songPath, time.Now().Add(2*time.Second))

	if _, err := scanner.RunIncrementalScan(context.Background(), "manual"); err != nil {
		t.Fatalf("RunIncrementalScan() error = %v", err)
	}

	file, err := repo.GetMediaFileByAbsolutePath(context.Background(), songPath)
	if err != nil {
		t.Fatalf("GetMediaFileByAbsolutePath() error = %v", err)
	}
	if file == nil {
		t.Fatal("expected updated media file")
	}
	if file.Bitrate != 320000 {
		t.Fatalf("expected refreshed bitrate 320000, got %d", file.Bitrate)
	}
}

func TestLocalMediaScannerMarksPreviousActiveTaskStaleBeforeNewRun(t *testing.T) {
	root := t.TempDir()
	writeTestFile(t, filepath.Join(root, "Artist C", "Album C", "song-1.mp3"))

	repo := newInMemoryLocalLibraryRepo()
	staleCandidate, err := repo.CreateScanTask(context.Background(), &models.MediaScanTask{
		ScanMode:      models.LibraryScanModeStartupIncremental,
		Status:        models.ScanTaskStatusRunning,
		LibraryRoot:   root,
		TriggerSource: "startup",
		Phase:         "indexing",
	})
	if err != nil {
		t.Fatalf("CreateScanTask() error = %v", err)
	}

	scanner := NewLocalMediaScanner(repo, LocalMediaConfig{
		Enabled:       true,
		Roots:         []string{root},
		ScanMode:      models.LibraryScanModeStartupIncremental,
		CleanupPolicy: models.CleanupPolicyMarkUnavailable,
	})

	tasks, err := scanner.RunIncrementalScan(context.Background(), "manual")
	if err != nil {
		t.Fatalf("RunIncrementalScan() error = %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task, got %d", len(tasks))
	}

	updatedStaleTask, err := repo.getTaskByID(staleCandidate.ID)
	if err != nil {
		t.Fatalf("getTaskByID() error = %v", err)
	}
	if updatedStaleTask.Status != models.ScanTaskStatusStale {
		t.Fatalf("expected stale task status, got %s", updatedStaleTask.Status)
	}
	if updatedStaleTask.CompletedAt == nil {
		t.Fatalf("expected stale task completed_at to be set")
	}

	if tasks[0].Status != models.ScanTaskStatusCompleted {
		t.Fatalf("expected replacement task completed, got %s", tasks[0].Status)
	}
}

func TestLocalMediaScannerUsesTagMetadataAndPersistsFieldSources(t *testing.T) {
	root := t.TempDir()
	songPath := filepath.Join(root, "Folder Artist", "Folder Album", "01 - fallback title.mp3")
	coverPath := filepath.Join(root, "Folder Artist", "Folder Album", "cover.jpg")

	writeTaggedMP3File(t, songPath, taggedMP3Input{
		title:       "Tagged Title",
		artist:      "Tagged Artist",
		album:       "Tagged Album",
		track:       "3/12",
		disc:        "1/2",
		composer:    "Tagged Composer",
		year:        "2024-02-03",
		lyrics:      "hello world",
		genres:      "Synthpop;Electronic",
		artworkData: []byte{0xff, 0xd8, 0xff, 0xdb},
	})
	writeTestFile(t, coverPath)

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

	if len(repo.media) != 1 {
		t.Fatalf("expected 1 media record, got %d", len(repo.media))
	}
	var media *models.LocalMedia
	for _, item := range repo.media {
		media = item
	}
	if media.Title != "Tagged Title" {
		t.Fatalf("expected tagged title, got %q", media.Title)
	}
	if media.TrackNumber != 3 || media.TrackTotal != 12 {
		t.Fatalf("expected track 3/12, got %d/%d", media.TrackNumber, media.TrackTotal)
	}
	if media.DiscNumber != 1 || media.DiscTotal != 2 {
		t.Fatalf("expected disc 1/2, got %d/%d", media.DiscNumber, media.DiscTotal)
	}
	if media.Composer != "Tagged Composer" {
		t.Fatalf("expected tagged composer, got %q", media.Composer)
	}
	if !media.LyricsAvailable {
		t.Fatalf("expected lyrics to be marked available")
	}

	artist := repo.artists[media.PrimaryArtistID]
	if artist == nil || artist.Name != "Tagged Artist" {
		t.Fatalf("expected tagged artist, got %#v", artist)
	}
	album := repo.albums[media.AlbumID]
	if album == nil || album.Title != "Tagged Album" {
		t.Fatalf("expected tagged album, got %#v", album)
	}
	if album.ArtworkPath == "" {
		t.Fatalf("expected artwork path to be persisted")
	}
	if _, err := os.Stat(album.ArtworkPath); err != nil {
		t.Fatalf("expected artwork file %s to exist: %v", album.ArtworkPath, err)
	}

	titleField, ok := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeMedia, media.ID, "title")]
	if !ok || titleField.Source != models.MetadataSourceTag {
		t.Fatalf("expected media title field from tag, got %#v", titleField)
	}
	artworkField, ok := repo.metadataFields[metadataFieldKey(models.LocalEntityTypeAlbum, album.ID, "artwork")]
	if !ok || artworkField.Source != models.MetadataSourceEmbeddedArt {
		t.Fatalf("expected album artwork field from embedded art, got %#v", artworkField)
	}
}

func TestScoreRemoteMatchCandidateRejectsWeakMatches(t *testing.T) {
	media := &models.LocalMedia{
		Title:       "Blue Skies",
		DurationMs:  180000,
		TrackNumber: 2,
	}
	album := &models.LocalAlbum{Title: "Morning Light"}
	artist := &models.LocalArtist{Name: "The Owls"}
	candidate := ampapi.SongRespData{}
	candidate.Attributes.Name = "Red Moon"
	candidate.Attributes.ArtistName = "Another Band"
	candidate.Attributes.AlbumName = "Nightfall"
	candidate.Attributes.DurationInMillis = 210000
	candidate.Attributes.TrackNumber = 8

	score := scoreRemoteMatchCandidate(media, album, artist, candidate)
	if score >= 0.4 {
		t.Fatalf("expected weak score, got %f", score)
	}
}

func TestScoreRemoteMatchCandidateRewardsStrongMatches(t *testing.T) {
	media := &models.LocalMedia{
		Title:       "Blue Skies",
		DurationMs:  180000,
		TrackNumber: 2,
	}
	album := &models.LocalAlbum{Title: "Morning Light"}
	artist := &models.LocalArtist{Name: "The Owls"}
	candidate := ampapi.SongRespData{}
	candidate.Attributes.Name = "Blue Skies"
	candidate.Attributes.ArtistName = "The Owls"
	candidate.Attributes.AlbumName = "Morning Light"
	candidate.Attributes.DurationInMillis = 180500
	candidate.Attributes.TrackNumber = 2

	score := scoreRemoteMatchCandidate(media, album, artist, candidate)
	if score < 0.95 {
		t.Fatalf("expected strong score, got %f", score)
	}
}

type inMemoryLocalLibraryRepo struct {
	nextArtistID int64
	nextAlbumID  int64
	nextMediaID  int64
	nextFileID   int64
	nextTaskID   int64
	nextFieldID  int64
	nextLyricsID int64

	artists        map[int64]*models.LocalArtist
	albums         map[int64]*models.LocalAlbum
	media          map[int64]*models.LocalMedia
	files          map[int64]*models.LocalMediaFile
	tasks          map[int64]*models.MediaScanTask
	metadataFields map[string]*models.MetadataField
	lyricsMappings map[int64]*models.LyricsMapping
}

func newInMemoryLocalLibraryRepo() *inMemoryLocalLibraryRepo {
	return &inMemoryLocalLibraryRepo{
		nextArtistID:   1,
		nextAlbumID:    1,
		nextMediaID:    1,
		nextFileID:     1,
		nextTaskID:     1,
		nextFieldID:    1,
		nextLyricsID:   1,
		artists:        make(map[int64]*models.LocalArtist),
		albums:         make(map[int64]*models.LocalAlbum),
		media:          make(map[int64]*models.LocalMedia),
		files:          make(map[int64]*models.LocalMediaFile),
		tasks:          make(map[int64]*models.MediaScanTask),
		metadataFields: make(map[string]*models.MetadataField),
		lyricsMappings: make(map[int64]*models.LyricsMapping),
	}
}

func (r *inMemoryLocalLibraryRepo) SaveArtist(_ context.Context, artist *models.LocalArtist) (*models.LocalArtist, error) {
	saved := *artist
	now := time.Now()
	if saved.ID == 0 {
		saved.ID = r.nextArtistID
		r.nextArtistID++
		saved.CreatedAt = now
	} else if existing, ok := r.artists[saved.ID]; ok {
		saved.CreatedAt = existing.CreatedAt
	}
	saved.UpdatedAt = now
	r.artists[saved.ID] = &saved
	return cloneArtist(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) GetArtistByID(_ context.Context, id int64) (*models.LocalArtist, error) {
	if artist, ok := r.artists[id]; ok {
		return cloneArtist(artist), nil
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) GetArtistByNormalizedName(_ context.Context, normalizedName string) (*models.LocalArtist, error) {
	for _, artist := range r.artists {
		if artist.NormalizedName == normalizedName {
			return cloneArtist(artist), nil
		}
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) SaveAlbum(_ context.Context, album *models.LocalAlbum) (*models.LocalAlbum, error) {
	saved := *album
	now := time.Now()
	if saved.ID == 0 {
		saved.ID = r.nextAlbumID
		r.nextAlbumID++
		saved.CreatedAt = now
	} else if existing, ok := r.albums[saved.ID]; ok {
		saved.CreatedAt = existing.CreatedAt
	}
	saved.UpdatedAt = now
	r.albums[saved.ID] = &saved
	return cloneAlbum(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) GetAlbumByID(_ context.Context, id int64) (*models.LocalAlbum, error) {
	if album, ok := r.albums[id]; ok {
		return cloneAlbum(album), nil
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) ListAlbumsByPrimaryArtistID(_ context.Context, artistID int64) ([]*models.LocalAlbum, error) {
	var albums []*models.LocalAlbum
	for _, album := range r.albums {
		if album.PrimaryArtistID == artistID {
			albums = append(albums, cloneAlbum(album))
		}
	}
	sort.Slice(albums, func(i, j int) bool {
		left := ""
		right := ""
		if albums[i].ReleaseDate != nil {
			left = albums[i].ReleaseDate.Format("2006-01-02")
		}
		if albums[j].ReleaseDate != nil {
			right = albums[j].ReleaseDate.Format("2006-01-02")
		}
		if left != right {
			return left > right
		}
		if albums[i].Title != albums[j].Title {
			return albums[i].Title < albums[j].Title
		}
		return albums[i].ID < albums[j].ID
	})
	return albums, nil
}

func (r *inMemoryLocalLibraryRepo) GetAlbumByNormalizedTitle(_ context.Context, normalizedTitle string, primaryArtistID int64) (*models.LocalAlbum, error) {
	for _, album := range r.albums {
		if album.NormalizedTitle == normalizedTitle && album.PrimaryArtistID == primaryArtistID {
			return cloneAlbum(album), nil
		}
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) SaveMedia(_ context.Context, media *models.LocalMedia) (*models.LocalMedia, error) {
	saved := *media
	now := time.Now()
	if saved.ID == 0 {
		saved.ID = r.nextMediaID
		r.nextMediaID++
		saved.CreatedAt = now
	} else if existing, ok := r.media[saved.ID]; ok {
		saved.CreatedAt = existing.CreatedAt
	}
	saved.UpdatedAt = now
	r.media[saved.ID] = &saved
	return cloneMedia(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) GetMediaByID(_ context.Context, id int64) (*models.LocalMedia, error) {
	if media, ok := r.media[id]; ok {
		return cloneMedia(media), nil
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) FindMediaByAlbumID(_ context.Context, albumID int64) ([]*models.LocalMedia, error) {
	var items []*models.LocalMedia
	for _, media := range r.media {
		if media.AlbumID == albumID {
			items = append(items, cloneMedia(media))
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].ID < items[j].ID })
	return items, nil
}

func (r *inMemoryLocalLibraryRepo) FindMediaByPrimaryArtistID(_ context.Context, artistID int64) ([]*models.LocalMedia, error) {
	var items []*models.LocalMedia
	for _, media := range r.media {
		if media.PrimaryArtistID == artistID {
			items = append(items, cloneMedia(media))
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if availabilityWeight(string(items[i].AvailabilityStatus)) != availabilityWeight(string(items[j].AvailabilityStatus)) {
			return availabilityWeight(string(items[i].AvailabilityStatus)) < availabilityWeight(string(items[j].AvailabilityStatus))
		}
		if items[i].AlbumID != items[j].AlbumID {
			return items[i].AlbumID < items[j].AlbumID
		}
		if items[i].DiscNumber != items[j].DiscNumber {
			return items[i].DiscNumber < items[j].DiscNumber
		}
		if items[i].TrackNumber != items[j].TrackNumber {
			return items[i].TrackNumber < items[j].TrackNumber
		}
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func (r *inMemoryLocalLibraryRepo) DeleteMedia(_ context.Context, id int64) error {
	delete(r.media, id)
	return nil
}

func (r *inMemoryLocalLibraryRepo) SaveMediaFile(_ context.Context, file *models.LocalMediaFile) (*models.LocalMediaFile, error) {
	saved := *file
	now := time.Now()
	if saved.ID == 0 {
		saved.ID = r.nextFileID
		r.nextFileID++
		saved.CreatedAt = now
	} else if existing, ok := r.files[saved.ID]; ok {
		saved.CreatedAt = existing.CreatedAt
	}
	saved.UpdatedAt = now
	r.files[saved.ID] = &saved
	return cloneMediaFile(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) GetMediaFileByID(_ context.Context, id int64) (*models.LocalMediaFile, error) {
	if file, ok := r.files[id]; ok {
		return cloneMediaFile(file), nil
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) GetMediaFileByAbsolutePath(_ context.Context, absolutePath string) (*models.LocalMediaFile, error) {
	for _, file := range r.files {
		if pathKey(file.AbsolutePath) == pathKey(absolutePath) {
			return cloneMediaFile(file), nil
		}
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) GetPrimaryMediaFileByMediaID(_ context.Context, mediaID int64) (*models.LocalMediaFile, error) {
	var selected *models.LocalMediaFile
	for _, file := range r.files {
		if file.MediaID != mediaID {
			continue
		}
		if selected == nil {
			selected = file
			continue
		}
		selectedAvailable := selected.AvailabilityStatus == models.AvailabilityStatusAvailable
		fileAvailable := file.AvailabilityStatus == models.AvailabilityStatusAvailable
		switch {
		case !selectedAvailable && fileAvailable:
			selected = file
		case selectedAvailable == fileAvailable && !selected.IsPrimary && file.IsPrimary:
			selected = file
		case selectedAvailable == fileAvailable && selected.IsPrimary == file.IsPrimary && file.ID < selected.ID:
			selected = file
		}
	}
	return cloneMediaFile(selected), nil
}

func (r *inMemoryLocalLibraryRepo) ListMediaFilesByLibraryRoot(_ context.Context, libraryRoot string) ([]*models.LocalMediaFile, error) {
	var files []*models.LocalMediaFile
	for _, file := range r.files {
		if file.LibraryRoot == libraryRoot {
			files = append(files, cloneMediaFile(file))
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].ID < files[j].ID })
	return files, nil
}

func (r *inMemoryLocalLibraryRepo) DeleteMediaFile(_ context.Context, id int64) error {
	delete(r.files, id)
	return nil
}

func (r *inMemoryLocalLibraryRepo) SaveMetadataField(_ context.Context, field *models.MetadataField) (*models.MetadataField, error) {
	saved := *field
	if saved.ID == 0 {
		saved.ID = r.nextFieldID
		r.nextFieldID++
		saved.CreatedAt = time.Now()
	}
	saved.UpdatedAt = time.Now()
	r.metadataFields[metadataFieldKey(saved.EntityType, saved.EntityID, saved.FieldName)] = &saved
	return cloneMetadataField(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) ListMetadataFields(_ context.Context, entityType models.LocalEntityType, entityID int64) ([]*models.MetadataField, error) {
	var fields []*models.MetadataField
	for _, field := range r.metadataFields {
		if field.EntityType == entityType && field.EntityID == entityID {
			fields = append(fields, cloneMetadataField(field))
		}
	}
	sort.Slice(fields, func(i, j int) bool { return fields[i].FieldName < fields[j].FieldName })
	return fields, nil
}

func (r *inMemoryLocalLibraryRepo) SaveLyricsMapping(_ context.Context, mapping *models.LyricsMapping) (*models.LyricsMapping, error) {
	saved := *mapping
	now := time.Now()
	if saved.ID == 0 {
		saved.ID = r.nextLyricsID
		r.nextLyricsID++
		saved.CreatedAt = now
	} else if existing, ok := r.lyricsMappings[saved.MediaID]; ok {
		saved.CreatedAt = existing.CreatedAt
	}
	saved.UpdatedAt = now
	r.lyricsMappings[saved.MediaID] = &saved
	return cloneLyricsMapping(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) GetLyricsMappingByMediaID(_ context.Context, mediaID int64) (*models.LyricsMapping, error) {
	if mapping, ok := r.lyricsMappings[mediaID]; ok {
		return cloneLyricsMapping(mapping), nil
	}
	return nil, nil
}

func (r *inMemoryLocalLibraryRepo) CreateScanTask(_ context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	saved := *task
	now := time.Now()
	saved.ID = r.nextTaskID
	r.nextTaskID++
	saved.CreatedAt = now
	saved.UpdatedAt = now
	r.tasks[saved.ID] = &saved
	return cloneTask(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) UpdateScanTask(_ context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	saved := *task
	if existing, ok := r.tasks[saved.ID]; ok {
		saved.CreatedAt = existing.CreatedAt
	}
	saved.UpdatedAt = time.Now()
	r.tasks[saved.ID] = &saved
	return cloneTask(&saved), nil
}

func (r *inMemoryLocalLibraryRepo) GetActiveScanTask(_ context.Context, libraryRoot string) (*models.MediaScanTask, error) {
	var latest *models.MediaScanTask
	for _, task := range r.tasks {
		if task.LibraryRoot != libraryRoot {
			continue
		}
		if task.Status != models.ScanTaskStatusQueued && task.Status != models.ScanTaskStatusRunning {
			continue
		}
		if latest == nil || task.ID > latest.ID {
			latest = task
		}
	}
	return cloneTask(latest), nil
}

func (r *inMemoryLocalLibraryRepo) ListScanTasks(_ context.Context, limit int) ([]*models.MediaScanTask, error) {
	var tasks []*models.MediaScanTask
	for _, task := range r.tasks {
		tasks = append(tasks, cloneTask(task))
	}
	sort.Slice(tasks, func(i, j int) bool { return tasks[i].ID > tasks[j].ID })
	if limit > 0 && len(tasks) > limit {
		tasks = tasks[:limit]
	}
	return tasks, nil
}

func (r *inMemoryLocalLibraryRepo) DeleteOrphanAlbums(_ context.Context) error {
	for albumID := range r.albums {
		hasMedia := false
		for _, media := range r.media {
			if media.AlbumID == albumID {
				hasMedia = true
				break
			}
		}
		if !hasMedia {
			delete(r.albums, albumID)
		}
	}
	return nil
}

func (r *inMemoryLocalLibraryRepo) DeleteOrphanArtists(_ context.Context) error {
	for artistID := range r.artists {
		hasMedia := false
		for _, media := range r.media {
			if media.PrimaryArtistID == artistID {
				hasMedia = true
				break
			}
		}
		if !hasMedia {
			delete(r.artists, artistID)
		}
	}
	return nil
}

func (r *inMemoryLocalLibraryRepo) getTaskByID(id int64) (*models.MediaScanTask, error) {
	if task, ok := r.tasks[id]; ok {
		return cloneTask(task), nil
	}
	return nil, nil
}

func writeTestFile(t *testing.T, path string) {
	t.Helper()
	writeTestFileWithTime(t, path, time.Now())
}

func writeTestFileWithTime(t *testing.T, path string, modTime time.Time) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", path, err)
	}
	if err := os.WriteFile(path, []byte("test-audio-content"), 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
	if err := os.Chtimes(path, modTime, modTime); err != nil {
		t.Fatalf("Chtimes(%s) error = %v", path, err)
	}
}

func cloneArtist(artist *models.LocalArtist) *models.LocalArtist {
	if artist == nil {
		return nil
	}
	cloned := *artist
	return &cloned
}

func cloneAlbum(album *models.LocalAlbum) *models.LocalAlbum {
	if album == nil {
		return nil
	}
	cloned := *album
	if album.ReleaseDate != nil {
		value := *album.ReleaseDate
		cloned.ReleaseDate = &value
	}
	return &cloned
}

func cloneMedia(media *models.LocalMedia) *models.LocalMedia {
	if media == nil {
		return nil
	}
	cloned := *media
	cloned.Genres = append([]string(nil), media.Genres...)
	if media.ReleaseDate != nil {
		value := *media.ReleaseDate
		cloned.ReleaseDate = &value
	}
	return &cloned
}

func cloneMediaFile(file *models.LocalMediaFile) *models.LocalMediaFile {
	if file == nil {
		return nil
	}
	cloned := *file
	return &cloned
}

func cloneTask(task *models.MediaScanTask) *models.MediaScanTask {
	if task == nil {
		return nil
	}
	cloned := *task
	if task.StartedAt != nil {
		value := *task.StartedAt
		cloned.StartedAt = &value
	}
	if task.CompletedAt != nil {
		value := *task.CompletedAt
		cloned.CompletedAt = &value
	}
	if task.ScanContext != nil {
		cloned.ScanContext = make(map[string]any, len(task.ScanContext))
		for key, value := range task.ScanContext {
			cloned.ScanContext[key] = value
		}
	}
	return &cloned
}

func cloneMetadataField(field *models.MetadataField) *models.MetadataField {
	if field == nil {
		return nil
	}
	cloned := *field
	if field.Details != nil {
		cloned.Details = make(map[string]any, len(field.Details))
		for key, value := range field.Details {
			cloned.Details[key] = value
		}
	}
	return &cloned
}

func cloneLyricsMapping(mapping *models.LyricsMapping) *models.LyricsMapping {
	if mapping == nil {
		return nil
	}
	cloned := *mapping
	if mapping.LastRequestedAt != nil {
		value := *mapping.LastRequestedAt
		cloned.LastRequestedAt = &value
	}
	if mapping.LastSyncedAt != nil {
		value := *mapping.LastSyncedAt
		cloned.LastSyncedAt = &value
	}
	return &cloned
}

func metadataFieldKey(entityType models.LocalEntityType, entityID int64, fieldName string) string {
	return string(entityType) + ":" + fieldName + ":" + strconv.FormatInt(entityID, 10)
}

type taggedMP3Input struct {
	title       string
	artist      string
	album       string
	track       string
	disc        string
	composer    string
	year        string
	lyrics      string
	genres      string
	artworkData []byte
}

func writeTaggedMP3File(t *testing.T, path string, input taggedMP3Input) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", path, err)
	}

	frames := [][]byte{
		buildID3TextFrame("TIT2", input.title),
		buildID3TextFrame("TPE1", input.artist),
		buildID3TextFrame("TALB", input.album),
		buildID3TextFrame("TRCK", input.track),
		buildID3TextFrame("TPOS", input.disc),
		buildID3TextFrame("TCOM", input.composer),
		buildID3TextFrame("TDRC", input.year),
		buildID3TextFrame("TCON", input.genres),
		buildID3LyricsFrame("USLT", input.lyrics),
		buildID3APICFrame(input.artworkData),
	}

	var body []byte
	for _, frame := range frames {
		body = append(body, frame...)
	}

	header := []byte{'I', 'D', '3', 0x03, 0x00, 0x00}
	header = append(header, encodeSyncSafe(len(body))...)
	tag := append(header, body...)
	tag = append(tag, []byte("fake-audio-data")...)

	if err := os.WriteFile(path, tag, 0o644); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", path, err)
	}
}

func buildID3TextFrame(id, value string) []byte {
	if value == "" {
		return nil
	}
	payload := append([]byte{0x03}, []byte(value)...)
	header := make([]byte, 10)
	copy(header[:4], []byte(id))
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
	return append(header, payload...)
}

func buildID3LyricsFrame(id, value string) []byte {
	if value == "" {
		return nil
	}
	payload := append([]byte{0x03}, []byte("eng")...)
	payload = append(payload, 0x00)
	payload = append(payload, []byte(value)...)
	header := make([]byte, 10)
	copy(header[:4], []byte(id))
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
	return append(header, payload...)
}

func buildID3APICFrame(image []byte) []byte {
	if len(image) == 0 {
		return nil
	}
	payload := []byte{0x03}
	payload = append(payload, []byte("image/jpeg")...)
	payload = append(payload, 0x00, 0x03, 0x00)
	payload = append(payload, image...)
	header := make([]byte, 10)
	copy(header[:4], []byte("APIC"))
	binary.BigEndian.PutUint32(header[4:8], uint32(len(payload)))
	return append(header, payload...)
}

func encodeSyncSafe(value int) []byte {
	return []byte{
		byte((value >> 21) & 0x7f),
		byte((value >> 14) & 0x7f),
		byte((value >> 7) & 0x7f),
		byte(value & 0x7f),
	}
}
