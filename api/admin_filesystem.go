package api

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// AdminFilesystemHandler exposes a read-only directory browser to admins so they
// can pick media library roots without needing shell access.
type AdminFilesystemHandler struct {
	middleware *AuthMiddleware
}

func NewAdminFilesystemHandler(middleware *AuthMiddleware) *AdminFilesystemHandler {
	return &AdminFilesystemHandler{middleware: middleware}
}

func (h *AdminFilesystemHandler) RegisterRoutes(mux *http.ServeMux) {
	adminChain := Chain(h.middleware.Authenticate, h.middleware.RequireAdmin)
	mux.HandleFunc("GET /api/admin/filesystem/list", adminChain(h.handleList))
}

type AdminFilesystemEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type AdminFilesystemListing struct {
	Platform      string                 `json:"platform"`
	CurrentPath   string                 `json:"current_path"`
	ParentPath    *string                `json:"parent_path,omitempty"`
	IsVirtualRoot bool                   `json:"is_virtual_root"`
	Separator     string                 `json:"separator"`
	Entries       []AdminFilesystemEntry `json:"entries"`
}

func (h *AdminFilesystemHandler) handleList(w http.ResponseWriter, r *http.Request) {
	requestedPath := r.URL.Query().Get("path")
	if requestedPath == "" {
		if runtime.GOOS == "windows" {
			writeAdminFilesystemJSON(w, http.StatusOK, AdminFilesystemListing{
				Platform:      runtime.GOOS,
				CurrentPath:   "",
				IsVirtualRoot: true,
				Separator:     string(filepath.Separator),
				Entries:       listWindowsDrives(),
			})
			return
		}
		requestedPath = string(filepath.Separator)
	}

	currentPath := filepath.Clean(requestedPath)
	if !filepath.IsAbs(currentPath) {
		writeAdminFilesystemError(w, http.StatusBadRequest, "path must be absolute")
		return
	}
	currentPath = normalizeAdminFilesystemPath(currentPath)

	info, err := os.Stat(currentPath)
	if err != nil {
		switch {
		case os.IsNotExist(err):
			writeAdminFilesystemError(w, http.StatusNotFound, err.Error())
		case os.IsPermission(err):
			writeAdminFilesystemError(w, http.StatusForbidden, err.Error())
		default:
			writeAdminFilesystemError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if !info.IsDir() {
		writeAdminFilesystemError(w, http.StatusNotFound, fmt.Sprintf("%s is not a directory", currentPath))
		return
	}

	entries, err := listAdminFilesystemEntries(currentPath)
	if err != nil {
		if os.IsPermission(err) {
			writeAdminFilesystemError(w, http.StatusForbidden, err.Error())
			return
		}
		writeAdminFilesystemError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeAdminFilesystemJSON(w, http.StatusOK, AdminFilesystemListing{
		Platform:      runtime.GOOS,
		CurrentPath:   currentPath,
		ParentPath:    parentAdminFilesystemPath(currentPath),
		IsVirtualRoot: false,
		Separator:     string(filepath.Separator),
		Entries:       entries,
	})
}

func listWindowsDrives() []AdminFilesystemEntry {
	entries := make([]AdminFilesystemEntry, 0, 26)
	for letter := 'A'; letter <= 'Z'; letter++ {
		drive := fmt.Sprintf("%c:\\", letter)
		if info, err := os.Stat(drive); err == nil && info.IsDir() {
			entries = append(entries, AdminFilesystemEntry{Name: drive, Path: drive})
		}
	}
	return entries
}

func listAdminFilesystemEntries(currentPath string) ([]AdminFilesystemEntry, error) {
	dirEntries, err := os.ReadDir(currentPath)
	if err != nil {
		return nil, err
	}

	entries := make([]AdminFilesystemEntry, 0, len(dirEntries))
	for _, entry := range dirEntries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}

		isDirectory := entry.IsDir()
		if !isDirectory && entry.Type()&fs.ModeSymlink != 0 {
			if info, err := os.Stat(filepath.Join(currentPath, name)); err == nil && info.IsDir() {
				isDirectory = true
			}
		}
		if !isDirectory {
			continue
		}

		entries = append(entries, AdminFilesystemEntry{
			Name: name,
			Path: filepath.Join(currentPath, name),
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		left := strings.ToLower(entries[i].Name)
		right := strings.ToLower(entries[j].Name)
		if left == right {
			return entries[i].Name < entries[j].Name
		}
		return left < right
	})

	return entries, nil
}

func normalizeAdminFilesystemPath(path string) string {
	if runtime.GOOS != "windows" {
		return path
	}

	volume := filepath.VolumeName(path)
	if volume == "" {
		return path
	}
	rest := path[len(volume):]
	if len(rest) == 1 && os.IsPathSeparator(rest[0]) {
		return volume + string(filepath.Separator)
	}
	return path
}

func parentAdminFilesystemPath(currentPath string) *string {
	if runtime.GOOS == "windows" && isWindowsDriveRoot(currentPath) {
		parent := ""
		return &parent
	}

	parent := normalizeAdminFilesystemPath(filepath.Dir(currentPath))
	if parent == currentPath {
		return nil
	}
	return &parent
}

func isWindowsDriveRoot(path string) bool {
	volume := filepath.VolumeName(path)
	if volume == "" {
		return false
	}
	rest := path[len(volume):]
	return len(rest) == 1 && os.IsPathSeparator(rest[0])
}

func writeAdminFilesystemJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeAdminFilesystemError(w http.ResponseWriter, status int, message string) {
	writeAdminFilesystemJSON(w, status, map[string]string{"error": message})
}
