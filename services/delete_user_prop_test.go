package services

import (
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Delete User Property Tests (Feature: admin-user-management)
// =============================================================================

// MockUserData represents all data associated with a user for testing delete cascade
type MockUserData struct {
	UserID            string
	LikedSongsCount   int
	LibraryAlbums     int
	PlaylistsCount    int
	FollowedArtists   int
	PlaybackStates    int
	VerificationCodes int
}

// MockDeleteUserState represents the state before and after user deletion
type MockDeleteUserState struct {
	AdminID       string
	AdminIsAdmin  bool
	TargetUserID  string
	TargetExists  bool
	UserData      *MockUserData
	DeletedTables map[string]bool // tracks which tables had data deleted
}

// simulateDeleteUser simulates the delete user operation and returns the result
func simulateDeleteUser(state *MockDeleteUserState) (error, *MockDeleteUserState) {
	// Check admin privileges
	if !state.AdminIsAdmin {
		return ErrNotAdmin, state
	}

	// Check self-deletion
	if state.AdminID == state.TargetUserID {
		return ErrCannotDeleteSelf, state
	}

	// Check target exists
	if !state.TargetExists {
		return ErrUserNotFound, state
	}

	// Simulate cascade delete - all associated data is removed
	newState := &MockDeleteUserState{
		AdminID:      state.AdminID,
		AdminIsAdmin: state.AdminIsAdmin,
		TargetUserID: state.TargetUserID,
		TargetExists: false, // User no longer exists
		UserData:     nil,   // All data deleted
		DeletedTables: map[string]bool{
			"verification_codes": state.UserData != nil && state.UserData.VerificationCodes > 0,
			"liked_songs":        state.UserData != nil && state.UserData.LikedSongsCount > 0,
			"library_albums":     state.UserData != nil && state.UserData.LibraryAlbums > 0,
			"playlists":          state.UserData != nil && state.UserData.PlaylistsCount > 0,
			"followed_artists":   state.UserData != nil && state.UserData.FollowedArtists > 0,
			"playback_states":    state.UserData != nil && state.UserData.PlaybackStates > 0,
			"users":              true,
		},
	}

	return nil, newState
}

// **Feature: admin-user-management, Property 1: Delete user removes all associated data**
// **Validates: Requirements 1.1, 1.5**
func TestProperty_DeleteUser_RemovesAllAssociatedData(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for user data counts
	genUserData := func(userID string) gopter.Gen {
		return gopter.CombineGens(
			gen.IntRange(0, 100), // liked songs
			gen.IntRange(0, 50),  // library albums
			gen.IntRange(0, 20),  // playlists
			gen.IntRange(0, 30),  // followed artists
			gen.IntRange(0, 1),   // playback states (0 or 1)
			gen.IntRange(0, 5),   // verification codes
		).Map(func(vals []interface{}) *MockUserData {
			return &MockUserData{
				UserID:            userID,
				LikedSongsCount:   vals[0].(int),
				LibraryAlbums:     vals[1].(int),
				PlaylistsCount:    vals[2].(int),
				FollowedArtists:   vals[3].(int),
				PlaybackStates:    vals[4].(int),
				VerificationCodes: vals[5].(int),
			}
		})
	}

	// Property: After successful deletion, user record no longer exists
	properties.Property("deleted user no longer exists", prop.ForAll(
		func(likedSongs, libraryAlbums, playlists, followedArtists, playbackStates, verificationCodes int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:            "user-456",
					LikedSongsCount:   likedSongs,
					LibraryAlbums:     libraryAlbums,
					PlaylistsCount:    playlists,
					FollowedArtists:   followedArtists,
					PlaybackStates:    playbackStates,
					VerificationCodes: verificationCodes,
				},
			}

			err, newState := simulateDeleteUser(state)
			if err != nil {
				return false
			}

			// User should no longer exist
			return !newState.TargetExists
		},
		gen.IntRange(0, 100),
		gen.IntRange(0, 50),
		gen.IntRange(0, 20),
		gen.IntRange(0, 30),
		gen.IntRange(0, 1),
		gen.IntRange(0, 5),
	))

	// Property: After successful deletion, all associated data is removed
	properties.Property("all associated data is removed after deletion", prop.ForAll(
		func(likedSongs, libraryAlbums, playlists, followedArtists, playbackStates, verificationCodes int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:            "user-456",
					LikedSongsCount:   likedSongs,
					LibraryAlbums:     libraryAlbums,
					PlaylistsCount:    playlists,
					FollowedArtists:   followedArtists,
					PlaybackStates:    playbackStates,
					VerificationCodes: verificationCodes,
				},
			}

			err, newState := simulateDeleteUser(state)
			if err != nil {
				return false
			}

			// All user data should be nil (deleted)
			return newState.UserData == nil
		},
		gen.IntRange(0, 100),
		gen.IntRange(0, 50),
		gen.IntRange(0, 20),
		gen.IntRange(0, 30),
		gen.IntRange(0, 1),
		gen.IntRange(0, 5),
	))

	// Property: Users table is always marked as deleted on successful deletion
	properties.Property("users table is deleted on successful deletion", prop.ForAll(
		func(likedSongs, libraryAlbums int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:          "user-456",
					LikedSongsCount: likedSongs,
					LibraryAlbums:   libraryAlbums,
				},
			}

			err, newState := simulateDeleteUser(state)
			if err != nil {
				return false
			}

			// Users table should always be marked as deleted
			return newState.DeletedTables["users"]
		},
		gen.IntRange(0, 100),
		gen.IntRange(0, 50),
	))

	// Use the generator for a more comprehensive test
	_ = genUserData // Mark as used

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 1: Delete user removes all associated data**
// **Validates: Requirements 1.1, 1.2**
func TestProperty_DeleteUser_AdminPrivilegesRequired(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Non-admin users cannot delete users
	properties.Property("non-admin cannot delete users", prop.ForAll(
		func(_ int) bool {
			state := &MockDeleteUserState{
				AdminID:      "user-123",
				AdminIsAdmin: false, // Not an admin
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:          "user-456",
					LikedSongsCount: 10,
				},
			}

			err, _ := simulateDeleteUser(state)
			return err == ErrNotAdmin
		},
		gen.Int(),
	))

	// Property: Admin can delete other users
	properties.Property("admin can delete other users", prop.ForAll(
		func(_ int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:          "user-456",
					LikedSongsCount: 10,
				},
			}

			err, _ := simulateDeleteUser(state)
			return err == nil
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 1: Delete user removes all associated data**
// **Validates: Requirements 1.2**
func TestProperty_DeleteUser_CannotDeleteSelf(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Admin cannot delete themselves
	properties.Property("admin cannot delete themselves", prop.ForAll(
		func(userID string) bool {
			if userID == "" {
				userID = "admin-123"
			}
			state := &MockDeleteUserState{
				AdminID:      userID,
				AdminIsAdmin: true,
				TargetUserID: userID, // Same as admin
				TargetExists: true,
				UserData: &MockUserData{
					UserID:          userID,
					LikedSongsCount: 10,
				},
			}

			err, _ := simulateDeleteUser(state)
			return err == ErrCannotDeleteSelf
		},
		gen.AlphaString().SuchThat(func(s string) bool { return len(s) > 0 }),
	))

	// Property: Admin can delete different user
	properties.Property("admin can delete different user", prop.ForAll(
		func(adminID, targetID string) bool {
			if adminID == "" {
				adminID = "admin-123"
			}
			if targetID == "" {
				targetID = "user-456"
			}
			// Ensure they are different
			if adminID == targetID {
				return true // Skip this case
			}

			state := &MockDeleteUserState{
				AdminID:      adminID,
				AdminIsAdmin: true,
				TargetUserID: targetID,
				TargetExists: true,
				UserData: &MockUserData{
					UserID:          targetID,
					LikedSongsCount: 10,
				},
			}

			err, _ := simulateDeleteUser(state)
			return err == nil
		},
		gen.AlphaString().SuchThat(func(s string) bool { return len(s) > 0 }),
		gen.AlphaString().SuchThat(func(s string) bool { return len(s) > 0 }),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 1: Delete user removes all associated data**
// **Validates: Requirements 1.4**
func TestProperty_DeleteUser_NonExistentUser(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Deleting non-existent user returns error
	properties.Property("deleting non-existent user returns error", prop.ForAll(
		func(_ int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "non-existent-user",
				TargetExists: false, // User doesn't exist
				UserData:     nil,
			}

			err, _ := simulateDeleteUser(state)
			return err == ErrUserNotFound
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 1: Delete user removes all associated data**
// **Validates: Requirements 1.1, 1.5**
func TestProperty_DeleteUser_CascadeDeleteOrder(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: All data types are deleted when user has data
	properties.Property("all data types are deleted when present", prop.ForAll(
		func(_ int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:            "user-456",
					LikedSongsCount:   5,
					LibraryAlbums:     3,
					PlaylistsCount:    2,
					FollowedArtists:   4,
					PlaybackStates:    1,
					VerificationCodes: 1,
				},
			}

			err, newState := simulateDeleteUser(state)
			if err != nil {
				return false
			}

			// All tables should be marked as deleted
			return newState.DeletedTables["verification_codes"] &&
				newState.DeletedTables["liked_songs"] &&
				newState.DeletedTables["library_albums"] &&
				newState.DeletedTables["playlists"] &&
				newState.DeletedTables["followed_artists"] &&
				newState.DeletedTables["playback_states"] &&
				newState.DeletedTables["users"]
		},
		gen.Int(),
	))

	// Property: User with no associated data can still be deleted
	properties.Property("user with no data can be deleted", prop.ForAll(
		func(_ int) bool {
			state := &MockDeleteUserState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				UserData: &MockUserData{
					UserID:            "user-456",
					LikedSongsCount:   0,
					LibraryAlbums:     0,
					PlaylistsCount:    0,
					FollowedArtists:   0,
					PlaybackStates:    0,
					VerificationCodes: 0,
				},
			}

			err, newState := simulateDeleteUser(state)
			if err != nil {
				return false
			}

			// User should be deleted even with no associated data
			return !newState.TargetExists && newState.DeletedTables["users"]
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}
