package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/lib/pq"
)

type LocalLibraryService struct {
	db                 *Database
	repo               LocalLibraryRepository
	metadataControlSvc *LocalMetadataControlService
}

type metadataFieldCacheKey struct {
	entityType models.LocalEntityType
	entityID   int64
}

type localLibraryPreload struct {
	metadataFields map[metadataFieldCacheKey][]*models.MetadataField
	lyricsMappings map[int64]*models.LyricsMapping
}

type artistMediaRow struct {
	media models.LocalMedia
	album *models.LocalAlbum
}

type localArtistCatalog struct {
	preload             *localLibraryPreload
	librarySongs        []models.SongItem
	albums              []models.AlbumItem
	singlesAndEPs       []models.AlbumItem
	featuredSongs       []models.SongItem
	featuredSongsSource string
}

func NewLocalLibraryService(db *Database, repo LocalLibraryRepository) *LocalLibraryService {
	return &LocalLibraryService{db: db, repo: repo}
}

func (s *LocalLibraryService) SetMetadataControlService(service *LocalMetadataControlService) {
	if s != nil {
		s.metadataControlSvc = service
	}
}

func newLocalLibraryPreload() *localLibraryPreload {
	return &localLibraryPreload{
		metadataFields: make(map[metadataFieldCacheKey][]*models.MetadataField),
		lyricsMappings: make(map[int64]*models.LyricsMapping),
	}
}

func (p *localLibraryPreload) metadataFieldsFor(entityType models.LocalEntityType, entityID int64) ([]*models.MetadataField, bool) {
	if p == nil || entityID == 0 {
		return nil, false
	}
	fields, ok := p.metadataFields[metadataFieldCacheKey{entityType: entityType, entityID: entityID}]
	return fields, ok
}

func (p *localLibraryPreload) lyricsMappingFor(mediaID int64) (*models.LyricsMapping, bool) {
	if p == nil || mediaID == 0 {
		return nil, false
	}
	mapping, ok := p.lyricsMappings[mediaID]
	return mapping, ok
}

func appendUniqueID(target []int64, seen map[int64]struct{}, id int64) []int64 {
	if id == 0 {
		return target
	}
	if _, exists := seen[id]; exists {
		return target
	}
	seen[id] = struct{}{}
	return append(target, id)
}

func (s *LocalLibraryService) Search(ctx context.Context, query, searchType string) (*models.SearchResult, error) {
	result := &models.SearchResult{
		Albums:        []models.AlbumItem{},
		SinglesAndEPs: []models.AlbumItem{},
		Songs:         []models.SongItem{},
		Artists:       []models.ArtistItem{},
	}

	switch normalizeSearchType(searchType) {
	case "song":
		songs, err := s.searchSongs(ctx, query, 25, 0)
		if err != nil {
			return nil, err
		}
		result.Songs = songs
	case "album":
		albums, err := s.searchAlbums(ctx, query, 25, 0)
		if err != nil {
			return nil, err
		}
		result.Albums = albums
	case "artist":
		artists, err := s.searchArtists(ctx, query, 25, 0)
		if err != nil {
			return nil, err
		}
		result.Artists = artists
	default:
		songs, err := s.searchSongs(ctx, query, 25, 0)
		if err != nil {
			return nil, err
		}
		albums, err := s.searchAlbums(ctx, query, 25, 0)
		if err != nil {
			return nil, err
		}
		artists, err := s.searchArtists(ctx, query, 25, 0)
		if err != nil {
			return nil, err
		}
		result.Songs = songs
		result.Albums = albums
		result.Artists = artists
	}

	return result, nil
}

func (s *LocalLibraryService) SearchWithTopResults(ctx context.Context, query string) (*models.SearchResultWithTop, error) {
	result, err := s.Search(ctx, query, "all")
	if err != nil {
		return nil, err
	}

	withTop := &models.SearchResultWithTop{
		TopResults:    []models.TopResultItem{},
		Albums:        result.Albums,
		SinglesAndEPs: result.SinglesAndEPs,
		Songs:         result.Songs,
		Artists:       result.Artists,
		Order:         []string{},
	}

	if len(result.Songs) > 0 {
		withTop.TopResults = append(withTop.TopResults, models.TopResultItem{
			ID:         result.Songs[0].ID,
			Type:       "song",
			Name:       result.Songs[0].Name,
			ArtworkURL: result.Songs[0].ArtworkURL,
			Subtitle:   result.Songs[0].ArtistName,
		})
		withTop.Order = append(withTop.Order, "songs")
	}
	if len(result.Albums) > 0 {
		withTop.TopResults = append(withTop.TopResults, models.TopResultItem{
			ID:         result.Albums[0].ID,
			Type:       "album",
			Name:       result.Albums[0].Name,
			ArtworkURL: result.Albums[0].ArtworkURL,
			Subtitle:   result.Albums[0].ArtistName,
		})
		withTop.Order = append(withTop.Order, "albums")
	}
	if len(result.Artists) > 0 {
		withTop.TopResults = append(withTop.TopResults, models.TopResultItem{
			ID:         result.Artists[0].ID,
			Type:       "artist",
			Name:       result.Artists[0].Name,
			ArtworkURL: result.Artists[0].ArtworkURL,
			Subtitle:   "艺术家",
		})
		withTop.Order = append(withTop.Order, "artists")
	}

	return withTop, nil
}

func (s *LocalLibraryService) GetSuggestions(ctx context.Context, term string) (*models.SuggestionResult, error) {
	result, err := s.SearchWithTopResults(ctx, term)
	if err != nil {
		return nil, err
	}

	return &models.SuggestionResult{
		Terms:    []models.TermSuggestion{},
		Contents: buildLocalSuggestionContents(term, result),
	}, nil
}

func (s *LocalLibraryService) SearchPaginated(ctx context.Context, query, searchType string, limit, offset int) (*models.PaginatedSearchResult, error) {
	searchType = normalizeSearchType(searchType)
	if limit <= 0 {
		limit = 20
	}

	result := &models.PaginatedSearchResult{
		Offset: offset,
		Limit:  limit,
		Total:  -1,
	}

	switch searchType {
	case "song":
		items, total, err := s.searchSongsWithTotal(ctx, query, limit, offset)
		if err != nil {
			return nil, err
		}
		result.Items = items
		result.Total = total
		result.HasMore = offset+len(items) < total
	case "album":
		items, total, err := s.searchAlbumsWithTotal(ctx, query, limit, offset)
		if err != nil {
			return nil, err
		}
		result.Items = items
		result.Total = total
		result.HasMore = offset+len(items) < total
	case "artist":
		items, total, err := s.searchArtistsWithTotal(ctx, query, limit, offset)
		if err != nil {
			return nil, err
		}
		result.Items = items
		result.Total = total
		result.HasMore = offset+len(items) < total
	default:
		items, total, err := s.searchSongsWithTotal(ctx, query, limit, offset)
		if err != nil {
			return nil, err
		}
		result.Items = items
		result.Total = total
		result.HasMore = offset+len(items) < total
	}
	return result, nil
}

func (s *LocalLibraryService) preloadMetadataFields(ctx context.Context, preload *localLibraryPreload, entityType models.LocalEntityType, ids []int64) error {
	if preload == nil || s.db == nil || len(ids) == 0 {
		return nil
	}

	pending := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		key := metadataFieldCacheKey{entityType: entityType, entityID: id}
		if _, ok := preload.metadataFields[key]; ok {
			continue
		}
		preload.metadataFields[key] = []*models.MetadataField{}
		pending = append(pending, id)
	}
	if len(pending) == 0 {
		return nil
	}

	query := fmt.Sprintf(`
		SELECT %s
		FROM local_metadata_fields
		WHERE entity_type = $1 AND entity_id = ANY($2)
		ORDER BY entity_id ASC, field_name ASC
	`, models.MetadataFieldColumns())
	rows, err := s.db.QueryContext(ctx, query, entityType, pq.Array(pending))
	if err != nil {
		return fmt.Errorf("preload metadata fields for %s: %w", entityType, err)
	}
	defer rows.Close()

	for rows.Next() {
		field, err := models.ScanMetadataField(rows)
		if err != nil {
			return fmt.Errorf("scan preloaded metadata field: %w", err)
		}
		key := metadataFieldCacheKey{entityType: field.EntityType, entityID: field.EntityID}
		preload.metadataFields[key] = append(preload.metadataFields[key], field)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate preloaded metadata fields: %w", err)
	}
	return nil
}

