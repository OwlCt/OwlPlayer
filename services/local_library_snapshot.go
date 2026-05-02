package services

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/OwlCt/OwlPlayer/models"
)

type localLibrarySnapshotResolver struct {
	repo LocalLibraryRepository
}

func newLocalLibrarySnapshotResolver(repo LocalLibraryRepository) *localLibrarySnapshotResolver {
	if repo == nil {
		return nil
	}
	return &localLibrarySnapshotResolver{repo: repo}
}

func (r *localLibrarySnapshotResolver) ResolveSong(ctx context.Context, mediaID string) (*models.SongItem, error) {
	if r == nil || r.repo == nil || mediaID == "" {
		return nil, nil
	}

	parsedID, err := strconv.ParseInt(mediaID, 10, 64)
	if err != nil {
		return nil, nil
	}

	media, err := r.repo.GetMediaByID(ctx, parsedID)
	if err != nil || media == nil {
		return nil, err
	}

	album, err := r.repo.GetAlbumByID(ctx, media.AlbumID)
	if err != nil {
		return nil, err
	}
	artist, err := r.repo.GetArtistByID(ctx, media.PrimaryArtistID)
	if err != nil {
		return nil, err
	}

	return &models.SongItem{
		ID:                 strconv.FormatInt(media.ID, 10),
		Name:               media.Title,
		ArtistName:         snapshotArtistName(artist),
		ArtistID:           snapshotNullableID(media.PrimaryArtistID),
		AlbumName:          snapshotAlbumTitle(album),
		AlbumID:            snapshotNullableID(media.AlbumID),
		Duration:           media.DurationMs,
		ArtworkURL:         snapshotArtworkURLForSong(album, artist),
		ReleaseDate:        snapshotFormatDate(media.ReleaseDate),
		HasLyrics:          media.LyricsAvailable,
		TrackNumber:        media.TrackNumber,
		DiscNumber:         media.DiscNumber,
		ComposerName:       media.Composer,
		Genres:             append([]string(nil), media.Genres...),
		ContentRating:      media.ContentRating,
		AvailabilityStatus: string(media.AvailabilityStatus),
	}, nil
}

func (r *localLibrarySnapshotResolver) ResolveAlbum(ctx context.Context, albumID string) (*models.AlbumItem, error) {
	if r == nil || r.repo == nil || albumID == "" {
		return nil, nil
	}

	parsedID, err := strconv.ParseInt(albumID, 10, 64)
	if err != nil {
		return nil, nil
	}

	album, err := r.repo.GetAlbumByID(ctx, parsedID)
	if err != nil || album == nil {
		return nil, err
	}

	artist, err := r.repo.GetArtistByID(ctx, album.PrimaryArtistID)
	if err != nil {
		return nil, err
	}
	fields, err := r.repo.ListMetadataFields(ctx, models.LocalEntityTypeAlbum, album.ID)
	if err != nil {
		return nil, err
	}

	releaseType := releaseTypeFromMetadataFields(fields)

	item := &models.AlbumItem{
		ID:                 strconv.FormatInt(album.ID, 10),
		Name:               album.Title,
		ArtistID:           snapshotNullableID(album.PrimaryArtistID),
		ArtistName:         snapshotArtistName(artist),
		ArtworkURL:         snapshotArtworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL),
		ReleaseDate:        snapshotFormatDate(album.ReleaseDate),
		TrackCount:         album.TotalTracks,
		AvailabilityStatus: string(album.AvailabilityStatus),
	}
	applyAlbumReleaseType(item, releaseType)

	return item, nil
}

func (r *localLibrarySnapshotResolver) ResolveArtist(ctx context.Context, artistID string) (*models.ArtistItem, error) {
	if r == nil || r.repo == nil || artistID == "" {
		return nil, nil
	}

	parsedID, err := strconv.ParseInt(artistID, 10, 64)
	if err != nil {
		return nil, nil
	}

	artist, err := r.repo.GetArtistByID(ctx, parsedID)
	if err != nil || artist == nil {
		return nil, err
	}

	return &models.ArtistItem{
		ID:                 strconv.FormatInt(artist.ID, 10),
		Name:               artist.Name,
		ArtworkURL:         snapshotArtworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL),
		Genres:             []string{},
		AvailabilityStatus: string(artist.AvailabilityStatus),
	}, nil
}

func snapshotFormatDate(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format("2006-01-02")
}

func snapshotNullableID(id int64) string {
	if id == 0 {
		return ""
	}
	return strconv.FormatInt(id, 10)
}

func snapshotArtworkURLForEntity(entityType string, id int64, localPath, remoteURL string) string {
	if localPath != "" {
		return fmt.Sprintf("/api/artwork/%s/%d", entityType, id)
	}
	return remoteURL
}

func snapshotArtworkURLForSong(album *models.LocalAlbum, artist *models.LocalArtist) string {
	if album != nil {
		if url := snapshotArtworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL); url != "" {
			return url
		}
	}
	if artist != nil {
		return snapshotArtworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL)
	}
	return ""
}

func snapshotArtistName(artist *models.LocalArtist) string {
	if artist == nil {
		return ""
	}
	return artist.Name
}

func snapshotAlbumTitle(album *models.LocalAlbum) string {
	if album == nil {
		return ""
	}
	return album.Title
}
