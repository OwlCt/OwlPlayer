package services

import (
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"github.com/OwlCt/OwlPlayer/models"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"
)

type localMetadataCandidate struct {
	Value      any
	Source     models.MetadataSource
	Confidence float64
	Details    map[string]any
}

type localArtworkCandidate struct {
	Path       string
	Data       []byte
	MIMEType   string
	Source     models.MetadataSource
	Confidence float64
	Details    map[string]any
}

type localResolvedMetadata struct {
	Title           localMetadataCandidate
	ArtistName      localMetadataCandidate
	AlbumTitle      localMetadataCandidate
	DurationMs      localMetadataCandidate
	TrackNumber     localMetadataCandidate
	TrackTotal      localMetadataCandidate
	DiscNumber      localMetadataCandidate
	DiscTotal       localMetadataCandidate
	Genres          localMetadataCandidate
	Composer        localMetadataCandidate
	ReleaseDate     localMetadataCandidate
	ContentRating   localMetadataCandidate
	LyricsAvailable localMetadataCandidate
	Artwork         *localArtworkCandidate
	ArtistArtwork   *localArtworkCandidate
	MotionArtwork   localMetadataCandidate
	SidecarLyrics   string
}

type localParsedTags struct {
	Title         string
	Artist        string
	Album         string
	DurationMs    int
	TrackNumber   int
	TrackTotal    int
	DiscNumber    int
	DiscTotal     int
	Genres        []string
	Composer      string
	ReleaseDate   *time.Time
	ContentRating string
	LyricsPresent bool
	LyricsText    string
	LyricsFormat  string
	ArtworkData   []byte
	ArtworkMIME   string
}

func resolveLocalMetadata(libraryRoot, absolutePath, relativePath string) (*localResolvedMetadata, error) {
	parsed, err := parseLocalTags(absolutePath)
	if err != nil {
		return nil, err
	}

	fileNameTitle, fileNameTrack := parseFilenameTitle(filepath.Base(absolutePath))
	directoryArtist := deriveArtistName(relativePath)
	directoryAlbum := deriveAlbumTitle(relativePath)
	sidecarArtwork := findSidecarArtwork(absolutePath)
	artistArtwork := findArtistArtwork(libraryRoot, relativePath)
	motionArtwork := findMotionArtwork(absolutePath)
	sidecarLyrics := findSidecarLyrics(absolutePath)

	lyricsCandidate := localMetadataCandidate{}
	switch {
	case parsed.LyricsPresent:
		lyricsCandidate = localMetadataCandidate{
			Value:      true,
			Source:     models.MetadataSourceTag,
			Confidence: 0.70,
			Details: map[string]any{
				"resolver": "tag",
				"format":   parsed.LyricsFormat,
			},
		}
	case sidecarLyrics != "":
		lyricsCandidate = localMetadataCandidate{
			Value:      true,
			Source:     models.MetadataSourceDirectory,
			Confidence: 0.64,
			Details: map[string]any{
				"resolver": "sidecar_lyrics",
				"path":     sidecarLyrics,
			},
		}
	}

	resolved := &localResolvedMetadata{
		Title: resolveStringCandidate(
			stringCandidate(parsed.Title, models.MetadataSourceTag, 0.98, map[string]any{"resolver": "tag"}),
			stringCandidate(fileNameTitle, models.MetadataSourceFilename, 0.52, map[string]any{"resolver": "filename"}),
			stringCandidate("Unknown Track", models.MetadataSourceSystem, 0.05, map[string]any{"resolver": "default"}),
		),
		ArtistName: resolveStringCandidate(
			stringCandidate(parsed.Artist, models.MetadataSourceTag, 0.98, map[string]any{"resolver": "tag"}),
			stringCandidate(directoryArtist, models.MetadataSourceDirectory, 0.62, map[string]any{"resolver": "directory"}),
			stringCandidate(unknownArtistName, models.MetadataSourceSystem, 0.05, map[string]any{"resolver": "default"}),
		),
		AlbumTitle: resolveStringCandidate(
			stringCandidate(parsed.Album, models.MetadataSourceTag, 0.98, map[string]any{"resolver": "tag"}),
			stringCandidate(directoryAlbum, models.MetadataSourceDirectory, 0.60, map[string]any{"resolver": "directory"}),
			stringCandidate(unknownAlbumTitle, models.MetadataSourceSystem, 0.05, map[string]any{"resolver": "default"}),
		),
		DurationMs: resolveIntCandidate(
			intCandidate(parsed.DurationMs, models.MetadataSourceScan, 0.96, map[string]any{"resolver": "duration_probe"}),
		),
		TrackNumber: resolveIntCandidate(
			intCandidate(parsed.TrackNumber, models.MetadataSourceTag, 0.95, map[string]any{"resolver": "tag"}),
			intCandidate(fileNameTrack, models.MetadataSourceFilename, 0.48, map[string]any{"resolver": "filename"}),
		),
		TrackTotal: resolveIntCandidate(
			intCandidate(parsed.TrackTotal, models.MetadataSourceTag, 0.95, map[string]any{"resolver": "tag"}),
		),
		DiscNumber: resolveIntCandidate(
			intCandidate(parsed.DiscNumber, models.MetadataSourceTag, 0.95, map[string]any{"resolver": "tag"}),
		),
		DiscTotal: resolveIntCandidate(
			intCandidate(parsed.DiscTotal, models.MetadataSourceTag, 0.95, map[string]any{"resolver": "tag"}),
		),
		Genres: resolveStringSliceCandidate(
			stringSliceCandidate(parsed.Genres, models.MetadataSourceTag, 0.90, map[string]any{"resolver": "tag"}),
		),
		Composer: resolveStringCandidate(
			stringCandidate(parsed.Composer, models.MetadataSourceTag, 0.88, map[string]any{"resolver": "tag"}),
		),
		ReleaseDate: resolveTimeCandidate(
			timeCandidate(parsed.ReleaseDate, models.MetadataSourceTag, 0.88, map[string]any{"resolver": "tag"}),
		),
		ContentRating: resolveStringCandidate(
			stringCandidate(parsed.ContentRating, models.MetadataSourceTag, 0.75, map[string]any{"resolver": "tag"}),
		),
		LyricsAvailable: lyricsCandidate,
		SidecarLyrics:   sidecarLyrics,
	}

	switch {
	case len(parsed.ArtworkData) > 0:
		resolved.Artwork = &localArtworkCandidate{
			Data:       append([]byte(nil), parsed.ArtworkData...),
			MIMEType:   parsed.ArtworkMIME,
			Source:     models.MetadataSourceEmbeddedArt,
			Confidence: 0.97,
			Details:    map[string]any{"resolver": "embedded_art"},
		}
	case sidecarArtwork != "":
		resolved.Artwork = &localArtworkCandidate{
			Path:       sidecarArtwork,
			Source:     models.MetadataSourceDirectory,
			Confidence: 0.80,
			Details:    map[string]any{"resolver": "directory", "path": sidecarArtwork},
		}
	}

	if artistArtwork != "" {
		resolved.ArtistArtwork = &localArtworkCandidate{
			Path:       artistArtwork,
			Source:     models.MetadataSourceDirectory,
			Confidence: 0.78,
			Details:    map[string]any{"resolver": "artist_directory", "path": artistArtwork},
		}
	}

	if motionArtwork != "" {
		resolved.MotionArtwork = localMetadataCandidate{
			Value:      motionArtwork,
			Source:     models.MetadataSourceDirectory,
			Confidence: 0.82,
			Details: map[string]any{
				"resolver": "motion_artwork",
				"path":     motionArtwork,
			},
		}
	}

	return resolved, nil
}

