package services

import (
	"context"
	"database/sql"
	"fmt"
	"main/models"
	"time"
)

// ReleaseNotificationService handles release notification business logic
type ReleaseNotificationService struct {
	db *Database
}

// NewReleaseNotificationService creates a new ReleaseNotificationService instance
func NewReleaseNotificationService(db *Database) *ReleaseNotificationService {
	return &ReleaseNotificationService{db: db}
}

// CreateNotifications creates notifications for all users following an artist
func (s *ReleaseNotificationService) CreateNotifications(ctx context.Context, artistID, artistName string, releases []models.NewRelease, userIDs []string) error {
	if len(releases) == 0 || len(userIDs) == 0 {
		return nil
	}

	query := `
		INSERT INTO release_notifications (user_id, artist_id, artist_name, release_id, release_type, release_name, artwork_url, release_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, release_id) DO NOTHING
	`

	for _, userID := range userIDs {
		for _, release := range releases {
			var releaseDate interface{}
			if release.ReleaseDate != "" {
				releaseDate = release.ReleaseDate
			} else {
				releaseDate = nil
			}

			_, err := s.db.ExecContext(ctx, query,
				userID,
				artistID,
				artistName,
				release.ID,
				release.Type,
				release.Name,
				sql.NullString{String: release.ArtworkURL, Valid: release.ArtworkURL != ""},
				releaseDate,
			)
			if err != nil {
				return fmt.Errorf("failed to create notification: %w", err)
			}
		}
	}

	return nil
}


