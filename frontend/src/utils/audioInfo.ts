import type { SongDetail } from '../types';

type AudioInfo = SongDetail['audioInfo'];

export function formatAudioCodecLabel(codec?: string, container?: string): string | null {
  const normalizedCodec = codec?.trim().toLowerCase();
  if (normalizedCodec) {
    switch (normalizedCodec) {
      case 'alac':
        return 'ALAC';
      case 'aac':
        return 'AAC';
      case 'flac':
        return 'FLAC';
      case 'mp3':
        return 'MP3';
      case 'pcm':
        return 'PCM';
      case 'vorbis':
        return 'Vorbis';
      default:
        return normalizedCodec.toUpperCase();
    }
  }

  const normalizedContainer = container?.trim().toLowerCase();
  if (!normalizedContainer) {
    return null;
  }

  switch (normalizedContainer) {
    case 'mp4':
      return 'M4A';
    default:
      return normalizedContainer.toUpperCase();
  }
}

export function formatAudioBitrate(bitrate?: number): string | null {
  if (!bitrate || bitrate <= 0) {
    return null;
  }

  if (bitrate >= 1000 * 1000) {
    const value = bitrate / (1000 * 1000);
    return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} Mbps`;
  }

  return `${Math.round(bitrate / 1000)} kbps`;
}

export function formatAudioBitDepth(bitDepth?: number): string | null {
  if (!bitDepth || bitDepth <= 0) {
    return null;
  }

  return `${Math.round(bitDepth)}-bit`;
}

export function formatAudioSampleRate(sampleRate?: number): string | null {
  if (!sampleRate || sampleRate <= 0) {
    return null;
  }

  const value = sampleRate / 1000;
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} kHz`;
}

export function formatAudioChannels(channels?: number): string | null {
  if (!channels || channels <= 0) {
    return null;
  }

  switch (channels) {
    case 1:
      return 'Mono';
    case 2:
      return 'Stereo';
    default:
      return `${channels} ch`;
  }
}

export function formatAudioInfoSummary(audioInfo?: AudioInfo | null): string | null {
  if (!audioInfo) {
    return null;
  }

  const parts = [
    formatAudioCodecLabel(audioInfo.codec, audioInfo.container),
    formatAudioBitrate(audioInfo.bitrate),
    formatAudioSampleRate(audioInfo.sampleRate),
    formatAudioChannels(audioInfo.channels),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : null;
}