func stringCandidate(value string, source models.MetadataSource, confidence float64, details map[string]any) localMetadataCandidate {
	value = strings.TrimSpace(value)
	if value == "" {
		return localMetadataCandidate{}
	}
	return localMetadataCandidate{Value: value, Source: source, Confidence: confidence, Details: details}
}

func intCandidate(value int, source models.MetadataSource, confidence float64, details map[string]any) localMetadataCandidate {
	if value <= 0 {
		return localMetadataCandidate{}
	}
	return localMetadataCandidate{Value: value, Source: source, Confidence: confidence, Details: details}
}

func stringSliceCandidate(value []string, source models.MetadataSource, confidence float64, details map[string]any) localMetadataCandidate {
	if len(value) == 0 {
		return localMetadataCandidate{}
	}
	clean := make([]string, 0, len(value))
	for _, item := range value {
		item = strings.TrimSpace(item)
		if item != "" {
			clean = append(clean, item)
		}
	}
	if len(clean) == 0 {
		return localMetadataCandidate{}
	}
	return localMetadataCandidate{Value: clean, Source: source, Confidence: confidence, Details: details}
}

func timeCandidate(value *time.Time, source models.MetadataSource, confidence float64, details map[string]any) localMetadataCandidate {
	if value == nil {
		return localMetadataCandidate{}
	}
	return localMetadataCandidate{Value: *value, Source: source, Confidence: confidence, Details: details}
}

func resolveStringCandidate(candidates ...localMetadataCandidate) localMetadataCandidate {
	for _, candidate := range candidates {
		if value, ok := candidate.Value.(string); ok && strings.TrimSpace(value) != "" {
			return candidate
		}
	}
	return localMetadataCandidate{}
}

func resolveIntCandidate(candidates ...localMetadataCandidate) localMetadataCandidate {
	for _, candidate := range candidates {
		if value, ok := candidate.Value.(int); ok && value > 0 {
			return candidate
		}
	}
	return localMetadataCandidate{}
}

func resolveStringSliceCandidate(candidates ...localMetadataCandidate) localMetadataCandidate {
	for _, candidate := range candidates {
		if value, ok := candidate.Value.([]string); ok && len(value) > 0 {
			return candidate
		}
	}
	return localMetadataCandidate{}
}

func resolveTimeCandidate(candidates ...localMetadataCandidate) localMetadataCandidate {
	for _, candidate := range candidates {
		if _, ok := candidate.Value.(time.Time); ok {
			return candidate
		}
	}
	return localMetadataCandidate{}
}

func parseFilenameTitle(name string) (string, int) {
	name = strings.TrimSuffix(name, filepath.Ext(name))
	name = strings.TrimSpace(name)
	if name == "" {
		return "", 0
	}

	trackNumber := 0
	if parts := strings.SplitN(name, " - ", 2); len(parts) == 2 {
		if n, err := strconv.Atoi(strings.TrimLeft(strings.TrimSpace(parts[0]), "0")); err == nil {
			trackNumber = n
			name = strings.TrimSpace(parts[1])
		}
	}

	return strings.TrimSpace(name), trackNumber
}