func (s *LocalLibraryService) preloadLyricsMappings(ctx context.Context, preload *localLibraryPreload, mediaIDs []int64) error {
	if preload == nil || s.db == nil || len(mediaIDs) == 0 {
		return nil
	}

	pending := make([]int64, 0, len(mediaIDs))
	for _, mediaID := range mediaIDs {
		if mediaID == 0 {
			continue
		}
		if _, ok := preload.lyricsMappings[mediaID]; ok {
			continue
		}
		preload.lyricsMappings[mediaID] = nil
		pending = append(pending, mediaID)
	}
	if len(pending) == 0 {
		return nil
	}

	query := fmt.Sprintf(`
		SELECT %s
		FROM local_lyrics_mappings
		WHERE media_id = ANY($1)
	`, models.LyricsMappingColumns())
	rows, err := s.db.QueryContext(ctx, query, pq.Array(pending))
	if err != nil {
		return fmt.Errorf("preload lyrics mappings: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		mapping, err := models.ScanLyricsMapping(rows)
		if err != nil {
			return fmt.Errorf("scan preloaded lyrics mapping: %w", err)
		}
		preload.lyricsMappings[mapping.MediaID] = mapping
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate preloaded lyrics mappings: %w", err)
	}
	return nil
}

func (s *LocalLibraryService) GetSongDetail(ctx context.Context, mediaID string) (*models.SongDetail, error) {
	media, album, artist, err := s.loadSongEntities(ctx, mediaID)
	if err != nil || media == nil {
		return nil, err
	}

	item, err := s.buildSongItem(ctx, media, album, artist)
	if err != nil {
		return nil, err
	}

	detail := &models.SongDetail{
		SongItem: *item,
		Credits: models.SongCredits{
			Composer: media.Composer,
		},
	}
	if file, err := s.repo.GetPrimaryMediaFileByMediaID(ctx, media.ID); err != nil {
		return nil, err
	} else {
		detail.AudioInfo = buildLocalAudioInfo(ctx, file)
	}

	if album != nil {
		detail.Album = &models.AlbumInfo{
			ID:           strconv.FormatInt(album.ID, 10),
			Name:         album.Title,
			ArtworkURL:   artworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL),
			ReleaseDate:  formatDate(album.ReleaseDate),
			TrackCount:   album.TotalTracks,
			FieldSources: s.albumFieldSources(ctx, album),
		}
		detail.AlbumID = detail.Album.ID
	}
	if artist != nil {
		detail.Artists = []models.ArtistRef{{
			ID:           strconv.FormatInt(artist.ID, 10),
			Name:         artist.Name,
			ArtworkURL:   artworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL),
			FieldSources: s.artistFieldSources(ctx, artist),
		}}
	}

	return detail, nil
}

func buildLocalAudioInfo(ctx context.Context, file *models.LocalMediaFile) *models.AudioInfo {
	if file == nil {
		return nil
	}

	codec := normalizeAudioCodec(codecHintForFile(file))
	bitrate := file.Bitrate
	bitDepth := inferBitDepthFromCodec(codec)
	sampleRate := file.SampleRate
	channels := file.Channels
	needsSourceProbe := localAudioInfoNeedsProbe(
		file,
		codec,
		bitrate,
		bitDepth,
		sampleRate,
		channels,
	)
	needsLosslessDetailProbe := localAudioInfoNeedsLosslessDetailProbe(
		codec,
		bitrate,
		bitDepth,
		sampleRate,
		channels,
	)

	if needsSourceProbe || needsLosslessDetailProbe {
		if probed, err := probeLocalAudioStreamInfo(ctx, file.AbsolutePath); err == nil {
			if strings.TrimSpace(probed.Codec) != "" {
				codec = normalizeAudioCodec(probed.Codec)
			}
			if bitrate <= 0 && probed.Bitrate > 0 {
				bitrate = probed.Bitrate
			}
			if bitDepth <= 0 && probed.BitDepth > 0 {
				bitDepth = probed.BitDepth
			}
			if sampleRate <= 0 && probed.SampleRate > 0 {
				sampleRate = probed.SampleRate
			}
			if channels <= 0 && probed.Channels > 0 {
				channels = probed.Channels
			}
		} else if needsSourceProbe && localAudioContainerIsAmbiguous(file) {
			codec = ""
		}
	}
	if bitDepth <= 0 {
		bitDepth = inferBitDepthFromCodec(codec)
	}

	info := &models.AudioInfo{
		Codec:      codec,
		Container:  strings.ToLower(strings.TrimSpace(file.Container)),
		MIMEType:   strings.TrimSpace(file.MIMEType),
		Bitrate:    bitrate,
		BitDepth:   bitDepth,
		SampleRate: sampleRate,
		Channels:   channels,
	}

	if info.Codec == "" && info.Container == "" && info.MIMEType == "" && info.Bitrate == 0 && info.BitDepth == 0 && info.SampleRate == 0 && info.Channels == 0 {
		return nil
	}
	return info
}

type localAudioProbeResult struct {
	Codec      string
	Bitrate    int
	BitDepth   int
	SampleRate int
	Channels   int
}

func probeLocalAudioCodec(ctx context.Context, absolutePath string) (string, error) {
	probed, err := probeLocalAudioStreamInfo(ctx, absolutePath)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(probed.Codec), nil
}

func probeLocalAudioStreamInfo(ctx context.Context, absolutePath string) (*localAudioProbeResult, error) {
	if strings.TrimSpace(absolutePath) == "" {
		return &localAudioProbeResult{}, nil
	}

	cmd := exec.CommandContext(
		ctx,
		"ffprobe",
		"-v", "error",
		"-select_streams", "a:0",
		"-show_entries", "stream=codec_name,bit_rate,bits_per_sample,bits_per_raw_sample,sample_rate,channels",
		"-of", "json",
		absolutePath,
	)

	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	return parseLocalAudioProbeOutput(output)
}

func parseProbeInt(value string) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 0
	}
	return parsed
}

type probeIntValue int

func (v *probeIntValue) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "" || trimmed == "null" {
		*v = 0
		return nil
	}

	var intValue int
	if err := json.Unmarshal(data, &intValue); err == nil {
		*v = probeIntValue(intValue)
		return nil
	}

	var stringValue string
	if err := json.Unmarshal(data, &stringValue); err == nil {
		*v = probeIntValue(parseProbeInt(stringValue))
		return nil
	}

	return fmt.Errorf("invalid probe integer value %q", trimmed)
}

func parseLocalAudioProbeOutput(output []byte) (*localAudioProbeResult, error) {
	var payload struct {
		Streams []struct {
			CodecName     string        `json:"codec_name"`
			BitRate       probeIntValue `json:"bit_rate"`
			BitsPerSample probeIntValue `json:"bits_per_sample"`
			BitsPerRaw    probeIntValue `json:"bits_per_raw_sample"`
			SampleRate    probeIntValue `json:"sample_rate"`
			Channels      int           `json:"channels"`
		} `json:"streams"`
	}
	if err := json.Unmarshal(output, &payload); err != nil {
		return nil, err
	}
	if len(payload.Streams) == 0 {
		return &localAudioProbeResult{}, nil
	}

	stream := payload.Streams[0]
	bitDepth := int(stream.BitsPerSample)
	if bitDepth <= 0 {
		bitDepth = int(stream.BitsPerRaw)
	}
	if bitDepth <= 0 {
		bitDepth = inferBitDepthFromCodec(stream.CodecName)
	}

	return &localAudioProbeResult{
		Codec:      strings.TrimSpace(stream.CodecName),
		Bitrate:    int(stream.BitRate),
		BitDepth:   bitDepth,
		SampleRate: int(stream.SampleRate),
		Channels:   stream.Channels,
	}, nil
}

