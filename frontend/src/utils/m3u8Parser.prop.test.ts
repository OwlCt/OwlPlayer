/**
 * Property-based tests for M3U8 Playlist Parser
 * 
 * **Feature: ios-pwa-background-continuity, Property 2: M3U8 Parsing and Segment Prefetch**
 * **Validates: Requirements 1.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseM3U8Playlist, generateM3U8Content, countSegments } from './m3u8Parser';

describe('M3U8 Parser - Property Tests', () => {
  /**
   * Property 2: M3U8 Parsing and Segment Prefetch
   * *For any* valid m3u8 playlist content, parsing SHALL extract all segment URLs,
   * and prefetch SHALL cache exactly the configured number of segments (default 2).
   * 
   * **Validates: Requirements 1.2**
   */
  describe('Property 2: M3U8 Parsing and Segment Prefetch', () => {
    // Generator for valid segment filenames
    const segmentFilenameArb = fc.stringMatching(/^segment_[0-9]+\.ts$/).filter(s => s.length > 0);
    
    // Generator for arrays of segment filenames
    const segmentArrayArb = fc.array(segmentFilenameArb, { minLength: 1, maxLength: 20 });
    
    // Generator for valid base URLs
    const baseUrlArb = fc.constantFrom(
      'https://example.com/api/stream/123/playlist.m3u8',
      'https://music.app/api/stream/abc/playlist.m3u8',
      'http://localhost:3000/api/stream/song1/playlist.m3u8'
    );

    it('should extract exactly the number of segments present in the playlist', () => {
      fc.assert(
        fc.property(segmentArrayArb, baseUrlArb, (segments, baseUrl) => {
          const content = generateM3U8Content(segments);
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          
          // Should extract exactly the same number of segments
          expect(parsedUrls.length).toBe(segments.length);
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve segment order during parsing', () => {
      fc.assert(
        fc.property(segmentArrayArb, baseUrlArb, (segments, baseUrl) => {
          const content = generateM3U8Content(segments);
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          
          // Each parsed URL should end with the corresponding segment filename
          for (let i = 0; i < segments.length; i++) {
            expect(parsedUrls[i]).toContain(segments[i]);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should generate valid absolute URLs for relative segments', () => {
      fc.assert(
        fc.property(segmentArrayArb, baseUrlArb, (segments, baseUrl) => {
          const content = generateM3U8Content(segments);
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          
          // All parsed URLs should be valid absolute URLs
          for (const url of parsedUrls) {
            expect(url).toMatch(/^https?:\/\//);
            // Should be parseable as URL
            expect(() => new URL(url)).not.toThrow();
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should use base URL origin for relative paths', () => {
      fc.assert(
        fc.property(segmentArrayArb, baseUrlArb, (segments, baseUrl) => {
          const content = generateM3U8Content(segments);
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          
          const base = new URL(baseUrl);
          
          // All parsed URLs should have the same origin as base URL
          for (const url of parsedUrls) {
            const parsed = new URL(url);
            expect(parsed.origin).toBe(base.origin);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Round-trip property: generate then parse should preserve segment count
   */
  describe('Round-trip property', () => {
    const segmentCountArb = fc.integer({ min: 0, max: 50 });
    const baseUrlArb = fc.constantFrom(
      'https://example.com/api/stream/123/playlist.m3u8',
      'https://music.app/api/stream/abc/playlist.m3u8'
    );

    it('should preserve segment count through generate-parse cycle', () => {
      fc.assert(
        fc.property(segmentCountArb, baseUrlArb, (count, baseUrl) => {
          // Generate segments
          const segments = Array.from({ length: count }, (_, i) => `segment_${i}.ts`);
          
          // Generate m3u8 content
          const content = generateM3U8Content(segments);
          
          // Parse it back
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          
          // Count should match
          expect(parsedUrls.length).toBe(count);
          expect(countSegments(content)).toBe(count);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Handling different URL formats
   */
  describe('URL format handling', () => {
    const baseUrlArb = fc.constantFrom(
      'https://example.com/api/stream/123/playlist.m3u8'
    );

    it('should handle absolute URLs in playlist', () => {
      fc.assert(
        fc.property(baseUrlArb, (baseUrl) => {
          const absoluteSegments = [
            'https://cdn.example.com/segment_0.ts',
            'https://cdn.example.com/segment_1.ts'
          ];
          
          const content = generateM3U8Content(absoluteSegments);
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          
          // Absolute URLs should be preserved as-is
          expect(parsedUrls).toEqual(absoluteSegments);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle absolute paths (starting with /) in playlist', () => {
      const content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
/api/stream/123/segment_0.ts
#EXTINF:6.0,
/api/stream/123/segment_1.ts
#EXT-X-ENDLIST`;

      fc.assert(
        fc.property(baseUrlArb, (baseUrl) => {
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          const base = new URL(baseUrl);
          
          // Should use origin from base URL
          expect(parsedUrls.length).toBe(2);
          expect(parsedUrls[0]).toBe(`${base.origin}/api/stream/123/segment_0.ts`);
          expect(parsedUrls[1]).toBe(`${base.origin}/api/stream/123/segment_1.ts`);
        }),
        { numRuns: 100 }
      );
    });

    it('should handle relative paths in playlist', () => {
      const content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
segment_0.ts
#EXTINF:6.0,
segment_1.ts
#EXT-X-ENDLIST`;

      fc.assert(
        fc.property(baseUrlArb, (baseUrl) => {
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          const base = new URL(baseUrl);
          const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
          
          // Should resolve relative to base directory
          expect(parsedUrls.length).toBe(2);
          expect(parsedUrls[0]).toBe(`${base.origin}${basePath}segment_0.ts`);
          expect(parsedUrls[1]).toBe(`${base.origin}${basePath}segment_1.ts`);
        }),
        { numRuns: 100 }
      );
    });

    it('should extract URI attributes such as EXT-X-MAP entries', () => {
      const content = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.0,
segment_0.m4s
#EXT-X-ENDLIST`;

      fc.assert(
        fc.property(baseUrlArb, (baseUrl) => {
          const parsedUrls = parseM3U8Playlist(content, baseUrl);
          const base = new URL(baseUrl);
          const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);

          expect(parsedUrls).toEqual([
            `${base.origin}${basePath}init.mp4`,
            `${base.origin}${basePath}segment_0.m4s`,
          ]);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Edge cases
   */
  describe('Edge cases', () => {
    it('should return empty array for empty content', () => {
      fc.assert(
        fc.property(fc.constantFrom('', null, undefined), (content) => {
          const result = parseM3U8Playlist(content as string, 'https://example.com/playlist.m3u8');
          expect(result).toEqual([]);
        }),
        { numRuns: 10 }
      );
    });

    it('should return empty array for invalid base URL', () => {
      const validContent = generateM3U8Content(['segment_0.ts']);
      
      // Only truly invalid URLs (not parseable) should return empty array
      fc.assert(
        fc.property(fc.constantFrom('not-a-url', '', 'invalid-url'), (baseUrl) => {
          const result = parseM3U8Playlist(validContent, baseUrl);
          expect(result).toEqual([]);
        }),
        { numRuns: 10 }
      );
    });

    it('should handle non-http URLs (ftp, etc.) by using their origin', () => {
      const validContent = generateM3U8Content(['segment_0.ts']);
      
      // ftp:// is a valid URL format, so it should work
      const result = parseM3U8Playlist(validContent, 'ftp://example.com/path/playlist.m3u8');
      expect(result.length).toBe(1);
      expect(result[0]).toContain('ftp://example.com');
    });

    it('should skip comment lines and tags', () => {
      const content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
# This is a comment
#EXTINF:6.0,
segment_0.ts
#EXTINF:6.0,
segment_1.ts
#EXT-X-ENDLIST`;

      const parsedUrls = parseM3U8Playlist(content, 'https://example.com/api/stream/123/playlist.m3u8');
      
      // Should only extract segment URLs, not comments or tags
      expect(parsedUrls.length).toBe(2);
      expect(parsedUrls.every(url => url.includes('segment_'))).toBe(true);
    });

    it('should handle playlists with only tags (no segments)', () => {
      const content = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-ENDLIST`;

      const parsedUrls = parseM3U8Playlist(content, 'https://example.com/playlist.m3u8');
      expect(parsedUrls).toEqual([]);
    });

    it('should handle Windows-style line endings (CRLF)', () => {
      const content = '#EXTM3U\r\n#EXT-X-VERSION:3\r\n#EXTINF:6.0,\r\nsegment_0.ts\r\n#EXT-X-ENDLIST';
      
      const parsedUrls = parseM3U8Playlist(content, 'https://example.com/api/stream/123/playlist.m3u8');
      expect(parsedUrls.length).toBe(1);
      expect(parsedUrls[0]).toContain('segment_0.ts');
    });
  });

  /**
   * Prefetch segment count property
   */
  describe('Prefetch segment selection', () => {
    const segmentCountArb = fc.integer({ min: 1, max: 20 });
    const prefetchCountArb = fc.integer({ min: 1, max: 5 });
    const baseUrlArb = fc.constantFrom('https://example.com/api/stream/123/playlist.m3u8');

    it('should allow selecting first N segments for prefetch', () => {
      fc.assert(
        fc.property(segmentCountArb, prefetchCountArb, baseUrlArb, (totalSegments, prefetchCount, baseUrl) => {
          // Generate segments
          const segments = Array.from({ length: totalSegments }, (_, i) => `segment_${i}.ts`);
          const content = generateM3U8Content(segments);
          
          // Parse all segments
          const allUrls = parseM3U8Playlist(content, baseUrl);
          
          // Select first N for prefetch
          const prefetchUrls = allUrls.slice(0, prefetchCount);
          
          // Should get min(prefetchCount, totalSegments) URLs
          const expectedCount = Math.min(prefetchCount, totalSegments);
          expect(prefetchUrls.length).toBe(expectedCount);
          
          // First prefetch URL should be first segment
          if (prefetchUrls.length > 0) {
            expect(prefetchUrls[0]).toContain('segment_0.ts');
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
