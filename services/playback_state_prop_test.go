package services

import (
	"main/models"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Property Test Generators for Playback State
// =============================================================================

// genPlaybackUserID generates random user IDs for playback state tests
func genPlaybackUserID() gopter.Gen {
	return gen.SliceOfN(8, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return "user-" + string(chars)
	})
}

// genSongID generates random song IDs
func genPlaybackSongID() gopter.Gen {
	return gen.SliceOfN(10, gen.AlphaNumChar()).Map(func(chars []rune) string {
		return string(chars)
	})
}

// genQueueSong generates a random QueueSong
func genQueueSong() gopter.Gen {
	return gopter.CombineGens(
		genPlaybackSongID(),
		gen.AlphaString(),
		gen.AlphaString(),
		gen.AlphaString(),
		genPlaybackSongID(),
		gen.Float64Range(0, 600),
		gen.AlphaString(),
		gen.Bool(),
	).Map(func(vals []interface{}) models.QueueSong {
		return models.QueueSong{
			ID:         vals[0].(string),
			Name:       vals[1].(string),
			ArtistName: vals[2].(string),
			AlbumName:  vals[3].(string),
			AlbumID:    vals[4].(string),
			Duration:   vals[5].(float64),
			ArtworkURL: vals[6].(string),
			HasLyrics:  vals[7].(bool),
		}
	})
}

// genQueueSongs generates a slice of QueueSong for the queue
func genQueueSongs() gopter.Gen {
	return gen.SliceOfN(20, genQueueSong())
}

// genPlayMode generates valid play modes
func genPlayMode() gopter.Gen {
	return gen.OneConstOf(
		models.PlayModeSequential,
		models.PlayModeLoop,
		models.PlayModeSingle,
	)
}

// genPosition generates valid playback positions (0 to 600 seconds)
func genPosition() gopter.Gen {
	return gen.Float64Range(0, 600)
}

// genPlaybackState generates random PlaybackState for testing
func genPlaybackState() gopter.Gen {
	return gopter.CombineGens(
		genPlaybackUserID(),
		genQueueSongs(),
		gen.IntRange(0, 19),
		genPosition(),
		genPlayMode(),
		gen.Bool(),
	).Map(func(vals []interface{}) *models.PlaybackState {
		queueSongs := vals[1].([]models.QueueSong)
		currentIndex := vals[2].(int)
		// Ensure currentIndex is within bounds
		if len(queueSongs) > 0 && currentIndex >= len(queueSongs) {
			currentIndex = len(queueSongs) - 1
		}
		if len(queueSongs) == 0 {
			currentIndex = 0
		}
		return &models.PlaybackState{
			UserID:       vals[0].(string),
			QueueSongs:   queueSongs,
			CurrentIndex: currentIndex,
			Position:     vals[3].(float64),
			PlayMode:     vals[4].(models.PlayMode),
			IsShuffled:   vals[5].(bool),
		}
	})
}

// genSavePlaybackStateRequest generates random SavePlaybackStateRequest for testing
func genSavePlaybackStateRequest() gopter.Gen {
	return gopter.CombineGens(
		genQueueSongs(),
		gen.IntRange(0, 19),
		genPosition(),
		genPlayMode(),
		gen.Bool(),
	).Map(func(vals []interface{}) *models.SavePlaybackStateRequest {
		queueSongs := vals[0].([]models.QueueSong)
		currentIndex := vals[1].(int)
		if len(queueSongs) > 0 && currentIndex >= len(queueSongs) {
			currentIndex = len(queueSongs) - 1
		}
		if len(queueSongs) == 0 {
			currentIndex = 0
		}
		return &models.SavePlaybackStateRequest{
			QueueSongs:   queueSongs,
			CurrentIndex: currentIndex,
			Position:     vals[2].(float64),
			PlayMode:     string(vals[3].(models.PlayMode)),
			IsShuffled:   vals[4].(bool),
		}
	})
}

