package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"main/models"
	"time"

	"github.com/lib/pq"
)

type LocalLibraryDBRepository struct {
	db *Database
}

func NewLocalLibraryDBRepository(db *Database) *LocalLibraryDBRepository {
	return &LocalLibraryDBRepository{db: db}
}

func stringArrayOrEmpty(values []string) interface{} {
	if len(values) == 0 {
		return pq.Array([]string{})
	}
	return pq.Array(values)
}

func (r *LocalLibraryDBRepository) SaveArtist(ctx context.Context, artist *models.LocalArtist) (*models.LocalArtist, error) {
	if artist == nil {
		return nil, fmt.Errorf("artist is required")
	}

	var row *sql.Row
	if artist.ID == 0 {
		query := fmt.Sprintf(`
			INSERT INTO local_artists (name, normalized_name, sort_name, apple_music_artist_id, artwork_path, artwork_url, availability_status)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING %s
		`, models.LocalArtistColumns())
		row = r.db.QueryRowContext(ctx, query,
			artist.Name,
			artist.NormalizedName,
			nullableString(artist.SortName),
			nullableString(artist.AppleMusicArtistID),
			nullableString(artist.ArtworkPath),
			nullableString(artist.ArtworkURL),
			artist.AvailabilityStatus,
		)
	} else {
		query := fmt.Sprintf(`
			UPDATE local_artists
			SET name = $2,
				normalized_name = $3,
				sort_name = $4,
				apple_music_artist_id = $5,
				artwork_path = $6,
				artwork_url = $7,
				availability_status = $8,
				updated_at = NOW()
			WHERE id = $1
			RETURNING %s
		`, models.LocalArtistColumns())
		row = r.db.QueryRowContext(ctx, query,
			artist.ID,
			artist.Name,
			artist.NormalizedName,
			nullableString(artist.SortName),
			nullableString(artist.AppleMusicArtistID),
			nullableString(artist.ArtworkPath),
			nullableString(artist.ArtworkURL),
			artist.AvailabilityStatus,
		)
	}

	saved, err := models.ScanLocalArtist(row)
	if err != nil {
		return nil, fmt.Errorf("failed to save local artist: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) GetArtistByID(ctx context.Context, id int64) (*models.LocalArtist, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_artists WHERE id = $1`, models.LocalArtistColumns())
	artist, err := models.ScanLocalArtist(r.db.QueryRowContext(ctx, query, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local artist by id: %w", err)
	}
	return artist, nil
}

func (r *LocalLibraryDBRepository) GetArtistByNormalizedName(ctx context.Context, normalizedName string) (*models.LocalArtist, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_artists
		WHERE normalized_name = $1
		ORDER BY id ASC
		LIMIT 1
	`, models.LocalArtistColumns())
	artist, err := models.ScanLocalArtist(r.db.QueryRowContext(ctx, query, normalizedName))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local artist by normalized name: %w", err)
	}
	return artist, nil
}

func (r *LocalLibraryDBRepository) SaveAlbum(ctx context.Context, album *models.LocalAlbum) (*models.LocalAlbum, error) {
	if album == nil {
		return nil, fmt.Errorf("album is required")
	}

	var row *sql.Row
	if album.ID == 0 {
		query := fmt.Sprintf(`
			INSERT INTO local_albums (title, normalized_title, sort_title, primary_artist_id, release_date, release_year, total_tracks, artwork_path, artwork_url, apple_music_album_id, availability_status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			RETURNING %s
		`, models.LocalAlbumColumns())
		row = r.db.QueryRowContext(ctx, query,
			album.Title,
			album.NormalizedTitle,
			nullableString(album.SortTitle),
			nullableInt64(album.PrimaryArtistID),
			nullableTime(album.ReleaseDate),
			nullableInt(album.ReleaseYear),
			album.TotalTracks,
			nullableString(album.ArtworkPath),
			nullableString(album.ArtworkURL),
			nullableString(album.AppleMusicAlbumID),
			album.AvailabilityStatus,
		)
	} else {
		query := fmt.Sprintf(`
			UPDATE local_albums
			SET title = $2,
				normalized_title = $3,
				sort_title = $4,
				primary_artist_id = $5,
				release_date = $6,
				release_year = $7,
				total_tracks = $8,
				artwork_path = $9,
				artwork_url = $10,
				apple_music_album_id = $11,
				availability_status = $12,
				updated_at = NOW()
			WHERE id = $1
			RETURNING %s
		`, models.LocalAlbumColumns())
		row = r.db.QueryRowContext(ctx, query,
			album.ID,
			album.Title,
			album.NormalizedTitle,
			nullableString(album.SortTitle),
			nullableInt64(album.PrimaryArtistID),
			nullableTime(album.ReleaseDate),
			nullableInt(album.ReleaseYear),
			album.TotalTracks,
			nullableString(album.ArtworkPath),
			nullableString(album.ArtworkURL),
			nullableString(album.AppleMusicAlbumID),
			album.AvailabilityStatus,
		)
	}

	saved, err := models.ScanLocalAlbum(row)
	if err != nil {
		return nil, fmt.Errorf("failed to save local album: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) GetAlbumByID(ctx context.Context, id int64) (*models.LocalAlbum, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_albums WHERE id = $1`, models.LocalAlbumColumns())
	album, err := models.ScanLocalAlbum(r.db.QueryRowContext(ctx, query, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local album by id: %w", err)
	}
	return album, nil
}

func (r *LocalLibraryDBRepository) ListAlbumsByPrimaryArtistID(ctx context.Context, artistID int64) ([]*models.LocalAlbum, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_albums
		WHERE primary_artist_id = $1
		ORDER BY COALESCE(release_date, TO_DATE(CAST(NULLIF(release_year, 0) AS TEXT), 'YYYY')) DESC NULLS LAST, title ASC, id ASC
	`, models.LocalAlbumColumns())
	rows, err := r.db.QueryContext(ctx, query, artistID)
	if err != nil {
		return nil, fmt.Errorf("failed to list local albums by primary artist id: %w", err)
	}
	defer rows.Close()

	albums := make([]*models.LocalAlbum, 0)
	for rows.Next() {
		album, err := models.ScanLocalAlbum(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan local album by primary artist id: %w", err)
		}
		albums = append(albums, album)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate local albums by primary artist id: %w", err)
	}
	return albums, nil
}

func (r *LocalLibraryDBRepository) GetAlbumByNormalizedTitle(ctx context.Context, normalizedTitle string, primaryArtistID int64) (*models.LocalAlbum, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_albums
		WHERE normalized_title = $1
		  AND primary_artist_id IS NOT DISTINCT FROM $2
		ORDER BY id ASC
		LIMIT 1
	`, models.LocalAlbumColumns())
	album, err := models.ScanLocalAlbum(r.db.QueryRowContext(ctx, query, normalizedTitle, nullableInt64(primaryArtistID)))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local album by normalized title: %w", err)
	}
	return album, nil
}

func (r *LocalLibraryDBRepository) SaveMedia(ctx context.Context, media *models.LocalMedia) (*models.LocalMedia, error) {
	if media == nil {
		return nil, fmt.Errorf("media is required")
	}

	var row *sql.Row
	if media.ID == 0 {
		query := fmt.Sprintf(`
			INSERT INTO local_media (title, normalized_title, sort_title, album_id, primary_artist_id, duration_ms, track_number, track_total, disc_number, disc_total, release_date, composer, genres, lyrics_available, content_rating, apple_music_song_id, availability_status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
			RETURNING %s
		`, models.LocalMediaColumns())
		row = r.db.QueryRowContext(ctx, query,
			media.Title,
			media.NormalizedTitle,
			nullableString(media.SortTitle),
			nullableInt64(media.AlbumID),
			nullableInt64(media.PrimaryArtistID),
			media.DurationMs,
			media.TrackNumber,
			media.TrackTotal,
			media.DiscNumber,
			media.DiscTotal,
			nullableTime(media.ReleaseDate),
			nullableString(media.Composer),
			stringArrayOrEmpty(media.Genres),
			media.LyricsAvailable,
			nullableString(media.ContentRating),
			nullableString(media.AppleMusicSongID),
			media.AvailabilityStatus,
		)
	} else {
		query := fmt.Sprintf(`
			UPDATE local_media
			SET title = $2,
				normalized_title = $3,
				sort_title = $4,
				album_id = $5,
				primary_artist_id = $6,
				duration_ms = $7,
				track_number = $8,
				track_total = $9,
				disc_number = $10,
				disc_total = $11,
				release_date = $12,
				composer = $13,
				genres = $14,
				lyrics_available = $15,
				content_rating = $16,
				apple_music_song_id = $17,
				availability_status = $18,
				updated_at = NOW()
			WHERE id = $1
			RETURNING %s
		`, models.LocalMediaColumns())
		row = r.db.QueryRowContext(ctx, query,
			media.ID,
			media.Title,
			media.NormalizedTitle,
			nullableString(media.SortTitle),
			nullableInt64(media.AlbumID),
			nullableInt64(media.PrimaryArtistID),
			media.DurationMs,
			media.TrackNumber,
			media.TrackTotal,
			media.DiscNumber,
			media.DiscTotal,
			nullableTime(media.ReleaseDate),
			nullableString(media.Composer),
			stringArrayOrEmpty(media.Genres),
			media.LyricsAvailable,
			nullableString(media.ContentRating),
			nullableString(media.AppleMusicSongID),
			media.AvailabilityStatus,
		)
	}

	saved, err := models.ScanLocalMedia(row)
	if err != nil {
		return nil, fmt.Errorf("failed to save local media: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) GetMediaByID(ctx context.Context, id int64) (*models.LocalMedia, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_media WHERE id = $1`, models.LocalMediaColumns())
	media, err := models.ScanLocalMedia(r.db.QueryRowContext(ctx, query, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local media by id: %w", err)
	}
	return media, nil
}

func (r *LocalLibraryDBRepository) FindMediaByAlbumID(ctx context.Context, albumID int64) ([]*models.LocalMedia, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_media
		WHERE album_id = $1
		ORDER BY disc_number ASC, track_number ASC, id ASC
	`, models.LocalMediaColumns())
	rows, err := r.db.QueryContext(ctx, query, albumID)
	if err != nil {
		return nil, fmt.Errorf("failed to find local media by album id: %w", err)
	}
	defer rows.Close()

	var mediaItems []*models.LocalMedia
	for rows.Next() {
		media, err := models.ScanLocalMedia(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan local media row: %w", err)
		}
		mediaItems = append(mediaItems, media)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate local media rows: %w", err)
	}
	return mediaItems, nil
}

func (r *LocalLibraryDBRepository) FindMediaByPrimaryArtistID(ctx context.Context, artistID int64) ([]*models.LocalMedia, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_media
		WHERE primary_artist_id = $1
		ORDER BY CASE WHEN availability_status = 'available' THEN 0 ELSE 1 END, album_id ASC, disc_number ASC, track_number ASC, id ASC
	`, models.LocalMediaColumns())
	rows, err := r.db.QueryContext(ctx, query, artistID)
	if err != nil {
		return nil, fmt.Errorf("failed to find local media by primary artist id: %w", err)
	}
	defer rows.Close()

	var mediaItems []*models.LocalMedia
	for rows.Next() {
		media, err := models.ScanLocalMedia(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan local media by primary artist id: %w", err)
		}
		mediaItems = append(mediaItems, media)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate local media by primary artist id: %w", err)
	}
	return mediaItems, nil
}

func (r *LocalLibraryDBRepository) DeleteMedia(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM local_media WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete local media: %w", err)
	}
	return nil
}

func (r *LocalLibraryDBRepository) SaveMediaFile(ctx context.Context, file *models.LocalMediaFile) (*models.LocalMediaFile, error) {
	if file == nil {
		return nil, fmt.Errorf("media file is required")
	}

	var row *sql.Row
	if file.ID == 0 {
		query := fmt.Sprintf(`
			INSERT INTO local_media_files (media_id, library_root, relative_path, absolute_path, file_size_bytes, modified_at, fingerprint, mime_type, container, codec, bitrate, sample_rate, channels, is_primary, availability_status)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
			RETURNING %s
		`, models.LocalMediaFileColumns())
		row = r.db.QueryRowContext(ctx, query,
			file.MediaID,
			file.LibraryRoot,
			file.RelativePath,
			file.AbsolutePath,
			file.FileSizeBytes,
			file.ModifiedAt,
			nullableString(file.Fingerprint),
			nullableString(file.MIMEType),
			nullableString(file.Container),
			nullableString(file.Codec),
			file.Bitrate,
			file.SampleRate,
			file.Channels,
			file.IsPrimary,
			file.AvailabilityStatus,
		)
	} else {
		query := fmt.Sprintf(`
			UPDATE local_media_files
			SET media_id = $2,
				library_root = $3,
				relative_path = $4,
				absolute_path = $5,
				file_size_bytes = $6,
				modified_at = $7,
				fingerprint = $8,
				mime_type = $9,
				container = $10,
				codec = $11,
				bitrate = $12,
				sample_rate = $13,
				channels = $14,
				is_primary = $15,
				availability_status = $16,
				updated_at = NOW()
			WHERE id = $1
			RETURNING %s
		`, models.LocalMediaFileColumns())
		row = r.db.QueryRowContext(ctx, query,
			file.ID,
			file.MediaID,
			file.LibraryRoot,
			file.RelativePath,
			file.AbsolutePath,
			file.FileSizeBytes,
			file.ModifiedAt,
			nullableString(file.Fingerprint),
			nullableString(file.MIMEType),
			nullableString(file.Container),
			nullableString(file.Codec),
			file.Bitrate,
			file.SampleRate,
			file.Channels,
			file.IsPrimary,
			file.AvailabilityStatus,
		)
	}

	saved, err := models.ScanLocalMediaFile(row)
	if err != nil {
		return nil, fmt.Errorf("failed to save local media file: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) GetMediaFileByID(ctx context.Context, id int64) (*models.LocalMediaFile, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_media_files WHERE id = $1`, models.LocalMediaFileColumns())
	file, err := models.ScanLocalMediaFile(r.db.QueryRowContext(ctx, query, id))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local media file by id: %w", err)
	}
	return file, nil
}

func (r *LocalLibraryDBRepository) GetMediaFileByAbsolutePath(ctx context.Context, absolutePath string) (*models.LocalMediaFile, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_media_files WHERE absolute_path = $1`, models.LocalMediaFileColumns())
	file, err := models.ScanLocalMediaFile(r.db.QueryRowContext(ctx, query, absolutePath))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get local media file by absolute path: %w", err)
	}
	return file, nil
}

func (r *LocalLibraryDBRepository) GetPrimaryMediaFileByMediaID(ctx context.Context, mediaID int64) (*models.LocalMediaFile, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_media_files
		WHERE media_id = $1
		ORDER BY CASE WHEN availability_status = 'available' THEN 0 ELSE 1 END, CASE WHEN is_primary THEN 0 ELSE 1 END, id ASC
		LIMIT 1
	`, models.LocalMediaFileColumns())
	file, err := models.ScanLocalMediaFile(r.db.QueryRowContext(ctx, query, mediaID))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get primary local media file by media id: %w", err)
	}
	return file, nil
}

func (r *LocalLibraryDBRepository) ListMediaFilesByLibraryRoot(ctx context.Context, libraryRoot string) ([]*models.LocalMediaFile, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_media_files
		WHERE library_root = $1
		ORDER BY id ASC
	`, models.LocalMediaFileColumns())
	rows, err := r.db.QueryContext(ctx, query, libraryRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to list local media files by library root: %w", err)
	}
	defer rows.Close()

	var files []*models.LocalMediaFile
	for rows.Next() {
		file, err := models.ScanLocalMediaFile(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan local media file row: %w", err)
		}
		files = append(files, file)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate local media files: %w", err)
	}
	return files, nil
}

func (r *LocalLibraryDBRepository) DeleteMediaFile(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM local_media_files WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete local media file: %w", err)
	}
	return nil
}

func (r *LocalLibraryDBRepository) SaveMetadataField(ctx context.Context, field *models.MetadataField) (*models.MetadataField, error) {
	if field == nil {
		return nil, fmt.Errorf("metadata field is required")
	}

	details, err := marshalJSON(field.Details)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal metadata field details: %w", err)
	}

	query := fmt.Sprintf(`
		INSERT INTO local_metadata_fields (entity_type, entity_id, field_name, source, confidence, is_enhanced, details)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (entity_type, entity_id, field_name)
		DO UPDATE SET source = EXCLUDED.source,
		              confidence = EXCLUDED.confidence,
		              is_enhanced = EXCLUDED.is_enhanced,
		              details = EXCLUDED.details,
		              updated_at = NOW()
		RETURNING %s
	`, models.MetadataFieldColumns())

	saved, err := models.ScanMetadataField(r.db.QueryRowContext(ctx, query,
		field.EntityType,
		field.EntityID,
		field.FieldName,
		field.Source,
		field.Confidence,
		field.IsEnhanced,
		details,
	))
	if err != nil {
		return nil, fmt.Errorf("failed to save metadata field: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) ListMetadataFields(ctx context.Context, entityType models.LocalEntityType, entityID int64) ([]*models.MetadataField, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_metadata_fields
		WHERE entity_type = $1 AND entity_id = $2
		ORDER BY field_name ASC
	`, models.MetadataFieldColumns())
	rows, err := r.db.QueryContext(ctx, query, entityType, entityID)
	if err != nil {
		return nil, fmt.Errorf("failed to list metadata fields: %w", err)
	}
	defer rows.Close()

	var fields []*models.MetadataField
	for rows.Next() {
		field, err := models.ScanMetadataField(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan metadata field row: %w", err)
		}
		fields = append(fields, field)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate metadata fields: %w", err)
	}
	return fields, nil
}

func (r *LocalLibraryDBRepository) SaveLyricsMapping(ctx context.Context, mapping *models.LyricsMapping) (*models.LyricsMapping, error) {
	if mapping == nil {
		return nil, fmt.Errorf("lyrics mapping is required")
	}

	query := fmt.Sprintf(`
		INSERT INTO local_lyrics_mappings (media_id, apple_music_song_id, source, match_confidence, status, last_requested_at, last_synced_at, error_message)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (media_id)
		DO UPDATE SET apple_music_song_id = EXCLUDED.apple_music_song_id,
		              source = EXCLUDED.source,
		              match_confidence = EXCLUDED.match_confidence,
		              status = EXCLUDED.status,
		              last_requested_at = EXCLUDED.last_requested_at,
		              last_synced_at = EXCLUDED.last_synced_at,
		              error_message = EXCLUDED.error_message,
		              updated_at = NOW()
		RETURNING %s
	`, models.LyricsMappingColumns())

	saved, err := models.ScanLyricsMapping(r.db.QueryRowContext(ctx, query,
		mapping.MediaID,
		nullableString(mapping.AppleMusicSongID),
		mapping.Source,
		mapping.MatchConfidence,
		mapping.Status,
		nullableTime(mapping.LastRequestedAt),
		nullableTime(mapping.LastSyncedAt),
		nullableString(mapping.ErrorMessage),
	))
	if err != nil {
		return nil, fmt.Errorf("failed to save lyrics mapping: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) GetLyricsMappingByMediaID(ctx context.Context, mediaID int64) (*models.LyricsMapping, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_lyrics_mappings WHERE media_id = $1`, models.LyricsMappingColumns())
	mapping, err := models.ScanLyricsMapping(r.db.QueryRowContext(ctx, query, mediaID))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get lyrics mapping by media id: %w", err)
	}
	return mapping, nil
}

func (r *LocalLibraryDBRepository) CreateScanTask(ctx context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	if task == nil {
		return nil, fmt.Errorf("scan task is required")
	}

	scanContext, err := marshalJSON(task.ScanContext)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal scan task context: %w", err)
	}

	query := fmt.Sprintf(`
		INSERT INTO local_scan_tasks (scan_mode, status, library_root, trigger_source, phase, files_discovered, files_indexed, files_updated, files_unavailable, errors, last_error, scan_context, started_at, completed_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		RETURNING %s
	`, models.MediaScanTaskColumns())

	saved, err := models.ScanMediaScanTask(r.db.QueryRowContext(ctx, query,
		task.ScanMode,
		task.Status,
		task.LibraryRoot,
		task.TriggerSource,
		task.Phase,
		task.FilesDiscovered,
		task.FilesIndexed,
		task.FilesUpdated,
		task.FilesUnavailable,
		task.Errors,
		nullableString(task.LastError),
		scanContext,
		nullableTime(task.StartedAt),
		nullableTime(task.CompletedAt),
	))
	if err != nil {
		return nil, fmt.Errorf("failed to create scan task: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) UpdateScanTask(ctx context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error) {
	if task == nil {
		return nil, fmt.Errorf("scan task is required")
	}

	scanContext, err := marshalJSON(task.ScanContext)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal scan task context: %w", err)
	}

	query := fmt.Sprintf(`
		UPDATE local_scan_tasks
		SET scan_mode = $2,
			status = $3,
			library_root = $4,
			trigger_source = $5,
			phase = $6,
			files_discovered = $7,
			files_indexed = $8,
			files_updated = $9,
			files_unavailable = $10,
			errors = $11,
			last_error = $12,
			scan_context = $13,
			started_at = $14,
			completed_at = $15,
			updated_at = NOW()
		WHERE id = $1
		RETURNING %s
	`, models.MediaScanTaskColumns())

	saved, err := models.ScanMediaScanTask(r.db.QueryRowContext(ctx, query,
		task.ID,
		task.ScanMode,
		task.Status,
		task.LibraryRoot,
		task.TriggerSource,
		task.Phase,
		task.FilesDiscovered,
		task.FilesIndexed,
		task.FilesUpdated,
		task.FilesUnavailable,
		task.Errors,
		nullableString(task.LastError),
		scanContext,
		nullableTime(task.StartedAt),
		nullableTime(task.CompletedAt),
	))
	if err != nil {
		return nil, fmt.Errorf("failed to update scan task: %w", err)
	}
	return saved, nil
}

func (r *LocalLibraryDBRepository) GetActiveScanTask(ctx context.Context, libraryRoot string) (*models.MediaScanTask, error) {
	query := fmt.Sprintf(`
		SELECT %s
		FROM local_scan_tasks
		WHERE library_root = $1
		  AND status IN ('queued', 'running')
		ORDER BY created_at DESC
		LIMIT 1
	`, models.MediaScanTaskColumns())
	task, err := models.ScanMediaScanTask(r.db.QueryRowContext(ctx, query, libraryRoot))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get active scan task: %w", err)
	}
	return task, nil
}

func (r *LocalLibraryDBRepository) ListScanTasks(ctx context.Context, limit int) ([]*models.MediaScanTask, error) {
	if limit <= 0 {
		limit = 20
	}

	query := fmt.Sprintf(`
		SELECT %s
		FROM local_scan_tasks
		ORDER BY created_at DESC
		LIMIT $1
	`, models.MediaScanTaskColumns())
	rows, err := r.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to list scan tasks: %w", err)
	}
	defer rows.Close()

	var tasks []*models.MediaScanTask
	for rows.Next() {
		task, err := models.ScanMediaScanTask(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan scan task row: %w", err)
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed to iterate scan tasks: %w", err)
	}
	return tasks, nil
}

func (r *LocalLibraryDBRepository) DeleteOrphanAlbums(ctx context.Context) error {
	query := `
		DELETE FROM local_albums a
		WHERE NOT EXISTS (
			SELECT 1
			FROM local_media m
			WHERE m.album_id = a.id
		)
	`
	if _, err := r.db.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("failed to delete orphan albums: %w", err)
	}
	return nil
}

func (r *LocalLibraryDBRepository) DeleteOrphanArtists(ctx context.Context) error {
	query := `
		DELETE FROM local_artists a
		WHERE NOT EXISTS (
			SELECT 1
			FROM local_media m
			WHERE m.primary_artist_id = a.id
		)
	`
	if _, err := r.db.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("failed to delete orphan artists: %w", err)
	}
	return nil
}

func nullableString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
}

func nullableInt64(value int64) sql.NullInt64 {
	return sql.NullInt64{Int64: value, Valid: value != 0}
}

func nullableInt(value int) sql.NullInt64 {
	return sql.NullInt64{Int64: int64(value), Valid: value != 0}
}

func nullableTime(value *time.Time) sql.NullTime {
	if value == nil {
		return sql.NullTime{}
	}
	return sql.NullTime{Time: *value, Valid: true}
}

func marshalJSON(value any) ([]byte, error) {
	if value == nil {
		return []byte(`{}`), nil
	}
	return json.Marshal(value)
}
