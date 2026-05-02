import type { SongDetail } from "../types";
import type { Platform } from "./audioSession";
import type { HLSQualityMode } from "./streamUrl";
import {
  formatAudioCodecLabel,
  formatAudioBitDepth,
  formatAudioBitrate,
  formatAudioSampleRate,
} from "./audioInfo";

export type DesktopTranscodeQuality = "auto" | "flac" | "aac320" | "aac192";
export type IOSHLSQuality = "lossless" | "aac320" | "aac256" | "aac192";
export type MobilePlaybackQuality = IOSHLSQuality;
export type DownloadAudioQuality = MobilePlaybackQuality;
export type DirectDownloadTranscode =
  | "flac"
  | "aac_320"
  | "aac_256"
  | "aac_192"
  | null;

export interface DesktopTranscodeOption {
  value: DesktopTranscodeQuality;
  shortLabel: string;
  label: string;
  description?: string;
}

export interface IOSHLSQualityOption {
  value: IOSHLSQuality;
  shortLabel: string;
  label: string;
  description?: string;
}

export const DESKTOP_TRANSCODE_QUALITY_KEY = "owl-desktop-transcode-quality";
export const IOS_HLS_QUALITY_KEY = "owl-ios-hls-quality";
export const DOWNLOAD_AUDIO_QUALITY_KEY = "owl-download-audio-quality";
const DEFAULT_DESKTOP_TRANSCODE_QUALITY: DesktopTranscodeQuality = "auto";
const DEFAULT_DOWNLOAD_AUDIO_QUALITY: DownloadAudioQuality = "aac256";

export const DESKTOP_TRANSCODE_OPTIONS: DesktopTranscodeOption[] = [
  {
    value: "flac",
    shortLabel: "无损优先",
    label: "无损优先",
  },
  {
    value: "aac320",
    shortLabel: "AAC 320",
    label: "AAC 320 kbps",
  },
  {
    value: "auto",
    shortLabel: "AAC 256",
    label: "AAC 256 kbps",
  },
  {
    value: "aac192",
    shortLabel: "AAC 192",
    label: "AAC 192 kbps",
  },
];

export const IOS_HLS_QUALITY_OPTIONS: IOSHLSQualityOption[] = [
  {
    value: "lossless",
    shortLabel: "无损优先",
    label: "无损优先",
  },
  {
    value: "aac320",
    shortLabel: "AAC 320",
    label: "AAC 320 kbps",
  },
  {
    value: "aac256",
    shortLabel: "AAC 256",
    label: "AAC 256 kbps",
  },
  {
    value: "aac192",
    shortLabel: "AAC 192",
    label: "AAC 192 kbps",
  },
];

export const MOBILE_PLAYBACK_QUALITY_OPTIONS = IOS_HLS_QUALITY_OPTIONS;

const DESKTOP_TRANSCODE_QUERY_MAP: Record<DesktopTranscodeQuality, string> = {
  auto: "aac_256",
  flac: "lossless",
  aac320: "aac_320",
  aac192: "aac_192",
};

const IOS_HLS_QUALITY_QUERY_MAP: Record<IOSHLSQuality, HLSQualityMode> = {
  lossless: "lossless",
  aac320: "aac_320",
  aac256: "aac_256",
  aac192: "aac_192",
};

export interface PlaybackOutputMeta {
  label: string | null;
  bitrateLabel: string | null;
  isLossless: boolean | null;
}

export type PlaybackSourceQualityClass = "lossless" | "lossy" | "unknown";

export interface PlaybackActualOutputState {
  requestedQuality: string | null;
  actualVariant: string | null;
  sourceQualityClass: PlaybackSourceQualityClass | null;
  isDowngraded: boolean;
  isLossless: boolean | null;
  fallbackReason: string | null;
  resolution: "confirmed" | "mirrored" | "intent" | "unknown";
}

export type DesktopPlaybackOutputMeta = PlaybackOutputMeta;

const UNKNOWN_PLAYBACK_OUTPUT_META: PlaybackOutputMeta = {
  label: null,
  bitrateLabel: null,
  isLossless: null,
};

