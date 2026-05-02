package services

import (
	"context"
	"strconv"
	"testing"

	"github.com/OwlCt/OwlPlayer/models"
)

func TestLocalLibrarySnapshotResolverResolveAlbumUsesReleaseTypeAndFallsBackToAlbum(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Resolver Artist",
		NormalizedName:     normalizeText("Resolver Artist"),
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}

	epAlbum, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Resolver EP",
		NormalizedTitle:    normalizeText("Resolver EP"),
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	if _, err := repo.SaveMetadataField(ctx, &models.MetadataField{
		EntityType: models.LocalEntityTypeAlbum,
		EntityID:   epAlbum.ID,
		FieldName:  "release_type",
		Source:     models.MetadataSourceRemote,
		Confidence: 0.92,
		IsEnhanced: true,
		Details: map[string]any{
			"value": "ep",
		},
	}); err != nil {
		t.Fatalf("SaveMetadataField() error = %v", err)
	}

	fallbackAlbum, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Resolver Album",
		NormalizedTitle:    normalizeText("Resolver Album"),
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}

	resolver := newLocalLibrarySnapshotResolver(repo)
	epItem, err := resolver.ResolveAlbum(ctx, strconv.FormatInt(epAlbum.ID, 10))
	if err != nil {
		t.Fatalf("ResolveAlbum(ep) error = %v", err)
	}
	if epItem.ReleaseType != models.ReleaseTypeEP || !epItem.IsSingle {
		t.Fatalf("expected EP release type, got %#v", epItem)
	}

	fallbackItem, err := resolver.ResolveAlbum(ctx, strconv.FormatInt(fallbackAlbum.ID, 10))
	if err != nil {
		t.Fatalf("ResolveAlbum(album) error = %v", err)
	}
	if fallbackItem.ReleaseType != models.ReleaseTypeAlbum || fallbackItem.IsSingle {
		t.Fatalf("expected album fallback, got %#v", fallbackItem)
	}
}

func TestLibraryAlbumsServiceHydrateLibraryAlbumsUsesSnapshotReleaseTypeAndFallbackAlbum(t *testing.T) {
	repo := newInMemoryLocalLibraryRepo()
	ctx := context.Background()

	artist, err := repo.SaveArtist(ctx, &models.LocalArtist{
		Name:               "Library Artist",
		NormalizedName:     normalizeText("Library Artist"),
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveArtist() error = %v", err)
	}

	singleAlbum, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Library Single",
		NormalizedTitle:    normalizeText("Library Single"),
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}
	if _, err := repo.SaveMetadataField(ctx, &models.MetadataField{
		EntityType: models.LocalEntityTypeAlbum,
		EntityID:   singleAlbum.ID,
		FieldName:  "release_type",
		Source:     models.MetadataSourceRemote,
		Confidence: 0.95,
		IsEnhanced: true,
		Details: map[string]any{
			"value": "single",
		},
	}); err != nil {
		t.Fatalf("SaveMetadataField() error = %v", err)
	}

	fallbackAlbum, err := repo.SaveAlbum(ctx, &models.LocalAlbum{
		Title:              "Library Album",
		NormalizedTitle:    normalizeText("Library Album"),
		PrimaryArtistID:    artist.ID,
		AvailabilityStatus: models.AvailabilityStatusAvailable,
	})
	if err != nil {
		t.Fatalf("SaveAlbum() error = %v", err)
	}

	service := &LibraryAlbumsService{repo: repo}
	albums := []*models.LibraryAlbum{
		{AlbumID: strconv.FormatInt(singleAlbum.ID, 10)},
		{AlbumID: strconv.FormatInt(fallbackAlbum.ID, 10)},
	}

	service.hydrateLibraryAlbums(ctx, albums)

	if albums[0].ReleaseType != models.ReleaseTypeSingle || !albums[0].IsSingle {
		t.Fatalf("expected hydrated single classification, got %#v", albums[0])
	}
	if albums[1].ReleaseType != models.ReleaseTypeAlbum || albums[1].IsSingle {
		t.Fatalf("expected hydrated album fallback, got %#v", albums[1])
	}
}
