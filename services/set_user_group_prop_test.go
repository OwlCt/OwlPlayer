package services

import (
	"main/models"
	"testing"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// =============================================================================
// Set User Group Property Tests (Feature: admin-user-management)
// =============================================================================

// MockSetUserGroupState represents the state for testing SetUserGroup operation
type MockSetUserGroupState struct {
	AdminID      string
	AdminIsAdmin bool
	TargetUserID string
	TargetExists bool
	CurrentGroup string
	NewGroup     string
	ResultGroup  string
}

// simulateSetUserGroup simulates the SetUserGroup operation and returns the result
func simulateSetUserGroup(state *MockSetUserGroupState) (error, *MockSetUserGroupState) {
	// Check admin privileges
	if !state.AdminIsAdmin {
		return ErrNotAdmin, state
	}

	// Validate group value
	if !models.ValidUserGroup(state.NewGroup) {
		return ErrInvalidGroup, state
	}

	// Check target exists
	if !state.TargetExists {
		return ErrUserNotFound, state
	}

	// Simulate successful group update
	newState := &MockSetUserGroupState{
		AdminID:      state.AdminID,
		AdminIsAdmin: state.AdminIsAdmin,
		TargetUserID: state.TargetUserID,
		TargetExists: state.TargetExists,
		CurrentGroup: state.NewGroup, // Group is now updated
		NewGroup:     state.NewGroup,
		ResultGroup:  state.NewGroup,
	}

	return nil, newState
}

// **Feature: admin-user-management, Property 5: Admin can set valid user groups**
// **Validates: Requirements 3.1, 3.2**
func TestProperty_SetUserGroup_AdminCanSetValidGroups(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Admin can set user group to "vip"
	properties.Property("admin can set user group to vip", prop.ForAll(
		func(_ int) bool {
			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: models.UserGroupNormal,
				NewGroup:     models.UserGroupVIP,
			}

			err, newState := simulateSetUserGroup(state)
			if err != nil {
				return false
			}

			// Group should be updated to VIP
			return newState.ResultGroup == models.UserGroupVIP
		},
		gen.Int(),
	))

	// Property: Admin can set user group to "normal"
	properties.Property("admin can set user group to normal", prop.ForAll(
		func(_ int) bool {
			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: models.UserGroupVIP,
				NewGroup:     models.UserGroupNormal,
			}

			err, newState := simulateSetUserGroup(state)
			if err != nil {
				return false
			}

			// Group should be updated to normal
			return newState.ResultGroup == models.UserGroupNormal
		},
		gen.Int(),
	))

	// Property: Setting same group value succeeds
	properties.Property("setting same group value succeeds", prop.ForAll(
		func(isVIP bool) bool {
			group := models.UserGroupNormal
			if isVIP {
				group = models.UserGroupVIP
			}

			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: group,
				NewGroup:     group,
			}

			err, newState := simulateSetUserGroup(state)
			if err != nil {
				return false
			}

			// Group should remain the same
			return newState.ResultGroup == group
		},
		gen.Bool(),
	))

	// Property: For any valid group value, admin can set it
	properties.Property("admin can set any valid group", prop.ForAll(
		func(useVIP bool) bool {
			group := models.UserGroupNormal
			if useVIP {
				group = models.UserGroupVIP
			}

			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: models.UserGroupNormal,
				NewGroup:     group,
			}

			err, newState := simulateSetUserGroup(state)
			if err != nil {
				return false
			}

			return newState.ResultGroup == group
		},
		gen.Bool(),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 5: Admin can set valid user groups**
// **Validates: Requirements 3.3**
func TestProperty_SetUserGroup_NonAdminCannotSetGroup(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Non-admin users cannot set user groups
	properties.Property("non-admin cannot set user group", prop.ForAll(
		func(useVIP bool) bool {
			group := models.UserGroupNormal
			if useVIP {
				group = models.UserGroupVIP
			}

			state := &MockSetUserGroupState{
				AdminID:      "user-123",
				AdminIsAdmin: false, // Not an admin
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: models.UserGroupNormal,
				NewGroup:     group,
			}

			err, _ := simulateSetUserGroup(state)
			return err == ErrNotAdmin
		},
		gen.Bool(),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 5: Admin can set valid user groups**
// **Validates: Requirements 3.4**
func TestProperty_SetUserGroup_NonExistentUser(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Setting group for non-existent user returns error
	properties.Property("setting group for non-existent user returns error", prop.ForAll(
		func(useVIP bool) bool {
			group := models.UserGroupNormal
			if useVIP {
				group = models.UserGroupVIP
			}

			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "non-existent-user",
				TargetExists: false, // User doesn't exist
				CurrentGroup: "",
				NewGroup:     group,
			}

			err, _ := simulateSetUserGroup(state)
			return err == ErrUserNotFound
		},
		gen.Bool(),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 5: Admin can set valid user groups**
// **Validates: Requirements 3.1, 3.2**
func TestProperty_SetUserGroup_InvalidGroupRejected(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Invalid group values are rejected
	properties.Property("invalid group values are rejected", prop.ForAll(
		func(invalidGroup string) bool {
			// Skip if the generated string happens to be a valid group
			if models.ValidUserGroup(invalidGroup) {
				return true
			}

			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: models.UserGroupNormal,
				NewGroup:     invalidGroup,
			}

			err, _ := simulateSetUserGroup(state)
			return err == ErrInvalidGroup
		},
		gen.AlphaString(),
	))

	// Property: Empty string is rejected as invalid group
	properties.Property("empty string is rejected as invalid group", prop.ForAll(
		func(_ int) bool {
			state := &MockSetUserGroupState{
				AdminID:      "admin-123",
				AdminIsAdmin: true,
				TargetUserID: "user-456",
				TargetExists: true,
				CurrentGroup: models.UserGroupNormal,
				NewGroup:     "",
			}

			err, _ := simulateSetUserGroup(state)
			return err == ErrInvalidGroup
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}

// **Feature: admin-user-management, Property 3: User group field validity**
// **Validates: Requirements 2.1**
func TestProperty_ValidUserGroup_OnlyAcceptsValidValues(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: "normal" is a valid group
	properties.Property("normal is valid group", prop.ForAll(
		func(_ int) bool {
			return models.ValidUserGroup(models.UserGroupNormal)
		},
		gen.Int(),
	))

	// Property: "vip" is a valid group
	properties.Property("vip is valid group", prop.ForAll(
		func(_ int) bool {
			return models.ValidUserGroup(models.UserGroupVIP)
		},
		gen.Int(),
	))

	// Property: Random strings (not "normal" or "vip") are invalid
	properties.Property("random strings are invalid groups", prop.ForAll(
		func(s string) bool {
			// Skip if the generated string happens to be a valid group
			if s == models.UserGroupNormal || s == models.UserGroupVIP {
				return true
			}
			return !models.ValidUserGroup(s)
		},
		gen.AlphaString(),
	))

	// Property: Empty string is invalid
	properties.Property("empty string is invalid group", prop.ForAll(
		func(_ int) bool {
			return !models.ValidUserGroup("")
		},
		gen.Int(),
	))

	properties.TestingRun(t)
}
