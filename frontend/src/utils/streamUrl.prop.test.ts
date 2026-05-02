/**
 * Property-based tests for Stream URL Generator
 * 
 * **Feature: ios-pwa-hls-playback, Property 1: Stream URL format based on HLS mode**
 * **Validates: Requirements 1.2, 1.4, 1.5, 5.4**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getDirectDownloadStreamUrl, getStreamUrl } from './streamUrl';

describe('Stream URL Generator - Property Tests', () => {
  /**
   * Property 1: Stream URL format based on HLS mode
   * *For any* song ID and HLS mode flag, the generated stream URL SHALL follow the correct format:
   * - When `isHlsMode` is true: `/api/stream/{songId}/playlist.m3u8`
   * - When `isHlsMode` is false: `/api/stream/{songId}`
   * 
   * **Validates: Requirements 1.2, 1.4, 1.5, 5.4**
   */
  describe('Property 1: Stream URL format based on HLS mode', () => {
    // Generator for valid song IDs (alphanumeric strings)
    const songIdArb = fc.stringMatching(/^[a-zA-Z0-9]+$/).filter(s => s.length > 0);

    it('should generate HLS URL with playlist.m3u8 suffix when isHlsMode is true', () => {
      fc.assert(
        fc.property(songIdArb, (songId) => {
          const url = getStreamUrl(songId, true);
          
          // URL should end with playlist.m3u8
          expect(url).toMatch(/\/playlist\.m3u8\?quality=aac_256$/);
          // URL should contain the song ID
          expect(url).toContain(songId);
          // URL should follow the exact format
          expect(url).toBe(`/api/stream/${songId}/playlist.m3u8?quality=aac_256`);
        }),
        { numRuns: 100 }
      );
    });

    it('should generate direct stream URL without playlist.m3u8 when isHlsMode is false', () => {
      fc.assert(
        fc.property(songIdArb, (songId) => {
          const url = getStreamUrl(songId, false);
          
          // URL should NOT contain playlist.m3u8
          expect(url).not.toContain('playlist.m3u8');
          // URL should contain the song ID
          expect(url).toContain(songId);
          // URL should follow the exact format
          expect(url).toBe(`/api/stream/${songId}`);
        }),
        { numRuns: 100 }
      );
    });

    it('should produce different URLs for HLS vs direct mode for the same song', () => {
      fc.assert(
        fc.property(songIdArb, (songId) => {
          const hlsUrl = getStreamUrl(songId, true);
          const directUrl = getStreamUrl(songId, false);
          
          // URLs should be different
          expect(hlsUrl).not.toBe(directUrl);
          // HLS URL should be longer (has additional path segment)
          expect(hlsUrl.length).toBeGreaterThan(directUrl.length);
        }),
        { numRuns: 100 }
      );
    });

    it('should always start with /api/stream/ regardless of mode', () => {
      fc.assert(
        fc.property(songIdArb, fc.boolean(), (songId, isHlsMode) => {
          const url = getStreamUrl(songId, isHlsMode);
          
          // URL should always start with the API prefix
          expect(url).toMatch(/^\/api\/stream\//);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: URL structure consistency
   * The URL should always contain exactly the song ID in the path
   */
  describe('URL structure consistency', () => {
    const songIdArb = fc.stringMatching(/^[a-zA-Z0-9]+$/).filter(s => s.length > 0);

    it('should preserve song ID exactly in the URL path', () => {
      fc.assert(
        fc.property(songIdArb, fc.boolean(), (songId, isHlsMode) => {
          const url = getStreamUrl(songId, isHlsMode);
          
          // Extract the song ID from the URL
          const match = url.match(/^\/api\/stream\/([^/]+)/);
          expect(match).not.toBeNull();
          expect(match![1]).toBe(songId);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Edge cases with various song ID formats
   */
  describe('Edge cases', () => {
    it('should handle numeric song IDs', () => {
      fc.assert(
        fc.property(fc.nat().map(String), fc.boolean(), (songId, isHlsMode) => {
          const url = getStreamUrl(songId, isHlsMode);
          expect(url).toContain(songId);
          
          if (isHlsMode) {
            expect(url).toBe(`/api/stream/${songId}/playlist.m3u8?quality=aac_256`);
          } else {
            expect(url).toBe(`/api/stream/${songId}`);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('should handle long song IDs', () => {
      const longIdArb = fc.stringMatching(/^[a-zA-Z0-9]{20,50}$/);
      
      fc.assert(
        fc.property(longIdArb, fc.boolean(), (songId, isHlsMode) => {
          const url = getStreamUrl(songId, isHlsMode);
          expect(url).toContain(songId);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Direct download transcode URLs', () => {
    it('appends direct transcode params only when needed', () => {
      expect(getDirectDownloadStreamUrl('123')).toBe('/api/stream/123?download=1');
      expect(getDirectDownloadStreamUrl('123', 'flac')).toBe(
        '/api/stream/123?transcode=flac&download=1',
      );
      expect(getDirectDownloadStreamUrl('123', 'aac_256')).toBe(
        '/api/stream/123?transcode=aac_256&download=1',
      );
      expect(getDirectDownloadStreamUrl('123', 'aac_192')).toBe(
        '/api/stream/123?transcode=aac_192&download=1',
      );
    });
  });
});