func inferBitDepthFromCodec(codec string) int {
	normalized := strings.ToLower(strings.TrimSpace(codec))
	switch {
	case strings.Contains(normalized, "s16"), strings.Contains(normalized, "u16"):
		return 16
	case strings.Contains(normalized, "s24"), strings.Contains(normalized, "u24"):
		return 24
	case strings.Contains(normalized, "s32"), strings.Contains(normalized, "u32"), strings.Contains(normalized, "f32"):
		return 32
	case strings.Contains(normalized, "s64"), strings.Contains(normalized, "u64"), strings.Contains(normalized, "f64"):
		return 64
	default:
		return 0
	}
}

func (s *LocalLibraryService) GetAlbumDetail(ctx context.Context, userID, albumID string) (*models.AlbumDetail, error) {
	parsedID, err := strconv.ParseInt(albumID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid local album id %q", albumID)
	}

	album, err := s.repo.GetAlbumByID(ctx, parsedID)
	if err != nil || album == nil {
		return nil, err
	}
	artist, err := s.repo.GetArtistByID(ctx, album.PrimaryArtistID)
	if err != nil {
		return nil, err
	}
	tracks, err := s.repo.FindMediaByAlbumID(ctx, album.ID)
	if err != nil {
		return nil, err
	}

	preload := newLocalLibraryPreload()
	mediaIDs := make([]int64, 0, len(tracks))
	seenMediaIDs := make(map[int64]struct{}, len(tracks))
	for _, track := range tracks {
		mediaIDs = appendUniqueID(mediaIDs, seenMediaIDs, track.ID)
	}
	if err := s.preloadMetadataFields(ctx, preload, models.LocalEntityTypeMedia, mediaIDs); err != nil {
		return nil, err
	}
	if err := s.preloadMetadataFields(ctx, preload, models.LocalEntityTypeAlbum, []int64{album.ID}); err != nil {
		return nil, err
	}
	if err := s.preloadMetadataFields(ctx, preload, models.LocalEntityTypeArtist, []int64{album.PrimaryArtistID}); err != nil {
		return nil, err
	}
	if err := s.preloadLyricsMappings(ctx, preload, mediaIDs); err != nil {
		return nil, err
	}

	items := make([]models.SongItem, 0, len(tracks))
	for _, track := range tracks {
		item, err := s.buildSongItemWithPreload(ctx, track, album, artist, preload)
		if err != nil {
			return nil, err
		}
		items = append(items, *item)
	}

	releaseDate := album.ReleaseDate
	if releaseDate == nil {
		releaseDate = inferAlbumReleaseDateFromTracks(tracks)
	}

	detail := &models.AlbumDetail{
		AlbumItem: models.AlbumItem{
			ID:                 strconv.FormatInt(album.ID, 10),
			Name:               album.Title,
			ArtistID:           strconv.FormatInt(album.PrimaryArtistID, 10),
			ArtistName:         artistName(artist),
			ArtworkURL:         artworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL),
			ReleaseDate:        formatDate(releaseDate),
			TrackCount:         max(album.TotalTracks, len(items)),
			Tracks:             items,
			AvailabilityStatus: string(album.AvailabilityStatus),
			FieldSources:       s.albumFieldSourcesWithPreload(ctx, album, preload),
		},
	}
	applyAlbumReleaseType(&detail.AlbumItem, s.albumReleaseTypeWithPreload(ctx, album.ID, preload))
	if motionArtworkPath, err := s.ResolveMotionArtwork(ctx, albumID); err != nil {
		return nil, err
	} else if motionArtworkPath != "" {
		detail.MotionVideoURL = fmt.Sprintf("/api/artwork/album/%s/motion", albumID)
	}
	if artist != nil {
		detail.Artists = []models.ArtistRef{{
			ID:           strconv.FormatInt(artist.ID, 10),
			Name:         artist.Name,
			ArtworkURL:   artworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL),
			FieldSources: s.artistFieldSourcesWithPreload(ctx, artist, preload),
		}}
	}

	if s.metadataControlSvc != nil {
		localArtworkURL := s.localArtworkURLForAlbum(ctx, album)
		resolved, state, err := s.metadataControlSvc.ResolveAlbum(ctx, userID, album, artist, localArtworkURL)
		if err == nil && resolved != nil {
			detail.Name = resolved.Name
			detail.ArtworkURL = resolved.ArtworkURL
			detail.ReleaseDate = resolved.ReleaseDate
			detail.ArtistName = resolved.ArtistName
			detail.MetadataState = &state
		}
	}
	displayArtistName := detail.ArtistName
	if strings.TrimSpace(displayArtistName) == "" {
		displayArtistName = artistName(artist)
	}
	localRelatedContent, err := s.buildLocalAlbumRelatedContent(ctx, userID, album, artist, displayArtistName)
	if err != nil {
		return nil, err
	}
	detail.LocalRelatedContent = localRelatedContent
	return detail, nil
}

func (s *LocalLibraryService) GetArtistDetail(ctx context.Context, userID string, artistID string) (*models.ArtistDetail, error) {
	parsedID, err := strconv.ParseInt(artistID, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid local artist id %q", artistID)
	}

	artist, err := s.repo.GetArtistByID(ctx, parsedID)
	if err != nil || artist == nil {
		return nil, err
	}
	catalog, err := s.buildLocalArtistCatalog(ctx, userID, artist)
	if err != nil {
		return nil, err
	}

	localArtworkURL := s.localArtworkURLForArtist(ctx, artist)
	resolvedArtist := &metadataArtistValues{
		Name:       artist.Name,
		ArtworkURL: localArtworkURL,
	}
	metadataState := models.MetadataState{OverrideMode: models.MetadataOverrideModeInherit, DisplaySource: "local"}
	if s.metadataControlSvc != nil {
		if resolved, state, err := s.metadataControlSvc.ResolveArtist(ctx, userID, artist, localArtworkURL, 0, 0); err == nil && resolved != nil {
			resolvedArtist = resolved
			metadataState = state
		}
	}

	essentialAlbums := append([]models.AlbumItem(nil), catalog.albums...)
	if len(essentialAlbums) > 6 {
		essentialAlbums = essentialAlbums[:6]
	}

	return &models.ArtistDetail{
		ArtistItem: models.ArtistItem{
			ID:                 strconv.FormatInt(artist.ID, 10),
			Name:               resolvedArtist.Name,
			ArtworkURL:         resolvedArtist.ArtworkURL,
			ArtworkWidth:       resolvedArtist.ArtworkWidth,
			ArtworkHeight:      resolvedArtist.ArtworkHeight,
			Genres:             append([]string(nil), resolvedArtist.Genres...),
			MotionVideoURL:     resolvedArtist.MotionVideoURL,
			LandscapeURL:       resolvedArtist.LandscapeURL,
			AvailabilityStatus: string(artist.AvailabilityStatus),
			FieldSources:       s.artistFieldSourcesWithPreload(ctx, artist, catalog.preload),
		},
		TopSongs:            catalog.featuredSongs,
		FeaturedSongs:       catalog.featuredSongs,
		FeaturedSongsSource: catalog.featuredSongsSource,
		LibrarySongs:        catalog.librarySongs,
		Albums:              catalog.albums,
		SinglesAndEPs:       catalog.singlesAndEPs,
		EssentialAlbums:     essentialAlbums,
		MetadataState:       &metadataState,
	}, nil
}

