import { describe, expect, it } from 'vitest';
import {
  formatAudioBitrate,
  formatAudioBitDepth,
  formatAudioCodecLabel,
  formatAudioInfoSummary,
} from './audioInfo';

describe('formatAudioInfoSummary', () => {
  it('formats local lossless audio info into a compact summary', () => {
    expect(
      formatAudioInfoSummary({
        codec: 'alac',
        container: 'mp4',
        bitrate: 921600,
        sampleRate: 44100,
        channels: 2,
      })
    ).toBe('ALAC · 922 kbps · 44.1 kHz · Stereo');
  });

  it('falls back to container label when codec is missing', () => {
    expect(
      formatAudioInfoSummary({
        container: 'mp4',
        sampleRate: 48000,
      })
    ).toBe('M4A · 48 kHz');
  });

  it('formats codec and bitrate independently for targeted UI placement', () => {
    expect(formatAudioCodecLabel('alac', 'mp4')).toBe('ALAC');
    expect(formatAudioBitrate(921600)).toBe('922 kbps');
    expect(formatAudioBitDepth(24)).toBe('24-bit');
  });
});
