package services

import (
	"context"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"os"
	"path/filepath"
	"strings"
	"time"
)

func resolvedStringValue(candidate localMetadataCandidate, fallback string) string {
	if value, ok := candidate.Value.(string); ok && strings.TrimSpace(value) != "" {
		return strings.TrimSpace(value)
	}
	return fallback
}

func keepExistingName(artist *models.LocalArtist, incoming string) bool {
	return artist != nil && artist.Name != "" && incoming != "" && normalizeText(artist.Name) == normalizeText(incoming)
}

func keepExistingAlbum(album *models.LocalAlbum, incoming string, artistID int64) bool {
	return album != nil && album.Title != "" && incoming != "" && normalizeText(album.Title) == normalizeText(incoming) && album.PrimaryArtistID == artistID
}

func applyResolvedMedia(ctx context.Context, repo LocalLibraryRepository, media *models.LocalMedia, resolved *localResolvedMetadata) {
	if media == nil || resolved == nil {
		return
	}

	if shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "title", resolved.Title, false) {
		media.Title = resolvedStringValue(resolved.Title, media.Title)
		media.NormalizedTitle = normalizeText(media.Title)
		if media.SortTitle == "" {
			media.SortTitle = media.Title
		}
	}
	if value, ok := resolved.DurationMs.Value.(int); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "duration_ms", resolved.DurationMs, false) {
		media.DurationMs = value
	}
	if value, ok := resolved.TrackNumber.Value.(int); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "track_number", resolved.TrackNumber, false) {
		media.TrackNumber = value
	}
	if value, ok := resolved.TrackTotal.Value.(int); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "track_total", resolved.TrackTotal, false) {
		media.TrackTotal = value
	}
	if value, ok := resolved.DiscNumber.Value.(int); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "disc_number", resolved.DiscNumber, false) {
		media.DiscNumber = value
	}
	if value, ok := resolved.DiscTotal.Value.(int); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "disc_total", resolved.DiscTotal, false) {
		media.DiscTotal = value
	}
	if value, ok := resolved.Genres.Value.([]string); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "genres", resolved.Genres, false) {
		media.Genres = append([]string(nil), value...)
	}
	if shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "composer", resolved.Composer, false) {
		media.Composer = resolvedStringValue(resolved.Composer, media.Composer)
	}
	if value, ok := resolved.ReleaseDate.Value.(time.Time); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "release_date", resolved.ReleaseDate, false) {
		media.ReleaseDate = &value
	}
	if shouldApplyCandidate(ctx, repo, models.LocalEntityTypeMedia, media.ID, "content_rating", resolved.ContentRating, false) {
		media.ContentRating = resolvedStringValue(resolved.ContentRating, media.ContentRating)
	}
	if value, ok := resolved.LyricsAvailable.Value.(bool); ok && value {
		media.LyricsAvailable = true
	}
}

func applyResolvedAlbum(ctx context.Context, repo LocalLibraryRepository, album *models.LocalAlbum, resolved *localResolvedMetadata) {
	if album == nil || resolved == nil {
		return
	}

	if shouldApplyCandidate(ctx, repo, models.LocalEntityTypeAlbum, album.ID, "title", resolved.AlbumTitle, false) {
		album.Title = resolvedStringValue(resolved.AlbumTitle, album.Title)
		album.NormalizedTitle = normalizeText(album.Title)
		if album.SortTitle == "" {
			album.SortTitle = album.Title
		}
	}
	if value, ok := resolved.ReleaseDate.Value.(time.Time); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeAlbum, album.ID, "release_date", resolved.ReleaseDate, false) {
		album.ReleaseDate = &value
		album.ReleaseYear = value.Year()
	}
	if value, ok := resolved.TrackTotal.Value.(int); ok && shouldApplyCandidate(ctx, repo, models.LocalEntityTypeAlbum, album.ID, "total_tracks", resolved.TrackTotal, false) {
		album.TotalTracks = value
	}
}

