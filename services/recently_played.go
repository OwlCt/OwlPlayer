package services

import (
	"context"
	"fmt"
	"log"
	"main/models"
	"net/url"
	"strings"
)

// getProxiedArtworkURL converts an Apple Music artwork URL to a proxied URL
func getProxiedArtworkURL(artworkURL string, size int) string {
	if artworkURL == "" {
		return ""
	}
	// Replace {w}x{h} placeholder with actual size
	processed := strings.Replace(artworkURL, "{w}x{h}", fmt.Sprintf("%dx%d", size, size), 1)
	// Also handle {w} and {h} separately
	processed = strings.Replace(processed, "{w}", fmt.Sprintf("%d", size), 1)
	processed = strings.Replace(processed, "{h}", fmt.Sprintf("%d", size), 1)
	return fmt.Sprintf("/api/image?url=%s", url.QueryEscape(processed))
}

// RecentlyPlayedService handles recently played items business logic
type RecentlyPlayedService struct {
	db               *Database
	localLibraryRepo LocalLibraryRepository
}

// NewRecentlyPlayedService creates a new RecentlyPlayedService instance
func NewRecentlyPlayedService(db *Database) *RecentlyPlayedService {
	return &RecentlyPlayedService{db: db}
}

// SetLocalLibraryRepository enables local-library snapshots for local album/artist cards.
func (s *RecentlyPlayedService) SetLocalLibraryRepository(repo LocalLibraryRepository) {
	s.localLibraryRepo = repo
}

// GetRecentlyPlayed retrieves all recently played items for a user, ordered by most recent
func (s *RecentlyPlayedService) GetRecentlyPlayed(ctx context.Context, userID string) ([]*models.RecentlyPlayedItem, error) {
	query := `SELECT item_type, item_id, last_played_at FROM recently_played WHERE user_id = $1 ORDER BY last_played_at DESC LIMIT 100`
	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get recently played: %w", err)
	}
	defer rows.Close()

	var items []*models.RecentlyPlayedItem
	for rows.Next() {
		var item models.RecentlyPlayedItem
		if err := rows.Scan(&item.ItemType, &item.ItemID, &item.LastPlayedAt); err != nil {
			return nil, fmt.Errorf("failed to scan recently played item: %w", err)
		}
		items = append(items, &item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating recently played: %w", err)
	}

	return items, nil
}

// RecordPlay records or updates a play for an item
// Uses UPSERT to insert or update the last_played_at timestamp
func (s *RecentlyPlayedService) RecordPlay(ctx context.Context, userID string, req *models.RecordPlayRequest) (*models.RecentlyPlayed, error) {
	rp := &models.RecentlyPlayed{
		UserID:   userID,
		ItemType: req.ItemType,
		ItemID:   req.ItemID,
	}

	query := `
		INSERT INTO recently_played (user_id, item_type, item_id, last_played_at)
		VALUES ($1, $2, $3, NOW())
		ON CONFLICT (user_id, item_type, item_id)
		DO UPDATE SET last_played_at = NOW()
		RETURNING id, last_played_at
	`
	err := s.db.QueryRowContext(ctx, query,
		rp.UserID,
		rp.ItemType,
		rp.ItemID,
	).Scan(&rp.ID, &rp.LastPlayedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to record play: %w", err)
	}

	return rp, nil
}

// GetLastPlayedAt returns the last played timestamp for a specific item
func (s *RecentlyPlayedService) GetLastPlayedAt(ctx context.Context, userID, itemType, itemID string) (*models.RecentlyPlayed, error) {
	query := fmt.Sprintf(`SELECT %s FROM recently_played WHERE user_id = $1 AND item_type = $2 AND item_id = $3`, models.RecentlyPlayedColumns())
	row := s.db.QueryRowContext(ctx, query, userID, itemType, itemID)
	rp, err := models.ScanRecentlyPlayed(row)
	if err != nil {
		return nil, err
	}
	return rp, nil
}

// ClearHistory clears all recently played history for a user
func (s *RecentlyPlayedService) ClearHistory(ctx context.Context, userID string) error {
	query := `DELETE FROM recently_played WHERE user_id = $1`
	_, err := s.db.ExecContext(ctx, query, userID)
	if err != nil {
		return fmt.Errorf("failed to clear history: %w", err)
	}
	return nil
}

