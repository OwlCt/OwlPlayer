package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"main/models"
	"main/utils/ampapi"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type localMetadataRemoteProvider interface {
	GetArtist(storefront, id, language, token string) (*ampapi.ArtistResp, error)
	GetAlbum(storefront, id, language, token string) (*ampapi.AlbumResp, error)
	Search(storefront, term, types, language, token string, limit, offset int) (*ampapi.SearchResp, error)
}

type ampRemoteProvider struct{}

func (ampRemoteProvider) GetArtist(storefront, id, language, token string) (*ampapi.ArtistResp, error) {
	return ampapi.GetArtistResp(storefront, id, language, token)
}

func (ampRemoteProvider) GetAlbum(storefront, id, language, token string) (*ampapi.AlbumResp, error) {
	return ampapi.GetAlbumResp(storefront, id, language, token)
}

func (ampRemoteProvider) Search(storefront, term, types, language, token string, limit, offset int) (*ampapi.SearchResp, error) {
	return ampapi.Search(storefront, term, types, language, token, limit, offset)
}

type metadataArtistValues struct {
	Name           string   `json:"name"`
	ArtworkURL     string   `json:"artworkUrl,omitempty"`
	ArtworkWidth   int      `json:"artworkWidth,omitempty"`
	ArtworkHeight  int      `json:"artworkHeight,omitempty"`
	Genres         []string `json:"genres,omitempty"`
	MotionVideoURL string   `json:"motionVideoUrl,omitempty"`
	LandscapeURL   string   `json:"landscapeUrl,omitempty"`
	AppleMusicID   string   `json:"appleMusicId,omitempty"`
}

type metadataAlbumValues struct {
	Name         string `json:"name"`
	ArtworkURL   string `json:"artworkUrl,omitempty"`
	ReleaseDate  string `json:"releaseDate,omitempty"`
	ArtistName   string `json:"artistName,omitempty"`
	AppleMusicID string `json:"appleMusicId,omitempty"`
}

type MetadataCandidate struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Subtitle    string   `json:"subtitle,omitempty"`
	ArtworkURL  string   `json:"artworkUrl,omitempty"`
	ReleaseDate string   `json:"releaseDate,omitempty"`
	Genres      []string `json:"genres,omitempty"`
}

type ArtistMetadataCorrection struct {
	EntityType    string                      `json:"entityType"`
	EntityID      int64                       `json:"entityId"`
	OverrideMode  models.MetadataOverrideMode `json:"overrideMode"`
	ManualData    map[string]any              `json:"manualData,omitempty"`
	LyricsSource  models.MetadataLyricsSource `json:"lyricsSource,omitempty"`
	Local         metadataArtistValues        `json:"local"`
	Resolved      metadataArtistValues        `json:"resolved"`
	MetadataState models.MetadataState        `json:"metadataState"`
	CurrentMatch  *MetadataCandidate          `json:"currentMatch,omitempty"`
	Candidates    []MetadataCandidate         `json:"candidates"`
}

type AlbumMetadataCorrection struct {
	EntityType    string                      `json:"entityType"`
	EntityID      int64                       `json:"entityId"`
	OverrideMode  models.MetadataOverrideMode `json:"overrideMode"`
	ManualData    map[string]any              `json:"manualData,omitempty"`
	LyricsSource  models.MetadataLyricsSource `json:"lyricsSource,omitempty"`
	Local         metadataAlbumValues         `json:"local"`
	Resolved      metadataAlbumValues         `json:"resolved"`
	MetadataState models.MetadataState        `json:"metadataState"`
	CurrentMatch  *MetadataCandidate          `json:"currentMatch,omitempty"`
	Candidates    []MetadataCandidate         `json:"candidates"`
}

type MetadataControlUpdate struct {
	OverrideMode models.MetadataOverrideMode `json:"overrideMode"`
	ManualData   map[string]any              `json:"manualData,omitempty"`
	AppleMusicID *string                     `json:"appleMusicId,omitempty"`
	ClearMatch   bool                        `json:"clearMatch,omitempty"`
	LyricsSource models.MetadataLyricsSource `json:"lyricsSource,omitempty"`
}

type artistSongPlayStat struct {
	SongID       string
	PlayCount    int
	LastPlayedAt time.Time
}

type cachedMetadataArtist struct {
	values    metadataArtistValues
	expiresAt time.Time
}

type cachedMetadataAlbum struct {
	values    metadataAlbumValues
	expiresAt time.Time
}

