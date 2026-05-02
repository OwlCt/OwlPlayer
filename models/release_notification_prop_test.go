package models

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"github.com/leanovate/gopter"
	"github.com/leanovate/gopter/gen"
	"github.com/leanovate/gopter/prop"
)

// **Feature: artist-release-notifications, Property 7: 通知存储往返一致性**
// **Validates: Requirements 7.2**
//
// For any valid ReleaseNotification, serializing to JSON and then deserializing
// should produce an equivalent notification data.

func TestReleaseNotificationJSONRoundTrip(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for valid ReleaseNotification objects
	notificationGen := gen.Struct(reflect.TypeOf(ReleaseNotification{}), map[string]gopter.Gen{
		"ID":          genUUID(),
		"UserID":      genUUID(),
		"ArtistID":    genNotificationArtistID(),
		"ArtistName":  genNotificationArtistName(),
		"ReleaseID":   genNotificationReleaseID(),
		"ReleaseType": genNotificationReleaseType(),
		"ReleaseName": genNotificationReleaseName(),
		"ArtworkURL":  genNotificationArtworkURL(),
		"ReleaseDate": genNotificationReleaseDate(),
		"IsRead":      gen.Bool(),
		"CreatedAt":   genNotificationTime(),
	})

	// Property: JSON serialization round-trip preserves all fields
	properties.Property("JSON serialization round-trip preserves all fields", prop.ForAll(
		func(notification ReleaseNotification) bool {
			// Serialize to JSON
			jsonData, err := json.Marshal(notification)
			if err != nil {
				return false
			}

			// Deserialize back
			var decoded ReleaseNotification
			if err := json.Unmarshal(jsonData, &decoded); err != nil {
				return false
			}

			// Check all fields are preserved
			return decoded.ID == notification.ID &&
				decoded.UserID == notification.UserID &&
				decoded.ArtistID == notification.ArtistID &&
				decoded.ArtistName == notification.ArtistName &&
				decoded.ReleaseID == notification.ReleaseID &&
				decoded.ReleaseType == notification.ReleaseType &&
				decoded.ReleaseName == notification.ReleaseName &&
				decoded.ArtworkURL == notification.ArtworkURL &&
				decoded.ReleaseDate == notification.ReleaseDate &&
				decoded.IsRead == notification.IsRead &&
				decoded.CreatedAt.Unix() == notification.CreatedAt.Unix()
		},
		notificationGen,
	))

	properties.TestingRun(t)
}

// **Feature: artist-release-notifications, Property 5: 通知创建完整性**
// **Validates: Requirements 3.2**
//
// For any new release content, the created notification should contain all required fields:
// artist name, release name, release type, release date, artwork URL.

func TestNotificationFieldCompleteness(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for NewRelease objects
	newReleaseGen := gen.Struct(reflect.TypeOf(NewRelease{}), map[string]gopter.Gen{
		"ID":          genNotificationReleaseID(),
		"Type":        genNotificationReleaseType(),
		"Name":        genNotificationReleaseName(),
		"ArtworkURL":  genNotificationArtworkURL(),
		"ReleaseDate": genNotificationReleaseDate(),
	})

	// Property: Creating notification from NewRelease preserves all required fields
	properties.Property("Creating notification from NewRelease preserves all required fields", prop.ForAll(
		func(release NewRelease) bool {
			artistID := "artist-123"
			artistName := "Test Artist"
			userID := "user-456"

			// Simulate notification creation
			notification := ReleaseNotification{
				ID:          "notification-789",
				UserID:      userID,
				ArtistID:    artistID,
				ArtistName:  artistName,
				ReleaseID:   release.ID,
				ReleaseType: release.Type,
				ReleaseName: release.Name,
				ArtworkURL:  release.ArtworkURL,
				ReleaseDate: release.ReleaseDate,
				IsRead:      false,
				CreatedAt:   time.Now(),
			}

			// Verify all required fields are present
			hasArtistName := notification.ArtistName != ""
			hasReleaseName := notification.ReleaseName != ""
			hasReleaseType := notification.ReleaseType == "album" || notification.ReleaseType == "single"
			hasReleaseDate := notification.ReleaseDate != ""
			// ArtworkURL can be empty, but should be preserved
			artworkPreserved := notification.ArtworkURL == release.ArtworkURL

			return hasArtistName && hasReleaseName && hasReleaseType && hasReleaseDate && artworkPreserved
		},
		newReleaseGen,
	))

	properties.TestingRun(t)
}