// GetRecentlyPlayedWithDetails retrieves recently played items with full details
func (s *RecentlyPlayedService) GetRecentlyPlayedWithDetails(ctx context.Context, userID string, limit int) ([]*models.RecentlyPlayedItemWithDetails, error) {
	if limit <= 0 {
		limit = 8
	}

	query := `SELECT item_type, item_id, last_played_at FROM recently_played WHERE user_id = $1 ORDER BY last_played_at DESC LIMIT $2`
	rows, err := s.db.QueryContext(ctx, query, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get recently played: %w", err)
	}
	defer rows.Close()

	var items []*models.RecentlyPlayedItemWithDetails
	for rows.Next() {
		var item models.RecentlyPlayedItemWithDetails
		if err := rows.Scan(&item.ItemType, &item.ItemID, &item.LastPlayedAt); err != nil {
			return nil, fmt.Errorf("failed to scan recently played item: %w", err)
		}

		// Fetch details based on item type
		switch item.ItemType {
		case "playlist":
			s.fillPlaylistDetails(ctx, userID, &item)
		case "album":
			s.fillAlbumDetails(ctx, userID, &item)
		case "artist":
			s.fillArtistDetails(ctx, userID, &item)
		case "liked-songs":
			s.fillLikedSongsDetails(ctx, userID, &item)
		}

		items = append(items, &item)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating recently played: %w", err)
	}

	return items, nil
}

func (s *RecentlyPlayedService) fillPlaylistDetails(ctx context.Context, userID string, item *models.RecentlyPlayedItemWithDetails) {
	// Try user's own playlists first
	query := `SELECT name, COALESCE((SELECT artwork_url FROM playlist_songs WHERE playlist_id = p.id LIMIT 1), '') 
	          FROM playlists p WHERE id = $1 AND user_id = $2`
	var name, artworkURL string
	if err := s.db.QueryRowContext(ctx, query, item.ItemID, userID).Scan(&name, &artworkURL); err == nil {
		item.Name = name
		item.Subtitle = "歌单"
		item.ArtworkURL = getProxiedArtworkURL(artworkURL, 96)
		return
	}

	// Final fallback
	item.Name = "歌单"
	item.Subtitle = "歌单"
}

func (s *RecentlyPlayedService) fillAlbumDetails(ctx context.Context, userID string, item *models.RecentlyPlayedItemWithDetails) {
	if resolver := newLocalLibrarySnapshotResolver(s.localLibraryRepo); resolver != nil {
		if album, err := resolver.ResolveAlbum(ctx, item.ItemID); err == nil && album != nil {
			item.Name = album.Name
			item.Subtitle = album.ArtistName
			item.ArtworkURL = album.ArtworkURL
			return
		} else if err != nil {
			log.Printf("Failed to resolve local album snapshot %s: %v", item.ItemID, err)
		}
	}

	// Try database first
	query := `SELECT album_name, artist_name, artwork_url FROM library_albums WHERE album_id = $1 AND user_id = $2`
	var albumName, artistName, artworkURL string
	if err := s.db.QueryRowContext(ctx, query, item.ItemID, userID).Scan(&albumName, &artistName, &artworkURL); err == nil {
		item.Name = albumName
		item.Subtitle = artistName
		item.ArtworkURL = getProxiedArtworkURL(artworkURL, 96)
		return
	}

	// Final fallback
	item.Name = "专辑"
	item.Subtitle = "专辑"
}

func (s *RecentlyPlayedService) fillArtistDetails(ctx context.Context, userID string, item *models.RecentlyPlayedItemWithDetails) {
	if resolver := newLocalLibrarySnapshotResolver(s.localLibraryRepo); resolver != nil {
		if artist, err := resolver.ResolveArtist(ctx, item.ItemID); err == nil && artist != nil {
			item.Name = artist.Name
			item.Subtitle = "艺人"
			item.ArtworkURL = artist.ArtworkURL
			return
		} else if err != nil {
			log.Printf("Failed to resolve local artist snapshot %s: %v", item.ItemID, err)
		}
	}

	// Try database first
	query := `SELECT artist_name, artwork_url FROM followed_artists WHERE artist_id = $1 AND user_id = $2`
	var artistName, artworkURL string
	if err := s.db.QueryRowContext(ctx, query, item.ItemID, userID).Scan(&artistName, &artworkURL); err == nil {
		item.Name = artistName
		item.Subtitle = "艺人"
		item.ArtworkURL = getProxiedArtworkURL(artworkURL, 96)
		return
	}

	// Final fallback
	item.Name = "艺人"
	item.Subtitle = "艺人"
}

func (s *RecentlyPlayedService) fillLikedSongsDetails(ctx context.Context, userID string, item *models.RecentlyPlayedItemWithDetails) {
	query := `SELECT COUNT(*) FROM liked_songs WHERE user_id = $1`
	var count int
	if err := s.db.QueryRowContext(ctx, query, userID).Scan(&count); err == nil {
		item.Name = "喜欢的歌曲"
		item.Subtitle = fmt.Sprintf("%d 首歌曲", count)
	} else {
		item.Name = "喜欢的歌曲"
		item.Subtitle = "歌曲"
	}
}
