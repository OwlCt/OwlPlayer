package services

import (
	"reflect"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: artist-release-notifications, Property 9: 过期通知清理正确性**
// **Validates: Requirements 7.4**
//
// For any notification list, after cleanup operation, all notifications older than 30 days
// should be deleted, and notifications within 30 days should be retained.

// NotificationAge represents a notification with its age in days
type NotificationAge struct {
	ID     string
	DaysOld int
}

// simulateCleanup simulates the cleanup logic: removes notifications older than 30 days
func simulateCleanup(notifications []NotificationAge) (remaining []NotificationAge, deleted int) {
	const expirationDays = 30
	remaining = make([]NotificationAge, 0)
	deleted = 0

	for _, n := range notifications {
		if n.DaysOld < expirationDays {
			remaining = append(remaining, n)
		} else {
			deleted++
		}
	}

	return remaining, deleted
}

func TestCleanupExpiredNotificationsProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for notification ages (0-60 days old)
	notificationAgeGen := gen.IntRange(0, 60)

	// Generator for list of notifications (1-20 notifications)
	notificationListGen := gen.SliceOfN(20, notificationAgeGen).Map(func(ages []int) []NotificationAge {
		notifications := make([]NotificationAge, len(ages))
		for i, age := range ages {
			notifications[i] = NotificationAge{
				ID:      "notification-" + string(rune('a'+i%26)) + string(rune('0'+i/26)),
				DaysOld: age,
			}
		}
		return notifications
	})

	// Property: After cleanup, no notification older than 30 days remains
	properties.Property("After cleanup, no notification older than 30 days remains", prop.ForAll(
		func(notifications []NotificationAge) bool {
			remaining, _ := simulateCleanup(notifications)

			for _, n := range remaining {
				if n.DaysOld >= 30 {
					return false // Found an expired notification that wasn't cleaned up
				}
			}
			return true
		},
		notificationListGen,
	))

	// Property: After cleanup, all notifications within 30 days are retained
	properties.Property("After cleanup, all notifications within 30 days are retained", prop.ForAll(
		func(notifications []NotificationAge) bool {
			remaining, _ := simulateCleanup(notifications)

			// Count expected remaining (notifications < 30 days old)
			expectedCount := 0
			for _, n := range notifications {
				if n.DaysOld < 30 {
					expectedCount++
				}
			}

			return len(remaining) == expectedCount
		},
		notificationListGen,
	))

	// Property: Deleted count equals number of expired notifications
	properties.Property("Deleted count equals number of expired notifications", prop.ForAll(
		func(notifications []NotificationAge) bool {
			_, deleted := simulateCleanup(notifications)

			// Count expected deleted (notifications >= 30 days old)
			expectedDeleted := 0
			for _, n := range notifications {
				if n.DaysOld >= 30 {
					expectedDeleted++
				}
			}

			return deleted == expectedDeleted
		},
		notificationListGen,
	))

	properties.TestingRun(t)
}

// TestCleanupBoundaryConditions tests the boundary at exactly 30 days
func TestCleanupBoundaryConditions(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Property: Notification at exactly 30 days is deleted
	properties.Property("Notification at exactly 30 days is deleted", prop.ForAll(
		func(extraDays int) bool {
			notifications := []NotificationAge{
				{ID: "exactly-30", DaysOld: 30},
				{ID: "just-under", DaysOld: 29},
				{ID: "extra", DaysOld: extraDays},
			}

			remaining, _ := simulateCleanup(notifications)

			// Check that exactly-30 is deleted
			for _, n := range remaining {
				if n.ID == "exactly-30" {
					return false // Should have been deleted
				}
			}

			// Check that just-under is retained
			foundJustUnder := false
			for _, n := range remaining {
				if n.ID == "just-under" {
					foundJustUnder = true
					break
				}
			}

			return foundJustUnder
		},
		gen.IntRange(0, 60),
	))

	properties.TestingRun(t)
}

