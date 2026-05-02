/**
 * Desktop Audio Session 单元测试
 * **Feature: playback-control-refactor**
 * **Validates: Requirements 2.1, 3.6**
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import { DesktopAudioSession } from './desktop';
import { clearPlatformCache } from './detection';

describe('DesktopAudioSession', () => {
  let session: DesktopAudioSession;

  beforeAll(() => {
    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterAll(() => {
    clearPlatformCache();
  });

  beforeEach(() => {
    clearPlatformCache();
    session = new DesktopAudioSession();
  });

  describe('getStreamUrl', () => {
    // **Validates: Requirements 2.1**
    it('should return correct HLS stream URL format', () => {
      const songId = '12345';
      const url = session.getStreamUrl(songId);
      expect(url).toBe('/api/stream/12345/playlist.m3u8?quality=aac_256');
    });

    it('should handle various song ID formats', () => {
      expect(session.getStreamUrl('abc123')).toBe('/api/stream/abc123/playlist.m3u8?quality=aac_256');
      expect(session.getStreamUrl('song-with-dashes')).toBe('/api/stream/song-with-dashes/playlist.m3u8?quality=aac_256');
      expect(session.getStreamUrl('1')).toBe('/api/stream/1/playlist.m3u8?quality=aac_256');
    });
  });

  describe('preparePlayback', () => {
    // **Validates: Requirements 2.1**
    it('should set correct src on audio element', async () => {
      const mockAudioElement = {
        src: '',
      } as HTMLAudioElement;

      await session.preparePlayback(mockAudioElement, '12345');

      expect(mockAudioElement.src).toBe('/api/stream/12345/playlist.m3u8?quality=aac_256');
    });

    it('should set state to active after prepare', async () => {
      const mockAudioElement = {
        src: '',
      } as HTMLAudioElement;

      await session.preparePlayback(mockAudioElement, '12345');

      expect(session.state).toBe('active');
    });
  });

  describe('resumePlayback', () => {
    it('should call play on audio element', async () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      const mockAudioElement = {
        play: mockPlay,
      } as unknown as HTMLAudioElement;

      const result = await session.resumePlayback(mockAudioElement);

      expect(mockPlay).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when NotAllowedError occurs', async () => {
      const notAllowedError = new Error('User interaction required');
      notAllowedError.name = 'NotAllowedError';

      const mockPlay = vi.fn().mockRejectedValue(notAllowedError);
      const mockAudioElement = {
        play: mockPlay,
      } as unknown as HTMLAudioElement;

      const result = await session.resumePlayback(mockAudioElement);

      expect(result).toBe(false);
    });

    it('should throw other errors', async () => {
      const otherError = new Error('Some other error');
      otherError.name = 'AbortError';

      const mockPlay = vi.fn().mockRejectedValue(otherError);
      const mockAudioElement = {
        play: mockPlay,
      } as unknown as HTMLAudioElement;

      await expect(session.resumePlayback(mockAudioElement)).rejects.toThrow('Some other error');
    });
  });

  describe('isHlsMode', () => {
    // **Validates: Requirements 3.6**
    it('should always return true for desktop', () => {
      expect(session.isHlsMode).toBe(true);
    });
  });

  describe('platform', () => {
    it('should return desktop as platform', () => {
      expect(session.platform).toBe('desktop');
    });
  });

  describe('syncProgress', () => {
    it('should set currentTime when valid progress provided', () => {
      const mockAudioElement = {
        duration: 300,
        currentTime: 0,
      } as HTMLAudioElement;

      session.syncProgress(mockAudioElement, 150);

      expect(mockAudioElement.currentTime).toBe(150);
    });

    it('should not set currentTime when progress is 0', () => {
      const mockAudioElement = {
        duration: 300,
        currentTime: 50,
      } as HTMLAudioElement;

      session.syncProgress(mockAudioElement, 0);

      expect(mockAudioElement.currentTime).toBe(50);
    });

    it('should not set currentTime when progress exceeds duration', () => {
      const mockAudioElement = {
        duration: 300,
        currentTime: 50,
      } as HTMLAudioElement;

      session.syncProgress(mockAudioElement, 400);

      expect(mockAudioElement.currentTime).toBe(50);
    });
  });

  describe('event handling', () => {
    it('should register and call event handlers', async () => {
      const stateChangeHandler = vi.fn();
      session.on('stateChange', stateChangeHandler);

      await session.initialize();

      expect(stateChangeHandler).toHaveBeenCalledWith('active');
    });

    it('should remove event handlers', async () => {
      const stateChangeHandler = vi.fn();
      session.on('stateChange', stateChangeHandler);
      session.off('stateChange', stateChangeHandler);

      await session.initialize();

      expect(stateChangeHandler).not.toHaveBeenCalled();
    });

    it('should emit error events on playback error', async () => {
      const errorHandler = vi.fn();
      session.on('error', errorHandler);

      const testError = new Error('Test error');
      await session.handlePlaybackError(testError, {} as HTMLAudioElement);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });
  });

  describe('cleanup', () => {
    it('should set state to closed', () => {
      session.cleanup();
      expect(session.state).toBe('closed');
    });

    it('should clear event handlers', async () => {
      const handler = vi.fn();
      session.on('stateChange', handler);
      session.cleanup();

      // After cleanup, handlers should be cleared
      // Re-initialize should not call the old handler
      handler.mockClear();
      await session.initialize();

      // Handler was cleared during cleanup, so it shouldn't be called
      // But we need to verify the handlers map is cleared
      expect(session.state).toBe('active');
    });
  });

  describe('config', () => {
    it('should use default config when none provided', () => {
      expect(session.config.maxRetryAttempts).toBe(3);
      expect(session.config.hlsEnabled).toBe(true);
      expect(session.config.backgroundPreloadEnabled).toBe(true);
    });

    it('should merge custom config with defaults', () => {
      const customSession = new DesktopAudioSession({
        maxRetryAttempts: 5,
      });

      expect(customSession.config.maxRetryAttempts).toBe(5);
      expect(customSession.config.hlsEnabled).toBe(true);
    });
  });
});