func parseLocalTags(path string) (*localParsedTags, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read metadata file %s: %w", path, err)
	}

	parsed := &localParsedTags{}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp3":
		parseID3v2(data, parsed)
		parseID3v1(data, parsed)
		parsed.DurationMs = parseMP3Duration(data)
	case ".flac":
		parseFLACTags(data, parsed)
		if parsed.DurationMs == 0 {
			parsed.DurationMs = parseFLACDuration(data)
		}
	case ".m4a", ".alac", ".aac":
		if strings.ToLower(filepath.Ext(path)) == ".aac" {
			parsed.DurationMs = parseADTSDuration(data)
		} else {
			parseMP4Tags(data, parsed)
			if parsed.DurationMs == 0 {
				parsed.DurationMs = parseMP4Duration(data)
			}
		}
	case ".wav":
		parsed.DurationMs = parseWAVDuration(data)
	}
	return parsed, nil
}

func parseID3v2(data []byte, parsed *localParsedTags) {
	if len(data) < 10 || string(data[:3]) != "ID3" {
		return
	}

	version := data[3]
	flags := data[5]
	tagSize := syncSafeInt(data[6:10])
	if tagSize <= 0 || len(data) < 10+tagSize {
		return
	}

	tagData := data[10 : 10+tagSize]
	if flags&0x80 != 0 {
		tagData = removeUnsynchronization(tagData)
	}

	offset := 0
	for offset+10 <= len(tagData) {
		frameID := string(tagData[offset : offset+4])
		if strings.Trim(frameID, "\x00") == "" {
			break
		}

		var frameSize int
		switch version {
		case 4:
			frameSize = syncSafeInt(tagData[offset+4 : offset+8])
		default:
			frameSize = int(binary.BigEndian.Uint32(tagData[offset+4 : offset+8]))
		}
		if frameSize <= 0 || offset+10+frameSize > len(tagData) {
			break
		}

		frameData := tagData[offset+10 : offset+10+frameSize]
		applyID3Frame(parsed, frameID, frameData)
		offset += 10 + frameSize
	}
}

func parseID3v1(data []byte, parsed *localParsedTags) {
	if len(data) < 128 {
		return
	}
	tag := data[len(data)-128:]
	if string(tag[:3]) != "TAG" {
		return
	}

	if parsed.Title == "" {
		parsed.Title = trimID3String(tag[3:33])
	}
	if parsed.Artist == "" {
		parsed.Artist = trimID3String(tag[33:63])
	}
	if parsed.Album == "" {
		parsed.Album = trimID3String(tag[63:93])
	}
	if parsed.ReleaseDate == nil {
		if year := trimID3String(tag[93:97]); year != "" {
			if release := parseTagReleaseDate(year); release != nil {
				parsed.ReleaseDate = release
			}
		}
	}
	if parsed.TrackNumber == 0 && tag[125] == 0 && tag[126] > 0 {
		parsed.TrackNumber = int(tag[126])
	}
}

func applyID3Frame(parsed *localParsedTags, frameID string, frameData []byte) {
	switch frameID {
	case "TIT2":
		if parsed.Title == "" {
			parsed.Title = decodeID3TextFrame(frameData)
		}
	case "TPE1":
		if parsed.Artist == "" {
			parsed.Artist = decodeID3TextFrame(frameData)
		}
	case "TALB":
		if parsed.Album == "" {
			parsed.Album = decodeID3TextFrame(frameData)
		}
	case "TRCK":
		if parsed.TrackNumber == 0 || parsed.TrackTotal == 0 {
			parsed.TrackNumber, parsed.TrackTotal = parsePositionFrame(decodeID3TextFrame(frameData), parsed.TrackNumber, parsed.TrackTotal)
		}
	case "TPOS":
		if parsed.DiscNumber == 0 || parsed.DiscTotal == 0 {
			parsed.DiscNumber, parsed.DiscTotal = parsePositionFrame(decodeID3TextFrame(frameData), parsed.DiscNumber, parsed.DiscTotal)
		}
	case "TCON":
		if len(parsed.Genres) == 0 {
			parsed.Genres = splitTagList(decodeID3TextFrame(frameData))
		}
	case "TCOM":
		if parsed.Composer == "" {
			parsed.Composer = decodeID3TextFrame(frameData)
		}
	case "TDRC", "TYER":
		if parsed.ReleaseDate == nil {
			parsed.ReleaseDate = parseTagReleaseDate(decodeID3TextFrame(frameData))
		}
	case "USLT":
		parsed.LyricsPresent = true
		if parsed.LyricsText == "" {
			parsed.LyricsText = parseUnsynchronizedLyricsFrame(frameData)
			parsed.LyricsFormat = detectLocalLyricsFormat(parsed.LyricsText)
		}
	case "SYLT":
		parsed.LyricsPresent = true
	case "APIC":
		if len(parsed.ArtworkData) == 0 {
			parsed.ArtworkMIME, parsed.ArtworkData = parseAPIC(frameData)
		}
	}
}