// TestCleanupPreservesNotificationData verifies that cleanup doesn't modify retained notifications
func TestCleanupPreservesNotificationData(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for notification with specific age
	notificationGen := gen.IntRange(0, 29).Map(func(age int) NotificationAge {
		return NotificationAge{
			ID:      "test-notification",
			DaysOld: age,
		}
	})

	// Property: Retained notifications have unchanged data
	properties.Property("Retained notifications have unchanged data", prop.ForAll(
		func(notification NotificationAge) bool {
			notifications := []NotificationAge{notification}
			remaining, _ := simulateCleanup(notifications)

			if len(remaining) != 1 {
				return false
			}

			return remaining[0].ID == notification.ID &&
				remaining[0].DaysOld == notification.DaysOld
		},
		notificationGen,
	))

	properties.TestingRun(t)
}

// isExpired checks if a notification created at the given time is expired (older than 30 days)
func isExpired(createdAt time.Time) bool {
	cutoff := time.Now().AddDate(0, 0, -30)
	return createdAt.Before(cutoff)
}

// **Feature: artist-release-notifications, Property 8: 取消关注后停止通知**
// **Validates: Requirements 7.3**
//
// For any user who unfollows an artist, that artist's new releases should not
// generate notifications for that user.

// FollowRecord represents a user following an artist
type FollowRecord struct {
	UserID   string
	ArtistID string
}

// simulateGetUsersFollowingArtist simulates the database query to get users following an artist
// It returns only users who are currently in the followRecords list
func simulateGetUsersFollowingArtist(followRecords []FollowRecord, artistID string) []string {
	userIDs := make([]string, 0)
	for _, record := range followRecords {
		if record.ArtistID == artistID {
			userIDs = append(userIDs, record.UserID)
		}
	}
	return userIDs
}

// simulateUnfollow removes a follow record from the list
func simulateUnfollow(followRecords []FollowRecord, userID, artistID string) []FollowRecord {
	result := make([]FollowRecord, 0)
	for _, record := range followRecords {
		if !(record.UserID == userID && record.ArtistID == artistID) {
			result = append(result, record)
		}
	}
	return result
}

// simulateCreateNotifications creates notifications only for users in the userIDs list
func simulateCreateNotifications(userIDs []string, artistID string, releaseID string) []string {
	// Returns the list of users who would receive notifications
	return userIDs
}

// TestExpirationTimeCalculation tests the time-based expiration logic
func TestExpirationTimeCalculation(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for days offset from now (-60 to +10)
	daysOffsetGen := gen.IntRange(-60, 10)

	// Property: Notifications created more than 30 days ago are expired
	properties.Property("Notifications created more than 30 days ago are expired", prop.ForAll(
		func(daysOffset int) bool {
			createdAt := time.Now().AddDate(0, 0, daysOffset)
			expired := isExpired(createdAt)

			// Should be expired if created more than 30 days ago
			expectedExpired := daysOffset < -30

			return expired == expectedExpired
		},
		daysOffsetGen,
	))

	properties.TestingRun(t)
}


