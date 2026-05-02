package services

import (
	"os"
	"path/filepath"
	"strings"
)

var (
	albumArtworkBaseNames  = []string{"cover", "folder", "front", "album", "artwork"}
	artistArtworkBaseNames = []string{"artist", "folder", "cover", "front", "poster", "fanart"}
	motionArtworkBaseNames = []string{"cover", "folder", "album", "motion"}
	imageExtensions        = []string{".jpg", ".jpeg", ".png", ".webp", ".gif"}
	motionExtensions       = []string{".mp4", ".webm", ".mov", ".m4v"}
)

func findSidecarArtwork(absolutePath string) string {
	return findNamedFileInDir(filepath.Dir(absolutePath), albumArtworkBaseNames, imageExtensions)
}

func findMotionArtwork(absolutePath string) string {
	return findNamedFileInDir(filepath.Dir(absolutePath), motionArtworkBaseNames, motionExtensions)
}

func findSidecarLyrics(absolutePath string) string {
	dir := filepath.Dir(absolutePath)
	baseName := strings.TrimSuffix(filepath.Base(absolutePath), filepath.Ext(absolutePath))
	if dir == "" || baseName == "" {
		return ""
	}

	lowerBase := strings.ToLower(baseName)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}

	var lrcPath string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".ttml" && ext != ".lrc" {
			continue
		}
		if strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name))) != lowerBase {
			continue
		}

		path := filepath.Join(dir, name)
		if ext == ".ttml" {
			return path
		}
		if lrcPath == "" {
			lrcPath = path
		}
	}

	return lrcPath
}

func findArtistArtwork(libraryRoot, relativePath string) string {
	parts := splitPath(filepath.Dir(relativePath))
	if len(parts) == 0 {
		return ""
	}

	artistParts := parts
	if len(parts) > 1 {
		artistParts = parts[:len(parts)-1]
	}

	artistDir := libraryRoot
	for _, part := range artistParts {
		artistDir = filepath.Join(artistDir, part)
	}

	return findNamedFileInDir(artistDir, artistArtworkBaseNames, imageExtensions)
}

func findNamedFileInDir(dir string, baseNames []string, extensions []string) string {
	if dir == "" {
		return ""
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return ""
	}

	byName := make(map[string]string, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		name := entry.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if !containsExtension(extensions, ext) {
			continue
		}
		base := strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
		if _, exists := byName[base+ext]; !exists {
			byName[base+ext] = filepath.Join(dir, name)
		}
	}

	for _, baseName := range baseNames {
		for _, ext := range extensions {
			if path, ok := byName[baseName+ext]; ok {
				return path
			}
		}
	}

	return ""
}

func containsExtension(extensions []string, value string) bool {
	for _, extension := range extensions {
		if extension == value {
			return true
		}
	}
	return false
}