func parseFLACTags(data []byte, parsed *localParsedTags) {
	if len(data) < 4 || string(data[:4]) != "fLaC" {
		return
	}

	offset := 4
	for offset+4 <= len(data) {
		header := data[offset]
		lastBlock := header&0x80 != 0
		blockType := header & 0x7f
		blockLen := int(data[offset+1])<<16 | int(data[offset+2])<<8 | int(data[offset+3])
		offset += 4
		if offset+blockLen > len(data) {
			return
		}

		block := data[offset : offset+blockLen]
		switch blockType {
		case 4:
			parseFLACVorbisComment(block, parsed)
		case 6:
			if len(parsed.ArtworkData) == 0 {
				parsed.ArtworkMIME, parsed.ArtworkData = parseFLACPicture(block)
			}
		}

		offset += blockLen
		if lastBlock {
			return
		}
	}
}

func parseFLACVorbisComment(block []byte, parsed *localParsedTags) {
	if len(block) < 8 {
		return
	}

	offset := 0
	vendorLen := int(binary.LittleEndian.Uint32(block[offset : offset+4]))
	offset += 4 + vendorLen
	if offset+4 > len(block) {
		return
	}

	commentCount := int(binary.LittleEndian.Uint32(block[offset : offset+4]))
	offset += 4
	for i := 0; i < commentCount && offset+4 <= len(block); i++ {
		length := int(binary.LittleEndian.Uint32(block[offset : offset+4]))
		offset += 4
		if offset+length > len(block) {
			return
		}
		comment := string(block[offset : offset+length])
		offset += length

		parts := strings.SplitN(comment, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(parts[0]))
		value := strings.TrimSpace(parts[1])
		switch key {
		case "TITLE":
			if parsed.Title == "" {
				parsed.Title = value
			}
		case "ARTIST", "ALBUMARTIST":
			if parsed.Artist == "" {
				parsed.Artist = value
			}
		case "ALBUM":
			if parsed.Album == "" {
				parsed.Album = value
			}
		case "TRACKNUMBER":
			if parsed.TrackNumber == 0 {
				parsed.TrackNumber, parsed.TrackTotal = parsePositionFrame(value, parsed.TrackNumber, parsed.TrackTotal)
			}
		case "TRACKTOTAL", "TOTALTRACKS":
			if parsed.TrackTotal == 0 {
				if total, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
					parsed.TrackTotal = total
				}
			}
		case "DISCNUMBER":
			if parsed.DiscNumber == 0 {
				parsed.DiscNumber, parsed.DiscTotal = parsePositionFrame(value, parsed.DiscNumber, parsed.DiscTotal)
			}
		case "DISCTOTAL", "TOTALDISCS":
			if parsed.DiscTotal == 0 {
				if total, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
					parsed.DiscTotal = total
				}
			}
		case "GENRE":
			if len(parsed.Genres) == 0 {
				parsed.Genres = splitTagList(value)
			}
		case "COMPOSER":
			if parsed.Composer == "" {
				parsed.Composer = value
			}
		case "DATE", "YEAR":
			if parsed.ReleaseDate == nil {
				parsed.ReleaseDate = parseTagReleaseDate(value)
			}
		case "LYRICS", "UNSYNCEDLYRICS":
			if value != "" {
				parsed.LyricsPresent = true
				if parsed.LyricsText == "" {
					parsed.LyricsText = value
					parsed.LyricsFormat = detectLocalLyricsFormat(value)
				}
			}
		}
	}
}

func parseMP4Tags(data []byte, parsed *localParsedTags) {
	parseMP4AtomContainer(data, nil, parsed)
}

func parseMP3Duration(data []byte) int {
	offset := 0
	if len(data) >= 10 && string(data[:3]) == "ID3" {
		tagSize := syncSafeInt(data[6:10])
		if tagSize > 0 && len(data) >= 10+tagSize {
			offset = 10 + tagSize
		}
	}

	for offset+4 <= len(data) {
		header, ok := parseMP3FrameHeader(data[offset : offset+4])
		if !ok || header.frameSize <= 0 {
			offset++
			continue
		}

		if duration := parseXingDuration(data[offset:], header); duration > 0 {
			return duration
		}

		audioBytes := len(data) - offset
		if len(data) >= 128 && string(data[len(data)-128:len(data)-125]) == "TAG" {
			audioBytes -= 128
		}
		if header.bitrate <= 0 || audioBytes <= 0 {
			return 0
		}
		seconds := float64(audioBytes*8) / float64(header.bitrate)
		return int(seconds * 1000)
	}

	return 0
}

type mp3FrameHeader struct {
	version         int
	layer           int
	bitrate         int
	sampleRate      int
	channelMode     int
	samplesPerFrame int
	frameSize       int
}

