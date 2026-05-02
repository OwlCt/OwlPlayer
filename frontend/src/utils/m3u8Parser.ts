/**
 * M3U8 Playlist Parser
 * 
 * Parses m3u8 playlist content and extracts segment URLs.
 * This is a TypeScript version of the Service Worker's parseM3U8Playlist function
 * for use in the main thread and testing.
 * 
 * Requirements: 1.2
 */

/**
 * Parse m3u8 playlist content and extract segment URLs
 * Handles both relative and absolute URLs
 * 
 * @param content - m3u8 playlist content
 * @param baseUrl - Base URL for resolving relative paths
 * @returns Array of segment URLs
 */
export function parseM3U8Playlist(content: string, baseUrl: string): string[] {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const lines = content.split('\n');
  const segmentUrls: string[] = [];

  // Parse base URL for resolving relative paths
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch (e) {
    console.error('Invalid base URL for m3u8 parsing:', baseUrl);
    return [];
  }

  // Get the directory path from base URL (remove filename if present)
  const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

  for (const line of lines) {
    const trimmedLine = line.trim();

    const uriMatch = trimmedLine.match(/URI="([^"]+)"/i);
    if (uriMatch && uriMatch[1]) {
      const uri = uriMatch[1];

      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        segmentUrls.push(uri);
      } else if (uri.startsWith('/')) {
        segmentUrls.push(`${base.origin}${uri}`);
      } else {
        segmentUrls.push(`${base.origin}${basePath}${uri}`);
      }

      continue;
    }

    // Skip empty lines and comments/tags
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // This should be a segment URL
    let segmentUrl: string;

    if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
      // Absolute URL
      segmentUrl = trimmedLine;
    } else if (trimmedLine.startsWith('/')) {
      // Absolute path - use origin from base URL
      segmentUrl = `${base.origin}${trimmedLine}`;
    } else {
      // Relative path - resolve against base directory
      segmentUrl = `${base.origin}${basePath}${trimmedLine}`;
    }

    segmentUrls.push(segmentUrl);
  }

  return segmentUrls;
}

/**
 * Generate a valid m3u8 playlist content from segment filenames
 * Useful for testing round-trip properties
 * 
 * @param segments - Array of segment filenames or URLs
 * @param duration - Duration of each segment in seconds
 * @returns Valid m3u8 playlist content
 */
export function generateM3U8Content(segments: string[], duration: number = 6): string {
  if (!segments || segments.length === 0) {
    return '#EXTM3U\n#EXT-X-ENDLIST';
  }

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(duration)}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
  ];

  for (const segment of segments) {
    lines.push(`#EXTINF:${duration.toFixed(6)},`);
    lines.push(segment);
  }

  lines.push('#EXT-X-ENDLIST');

  return lines.join('\n');
}

/**
 * Extract segment count from m3u8 content without full parsing
 * 
 * @param content - m3u8 playlist content
 * @returns Number of segments in the playlist
 */
export function countSegments(content: string): number {
  if (!content || typeof content !== 'string') {
    return 0;
  }

  const lines = content.split('\n');
  let count = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();
    // Count non-empty, non-comment lines
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      count++;
    }
  }

  return count;
}
