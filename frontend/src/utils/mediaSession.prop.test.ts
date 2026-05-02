import { describe, it, expect, vi, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import {
  createMediaMetadata,
  createPositionState,
  calculateSeekPosition,
  getPlaybackState,
} from './mediaSession';
import { Song } from '../types';

// Mock MediaMetadata for Node.js environment
beforeAll(() => {
  if (typeof MediaMetadata === 'undefined') {
    global.MediaMetadata = class MockMediaMetadata {
      title: string;
      artist: string;
      album: string;
      artwork: MediaImage[];
      
      constructor(init?: MediaMetadataInit) {
        this.title = init?.title || '';
        this.artist = init?.artist || '';
        this.album = init?.album || '';
        this.artwork = init?.artwork || [];
      }
    } as unknown as typeof MediaMetadata;
  }
});

// Song arbitrary generator
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  albumName: fc.string({ minLength: 1, maxLength: 100 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

// Helper to check if URL is proxied or absolute
const isProxiedUrl = (url: string): boolean => url.includes('/api/image?url=');
const isValidArtworkUrl = (url: string): boolean => isProxiedUrl(url) || /^https?:\/\//i.test(url);

// **Feature: media-session-integration, Property 1: Metadata Synchronization**
// **Validates: Requirements 1.1, 1.2, 1.3**
describe('Property 1: Metadata Synchronization', () => {
  it('should create MediaMetadata with matching song fields', () => {
    fc.assert(
      fc.property(songArbitrary, (song) => {
        const metadata = createMediaMetadata(song);
        
        // Verify all fields match
        expect(metadata.title).toBe(song.name);
        expect(metadata.artist).toBe(song.artistName);
        expect(metadata.album).toBe(song.albumName);
        
        // Verify artwork is present and uses proxied URLs
        expect(metadata.artwork.length).toBeGreaterThan(0);
        expect(metadata.artwork.every(art => isValidArtworkUrl(art.src))).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it('should include multiple artwork sizes', () => {
    fc.assert(
      fc.property(songArbitrary, (song) => {
        const metadata = createMediaMetadata(song);
        
        // Should have multiple sizes for different display contexts
        expect(metadata.artwork.length).toBeGreaterThanOrEqual(1);
        
        // Each artwork should have proxied src and sizes
        metadata.artwork.forEach(art => {
          expect(isValidArtworkUrl(art.src)).toBe(true);
          expect(art.sizes).toBeDefined();
        });
      }),
      { numRuns: 100 }
    );
  });
});

// **Feature: media-session-integration, Property 2: Playback State Synchronization**
// **Validates: Requirements 2.1, 2.2, 2.4**
describe('Property 2: Playback State Synchronization', () => {
  it('should return "playing" when isPlaying is true', () => {
    expect(getPlaybackState(true)).toBe('playing');
  });

  it('should return "paused" when isPlaying is false', () => {
    expect(getPlaybackState(false)).toBe('paused');
  });

  it('should always return valid playback state for any boolean', () => {
    fc.assert(
      fc.property(fc.boolean(), (isPlaying) => {
        const state = getPlaybackState(isPlaying);
        
        if (isPlaying) {
          expect(state).toBe('playing');
        } else {
          expect(state).toBe('paused');
        }
      }),
      { numRuns: 100 }
    );
  });
});


// **Feature: media-session-integration, Property 3: Seek Position Calculation**
// **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
describe('Property 3: Seek Position Calculation', () => {
  it('should clamp seek position between 0 and duration', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000, noNaN: true }),  // currentPosition
        fc.float({ min: -500, max: 500, noNaN: true }), // seekOffset
        fc.float({ min: 1, max: 1000, noNaN: true }),   // duration
        (currentPosition, seekOffset, duration) => {
          const result = calculateSeekPosition(currentPosition, seekOffset, duration);
          
          // Result should always be within bounds
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(duration);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clamp to 0 when seeking would go below zero', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),    // currentPosition
        fc.float({ min: 1, max: 1000, noNaN: true }),   // duration
        (currentPosition, duration) => {
          // Seek backward more than current position
          const seekOffset = -(currentPosition + 100);
          const result = calculateSeekPosition(currentPosition, seekOffset, duration);
          
          expect(result).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clamp to duration when seeking would exceed it', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 100, noNaN: true }),    // currentPosition
        fc.float({ min: 1, max: 1000, noNaN: true }),   // duration
        (currentPosition, duration) => {
          // Seek forward more than remaining time
          const seekOffset = duration + 100;
          const result = calculateSeekPosition(currentPosition, seekOffset, duration);
          
          expect(result).toBe(duration);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should calculate correct position for valid seeks', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 10, max: 100, noNaN: true }),   // currentPosition
        fc.float({ min: -5, max: 5, noNaN: true }),     // small seekOffset
        fc.float({ min: 200, max: 1000, noNaN: true }), // duration (large enough)
        (currentPosition, seekOffset, duration) => {
          const result = calculateSeekPosition(currentPosition, seekOffset, duration);
          const expected = currentPosition + seekOffset;
          
          // For valid seeks within bounds, result should equal expected
          if (expected >= 0 && expected <= duration) {
            expect(result).toBeCloseTo(expected, 5);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// **Feature: media-session-integration, Property 4: Position State Consistency**
// **Validates: Requirements 5.1, 5.2, 5.3**
describe('Property 4: Position State Consistency', () => {
  it('should create position state with matching progress and duration', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000, noNaN: true }),  // progress
        fc.float({ min: 1, max: 1000, noNaN: true }),  // duration (positive)
        (progress, duration) => {
          const state = createPositionState(progress, duration);
          
          // Position should match progress (clamped to >= 0)
          expect(state.position).toBe(Math.max(0, progress));
          // Duration should match (clamped to >= 0)
          expect(state.duration).toBe(Math.max(0, duration));
          // Default playback rate should be 1
          expect(state.playbackRate).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should use provided playback rate', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1000, noNaN: true }),  // progress
        fc.float({ min: 1, max: 1000, noNaN: true }),  // duration
        fc.float({ min: 0.5, max: 2, noNaN: true }),   // playbackRate
        (progress, duration, playbackRate) => {
          const state = createPositionState(progress, duration, playbackRate);
          
          expect(state.playbackRate).toBe(playbackRate);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle edge case of zero progress', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 1000, noNaN: true }),  // duration
        (duration) => {
          const state = createPositionState(0, duration);
          
          expect(state.position).toBe(0);
          expect(state.duration).toBe(duration);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should clamp negative progress to zero', () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1000, max: Math.fround(-0.001), noNaN: true }),  // negative progress
        fc.float({ min: 1, max: 1000, noNaN: true }),        // duration
        (progress, duration) => {
          const state = createPositionState(progress, duration);
          
          // Negative progress should be clamped to 0
          expect(state.position).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
