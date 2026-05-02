package services

import (
	"strings"

	"main/models"
)

const shortReleaseMaxTrackCount = 6

func normalizeReleaseTypeValue(value string) models.ReleaseType {
	return models.NormalizeReleaseType(strings.ToLower(strings.TrimSpace(value)))
}

func classifyAppleReleaseType(name string, trackCount int, isSingle bool) models.ReleaseType {
	normalizedName := strings.ToLower(strings.TrimSpace(name))

	switch {
	case hasReleaseTitleSuffix(normalizedName, "single"), trackCount == 1:
		return models.ReleaseTypeSingle
	case hasReleaseTitleSuffix(normalizedName, "ep"):
		return models.ReleaseTypeEP
	case isSingle:
		return models.ReleaseTypeEP
	case trackCount >= 2 && trackCount <= shortReleaseMaxTrackCount:
		return models.ReleaseTypeEP
	default:
		return models.ReleaseTypeAlbum
	}
}

func hasReleaseTitleSuffix(name string, suffix string) bool {
	for _, candidate := range []string{
		" - " + suffix,
		" " + suffix,
		"-" + suffix,
		"(" + suffix + ")",
	} {
		if strings.HasSuffix(name, candidate) {
			return true
		}
	}
	return false
}

func releaseTypeFromMetadataFields(fields []*models.MetadataField) models.ReleaseType {
	for _, field := range fields {
		if field == nil || field.FieldName != "release_type" {
			continue
		}
		if value, ok := metadataStringDetail(field, "value"); ok {
			return normalizeReleaseTypeValue(value)
		}
	}
	return models.ReleaseTypeAlbum
}

func applyAlbumReleaseType(item *models.AlbumItem, releaseType models.ReleaseType) {
	if item == nil {
		return
	}
	item.ReleaseType = normalizeReleaseTypeValue(string(releaseType))
	item.IsSingle = models.ReleaseTypeIsSingle(item.ReleaseType)
}

func applyLibraryAlbumReleaseType(item *models.LibraryAlbum, releaseType models.ReleaseType) {
	if item == nil {
		return
	}
	item.ReleaseType = normalizeReleaseTypeValue(string(releaseType))
	item.IsSingle = models.ReleaseTypeIsSingle(item.ReleaseType)
}