const PLAYBACK_OUTPUT_META_BY_QUERY: Record<string, PlaybackOutputMeta> = {
  lossless: { label: "FLAC", bitrateLabel: "无损", isLossless: true },
  flac: { label: "FLAC", bitrateLabel: "无损", isLossless: true },
  aac_320: {
    label: "AAC 320 kbps",
    bitrateLabel: "320 kbps",
    isLossless: false,
  },
  aac_256: {
    label: "AAC 256 kbps",
    bitrateLabel: "256 kbps",
    isLossless: false,
  },
  aac_192: {
    label: "AAC 192 kbps",
    bitrateLabel: "192 kbps",
    isLossless: false,
  },
};

export function isDesktopTranscodeQuality(
  value: string,
): value is DesktopTranscodeQuality {
  return DESKTOP_TRANSCODE_OPTIONS.some((option) => option.value === value);
}

export function loadDesktopTranscodeQuality(): DesktopTranscodeQuality {
  try {
    const stored = localStorage.getItem(DESKTOP_TRANSCODE_QUALITY_KEY);
    if (stored && isDesktopTranscodeQuality(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage failures and use defaults.
  }

  return DEFAULT_DESKTOP_TRANSCODE_QUALITY;
}

export function isIOSHLSQuality(value: string): value is IOSHLSQuality {
  return IOS_HLS_QUALITY_OPTIONS.some((option) => option.value === value);
}

export function loadIOSHLSQuality(): IOSHLSQuality {
  try {
    const stored = localStorage.getItem(IOS_HLS_QUALITY_KEY);
    if (stored && isIOSHLSQuality(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage failures and use defaults.
  }

  return "aac256";
}

export function loadDownloadAudioQuality(): DownloadAudioQuality {
  try {
    const stored = localStorage.getItem(DOWNLOAD_AUDIO_QUALITY_KEY);
    if (stored && isIOSHLSQuality(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage failures and use defaults.
  }

  return DEFAULT_DOWNLOAD_AUDIO_QUALITY;
}

export function saveDesktopTranscodeQuality(
  value: DesktopTranscodeQuality,
): void {
  try {
    localStorage.setItem(DESKTOP_TRANSCODE_QUALITY_KEY, value);
  } catch {
    // Ignore storage failures.
  }
}

export function saveIOSHLSQuality(value: IOSHLSQuality): void {
  try {
    localStorage.setItem(IOS_HLS_QUALITY_KEY, value);
  } catch {
    // Ignore storage failures.
  }
}

export function saveDownloadAudioQuality(value: DownloadAudioQuality): void {
  try {
    localStorage.setItem(DOWNLOAD_AUDIO_QUALITY_KEY, value);
  } catch {
    // Ignore storage failures.
  }
}

export function getDesktopTranscodeOption(
  value: DesktopTranscodeQuality,
): DesktopTranscodeOption {
  return (
    DESKTOP_TRANSCODE_OPTIONS.find((option) => option.value === value) ??
    DESKTOP_TRANSCODE_OPTIONS.find(
      (option) => option.value === DEFAULT_DESKTOP_TRANSCODE_QUALITY,
    ) ??
    DESKTOP_TRANSCODE_OPTIONS[0]
  );
}

export function mapDesktopTranscodeQualityToMobilePlaybackQuality(
  value: DesktopTranscodeQuality,
): MobilePlaybackQuality {
  switch (value) {
    case "flac":
      return "lossless";
    case "aac320":
      return "aac320";
    case "aac192":
      return "aac192";
    case "auto":
    default:
      return "aac256";
  }
}

export function mapMobilePlaybackQualityToDesktopTranscodeQuality(
  value: MobilePlaybackQuality,
): DesktopTranscodeQuality {
  switch (value) {
    case "lossless":
      return "flac";
    case "aac320":
      return "aac320";
    case "aac192":
      return "aac192";
    case "aac256":
    default:
      return "auto";
  }
}

export function getIOSHLSQualityOption(
  value: IOSHLSQuality,
): IOSHLSQualityOption {
  return (
    IOS_HLS_QUALITY_OPTIONS.find((option) => option.value === value) ??
    IOS_HLS_QUALITY_OPTIONS[0]
  );
}

export function getMobilePlaybackQualityOption(
  value: MobilePlaybackQuality,
): IOSHLSQualityOption {
  return getIOSHLSQualityOption(value);
}

export function getDownloadAudioQualityOption(
  value: DownloadAudioQuality,
): IOSHLSQualityOption {
  return getIOSHLSQualityOption(value);
}

export function getMobilePlaybackQuality(
  platform: Platform,
  desktopTranscodeQuality: DesktopTranscodeQuality,
  iosHlsQuality: IOSHLSQuality,
): MobilePlaybackQuality | null {
  if (platform === "ios") {
    return iosHlsQuality;
  }

  if (platform === "android") {
    return mapDesktopTranscodeQualityToMobilePlaybackQuality(
      desktopTranscodeQuality,
    );
  }

  return null;
}

export function buildPlaybackStreamUrl(
  baseUrl: string,
  platform: Platform,
  desktopTranscodeQuality: DesktopTranscodeQuality,
): string {
  const parsed = new URL(baseUrl, "http://localhost");

  if (platform === "desktop" || platform === "android") {
    parsed.searchParams.delete("transcode");
    parsed.searchParams.set(
      "quality",
      DESKTOP_TRANSCODE_QUERY_MAP[desktopTranscodeQuality],
    );
  }

  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}`;
}

export function normalizePlaybackStreamUrl(url: string): string {
  const parsed = new URL(url, "http://localhost");
  parsed.searchParams.delete("t");
  parsed.searchParams.delete("_t");
  const query = parsed.searchParams.toString();
  return `${parsed.pathname}${query ? `?${query}` : ""}`;
}

export function mapIOSHLSQualityToQuery(value: IOSHLSQuality): HLSQualityMode {
  return IOS_HLS_QUALITY_QUERY_MAP[value];
}

type AudioInfo = SongDetail["audioInfo"];

function normalizePlaybackVariant(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "lossless":
      return "lossless";
    case "flac":
      return "flac";
    case "aac320":
    case "aac_320":
      return "aac_320";
    case "aac256":
    case "aac":
    case "aac_256":
    case "default":
      return "aac_256";
    case "aac192":
    case "aac_192":
      return "aac_192";
    default:
      return null;
  }
}

function normalizeAudioCodecForQuality(codec?: string | null): string | null {
  if (!codec) {
    return null;
  }

  const normalized = codec.trim().toLowerCase();
  switch (normalized) {
    case "mp4a.40.2":
      return "aac";
    case "pcm_s16le":
    case "pcm_s24le":
    case "pcm_s32le":
    case "pcm_s64le":
    case "pcm_f32le":
    case "pcm_f64le":
    case "pcm_u8":
    case "pcm_u16le":
    case "pcm_u24le":
    case "pcm_u32le":
      return "pcm";
    default:
      return normalized;
  }
}

function classifyPlaybackSourceQuality(
  audioInfo?: AudioInfo | null,
): PlaybackSourceQualityClass | null {
  if (!audioInfo) {
    return null;
  }

  switch (normalizeAudioCodecForQuality(audioInfo.codec)) {
    case "alac":
    case "apple lossless":
    case "flac":
    case "pcm":
    case "wavpack":
    case "ape":
      return "lossless";
    case "aac":
    case "mp3":
    case "vorbis":
    case "opus":
    case "ogg":
    case "ac3":
    case "eac3":
      return "lossy";
    default:
      return "unknown";
  }
}

function resolveLossyFallbackPlaybackVariant(
  bitrate?: number | null,
): "aac_320" | "aac_256" | "aac_192" {
  if (!bitrate || bitrate <= 0) {
    return "aac_256";
  }
  if (bitrate >= 320000) {
    return "aac_320";
  }
  if (bitrate >= 256000) {
    return "aac_256";
  }
  return "aac_192";
}

function mapPlaybackVariantToDirectDownloadTranscode(
  value: "lossless" | "flac" | "aac_320" | "aac_256" | "aac_192" | null,
): DirectDownloadTranscode {
  switch (value) {
    case "lossless":
    case "flac":
      return "flac";
    case "aac_320":
      return "aac_320";
    case "aac_256":
      return "aac_256";
    case "aac_192":
      return "aac_192";
    default:
      return null;
  }
}

export function resolveDownloadAudioTranscode(
  value: DownloadAudioQuality,
  audioInfo?: AudioInfo | null,
): DirectDownloadTranscode {
  switch (value) {
    case "lossless": {
      const sourceQualityClass = classifyPlaybackSourceQuality(audioInfo);
      if (sourceQualityClass === "lossless") {
        return "flac";
      }
      if (!audioInfo) {
        return null;
      }
      return mapPlaybackVariantToDirectDownloadTranscode(
        resolveLossyFallbackPlaybackVariant(audioInfo.bitrate),
      );
    }
    case "aac320":
      return "aac_320";
    case "aac256":
      return "aac_256";
    case "aac192":
      return "aac_192";
    default:
      return null;
  }
}

function getConfiguredRequestedQuality(
  platform: Platform,
  desktopTranscodeQuality: DesktopTranscodeQuality,
  iosHlsQuality: IOSHLSQuality,
): string | null {
  if (platform === "ios") {
    return normalizePlaybackVariant(mapIOSHLSQualityToQuery(iosHlsQuality));
  }
  if (platform === "desktop" || platform === "android") {
    return normalizePlaybackVariant(
      DESKTOP_TRANSCODE_QUERY_MAP[desktopTranscodeQuality],
    );
  }
  return null;
}

function getRequestedQualityFromUrl(url?: string | null): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url, "http://localhost");
    return normalizePlaybackVariant(
      parsed.searchParams.get("quality") ??
        parsed.searchParams.get("transcode"),
    );
  } catch {
    const match = url.match(/[?&](?:quality|transcode)=([^&#]+)/i);
    if (!match) {
      return null;
    }
    try {
      return normalizePlaybackVariant(decodeURIComponent(match[1]));
    } catch {
      return normalizePlaybackVariant(match[1]);
    }
  }
}

function getConfirmedActualVariantFromUrl(
  url?: string | null,
  sourceQualityClass?: PlaybackSourceQualityClass | null,
): string | null {
  const parsed = getRequestedQualityFromUrl(url);
  switch (parsed) {
    case "aac_320":
    case "aac_256":
    case "aac_192":
    case "flac":
      return parsed;
    case "lossless":
      return sourceQualityClass === "lossless" ? "lossless" : null;
    default:
      return null;
  }
}

function formatLosslessPlaybackDetail(
  audioInfo?: AudioInfo | null,
): string | null {
  const sampleRateLabel = formatAudioSampleRate(audioInfo?.sampleRate);
  const bitDepthLabel = formatAudioBitDepth(audioInfo?.bitDepth);
  const bitrateLabel = formatAudioBitrate(audioInfo?.bitrate);
  const parts = [bitDepthLabel, sampleRateLabel, bitrateLabel].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : null;
}

function formatLosslessPlaybackSummary(
  state: PlaybackActualOutputState,
  audioInfo?: AudioInfo | null,
): string | null {
  if (!state.isLossless) {
    return null;
  }

  const codecLabel = formatAudioCodecLabel(
    state.actualVariant === "lossless" || state.actualVariant === "flac"
      ? "flac"
      : audioInfo?.codec,
    audioInfo?.container,
  );
  const bitDepthLabel = formatAudioBitDepth(audioInfo?.bitDepth);
  const sampleRateLabel = formatAudioSampleRate(audioInfo?.sampleRate);
  const parts = [codecLabel, bitDepthLabel, sampleRateLabel].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function getPlaybackOutputMetaFromQueryValue(
  value?: string | null,
): PlaybackOutputMeta {
  if (!value) {
    return UNKNOWN_PLAYBACK_OUTPUT_META;
  }

  return (
    PLAYBACK_OUTPUT_META_BY_QUERY[value.trim().toLowerCase()] ??
    UNKNOWN_PLAYBACK_OUTPUT_META
  );
}

export function getPlaybackOutputMetaFromUrl(
  url?: string | null,
): PlaybackOutputMeta {
  return getPlaybackOutputMetaFromQueryValue(
    getConfirmedActualVariantFromUrl(url, null),
  );
}

export function getDesktopPlaybackOutputMeta(
  desktopTranscodeQuality: DesktopTranscodeQuality,
  audioInfo?: AudioInfo | null,
): PlaybackOutputMeta {
  void audioInfo;
  switch (desktopTranscodeQuality) {
    case "flac":
      return { label: "FLAC", bitrateLabel: "无损", isLossless: true };
    case "aac320":
      return {
        label: "AAC 320 kbps",
        bitrateLabel: "320 kbps",
        isLossless: false,
      };
    case "aac192":
      return {
        label: "AAC 192 kbps",
        bitrateLabel: "192 kbps",
        isLossless: false,
      };
    case "auto": {
      return {
        label: "AAC 256 kbps",
        bitrateLabel: "256 kbps",
        isLossless: false,
      };
    }
    default:
      return UNKNOWN_PLAYBACK_OUTPUT_META;
  }
}

export function getConfiguredPlaybackOutputMeta(
  platform: Platform,
  desktopTranscodeQuality: DesktopTranscodeQuality,
  iosHlsQuality: IOSHLSQuality,
  audioInfo?: AudioInfo | null,
): PlaybackOutputMeta {
  if (platform === "ios") {
    return getPlaybackOutputMetaFromQueryValue(
      mapIOSHLSQualityToQuery(iosHlsQuality),
    );
  }

  if (platform === "desktop" || platform === "android") {
    return getDesktopPlaybackOutputMeta(desktopTranscodeQuality, audioInfo);
  }

  return UNKNOWN_PLAYBACK_OUTPUT_META;
}

export function resolvePlaybackActualOutputState(options: {
  sourceUrl?: string | null;
  platform: Platform;
  desktopTranscodeQuality: DesktopTranscodeQuality;
  iosHlsQuality: IOSHLSQuality;
  audioInfo?: AudioInfo | null;
}): PlaybackActualOutputState {
  const sourceQualityClass = classifyPlaybackSourceQuality(options.audioInfo);
  const requestedFromUrl = getRequestedQualityFromUrl(options.sourceUrl);
  const requestedQuality =
    requestedFromUrl ??
    getConfiguredRequestedQuality(
      options.platform,
      options.desktopTranscodeQuality,
      options.iosHlsQuality,
    );
  const confirmedActualVariant = getConfirmedActualVariantFromUrl(
    options.sourceUrl,
    sourceQualityClass,
  );

  if (confirmedActualVariant) {
    return {
      requestedQuality: requestedQuality ?? confirmedActualVariant,
      actualVariant: confirmedActualVariant,
      sourceQualityClass,
      isDowngraded:
        (requestedQuality ?? confirmedActualVariant) === "lossless" &&
        confirmedActualVariant !== "lossless",
      isLossless:
        confirmedActualVariant === "lossless" ||
        confirmedActualVariant === "flac",
      fallbackReason:
        (requestedQuality ?? confirmedActualVariant) === "lossless" &&
        confirmedActualVariant !== "lossless"
          ? sourceQualityClass === "lossy"
            ? "source_lossy"
            : "source_unknown"
          : null,
      resolution: "confirmed",
    };
  }

  if (requestedQuality === "lossless") {
    if (!options.audioInfo) {
      return {
        requestedQuality,
        actualVariant: null,
        sourceQualityClass: null,
        isDowngraded: false,
        isLossless: null,
        fallbackReason: null,
        resolution: "intent",
      };
    }

    if (sourceQualityClass === "lossless") {
      return {
        requestedQuality,
        actualVariant: "lossless",
        sourceQualityClass,
        isDowngraded: false,
        isLossless: true,
        fallbackReason: null,
        resolution: "mirrored",
      };
    }

    return {
      requestedQuality,
      actualVariant: resolveLossyFallbackPlaybackVariant(
        options.audioInfo?.bitrate,
      ),
      sourceQualityClass: sourceQualityClass ?? "unknown",
      isDowngraded: true,
      isLossless: false,
      fallbackReason:
        sourceQualityClass === "lossy" ? "source_lossy" : "source_unknown",
      resolution: "mirrored",
    };
  }

  if (requestedQuality) {
    const isLossless =
      requestedQuality === "lossless" || requestedQuality === "flac";
    return {
      requestedQuality,
      actualVariant: requestedQuality,
      sourceQualityClass,
      isDowngraded: false,
      isLossless,
      fallbackReason: null,
      resolution: requestedFromUrl ? "confirmed" : "mirrored",
    };
  }

  return {
    requestedQuality: null,
    actualVariant: null,
    sourceQualityClass,
    isDowngraded: false,
    isLossless: null,
    fallbackReason: null,
    resolution: "unknown",
  };
}

export function getPlaybackOutputMetaFromState(
  state: PlaybackActualOutputState,
): PlaybackOutputMeta {
  return getPlaybackOutputMetaFromQueryValue(state.actualVariant);
}

export function getPlaybackOutputShortLabel(
  state: PlaybackActualOutputState,
): string | null {
  switch (state.actualVariant) {
    case "lossless":
    case "flac":
      return "无损";
    case "aac_320":
      return "AAC 320";
    case "aac_256":
      return "AAC 256";
    case "aac_192":
      return "AAC 192";
    default:
      return state.requestedQuality === "lossless" ? "待定" : null;
  }
}

function getPlaybackOutputCodecLabel(
  actualVariant: string | null,
): "aac" | "flac" | null {
  switch (actualVariant) {
    case "aac_320":
    case "aac_256":
    case "aac_192":
      return "aac";
    case "flac":
    case "lossless":
      return "flac";
    default:
      return null;
  }
}

function hasPlaybackSourceSummaryDifference(
  state: PlaybackActualOutputState,
  audioInfo?: AudioInfo | null,
): boolean {
  if (!audioInfo || !state.actualVariant) {
    return false;
  }

  const outputCodecLabel = getPlaybackOutputCodecLabel(state.actualVariant);
  const sourceCodec = normalizeAudioCodecForQuality(audioInfo.codec);

  if (sourceCodec && outputCodecLabel && sourceCodec !== outputCodecLabel) {
    return true;
  }

  if (
    outputCodecLabel === "aac" &&
    sourceCodec === "aac" &&
    audioInfo.bitrate &&
    resolveLossyFallbackPlaybackVariant(audioInfo.bitrate) !==
      state.actualVariant
  ) {
    return true;
  }

  return state.isDowngraded;
}

export function resolvePlaybackOutputLabel(options: {
  sourceUrl?: string | null;
  platform: Platform;
  desktopTranscodeQuality: DesktopTranscodeQuality;
  iosHlsQuality: IOSHLSQuality;
  audioInfo?: AudioInfo | null;
}): string | null {
  const state = resolvePlaybackActualOutputState(options);
  return getPlaybackOutputMetaFromState(state).label;
}

export function resolvePlaybackQualityDetailLabel(options: {
  sourceUrl?: string | null;
  platform: Platform;
  desktopTranscodeQuality: DesktopTranscodeQuality;
  iosHlsQuality: IOSHLSQuality;
  audioInfo?: AudioInfo | null;
}): string | null {
  const state = resolvePlaybackActualOutputState(options);
  const activePlaybackMeta = getPlaybackOutputMetaFromState(state);
  const losslessSourceDetail = formatLosslessPlaybackDetail(options.audioInfo);
  if (activePlaybackMeta.isLossless && losslessSourceDetail) {
    return losslessSourceDetail;
  }
  if (activePlaybackMeta.bitrateLabel) {
    return activePlaybackMeta.bitrateLabel;
  }
  return null;
}

export function resolvePlaybackSummaryLabel(options: {
  sourceUrl?: string | null;
  platform: Platform;
  desktopTranscodeQuality: DesktopTranscodeQuality;
  iosHlsQuality: IOSHLSQuality;
  audioInfo?: AudioInfo | null;
}): string | null {
  const state = resolvePlaybackActualOutputState(options);
  if (state.resolution === "intent" && !options.audioInfo) {
    return null;
  }

  const losslessSummary = formatLosslessPlaybackSummary(state, options.audioInfo);
  if (losslessSummary) {
    return losslessSummary;
  }

  const activePlaybackMeta = getPlaybackOutputMetaFromState(state);
  const outputShortLabel = getPlaybackOutputShortLabel(state);
  if (outputShortLabel && outputShortLabel !== "待定") {
    return outputShortLabel;
  }

  if (outputShortLabel === "待定") {
    return null;
  }

  return activePlaybackMeta.label;
}

export function resolvePlaybackOriginalSourceSummaryLabel(options: {
  sourceUrl?: string | null;
  platform: Platform;
  desktopTranscodeQuality: DesktopTranscodeQuality;
  iosHlsQuality: IOSHLSQuality;
  audioInfo?: AudioInfo | null;
}): string | null {
  const state = resolvePlaybackActualOutputState(options);
  if (!hasPlaybackSourceSummaryDifference(state, options.audioInfo)) {
    return null;
  }

  const parts = [
    formatAudioCodecLabel(
      options.audioInfo?.codec,
      options.audioInfo?.container,
    ),
    formatAudioBitDepth(options.audioInfo?.bitDepth),
    formatAudioSampleRate(options.audioInfo?.sampleRate),
  ].filter(Boolean);

  return parts.length > 0 ? `源文件 · ${parts.join(" · ")}` : null;
}

export function resolvePlaybackBitrateLabel(options: {
  sourceUrl?: string | null;
  platform: Platform;
  desktopTranscodeQuality: DesktopTranscodeQuality;
  iosHlsQuality: IOSHLSQuality;
  audioInfo?: AudioInfo | null;
}): string | null {
  return resolvePlaybackQualityDetailLabel(options);
}