type LocalMetadataControlService struct {
	db         *Database
	repo       LocalLibraryRepository
	config     LocalMediaConfig
	storefront string
	language   string
	token      string
	remote     localMetadataRemoteProvider
	cacheMu    sync.RWMutex
	artistMeta map[string]cachedMetadataArtist
	albumMeta  map[string]cachedMetadataAlbum
}

func NewLocalMetadataControlService(db *Database, repo LocalLibraryRepository, config LocalMediaConfig, storefront, language, token string) *LocalMetadataControlService {
	return &LocalMetadataControlService{
		db:         db,
		repo:       repo,
		config:     config,
		storefront: storefront,
		language:   language,
		token:      token,
		remote:     ampRemoteProvider{},
		artistMeta: make(map[string]cachedMetadataArtist),
		albumMeta:  make(map[string]cachedMetadataAlbum),
	}
}

func (s *LocalMetadataControlService) SetToken(token string) {
	if s != nil {
		s.token = token
	}
}

func (s *LocalMetadataControlService) metadataEnhancementAvailable() bool {
	return s != nil && s.config.AppleMusic.MetadataEnhancement && strings.TrimSpace(s.storefront) != ""
}

func (s *LocalMetadataControlService) GetEntityControl(ctx context.Context, entityType models.LocalEntityType, entityID int64) (*models.LocalEntityMetadataControl, error) {
	query := fmt.Sprintf(`SELECT %s FROM local_entity_metadata_controls WHERE entity_type = $1 AND entity_id = $2`, models.LocalEntityMetadataControlColumns())
	control, err := models.ScanLocalEntityMetadataControl(s.db.QueryRowContext(ctx, query, entityType, entityID))
	if err == sql.ErrNoRows {
		return &models.LocalEntityMetadataControl{
			EntityType:   entityType,
			EntityID:     entityID,
			OverrideMode: models.MetadataOverrideModeInherit,
			ManualData:   map[string]any{},
		}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get entity metadata control: %w", err)
	}
	if control.OverrideMode == "" {
		control.OverrideMode = models.MetadataOverrideModeInherit
	}
	if control.ManualData == nil {
		control.ManualData = map[string]any{}
	}
	return control, nil
}

func (s *LocalMetadataControlService) SaveEntityControl(ctx context.Context, actorID string, control *models.LocalEntityMetadataControl) (*models.LocalEntityMetadataControl, error) {
	if control == nil {
		return nil, fmt.Errorf("entity metadata control is required")
	}
	if control.OverrideMode == "" {
		control.OverrideMode = models.MetadataOverrideModeInherit
	}
	if control.ManualData == nil {
		control.ManualData = map[string]any{}
	}

	manualData, err := marshalJSON(control.ManualData)
	if err != nil {
		return nil, fmt.Errorf("marshal manual data: %w", err)
	}

	var lyricsSource sql.NullString
	if control.LyricsSource != "" {
		lyricsSource = sql.NullString{String: string(control.LyricsSource), Valid: true}
	}

	query := fmt.Sprintf(`
		INSERT INTO local_entity_metadata_controls (
			entity_type, entity_id, override_mode, manual_data, lyrics_source, updated_by
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (entity_type, entity_id)
		DO UPDATE SET override_mode = EXCLUDED.override_mode,
		              manual_data = EXCLUDED.manual_data,
		              lyrics_source = EXCLUDED.lyrics_source,
		              updated_by = EXCLUDED.updated_by,
		              updated_at = NOW()
		RETURNING %s
	`, models.LocalEntityMetadataControlColumns())

	saved, err := models.ScanLocalEntityMetadataControl(s.db.QueryRowContext(
		ctx,
		query,
		control.EntityType,
		control.EntityID,
		control.OverrideMode,
		manualData,
		lyricsSource,
		sql.NullString{String: actorID, Valid: strings.TrimSpace(actorID) != ""},
	))
	if err != nil {
		return nil, fmt.Errorf("save entity metadata control: %w", err)
	}
	return saved, nil
}