func parseMP3FrameHeader(data []byte) (mp3FrameHeader, bool) {
	if len(data) < 4 {
		return mp3FrameHeader{}, false
	}

	header := binary.BigEndian.Uint32(data[:4])
	if (header>>21)&0x7ff != 0x7ff {
		return mp3FrameHeader{}, false
	}

	versionBits := (header >> 19) & 0x3
	layerBits := (header >> 17) & 0x3
	bitrateIndex := (header >> 12) & 0xf
	sampleRateIndex := (header >> 10) & 0x3
	padding := int((header >> 9) & 0x1)
	channelMode := int((header >> 6) & 0x3)

	version := 0
	switch versionBits {
	case 0:
		version = 25
	case 2:
		version = 2
	case 3:
		version = 1
	default:
		return mp3FrameHeader{}, false
	}

	layer := 0
	switch layerBits {
	case 1:
		layer = 3
	case 2:
		layer = 2
	case 3:
		layer = 1
	default:
		return mp3FrameHeader{}, false
	}

	bitrate := lookupMP3Bitrate(version, layer, int(bitrateIndex))
	sampleRate := lookupMP3SampleRate(version, int(sampleRateIndex))
	if bitrate <= 0 || sampleRate <= 0 {
		return mp3FrameHeader{}, false
	}

	samplesPerFrame := lookupMP3SamplesPerFrame(version, layer)
	if samplesPerFrame <= 0 {
		return mp3FrameHeader{}, false
	}

	frameSize := 0
	switch layer {
	case 1:
		frameSize = ((12*bitrate)/sampleRate + padding) * 4
	case 2:
		frameSize = (144*bitrate)/sampleRate + padding
	case 3:
		if version == 1 {
			frameSize = (144*bitrate)/sampleRate + padding
		} else {
			frameSize = (72*bitrate)/sampleRate + padding
		}
	}
	if frameSize <= 0 {
		return mp3FrameHeader{}, false
	}

	return mp3FrameHeader{
		version:         version,
		layer:           layer,
		bitrate:         bitrate,
		sampleRate:      sampleRate,
		channelMode:     channelMode,
		samplesPerFrame: samplesPerFrame,
		frameSize:       frameSize,
	}, true
}

func lookupMP3Bitrate(version, layer, index int) int {
	if index <= 0 || index >= 15 {
		return 0
	}

	var table []int
	switch {
	case version == 1 && layer == 1:
		table = []int{0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448}
	case version == 1 && layer == 2:
		table = []int{0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384}
	case version == 1 && layer == 3:
		table = []int{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320}
	case version != 1 && layer == 1:
		table = []int{0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256}
	case version != 1 && layer == 2:
		table = []int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}
	case version != 1 && layer == 3:
		table = []int{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160}
	}
	if len(table) == 0 || index >= len(table) {
		return 0
	}
	return table[index] * 1000
}

func lookupMP3SampleRate(version, index int) int {
	if index >= 3 {
		return 0
	}
	switch version {
	case 1:
		return []int{44100, 48000, 32000}[index]
	case 2:
		return []int{22050, 24000, 16000}[index]
	case 25:
		return []int{11025, 12000, 8000}[index]
	default:
		return 0
	}
}

func lookupMP3SamplesPerFrame(version, layer int) int {
	switch layer {
	case 1:
		return 384
	case 2:
		return 1152
	case 3:
		if version == 1 {
			return 1152
		}
		return 576
	default:
		return 0
	}
}

func parseXingDuration(data []byte, header mp3FrameHeader) int {
	if len(data) < header.frameSize {
		return 0
	}

	offset := 4
	if header.version == 1 {
		if header.channelMode == 3 {
			offset += 17
		} else {
			offset += 32
		}
	} else {
		if header.channelMode == 3 {
			offset += 9
		} else {
			offset += 17
		}
	}
	if offset+8 > len(data) {
		return 0
	}
	tag := string(data[offset : offset+4])
	if tag != "Xing" && tag != "Info" {
		return 0
	}
	flags := binary.BigEndian.Uint32(data[offset+4 : offset+8])
	cursor := offset + 8
	if flags&0x1 == 0 || cursor+4 > len(data) {
		return 0
	}
	frameCount := binary.BigEndian.Uint32(data[cursor : cursor+4])
	if frameCount == 0 || header.sampleRate <= 0 {
		return 0
	}
	seconds := float64(frameCount*uint32(header.samplesPerFrame)) / float64(header.sampleRate)
	return int(seconds * 1000)
}

func parseFLACDuration(data []byte) int {
	if len(data) < 42 || string(data[:4]) != "fLaC" {
		return 0
	}
	offset := 4
	for offset+4 <= len(data) {
		header := data[offset]
		lastBlock := header&0x80 != 0
		blockType := header & 0x7f
		blockLen := int(data[offset+1])<<16 | int(data[offset+2])<<8 | int(data[offset+3])
		offset += 4
		if offset+blockLen > len(data) {
			return 0
		}
		if blockType == 0 && blockLen >= 34 {
			block := data[offset : offset+blockLen]
			sampleRate := int(block[10])<<12 | int(block[11])<<4 | int(block[12]>>4)
			totalSamples := int64(block[13]&0x0f)<<32 | int64(block[14])<<24 | int64(block[15])<<16 | int64(block[16])<<8 | int64(block[17])
			if sampleRate > 0 && totalSamples > 0 {
				return int((float64(totalSamples) / float64(sampleRate)) * 1000)
			}
			return 0
		}
		offset += blockLen
		if lastBlock {
			break
		}
	}
	return 0
}

func parseMP4Duration(data []byte) int {
	var durationMs int
	parseMP4DurationContainer(data, &durationMs)
	return durationMs
}