// GetUserNotifications retrieves notifications for a user with optional filtering
func (s *ReleaseNotificationService) GetUserNotifications(ctx context.Context, userID string, filter models.NotificationFilter) ([]*models.ReleaseNotification, error) {
	query := fmt.Sprintf(`SELECT %s FROM release_notifications WHERE user_id = $1`, models.ReleaseNotificationColumns())

	args := []interface{}{userID}
	argIndex := 2

	if filter.Type != "" && filter.Type != "all" {
		query += fmt.Sprintf(` AND release_type = $%d`, argIndex)
		args = append(args, filter.Type)
		argIndex++
	}

	query += ` ORDER BY created_at DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to get user notifications: %w", err)
	}
	defer rows.Close()

	var notifications []*models.ReleaseNotification
	for rows.Next() {
		notification, err := models.ScanReleaseNotification(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan notification: %w", err)
		}
		notifications = append(notifications, notification)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating notifications: %w", err)
	}

	return notifications, nil
}

// GetUnreadCount returns the count of unread notifications for a user
func (s *ReleaseNotificationService) GetUnreadCount(ctx context.Context, userID string) (int, error) {
	var count int
	query := `SELECT COUNT(*) FROM release_notifications WHERE user_id = $1 AND is_read = FALSE`
	err := s.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get unread count: %w", err)
	}
	return count, nil
}

// MarkAsRead marks specific notifications as read
func (s *ReleaseNotificationService) MarkAsRead(ctx context.Context, userID string, notificationIDs []string) error {
	if len(notificationIDs) == 0 {
		return nil
	}

	query := `UPDATE release_notifications SET is_read = TRUE WHERE user_id = $1 AND id = ANY($2)`
	_, err := s.db.ExecContext(ctx, query, userID, notificationIDs)
	if err != nil {
		return fmt.Errorf("failed to mark notifications as read: %w", err)
	}
	return nil
}

// MarkAllAsRead marks all notifications as read for a user
func (s *ReleaseNotificationService) MarkAllAsRead(ctx context.Context, userID string) error {
	query := `UPDATE release_notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`
	_, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to mark all notifications as read: %w", err)
	}
	return nil
}

// CleanupExpired removes notifications older than 30 days
func (s *ReleaseNotificationService) CleanupExpired(ctx context.Context) (int, error) {
	cutoff := time.Now().AddDate(0, 0, -30)
	query := `DELETE FROM release_notifications WHERE created_at < $1`
	result, err := s.db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("failed to cleanup expired notifications: %w", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %w", err)
	}

	return int(rowsAffected), nil
}

// GetUserIDsFollowingArtist returns all user IDs that follow or recently played a specific artist
// Only returns users who have release_notification_enabled = true
func (s *ReleaseNotificationService) GetUserIDsFollowingArtist(ctx context.Context, artistID string) ([]string, error) {
	// Query combines followed artists and recently played artists
	query := `
		SELECT DISTINCT user_id FROM (
			-- Users who follow this artist
			SELECT fa.user_id 
			FROM followed_artists fa
			JOIN users u ON fa.user_id = u.id
			WHERE fa.artist_id = $1 AND u.release_notification_enabled = TRUE
			
			UNION
			
			-- Users who recently played this artist
			SELECT rp.user_id
			FROM recently_played rp
			JOIN users u ON rp.user_id = u.id
			WHERE rp.item_type = 'artist' AND rp.item_id = $1 AND u.release_notification_enabled = TRUE
		) combined
	`
	rows, err := s.db.QueryContext(ctx, query, artistID)
	if err != nil {
		return nil, fmt.Errorf("failed to get users following artist: %w", err)
	}
	defer rows.Close()

	var userIDs []string
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			return nil, fmt.Errorf("failed to scan user ID: %w", err)
		}
		userIDs = append(userIDs, userID)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating user IDs: %w", err)
	}

	return userIDs, nil
}

// DeleteNotificationsByArtist deletes all notifications for a specific artist and user
func (s *ReleaseNotificationService) DeleteNotificationsByArtist(ctx context.Context, userID, artistID string) error {
	query := `DELETE FROM release_notifications WHERE user_id = $1 AND artist_id = $2`
	_, err := s.db.ExecContext(ctx, query, userID, artistID)
	if err != nil {
		return fmt.Errorf("failed to delete notifications by artist: %w", err)
	}
	return nil
}

// NotificationStats represents notification statistics
type NotificationStats struct {
	TotalCount     int `json:"total_count"`
	UnreadCount    int `json:"unread_count"`
	ReadCount      int `json:"read_count"`
	AlbumCount     int `json:"album_count"`
	SingleCount    int `json:"single_count"`
	Last7DaysCount int `json:"last_7_days_count"`
}

// GetNotificationStats retrieves notification statistics across all users
func (s *ReleaseNotificationService) GetNotificationStats(ctx context.Context) (*NotificationStats, error) {
	stats := &NotificationStats{}

	// Get total, unread, and read counts
	countQuery := `
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE is_read = FALSE) as unread,
			COUNT(*) FILTER (WHERE is_read = TRUE) as read
		FROM release_notifications
	`
	err := s.db.QueryRowContext(ctx, countQuery).Scan(&stats.TotalCount, &stats.UnreadCount, &stats.ReadCount)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification counts: %w", err)
	}

	// Get counts by type
	typeQuery := `
		SELECT 
			COUNT(*) FILTER (WHERE release_type = 'album') as album_count,
			COUNT(*) FILTER (WHERE release_type = 'single') as single_count
		FROM release_notifications
	`
	err = s.db.QueryRowContext(ctx, typeQuery).Scan(&stats.AlbumCount, &stats.SingleCount)
	if err != nil {
		return nil, fmt.Errorf("failed to get notification type counts: %w", err)
	}

	// Get last 7 days count
	last7DaysQuery := `
		SELECT COUNT(*) FROM release_notifications 
		WHERE created_at >= NOW() - INTERVAL '7 days'
	`
	err = s.db.QueryRowContext(ctx, last7DaysQuery).Scan(&stats.Last7DaysCount)
	if err != nil {
		return nil, fmt.Errorf("failed to get last 7 days count: %w", err)
	}

	return stats, nil
}
