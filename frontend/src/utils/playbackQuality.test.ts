import { describe, expect, it } from "vitest";
import {
  buildPlaybackStreamUrl,
  DESKTOP_TRANSCODE_OPTIONS,
  DOWNLOAD_AUDIO_QUALITY_KEY,
  getConfiguredPlaybackOutputMeta,
  loadDownloadAudioQuality,
  getDesktopPlaybackOutputMeta,
  getPlaybackOutputShortLabel,
  getPlaybackOutputMetaFromUrl,
  getDesktopTranscodeOption,
  mapIOSHLSQualityToQuery,
  normalizePlaybackStreamUrl,
  resolvePlaybackActualOutputState,
  resolvePlaybackBitrateLabel,
  resolveDownloadAudioTranscode,
  resolvePlaybackQualityDetailLabel,
  resolvePlaybackOutputLabel,
  resolvePlaybackOriginalSourceSummaryLabel,
  resolvePlaybackSummaryLabel,
  saveDownloadAudioQuality,
} from "./playbackQuality";

describe("playbackQuality", () => {
  it("adds HLS quality params on desktop and android", () => {
    expect(
      buildPlaybackStreamUrl(
        "/api/stream/12/playlist.m3u8?quality=aac_256",
        "desktop",
        "aac320",
      ),
    ).toBe("/api/stream/12/playlist.m3u8?quality=aac_320");
    expect(
      buildPlaybackStreamUrl(
        "/api/stream/12/playlist.m3u8?quality=aac_256",
        "android",
        "aac320",
      ),
    ).toBe("/api/stream/12/playlist.m3u8?quality=aac_320");
    expect(
      buildPlaybackStreamUrl(
        "/api/stream/12/playlist.m3u8?quality=aac_320",
        "ios",
        "aac320",
      ),
    ).toBe("/api/stream/12/playlist.m3u8?quality=aac_320");
  });

  it("uses AAC 256 HLS for the default desktop quality mode", () => {
    expect(
      buildPlaybackStreamUrl("/api/stream/12/playlist.m3u8", "desktop", "auto"),
    ).toBe("/api/stream/12/playlist.m3u8?quality=aac_256");
  });

  it("normalizes cache-busting URLs for comparison", () => {
    expect(
      normalizePlaybackStreamUrl(
        "/api/stream/12/playlist.m3u8?quality=lossless&t=123",
      ),
    ).toBe("/api/stream/12/playlist.m3u8?quality=lossless");
    expect(
      normalizePlaybackStreamUrl(
        "/api/stream/12/playlist.m3u8?quality=aac_256&_t=123",
      ),
    ).toBe("/api/stream/12/playlist.m3u8?quality=aac_256");
  });

  it("returns metadata for the selected desktop HLS option", () => {
    expect(getDesktopTranscodeOption("flac").label).toBe("无损优先");
  });

  it("loads and saves offline download audio quality preferences", () => {
    localStorage.removeItem(DOWNLOAD_AUDIO_QUALITY_KEY);
    expect(loadDownloadAudioQuality()).toBe("aac256");

    saveDownloadAudioQuality("aac192");

    expect(loadDownloadAudioQuality()).toBe("aac192");
  });

  it("shows lossless first for desktop and android quality lists", () => {
    expect(DESKTOP_TRANSCODE_OPTIONS[0]?.value).toBe("flac");
    expect(DESKTOP_TRANSCODE_OPTIONS[1]?.value).toBe("aac320");
    expect(DESKTOP_TRANSCODE_OPTIONS[2]?.value).toBe("auto");
  });

  it("maps iOS HLS quality selections to stream query values", () => {
    expect(mapIOSHLSQualityToQuery("lossless")).toBe("lossless");
    expect(mapIOSHLSQualityToQuery("aac320")).toBe("aac_320");
    expect(mapIOSHLSQualityToQuery("aac256")).toBe("aac_256");
    expect(mapIOSHLSQualityToQuery("aac192")).toBe("aac_192");
  });

  it("resolves offline download transcode profiles with safe lossless fallback", () => {
    expect(resolveDownloadAudioTranscode("aac320")).toBe("aac_320");
    expect(resolveDownloadAudioTranscode("aac256")).toBe("aac_256");
    expect(
      resolveDownloadAudioTranscode("lossless", {
        codec: "flac",
        sampleRate: 96000,
      }),
    ).toBe("flac");
    expect(
      resolveDownloadAudioTranscode("lossless", {
        codec: "aac",
        bitrate: 320000,
      }),
    ).toBe("aac_320");
    expect(resolveDownloadAudioTranscode("lossless")).toBeNull();
  });

  it("derives displayed playback output for desktop HLS modes", () => {
    expect(
      getDesktopPlaybackOutputMeta("auto", { codec: "alac", container: "mp4" }),
    ).toEqual({
      label: "AAC 256 kbps",
      bitrateLabel: "256 kbps",
      isLossless: false,
    });
    expect(
      getDesktopPlaybackOutputMeta("flac", {
        codec: "flac",
        container: "flac",
      }),
    ).toEqual({
      label: "FLAC",
      bitrateLabel: "无损",
      isLossless: true,
    });
    expect(getDesktopPlaybackOutputMeta("aac320", { codec: "alac" })).toEqual({
      label: "AAC 320 kbps",
      bitrateLabel: "320 kbps",
      isLossless: false,
    });
  });

  it("derives playback output metadata from active playback URLs", () => {
    expect(
      getPlaybackOutputMetaFromUrl(
        "/api/stream/12/playlist.m3u8?quality=lossless&token=test",
      ),
    ).toEqual({
      label: null,
      bitrateLabel: null,
      isLossless: null,
    });
    expect(
      getPlaybackOutputMetaFromUrl("blob:http://localhost/mock-audio-source"),
    ).toEqual({
      label: null,
      bitrateLabel: null,
      isLossless: null,
    });
    expect(
      getPlaybackOutputMetaFromUrl("/api/stream/12?transcode=flac"),
    ).toEqual({
      label: "FLAC",
      bitrateLabel: "无损",
      isLossless: true,
    });
  });

  it("returns configured playback output for the active platform", () => {
    expect(getConfiguredPlaybackOutputMeta("ios", "flac", "aac192")).toEqual({
      label: "AAC 192 kbps",
      bitrateLabel: "192 kbps",
      isLossless: false,
    });
    expect(
      getConfiguredPlaybackOutputMeta("android", "flac", "aac192"),
    ).toEqual({
      label: "FLAC",
      bitrateLabel: "无损",
      isLossless: true,
    });
  });

  it("resolves mobile now playing labels from the active playback source first", () => {
    expect(
      resolvePlaybackOutputLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=aac_320",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
      }),
    ).toBe("AAC 320 kbps");
    expect(
      resolvePlaybackOutputLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "aac192",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "aac",
          bitrate: 320000,
        },
      }),
    ).toBe("AAC 320 kbps");
  });

  it("resolves lossless quality detail labels using sample rate when available", () => {
    expect(
      resolvePlaybackQualityDetailLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=lossless",
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "flac",
          bitrate: 921600,
          sampleRate: 48000,
        },
      }),
    ).toBe("48 kHz / 922 kbps");
    expect(
      resolvePlaybackQualityDetailLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "alac",
          bitDepth: 24,
          sampleRate: 48000,
          bitrate: 2304000,
        },
      }),
    ).toBe("24-bit / 48 kHz / 2.3 Mbps");
  });

  it("keeps lossy mobile now playing labels as fixed output bitrates", () => {
    expect(
      resolvePlaybackBitrateLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=aac_320",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
      }),
    ).toBe("320 kbps");
    expect(
      resolvePlaybackBitrateLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "aac192",
        iosHlsQuality: "aac256",
      }),
    ).toBe("256 kbps");
  });

  it("keeps lossless intent neutral until actual output can be resolved", () => {
    expect(
      resolvePlaybackOutputLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
      }),
    ).toBeNull();
    expect(
      resolvePlaybackQualityDetailLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
      }),
    ).toBeNull();
  });

  it("builds mobile now playing output summaries without original source labels", () => {
    expect(
      resolvePlaybackSummaryLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "alac",
          bitDepth: 24,
          sampleRate: 48000,
          bitrate: 2304000,
        },
      }),
    ).toBe("FLAC · 24-bit · 48 kHz");
    expect(
      resolvePlaybackSummaryLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=lossless",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "alac",
          bitDepth: 24,
          sampleRate: 96000,
          bitrate: 4608000,
        },
      }),
    ).toBe("FLAC · 24-bit · 96 kHz");
    expect(
      resolvePlaybackSummaryLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=aac_320",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "alac",
          bitDepth: 24,
          sampleRate: 48000,
        },
      }),
    ).toBe("AAC 320");
    expect(
      resolvePlaybackSummaryLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=aac_320",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "aac",
          bitrate: 320000,
        },
      }),
    ).toBe("AAC 320");
    expect(
      resolvePlaybackSummaryLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
      }),
    ).toBeNull();
  });

  it("exposes original source summaries only when playback output changed", () => {
    expect(
      resolvePlaybackOriginalSourceSummaryLabel({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "alac",
          bitDepth: 24,
          sampleRate: 48000,
          bitrate: 2304000,
        },
      }),
    ).toBe("源文件 · ALAC · 24-bit · 48 kHz");
    expect(
      resolvePlaybackOriginalSourceSummaryLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=aac_320",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "aac",
          bitrate: 320000,
          sampleRate: 44100,
        },
      }),
    ).toBeNull();
    expect(
      resolvePlaybackOriginalSourceSummaryLabel({
        sourceUrl: "/api/stream/12/playlist.m3u8?quality=aac_320",
        platform: "android",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "lossless",
        audioInfo: {
          codec: "mp3",
          bitrate: 192000,
          sampleRate: 44100,
        },
      }),
    ).toBe("源文件 · MP3 · 44.1 kHz");
  });

  it("mirrors backend fallback rules for lossless requests on lossy and unknown sources", () => {
    expect(
      resolvePlaybackActualOutputState({
        sourceUrl: null,
        platform: "desktop",
        desktopTranscodeQuality: "flac",
        iosHlsQuality: "aac256",
        audioInfo: {
          codec: "aac",
          bitrate: 320000,
        },
      }),
    ).toMatchObject({
      requestedQuality: "lossless",
      actualVariant: "aac_320",
      sourceQualityClass: "lossy",
      isDowngraded: true,
      isLossless: false,
      fallbackReason: "source_lossy",
      resolution: "mirrored",
    });
    expect(
      resolvePlaybackActualOutputState({
        sourceUrl: null,
        platform: "ios",
        desktopTranscodeQuality: "auto",
        iosHlsQuality: "lossless",
        audioInfo: {
          bitrate: 0,
        },
      }),
    ).toMatchObject({
      requestedQuality: "lossless",
      actualVariant: "aac_256",
      sourceQualityClass: "unknown",
      isDowngraded: true,
      isLossless: false,
      fallbackReason: "source_unknown",
      resolution: "mirrored",
    });
  });

  it("exposes compact short labels for actual output state", () => {
    expect(
      getPlaybackOutputShortLabel(
        resolvePlaybackActualOutputState({
          sourceUrl: null,
          platform: "desktop",
          desktopTranscodeQuality: "flac",
          iosHlsQuality: "aac256",
          audioInfo: {
            codec: "aac",
            bitrate: 192000,
          },
        }),
      ),
    ).toBe("AAC 192");
    expect(
      getPlaybackOutputShortLabel(
        resolvePlaybackActualOutputState({
          sourceUrl: null,
          platform: "ios",
          desktopTranscodeQuality: "auto",
          iosHlsQuality: "lossless",
        }),
      ),
    ).toBe("待定");
  });
});