func parseMP4DurationContainer(data []byte, durationMs *int) {
	offset := 0
	for offset+8 <= len(data) {
		atomSize, headerSize, atomType, ok := readMP4AtomHeader(data[offset:])
		if !ok || atomSize < uint64(headerSize) || offset+int(atomSize) > len(data) {
			return
		}

		payload := data[offset+headerSize : offset+int(atomSize)]
		switch atomType {
		case "moov", "trak", "mdia", "minf", "stbl", "udta", "ilst":
			parseMP4DurationContainer(payload, durationMs)
		case "meta":
			if len(payload) >= 4 {
				parseMP4DurationContainer(payload[4:], durationMs)
			}
		case "mdhd":
			if *durationMs == 0 {
				*durationMs = parseMP4MDHDDuration(payload)
			}
		}
		if *durationMs > 0 {
			return
		}
		offset += int(atomSize)
	}
}

func parseMP4MDHDDuration(payload []byte) int {
	if len(payload) < 20 {
		return 0
	}
	version := payload[0]
	switch version {
	case 1:
		if len(payload) < 32 {
			return 0
		}
		timescale := binary.BigEndian.Uint32(payload[20:24])
		duration := binary.BigEndian.Uint64(payload[24:32])
		if timescale == 0 || duration == 0 {
			return 0
		}
		return int((float64(duration) / float64(timescale)) * 1000)
	default:
		timescale := binary.BigEndian.Uint32(payload[12:16])
		duration := binary.BigEndian.Uint32(payload[16:20])
		if timescale == 0 || duration == 0 {
			return 0
		}
		return int((float64(duration) / float64(timescale)) * 1000)
	}
}

func parseADTSDuration(data []byte) int {
	offset := 0
	frameCount := 0
	sampleRate := 0

	for offset+7 <= len(data) {
		if data[offset] != 0xff || data[offset+1]&0xf0 != 0xf0 {
			offset++
			continue
		}

		protectionAbsent := data[offset+1] & 0x1
		sampleRateIndex := (data[offset+2] >> 2) & 0x0f
		if sampleRate == 0 {
			sampleRate = lookupADTSSampleRate(int(sampleRateIndex))
		}
		frameLength := int(data[offset+3]&0x03)<<11 | int(data[offset+4])<<3 | int(data[offset+5]>>5)
		if frameLength <= 0 {
			break
		}
		headerLen := 7
		if protectionAbsent == 0 {
			headerLen = 9
		}
		if frameLength < headerLen || offset+frameLength > len(data) {
			break
		}
		frameCount++
		offset += frameLength
	}

	if frameCount == 0 || sampleRate <= 0 {
		return 0
	}
	seconds := float64(frameCount*1024) / float64(sampleRate)
	return int(seconds * 1000)
}

func lookupADTSSampleRate(index int) int {
	table := []int{96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350}
	if index < 0 || index >= len(table) {
		return 0
	}
	return table[index]
}

func parseWAVDuration(data []byte) int {
	if len(data) < 44 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WAVE" {
		return 0
	}

	offset := 12
	var sampleRate uint32
	var channels uint16
	var bitsPerSample uint16
	var dataSize uint32

	for offset+8 <= len(data) {
		chunkID := string(data[offset : offset+4])
		chunkSize := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		offset += 8
		if offset+chunkSize > len(data) {
			return 0
		}

		switch chunkID {
		case "fmt ":
			if chunkSize >= 16 {
				channels = binary.LittleEndian.Uint16(data[offset+2 : offset+4])
				sampleRate = binary.LittleEndian.Uint32(data[offset+4 : offset+8])
				bitsPerSample = binary.LittleEndian.Uint16(data[offset+14 : offset+16])
			}
		case "data":
			dataSize = uint32(chunkSize)
		}

		offset += chunkSize
		if chunkSize%2 == 1 {
			offset++
		}
	}

	if sampleRate == 0 || channels == 0 || bitsPerSample == 0 || dataSize == 0 {
		return 0
	}
	bytesPerSecond := float64(sampleRate) * float64(channels) * float64(bitsPerSample) / 8
	if bytesPerSecond <= 0 {
		return 0
	}
	return int((float64(dataSize) / bytesPerSecond) * 1000)
}

func parseMP4AtomContainer(data []byte, parents []string, parsed *localParsedTags) {
	offset := 0
	for offset+8 <= len(data) {
		atomSize, headerSize, atomType, ok := readMP4AtomHeader(data[offset:])
		if !ok || atomSize < uint64(headerSize) || offset+int(atomSize) > len(data) {
			return
		}

		payload := data[offset+headerSize : offset+int(atomSize)]
		switch atomType {
		case "moov", "udta", "ilst":
			parseMP4AtomContainer(payload, append(parents, atomType), parsed)
		case "meta":
			if len(payload) >= 4 {
				parseMP4AtomContainer(payload[4:], append(parents, atomType), parsed)
			}
		default:
			if len(parents) > 0 && parents[len(parents)-1] == "ilst" {
				parseMP4MetadataItem(atomType, payload, parsed)
			}
		}

		offset += int(atomSize)
	}
}

func readMP4AtomHeader(data []byte) (uint64, int, string, bool) {
	if len(data) < 8 {
		return 0, 0, "", false
	}

	size := uint64(binary.BigEndian.Uint32(data[:4]))
	headerSize := 8
	if size == 1 {
		if len(data) < 16 {
			return 0, 0, "", false
		}
		size = binary.BigEndian.Uint64(data[8:16])
		headerSize = 16
	} else if size == 0 {
		size = uint64(len(data))
	}

	return size, headerSize, string(data[4:8]), true
}

