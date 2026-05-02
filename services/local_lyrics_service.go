package services

import (
	"context"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"github.com/OwlCt/OwlPlayer/utils/lyrics"
	"os"
	"strconv"
	"strings"
	"time"
)

type LocalLyricsService struct {
	repo                LocalLibraryRepository
	enhancer            *LocalMetadataEnhancer
	config              LocalMediaConfig
	storefront          string
	language            string
	token               string
	userToken           string
	cache               *MetadataCache
	fetchLyrics         func(storefront, songID, language, token, userToken string) (string, string, error)
	scheduleEnhancement func(mediaID int64)
}

func NewLocalLyricsService(repo LocalLibraryRepository, enhancer *LocalMetadataEnhancer, config LocalMediaConfig, storefront, language, token, userToken string) *LocalLyricsService {
	service := &LocalLyricsService{
		repo:        repo,
		enhancer:    enhancer,
		config:      config,
		storefront:  storefront,
		language:    language,
		token:       token,
		userToken:   userToken,
		cache:       GetMetadataCache(),
		fetchLyrics: lyrics.GetTTML,
	}
	if enhancer != nil {
		service.scheduleEnhancement = func(mediaID int64) {
			enhancer.ScheduleEnhanceMedia(mediaID)
		}
	}
	return service
}

func (s *LocalLyricsService) GetLyrics(ctx context.Context, mediaID string) (*models.LyricsResponse, error) {
	if s == nil || s.repo == nil {
		return &models.LyricsResponse{Available: false, SongID: mediaID}, nil
	}

	parsedID, err := strconv.ParseInt(mediaID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid local media id %q", mediaID)
	}

	localLyrics, err := s.resolveLocalLyrics(ctx, parsedID)
	if err != nil {
		return nil, err
	}

	mapping, err := s.repo.GetLyricsMappingByMediaID(ctx, parsedID)
	if err != nil {
		return nil, fmt.Errorf("load lyrics mapping for media %s: %w", mediaID, err)
	}

	cacheKey := "local:" + mediaID
	if s.cache != nil {
		var cached models.LyricsResponse
		if s.cache.Get("lyrics", cacheKey, &cached) && cached.Available {
			if localLyrics == nil {
				return &cached, nil
			}

			if !shouldAttemptRemoteLyricsComparison(mapping, localLyrics, &cached, s.config) {
				selected := preferHigherQualityLyrics(localLyrics, &cached)
				if selected != nil {
					_ = s.cache.Set("lyrics", cacheKey, selected, LyricsTTL)
					return selected, nil
				}
			}
		}
	}

	if !canUseRemoteLyrics(mapping, s.config) {
		if s.scheduleEnhancement != nil && s.config.AppleMusic.MetadataEnhancement {
			s.scheduleEnhancement(parsedID)
		}
		if localLyrics != nil {
			if s.cache != nil {
				_ = s.cache.Set("lyrics", cacheKey, localLyrics, LyricsTTL)
			}
			return localLyrics, nil
		}
		result := &models.LyricsResponse{Available: false, SongID: mediaID}
		if s.cache != nil {
			_ = s.cache.Set("lyrics", cacheKey, result, LyricsTTL)
		}
		return result, nil
	}

	now := time.Now()
	mapping.LastRequestedAt = &now
	_, _ = s.repo.SaveLyricsMapping(ctx, mapping)

	fetchLyrics := s.fetchLyrics
	if fetchLyrics == nil {
		fetchLyrics = lyrics.GetTTML
	}
	ttml, lyricType, err := fetchLyrics(s.storefront, mapping.AppleMusicSongID, s.language, s.token, s.userToken)
	if err != nil || ttml == "" {
		mapping.Status = models.LyricsMappingStatusError
		mapping.ErrorMessage = ""
		if err != nil {
			mapping.ErrorMessage = err.Error()
		}
		_, _ = s.repo.SaveLyricsMapping(ctx, mapping)
		if localLyrics != nil {
			if s.cache != nil {
				_ = s.cache.Set("lyrics", cacheKey, localLyrics, LyricsTTL)
			}
			return localLyrics, nil
		}
		result := &models.LyricsResponse{Available: false, SongID: mediaID}
		if s.cache != nil {
			_ = s.cache.Set("lyrics", cacheKey, result, LyricsTTL)
		}
		return result, nil
	}

	mapping.Status = models.LyricsMappingStatusAvailable
	mapping.LastSyncedAt = &now
	mapping.ErrorMessage = ""
	_, _ = s.repo.SaveLyricsMapping(ctx, mapping)

	result := &models.LyricsResponse{
		Available: true,
		SongID:    mediaID,
		TTML:      ttml,
		Type:      lyricType,
	}
	selected := preferHigherQualityLyrics(localLyrics, result)
	if selected == nil {
		selected = result
	}
	if s.cache != nil {
		_ = s.cache.Set("lyrics", cacheKey, selected, LyricsTTL)
	}
	return selected, nil
}