func (s *LocalLibraryService) buildLocalArtistCatalog(ctx context.Context, userID string, artist *models.LocalArtist) (*localArtistCatalog, error) {
	catalog := &localArtistCatalog{
		preload:             newLocalLibraryPreload(),
		librarySongs:        []models.SongItem{},
		albums:              []models.AlbumItem{},
		singlesAndEPs:       []models.AlbumItem{},
		featuredSongs:       []models.SongItem{},
		featuredSongsSource: "library_fallback",
	}
	if artist == nil {
		return catalog, nil
	}

	mediaItems, err := s.repo.FindMediaByPrimaryArtistID(ctx, artist.ID)
	if err != nil {
		return nil, fmt.Errorf("list artist media: %w", err)
	}

	albumLookup := make(map[int64]*models.LocalAlbum)
	mediaIDs := make([]int64, 0, len(mediaItems))
	albumIDs := make([]int64, 0)
	seenMediaIDs := make(map[int64]struct{}, len(mediaItems))
	seenAlbumIDs := make(map[int64]struct{})
	for _, media := range mediaItems {
		mediaIDs = appendUniqueID(mediaIDs, seenMediaIDs, media.ID)
		if media.AlbumID == 0 {
			continue
		}
		if _, exists := albumLookup[media.AlbumID]; !exists {
			album, err := s.repo.GetAlbumByID(ctx, media.AlbumID)
			if err != nil {
				return nil, fmt.Errorf("load artist album %d: %w", media.AlbumID, err)
			}
			if album != nil {
				albumLookup[media.AlbumID] = album
			}
		}
		albumIDs = appendUniqueID(albumIDs, seenAlbumIDs, media.AlbumID)
	}

	sort.SliceStable(mediaItems, func(i, j int) bool {
		if availabilityWeight(string(mediaItems[i].AvailabilityStatus)) != availabilityWeight(string(mediaItems[j].AvailabilityStatus)) {
			return availabilityWeight(string(mediaItems[i].AvailabilityStatus)) < availabilityWeight(string(mediaItems[j].AvailabilityStatus))
		}
		titleI := albumTitle(albumLookup[mediaItems[i].AlbumID])
		titleJ := albumTitle(albumLookup[mediaItems[j].AlbumID])
		if titleI != titleJ {
			return titleI < titleJ
		}
		if mediaItems[i].DiscNumber != mediaItems[j].DiscNumber {
			return mediaItems[i].DiscNumber < mediaItems[j].DiscNumber
		}
		if mediaItems[i].TrackNumber != mediaItems[j].TrackNumber {
			return mediaItems[i].TrackNumber < mediaItems[j].TrackNumber
		}
		return mediaItems[i].ID < mediaItems[j].ID
	})

	if err := s.preloadMetadataFields(ctx, catalog.preload, models.LocalEntityTypeMedia, mediaIDs); err != nil {
		return nil, err
	}
	if err := s.preloadMetadataFields(ctx, catalog.preload, models.LocalEntityTypeAlbum, albumIDs); err != nil {
		return nil, err
	}
	if err := s.preloadMetadataFields(ctx, catalog.preload, models.LocalEntityTypeArtist, []int64{artist.ID}); err != nil {
		return nil, err
	}
	if err := s.preloadLyricsMappings(ctx, catalog.preload, mediaIDs); err != nil {
		return nil, err
	}

	albumIndex := map[int64]models.AlbumItem{}
	for _, media := range mediaItems {
		album := albumLookup[media.AlbumID]
		item, err := s.buildSongItemWithPreload(ctx, media, album, artist, catalog.preload)
		if err != nil {
			return nil, err
		}
		catalog.librarySongs = append(catalog.librarySongs, *item)
		if album == nil || album.ID == 0 {
			continue
		}

		candidateRelease := album.ReleaseDate
		if candidateRelease == nil && media.ReleaseDate != nil {
			candidateRelease = media.ReleaseDate
		}

		if _, exists := albumIndex[album.ID]; !exists {
			albumItem := models.AlbumItem{
				ID:                 strconv.FormatInt(album.ID, 10),
				Name:               album.Title,
				ArtistID:           strconv.FormatInt(artist.ID, 10),
				ArtistName:         artistName(artist),
				ArtworkURL:         s.localArtworkURLForAlbum(ctx, album),
				ReleaseDate:        formatDate(candidateRelease),
				TrackCount:         album.TotalTracks,
				AvailabilityStatus: string(album.AvailabilityStatus),
				FieldSources:       s.albumFieldSourcesWithPreload(ctx, album, catalog.preload),
			}
			applyAlbumReleaseType(&albumItem, s.albumReleaseTypeWithPreload(ctx, album.ID, catalog.preload))
			if s.metadataControlSvc != nil {
				if resolvedAlbum, _, err := s.metadataControlSvc.ResolveAlbum(ctx, userID, album, artist, albumItem.ArtworkURL); err == nil && resolvedAlbum != nil {
					albumItem.Name = resolvedAlbum.Name
					albumItem.ArtworkURL = resolvedAlbum.ArtworkURL
					albumItem.ReleaseDate = resolvedAlbum.ReleaseDate
					albumItem.ArtistName = resolvedAlbum.ArtistName
				}
			}
			albumIndex[album.ID] = albumItem
			continue
		}

		candidateReleaseDate := formatDate(candidateRelease)
		existing := albumIndex[album.ID]
		if existing.ReleaseDate == "" || (candidateReleaseDate != "" && candidateReleaseDate < existing.ReleaseDate) {
			existing.ReleaseDate = candidateReleaseDate
			albumIndex[album.ID] = existing
		}
	}

	for _, item := range albumIndex {
		if item.ReleaseType == models.ReleaseTypeAlbum {
			catalog.albums = append(catalog.albums, item)
			continue
		}
		catalog.singlesAndEPs = append(catalog.singlesAndEPs, item)
	}
	sortAlbumItemsByReleaseDate(catalog.albums)
	sortAlbumItemsByReleaseDate(catalog.singlesAndEPs)

	playStats, err := s.loadArtistPlayStats(ctx, userID, artist.ID)
	if err != nil {
		return nil, err
	}
	catalog.featuredSongs, catalog.featuredSongsSource = buildFeaturedSongs(catalog.librarySongs, playStats, 5)
	return catalog, nil
}

func (s *LocalLibraryService) buildLocalAlbumRelatedContent(ctx context.Context, userID string, album *models.LocalAlbum, artist *models.LocalArtist, artistDisplayName string) (*models.LocalAlbumRelatedContent, error) {
	content := &models.LocalAlbumRelatedContent{Shelves: []models.LocalAlbumRelatedShelf{}}
	if album == nil || artist == nil {
		return content, nil
	}

	catalog, err := s.buildLocalArtistCatalog(ctx, userID, artist)
	if err != nil {
		return nil, err
	}
	content.Shelves = buildLocalAlbumRelatedShelves(strconv.FormatInt(album.ID, 10), artistDisplayName, catalog)
	return content, nil
}

