package models

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/lib/pq"
)

type LocalEntityType string

const (
	LocalEntityTypeArtist    LocalEntityType = "artist"
	LocalEntityTypeAlbum     LocalEntityType = "album"
	LocalEntityTypeMedia     LocalEntityType = "media"
	LocalEntityTypeMediaFile LocalEntityType = "media_file"
	LocalEntityTypeLyricsMap LocalEntityType = "lyrics_mapping"
	LocalEntityTypeScanTask  LocalEntityType = "scan_task"
)

type MetadataSource string

const (
	MetadataSourceTag         MetadataSource = "tag"
	MetadataSourceEmbeddedArt MetadataSource = "embedded_art"
	MetadataSourceDirectory   MetadataSource = "directory"
	MetadataSourceFilename    MetadataSource = "filename"
	MetadataSourceRemote      MetadataSource = "remote"
	MetadataSourceManual      MetadataSource = "manual"
	MetadataSourceSystem      MetadataSource = "system"
	MetadataSourceScan        MetadataSource = "scan"
)

type AvailabilityStatus string

const (
	AvailabilityStatusAvailable   AvailabilityStatus = "available"
	AvailabilityStatusUnavailable AvailabilityStatus = "unavailable"
	AvailabilityStatusStale       AvailabilityStatus = "stale"
)

type LibraryScanMode string

const (
	LibraryScanModeManual             LibraryScanMode = "manual"
	LibraryScanModeStartupFull        LibraryScanMode = "startup-full"
	LibraryScanModeStartupIncremental LibraryScanMode = "startup-incremental"
	LibraryScanModeScheduled          LibraryScanMode = "scheduled"
)

type CleanupPolicy string

const (
	CleanupPolicyMarkUnavailable CleanupPolicy = "mark-unavailable"
	CleanupPolicyDeleteMissing   CleanupPolicy = "delete-missing"
)

type LyricsSource string

const (
	LyricsSourceAppleMusic LyricsSource = "apple_music"
	LyricsSourceManual     LyricsSource = "manual"
	LyricsSourceDisabled   LyricsSource = "disabled"
)

type LyricsMappingStatus string

const (
	LyricsMappingStatusUnmatched LyricsMappingStatus = "unmatched"
	LyricsMappingStatusMatched   LyricsMappingStatus = "matched"
	LyricsMappingStatusAvailable LyricsMappingStatus = "available"
	LyricsMappingStatusError     LyricsMappingStatus = "error"
	LyricsMappingStatusDisabled  LyricsMappingStatus = "disabled"
)

type ScanTaskStatus string

const (
	ScanTaskStatusQueued    ScanTaskStatus = "queued"
	ScanTaskStatusRunning   ScanTaskStatus = "running"
	ScanTaskStatusCompleted ScanTaskStatus = "completed"
	ScanTaskStatusFailed    ScanTaskStatus = "failed"
	ScanTaskStatusPartial   ScanTaskStatus = "partial"
	ScanTaskStatusStale     ScanTaskStatus = "stale"
)