func (s *LocalMetadataControlService) DeleteEntityControl(ctx context.Context, entityType models.LocalEntityType, entityID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM local_entity_metadata_controls WHERE entity_type = $1 AND entity_id = $2`, entityType, entityID)
	if err != nil {
		return fmt.Errorf("delete entity metadata control: %w", err)
	}
	return nil
}

func (s *LocalMetadataControlService) ResolveArtist(ctx context.Context, userID string, artist *models.LocalArtist, localArtworkURL string, localArtworkWidth, localArtworkHeight int) (*metadataArtistValues, models.MetadataState, error) {
	if artist == nil {
		return &metadataArtistValues{}, models.MetadataState{}, nil
	}

	metaEnabled := s.config.AppleMusic.MetadataEnhancement
	control, err := s.GetEntityControl(ctx, models.LocalEntityTypeArtist, artist.ID)
	if err != nil {
		return nil, models.MetadataState{}, err
	}

	local := metadataArtistValues{
		Name:          artist.Name,
		ArtworkURL:    localArtworkURL,
		ArtworkWidth:  localArtworkWidth,
		ArtworkHeight: localArtworkHeight,
		AppleMusicID:  artist.AppleMusicArtistID,
	}

	var remote *metadataArtistValues
	if s.metadataEnhancementAvailable() && strings.TrimSpace(artist.AppleMusicArtistID) != "" {
		remote, _ = s.fetchArtistMetadata(ctx, artist.AppleMusicArtistID)
	}

	resolved, state := resolveArtistPresentation(local, remote, metaEnabled, control)
	return &resolved, state, nil
}

func (s *LocalMetadataControlService) ResolveAlbum(ctx context.Context, userID string, album *models.LocalAlbum, artist *models.LocalArtist, localArtworkURL string) (*metadataAlbumValues, models.MetadataState, error) {
	if album == nil {
		return &metadataAlbumValues{}, models.MetadataState{}, nil
	}

	metaEnabled := s.config.AppleMusic.MetadataEnhancement
	control, err := s.GetEntityControl(ctx, models.LocalEntityTypeAlbum, album.ID)
	if err != nil {
		return nil, models.MetadataState{}, err
	}

	local := metadataAlbumValues{
		Name:         album.Title,
		ArtworkURL:   localArtworkURL,
		ReleaseDate:  formatDate(album.ReleaseDate),
		ArtistName:   artistName(artist),
		AppleMusicID: album.AppleMusicAlbumID,
	}

	var remote *metadataAlbumValues
	if s.metadataEnhancementAvailable() && strings.TrimSpace(album.AppleMusicAlbumID) != "" {
		remote, _ = s.fetchAlbumMetadata(ctx, album.AppleMusicAlbumID)
	}

	resolved, state := resolveAlbumPresentation(local, remote, metaEnabled, control)
	return &resolved, state, nil
}

func (s *LocalMetadataControlService) GetArtistCorrection(ctx context.Context, userID string, artistID int64, localArtworkURL string, localArtworkWidth, localArtworkHeight int) (*ArtistMetadataCorrection, error) {
	artist, err := s.repo.GetArtistByID(ctx, artistID)
	if err != nil || artist == nil {
		return nil, err
	}

	control, err := s.GetEntityControl(ctx, models.LocalEntityTypeArtist, artistID)
	if err != nil {
		return nil, err
	}
	resolved, state, err := s.ResolveArtist(ctx, userID, artist, localArtworkURL, localArtworkWidth, localArtworkHeight)
	if err != nil {
		return nil, err
	}

	local := metadataArtistValues{
		Name:          artist.Name,
		ArtworkURL:    localArtworkURL,
		ArtworkWidth:  localArtworkWidth,
		ArtworkHeight: localArtworkHeight,
		AppleMusicID:  artist.AppleMusicArtistID,
	}

	currentMatch, _ := s.loadArtistCurrentMatch(ctx, artist.AppleMusicArtistID)
	candidates, _ := s.searchArtistCandidates(ctx, artist.Name)

	return &ArtistMetadataCorrection{
		EntityType:    string(models.LocalEntityTypeArtist),
		EntityID:      artistID,
		OverrideMode:  control.OverrideMode,
		ManualData:    control.ManualData,
		LyricsSource:  control.LyricsSource,
		Local:         local,
		Resolved:      *resolved,
		MetadataState: state,
		CurrentMatch:  currentMatch,
		Candidates:    candidates,
	}, nil
}

func (s *LocalMetadataControlService) GetAlbumCorrection(ctx context.Context, userID string, albumID int64, localArtworkURL string) (*AlbumMetadataCorrection, error) {
	album, err := s.repo.GetAlbumByID(ctx, albumID)
	if err != nil || album == nil {
		return nil, err
	}
	artist, err := s.repo.GetArtistByID(ctx, album.PrimaryArtistID)
	if err != nil {
		return nil, err
	}

	control, err := s.GetEntityControl(ctx, models.LocalEntityTypeAlbum, albumID)
	if err != nil {
		return nil, err
	}
	resolved, state, err := s.ResolveAlbum(ctx, userID, album, artist, localArtworkURL)
	if err != nil {
		return nil, err
	}

	local := metadataAlbumValues{
		Name:         album.Title,
		ArtworkURL:   localArtworkURL,
		ReleaseDate:  formatDate(album.ReleaseDate),
		ArtistName:   artistName(artist),
		AppleMusicID: album.AppleMusicAlbumID,
	}

	currentMatch, _ := s.loadAlbumCurrentMatch(ctx, album.AppleMusicAlbumID)
	candidates, _ := s.searchAlbumCandidates(ctx, album.Title, artistName(artist))

	return &AlbumMetadataCorrection{
		EntityType:    string(models.LocalEntityTypeAlbum),
		EntityID:      albumID,
		OverrideMode:  control.OverrideMode,
		ManualData:    control.ManualData,
		LyricsSource:  control.LyricsSource,
		Local:         local,
		Resolved:      *resolved,
		MetadataState: state,
		CurrentMatch:  currentMatch,
		Candidates:    candidates,
	}, nil
}

func (s *LocalMetadataControlService) UpdateArtistCorrection(ctx context.Context, actorID, userID string, artistID int64, localArtworkURL string, localArtworkWidth, localArtworkHeight int, update *MetadataControlUpdate) (*ArtistMetadataCorrection, error) {
	if update == nil {
		update = &MetadataControlUpdate{}
	}

	artist, err := s.repo.GetArtistByID(ctx, artistID)
	if err != nil || artist == nil {
		return nil, err
	}

	if update.ClearMatch {
		artist.AppleMusicArtistID = ""
	} else if update.AppleMusicID != nil {
		artist.AppleMusicArtistID = strings.TrimSpace(*update.AppleMusicID)
	}
	if _, err := s.repo.SaveArtist(ctx, artist); err != nil {
		return nil, err
	}

	control, err := s.GetEntityControl(ctx, models.LocalEntityTypeArtist, artistID)
	if err != nil {
		return nil, err
	}
	if update.OverrideMode != "" {
		control.OverrideMode = update.OverrideMode
	}
	if update.ManualData != nil {
		control.ManualData = update.ManualData
	}
	if update.LyricsSource != "" {
		control.LyricsSource = update.LyricsSource
	}
	if _, err := s.SaveEntityControl(ctx, actorID, control); err != nil {
		return nil, err
	}

	return s.GetArtistCorrection(ctx, userID, artistID, localArtworkURL, localArtworkWidth, localArtworkHeight)
}

func (s *LocalMetadataControlService) UpdateAlbumCorrection(ctx context.Context, actorID, userID string, albumID int64, localArtworkURL string, update *MetadataControlUpdate) (*AlbumMetadataCorrection, error) {
	if update == nil {
		update = &MetadataControlUpdate{}
	}

	album, err := s.repo.GetAlbumByID(ctx, albumID)
	if err != nil || album == nil {
		return nil, err
	}

	if update.ClearMatch {
		album.AppleMusicAlbumID = ""
	} else if update.AppleMusicID != nil {
		album.AppleMusicAlbumID = strings.TrimSpace(*update.AppleMusicID)
	}
	if _, err := s.repo.SaveAlbum(ctx, album); err != nil {
		return nil, err
	}

	control, err := s.GetEntityControl(ctx, models.LocalEntityTypeAlbum, albumID)
	if err != nil {
		return nil, err
	}
	if update.OverrideMode != "" {
		control.OverrideMode = update.OverrideMode
	}
	if update.ManualData != nil {
		control.ManualData = update.ManualData
	}
	if update.LyricsSource != "" {
		control.LyricsSource = update.LyricsSource
	}
	if _, err := s.SaveEntityControl(ctx, actorID, control); err != nil {
		return nil, err
	}

	return s.GetAlbumCorrection(ctx, userID, albumID, localArtworkURL)
}

func (s *LocalMetadataControlService) loadArtistCurrentMatch(ctx context.Context, appleMusicArtistID string) (*MetadataCandidate, error) {
	if !s.metadataEnhancementAvailable() || strings.TrimSpace(appleMusicArtistID) == "" {
		return nil, nil
	}
	remote, err := s.fetchArtistMetadata(ctx, appleMusicArtistID)
	if err != nil || remote == nil {
		return nil, err
	}
	return &MetadataCandidate{
		ID:         appleMusicArtistID,
		Name:       remote.Name,
		ArtworkURL: remote.ArtworkURL,
		Genres:     append([]string(nil), remote.Genres...),
	}, nil
}

func (s *LocalMetadataControlService) loadAlbumCurrentMatch(ctx context.Context, appleMusicAlbumID string) (*MetadataCandidate, error) {
	if !s.metadataEnhancementAvailable() || strings.TrimSpace(appleMusicAlbumID) == "" {
		return nil, nil
	}
	remote, err := s.fetchAlbumMetadata(ctx, appleMusicAlbumID)
	if err != nil || remote == nil {
		return nil, err
	}
	return &MetadataCandidate{
		ID:          appleMusicAlbumID,
		Name:        remote.Name,
		Subtitle:    remote.ArtistName,
		ArtworkURL:  remote.ArtworkURL,
		ReleaseDate: remote.ReleaseDate,
	}, nil
}

func (s *LocalMetadataControlService) searchArtistCandidates(ctx context.Context, term string) ([]MetadataCandidate, error) {
	if !s.metadataEnhancementAvailable() || strings.TrimSpace(term) == "" {
		return []MetadataCandidate{}, nil
	}
	resp, err := s.remote.Search(s.storefront, term, "artists", s.language, s.token, 8, 0)
	if err != nil || resp.Results.Artists == nil {
		return []MetadataCandidate{}, err
	}
	result := make([]MetadataCandidate, 0, len(resp.Results.Artists.Data))
	for _, item := range resp.Results.Artists.Data {
		result = append(result, MetadataCandidate{
			ID:         item.ID,
			Name:       item.Attributes.Name,
			ArtworkURL: item.Attributes.Artwork.URL,
			Genres:     append([]string(nil), item.Attributes.GenreNames...),
		})
	}
	return result, nil
}

func (s *LocalMetadataControlService) searchAlbumCandidates(ctx context.Context, title, artistName string) ([]MetadataCandidate, error) {
	query := strings.TrimSpace(strings.Join([]string{title, artistName}, " "))
	if !s.metadataEnhancementAvailable() || query == "" {
		return []MetadataCandidate{}, nil
	}
	resp, err := s.remote.Search(s.storefront, query, "albums", s.language, s.token, 8, 0)
	if err != nil || resp.Results.Albums == nil {
		return []MetadataCandidate{}, err
	}
	result := make([]MetadataCandidate, 0, len(resp.Results.Albums.Data))
	for _, item := range resp.Results.Albums.Data {
		result = append(result, MetadataCandidate{
			ID:          item.ID,
			Name:        item.Attributes.Name,
			Subtitle:    item.Attributes.ArtistName,
			ArtworkURL:  item.Attributes.Artwork.URL,
			ReleaseDate: item.Attributes.ReleaseDate,
		})
	}
	return result, nil
}

func (s *LocalMetadataControlService) fetchArtistMetadata(ctx context.Context, appleMusicArtistID string) (*metadataArtistValues, error) {
	if strings.TrimSpace(appleMusicArtistID) == "" {
		return nil, nil
	}
	s.cacheMu.RLock()
	if cached, ok := s.artistMeta[appleMusicArtistID]; ok && time.Now().Before(cached.expiresAt) {
		s.cacheMu.RUnlock()
		copy := cached.values
		return &copy, nil
	}
	s.cacheMu.RUnlock()

	resp, err := s.remote.GetArtist(s.storefront, appleMusicArtistID, s.language, s.token)
	if err != nil || len(resp.Data) == 0 {
		return nil, err
	}
	item := resp.Data[0]
	result := &metadataArtistValues{
		Name:          item.Attributes.Name,
		ArtworkURL:    item.Attributes.Artwork.URL,
		ArtworkWidth:  item.Attributes.Artwork.Width,
		ArtworkHeight: item.Attributes.Artwork.Height,
		Genres:        append([]string(nil), item.Attributes.GenreNames...),
		AppleMusicID:  appleMusicArtistID,
	}
	if asset := item.Attributes.EditorialVideo.MotionArtistWide16x9; asset != nil {
		result.MotionVideoURL = asset.Video
	} else if asset := item.Attributes.EditorialVideo.MotionArtistSquare1x1; asset != nil {
		result.MotionVideoURL = asset.Video
	}
	if item.Attributes.EditorialArtwork.CenteredFullscreenBackground != nil {
		result.LandscapeURL = item.Attributes.EditorialArtwork.CenteredFullscreenBackground.URL
	}

	s.cacheMu.Lock()
	s.artistMeta[appleMusicArtistID] = cachedMetadataArtist{
		values:    *result,
		expiresAt: time.Now().Add(ArtistTTL),
	}
	s.cacheMu.Unlock()
	return result, nil
}

func (s *LocalMetadataControlService) fetchAlbumMetadata(ctx context.Context, appleMusicAlbumID string) (*metadataAlbumValues, error) {
	if strings.TrimSpace(appleMusicAlbumID) == "" {
		return nil, nil
	}
	s.cacheMu.RLock()
	if cached, ok := s.albumMeta[appleMusicAlbumID]; ok && time.Now().Before(cached.expiresAt) {
		s.cacheMu.RUnlock()
		copy := cached.values
		return &copy, nil
	}
	s.cacheMu.RUnlock()

	resp, err := s.remote.GetAlbum(s.storefront, appleMusicAlbumID, s.language, s.token)
	if err != nil || len(resp.Data) == 0 {
		return nil, err
	}
	item := resp.Data[0]
	artistName := item.Attributes.ArtistName
	if len(item.Relationships.Artists.Data) > 0 && strings.TrimSpace(item.Relationships.Artists.Data[0].Attributes.Name) != "" {
		artistName = item.Relationships.Artists.Data[0].Attributes.Name
	}
	result := &metadataAlbumValues{
		Name:         item.Attributes.Name,
		ArtworkURL:   item.Attributes.Artwork.URL,
		ReleaseDate:  item.Attributes.ReleaseDate,
		ArtistName:   artistName,
		AppleMusicID: appleMusicAlbumID,
	}
	s.cacheMu.Lock()
	s.albumMeta[appleMusicAlbumID] = cachedMetadataAlbum{
		values:    *result,
		expiresAt: time.Now().Add(AlbumDetailTTL),
	}
	s.cacheMu.Unlock()
	return result, nil
}

func resolveArtistPresentation(local metadataArtistValues, remote *metadataArtistValues, metaEnabled bool, control *models.LocalEntityMetadataControl) (metadataArtistValues, models.MetadataState) {
	resolved := local
	overrideMode := metadataOverrideMode(control)
	state := models.MetadataState{OverrideMode: overrideMode, DisplaySource: "local"}
	manual := manualArtistValues(control)

	if overrideMode == models.MetadataOverrideModeManualOverride {
		applyArtistManual(&resolved, manual)
		state.UsesManualOverride = true
		state.DisplaySource = "manual_override"
		return resolved, state
	}
	if overrideMode == models.MetadataOverrideModeForceLocal {
		return resolved, state
	}

	if shouldUseRemoteArtistArtwork(metaEnabled, overrideMode) && remote != nil && remote.ArtworkURL != "" {
		resolved.ArtworkURL = remote.ArtworkURL
		resolved.ArtworkWidth = remote.ArtworkWidth
		resolved.ArtworkHeight = remote.ArtworkHeight
		state.UsesAppleMusic = true
		state.DisplaySource = "mixed"
	}
	if shouldUseRemoteArtistProfile(metaEnabled, overrideMode) && remote != nil {
		if remote.Name != "" {
			resolved.Name = remote.Name
		}
		if len(remote.Genres) > 0 {
			resolved.Genres = append([]string(nil), remote.Genres...)
		}
		if remote.MotionVideoURL != "" {
			resolved.MotionVideoURL = remote.MotionVideoURL
		}
		if remote.LandscapeURL != "" {
			resolved.LandscapeURL = remote.LandscapeURL
		}
		if remote.Name != "" || len(remote.Genres) > 0 || remote.MotionVideoURL != "" || remote.LandscapeURL != "" {
			state.UsesAppleMusic = true
			state.DisplaySource = "mixed"
		}
	}

	applyArtistManual(&resolved, manual)
	if hasArtistManualValues(manual) {
		state.UsesManualOverride = true
		state.DisplaySource = "manual_override"
	}
	if state.UsesAppleMusic && !state.UsesManualOverride && overrideMode == models.MetadataOverrideModePreferApple {
		state.DisplaySource = "apple_music"
	}
	return resolved, state
}

func resolveAlbumPresentation(local metadataAlbumValues, remote *metadataAlbumValues, metaEnabled bool, control *models.LocalEntityMetadataControl) (metadataAlbumValues, models.MetadataState) {
	resolved := local
	overrideMode := metadataOverrideMode(control)
	state := models.MetadataState{OverrideMode: overrideMode, DisplaySource: "local"}
	manual := manualAlbumValues(control)

	if overrideMode == models.MetadataOverrideModeManualOverride {
		applyAlbumManual(&resolved, manual)
		state.UsesManualOverride = true
		state.DisplaySource = "manual_override"
		return resolved, state
	}
	if overrideMode == models.MetadataOverrideModeForceLocal {
		return resolved, state
	}

	if shouldUseRemoteAlbumArtwork(metaEnabled, overrideMode) && remote != nil && remote.ArtworkURL != "" {
		resolved.ArtworkURL = remote.ArtworkURL
		state.UsesAppleMusic = true
		state.DisplaySource = "mixed"
	}
	if shouldUseRemoteAlbumMetadata(metaEnabled, overrideMode) && remote != nil {
		if remote.Name != "" {
			resolved.Name = remote.Name
		}
		if remote.ReleaseDate != "" {
			resolved.ReleaseDate = remote.ReleaseDate
		}
		if remote.ArtistName != "" {
			resolved.ArtistName = remote.ArtistName
		}
		if remote.Name != "" || remote.ReleaseDate != "" || remote.ArtistName != "" {
			state.UsesAppleMusic = true
			state.DisplaySource = "mixed"
		}
	}

	applyAlbumManual(&resolved, manual)
	if hasAlbumManualValues(manual) {
		state.UsesManualOverride = true
		state.DisplaySource = "manual_override"
	}
	if state.UsesAppleMusic && !state.UsesManualOverride && overrideMode == models.MetadataOverrideModePreferApple {
		state.DisplaySource = "apple_music"
	}
	return resolved, state
}

func buildFeaturedSongs(librarySongs []models.SongItem, stats []artistSongPlayStat, limit int) ([]models.SongItem, string) {
	if limit <= 0 {
		limit = 5
	}
	if len(librarySongs) == 0 {
		return []models.SongItem{}, "library_fallback"
	}

	index := make(map[string]models.SongItem, len(librarySongs))
	for _, song := range librarySongs {
		index[song.ID] = song
	}

	type featuredEntry struct {
		models.SongItem
		playCount    int
		lastPlayedAt time.Time
	}

	entries := make([]featuredEntry, 0, len(stats))
	for _, stat := range stats {
		song, ok := index[stat.SongID]
		if !ok {
			continue
		}
		entries = append(entries, featuredEntry{
			SongItem:     song,
			playCount:    stat.PlayCount,
			lastPlayedAt: stat.LastPlayedAt,
		})
	}
	if len(entries) == 0 {
		fallback := append([]models.SongItem(nil), librarySongs...)
		if len(fallback) > limit {
			fallback = fallback[:limit]
		}
		return fallback, "library_fallback"
	}

	sort.SliceStable(entries, func(i, j int) bool {
		if entries[i].playCount != entries[j].playCount {
			return entries[i].playCount > entries[j].playCount
		}
		if !entries[i].lastPlayedAt.Equal(entries[j].lastPlayedAt) {
			return entries[i].lastPlayedAt.After(entries[j].lastPlayedAt)
		}
		if availabilityWeight(entries[i].AvailabilityStatus) != availabilityWeight(entries[j].AvailabilityStatus) {
			return availabilityWeight(entries[i].AvailabilityStatus) < availabilityWeight(entries[j].AvailabilityStatus)
		}
		return entries[i].ID < entries[j].ID
	})

	result := make([]models.SongItem, 0, min(limit, len(entries)))
	for _, entry := range entries {
		result = append(result, entry.SongItem)
		if len(result) >= limit {
			break
		}
	}
	return result, "history"
}

func availabilityWeight(status string) int {
	switch status {
	case string(models.AvailabilityStatusAvailable):
		return 0
	case string(models.AvailabilityStatusStale):
		return 1
	default:
		return 2
	}
}

func metadataOverrideMode(control *models.LocalEntityMetadataControl) models.MetadataOverrideMode {
	if control == nil || control.OverrideMode == "" {
		return models.MetadataOverrideModeInherit
	}
	return control.OverrideMode
}

func shouldUseRemoteArtistArtwork(metaEnabled bool, overrideMode models.MetadataOverrideMode) bool {
	if overrideMode == models.MetadataOverrideModePreferApple {
		return true
	}
	return metaEnabled
}

func shouldUseRemoteArtistProfile(metaEnabled bool, overrideMode models.MetadataOverrideMode) bool {
	if overrideMode == models.MetadataOverrideModePreferApple {
		return true
	}
	return metaEnabled
}

func shouldUseRemoteAlbumArtwork(metaEnabled bool, overrideMode models.MetadataOverrideMode) bool {
	if overrideMode == models.MetadataOverrideModePreferApple {
		return true
	}
	return metaEnabled
}

func shouldUseRemoteAlbumMetadata(metaEnabled bool, overrideMode models.MetadataOverrideMode) bool {
	if overrideMode == models.MetadataOverrideModePreferApple {
		return true
	}
	return metaEnabled
}

func manualArtistValues(control *models.LocalEntityMetadataControl) metadataArtistValues {
	if control == nil || control.ManualData == nil {
		return metadataArtistValues{}
	}
	return metadataArtistValues{
		Name:           manualString(control.ManualData, "name"),
		ArtworkURL:     manualString(control.ManualData, "artworkUrl"),
		Genres:         manualStringSlice(control.ManualData, "genres"),
		MotionVideoURL: manualString(control.ManualData, "motionVideoUrl"),
		LandscapeURL:   manualString(control.ManualData, "landscapeUrl"),
	}
}

func manualAlbumValues(control *models.LocalEntityMetadataControl) metadataAlbumValues {
	if control == nil || control.ManualData == nil {
		return metadataAlbumValues{}
	}
	return metadataAlbumValues{
		Name:        manualString(control.ManualData, "name"),
		ArtworkURL:  manualString(control.ManualData, "artworkUrl"),
		ReleaseDate: manualString(control.ManualData, "releaseDate"),
		ArtistName:  manualString(control.ManualData, "artistName"),
	}
}

func applyArtistManual(target *metadataArtistValues, manual metadataArtistValues) {
	if strings.TrimSpace(manual.Name) != "" {
		target.Name = manual.Name
	}
	if strings.TrimSpace(manual.ArtworkURL) != "" {
		target.ArtworkURL = manual.ArtworkURL
	}
	if len(manual.Genres) > 0 {
		target.Genres = append([]string(nil), manual.Genres...)
	}
	if strings.TrimSpace(manual.MotionVideoURL) != "" {
		target.MotionVideoURL = manual.MotionVideoURL
	}
	if strings.TrimSpace(manual.LandscapeURL) != "" {
		target.LandscapeURL = manual.LandscapeURL
	}
}

func applyAlbumManual(target *metadataAlbumValues, manual metadataAlbumValues) {
	if strings.TrimSpace(manual.Name) != "" {
		target.Name = manual.Name
	}
	if strings.TrimSpace(manual.ArtworkURL) != "" {
		target.ArtworkURL = manual.ArtworkURL
	}
	if strings.TrimSpace(manual.ReleaseDate) != "" {
		target.ReleaseDate = manual.ReleaseDate
	}
	if strings.TrimSpace(manual.ArtistName) != "" {
		target.ArtistName = manual.ArtistName
	}
}

func hasArtistManualValues(values metadataArtistValues) bool {
	return strings.TrimSpace(values.Name) != "" ||
		strings.TrimSpace(values.ArtworkURL) != "" ||
		len(values.Genres) > 0 ||
		strings.TrimSpace(values.MotionVideoURL) != "" ||
		strings.TrimSpace(values.LandscapeURL) != ""
}

func hasAlbumManualValues(values metadataAlbumValues) bool {
	return strings.TrimSpace(values.Name) != "" ||
		strings.TrimSpace(values.ArtworkURL) != "" ||
		strings.TrimSpace(values.ReleaseDate) != "" ||
		strings.TrimSpace(values.ArtistName) != ""
}

func manualString(values map[string]any, key string) string {
	if values == nil {
		return ""
	}
	value, ok := values[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func manualStringSlice(values map[string]any, key string) []string {
	if values == nil {
		return nil
	}
	raw, ok := values[key]
	if !ok || raw == nil {
		return nil
	}
	switch typed := raw.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		result := make([]string, 0, len(typed))
		for _, value := range typed {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" {
				result = append(result, text)
			}
		}
		return result
	default:
		return nil
	}
}

func encodeManualData(values map[string]any) []byte {
	if values == nil {
		return []byte(`{}`)
	}
	data, _ := json.Marshal(values)
	if len(data) == 0 {
		return []byte(`{}`)
	}
	return data
}

func parseInt64String(value string) int64 {
	parsed, _ := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	return parsed
}