func buildLocalAlbumRelatedShelves(currentAlbumID, artistName string, catalog *localArtistCatalog) []models.LocalAlbumRelatedShelf {
	if catalog == nil {
		return []models.LocalAlbumRelatedShelf{}
	}

	sameArtistReleases := append([]models.AlbumItem(nil), catalog.albums...)
	sameArtistReleases = append(sameArtistReleases, catalog.singlesAndEPs...)
	sortAlbumItemsByReleaseDate(sameArtistReleases)

	filteredReleases := make([]models.AlbumItem, 0, len(sameArtistReleases))
	seenReleaseIDs := make(map[string]struct{}, len(sameArtistReleases))
	for _, item := range sameArtistReleases {
		if item.ID == "" || item.ID == currentAlbumID {
			continue
		}
		if _, exists := seenReleaseIDs[item.ID]; exists {
			continue
		}
		seenReleaseIDs[item.ID] = struct{}{}
		filteredReleases = append(filteredReleases, item)
	}

	shelves := make([]models.LocalAlbumRelatedShelf, 0, 2)
	if len(filteredReleases) > 0 {
		shelves = append(shelves, models.LocalAlbumRelatedShelf{
			ID:     models.LocalAlbumRelatedShelfMoreByArtist,
			Kind:   models.LocalAlbumRelatedShelfAlbumsKind,
			Title:  fmt.Sprintf("更多%s的作品", strings.TrimSpace(artistName)),
			Albums: filteredReleases,
		})
	}

	if len(catalog.featuredSongs) > 0 {
		title := "先听这几首"
		if catalog.featuredSongsSource == "history" {
			title = "你常听的歌曲"
		}
		shelves = append(shelves, models.LocalAlbumRelatedShelf{
			ID:    models.LocalAlbumRelatedShelfArtistSongs,
			Kind:  models.LocalAlbumRelatedShelfSongsKind,
			Title: title,
			Songs: append([]models.SongItem(nil), catalog.featuredSongs...),
		})
	}

	return shelves
}

func (s *LocalLibraryService) ResolveArtwork(entityType, id string) (string, string, error) {
	parsedID, err := strconv.ParseInt(id, 10, 64)
	if err != nil {
		return "", "", fmt.Errorf("invalid artwork id %q", id)
	}

	switch entityType {
	case "album":
		album, err := s.repo.GetAlbumByID(context.Background(), parsedID)
		if err != nil || album == nil {
			return "", "", err
		}
		return album.ArtworkPath, album.ArtworkURL, nil
	case "artist":
		artist, err := s.repo.GetArtistByID(context.Background(), parsedID)
		if err != nil || artist == nil {
			return "", "", err
		}
		return artist.ArtworkPath, artist.ArtworkURL, nil
	default:
		return "", "", fmt.Errorf("unsupported artwork entity type %q", entityType)
	}
}

func (s *LocalLibraryService) ResolveMotionArtwork(ctx context.Context, albumID string) (string, error) {
	parsedID, err := strconv.ParseInt(albumID, 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid motion artwork id %q", albumID)
	}
	if s.repo == nil {
		return "", nil
	}

	fields, err := s.repo.ListMetadataFields(ctx, models.LocalEntityTypeAlbum, parsedID)
	if err != nil {
		return "", err
	}
	for _, field := range fields {
		if field.FieldName != "motion_artwork" {
			continue
		}
		if path, ok := metadataStringDetail(field, "value"); ok {
			return path, nil
		}
		if path, ok := metadataStringDetail(field, "path"); ok {
			return path, nil
		}
	}
	return "", nil
}

func (s *LocalLibraryService) loadSongEntities(ctx context.Context, mediaID string) (*models.LocalMedia, *models.LocalAlbum, *models.LocalArtist, error) {
	parsedID, err := strconv.ParseInt(mediaID, 10, 64)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("invalid local media id %q", mediaID)
	}

	media, err := s.repo.GetMediaByID(ctx, parsedID)
	if err != nil || media == nil {
		return nil, nil, nil, err
	}
	album, err := s.repo.GetAlbumByID(ctx, media.AlbumID)
	if err != nil {
		return nil, nil, nil, err
	}
	artist, err := s.repo.GetArtistByID(ctx, media.PrimaryArtistID)
	if err != nil {
		return nil, nil, nil, err
	}
	return media, album, artist, nil
}

func (s *LocalLibraryService) loadArtistPlayStats(ctx context.Context, userID string, artistID int64) ([]artistSongPlayStat, error) {
	if strings.TrimSpace(userID) == "" || s.db == nil {
		return []artistSongPlayStat{}, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT song_id, COUNT(*) AS play_count, MAX(played_at) AS last_played_at
		FROM play_history
		WHERE user_id = $1 AND artist_id = $2
		GROUP BY song_id
	`, userID, strconv.FormatInt(artistID, 10))
	if err != nil {
		return nil, fmt.Errorf("list artist play stats: %w", err)
	}
	defer rows.Close()

	stats := []artistSongPlayStat{}
	for rows.Next() {
		var stat artistSongPlayStat
		if err := rows.Scan(&stat.SongID, &stat.PlayCount, &stat.LastPlayedAt); err != nil {
			return nil, fmt.Errorf("scan artist play stat: %w", err)
		}
		stats = append(stats, stat)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate artist play stats: %w", err)
	}
	return stats, nil
}

func (s *LocalLibraryService) searchSongs(ctx context.Context, query string, limit, offset int) ([]models.SongItem, error) {
	items, _, err := s.searchSongsWithTotal(ctx, query, limit, offset)
	return items, err
}

func (s *LocalLibraryService) searchSongsWithTotal(ctx context.Context, query string, limit, offset int) ([]models.SongItem, int, error) {
	total, err := s.countRows(ctx, `
		SELECT COUNT(*)
		FROM local_media m
		LEFT JOIN local_artists ar ON ar.id = m.primary_artist_id
		LEFT JOIN local_albums al ON al.id = m.album_id
		WHERE m.normalized_title ILIKE $1 OR ar.normalized_name ILIKE $1 OR al.normalized_title ILIKE $1
	`, likeQuery(query))
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT m.id, m.title, m.duration_ms, m.track_number, m.disc_number, m.release_date, m.lyrics_available, m.content_rating,
		       m.availability_status, ar.id, ar.name, ar.artwork_path, ar.artwork_url,
		       al.id, al.title, al.artwork_path, al.artwork_url
		FROM local_media m
		LEFT JOIN local_artists ar ON ar.id = m.primary_artist_id
		LEFT JOIN local_albums al ON al.id = m.album_id
		WHERE m.normalized_title ILIKE $1 OR ar.normalized_name ILIKE $1 OR al.normalized_title ILIKE $1
		ORDER BY CASE WHEN m.availability_status = 'available' THEN 0 ELSE 1 END, m.title ASC, m.id ASC
		LIMIT $2 OFFSET $3
	`, likeQuery(query), limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("search local songs: %w", err)
	}
	defer rows.Close()

	items := []models.SongItem{}
	for rows.Next() {
		var media models.LocalMedia
		var artist models.LocalArtist
		var album models.LocalAlbum
		var mediaRelease sql.NullTime
		var contentRating sql.NullString
		var artistID, albumID sql.NullInt64
		var artistName, artistArtworkPath, artistArtworkURL sql.NullString
		var albumTitle, albumArtworkPath, albumArtworkURL sql.NullString
		if err := rows.Scan(
			&media.ID,
			&media.Title,
			&media.DurationMs,
			&media.TrackNumber,
			&media.DiscNumber,
			&mediaRelease,
			&media.LyricsAvailable,
			&contentRating,
			&media.AvailabilityStatus,
			&artistID,
			&artistName,
			&artistArtworkPath,
			&artistArtworkURL,
			&albumID,
			&albumTitle,
			&albumArtworkPath,
			&albumArtworkURL,
		); err != nil {
			return nil, 0, fmt.Errorf("scan local song row: %w", err)
		}
		if mediaRelease.Valid {
			value := mediaRelease.Time
			media.ReleaseDate = &value
		}
		if contentRating.Valid {
			media.ContentRating = contentRating.String
		}
		if artistID.Valid {
			artist.ID = artistID.Int64
		}
		if artistName.Valid {
			artist.Name = artistName.String
		}
		if artistArtworkPath.Valid {
			artist.ArtworkPath = artistArtworkPath.String
		}
		if artistArtworkURL.Valid {
			artist.ArtworkURL = artistArtworkURL.String
		}
		if albumID.Valid {
			album.ID = albumID.Int64
		}
		if albumTitle.Valid {
			album.Title = albumTitle.String
		}
		if albumArtworkPath.Valid {
			album.ArtworkPath = albumArtworkPath.String
		}
		if albumArtworkURL.Valid {
			album.ArtworkURL = albumArtworkURL.String
		}

		item, err := s.buildSongItem(ctx, &media, &album, &artist)
		if err != nil {
			return nil, 0, err
		}
		items = append(items, *item)
	}
	return items, total, nil
}

