/**
 * Stream URL Generator Utility
 *
 * Generates the appropriate stream URL based on playback mode.
 * HLS mode is used for browser playback across desktop, Android, and iOS.
 */

const TOKEN_KEY = "auth-token";

export type HLSQualityMode = "aac_192" | "aac_256" | "aac_320" | "lossless";
export type DirectStreamTranscodeMode =
  | "flac"
  | "aac_320"
  | "aac_256"
  | "aac_192";

const readStoredAccessToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export function appendAuthToken(
  url: string,
  token: string | null = readStoredAccessToken(),
): string {
  if (!url || !token) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

function appendQueryParam(
  url: string,
  key: string,
  value: string | null | undefined,
): string {
  if (!url || !value) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function getBaseStreamUrl(
  songId: string,
  isHlsMode: boolean,
  hlsQuality: HLSQualityMode = "aac_256",
): string {
  if (isHlsMode) {
    return appendQueryParam(
      `/api/stream/${songId}/playlist.m3u8`,
      "quality",
      hlsQuality,
    );
  }
  return `/api/stream/${songId}`;
}

/**
 * Generates the stream URL for a song based on the playback mode
 * @param songId - The ID of the song to stream
 * @param isHlsMode - Whether to use HLS (HTTP Live Streaming) mode
 * @returns The stream URL
 *
 * @example
 * // Direct streaming (default)
 * getStreamUrl('123', false) // => '/api/stream/123'
 *
 * // HLS streaming
 * getStreamUrl('123', true) // => '/api/stream/123/playlist.m3u8'
 */
export function getStreamUrl(
  songId: string,
  isHlsMode: boolean,
  hlsQuality: HLSQualityMode = "aac_256",
): string {
  return getBaseStreamUrl(songId, isHlsMode, hlsQuality);
}

export function getDirectDownloadStreamUrl(
  songId: string,
  transcodeMode?: DirectStreamTranscodeMode | null,
): string {
  const urlWithTranscode = appendQueryParam(
    `/api/stream/${songId}`,
    "transcode",
    transcodeMode,
  );
  return appendQueryParam(urlWithTranscode, "download", "1");
}

export function getAuthenticatedStreamUrl(
  songId: string,
  isHlsMode: boolean,
  hlsQuality: HLSQualityMode = "aac_256",
): string {
  return appendAuthToken(getBaseStreamUrl(songId, isHlsMode, hlsQuality));
}

export function getAuthenticatedDownloadStreamUrl(
  songId: string,
  transcodeMode?: DirectStreamTranscodeMode | null,
): string {
  return appendAuthToken(getDirectDownloadStreamUrl(songId, transcodeMode));
}
