/**
 * Unit tests for useMediaSession hook
 * Tests metadata updates, playback state changes, and action handler registration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMediaSession, UseMediaSessionOptions } from './useMediaSession';
import { Song } from '../types';
import { getPlatformInfo } from '../utils/audioSession';

const defaultPlatformInfo = {
  platform: 'desktop' as const,
  isPWA: false,
  browser: 'chrome' as const,
  supportsHLS: false,
  supportsMediaSession: true,
};

// Mock the mediaSession utility module
vi.mock('../utils/mediaSession', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/mediaSession')>();
  return {
    ...original,
    createMediaMetadataWithOfflineSupport: vi.fn((song: Song) => {
      return Promise.resolve(new MockMediaMetadata({
        title: song.name,
        artist: song.artistName,
        album: song.albumName,
        artwork: [{ src: song.artworkUrl || '', sizes: '512x512', type: 'image/jpeg' }],
      }));
    }),
  };
});

// Mock the audioSession module
vi.mock('../utils/audioSession', () => ({
  getPlatformInfo: vi.fn(() => ({
    platform: 'desktop' as const,
    isPWA: false,
    browser: 'chrome' as const,
    supportsHLS: false,
    supportsMediaSession: true,
  })),
  getAudioSessionManager: vi.fn(() => ({
    platform: 'desktop',
    state: 'active',
    isHlsMode: false,
    config: { hlsEnabled: false, backgroundPreloadEnabled: true, maxRetryAttempts: 3 },
    initialize: vi.fn().mockResolvedValue(undefined),
    getStreamUrl: vi.fn((songId: string) => `/api/stream/${songId}`),
    preparePlayback: vi.fn().mockResolvedValue(undefined),
    resumePlayback: vi.fn().mockResolvedValue(true),
    handlePlaybackError: vi.fn().mockResolvedValue(false),
    syncProgress: vi.fn(),
    cleanup: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })),
  getHlsPlaybackPreference: vi.fn(() => false),
  resetAudioSessionManager: vi.fn(),
  setHlsPlaybackPreference: vi.fn(),
}));

// Mock MediaMetadata constructor
class MockMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: { src: string; sizes?: string; type?: string }[];

  constructor(init: {
    title: string;
    artist: string;
    album: string;
    artwork: { src: string; sizes?: string; type?: string }[];
  }) {
    this.title = init.title;
    this.artist = init.artist;
    this.album = init.album;
    this.artwork = init.artwork;
  }
}

// Add MediaMetadata to global scope
(globalThis as unknown as { MediaMetadata: typeof MockMediaMetadata }).MediaMetadata = MockMediaMetadata;

// Mock song for testing
const mockSong: Song = {
  id: 'test-song-1',
  name: 'Test Song',
  artistName: 'Test Artist',
  albumName: 'Test Album',
  artworkUrl: 'https://example.com/artwork.jpg',
  duration: 180000,
  hasLyrics: false,
};

// Mock MediaSession API
const mockSetActionHandler = vi.fn();
const mockSetPositionState = vi.fn();

const createMockMediaSession = () => ({
  metadata: null as MockMediaMetadata | null,
  playbackState: 'none' as MediaSessionPlaybackState,
  setActionHandler: mockSetActionHandler,
  setPositionState: mockSetPositionState,
});

const mockGetPlatformInfo = getPlatformInfo as unknown as vi.Mock;
const originalUserAgent = navigator.userAgent;
const originalMaxTouchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints;
const originalOntouchend = (document as Document & { ontouchend?: unknown }).ontouchend;

const setIOSUserAgent = () => {
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    configurable: true,
  });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
  Object.defineProperty(document, 'ontouchend', { value: null, configurable: true });
};

const resetUserAgent = () => {
  Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: originalMaxTouchPoints, configurable: true });
  if (typeof originalOntouchend !== 'undefined') {
    Object.defineProperty(document, 'ontouchend', { value: originalOntouchend, configurable: true });
  } else {
    delete (document as Document & { ontouchend?: unknown }).ontouchend;
  }
};

describe('useMediaSession', () => {
  let originalMediaSession: unknown;
  let mockMediaSession: ReturnType<typeof createMockMediaSession>;

  beforeEach(() => {
    // Save original mediaSession
    originalMediaSession = navigator.mediaSession;
    
    // Create mock
    mockMediaSession = createMockMediaSession();
    
    // Mock navigator.mediaSession
    Object.defineProperty(navigator, 'mediaSession', {
      value: mockMediaSession,
      writable: true,
      configurable: true,
    });

    // Clear mocks
    mockSetActionHandler.mockClear();
    mockSetPositionState.mockClear();
  });

  afterEach(() => {
    // Restore original mediaSession
    if (originalMediaSession !== undefined) {
      Object.defineProperty(navigator, 'mediaSession', {
        value: originalMediaSession,
        writable: true,
        configurable: true,
      });
    }
    resetUserAgent();
    mockGetPlatformInfo.mockReturnValue(defaultPlatformInfo);
  });

  const createDefaultOptions = (overrides?: Partial<UseMediaSessionOptions>): UseMediaSessionOptions => ({
    currentSong: null,
    isPlaying: false,
    progress: 0,
    duration: 0,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  });

  describe('metadata updates', () => {
    it('should set metadata when currentSong is provided', async () => {
      const options = createDefaultOptions({ currentSong: mockSong });
      
      renderHook(() => useMediaSession(options));

      // Wait for async metadata creation
      await vi.waitFor(() => {
        expect(mockMediaSession.metadata).not.toBeNull();
      });
      expect(mockMediaSession.metadata?.title).toBe(mockSong.name);
      expect(mockMediaSession.metadata?.artist).toBe(mockSong.artistName);
      expect(mockMediaSession.metadata?.album).toBe(mockSong.albumName);
    });

    it('should clear metadata when currentSong is null', () => {
      const options = createDefaultOptions({ currentSong: null });
      
      renderHook(() => useMediaSession(options));

      expect(mockMediaSession.metadata).toBeNull();
    });

    it('should update metadata when currentSong changes', async () => {
      const options = createDefaultOptions({ currentSong: mockSong });
      
      const { rerender } = renderHook(
        (props) => useMediaSession(props),
        { initialProps: options }
      );

      // Wait for async metadata creation
      await vi.waitFor(() => {
        expect(mockMediaSession.metadata?.title).toBe(mockSong.name);
      });

      const newSong: Song = {
        ...mockSong,
        id: 'test-song-2',
        name: 'New Song',
        artistName: 'New Artist',
      };

      rerender({ ...options, currentSong: newSong });

      // Wait for async metadata update
      await vi.waitFor(() => {
        expect(mockMediaSession.metadata?.title).toBe('New Song');
      });
      expect(mockMediaSession.metadata?.artist).toBe('New Artist');
    });
  });

  describe('playback state updates', () => {
    it('should set playback state to playing when isPlaying is true', () => {
      const options = createDefaultOptions({ isPlaying: true });
      
      renderHook(() => useMediaSession(options));

      expect(mockMediaSession.playbackState).toBe('playing');
    });

    it('should set playback state to paused when isPlaying is false', () => {
      const options = createDefaultOptions({ isPlaying: false });
      
      renderHook(() => useMediaSession(options));

      expect(mockMediaSession.playbackState).toBe('paused');
    });

    it('should update playback state when isPlaying changes', () => {
      const options = createDefaultOptions({ isPlaying: false });
      
      const { rerender } = renderHook(
        (props) => useMediaSession(props),
        { initialProps: options }
      );

      expect(mockMediaSession.playbackState).toBe('paused');

      rerender({ ...options, isPlaying: true });

      expect(mockMediaSession.playbackState).toBe('playing');
    });
  });

  describe('action handler registration', () => {
    it('should register all action handlers on mount', () => {
      const options = createDefaultOptions();
      
      renderHook(() => useMediaSession(options));

      const registeredActions = mockSetActionHandler.mock.calls.map(call => call[0]);
      
      expect(registeredActions).toContain('play');
      expect(registeredActions).toContain('pause');
      expect(registeredActions).toContain('stop');
      expect(registeredActions).toContain('nexttrack');
      expect(registeredActions).toContain('previoustrack');
      expect(registeredActions).toContain('seekto');
      expect(registeredActions).toContain('seekforward');
      expect(registeredActions).toContain('seekbackward');
    });

    it('should call onPlay when play action is triggered', () => {
      const onPlay = vi.fn();
      const options = createDefaultOptions({ onPlay });
      
      renderHook(() => useMediaSession(options));

      // Find the play handler
      const playCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'play');
      const playHandler = playCall?.[1];
      
      expect(playHandler).toBeDefined();
      playHandler?.();
      
      expect(onPlay).toHaveBeenCalled();
    });

    it('should call onPause when pause action is triggered', () => {
      const onPause = vi.fn();
      const options = createDefaultOptions({ onPause });
      
      renderHook(() => useMediaSession(options));

      const pauseCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'pause');
      const pauseHandler = pauseCall?.[1];
      
      expect(pauseHandler).toBeDefined();
      pauseHandler?.();
      
      expect(onPause).toHaveBeenCalled();
    });

    it('should call onNext when nexttrack action is triggered and hasNextTrack is true', () => {
      const onNext = vi.fn();
      const options = createDefaultOptions({ onNext, hasNextTrack: true });
      
      renderHook(() => useMediaSession(options));

      const nextCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'nexttrack');
      const nextHandler = nextCall?.[1];
      
      expect(nextHandler).toBeDefined();
      nextHandler?.();
      
      expect(onNext).toHaveBeenCalled();
    });

    it('should not call onNext when nexttrack action is triggered but hasNextTrack is false', () => {
      const onNext = vi.fn();
      const options = createDefaultOptions({ onNext, hasNextTrack: false });
      
      renderHook(() => useMediaSession(options));

      const nextCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'nexttrack');
      const nextHandler = nextCall?.[1];
      
      expect(nextHandler).toBeDefined();
      nextHandler?.();
      
      // Handler should not call onNext when hasNextTrack is false
      expect(onNext).not.toHaveBeenCalled();
    });

    it('should call onPrevious when previoustrack action is triggered and hasPreviousTrack is true', () => {
      const onPrevious = vi.fn();
      const options = createDefaultOptions({ onPrevious, hasPreviousTrack: true });
      
      renderHook(() => useMediaSession(options));

      const prevCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'previoustrack');
      const prevHandler = prevCall?.[1];
      
      expect(prevHandler).toBeDefined();
      prevHandler?.();
      
      expect(onPrevious).toHaveBeenCalled();
    });

    it('should not call onPrevious when previoustrack action is triggered but hasPreviousTrack is false', () => {
      const onPrevious = vi.fn();
      const options = createDefaultOptions({ onPrevious, hasPreviousTrack: false });
      
      renderHook(() => useMediaSession(options));

      const prevCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'previoustrack');
      const prevHandler = prevCall?.[1];
      
      expect(prevHandler).toBeDefined();
      prevHandler?.();
      
      // Handler should not call onPrevious when hasPreviousTrack is false
      expect(onPrevious).not.toHaveBeenCalled();
    });

    it('should call onSeek with correct position when seekto action is triggered', () => {
      const onSeek = vi.fn();
      const options = createDefaultOptions({ onSeek });
      
      renderHook(() => useMediaSession(options));

      const seekCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'seekto');
      const seekHandler = seekCall?.[1];
      
      expect(seekHandler).toBeDefined();
      seekHandler?.({ seekTime: 30 });
      
      expect(onSeek).toHaveBeenCalledWith(30);
    });

    it('should remove all action handlers on unmount', () => {
      const options = createDefaultOptions();
      
      const { unmount } = renderHook(() => useMediaSession(options));

      mockSetActionHandler.mockClear();
      
      unmount();

      // Check that all handlers were set to null
      const nullCalls = mockSetActionHandler.mock.calls.filter(call => call[1] === null);
      const nullActions = nullCalls.map(call => call[0]);
      
      expect(nullActions).toContain('play');
      expect(nullActions).toContain('pause');
      expect(nullActions).toContain('stop');
      expect(nullActions).toContain('nexttrack');
      expect(nullActions).toContain('previoustrack');
      expect(nullActions).toContain('seekto');
      expect(nullActions).toContain('seekforward');
      expect(nullActions).toContain('seekbackward');
    });
  });

  describe('position state updates', () => {
    it('should update position state when progress and duration are valid', () => {
      const options = createDefaultOptions({
        progress: 30,
        duration: 180,
      });
      
      renderHook(() => useMediaSession(options));

      expect(mockSetPositionState).toHaveBeenCalledWith(
        expect.objectContaining({
          position: 30,
          duration: 180,
        })
      );
    });

    it('should not update position state when duration is zero', () => {
      const options = createDefaultOptions({
        progress: 30,
        duration: 0,
      });
      
      renderHook(() => useMediaSession(options));

      expect(mockSetPositionState).not.toHaveBeenCalled();
    });
  });

  describe('iOS behavior', () => {
    it('should prefer track navigation and clear seek handlers on iOS', () => {
      mockGetPlatformInfo.mockReturnValue({
        ...defaultPlatformInfo,
        platform: 'ios',
        browser: 'safari',
        supportsHLS: true,
      });

      const options = createDefaultOptions({
        currentSong: mockSong,
        hasNextTrack: true,
        hasPreviousTrack: true,
      });

      renderHook(() => useMediaSession(options));

      const seekForwardCalls = mockSetActionHandler.mock.calls.filter(call => call[0] === 'seekforward');
      const seekBackwardCalls = mockSetActionHandler.mock.calls.filter(call => call[0] === 'seekbackward');

      expect(seekForwardCalls.length).toBeGreaterThan(0);
      expect(seekForwardCalls.every(([, handler]) => handler === null)).toBe(true);
      expect(seekBackwardCalls.every(([, handler]) => handler === null)).toBe(true);

      const nextCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'nexttrack');
      const prevCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'previoustrack');

      expect(nextCall?.[1]).toBeDefined();
      expect(prevCall?.[1]).toBeDefined();
    });

    it('should fall back to iOS user agent detection when platform info is desktop', () => {
      mockGetPlatformInfo.mockReturnValue(defaultPlatformInfo);
      setIOSUserAgent();

      const options = createDefaultOptions({
        currentSong: mockSong,
        hasNextTrack: true,
        hasPreviousTrack: true,
      });

      renderHook(() => useMediaSession(options));

      const seekForwardCalls = mockSetActionHandler.mock.calls.filter(call => call[0] === 'seekforward');
      const seekBackwardCalls = mockSetActionHandler.mock.calls.filter(call => call[0] === 'seekbackward');

      expect(seekForwardCalls.length).toBeGreaterThan(0);
      expect(seekForwardCalls.every(([, handler]) => handler === null)).toBe(true);
      expect(seekBackwardCalls.every(([, handler]) => handler === null)).toBe(true);

      const nextCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'nexttrack');
      const prevCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'previoustrack');

      expect(nextCall?.[1]).toBeDefined();
      expect(prevCall?.[1]).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle missing onStop by calling onPause', () => {
      const onPause = vi.fn();
      const options = createDefaultOptions({ onPause, onStop: undefined });
      
      renderHook(() => useMediaSession(options));

      const stopCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'stop');
      const stopHandler = stopCall?.[1];
      
      expect(stopHandler).toBeDefined();
      stopHandler?.();
      
      expect(onPause).toHaveBeenCalled();
    });

    it('should call onStop when provided', () => {
      const onStop = vi.fn();
      const onPause = vi.fn();
      const options = createDefaultOptions({ onPause, onStop });
      
      renderHook(() => useMediaSession(options));

      const stopCall = mockSetActionHandler.mock.calls.find(call => call[0] === 'stop');
      const stopHandler = stopCall?.[1];
      
      expect(stopHandler).toBeDefined();
      stopHandler?.();
      
      expect(onStop).toHaveBeenCalled();
      expect(onPause).not.toHaveBeenCalled();
    });
  });
});