func (s *LocalLibraryService) searchAlbums(ctx context.Context, query string, limit, offset int) ([]models.AlbumItem, error) {
	items, _, err := s.searchAlbumsWithTotal(ctx, query, limit, offset)
	return items, err
}

func (s *LocalLibraryService) searchAlbumsWithTotal(ctx context.Context, query string, limit, offset int) ([]models.AlbumItem, int, error) {
	total, err := s.countRows(ctx, `
		SELECT COUNT(*)
		FROM local_albums al
		LEFT JOIN local_artists ar ON ar.id = al.primary_artist_id
		WHERE al.normalized_title ILIKE $1 OR ar.normalized_name ILIKE $1
	`, likeQuery(query))
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT al.id, al.title, al.release_date, al.total_tracks, al.artwork_path, al.artwork_url, al.availability_status,
		       ar.id, ar.name
		FROM local_albums al
		LEFT JOIN local_artists ar ON ar.id = al.primary_artist_id
		WHERE al.normalized_title ILIKE $1 OR ar.normalized_name ILIKE $1
		ORDER BY CASE WHEN al.availability_status = 'available' THEN 0 ELSE 1 END, al.title ASC, al.id ASC
		LIMIT $2 OFFSET $3
	`, likeQuery(query), limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("search local albums: %w", err)
	}
	defer rows.Close()

	items := []models.AlbumItem{}
	for rows.Next() {
		var album models.LocalAlbum
		var artistID sql.NullInt64
		var artistName, artworkPath, artworkURL sql.NullString
		var releaseDate sql.NullTime
		if err := rows.Scan(
			&album.ID,
			&album.Title,
			&releaseDate,
			&album.TotalTracks,
			&artworkPath,
			&artworkURL,
			&album.AvailabilityStatus,
			&artistID,
			&artistName,
		); err != nil {
			return nil, 0, fmt.Errorf("scan local album row: %w", err)
		}
		if releaseDate.Valid {
			value := releaseDate.Time
			album.ReleaseDate = &value
		}
		if artworkPath.Valid {
			album.ArtworkPath = artworkPath.String
		}
		if artworkURL.Valid {
			album.ArtworkURL = artworkURL.String
		}
		if artistID.Valid {
			album.PrimaryArtistID = artistID.Int64
		}
		items = append(items, models.AlbumItem{
			ID:                 strconv.FormatInt(album.ID, 10),
			Name:               album.Title,
			ArtistID:           nullableID(album.PrimaryArtistID),
			ArtistName:         artistName.String,
			ArtworkURL:         artworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL),
			ReleaseDate:        formatDate(album.ReleaseDate),
			TrackCount:         album.TotalTracks,
			AvailabilityStatus: string(album.AvailabilityStatus),
			FieldSources:       s.albumFieldSources(ctx, &album),
		})
		applyAlbumReleaseType(&items[len(items)-1], s.albumReleaseType(ctx, album.ID))
	}
	return items, total, nil
}

func (s *LocalLibraryService) searchArtists(ctx context.Context, query string, limit, offset int) ([]models.ArtistItem, error) {
	items, _, err := s.searchArtistsWithTotal(ctx, query, limit, offset)
	return items, err
}

func (s *LocalLibraryService) searchArtistsWithTotal(ctx context.Context, query string, limit, offset int) ([]models.ArtistItem, int, error) {
	total, err := s.countRows(ctx, `SELECT COUNT(*) FROM local_artists WHERE normalized_name ILIKE $1`, likeQuery(query))
	if err != nil {
		return nil, 0, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, artwork_path, artwork_url, availability_status
		FROM local_artists
		WHERE normalized_name ILIKE $1
		ORDER BY CASE WHEN availability_status = 'available' THEN 0 ELSE 1 END, name ASC, id ASC
		LIMIT $2 OFFSET $3
	`, likeQuery(query), limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("search local artists: %w", err)
	}
	defer rows.Close()

	items := []models.ArtistItem{}
	for rows.Next() {
		var artist models.LocalArtist
		var artworkPath, artworkURL sql.NullString
		if err := rows.Scan(&artist.ID, &artist.Name, &artworkPath, &artworkURL, &artist.AvailabilityStatus); err != nil {
			return nil, 0, fmt.Errorf("scan local artist row: %w", err)
		}
		if artworkPath.Valid {
			artist.ArtworkPath = artworkPath.String
		}
		if artworkURL.Valid {
			artist.ArtworkURL = artworkURL.String
		}
		items = append(items, models.ArtistItem{
			ID:                 strconv.FormatInt(artist.ID, 10),
			Name:               artist.Name,
			ArtworkURL:         s.artistArtworkURL(ctx, &artist),
			Genres:             []string{},
			AvailabilityStatus: string(artist.AvailabilityStatus),
			FieldSources:       s.artistFieldSources(ctx, &artist),
		})
	}
	return items, total, nil
}

func (s *LocalLibraryService) buildSongItem(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist) (*models.SongItem, error) {
	return s.buildSongItemWithPreload(ctx, media, album, artist, nil)
}

func (s *LocalLibraryService) buildSongItemWithPreload(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist, preload *localLibraryPreload) (*models.SongItem, error) {
	item := &models.SongItem{
		ID:                 strconv.FormatInt(media.ID, 10),
		Name:               media.Title,
		ArtistName:         artistName(artist),
		ArtistID:           nullableID(media.PrimaryArtistID),
		AlbumName:          albumTitle(album),
		AlbumID:            nullableID(media.AlbumID),
		Duration:           media.DurationMs,
		ArtworkURL:         artworkURLForSong(album, artist),
		ReleaseDate:        formatDate(media.ReleaseDate),
		HasLyrics:          media.LyricsAvailable,
		TrackNumber:        media.TrackNumber,
		DiscNumber:         media.DiscNumber,
		ComposerName:       media.Composer,
		Genres:             append([]string(nil), media.Genres...),
		ContentRating:      media.ContentRating,
		AvailabilityStatus: string(media.AvailabilityStatus),
		FieldSources:       s.songFieldSourcesWithPreload(ctx, media, album, artist, preload),
	}

	var mapping *models.LyricsMapping
	var mappingLoaded bool
	if mapping, mappingLoaded = preload.lyricsMappingFor(media.ID); !mappingLoaded && s.repo != nil {
		if loaded, err := s.repo.GetLyricsMappingByMediaID(ctx, media.ID); err == nil {
			mapping = loaded
		}
	}
	if mapping != nil && mapping.MatchConfidence >= s.matchThreshold() {
		item.HasLyrics = mapping.Status == models.LyricsMappingStatusMatched || mapping.Status == models.LyricsMappingStatusAvailable || item.HasLyrics
	}
	return item, nil
}

func (s *LocalLibraryService) songFieldSources(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist) map[string]models.FieldProvenance {
	return s.songFieldSourcesWithPreload(ctx, media, album, artist, nil)
}

func (s *LocalLibraryService) songFieldSourcesWithPreload(ctx context.Context, media *models.LocalMedia, album *models.LocalAlbum, artist *models.LocalArtist, preload *localLibraryPreload) map[string]models.FieldProvenance {
	result := map[string]models.FieldProvenance{}
	mergeFieldSources(result, s.provenanceForFieldsWithPreload(ctx, models.LocalEntityTypeMedia, media.ID, map[string]string{
		"title":            "name",
		"track_number":     "trackNumber",
		"disc_number":      "discNumber",
		"release_date":     "releaseDate",
		"genres":           "genres",
		"composer":         "composerName",
		"content_rating":   "contentRating",
		"lyrics_available": "hasLyrics",
	}, preload))
	if album != nil {
		mergeFieldSources(result, s.provenanceForFieldsWithPreload(ctx, models.LocalEntityTypeAlbum, album.ID, map[string]string{
			"title":   "albumName",
			"artwork": "artworkUrl",
		}, preload))
	}
	if artist != nil {
		mergeFieldSources(result, s.provenanceForFieldsWithPreload(ctx, models.LocalEntityTypeArtist, artist.ID, map[string]string{
			"name":    "artistName",
			"artwork": "artworkUrl",
		}, preload))
	}
	return result
}