type LocalArtist struct {
	ID                 int64              `json:"id"`
	Name               string             `json:"name"`
	NormalizedName     string             `json:"normalized_name"`
	SortName           string             `json:"sort_name,omitempty"`
	AppleMusicArtistID string             `json:"apple_music_artist_id,omitempty"`
	ArtworkPath        string             `json:"artwork_path,omitempty"`
	ArtworkURL         string             `json:"artwork_url,omitempty"`
	AvailabilityStatus AvailabilityStatus `json:"availability_status"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

type LocalAlbum struct {
	ID                 int64              `json:"id"`
	Title              string             `json:"title"`
	NormalizedTitle    string             `json:"normalized_title"`
	SortTitle          string             `json:"sort_title,omitempty"`
	PrimaryArtistID    int64              `json:"primary_artist_id,omitempty"`
	ReleaseDate        *time.Time         `json:"release_date,omitempty"`
	ReleaseYear        int                `json:"release_year,omitempty"`
	TotalTracks        int                `json:"total_tracks"`
	ArtworkPath        string             `json:"artwork_path,omitempty"`
	ArtworkURL         string             `json:"artwork_url,omitempty"`
	AppleMusicAlbumID  string             `json:"apple_music_album_id,omitempty"`
	AvailabilityStatus AvailabilityStatus `json:"availability_status"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

type LocalMedia struct {
	ID                 int64              `json:"id"`
	Title              string             `json:"title"`
	NormalizedTitle    string             `json:"normalized_title"`
	SortTitle          string             `json:"sort_title,omitempty"`
	AlbumID            int64              `json:"album_id,omitempty"`
	PrimaryArtistID    int64              `json:"primary_artist_id,omitempty"`
	DurationMs         int                `json:"duration_ms"`
	TrackNumber        int                `json:"track_number"`
	TrackTotal         int                `json:"track_total"`
	DiscNumber         int                `json:"disc_number"`
	DiscTotal          int                `json:"disc_total"`
	ReleaseDate        *time.Time         `json:"release_date,omitempty"`
	Composer           string             `json:"composer,omitempty"`
	Genres             []string           `json:"genres,omitempty"`
	LyricsAvailable    bool               `json:"lyrics_available"`
	ContentRating      string             `json:"content_rating,omitempty"`
	AppleMusicSongID   string             `json:"apple_music_song_id,omitempty"`
	AvailabilityStatus AvailabilityStatus `json:"availability_status"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

type LocalMediaFile struct {
	ID                 int64              `json:"id"`
	MediaID            int64              `json:"media_id"`
	LibraryRoot        string             `json:"library_root"`
	RelativePath       string             `json:"relative_path"`
	AbsolutePath       string             `json:"absolute_path"`
	FileSizeBytes      int64              `json:"file_size_bytes"`
	ModifiedAt         time.Time          `json:"modified_at"`
	Fingerprint        string             `json:"fingerprint,omitempty"`
	MIMEType           string             `json:"mime_type,omitempty"`
	Container          string             `json:"container,omitempty"`
	Codec              string             `json:"codec,omitempty"`
	Bitrate            int                `json:"bitrate"`
	SampleRate         int                `json:"sample_rate"`
	Channels           int                `json:"channels"`
	IsPrimary          bool               `json:"is_primary"`
	AvailabilityStatus AvailabilityStatus `json:"availability_status"`
	CreatedAt          time.Time          `json:"created_at"`
	UpdatedAt          time.Time          `json:"updated_at"`
}

type MetadataField struct {
	ID         int64           `json:"id"`
	EntityType LocalEntityType `json:"entity_type"`
	EntityID   int64           `json:"entity_id"`
	FieldName  string          `json:"field_name"`
	Source     MetadataSource  `json:"source"`
	Confidence float64         `json:"confidence"`
	IsEnhanced bool            `json:"is_enhanced"`
	Details    map[string]any  `json:"details,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

type LyricsMapping struct {
	ID               int64               `json:"id"`
	MediaID          int64               `json:"media_id"`
	AppleMusicSongID string              `json:"apple_music_song_id,omitempty"`
	Source           LyricsSource        `json:"source"`
	MatchConfidence  float64             `json:"match_confidence"`
	Status           LyricsMappingStatus `json:"status"`
	LastRequestedAt  *time.Time          `json:"last_requested_at,omitempty"`
	LastSyncedAt     *time.Time          `json:"last_synced_at,omitempty"`
	ErrorMessage     string              `json:"error_message,omitempty"`
	CreatedAt        time.Time           `json:"created_at"`
	UpdatedAt        time.Time           `json:"updated_at"`
}

type MediaScanTask struct {
	ID               int64           `json:"id"`
	ScanMode         LibraryScanMode `json:"scan_mode"`
	Status           ScanTaskStatus  `json:"status"`
	LibraryRoot      string          `json:"library_root"`
	TriggerSource    string          `json:"trigger_source"`
	Phase            string          `json:"phase"`
	FilesDiscovered  int             `json:"files_discovered"`
	FilesIndexed     int             `json:"files_indexed"`
	FilesUpdated     int             `json:"files_updated"`
	FilesUnavailable int             `json:"files_unavailable"`
	Errors           int             `json:"errors"`
	LastError        string          `json:"last_error,omitempty"`
	ScanContext      map[string]any  `json:"scan_context,omitempty"`
	StartedAt        *time.Time      `json:"started_at,omitempty"`
	CompletedAt      *time.Time      `json:"completed_at,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

func ScanLocalArtist(row interface{ Scan(...any) error }) (*LocalArtist, error) {
	var artist LocalArtist
	var sortName, appleMusicArtistID, artworkPath, artworkURL sql.NullString

	err := row.Scan(
		&artist.ID,
		&artist.Name,
		&artist.NormalizedName,
		&sortName,
		&appleMusicArtistID,
		&artworkPath,
		&artworkURL,
		&artist.AvailabilityStatus,
		&artist.CreatedAt,
		&artist.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if sortName.Valid {
		artist.SortName = sortName.String
	}
	if appleMusicArtistID.Valid {
		artist.AppleMusicArtistID = appleMusicArtistID.String
	}
	if artworkPath.Valid {
		artist.ArtworkPath = artworkPath.String
	}
	if artworkURL.Valid {
		artist.ArtworkURL = artworkURL.String
	}

	return &artist, nil
}

func LocalArtistColumns() string {
	return "id, name, normalized_name, sort_name, apple_music_artist_id, artwork_path, artwork_url, availability_status, created_at, updated_at"
}

func ScanLocalAlbum(row interface{ Scan(...any) error }) (*LocalAlbum, error) {
	var album LocalAlbum
	var sortTitle, artworkPath, artworkURL, appleMusicAlbumID sql.NullString
	var primaryArtistID sql.NullInt64
	var releaseDate sql.NullTime
	var releaseYear sql.NullInt64

	err := row.Scan(
		&album.ID,
		&album.Title,
		&album.NormalizedTitle,
		&sortTitle,
		&primaryArtistID,
		&releaseDate,
		&releaseYear,
		&album.TotalTracks,
		&artworkPath,
		&artworkURL,
		&appleMusicAlbumID,
		&album.AvailabilityStatus,
		&album.CreatedAt,
		&album.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if sortTitle.Valid {
		album.SortTitle = sortTitle.String
	}
	if primaryArtistID.Valid {
		album.PrimaryArtistID = primaryArtistID.Int64
	}
	if releaseDate.Valid {
		value := releaseDate.Time
		album.ReleaseDate = &value
	}
	if releaseYear.Valid {
		album.ReleaseYear = int(releaseYear.Int64)
	}
	if artworkPath.Valid {
		album.ArtworkPath = artworkPath.String
	}
	if artworkURL.Valid {
		album.ArtworkURL = artworkURL.String
	}
	if appleMusicAlbumID.Valid {
		album.AppleMusicAlbumID = appleMusicAlbumID.String
	}

	return &album, nil
}

func LocalAlbumColumns() string {
	return "id, title, normalized_title, sort_title, primary_artist_id, release_date, release_year, total_tracks, artwork_path, artwork_url, apple_music_album_id, availability_status, created_at, updated_at"
}

func ScanLocalMedia(row interface{ Scan(...any) error }) (*LocalMedia, error) {
	var media LocalMedia
	var sortTitle, composer, contentRating, appleMusicSongID sql.NullString
	var albumID, primaryArtistID sql.NullInt64
	var releaseDate sql.NullTime
	var genres pq.StringArray

	err := row.Scan(
		&media.ID,
		&media.Title,
		&media.NormalizedTitle,
		&sortTitle,
		&albumID,
		&primaryArtistID,
		&media.DurationMs,
		&media.TrackNumber,
		&media.TrackTotal,
		&media.DiscNumber,
		&media.DiscTotal,
		&releaseDate,
		&composer,
		&genres,
		&media.LyricsAvailable,
		&contentRating,
		&appleMusicSongID,
		&media.AvailabilityStatus,
		&media.CreatedAt,
		&media.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if sortTitle.Valid {
		media.SortTitle = sortTitle.String
	}
	if albumID.Valid {
		media.AlbumID = albumID.Int64
	}
	if primaryArtistID.Valid {
		media.PrimaryArtistID = primaryArtistID.Int64
	}
	if releaseDate.Valid {
		value := releaseDate.Time
		media.ReleaseDate = &value
	}
	if composer.Valid {
		media.Composer = composer.String
	}
	media.Genres = []string(genres)
	if contentRating.Valid {
		media.ContentRating = contentRating.String
	}
	if appleMusicSongID.Valid {
		media.AppleMusicSongID = appleMusicSongID.String
	}

	return &media, nil
}

func LocalMediaColumns() string {
	return "id, title, normalized_title, sort_title, album_id, primary_artist_id, duration_ms, track_number, track_total, disc_number, disc_total, release_date, composer, genres, lyrics_available, content_rating, apple_music_song_id, availability_status, created_at, updated_at"
}

func ScanLocalMediaFile(row interface{ Scan(...any) error }) (*LocalMediaFile, error) {
	var file LocalMediaFile
	var fingerprint, mimeType, container, codec sql.NullString

	err := row.Scan(
		&file.ID,
		&file.MediaID,
		&file.LibraryRoot,
		&file.RelativePath,
		&file.AbsolutePath,
		&file.FileSizeBytes,
		&file.ModifiedAt,
		&fingerprint,
		&mimeType,
		&container,
		&codec,
		&file.Bitrate,
		&file.SampleRate,
		&file.Channels,
		&file.IsPrimary,
		&file.AvailabilityStatus,
		&file.CreatedAt,
		&file.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if fingerprint.Valid {
		file.Fingerprint = fingerprint.String
	}
	if mimeType.Valid {
		file.MIMEType = mimeType.String
	}
	if container.Valid {
		file.Container = container.String
	}
	if codec.Valid {
		file.Codec = codec.String
	}

	return &file, nil
}

func LocalMediaFileColumns() string {
	return "id, media_id, library_root, relative_path, absolute_path, file_size_bytes, modified_at, fingerprint, mime_type, container, codec, bitrate, sample_rate, channels, is_primary, availability_status, created_at, updated_at"
}

func ScanMetadataField(row interface{ Scan(...any) error }) (*MetadataField, error) {
	var field MetadataField
	var details []byte

	err := row.Scan(
		&field.ID,
		&field.EntityType,
		&field.EntityID,
		&field.FieldName,
		&field.Source,
		&field.Confidence,
		&field.IsEnhanced,
		&details,
		&field.CreatedAt,
		&field.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if len(details) > 0 {
		if err := json.Unmarshal(details, &field.Details); err != nil {
			return nil, err
		}
	}

	return &field, nil
}

func MetadataFieldColumns() string {
	return "id, entity_type, entity_id, field_name, source, confidence, is_enhanced, details, created_at, updated_at"
}

func ScanLyricsMapping(row interface{ Scan(...any) error }) (*LyricsMapping, error) {
	var mapping LyricsMapping
	var appleMusicSongID, errorMessage sql.NullString
	var lastRequestedAt, lastSyncedAt sql.NullTime

	err := row.Scan(
		&mapping.ID,
		&mapping.MediaID,
		&appleMusicSongID,
		&mapping.Source,
		&mapping.MatchConfidence,
		&mapping.Status,
		&lastRequestedAt,
		&lastSyncedAt,
		&errorMessage,
		&mapping.CreatedAt,
		&mapping.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if appleMusicSongID.Valid {
		mapping.AppleMusicSongID = appleMusicSongID.String
	}
	if lastRequestedAt.Valid {
		value := lastRequestedAt.Time
		mapping.LastRequestedAt = &value
	}
	if lastSyncedAt.Valid {
		value := lastSyncedAt.Time
		mapping.LastSyncedAt = &value
	}
	if errorMessage.Valid {
		mapping.ErrorMessage = errorMessage.String
	}

	return &mapping, nil
}

func LyricsMappingColumns() string {
	return "id, media_id, apple_music_song_id, source, match_confidence, status, last_requested_at, last_synced_at, error_message, created_at, updated_at"
}

func ScanMediaScanTask(row interface{ Scan(...any) error }) (*MediaScanTask, error) {
	var task MediaScanTask
	var lastError sql.NullString
	var startedAt, completedAt sql.NullTime
	var scanContext []byte

	err := row.Scan(
		&task.ID,
		&task.ScanMode,
		&task.Status,
		&task.LibraryRoot,
		&task.TriggerSource,
		&task.Phase,
		&task.FilesDiscovered,
		&task.FilesIndexed,
		&task.FilesUpdated,
		&task.FilesUnavailable,
		&task.Errors,
		&lastError,
		&scanContext,
		&startedAt,
		&completedAt,
		&task.CreatedAt,
		&task.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if lastError.Valid {
		task.LastError = lastError.String
	}
	if len(scanContext) > 0 {
		if err := json.Unmarshal(scanContext, &task.ScanContext); err != nil {
			return nil, err
		}
	}
	if startedAt.Valid {
		value := startedAt.Time
		task.StartedAt = &value
	}
	if completedAt.Valid {
		value := completedAt.Time
		task.CompletedAt = &value
	}

	return &task, nil
}

func MediaScanTaskColumns() string {
	return "id, scan_mode, status, library_root, trigger_source, phase, files_discovered, files_indexed, files_updated, files_unavailable, errors, last_error, scan_context, started_at, completed_at, created_at, updated_at"
}
