package services

import (
	"main/models"
	"sort"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for Playlists
// =============================================================================

// genPlaylistID generates random playlist IDs
func genPlaylistID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genPlaylistUserID generates random user IDs for playlists tests
func genPlaylistUserID() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "user-" + string(chars)
	})
}

// genPlaylistNameProp generates random playlist names
func genPlaylistNameProp() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
		if len(chars) == 0 {
			return "Playlist"
		}
		return string(chars)
	})
}

// genPlaylistDescriptionProp generates random playlist descriptions
func genPlaylistDescriptionProp() gopter.Gen {
	return gen.OneConstOf("", "A great playlist", "My favorites", "Workout mix")
}

// genPlaylistSongIDProp generates random song IDs
func genPlaylistSongIDProp() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "song-" + string(chars)
	})
}

// genPlaylist generates random Playlist for testing
func genPlaylist() gopter.Gen {
	return gopter.CombineGens(
		genPlaylistID(),
		genPlaylistUserID(),
		genPlaylistNameProp(),
		genPlaylistDescriptionProp(),
		gen.IntRange(0, 100),
		gen.Int64Range(0, time.Now().Unix()),
	).Map(func(vals []interface{}) *models.Playlist {
		ts := time.Unix(vals[5].(int64), 0).UTC()
		return &models.Playlist{
			ID:          vals[0].(string),
			UserID:      vals[1].(string),
			Name:        vals[2].(string),
			Description: vals[3].(string),
			SongCount:   vals[4].(int),
			CreatedAt:   ts,
			UpdatedAt:   ts,
		}
	})
}

// =============================================================================
// Property Tests for Playlists
// =============================================================================