func parseMP4MetadataItem(atomType string, data []byte, parsed *localParsedTags) {
	offset := 0
	for offset+8 <= len(data) {
		childSize, headerSize, childType, ok := readMP4AtomHeader(data[offset:])
		if !ok || childSize < uint64(headerSize) || offset+int(childSize) > len(data) {
			return
		}
		if childType != "data" {
			offset += int(childSize)
			continue
		}

		payload := data[offset+headerSize : offset+int(childSize)]
		if len(payload) < 8 {
			offset += int(childSize)
			continue
		}

		dataType := binary.BigEndian.Uint32(payload[:4])
		value := payload[8:]
		applyMP4MetadataValue(atomType, dataType, value, parsed)
		offset += int(childSize)
	}
}

func applyMP4MetadataValue(atomType string, dataType uint32, value []byte, parsed *localParsedTags) {
	switch atomType {
	case "\xa9nam":
		if parsed.Title == "" {
			parsed.Title = decodeMP4StringData(value)
		}
	case "\xa9ART", "aART":
		if parsed.Artist == "" {
			parsed.Artist = decodeMP4StringData(value)
		}
	case "\xa9alb":
		if parsed.Album == "" {
			parsed.Album = decodeMP4StringData(value)
		}
	case "trkn":
		if parsed.TrackNumber == 0 || parsed.TrackTotal == 0 {
			parsed.TrackNumber, parsed.TrackTotal = parseMP4IndexPair(value, parsed.TrackNumber, parsed.TrackTotal)
		}
	case "disk":
		if parsed.DiscNumber == 0 || parsed.DiscTotal == 0 {
			parsed.DiscNumber, parsed.DiscTotal = parseMP4IndexPair(value, parsed.DiscNumber, parsed.DiscTotal)
		}
	case "\xa9gen":
		if len(parsed.Genres) == 0 {
			parsed.Genres = splitTagList(decodeMP4StringData(value))
		}
	case "\xa9wrt":
		if parsed.Composer == "" {
			parsed.Composer = decodeMP4StringData(value)
		}
	case "\xa9day":
		if parsed.ReleaseDate == nil {
			parsed.ReleaseDate = parseTagReleaseDate(decodeMP4StringData(value))
		}
	case "\xa9lyr":
		lyrics := decodeMP4StringData(value)
		if lyrics != "" {
			parsed.LyricsPresent = true
			if parsed.LyricsText == "" {
				parsed.LyricsText = lyrics
				parsed.LyricsFormat = detectLocalLyricsFormat(lyrics)
			}
		}
	case "covr":
		if len(parsed.ArtworkData) == 0 {
			parsed.ArtworkMIME = mp4ArtworkMIME(dataType)
			if parsed.ArtworkMIME != "" && len(value) > 0 {
				parsed.ArtworkData = append([]byte(nil), value...)
			}
		}
	}
}

func decodeMP4StringData(value []byte) string {
	if len(value) == 0 {
		return ""
	}
	if len(value) >= 2 && ((value[0] == 0xff && value[1] == 0xfe) || (value[0] == 0xfe && value[1] == 0xff)) {
		return strings.TrimSpace(strings.Trim(decodeTextEncoding(1, value), "\x00"))
	}
	return strings.TrimSpace(strings.Trim(string(value), "\x00"))
}

func parseMP4IndexPair(value []byte, currentNumber, currentTotal int) (int, int) {
	if len(value) < 6 {
		return currentNumber, currentTotal
	}
	if currentNumber == 0 {
		currentNumber = int(binary.BigEndian.Uint16(value[2:4]))
	}
	if currentTotal == 0 && len(value) >= 6 {
		currentTotal = int(binary.BigEndian.Uint16(value[4:6]))
	}
	return currentNumber, currentTotal
}

func mp4ArtworkMIME(dataType uint32) string {
	switch dataType {
	case 13:
		return "image/jpeg"
	case 14:
		return "image/png"
	default:
		return ""
	}
}

func parseFLACPicture(block []byte) (string, []byte) {
	if len(block) < 32 {
		return "", nil
	}
	offset := 0
	offset += 4
	if offset+4 > len(block) {
		return "", nil
	}
	mimeLen := int(binary.BigEndian.Uint32(block[offset : offset+4]))
	offset += 4
	if offset+mimeLen > len(block) {
		return "", nil
	}
	mime := string(block[offset : offset+mimeLen])
	offset += mimeLen
	if offset+4 > len(block) {
		return "", nil
	}
	descLen := int(binary.BigEndian.Uint32(block[offset : offset+4]))
	offset += 4 + descLen
	if offset+20 > len(block) {
		return "", nil
	}
	offset += 16
	dataLen := int(binary.BigEndian.Uint32(block[offset : offset+4]))
	offset += 4
	if offset+dataLen > len(block) {
		return "", nil
	}
	return mime, append([]byte(nil), block[offset:offset+dataLen]...)
}

func parsePositionFrame(value string, currentNumber, currentTotal int) (int, int) {
	value = strings.TrimSpace(value)
	if value == "" {
		return currentNumber, currentTotal
	}
	parts := strings.SplitN(value, "/", 2)
	if currentNumber == 0 {
		if number, err := strconv.Atoi(strings.TrimSpace(parts[0])); err == nil {
			currentNumber = number
		}
	}
	if len(parts) == 2 && currentTotal == 0 {
		if total, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
			currentTotal = total
		}
	}
	return currentNumber, currentTotal
}