func (s *LocalLibraryService) albumFieldSources(ctx context.Context, album *models.LocalAlbum) map[string]models.FieldProvenance {
	return s.albumFieldSourcesWithPreload(ctx, album, nil)
}

func (s *LocalLibraryService) albumReleaseType(ctx context.Context, albumID int64) models.ReleaseType {
	return s.albumReleaseTypeWithPreload(ctx, albumID, nil)
}

func (s *LocalLibraryService) albumReleaseTypeWithPreload(ctx context.Context, albumID int64, preload *localLibraryPreload) models.ReleaseType {
	if albumID == 0 {
		return models.ReleaseTypeAlbum
	}
	if preload != nil {
		if fields, ok := preload.metadataFieldsFor(models.LocalEntityTypeAlbum, albumID); ok {
			return releaseTypeFromMetadataFields(fields)
		}
	}
	if s.repo == nil {
		return models.ReleaseTypeAlbum
	}
	fields, err := s.repo.ListMetadataFields(ctx, models.LocalEntityTypeAlbum, albumID)
	if err != nil {
		return models.ReleaseTypeAlbum
	}
	return releaseTypeFromMetadataFields(fields)
}

func (s *LocalLibraryService) albumFieldSourcesWithPreload(ctx context.Context, album *models.LocalAlbum, preload *localLibraryPreload) map[string]models.FieldProvenance {
	return s.provenanceForFieldsWithPreload(ctx, models.LocalEntityTypeAlbum, album.ID, map[string]string{
		"title":        "name",
		"release_date": "releaseDate",
		"artwork":      "artworkUrl",
		"total_tracks": "trackCount",
		"release_type": "releaseType",
	}, preload)
}

func (s *LocalLibraryService) artistFieldSources(ctx context.Context, artist *models.LocalArtist) map[string]models.FieldProvenance {
	return s.artistFieldSourcesWithPreload(ctx, artist, nil)
}

func (s *LocalLibraryService) artistFieldSourcesWithPreload(ctx context.Context, artist *models.LocalArtist, preload *localLibraryPreload) map[string]models.FieldProvenance {
	return s.provenanceForFieldsWithPreload(ctx, models.LocalEntityTypeArtist, artist.ID, map[string]string{
		"name":    "name",
		"artwork": "artworkUrl",
	}, preload)
}

func (s *LocalLibraryService) provenanceForFields(ctx context.Context, entityType models.LocalEntityType, entityID int64, aliases map[string]string) map[string]models.FieldProvenance {
	return s.provenanceForFieldsWithPreload(ctx, entityType, entityID, aliases, nil)
}

func (s *LocalLibraryService) provenanceForFieldsWithPreload(ctx context.Context, entityType models.LocalEntityType, entityID int64, aliases map[string]string, preload *localLibraryPreload) map[string]models.FieldProvenance {
	result := map[string]models.FieldProvenance{}
	if s.repo == nil || entityID == 0 {
		return result
	}
	fields, ok := preload.metadataFieldsFor(entityType, entityID)
	if !ok {
		loaded, err := s.repo.ListMetadataFields(ctx, entityType, entityID)
		if err != nil {
			return result
		}
		fields = loaded
	}
	for _, field := range fields {
		targetKey, ok := aliases[field.FieldName]
		if !ok {
			targetKey = field.FieldName
		}
		result[targetKey] = models.FieldProvenance{
			Source:     string(field.Source),
			Confidence: field.Confidence,
			Enhanced:   field.IsEnhanced,
			EntityType: field.EntityType,
			EntityID:   strconv.FormatInt(field.EntityID, 10),
			Details:    field.Details,
		}
	}
	return result
}

func (s *LocalLibraryService) countRows(ctx context.Context, query string, args ...any) (int, error) {
	var total int
	if err := s.db.QueryRowContext(ctx, query, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("count rows: %w", err)
	}
	return total, nil
}

func normalizeSearchType(searchType string) string {
	switch strings.ToLower(strings.TrimSpace(searchType)) {
	case "songs", "song":
		return "song"
	case "albums", "album":
		return "album"
	case "artists", "artist":
		return "artist"
	default:
		return "all"
	}
}

func likeQuery(query string) string {
	return "%" + normalizeText(query) + "%"
}

func formatDate(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format("2006-01-02")
}

func nullableID(id int64) string {
	if id == 0 {
		return ""
	}
	return strconv.FormatInt(id, 10)
}

func artworkURLForEntity(entityType string, id int64, localPath, remoteURL string) string {
	if localPath != "" {
		return fmt.Sprintf("/api/artwork/%s/%d", entityType, id)
	}
	return remoteURL
}

func artworkURLForSong(album *models.LocalAlbum, artist *models.LocalArtist) string {
	if album != nil {
		if url := artworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL); url != "" {
			return url
		}
	}
	if artist != nil {
		return artworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL)
	}
	return ""
}

func artworkSourceForFields(fields []*models.MetadataField) models.MetadataSource {
	for _, field := range fields {
		if field != nil && field.FieldName == "artwork" {
			return field.Source
		}
	}
	return ""
}

func (s *LocalLibraryService) localArtworkURLForAlbum(ctx context.Context, album *models.LocalAlbum) string {
	if album == nil {
		return ""
	}
	if album.ArtworkPath != "" {
		return artworkURLForEntity("album", album.ID, album.ArtworkPath, album.ArtworkURL)
	}
	if s.repo == nil {
		return album.ArtworkURL
	}
	fields, err := s.repo.ListMetadataFields(ctx, models.LocalEntityTypeAlbum, album.ID)
	if err != nil {
		return album.ArtworkURL
	}
	if artworkSourceForFields(fields) == models.MetadataSourceRemote {
		return ""
	}
	return album.ArtworkURL
}

