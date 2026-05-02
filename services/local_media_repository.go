package services

import (
	"context"

	"main/models"
)

type LocalArtistRepository interface {
	SaveArtist(ctx context.Context, artist *models.LocalArtist) (*models.LocalArtist, error)
	GetArtistByID(ctx context.Context, id int64) (*models.LocalArtist, error)
}

type LocalAlbumRepository interface {
	SaveAlbum(ctx context.Context, album *models.LocalAlbum) (*models.LocalAlbum, error)
	GetAlbumByID(ctx context.Context, id int64) (*models.LocalAlbum, error)
	ListAlbumsByPrimaryArtistID(ctx context.Context, artistID int64) ([]*models.LocalAlbum, error)
}

type LocalMediaRepository interface {
	SaveMedia(ctx context.Context, media *models.LocalMedia) (*models.LocalMedia, error)
	GetMediaByID(ctx context.Context, id int64) (*models.LocalMedia, error)
	FindMediaByAlbumID(ctx context.Context, albumID int64) ([]*models.LocalMedia, error)
	FindMediaByPrimaryArtistID(ctx context.Context, artistID int64) ([]*models.LocalMedia, error)
}

type LocalMediaFileRepository interface {
	SaveMediaFile(ctx context.Context, file *models.LocalMediaFile) (*models.LocalMediaFile, error)
	GetMediaFileByID(ctx context.Context, id int64) (*models.LocalMediaFile, error)
	GetMediaFileByAbsolutePath(ctx context.Context, absolutePath string) (*models.LocalMediaFile, error)
	GetPrimaryMediaFileByMediaID(ctx context.Context, mediaID int64) (*models.LocalMediaFile, error)
}

type MetadataFieldRepository interface {
	SaveMetadataField(ctx context.Context, field *models.MetadataField) (*models.MetadataField, error)
	ListMetadataFields(ctx context.Context, entityType models.LocalEntityType, entityID int64) ([]*models.MetadataField, error)
}

type LyricsMappingRepository interface {
	SaveLyricsMapping(ctx context.Context, mapping *models.LyricsMapping) (*models.LyricsMapping, error)
	GetLyricsMappingByMediaID(ctx context.Context, mediaID int64) (*models.LyricsMapping, error)
}

type MediaScanTaskRepository interface {
	CreateScanTask(ctx context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error)
	UpdateScanTask(ctx context.Context, task *models.MediaScanTask) (*models.MediaScanTask, error)
	GetActiveScanTask(ctx context.Context, libraryRoot string) (*models.MediaScanTask, error)
	ListScanTasks(ctx context.Context, limit int) ([]*models.MediaScanTask, error)
}

type LocalLibraryRepository interface {
	LocalArtistRepository
	LocalAlbumRepository
	LocalMediaRepository
	LocalMediaFileRepository
	MetadataFieldRepository
	LyricsMappingRepository
	MediaScanTaskRepository
}

type LocalLibraryScanRepository interface {
	LocalLibraryRepository
	GetArtistByNormalizedName(ctx context.Context, normalizedName string) (*models.LocalArtist, error)
	GetAlbumByNormalizedTitle(ctx context.Context, normalizedTitle string, primaryArtistID int64) (*models.LocalAlbum, error)
	ListMediaFilesByLibraryRoot(ctx context.Context, libraryRoot string) ([]*models.LocalMediaFile, error)
	DeleteMedia(ctx context.Context, id int64) error
	DeleteMediaFile(ctx context.Context, id int64) error
	DeleteOrphanAlbums(ctx context.Context) error
	DeleteOrphanArtists(ctx context.Context) error
}