// =============================================================================
// Property Tests for Playback State
// =============================================================================

// **Feature: play-queue-refactor, Property 16: Playback state persistence round-trip**
// **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
func TestProperty_PlaybackStateRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: SavePlaybackStateRequest.ToPlaybackState preserves all fields
	properties.Property("ToPlaybackState preserves all fields", prop.ForAll(
		func(req *models.SavePlaybackStateRequest, userID string) bool {
			if req == nil || userID == "" {
				return true
			}

			state := req.ToPlaybackState(userID)

			// Verify all fields are preserved
			return state.UserID == userID &&
				queueSongsEqual(state.QueueSongs, req.QueueSongs) &&
				state.CurrentIndex == req.CurrentIndex &&
				state.Position == req.Position &&
				string(state.PlayMode) == req.PlayMode &&
				state.IsShuffled == req.IsShuffled
		},
		genSavePlaybackStateRequest(),
		genPlaybackUserID(),
	))

	// Property: Valid requests pass validation
	properties.Property("valid requests pass validation", prop.ForAll(
		func(req *models.SavePlaybackStateRequest) bool {
			if req == nil {
				return true
			}
			return req.Validate()
		},
		genSavePlaybackStateRequest(),
	))

	// Property: PlayMode.IsValid returns true for valid modes
	properties.Property("valid play modes pass IsValid", prop.ForAll(
		func(mode models.PlayMode) bool {
			return mode.IsValid()
		},
		genPlayMode(),
	))

	properties.TestingRun(t)
}

// TestProperty_PlayModeValidation tests play mode validation
func TestProperty_PlayModeValidation(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Invalid play modes fail validation
	properties.Property("invalid play modes fail IsValid", prop.ForAll(
		func(mode string) bool {
			// Skip if it happens to be a valid mode
			pm := models.PlayMode(mode)
			if pm == models.PlayModeSequential || pm == models.PlayModeLoop || pm == models.PlayModeSingle {
				return true
			}
			return !pm.IsValid()
		},
		gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
			return string(chars)
		}),
	))

	// Property: Request with invalid play mode fails validation
	properties.Property("request with invalid play mode fails validation", prop.ForAll(
		func(queueSongs []models.QueueSong, currentIndex int, position float64, isShuffled bool, invalidMode string) bool {
			// Skip if it happens to be a valid mode
			pm := models.PlayMode(invalidMode)
			if pm == models.PlayModeSequential || pm == models.PlayModeLoop || pm == models.PlayModeSingle {
				return true
			}

			req := &models.SavePlaybackStateRequest{
				QueueSongs:   queueSongs,
				CurrentIndex: currentIndex,
				Position:     position,
				PlayMode:     invalidMode,
				IsShuffled:   isShuffled,
			}
			return !req.Validate()
		},
		genQueueSongs(),
		gen.IntRange(0, 19),
		genPosition(),
		gen.Bool(),
		gen.SliceOfN(8, gen.AlphaChar()).Map(func(chars []rune) string {
			return string(chars)
		}),
	))

	properties.TestingRun(t)
}