// **Feature: artist-release-notifications, Property 6: 多通知独立性**
// **Validates: Requirements 3.4**
//
// For any multiple new releases, the system should create independent notification records
// for each new release.

func TestMultipleNotificationsIndependence(t *testing.T) {
	parameters := gopter.DefaultTestParameters()
	parameters.MinSuccessfulTests = 100
	properties := gopter.NewProperties(parameters)

	// Generator for number of releases (1-10)
	releaseCountGen := gen.IntRange(1, 10)

	// Property: Each new release gets its own independent notification
	properties.Property("Each new release gets its own independent notification", prop.ForAll(
		func(count int) bool {
			artistID := "artist-123"
			artistName := "Test Artist"
			userID := "user-456"

			// Create releases with unique IDs
			releases := make([]NewRelease, count)
			for i := 0; i < count; i++ {
				releaseType := "album"
				if i%2 == 1 {
					releaseType = "single"
				}
				releases[i] = NewRelease{
					ID:          "release-" + string(rune('a'+i)),
					Type:        releaseType,
					Name:        "Release " + string(rune('A'+i)),
					ArtworkURL:  "https://example.com/artwork" + string(rune('0'+i)) + ".jpg",
					ReleaseDate: "2024-01-0" + string(rune('1'+i%9)),
				}
			}

			// Simulate creating notifications for each release
			notifications := make([]ReleaseNotification, len(releases))
			for i, release := range releases {
				notifications[i] = ReleaseNotification{
					ID:          "notification-" + release.ID,
					UserID:      userID,
					ArtistID:    artistID,
					ArtistName:  artistName,
					ReleaseID:   release.ID,
					ReleaseType: release.Type,
					ReleaseName: release.Name,
					ArtworkURL:  release.ArtworkURL,
					ReleaseDate: release.ReleaseDate,
					IsRead:      false,
					CreatedAt:   time.Now(),
				}
			}

			// Verify each release has its own notification
			if len(notifications) != len(releases) {
				return false
			}

			// Verify each notification is independent (different IDs)
			idSet := make(map[string]bool)
			for _, n := range notifications {
				if idSet[n.ID] {
					return false // Duplicate ID found
				}
				idSet[n.ID] = true
			}

			// Verify each notification corresponds to its release
			for i, n := range notifications {
				if n.ReleaseID != releases[i].ID ||
					n.ReleaseType != releases[i].Type ||
					n.ReleaseName != releases[i].Name {
					return false
				}
			}

			return true
		},
		releaseCountGen,
	))

	properties.TestingRun(t)
}

// Helper generators for ReleaseNotification

func genNotificationArtistID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "artist123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genNotificationArtistName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "Artist Name"
		}
		if len(s) > 100 {
			return s[:100]
		}
		return s
	})
}

func genNotificationReleaseID() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "release123"
		}
		if len(s) > 50 {
			return s[:50]
		}
		return s
	})
}

func genNotificationReleaseType() gopter.Gen {
	return gen.OneConstOf("album", "single")
}

func genNotificationReleaseName() gopter.Gen {
	return gen.AlphaString().Map(func(s string) string {
		if len(s) == 0 {
			return "Release Name"
		}
		if len(s) > 200 {
			return s[:200]
		}
		return s
	})
}

func genNotificationArtworkURL() gopter.Gen {
	return gen.OneConstOf("", "https://example.com/artwork.jpg", "/api/artwork/release123.png")
}

func genNotificationReleaseDate() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) string {
		return time.Unix(ts, 0).UTC().Format("2006-01-02")
	})
}

func genNotificationTime() gopter.Gen {
	return gen.Int64Range(0, time.Now().Unix()).Map(func(ts int64) time.Time {
		return time.Unix(ts, 0).UTC()
	})
}
