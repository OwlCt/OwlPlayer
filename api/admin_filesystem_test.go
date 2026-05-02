package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAdminFilesystemListsDirectoriesInAlphabeticalOrder(t *testing.T) {
	root := t.TempDir()
	mustMkdir(t, filepath.Join(root, "zeta"))
	mustMkdir(t, filepath.Join(root, "Alpha"))
	mustMkdir(t, filepath.Join(root, ".hidden"))
	mustMkdir(t, filepath.Join(root, "beta"))
	if err := os.WriteFile(filepath.Join(root, "track.mp3"), []byte("audio"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	recorder := performAdminFilesystemList(root)
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var listing AdminFilesystemListing
	if err := json.NewDecoder(recorder.Body).Decode(&listing); err != nil {
		t.Fatalf("decode listing: %v", err)
	}

	wantNames := []string{"Alpha", "beta", "zeta"}
	if len(listing.Entries) != len(wantNames) {
		t.Fatalf("expected %d entries, got %d: %#v", len(wantNames), len(listing.Entries), listing.Entries)
	}
	for index, wantName := range wantNames {
		if listing.Entries[index].Name != wantName {
			t.Fatalf("entry %d name = %q, want %q", index, listing.Entries[index].Name, wantName)
		}
		wantPath := filepath.Join(root, wantName)
		if listing.Entries[index].Path != wantPath {
			t.Fatalf("entry %d path = %q, want %q", index, listing.Entries[index].Path, wantPath)
		}
	}
	if listing.CurrentPath != filepath.Clean(root) {
		t.Fatalf("current_path = %q, want %q", listing.CurrentPath, filepath.Clean(root))
	}
}

func TestAdminFilesystemNonExistentPathReturns404(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	recorder := performAdminFilesystemList(missing)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminFilesystemRelativePathReturns400(t *testing.T) {
	recorder := performAdminFilesystemList("relative/path")
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestAdminFilesystemEmptyPathListsRootOnUnix(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("empty path lists Windows drives on Windows")
	}

	recorder := performAdminFilesystemList("")
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}

	var listing AdminFilesystemListing
	if err := json.NewDecoder(recorder.Body).Decode(&listing); err != nil {
		t.Fatalf("decode listing: %v", err)
	}
	if listing.CurrentPath != string(filepath.Separator) {
		t.Fatalf("current_path = %q, want %q", listing.CurrentPath, string(filepath.Separator))
	}
	if listing.IsVirtualRoot {
		t.Fatal("expected real root listing, got virtual root")
	}
}

func performAdminFilesystemList(path string) *httptest.ResponseRecorder {
	target := "/api/admin/filesystem/list"
	if path != "" {
		target += "?path=" + url.QueryEscape(path)
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	recorder := httptest.NewRecorder()
	handler := NewAdminFilesystemHandler(nil)
	handler.handleList(recorder, req)
	return recorder
}

func mustMkdir(t *testing.T, path string) {
	t.Helper()
	if err := os.Mkdir(path, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", path, err)
	}
}
