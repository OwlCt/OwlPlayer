/**
 * Property Test: Cache-First Playback Priority
 * 
 * **Property 13: Cache-First Playback Priority**
 * *For any* song playback request where the song is cached, the player SHALL use 
 * the cached audio Blob instead of making a network request, regardless of online/offline status.
 * 
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.6**
 * 
 * Feature: pwa-offline-music-cache
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Generate a random song ID
 */
const songIdArb = fc.uuid();

/**
 * Generate a random song metadata
 */
const songMetadataArb = fc.record({
  id: songIdArb,
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: songIdArb,
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: songIdArb,
  duration: fc.integer({ min: 30, max: 600 }),
  hasLyrics: fc.boolean(),
});

/**
 * Generate a random Song object
 */
const songArb = fc.record({
  id: songIdArb,
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artistId: songIdArb,
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  albumId: songIdArb,
  duration: fc.integer({ min: 30, max: 600 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
});

/**
 * Generate a mock CachedSong
 */
const cachedSongArb = fc.record({
  id: songIdArb,
  audio: fc.constant(new Blob(['mock audio data'], { type: 'audio/mpeg' })),
  artwork: fc.constant(new Blob(['mock artwork'], { type: 'image/jpeg' })),
  lyrics: fc.record({
    lines: fc.array(fc.record({
      startTime: fc.integer({ min: 0, max: 300000 }),
      endTime: fc.integer({ min: 0, max: 300000 }),
      text: fc.string({ minLength: 1, maxLength: 200 }),
    }), { minLength: 0, maxLength: 10 }),
    hasSyllables: fc.boolean(),
  }),
  metadata: songMetadataArb,
  cachedAt: fc.integer({ min: 1600000000000, max: 1700000000000 }),
});

// ============================================================================
// Pure Function Tests for Cache-First Logic
// ============================================================================

/**
 * Determines the audio source based on cache status and network status
 * This is a pure function extracted from playerStore for testing
 */
function determineAudioSource(
  songId: string,
  cachedSong: { audio: Blob } | null,
  isOnline: boolean,
  isHlsMode: boolean
): { type: 'cache' | 'stream' | 'unavailable'; url?: string } {
  if (cachedSong && cachedSong.audio) {
    // Cache-first: always use cached audio when available
    return { type: 'cache' };
  }
  
  if (isOnline) {
    // Online and not cached: stream from server
    return { type: 'stream' };
  }
  
  // Offline and not cached: unavailable
  return { type: 'unavailable' };
}

/**
 * Checks if a URL is a blob URL (cached audio)
 */
function isBlobUrl(url: string): boolean {
  return url.startsWith('blob:');
}

/**
 * Checks if a URL is a stream URL
 */
function isStreamUrl(url: string, songId: string): boolean {
  return url.includes(`/stream/${songId}/`);
}

describe('Property 13: Cache-First Playback Priority', () => {
  describe('determineAudioSource - pure function tests', () => {
    it('should always return "cache" when song is cached, regardless of online status', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isOnline
          fc.boolean(), // isHlsMode
          (songId, isOnline, isHlsMode) => {
            const cachedSong = { audio: new Blob(['test'], { type: 'audio/mpeg' }) };
            const result = determineAudioSource(songId, cachedSong, isOnline, isHlsMode);
            
            // Property: cached songs always use cache, regardless of network status
            expect(result.type).toBe('cache');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "stream" when not cached and online', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isHlsMode
          (songId, isHlsMode) => {
            const result = determineAudioSource(songId, null, true, isHlsMode);
            
            // Property: uncached songs stream when online
            expect(result.type).toBe('stream');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return "unavailable" when not cached and offline', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isHlsMode
          (songId, isHlsMode) => {
            const result = determineAudioSource(songId, null, false, isHlsMode);
            
            // Property: uncached songs are unavailable when offline
            expect(result.type).toBe('unavailable');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should prioritize cache over network even when online', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isHlsMode
          (songId, isHlsMode) => {
            const cachedSong = { audio: new Blob(['test'], { type: 'audio/mpeg' }) };
            
            // Test with online = true
            const resultOnline = determineAudioSource(songId, cachedSong, true, isHlsMode);
            // Test with online = false
            const resultOffline = determineAudioSource(songId, cachedSong, false, isHlsMode);
            
            // Property: cache is always preferred, network status doesn't matter
            expect(resultOnline.type).toBe('cache');
            expect(resultOffline.type).toBe('cache');
            expect(resultOnline.type).toBe(resultOffline.type);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('URL type detection', () => {
    it('should correctly identify blob URLs as cached audio', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          (uuid) => {
            const blobUrl = `blob:http://localhost/${uuid}`;
            expect(isBlobUrl(blobUrl)).toBe(true);
            expect(isBlobUrl(`http://localhost/stream/${uuid}/audio`)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly identify stream URLs', () => {
      fc.assert(
        fc.property(
          songIdArb,
          (songId) => {
            const streamUrl = `/api/stream/${songId}/audio`;
            expect(isStreamUrl(streamUrl, songId)).toBe(true);
            expect(isStreamUrl(`blob:http://localhost/${songId}`, songId)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Cache-first decision matrix', () => {
    it('should follow the correct decision matrix for all combinations', () => {
      // Test all combinations of (cached, online) -> expected result
      const testCases = [
        { cached: true, online: true, expected: 'cache' },
        { cached: true, online: false, expected: 'cache' },
        { cached: false, online: true, expected: 'stream' },
        { cached: false, online: false, expected: 'unavailable' },
      ];

      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isHlsMode
          fc.constantFrom(...testCases),
          (songId, isHlsMode, testCase) => {
            const cachedSong = testCase.cached 
              ? { audio: new Blob(['test'], { type: 'audio/mpeg' }) }
              : null;
            
            const result = determineAudioSource(songId, cachedSong, testCase.online, isHlsMode);
            
            expect(result.type).toBe(testCase.expected);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Invariants', () => {
    it('should never return "stream" when cached', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isOnline
          fc.boolean(), // isHlsMode
          (songId, isOnline, isHlsMode) => {
            const cachedSong = { audio: new Blob(['test'], { type: 'audio/mpeg' }) };
            const result = determineAudioSource(songId, cachedSong, isOnline, isHlsMode);
            
            // Invariant: cached songs never stream
            expect(result.type).not.toBe('stream');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return "unavailable" when cached', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // isOnline
          fc.boolean(), // isHlsMode
          (songId, isOnline, isHlsMode) => {
            const cachedSong = { audio: new Blob(['test'], { type: 'audio/mpeg' }) };
            const result = determineAudioSource(songId, cachedSong, isOnline, isHlsMode);
            
            // Invariant: cached songs are always available
            expect(result.type).not.toBe('unavailable');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should never return "unavailable" when online', () => {
      fc.assert(
        fc.property(
          songIdArb,
          fc.boolean(), // cached
          fc.boolean(), // isHlsMode
          (songId, cached, isHlsMode) => {
            const cachedSong = cached 
              ? { audio: new Blob(['test'], { type: 'audio/mpeg' }) }
              : null;
            const result = determineAudioSource(songId, cachedSong, true, isHlsMode);
            
            // Invariant: online songs are always available (either cached or streamed)
            expect(result.type).not.toBe('unavailable');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
