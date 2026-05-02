package services

import (
	"path/filepath"
	"strings"

	"main/models"
)

type localSourceQualityClass string

const (
	localSourceQualityLossless localSourceQualityClass = "lossless"
	localSourceQualityLossy    localSourceQualityClass = "lossy"
	localSourceQualityUnknown  localSourceQualityClass = "unknown"
)

func normalizeAudioCodec(codec string) string {
	normalized := strings.ToLower(strings.TrimSpace(codec))
	normalized = strings.Trim(normalized, "\"")
	switch normalized {
	case "mp4a.40.2":
		return "aac"
	case "pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_s64le",
		"pcm_f32le", "pcm_f64le",
		"pcm_u8", "pcm_u16le", "pcm_u24le", "pcm_u32le":
		return "pcm"
	default:
		return normalized
	}
}

func classifyLocalSourceQuality(codec string) localSourceQualityClass {
	switch normalizeAudioCodec(codec) {
	case "alac", "apple lossless", "flac", "pcm", "wavpack", "ape":
		return localSourceQualityLossless
	case "aac", "mp3", "vorbis", "opus", "ogg", "ac3", "eac3":
		return localSourceQualityLossy
	default:
		return localSourceQualityUnknown
	}
}

func codecHintForFile(file *models.LocalMediaFile) string {
	if file == nil {
		return ""
	}
	if file.Codec != "" {
		return file.Codec
	}

	switch strings.ToLower(filepath.Ext(file.AbsolutePath)) {
	case ".alac":
		return "alac"
	case ".mp3":
		return "mp3"
	case ".flac":
		return "flac"
	case ".aac":
		return "aac"
	case ".wav":
		return "pcm"
	}
	return ""
}

func localAudioContainerIsAmbiguous(file *models.LocalMediaFile) bool {
	if file == nil {
		return false
	}

	ext := strings.ToLower(filepath.Ext(file.AbsolutePath))
	if ext == ".m4a" || ext == ".mp4" || ext == ".m4b" || ext == ".m4p" || ext == ".alac" {
		return true
	}

	container := strings.ToLower(strings.TrimSpace(file.Container))
	mimeType := strings.ToLower(strings.TrimSpace(file.MIMEType))
	return container == "mp4" || mimeType == "audio/mp4"
}

func localAudioProbeEvidenceAvailable(file *models.LocalMediaFile) bool {
	if file == nil {
		return false
	}
	return file.Bitrate > 0 || file.SampleRate > 0 || file.Channels > 0
}

func localSourceQualityNeedsProbe(file *models.LocalMediaFile, codec string) bool {
	if file == nil {
		return false
	}

	if normalizeAudioCodec(codec) == "" {
		return true
	}

	if localAudioContainerIsAmbiguous(file) && !localAudioProbeEvidenceAvailable(file) {
		return true
	}

	return false
}

func localSourceQualityClassFromFile(file *models.LocalMediaFile) localSourceQualityClass {
	if file == nil {
		return localSourceQualityUnknown
	}

	codec := normalizeAudioCodec(codecHintForFile(file))
	if localAudioContainerIsAmbiguous(file) && localSourceQualityNeedsProbe(file, codec) {
		return localSourceQualityUnknown
	}

	return classifyLocalSourceQuality(codec)
}

func localAudioInfoNeedsCodecProbe(file *models.LocalMediaFile) bool {
	return localSourceQualityNeedsProbe(file, codecHintForFile(file))
}

func localAudioInfoNeedsProbe(file *models.LocalMediaFile, codec string, bitrate, bitDepth, sampleRate, channels int) bool {
	_ = bitrate
	_ = bitDepth
	_ = sampleRate
	_ = channels
	return localSourceQualityNeedsProbe(file, codec)
}

func localAudioInfoNeedsLosslessDetailProbe(codec string, bitrate, bitDepth, sampleRate, channels int) bool {
	if classifyLocalSourceQuality(codec) != localSourceQualityLossless {
		return false
	}

	return bitrate <= 0 || bitDepth <= 0 || sampleRate <= 0 || channels <= 0
}

func fileNeedsCodecProbe(file *models.LocalMediaFile) bool {
	return localSourceQualityNeedsProbe(file, codecHintForFile(file))
}

func fileHasAmbiguousBrowserSupport(file *models.LocalMediaFile) bool {
	return localAudioContainerIsAmbiguous(file)
}