// TestProperty_PlaybackStateStore tests the mock playback state store
func TestProperty_PlaybackStateStore(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Save then load returns equivalent state
	properties.Property("save then load returns equivalent state", prop.ForAll(
		func(state *models.PlaybackState) bool {
			if state == nil || state.UserID == "" {
				return true
			}

			store := NewMockPlaybackStateStore()
			store.Save(state)
			loaded := store.Load(state.UserID)

			if loaded == nil {
				return false
			}

			return loaded.UserID == state.UserID &&
				queueSongsEqual(loaded.QueueSongs, state.QueueSongs) &&
				loaded.CurrentIndex == state.CurrentIndex &&
				loaded.Position == state.Position &&
				loaded.PlayMode == state.PlayMode &&
				loaded.IsShuffled == state.IsShuffled
		},
		genPlaybackState(),
	))

	// Property: Delete removes state
	properties.Property("delete removes state", prop.ForAll(
		func(state *models.PlaybackState) bool {
			if state == nil || state.UserID == "" {
				return true
			}

			store := NewMockPlaybackStateStore()
			store.Save(state)

			if store.Load(state.UserID) == nil {
				return false
			}

			store.Delete(state.UserID)
			return store.Load(state.UserID) == nil
		},
		genPlaybackState(),
	))

	// Property: Save overwrites previous state
	properties.Property("save overwrites previous state", prop.ForAll(
		func(state1, state2 *models.PlaybackState) bool {
			if state1 == nil || state2 == nil || state1.UserID == "" {
				return true
			}

			// Use same user ID for both states
			state2.UserID = state1.UserID

			store := NewMockPlaybackStateStore()
			store.Save(state1)
			store.Save(state2)

			loaded := store.Load(state1.UserID)
			if loaded == nil {
				return false
			}

			// Should have state2's values
			return queueSongsEqual(loaded.QueueSongs, state2.QueueSongs) &&
				loaded.CurrentIndex == state2.CurrentIndex &&
				loaded.Position == state2.Position &&
				loaded.PlayMode == state2.PlayMode &&
				loaded.IsShuffled == state2.IsShuffled
		},
		genPlaybackState(),
		genPlaybackState(),
	))

	properties.TestingRun(t)
}

// =============================================================================
// Helper Functions
// =============================================================================

// queueSongsEqual compares two QueueSong slices for equality
func queueSongsEqual(a, b []models.QueueSong) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].ID != b[i].ID ||
			a[i].Name != b[i].Name ||
			a[i].ArtistName != b[i].ArtistName ||
			a[i].AlbumName != b[i].AlbumName ||
			a[i].AlbumID != b[i].AlbumID ||
			a[i].Duration != b[i].Duration ||
			a[i].ArtworkURL != b[i].ArtworkURL ||
			a[i].HasLyrics != b[i].HasLyrics {
			return false
		}
	}
	return true
}

// =============================================================================
// Mock Types for Property Tests
// =============================================================================

// MockPlaybackStateStore simulates the playback state store for testing
type MockPlaybackStateStore struct {
	states map[string]*models.PlaybackState
}

// NewMockPlaybackStateStore creates a new mock store
func NewMockPlaybackStateStore() *MockPlaybackStateStore {
	return &MockPlaybackStateStore{
		states: make(map[string]*models.PlaybackState),
	}
}

// Save saves a playback state
func (s *MockPlaybackStateStore) Save(state *models.PlaybackState) {
	// Deep copy to avoid reference issues
	copied := &models.PlaybackState{
		UserID:       state.UserID,
		QueueSongs:   make([]models.QueueSong, len(state.QueueSongs)),
		CurrentIndex: state.CurrentIndex,
		Position:     state.Position,
		PlayMode:     state.PlayMode,
		IsShuffled:   state.IsShuffled,
		UpdatedAt:    state.UpdatedAt,
	}
	copy(copied.QueueSongs, state.QueueSongs)
	s.states[state.UserID] = copied
}

// Load loads a playback state
func (s *MockPlaybackStateStore) Load(userID string) *models.PlaybackState {
	state, exists := s.states[userID]
	if !exists {
		return nil
	}
	// Return a copy
	copied := &models.PlaybackState{
		UserID:       state.UserID,
		QueueSongs:   make([]models.QueueSong, len(state.QueueSongs)),
		CurrentIndex: state.CurrentIndex,
		Position:     state.Position,
		PlayMode:     state.PlayMode,
		IsShuffled:   state.IsShuffled,
		UpdatedAt:    state.UpdatedAt,
	}
	copy(copied.QueueSongs, state.QueueSongs)
	return copied
}

// Delete deletes a playback state
func (s *MockPlaybackStateStore) Delete(userID string) {
	delete(s.states, userID)
}