func applyResolvedArtist(ctx context.Context, repo LocalLibraryRepository, artist *models.LocalArtist, resolved *localResolvedMetadata) {
	if artist == nil || resolved == nil {
		return
	}

	if shouldApplyCandidate(ctx, repo, models.LocalEntityTypeArtist, artist.ID, "name", resolved.ArtistName, false) {
		artist.Name = resolvedStringValue(resolved.ArtistName, artist.Name)
		artist.NormalizedName = normalizeText(artist.Name)
		if artist.SortName == "" {
			artist.SortName = artist.Name
		}
	}
}

func (s *LocalMediaScanner) persistResolvedMetadata(
	ctx context.Context,
	media *models.LocalMedia,
	album *models.LocalAlbum,
	artist *models.LocalArtist,
	file *models.LocalMediaFile,
	resolved *localResolvedMetadata,
) error {
	if media == nil || album == nil || artist == nil || file == nil || resolved == nil {
		return nil
	}

	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "title", resolved.Title, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "duration_ms", resolved.DurationMs, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeArtist, artist.ID, "name", resolved.ArtistName, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeAlbum, album.ID, "title", resolved.AlbumTitle, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "track_number", resolved.TrackNumber, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "track_total", resolved.TrackTotal, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "disc_number", resolved.DiscNumber, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "disc_total", resolved.DiscTotal, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeAlbum, album.ID, "total_tracks", resolved.TrackTotal, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "genres", resolved.Genres, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "composer", resolved.Composer, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "release_date", resolved.ReleaseDate, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeAlbum, album.ID, "release_date", resolved.ReleaseDate, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "content_rating", resolved.ContentRating, false); err != nil {
		return err
	}
	if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeMedia, media.ID, "lyrics_available", resolved.LyricsAvailable, false); err != nil {
		return err
	}

	if resolved.MotionArtwork.Value != nil {
		if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeAlbum, album.ID, "motion_artwork", resolved.MotionArtwork, false); err != nil {
			return err
		}
	}

	if resolved.Artwork != nil {
		artworkField := localMetadataCandidate{
			Source:     resolved.Artwork.Source,
			Confidence: resolved.Artwork.Confidence,
			Details:    cloneDetails(resolved.Artwork.Details),
		}

		if len(resolved.Artwork.Data) > 0 {
			artworkPath, err := persistArtworkData(album.ID, resolved.Artwork)
			if err != nil {
				return fmt.Errorf("persist artwork: %w", err)
			}
			artworkField.Value = artworkPath
			if artworkField.Details == nil {
				artworkField.Details = map[string]any{}
			}
			artworkField.Details["path"] = artworkPath
			album.ArtworkPath = artworkPath
			album.ArtworkURL = ""
			if _, err := s.repo.SaveAlbum(ctx, album); err != nil {
				return fmt.Errorf("save album artwork path: %w", err)
			}
		} else if resolved.Artwork.Path != "" {
			artworkField.Value = resolved.Artwork.Path
			if artworkField.Details == nil {
				artworkField.Details = map[string]any{}
			}
			artworkField.Details["path"] = resolved.Artwork.Path
			album.ArtworkPath = resolved.Artwork.Path
			album.ArtworkURL = ""
			if _, err := s.repo.SaveAlbum(ctx, album); err != nil {
				return fmt.Errorf("save album sidecar artwork path: %w", err)
			}
		}

		if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeAlbum, album.ID, "artwork", artworkField, false); err != nil {
			return err
		}
	}

	artistArtworkField := localMetadataCandidate{}
	switch {
	case resolved.ArtistArtwork != nil && resolved.ArtistArtwork.Path != "":
		artistArtworkField = localMetadataCandidate{
			Value:      resolved.ArtistArtwork.Path,
			Source:     resolved.ArtistArtwork.Source,
			Confidence: resolved.ArtistArtwork.Confidence,
			Details:    cloneDetails(resolved.ArtistArtwork.Details),
		}
	case artist.ArtworkPath == "" && album.ArtworkPath != "":
		artistArtworkField = localMetadataCandidate{
			Value:      album.ArtworkPath,
			Source:     models.MetadataSourceSystem,
			Confidence: 0.35,
			Details: map[string]any{
				"resolver": "album_artwork_fallback",
				"path":     album.ArtworkPath,
				"album_id": album.ID,
			},
		}
	}

	if artworkPath, ok := artistArtworkField.Value.(string); ok && artworkPath != "" {
		if shouldApplyCandidate(ctx, s.repo, models.LocalEntityTypeArtist, artist.ID, "artwork", artistArtworkField, false) {
			artist.ArtworkPath = artworkPath
			artist.ArtworkURL = ""
			if _, err := s.repo.SaveArtist(ctx, artist); err != nil {
				return fmt.Errorf("save artist artwork path: %w", err)
			}
			if err := saveCandidateField(ctx, s.repo, models.LocalEntityTypeArtist, artist.ID, "artwork", artistArtworkField, false); err != nil {
				return err
			}
		}
	}

	return nil
}