func (s *LocalLyricsService) resolveLocalLyrics(ctx context.Context, mediaID int64) (*models.LyricsResponse, error) {
	file, err := s.repo.GetPrimaryMediaFileByMediaID(ctx, mediaID)
	if err != nil {
		return nil, fmt.Errorf("load media file for lyrics %d: %w", mediaID, err)
	}
	if file == nil || file.AbsolutePath == "" {
		return nil, nil
	}

	parsed, err := parseLocalTags(file.AbsolutePath)
	if err != nil {
		return nil, fmt.Errorf("parse local lyrics tags %s: %w", file.AbsolutePath, err)
	}
	if parsed != nil && strings.TrimSpace(parsed.LyricsText) != "" {
		ttml, lyricType, err := normalizeLocalLyricsToTTML(parsed.LyricsText, parsed.LyricsFormat)
		if err != nil {
			return nil, fmt.Errorf("normalize embedded lyrics for %s: %w", file.AbsolutePath, err)
		}
		if ttml != "" {
			return &models.LyricsResponse{
				Available: true,
				SongID:    strconv.FormatInt(mediaID, 10),
				TTML:      ttml,
				Type:      lyricType,
			}, nil
		}
	}

	sidecarPath := findSidecarLyrics(file.AbsolutePath)
	if sidecarPath == "" {
		return nil, nil
	}

	content, format, err := readLyricsFile(sidecarPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read lyrics sidecar %s: %w", sidecarPath, err)
	}
	if strings.TrimSpace(content) == "" {
		return nil, nil
	}

	ttml, lyricType, err := normalizeLocalLyricsToTTML(content, format)
	if err != nil {
		return nil, fmt.Errorf("normalize lyrics sidecar %s: %w", sidecarPath, err)
	}
	if ttml == "" {
		return nil, nil
	}

	return &models.LyricsResponse{
		Available: true,
		SongID:    strconv.FormatInt(mediaID, 10),
		TTML:      ttml,
		Type:      lyricType,
	}, nil
}

func canUseRemoteLyrics(mapping *models.LyricsMapping, config LocalMediaConfig) bool {
	return mapping != nil &&
		mapping.AppleMusicSongID != "" &&
		mapping.MatchConfidence >= config.AppleMusic.MatchThreshold &&
		config.AppleMusic.LyricsEnhancement
}

func shouldAttemptRemoteLyricsComparison(mapping *models.LyricsMapping, localLyrics, cachedLyrics *models.LyricsResponse, config LocalMediaConfig) bool {
	if localLyrics == nil || cachedLyrics == nil {
		return false
	}
	if !canUseRemoteLyrics(mapping, config) {
		return false
	}
	if mapping.Status != models.LyricsMappingStatusMatched {
		return false
	}
	return lyricsQualityScore(cachedLyrics) <= lyricsQualityScore(localLyrics)
}

func preferHigherQualityLyrics(primary, secondary *models.LyricsResponse) *models.LyricsResponse {
	switch {
	case primary == nil:
		return secondary
	case secondary == nil:
		return primary
	case lyricsQualityScore(secondary) > lyricsQualityScore(primary):
		return secondary
	default:
		return primary
	}
}

func lyricsQualityScore(lyricsResponse *models.LyricsResponse) int {
	if lyricsResponse == nil || !lyricsResponse.Available || strings.TrimSpace(lyricsResponse.TTML) == "" {
		return -1
	}

	score := 0
	switch lyricsResponse.Type {
	case "syllable-lyrics":
		score += 4
	case "lyrics":
		score += 2
	default:
		score++
	}

	ttml := lyricsResponse.TTML
	if strings.Contains(ttml, "<translations") || strings.Contains(ttml, "<translation ") {
		score += 3
	}
	if strings.Contains(ttml, "<transliterations") || strings.Contains(ttml, "<transliteration ") {
		score += 2
	}
	return score
}