func parseTagReleaseDate(value string) *time.Time {
	value = strings.TrimSpace(strings.Trim(value, "\x00"))
	if value == "" {
		return nil
	}

	layouts := []string{"2006-01-02", "2006-01", "2006"}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return &parsed
		}
	}
	return nil
}

func splitTagList(value string) []string {
	if value == "" {
		return nil
	}
	separators := []string{";", "/", ","}
	for _, separator := range separators {
		if strings.Contains(value, separator) {
			parts := strings.Split(value, separator)
			items := make([]string, 0, len(parts))
			for _, part := range parts {
				part = strings.TrimSpace(part)
				if part != "" {
					items = append(items, part)
				}
			}
			return items
		}
	}
	return []string{strings.TrimSpace(value)}
}

func parseAPIC(frameData []byte) (string, []byte) {
	if len(frameData) < 4 {
		return "", nil
	}
	encoding := frameData[0]
	payload := frameData[1:]
	mime, consumed := readNullTerminatedISO88591(payload)
	if consumed == 0 || consumed >= len(payload) {
		return "", nil
	}
	payload = payload[consumed:]
	if len(payload) == 0 {
		return "", nil
	}
	payload = payload[1:]
	descriptionLen := nullTerminatedLength(payload, encoding)
	if descriptionLen > len(payload) {
		return "", nil
	}
	payload = payload[descriptionLen:]
	if len(payload) == 0 {
		return "", nil
	}
	return mime, append([]byte(nil), payload...)
}

func parseUnsynchronizedLyricsFrame(frameData []byte) string {
	if len(frameData) < 4 {
		return ""
	}
	encoding := frameData[0]
	payload := frameData[4:]
	descriptionLen := nullTerminatedLength(payload, encoding)
	if descriptionLen > len(payload) {
		return ""
	}
	return strings.TrimSpace(strings.Trim(decodeTextEncoding(encoding, payload[descriptionLen:]), "\x00"))
}

func decodeID3TextFrame(frameData []byte) string {
	if len(frameData) == 0 {
		return ""
	}
	encoding := frameData[0]
	return strings.TrimSpace(strings.Trim(decodeTextEncoding(encoding, frameData[1:]), "\x00"))
}

func decodeTextEncoding(encoding byte, data []byte) string {
	switch encoding {
	case 0:
		return strings.TrimRight(string(data), "\x00")
	case 1:
		if len(data) >= 2 {
			if bytes.Equal(data[:2], []byte{0xff, 0xfe}) {
				return decodeUTF16(data[2:], binary.LittleEndian)
			}
			if bytes.Equal(data[:2], []byte{0xfe, 0xff}) {
				return decodeUTF16(data[2:], binary.BigEndian)
			}
		}
		return decodeUTF16(data, binary.BigEndian)
	case 2:
		return decodeUTF16(data, binary.BigEndian)
	case 3:
		return strings.TrimRight(string(data), "\x00")
	default:
		return strings.TrimRight(string(data), "\x00")
	}
}

func decodeUTF16(data []byte, order binary.ByteOrder) string {
	if len(data)%2 != 0 {
		data = data[:len(data)-1]
	}
	codeUnits := make([]uint16, 0, len(data)/2)
	for i := 0; i+1 < len(data); i += 2 {
		value := order.Uint16(data[i : i+2])
		if value == 0 {
			continue
		}
		codeUnits = append(codeUnits, value)
	}
	return string(utf16.Decode(codeUnits))
}

func syncSafeInt(data []byte) int {
	if len(data) != 4 {
		return 0
	}
	return int(data[0]&0x7f)<<21 | int(data[1]&0x7f)<<14 | int(data[2]&0x7f)<<7 | int(data[3]&0x7f)
}

func removeUnsynchronization(data []byte) []byte {
	result := make([]byte, 0, len(data))
	for i := 0; i < len(data); i++ {
		if i+1 < len(data) && data[i] == 0xff && data[i+1] == 0x00 {
			result = append(result, 0xff)
			i++
			continue
		}
		result = append(result, data[i])
	}
	return result
}

func trimID3String(data []byte) string {
	return strings.TrimSpace(strings.Trim(string(bytes.Trim(data, "\x00 ")), "\x00"))
}

func readNullTerminatedISO88591(data []byte) (string, int) {
	for i, value := range data {
		if value == 0x00 {
			return string(data[:i]), i + 1
		}
	}
	return string(data), len(data)
}

func nullTerminatedLength(data []byte, encoding byte) int {
	switch encoding {
	case 1, 2:
		for i := 0; i+1 < len(data); i += 2 {
			if data[i] == 0x00 && data[i+1] == 0x00 {
				return i + 2
			}
		}
		return len(data)
	default:
		for i, value := range data {
			if value == 0x00 {
				return i + 1
			}
		}
		return len(data)
	}
}

func artworkExtensionFromMIME(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/webp":
		return ".webp"
	case "image/gif":
		return ".gif"
	default:
		return ".jpg"
	}
}

func dataURIForArtwork(mime string, data []byte) string {
	if len(data) == 0 {
		return ""
	}
	if mime == "" {
		mime = "image/jpeg"
	}
	return fmt.Sprintf("data:%s;base64,%s", mime, base64.StdEncoding.EncodeToString(data))
}