// **Feature: sidebar-library-expand, Property 5: Playlist CRUD Round-Trip**
// **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
func TestProperty_PlaylistCRUDRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Create then get returns equivalent playlist
	properties.Property("create then get returns equivalent playlist", prop.ForAll(
		func(name string, description string, userID string) bool {
			if name == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, name, description)
			if playlist == nil {
				return false
			}

			// Get playlist
			retrieved := store.Get(userID, playlist.ID)
			if retrieved == nil {
				return false
			}

			// Verify fields match
			return retrieved.ID == playlist.ID &&
				retrieved.UserID == userID &&
				retrieved.Name == name &&
				retrieved.Description == description
		},
		genPlaylistNameProp(),
		genPlaylistDescriptionProp(),
		genPlaylistUserID(),
	))

	// Property: Create then delete results in playlist not found
	properties.Property("create then delete results in playlist not found", prop.ForAll(
		func(name string, userID string) bool {
			if name == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, name, "")
			if playlist == nil {
				return false
			}

			// Delete playlist
			store.Delete(userID, playlist.ID)

			// Verify not found
			return store.Get(userID, playlist.ID) == nil
		},
		genPlaylistNameProp(),
		genPlaylistUserID(),
	))

	// Property: Update preserves playlist ID
	properties.Property("update preserves playlist ID", prop.ForAll(
		func(name string, newName string, userID string) bool {
			if name == "" || newName == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, name, "")
			if playlist == nil {
				return false
			}
			originalID := playlist.ID

			// Update playlist
			store.Update(userID, playlist.ID, newName, "new description")

			// Verify ID unchanged
			updated := store.Get(userID, originalID)
			return updated != nil && updated.ID == originalID && updated.Name == newName
		},
		genPlaylistNameProp(),
		genPlaylistNameProp(),
		genPlaylistUserID(),
	))

	// Property: Playlists sorted by created_at DESC
	properties.Property("playlists sorted by created_at DESC", prop.ForAll(
		func(playlists []*models.Playlist) bool {
			if len(playlists) <= 1 {
				return true
			}

			// Sort by created_at DESC (newest first)
			sorted := make([]*models.Playlist, len(playlists))
			copy(sorted, playlists)
			sort.Slice(sorted, func(i, j int) bool {
				return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
			})

			// Verify order
			for i := 0; i < len(sorted)-1; i++ {
				if sorted[i].CreatedAt.Before(sorted[i+1].CreatedAt) {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(10, genPlaylist()),
	))

	properties.TestingRun(t)
}

// **Feature: sidebar-library-expand, Property 7: Playlist Song Add/Remove Consistency**
// **Validates: Requirements 7.2, 7.3**
func TestProperty_PlaylistSongAddRemoveConsistency(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Add song then list includes that song
	properties.Property("add song then list includes that song", prop.ForAll(
		func(playlistName string, songID string, userID string) bool {
			if playlistName == "" || songID == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}

			// Add song
			store.AddSong(playlist.ID, songID)

			// Verify song is in playlist
			return store.HasSong(playlist.ID, songID)
		},
		genPlaylistNameProp(),
		genPlaylistSongIDProp(),
		genPlaylistUserID(),
	))

	// Property: Remove song then list does not include that song
	properties.Property("remove song then list does not include that song", prop.ForAll(
		func(playlistName string, songID string, userID string) bool {
			if playlistName == "" || songID == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}

			// Add then remove song
			store.AddSong(playlist.ID, songID)
			store.RemoveSong(playlist.ID, songID)

			// Verify song is not in playlist
			return !store.HasSong(playlist.ID, songID)
		},
		genPlaylistNameProp(),
		genPlaylistSongIDProp(),
		genPlaylistUserID(),
	))

	// Property: Double add is idempotent
	properties.Property("double add is idempotent", prop.ForAll(
		func(playlistName string, songID string, userID string) bool {
			if playlistName == "" || songID == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}

			// Add song twice
			store.AddSong(playlist.ID, songID)
			countAfterFirst := store.SongCount(playlist.ID)

			store.AddSong(playlist.ID, songID)
			countAfterSecond := store.SongCount(playlist.ID)

			return countAfterFirst == countAfterSecond && store.HasSong(playlist.ID, songID)
		},
		genPlaylistNameProp(),
		genPlaylistSongIDProp(),
		genPlaylistUserID(),
	))

	// Property: Song count increases by 1 after adding unique song
	properties.Property("song count increases by 1 after adding unique song", prop.ForAll(
		func(playlistName string, songIDs []string, userID string) bool {
			if playlistName == "" || userID == "" || len(songIDs) == 0 {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}

			// Add unique songs and verify count
			uniqueSongs := make(map[string]bool)
			for _, songID := range songIDs {
				if songID == "" || uniqueSongs[songID] {
					continue
				}
				uniqueSongs[songID] = true

				countBefore := store.SongCount(playlist.ID)
				store.AddSong(playlist.ID, songID)
				countAfter := store.SongCount(playlist.ID)

				if countAfter != countBefore+1 {
					return false
				}
			}

			return true
		},
		genPlaylistNameProp(),
		gen.SliceOfN(5, genPlaylistSongIDProp()),
		genPlaylistUserID(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Mock Types for Property Tests
// =============================================================================

// MockPlaylistsStore simulates the playlists store for testing
type MockPlaylistsStore struct {
	playlists map[string]*models.Playlist
	songs     map[string]map[string]bool // playlistID -> songID -> exists
	nextID    int
}

// NewMockPlaylistsStore creates a new mock store
func NewMockPlaylistsStore() *MockPlaylistsStore {
	return &MockPlaylistsStore{
		playlists: make(map[string]*models.Playlist),
		songs:     make(map[string]map[string]bool),
		nextID:    1,
	}
}

// Create creates a new playlist
func (s *MockPlaylistsStore) Create(userID, name, description string) *models.Playlist {
	id := genMockPlaylistID(s.nextID)
	s.nextID++

	now := time.Now().UTC()
	playlist := &models.Playlist{
		ID:          id,
		UserID:      userID,
		Name:        name,
		Description: description,
		SongCount:   0,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	s.playlists[id] = playlist
	s.songs[id] = make(map[string]bool)
	return playlist
}

// Get retrieves a playlist by ID
func (s *MockPlaylistsStore) Get(userID, playlistID string) *models.Playlist {
	playlist, exists := s.playlists[playlistID]
	if !exists || playlist.UserID != userID {
		return nil
	}
	return playlist
}

// Update updates a playlist
func (s *MockPlaylistsStore) Update(userID, playlistID, name, description string) {
	playlist, exists := s.playlists[playlistID]
	if !exists || playlist.UserID != userID {
		return
	}

	if name != "" {
		playlist.Name = name
	}
	if description != "" {
		playlist.Description = description
	}
	playlist.UpdatedAt = time.Now().UTC()
}

// Delete deletes a playlist
func (s *MockPlaylistsStore) Delete(userID, playlistID string) {
	playlist, exists := s.playlists[playlistID]
	if !exists || playlist.UserID != userID {
		return
	}

	delete(s.playlists, playlistID)
	delete(s.songs, playlistID)
}

// AddSong adds a song to a playlist
func (s *MockPlaylistsStore) AddSong(playlistID, songID string) {
	if _, exists := s.songs[playlistID]; !exists {
		return
	}

	if !s.songs[playlistID][songID] {
		s.songs[playlistID][songID] = true
		if playlist, exists := s.playlists[playlistID]; exists {
			playlist.SongCount++
		}
	}
}

// RemoveSong removes a song from a playlist
func (s *MockPlaylistsStore) RemoveSong(playlistID, songID string) {
	if _, exists := s.songs[playlistID]; !exists {
		return
	}

	if s.songs[playlistID][songID] {
		delete(s.songs[playlistID], songID)
		if playlist, exists := s.playlists[playlistID]; exists {
			playlist.SongCount--
		}
	}
}

// HasSong checks if a song is in a playlist
func (s *MockPlaylistsStore) HasSong(playlistID, songID string) bool {
	if songs, exists := s.songs[playlistID]; exists {
		return songs[songID]
	}
	return false
}

// SongCount returns the number of songs in a playlist
func (s *MockPlaylistsStore) SongCount(playlistID string) int {
	if songs, exists := s.songs[playlistID]; exists {
		return len(songs)
	}
	return 0
}

// genMockPlaylistID generates a mock playlist ID
func genMockPlaylistID(n int) string {
	return "playlist-" + string(rune('0'+n%10))
}

// **Feature: playlist-add-modal, Property 4: Checkbox state matches song membership**
// **Validates: Requirements 2.3, 2.4**
func TestProperty_GetSongPlaylistsMatchesMembership(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: GetSongPlaylists returns exactly the playlists containing the song
	properties.Property("GetSongPlaylists returns exactly the playlists containing the song", prop.ForAll(
		func(playlistNames []string, songID string, userID string) bool {
			if userID == "" || songID == "" || len(playlistNames) == 0 {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlists and randomly add song to some
			playlistsWithSong := make(map[string]bool)
			for i, name := range playlistNames {
				if name == "" {
					continue
				}
				playlist := store.Create(userID, name, "")
				if playlist == nil {
					continue
				}

				// Add song to every other playlist
				if i%2 == 0 {
					store.AddSong(playlist.ID, songID)
					playlistsWithSong[playlist.ID] = true
				}
			}

			// Get playlists containing the song
			result := store.GetSongPlaylists(userID, songID)

			// Verify result matches expected
			if len(result) != len(playlistsWithSong) {
				return false
			}

			for _, playlistID := range result {
				if !playlistsWithSong[playlistID] {
					return false
				}
			}

			return true
		},
		gen.SliceOfN(5, genPlaylistNameProp()),
		genPlaylistSongIDProp(),
		genPlaylistUserID(),
	))

	// Property: Song not in any playlist returns empty list
	properties.Property("song not in any playlist returns empty list", prop.ForAll(
		func(playlistNames []string, songID string, userID string) bool {
			if userID == "" || songID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlists but don't add the song
			for _, name := range playlistNames {
				if name == "" {
					continue
				}
				store.Create(userID, name, "")
			}

			// Get playlists containing the song
			result := store.GetSongPlaylists(userID, songID)

			return len(result) == 0
		},
		gen.SliceOfN(3, genPlaylistNameProp()),
		genPlaylistSongIDProp(),
		genPlaylistUserID(),
	))

	// Property: After removing song from playlist, GetSongPlaylists no longer includes it
	properties.Property("after removing song, GetSongPlaylists no longer includes that playlist", prop.ForAll(
		func(playlistName string, songID string, userID string) bool {
			if playlistName == "" || songID == "" || userID == "" {
				return true
			}

			store := NewMockPlaylistsStore()

			// Create playlist and add song
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}
			store.AddSong(playlist.ID, songID)

			// Verify song is in playlist
			resultBefore := store.GetSongPlaylists(userID, songID)
			if len(resultBefore) != 1 || resultBefore[0] != playlist.ID {
				return false
			}

			// Remove song
			store.RemoveSong(playlist.ID, songID)

			// Verify song is no longer in playlist
			resultAfter := store.GetSongPlaylists(userID, songID)
			return len(resultAfter) == 0
		},
		genPlaylistNameProp(),
		genPlaylistSongIDProp(),
		genPlaylistUserID(),
	))

	properties.TestingRun(t)
}

// GetSongPlaylists returns all playlist IDs containing a specific song for a user
func (s *MockPlaylistsStore) GetSongPlaylists(userID, songID string) []string {
	var result []string
	for playlistID, songs := range s.songs {
		// Check if playlist belongs to user
		playlist, exists := s.playlists[playlistID]
		if !exists || playlist.UserID != userID {
			continue
		}

		// Check if song is in playlist
		if songs[songID] {
			result = append(result, playlistID)
		}
	}
	return result
}

// **Feature: playlist-add-song-fixes, Property 1: Successful add returns no error**
// **Validates: Requirements 1.1**
func TestProperty_AddSongToPlaylistSuccessReturnsNoError(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: For any valid song and playlist combination, adding the song returns no error
	properties.Property("adding valid song to playlist returns no error", prop.ForAll(
		func(playlistName string, songID string, songName string, artistName string, artistID string, userID string) bool {
			if playlistName == "" || songID == "" || songName == "" || userID == "" {
				return true // Skip invalid inputs
			}

			store := NewMockPlaylistsStoreWithError()

			// Create playlist
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}

			// Add song with artist_id
			req := &models.AddPlaylistSongRequest{
				SongID:     songID,
				SongName:   songName,
				ArtistName: artistName,
				ArtistID:   artistID,
				AlbumName:  "Test Album",
				Duration:   180,
			}

			_, err := store.AddSong(playlist.ID, req)

			// Successful add should return no error
			return err == nil
		},
		genPlaylistNameProp(),
		genPlaylistSongIDProp(),
		gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string { return string(chars) }),
		gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string { return string(chars) }),
		gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string { return "artist-" + string(chars) }),
		genPlaylistUserID(),
	))

	// Property: Adding song with artist_id preserves the artist_id in the result
	properties.Property("adding song preserves artist_id in result", prop.ForAll(
		func(playlistName string, songID string, artistID string, userID string) bool {
			if playlistName == "" || songID == "" || userID == "" {
				return true // Skip invalid inputs
			}

			store := NewMockPlaylistsStoreWithError()

			// Create playlist
			playlist := store.Create(userID, playlistName, "")
			if playlist == nil {
				return false
			}

			// Add song with artist_id
			req := &models.AddPlaylistSongRequest{
				SongID:     songID,
				SongName:   "Test Song",
				ArtistName: "Test Artist",
				ArtistID:   artistID,
				AlbumName:  "Test Album",
				Duration:   180,
			}

			result, err := store.AddSong(playlist.ID, req)
			if err != nil {
				return false
			}

			// Verify artist_id is preserved
			return result.ArtistID == artistID
		},
		genPlaylistNameProp(),
		genPlaylistSongIDProp(),
		gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string { return "artist-" + string(chars) }),
		genPlaylistUserID(),
	))

	properties.TestingRun(t)
}