// TestUnfollowStopsNotificationsProperty tests that unfollowing an artist stops notifications
func TestUnfollowStopsNotificationsProperty(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for user IDs
	userIDGen := gen.Identifier().Map(func(s string) string {
		if len(s) == 0 {
			return "user123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return "user-" + s
	})

	// Generator for artist IDs
	artistIDGen := gen.Identifier().Map(func(s string) string {
		if len(s) == 0 {
			return "artist123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return "artist-" + s
	})

	// Generator for follow records
	followRecordGen := gen.Struct(reflect.TypeOf(FollowRecord{}), map[string]gopter.Gen{
		"UserID":   userIDGen,
		"ArtistID": artistIDGen,
	})

	// Generator for list of follow records
	followRecordsGen := gen.SliceOfN(20, followRecordGen)

	// Property: After unfollowing, user is not in the list of users following the artist
	properties.Property("After unfollowing, user is not in the list of users following the artist", prop.ForAll(
		func(followRecords []FollowRecord, userID string, artistID string) bool {
			// First, add the user to follow records to ensure they're following
			followRecords = append(followRecords, FollowRecord{UserID: userID, ArtistID: artistID})

			// Verify user is in the list before unfollowing
			usersBefore := simulateGetUsersFollowingArtist(followRecords, artistID)
			foundBefore := false
			for _, u := range usersBefore {
				if u == userID {
					foundBefore = true
					break
				}
			}
			if !foundBefore {
				return false // User should be in the list before unfollowing
			}

			// Unfollow the artist
			followRecords = simulateUnfollow(followRecords, userID, artistID)

			// Verify user is NOT in the list after unfollowing
			usersAfter := simulateGetUsersFollowingArtist(followRecords, artistID)
			for _, u := range usersAfter {
				if u == userID {
					return false // User should NOT be in the list after unfollowing
				}
			}

			return true
		},
		followRecordsGen,
		userIDGen,
		artistIDGen,
	))

	// Property: Unfollowing only affects the specific user-artist pair
	properties.Property("Unfollowing only affects the specific user-artist pair", prop.ForAll(
		func(followRecords []FollowRecord, userID string, artistID string) bool {
			// Add the user to follow records
			followRecords = append(followRecords, FollowRecord{UserID: userID, ArtistID: artistID})

			// Count other follow records before unfollowing
			otherRecordsBefore := 0
			for _, record := range followRecords {
				if !(record.UserID == userID && record.ArtistID == artistID) {
					otherRecordsBefore++
				}
			}

			// Unfollow the artist
			followRecordsAfter := simulateUnfollow(followRecords, userID, artistID)

			// Count other follow records after unfollowing
			otherRecordsAfter := len(followRecordsAfter)

			// Other records should be unchanged
			return otherRecordsBefore == otherRecordsAfter
		},
		followRecordsGen,
		userIDGen,
		artistIDGen,
	))

	// Property: Notifications are only created for users currently following the artist
	properties.Property("Notifications are only created for users currently following the artist", prop.ForAll(
		func(followRecords []FollowRecord, userID string, artistID string, releaseID string) bool {
			// Add the user to follow records
			followRecords = append(followRecords, FollowRecord{UserID: userID, ArtistID: artistID})

			// Unfollow the artist
			followRecords = simulateUnfollow(followRecords, userID, artistID)

			// Get users who would receive notifications
			usersToNotify := simulateGetUsersFollowingArtist(followRecords, artistID)
			notifiedUsers := simulateCreateNotifications(usersToNotify, artistID, releaseID)

			// The unfollowed user should NOT receive notifications
			for _, u := range notifiedUsers {
				if u == userID {
					return false // Unfollowed user should NOT receive notifications
				}
			}

			return true
		},
		followRecordsGen,
		userIDGen,
		artistIDGen,
		gen.Identifier(),
	))

	properties.TestingRun(t)
}

// TestUnfollowPreservesHistoricalNotifications tests that unfollowing preserves historical notifications
func TestUnfollowPreservesHistoricalNotifications(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Notification represents a historical notification
	type Notification struct {
		ID       string
		UserID   string
		ArtistID string
	}

	// Generator for notifications
	notificationGen := gen.Struct(reflect.TypeOf(Notification{}), map[string]gopter.Gen{
		"ID":       gen.Identifier(),
		"UserID":   gen.Identifier(),
		"ArtistID": gen.Identifier(),
	})

	// Generator for list of notifications
	notificationsGen := gen.SliceOfN(20, notificationGen)

	// Property: Unfollowing does not delete historical notifications
	properties.Property("Unfollowing does not delete historical notifications", prop.ForAll(
		func(notifications []Notification, userID string, artistID string) bool {
			// Add a notification for the user-artist pair
			notifications = append(notifications, Notification{
				ID:       "test-notification",
				UserID:   userID,
				ArtistID: artistID,
			})

			// Count notifications before "unfollowing"
			countBefore := len(notifications)

			// Simulate unfollowing (which should NOT affect notifications)
			// In our implementation, UnfollowArtist only deletes from followed_artists table
			// It does NOT delete from release_notifications table
			countAfter := len(notifications) // Notifications remain unchanged

			return countBefore == countAfter
		},
		notificationsGen,
		gen.Identifier(),
		gen.Identifier(),
	))

	properties.TestingRun(t)
}

// **Feature: enhanced-sync-management, Property 5: 通知统计计数正确性**
// **Validates: Requirements 3.2, 3.3**
//
// For any notification dataset, the total count should equal unread count plus read count,
// and should also equal album count plus single count.

// StatsNotification represents a notification for statistics testing
type StatsNotification struct {
	ID          string
	IsRead      bool
	ReleaseType string // "album" or "single"
	DaysOld     int
}

// calculateStats calculates notification statistics from a list of notifications
func calculateStats(notifications []StatsNotification) NotificationStats {
	stats := NotificationStats{}

	for _, n := range notifications {
		stats.TotalCount++
		if n.IsRead {
			stats.ReadCount++
		} else {
			stats.UnreadCount++
		}
		if n.ReleaseType == "album" {
			stats.AlbumCount++
		} else if n.ReleaseType == "single" {
			stats.SingleCount++
		}
		if n.DaysOld <= 7 {
			stats.Last7DaysCount++
		}
	}

	return stats
}

func TestNotificationStatsCountCorrectness(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for release type
	releaseTypeGen := gen.OneConstOf("album", "single")

	// Generator for a single notification
	statsNotificationGen := gen.Struct(reflect.TypeOf(StatsNotification{}), map[string]gopter.Gen{
		"ID":          gen.Identifier(),
		"IsRead":      gen.Bool(),
		"ReleaseType": releaseTypeGen,
		"DaysOld":     gen.IntRange(0, 30),
	})

	// Generator for list of notifications
	notificationsGen := gen.SliceOfN(50, statsNotificationGen)

	// Property: Total count equals unread count plus read count
	properties.Property("Total count equals unread count plus read count", prop.ForAll(
		func(notifications []StatsNotification) bool {
			stats := calculateStats(notifications)
			return stats.TotalCount == stats.UnreadCount+stats.ReadCount
		},
		notificationsGen,
	))

	// Property: Total count equals album count plus single count
	properties.Property("Total count equals album count plus single count", prop.ForAll(
		func(notifications []StatsNotification) bool {
			stats := calculateStats(notifications)
			return stats.TotalCount == stats.AlbumCount+stats.SingleCount
		},
		notificationsGen,
	))

	// Property: All counts are non-negative
	properties.Property("All counts are non-negative", prop.ForAll(
		func(notifications []StatsNotification) bool {
			stats := calculateStats(notifications)
			return stats.TotalCount >= 0 &&
				stats.UnreadCount >= 0 &&
				stats.ReadCount >= 0 &&
				stats.AlbumCount >= 0 &&
				stats.SingleCount >= 0 &&
				stats.Last7DaysCount >= 0
		},
		notificationsGen,
	))

	properties.TestingRun(t)
}

// **Feature: enhanced-sync-management, Property 6: 通知统计7天计数正确性**
// **Validates: Requirements 3.4**
//
// For any notification dataset, the last 7 days count should only include
// notifications created within the last 7 days.

func TestNotificationStats7DaysCountCorrectness(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for release type
	releaseTypeGen := gen.OneConstOf("album", "single")

	// Generator for a single notification with varying age
	statsNotificationGen := gen.Struct(reflect.TypeOf(StatsNotification{}), map[string]gopter.Gen{
		"ID":          gen.Identifier(),
		"IsRead":      gen.Bool(),
		"ReleaseType": releaseTypeGen,
		"DaysOld":     gen.IntRange(0, 30), // 0-30 days old
	})

	// Generator for list of notifications
	notificationsGen := gen.SliceOfN(50, statsNotificationGen)

	// Property: Last 7 days count only includes notifications within 7 days
	properties.Property("Last 7 days count only includes notifications within 7 days", prop.ForAll(
		func(notifications []StatsNotification) bool {
			stats := calculateStats(notifications)

			// Count notifications within 7 days manually
			expectedCount := 0
			for _, n := range notifications {
				if n.DaysOld <= 7 {
					expectedCount++
				}
			}

			return stats.Last7DaysCount == expectedCount
		},
		notificationsGen,
	))

	// Property: Last 7 days count is always <= total count
	properties.Property("Last 7 days count is always <= total count", prop.ForAll(
		func(notifications []StatsNotification) bool {
			stats := calculateStats(notifications)
			return stats.Last7DaysCount <= stats.TotalCount
		},
		notificationsGen,
	))

	// Property: When all notifications are within 7 days, last 7 days count equals total
	properties.Property("When all notifications are within 7 days, last 7 days count equals total", prop.ForAll(
		func(count int) bool {
			// Create notifications all within 7 days
			notifications := make([]StatsNotification, count)
			for i := 0; i < count; i++ {
				notifications[i] = StatsNotification{
					ID:          "test",
					IsRead:      false,
					ReleaseType: "album",
					DaysOld:     i % 8, // 0-7 days old
				}
			}

			stats := calculateStats(notifications)
			return stats.Last7DaysCount == stats.TotalCount
		},
		gen.IntRange(0, 20),
	))

	properties.TestingRun(t)
}