func (s *LocalLibraryService) localArtworkURLForArtist(ctx context.Context, artist *models.LocalArtist) string {
	if artist == nil {
		return ""
	}
	if artist.ArtworkPath != "" {
		return artworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL)
	}
	if s.repo != nil {
		if fields, err := s.repo.ListMetadataFields(ctx, models.LocalEntityTypeArtist, artist.ID); err == nil {
			if artworkSourceForFields(fields) != models.MetadataSourceRemote && artist.ArtworkURL != "" {
				return artist.ArtworkURL
			}
		}
	}
	if s.db == nil {
		return ""
	}

	var album models.LocalAlbum
	var releaseDate sql.NullTime
	var artworkPath, artworkURL sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, title, release_date, artwork_path, artwork_url, availability_status
		FROM local_albums
		WHERE primary_artist_id = $1
		  AND (NULLIF(artwork_path, '') IS NOT NULL OR NULLIF(artwork_url, '') IS NOT NULL)
		ORDER BY CASE WHEN availability_status = 'available' THEN 0 ELSE 1 END,
		         release_date DESC NULLS LAST,
		         id ASC
		LIMIT 1
	`, artist.ID).Scan(&album.ID, &album.Title, &releaseDate, &artworkPath, &artworkURL, &album.AvailabilityStatus)
	if err != nil {
		return ""
	}
	if releaseDate.Valid {
		value := releaseDate.Time
		album.ReleaseDate = &value
	}
	if artworkPath.Valid {
		album.ArtworkPath = artworkPath.String
	}
	if artworkURL.Valid {
		album.ArtworkURL = artworkURL.String
	}
	return s.localArtworkURLForAlbum(ctx, &album)
}

func (s *LocalLibraryService) LocalArtworkURLForAlbum(ctx context.Context, albumID int64) string {
	if s == nil || s.repo == nil || albumID == 0 {
		return ""
	}
	album, err := s.repo.GetAlbumByID(ctx, albumID)
	if err != nil || album == nil {
		return ""
	}
	return s.localArtworkURLForAlbum(ctx, album)
}

func (s *LocalLibraryService) LocalArtworkURLForArtist(ctx context.Context, artistID int64) string {
	if s == nil || s.repo == nil || artistID == 0 {
		return ""
	}
	artist, err := s.repo.GetArtistByID(ctx, artistID)
	if err != nil || artist == nil {
		return ""
	}
	return s.localArtworkURLForArtist(ctx, artist)
}

func (s *LocalLibraryService) artistArtworkURL(ctx context.Context, artist *models.LocalArtist) string {
	if artist == nil {
		return ""
	}

	if url := artworkURLForEntity("artist", artist.ID, artist.ArtworkPath, artist.ArtworkURL); url != "" {
		return url
	}
	if s.db == nil {
		return ""
	}

	var albumID int64
	var artworkPath, artworkURL sql.NullString
	err := s.db.QueryRowContext(ctx, `
		SELECT id, artwork_path, artwork_url
		FROM local_albums
		WHERE primary_artist_id = $1
		  AND (NULLIF(artwork_path, '') IS NOT NULL OR NULLIF(artwork_url, '') IS NOT NULL)
		ORDER BY CASE WHEN availability_status = 'available' THEN 0 ELSE 1 END,
		         release_date DESC NULLS LAST,
		         id ASC
		LIMIT 1
	`, artist.ID).Scan(&albumID, &artworkPath, &artworkURL)
	if err != nil {
		return ""
	}

	return artworkURLForEntity("album", albumID, nullableStringValue(artworkPath), nullableStringValue(artworkURL))
}

func buildLocalSuggestionContents(term string, result *models.SearchResultWithTop) []models.ContentSuggestion {
	if result == nil {
		return []models.ContentSuggestion{}
	}

	type scoredSuggestion struct {
		item         models.ContentSuggestion
		score        int
		sectionOrder int
		itemOrder    int
	}

	sectionPriority := map[string]int{}
	for index, section := range result.Order {
		if _, exists := sectionPriority[section]; !exists {
			sectionPriority[section] = index
		}
	}
	defaultSectionOrder := len(sectionPriority) + 1
	nextFallbackOrder := defaultSectionOrder
	for _, section := range []string{"songs", "artists", "albums"} {
		if _, exists := sectionPriority[section]; !exists {
			sectionPriority[section] = nextFallbackOrder
			nextFallbackOrder++
		}
	}

	scored := make([]scoredSuggestion, 0, len(result.Songs)+len(result.Artists)+len(result.Albums))
	appendSuggestion := func(section string, item models.ContentSuggestion, itemOrder int) {
		scored = append(scored, scoredSuggestion{
			item:         item,
			score:        localSuggestionScore(term, item),
			sectionOrder: sectionPriority[section],
			itemOrder:    itemOrder,
		})
	}

	for index, song := range result.Songs {
		appendSuggestion("songs", models.ContentSuggestion{
			ID:         song.ID,
			Type:       "song",
			Name:       song.Name,
			ArtworkURL: song.ArtworkURL,
			Subtitle:   song.ArtistName,
		}, index)
	}
	for index, artist := range result.Artists {
		appendSuggestion("artists", models.ContentSuggestion{
			ID:         artist.ID,
			Type:       "artist",
			Name:       artist.Name,
			ArtworkURL: artist.ArtworkURL,
		}, index)
	}
	for index, album := range result.Albums {
		appendSuggestion("albums", models.ContentSuggestion{
			ID:         album.ID,
			Type:       "album",
			Name:       album.Name,
			ArtworkURL: album.ArtworkURL,
			Subtitle:   album.ArtistName,
		}, index)
	}

	sort.SliceStable(scored, func(i, j int) bool {
		if scored[i].score != scored[j].score {
			return scored[i].score > scored[j].score
		}
		if typeSuggestionPriority(scored[i].item.Type) != typeSuggestionPriority(scored[j].item.Type) {
			return typeSuggestionPriority(scored[i].item.Type) < typeSuggestionPriority(scored[j].item.Type)
		}
		if scored[i].sectionOrder != scored[j].sectionOrder {
			return scored[i].sectionOrder < scored[j].sectionOrder
		}
		return scored[i].itemOrder < scored[j].itemOrder
	})

	contents := make([]models.ContentSuggestion, 0, 6)
	for _, entry := range scored {
		contents = append(contents, entry.item)
		if len(contents) >= 6 {
			break
		}
	}
	return contents
}

func sortAlbumItemsByReleaseDate(items []models.AlbumItem) {
	sort.SliceStable(items, func(i, j int) bool {
		dateI := items[i].ReleaseDate
		dateJ := items[j].ReleaseDate
		if dateI != dateJ {
			return dateI > dateJ
		}
		return items[i].Name < items[j].Name
	})
}

func localSuggestionScore(term string, item models.ContentSuggestion) int {
	term = normalizeText(term)
	if term == "" {
		return typeSuggestionBoost(item.Type)
	}

	if item.Type == "artist" && normalizeText(item.Name) == term {
		return 10000
	}

	nameScore := localSuggestionMatchScore(term, item.Name, 1000)
	subtitleScore := localSuggestionMatchScore(term, item.Subtitle, 220)
	score := nameScore + subtitleScore
	if score > 0 {
		score += typeSuggestionBoost(item.Type)
	}
	return score
}

func localSuggestionMatchScore(term, value string, base int) int {
	value = normalizeText(value)
	if value == "" || term == "" {
		return 0
	}
	if value == term {
		return base + 400
	}
	if strings.HasPrefix(value, term) {
		return base + 240
	}
	if strings.Contains(value, term) {
		return base + 120
	}
	for _, word := range strings.Fields(value) {
		if strings.HasPrefix(word, term) {
			return base + 80
		}
	}
	return 0
}

func typeSuggestionBoost(contentType string) int {
	switch contentType {
	case "artist":
		return 220
	case "album":
		return 120
	default:
		return 0
	}
}

func typeSuggestionPriority(contentType string) int {
	switch contentType {
	case "artist":
		return 0
	case "album":
		return 1
	default:
		return 2
	}
}

func artistName(artist *models.LocalArtist) string {
	if artist == nil {
		return ""
	}
	return artist.Name
}

func albumTitle(album *models.LocalAlbum) string {
	if album == nil {
		return ""
	}
	return album.Title
}

func inferAlbumReleaseDateFromTracks(tracks []*models.LocalMedia) *time.Time {
	var earliest *time.Time
	for _, track := range tracks {
		if track == nil || track.ReleaseDate == nil {
			continue
		}
		if earliest == nil || track.ReleaseDate.Before(*earliest) {
			value := *track.ReleaseDate
			earliest = &value
		}
	}
	return earliest
}

func nullableStringValue(value sql.NullString) string {
	if !value.Valid {
		return ""
	}
	return value.String
}

func mergeFieldSources(target map[string]models.FieldProvenance, source map[string]models.FieldProvenance) {
	for key, value := range source {
		target[key] = value
	}
}

func metadataStringDetail(field *models.MetadataField, key string) (string, bool) {
	if field == nil || field.Details == nil {
		return "", false
	}
	value, ok := field.Details[key]
	if !ok {
		return "", false
	}
	text, ok := value.(string)
	if !ok || strings.TrimSpace(text) == "" {
		return "", false
	}
	return text, true
}

func (s *LocalLibraryService) matchThreshold() float64 {
	if s == nil {
		return 0
	}
	return 0.75
}