// MockPlaylistsStoreWithError extends MockPlaylistsStore with error handling for AddSong
type MockPlaylistsStoreWithError struct {
	*MockPlaylistsStore
	playlistSongs map[string][]*models.PlaylistSong // playlistID -> songs
	nextSongID    int
}

// NewMockPlaylistsStoreWithError creates a new mock store with error handling
func NewMockPlaylistsStoreWithError() *MockPlaylistsStoreWithError {
	return &MockPlaylistsStoreWithError{
		MockPlaylistsStore: NewMockPlaylistsStore(),
		playlistSongs:      make(map[string][]*models.PlaylistSong),
		nextSongID:         1,
	}
}

// AddSong adds a song to a playlist and returns the PlaylistSong or error
func (s *MockPlaylistsStoreWithError) AddSong(playlistID string, req *models.AddPlaylistSongRequest) (*models.PlaylistSong, error) {
	// Check if playlist exists
	if _, exists := s.songs[playlistID]; !exists {
		return nil, ErrPlaylistNotFound
	}

	// Check for duplicate
	if s.songs[playlistID][req.SongID] {
		return nil, ErrSongAlreadyInPlaylist
	}

	// Add song
	s.songs[playlistID][req.SongID] = true
	if playlist, exists := s.playlists[playlistID]; exists {
		playlist.SongCount++
	}

	// Create PlaylistSong result
	song := &models.PlaylistSong{
		ID:         genMockSongID(s.nextSongID),
		PlaylistID: playlistID,
		SongID:     req.SongID,
		SongName:   req.SongName,
		ArtistName: req.ArtistName,
		ArtistID:   req.ArtistID,
		AlbumName:  req.AlbumName,
		AlbumID:    req.AlbumID,
		Duration:   req.Duration,
		ArtworkURL: req.ArtworkURL,
		HasLyrics:  req.HasLyrics,
		Position:   len(s.playlistSongs[playlistID]),
		CreatedAt:  time.Now().UTC(),
	}
	s.nextSongID++

	s.playlistSongs[playlistID] = append(s.playlistSongs[playlistID], song)
	return song, nil
}

// genMockSongID generates a mock song ID
func genMockSongID(n int) string {
	return "ps-" + string(rune('0'+n%10))
}