func persistArtworkData(albumID int64, artwork *localArtworkCandidate) (string, error) {
	dir := filepath.Join(".cache", "local-media-artwork")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(dir, fmt.Sprintf("album-%d%s", albumID, artworkExtensionFromMIME(artwork.MIMEType)))
	if err := os.WriteFile(path, artwork.Data, 0o644); err != nil {
		return "", err
	}
	return path, nil
}

func saveCandidateField(
	ctx context.Context,
	repo LocalLibraryRepository,
	entityType models.LocalEntityType,
	entityID int64,
	fieldName string,
	candidate localMetadataCandidate,
	enhanced bool,
) error {
	if entityID == 0 || repo == nil || candidate.Value == nil {
		return nil
	}
	if !shouldApplyCandidate(ctx, repo, entityType, entityID, fieldName, candidate, enhanced) {
		return nil
	}

	details := cloneDetails(candidate.Details)
	if details == nil {
		details = map[string]any{}
	}
	switch value := candidate.Value.(type) {
	case string:
		if value == "" {
			return nil
		}
		details["value"] = value
	case int:
		if value <= 0 {
			return nil
		}
		details["value"] = value
	case bool:
		details["value"] = value
	case []string:
		if len(value) == 0 {
			return nil
		}
		details["value"] = append([]string(nil), value...)
	case time.Time:
		details["value"] = value.Format("2006-01-02")
	default:
		details["value"] = value
	}

	_, err := repo.SaveMetadataField(ctx, &models.MetadataField{
		EntityType: entityType,
		EntityID:   entityID,
		FieldName:  fieldName,
		Source:     candidate.Source,
		Confidence: candidate.Confidence,
		IsEnhanced: enhanced,
		Details:    details,
	})
	if err != nil {
		return fmt.Errorf("save metadata field %s/%d/%s: %w", entityType, entityID, fieldName, err)
	}
	return nil
}

func shouldApplyCandidate(
	ctx context.Context,
	repo LocalLibraryRepository,
	entityType models.LocalEntityType,
	entityID int64,
	fieldName string,
	candidate localMetadataCandidate,
	enhanced bool,
) bool {
	if entityID == 0 || repo == nil {
		return true
	}
	fields, err := repo.ListMetadataFields(ctx, entityType, entityID)
	if err != nil {
		return true
	}
	for _, field := range fields {
		if field.FieldName != fieldName {
			continue
		}
		if field.IsEnhanced && !enhanced {
			return true
		}
		if !field.IsEnhanced && enhanced {
			return false
		}
		return candidate.Confidence >= field.Confidence
	}
	return true
}

func cloneDetails(details map[string]any) map[string]any {
	if len(details) == 0 {
		return nil
	}
	cloned := make(map[string]any, len(details))
	for key, value := range details {
		cloned[key] = value
	}
	return cloned
}

func (s *LocalMediaScanner) enqueueMetadataEnhancement(mediaID int64) {
	if s.enhancer == nil {
		return
	}
	s.enhancer.ScheduleEnhanceMedia(mediaID)
}
