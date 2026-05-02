package services

import (
	"context"
	"errors"
	"fmt"
	"main/models"
	"main/utils/ampapi"
	"main/utils/lyrics"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type localRemoteMatchCandidate struct {
	Song  ampapi.SongRespData
	Score float64
}

type LocalMetadataEnhancer struct {
	repo           LocalLibraryRepository
	config         LocalMediaConfig
	storefront     string
	language       string
	token          string
	mediaUserToken string
	cache          *MetadataCache
	fetchLyrics    func(storefront, songID, language, token, userToken string) (string, string, error)
	searchFn       func(storefront, term, types, language, token string, limit, offset int) (*ampapi.SearchResp, error)
	sleepFn        func(context.Context, time.Duration) error
	searchMu       sync.Mutex
	lastSearchAt   time.Time
	searchInterval time.Duration
	maxSearchRetry int
	queue          chan int64
	stateMu        sync.Mutex
	scheduled      map[int64]struct{}
	processing     map[int64]struct{}
}

func NewLocalMetadataEnhancer(repo LocalLibraryRepository, config LocalMediaConfig, storefront, language, token, mediaUserToken string) *LocalMetadataEnhancer {
	enhancer := &LocalMetadataEnhancer{
		repo:           repo,
		config:         config,
		storefront:     storefront,
		language:       language,
		token:          token,
		mediaUserToken: mediaUserToken,
		cache:          GetMetadataCache(),
		fetchLyrics:    lyrics.GetTTML,
		searchFn:       ampapi.Search,
		sleepFn:        sleepWithContext,
		searchInterval: 1500 * time.Millisecond,
		maxSearchRetry: 3,
		queue:          make(chan int64, 2048),
		scheduled:      make(map[int64]struct{}),
		processing:     make(map[int64]struct{}),
	}
	go enhancer.runEnhancementWorker()
	return enhancer
}

func (e *LocalMetadataEnhancer) EnhanceMedia(ctx context.Context, mediaID int64) error {
	if e == nil || e.repo == nil || !e.config.AppleMusic.MetadataEnhancement {
		return nil
	}
	if !e.beginEnhancement(mediaID) {
		return nil
	}
	defer e.finishEnhancement(mediaID)

	media, err := e.repo.GetMediaByID(ctx, mediaID)
	if err != nil {
		return fmt.Errorf("load media %d: %w", mediaID, err)
	}
	if media == nil || media.AvailabilityStatus != models.AvailabilityStatusAvailable {
		return nil
	}
	album, err := e.repo.GetAlbumByID(ctx, media.AlbumID)
	if err != nil {
		return fmt.Errorf("load album %d: %w", media.AlbumID, err)
	}
	artist, err := e.repo.GetArtistByID(ctx, media.PrimaryArtistID)
	if err != nil {
		return fmt.Errorf("load artist %d: %w", media.PrimaryArtistID, err)
	}
	if artist == nil {
		return nil
	}

	match, err := e.findBestRemoteMatch(ctx, media, album, artist)
	if err != nil {
		return err
	}
	if match == nil || match.Score < e.config.AppleMusic.MatchThreshold {
		return e.saveLyricsMapping(ctx, media.ID, "", matchScore(match), models.LyricsMappingStatusUnmatched, "")
	}

	return e.applyRemoteMatch(ctx, media, album, artist, match)
}

func (e *LocalMetadataEnhancer) applyRemoteMatch(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist, match *localRemoteMatchCandidate) error {
	if match == nil {
		return nil
	}

	media.AppleMusicSongID = match.Song.ID
	if len(media.Genres) == 0 && len(match.Song.Attributes.GenreNames) > 0 {
		media.Genres = append([]string(nil), match.Song.Attributes.GenreNames...)
		_ = saveCandidateField(ctx, e.repo, models.LocalEntityTypeMedia, media.ID, "genres", localMetadataCandidate{
			Value:      append([]string(nil), match.Song.Attributes.GenreNames...),
			Source:     models.MetadataSourceRemote,
			Confidence: match.Score,
			Details:    map[string]any{"value": append([]string(nil), match.Song.Attributes.GenreNames...)},
		}, true)
	}
	if media.ReleaseDate == nil {
		if releaseDate := parseTagReleaseDate(match.Song.Attributes.ReleaseDate); releaseDate != nil {
			media.ReleaseDate = releaseDate
			_ = saveCandidateField(ctx, e.repo, models.LocalEntityTypeMedia, media.ID, "release_date", localMetadataCandidate{
				Value:      *releaseDate,
				Source:     models.MetadataSourceRemote,
				Confidence: match.Score,
				Details:    map[string]any{"value": releaseDate.Format("2006-01-02")},
			}, true)
		}
	}
	if media.ContentRating == "" && match.Song.Attributes.ContentRating != "" {
		media.ContentRating = match.Song.Attributes.ContentRating
		_ = saveCandidateField(ctx, e.repo, models.LocalEntityTypeMedia, media.ID, "content_rating", localMetadataCandidate{
			Value:      match.Song.Attributes.ContentRating,
			Source:     models.MetadataSourceRemote,
			Confidence: match.Score,
			Details:    map[string]any{"value": match.Song.Attributes.ContentRating},
		}, true)
	}
	if match.Song.Attributes.HasLyrics || match.Song.Attributes.HasTimeSyncedLyrics {
		media.LyricsAvailable = true
	}
	if _, err := e.repo.SaveMedia(ctx, media); err != nil {
		return fmt.Errorf("save matched media %d: %w", media.ID, err)
	}

	if album != nil {
		if album.AppleMusicAlbumID == "" && len(match.Song.Relationships.Albums.Data) > 0 {
			album.AppleMusicAlbumID = match.Song.Relationships.Albums.Data[0].ID
		}
		if album.ArtworkPath == "" && album.ArtworkURL == "" && len(match.Song.Relationships.Albums.Data) > 0 {
			album.ArtworkURL = match.Song.Relationships.Albums.Data[0].Attributes.Artwork.URL
			_ = saveCandidateField(ctx, e.repo, models.LocalEntityTypeAlbum, album.ID, "artwork", localMetadataCandidate{
				Value:      album.ArtworkURL,
				Source:     models.MetadataSourceRemote,
				Confidence: match.Score,
				Details:    map[string]any{"url": album.ArtworkURL, "value": album.ArtworkURL},
			}, true)
		}
		if _, err := e.repo.SaveAlbum(ctx, album); err != nil {
			return fmt.Errorf("save matched album %d: %w", album.ID, err)
		}
	}

	if artist != nil {
		if artist.AppleMusicArtistID == "" && len(match.Song.Relationships.Artists.Data) > 0 {
			artist.AppleMusicArtistID = match.Song.Relationships.Artists.Data[0].ID
		}
		if artist.ArtworkPath == "" && artist.ArtworkURL == "" && len(match.Song.Relationships.Artists.Data) > 0 {
			artist.ArtworkURL = match.Song.Relationships.Artists.Data[0].Attributes.Artwork.URL
			_ = saveCandidateField(ctx, e.repo, models.LocalEntityTypeArtist, artist.ID, "artwork", localMetadataCandidate{
				Value:      artist.ArtworkURL,
				Source:     models.MetadataSourceRemote,
				Confidence: match.Score,
				Details:    map[string]any{"url": artist.ArtworkURL, "value": artist.ArtworkURL},
			}, true)
		}
		if _, err := e.repo.SaveArtist(ctx, artist); err != nil {
			return fmt.Errorf("save matched artist %d: %w", artist.ID, err)
		}
	}

	if err := e.saveLyricsMapping(ctx, media.ID, match.Song.ID, match.Score, models.LyricsMappingStatusMatched, ""); err != nil {
		return err
	}

	if err := e.saveRemoteSupplementalFields(ctx, media, album, artist, match); err != nil {
		return err
	}

	return e.prefetchRemoteLyrics(ctx, media, match)
}

func (e *LocalMetadataEnhancer) findBestRemoteMatch(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist) (*localRemoteMatchCandidate, error) {
	query := strings.TrimSpace(strings.Join([]string{media.Title, artist.Name}, " "))
	if query == "" {
		return nil, nil
	}

	resp, err := e.searchMatchCandidates(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("search apple music match candidates: %w", err)
	}
	if resp.Results.Songs == nil {
		return nil, nil
	}

	var best *localRemoteMatchCandidate
	for _, candidate := range resp.Results.Songs.Data {
		score := scoreRemoteMatchCandidate(media, album, artist, candidate)
		if best == nil || score > best.Score {
			copy := candidate
			best = &localRemoteMatchCandidate{Song: copy, Score: score}
		}
	}
	return best, nil
}

func (e *LocalMetadataEnhancer) ScheduleEnhanceMedia(mediaID int64) {
	if e == nil || mediaID == 0 || !e.config.AppleMusic.MetadataEnhancement {
		return
	}

	e.stateMu.Lock()
	if _, exists := e.scheduled[mediaID]; exists {
		e.stateMu.Unlock()
		return
	}
	if _, exists := e.processing[mediaID]; exists {
		e.stateMu.Unlock()
		return
	}
	e.scheduled[mediaID] = struct{}{}
	e.stateMu.Unlock()

	select {
	case e.queue <- mediaID:
	default:
		go func() {
			e.queue <- mediaID
		}()
	}
}

func (e *LocalMetadataEnhancer) beginEnhancement(mediaID int64) bool {
	if e == nil || mediaID == 0 {
		return false
	}
	e.stateMu.Lock()
	defer e.stateMu.Unlock()
	if _, exists := e.processing[mediaID]; exists {
		return false
	}
	e.processing[mediaID] = struct{}{}
	delete(e.scheduled, mediaID)
	return true
}

func (e *LocalMetadataEnhancer) finishEnhancement(mediaID int64) {
	if e == nil || mediaID == 0 {
		return
	}
	e.stateMu.Lock()
	delete(e.processing, mediaID)
	e.stateMu.Unlock()
}

func (e *LocalMetadataEnhancer) runEnhancementWorker() {
	if e == nil {
		return
	}
	for mediaID := range e.queue {
		if err := e.EnhanceMedia(context.Background(), mediaID); err != nil {
			fmt.Printf("local metadata enhancement failed for media %d: %v\n", mediaID, err)
		}
	}
}

func (e *LocalMetadataEnhancer) searchMatchCandidates(ctx context.Context, query string) (*ampapi.SearchResp, error) {
	if e == nil {
		return nil, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}

	e.searchMu.Lock()
	defer e.searchMu.Unlock()

	searchFn := e.searchFn
	if searchFn == nil {
		searchFn = ampapi.Search
	}
	sleepFn := e.sleepFn
	if sleepFn == nil {
		sleepFn = sleepWithContext
	}

	attempts := e.maxSearchRetry
	if attempts < 1 {
		attempts = 1
	}

	for attempt := 0; attempt < attempts; attempt++ {
		if err := e.waitForSearchWindow(ctx, sleepFn); err != nil {
			return nil, err
		}

		resp, err := searchFn(e.storefront, query, "songs", e.language, e.token, 10, 0)
		e.lastSearchAt = time.Now()
		if err == nil {
			return resp, nil
		}

		var statusErr *ampapi.APIStatusError
		if !isRateLimitError(err, &statusErr) || attempt == attempts-1 {
			return nil, err
		}

		backoff := statusErr.RetryAfter
		if backoff <= 0 {
			backoff = time.Duration(attempt+1) * 2 * time.Second
		}
		if err := sleepFn(ctx, backoff); err != nil {
			return nil, err
		}
	}

	return nil, nil
}

func (e *LocalMetadataEnhancer) waitForSearchWindow(ctx context.Context, sleepFn func(context.Context, time.Duration) error) error {
	if e == nil {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if e.searchInterval <= 0 || e.lastSearchAt.IsZero() {
		return nil
	}
	wait := e.searchInterval - time.Since(e.lastSearchAt)
	if wait <= 0 {
		return nil
	}
	return sleepFn(ctx, wait)
}

func sleepWithContext(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return nil
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func isRateLimitError(err error, target **ampapi.APIStatusError) bool {
	if err == nil {
		return false
	}
	var statusErr *ampapi.APIStatusError
	if errors.As(err, &statusErr) {
		if target != nil {
			*target = statusErr
		}
		return statusErr.StatusCode == http.StatusTooManyRequests
	}
	return false
}

func (e *LocalMetadataEnhancer) prefetchRemoteLyrics(ctx context.Context, media *models.LocalMedia, match *localRemoteMatchCandidate) error {
	if e == nil || media == nil || match == nil {
		return nil
	}
	if !e.config.AppleMusic.LyricsEnhancement || strings.TrimSpace(match.Song.ID) == "" {
		return nil
	}
	if !match.Song.Attributes.HasLyrics && !match.Song.Attributes.HasTimeSyncedLyrics {
		return nil
	}

	fetchLyrics := e.fetchLyrics
	if fetchLyrics == nil {
		fetchLyrics = lyrics.GetTTML
	}

	ttml, lyricType, err := fetchLyrics(e.storefront, match.Song.ID, e.language, e.token, e.mediaUserToken)
	if err != nil || strings.TrimSpace(ttml) == "" {
		if err == nil {
			err = errors.New("no lyrics available")
		}
		if saveErr := e.saveLyricsMapping(ctx, media.ID, match.Song.ID, match.Score, models.LyricsMappingStatusError, err.Error()); saveErr != nil {
			return saveErr
		}
		return fmt.Errorf("prefetch lyrics for media %d: %w", media.ID, err)
	}

	cacheKey := "local:" + strconv.FormatInt(media.ID, 10)
	result := &models.LyricsResponse{
		Available: true,
		SongID:    strconv.FormatInt(media.ID, 10),
		TTML:      ttml,
		Type:      lyricType,
	}
	if e.cache != nil {
		if err := e.cache.Set("lyrics", cacheKey, result, LyricsTTL); err != nil {
			return fmt.Errorf("cache lyrics for media %d: %w", media.ID, err)
		}
	}

	if !media.LyricsAvailable {
		media.LyricsAvailable = true
		if _, err := e.repo.SaveMedia(ctx, media); err != nil {
			return fmt.Errorf("save media %d lyrics availability: %w", media.ID, err)
		}
	}

	if err := e.saveLyricsMapping(ctx, media.ID, match.Song.ID, match.Score, models.LyricsMappingStatusAvailable, ""); err != nil {
		return err
	}
	return nil
}

func (e *LocalMetadataEnhancer) saveLyricsMapping(ctx context.Context, mediaID int64, appleSongID string, confidence float64, status models.LyricsMappingStatus, errorMessage string) error {
	now := time.Now()
	_, err := e.repo.SaveLyricsMapping(ctx, &models.LyricsMapping{
		MediaID:          mediaID,
		AppleMusicSongID: appleSongID,
		Source:           models.LyricsSourceAppleMusic,
		MatchConfidence:  confidence,
		Status:           status,
		LastSyncedAt:     &now,
		ErrorMessage:     errorMessage,
	})
	if err != nil {
		return fmt.Errorf("save lyrics mapping for media %d: %w", mediaID, err)
	}
	return nil
}

func (e *LocalMetadataEnhancer) saveRemoteSupplementalFields(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist, match *localRemoteMatchCandidate) error {
	if match == nil {
		return nil
	}

	releaseType := models.ReleaseTypeAlbum
	if len(match.Song.Relationships.Albums.Data) > 0 {
		albumAttributes := match.Song.Relationships.Albums.Data[0].Attributes
		releaseType = classifyAppleReleaseType(albumAttributes.Name, albumAttributes.TrackCount, albumAttributes.IsSingle)
	}

	fields := []struct {
		entityType models.LocalEntityType
		entityID   int64
		fieldName  string
		value      string
	}{
		{models.LocalEntityTypeMedia, media.ID, "remote_title", match.Song.Attributes.Name},
		{models.LocalEntityTypeArtist, artist.ID, "remote_name", candidateArtistName(match.Song)},
		{models.LocalEntityTypeAlbum, albumID(album), "remote_title", candidateAlbumName(match.Song)},
		{models.LocalEntityTypeAlbum, albumID(album), "release_type", string(releaseType)},
	}
	for _, field := range fields {
		if field.entityID == 0 || strings.TrimSpace(field.value) == "" {
			continue
		}
		if err := saveCandidateField(ctx, e.repo, field.entityType, field.entityID, field.fieldName, localMetadataCandidate{
			Value:      field.value,
			Source:     models.MetadataSourceRemote,
			Confidence: match.Score,
			Details:    map[string]any{"value": field.value},
		}, true); err != nil {
			return err
		}
	}
	return nil
}

func scoreRemoteMatchCandidate(media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist, candidate ampapi.SongRespData) float64 {
	totalWeight := 0.0
	score := 0.0

	addWeightedScore := func(value, weight float64) {
		if value < 0 {
			return
		}
		score += value * weight
		totalWeight += weight
	}

	addWeightedScore(compareNormalizedText(media.Title, candidate.Attributes.Name), 0.35)
	if artist != nil && artist.Name != "" {
		addWeightedScore(compareNormalizedText(artist.Name, candidate.Attributes.ArtistName), 0.30)
	}
	if album != nil && album.Title != "" {
		addWeightedScore(compareNormalizedText(album.Title, candidate.Attributes.AlbumName), 0.15)
	}
	if media.DurationMs > 0 && candidate.Attributes.DurationInMillis > 0 {
		addWeightedScore(compareDuration(media.DurationMs, candidate.Attributes.DurationInMillis), 0.15)
	}
	if media.TrackNumber > 0 && candidate.Attributes.TrackNumber > 0 {
		addWeightedScore(compareOrdinal(media.TrackNumber, candidate.Attributes.TrackNumber), 0.05)
	}

	if totalWeight == 0 {
		return 0
	}
	return score / totalWeight
}

func compareNormalizedText(local, remote string) float64 {
	local = normalizeText(local)
	remote = normalizeText(remote)
	if local == "" || remote == "" {
		return -1
	}
	if local == remote {
		return 1
	}
	if strings.Contains(local, remote) || strings.Contains(remote, local) {
		return 0.82
	}

	localTerms := strings.Fields(local)
	remoteTerms := strings.Fields(remote)
	if len(localTerms) == 0 || len(remoteTerms) == 0 {
		return 0
	}

	matchCount := 0
	remoteSet := make(map[string]struct{}, len(remoteTerms))
	for _, term := range remoteTerms {
		remoteSet[term] = struct{}{}
	}
	for _, term := range localTerms {
		if _, ok := remoteSet[term]; ok {
			matchCount++
		}
	}
	return float64(matchCount) / float64(max(len(localTerms), len(remoteTerms)))
}

func compareDuration(localMs, remoteMs int) float64 {
	diff := localMs - remoteMs
	if diff < 0 {
		diff = -diff
	}
	switch {
	case diff <= 1000:
		return 1
	case diff <= 3000:
		return 0.9
	case diff <= 8000:
		return 0.75
	case diff <= 15000:
		return 0.5
	default:
		return 0
	}
}

func compareOrdinal(local, remote int) float64 {
	switch {
	case local <= 0 || remote <= 0:
		return -1
	case local == remote:
		return 1
	default:
		return 0
	}
}

func candidateArtistName(song ampapi.SongRespData) string {
	if len(song.Relationships.Artists.Data) > 0 {
		return song.Relationships.Artists.Data[0].Attributes.Name
	}
	return song.Attributes.ArtistName
}

func candidateAlbumName(song ampapi.SongRespData) string {
	if len(song.Relationships.Albums.Data) > 0 {
		return song.Relationships.Albums.Data[0].Attributes.Name
	}
	return song.Attributes.AlbumName
}

func albumID(album *models.LocalAlbum) int64 {
	if album == nil {
		return 0
	}
	return album.ID
}

func matchScore(match *localRemoteMatchCandidate) float64 {
	if match == nil {
		return 0
	}
	return match.Score
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func metadataEntityID(id int64) string {
	if id == 0 {
		return ""
	}
	return strconv.FormatInt(id, 10)
}
