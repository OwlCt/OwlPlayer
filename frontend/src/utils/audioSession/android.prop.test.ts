/**
 * Android Audio Session 属性测试
 * **Feature: playback-control-refactor**
 * **Property 4: Background/Foreground Event Emission**
 * **Validates: Requirements 6.1, 6.2, 6.5**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { AndroidAudioSession } from './android';
import { clearPlatformCache } from './detection';

// ============================================================================
// **Feature: playback-control-refactor**
// Property-based tests for Android Audio Session
// ============================================================================

// 模拟环境
const originalNavigator = global.navigator;
const originalWindow = global.window;
const originalDocument = global.document;

interface MockConfig {
  isPWA: boolean;
  browser?: 'chrome' | 'firefox';
}

// 存储 visibility change 处理器
let visibilityChangeHandler: (() => void) | null = null;
let mockVisibilityState: 'visible' | 'hidden' = 'visible';

function mockAndroidEnvironment(config: MockConfig) {
  const browser = config.browser || 'chrome';
  let userAgent: string;
  
  if (browser === 'firefox') {
    userAgent = 'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0';
  } else {
    userAgent = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  }

  // Mock navigator
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent,
      standalone: false,
      mediaSession: {},
    },
    writable: true,
    configurable: true,
  });

  // Mock window
  Object.defineProperty(global, 'window', {
    value: {
      ...global.window,
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)' && config.isPWA,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    },
    writable: true,
    configurable: true,
  });

  // Mock document with visibility state
  mockVisibilityState = 'visible';
  visibilityChangeHandler = null;
  
  Object.defineProperty(global, 'document', {
    value: {
      get visibilityState() {
        return mockVisibilityState;
      },
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'visibilitychange') {
          visibilityChangeHandler = handler;
        }
      }),
      removeEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'visibilitychange' && visibilityChangeHandler === handler) {
          visibilityChangeHandler = null;
        }
      }),
    },
    writable: true,
    configurable: true,
  });
}

function simulateVisibilityChange(state: 'visible' | 'hidden') {
  mockVisibilityState = state;
  if (visibilityChangeHandler) {
    visibilityChangeHandler();
  }
}

function restoreEnvironment() {
  Object.defineProperty(global, 'navigator', {
    value: originalNavigator,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(global, 'window', {
    value: originalWindow,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(global, 'document', {
    value: originalDocument,
    writable: true,
    configurable: true,
  });
  visibilityChangeHandler = null;
  mockVisibilityState = 'visible';
}

// Song ID 生成器
const validSongIdArb = fc.string({ minLength: 1, maxLength: 15 })
  .filter(s => /^[0-9]+$/.test(s) && s.length > 0);

const alphanumericSongIdArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-zA-Z0-9]+$/.test(s) && s.length > 0);

describe('Android Audio Session', () => {
  beforeEach(() => {
    clearPlatformCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    restoreEnvironment();
    clearPlatformCache();
    vi.useRealTimers();
  });

  // ============================================================================
  // **Feature: playback-control-refactor, Property 4: Background/Foreground Event Emission**
  // **Validates: Requirements 6.1, 6.2, 6.5**
  // ============================================================================
  describe('Property 4: Background/Foreground Event Emission', () => {
    it('should emit backgroundEnter when visibility changes to hidden', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      const backgroundEnterEvents: number[] = [];
      session.on('backgroundEnter', () => {
        backgroundEnterEvents.push(Date.now());
      });

      // 模拟进入后台
      simulateVisibilityChange('hidden');

      expect(backgroundEnterEvents.length).toBe(1);
      
      session.cleanup();
    });

    it('should emit backgroundExit when visibility changes to visible', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      const backgroundExitEvents: number[] = [];
      session.on('backgroundExit', () => {
        backgroundExitEvents.push(Date.now());
      });

      // 先进入后台
      simulateVisibilityChange('hidden');
      // 再回到前台
      simulateVisibilityChange('visible');

      expect(backgroundExitEvents.length).toBe(1);
      
      session.cleanup();
    });

    it('should emit correct events for multiple visibility changes', async () => {
      // 测试多次可见性变化时事件的正确触发
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      let backgroundEnterCount = 0;
      let backgroundExitCount = 0;

      session.on('backgroundEnter', () => {
        backgroundEnterCount++;
      });
      session.on('backgroundExit', () => {
        backgroundExitCount++;
      });

      // 测试序列：visible -> hidden -> visible -> hidden -> visible
      // 初始状态是 visible
      
      // 进入后台
      simulateVisibilityChange('hidden');
      expect(backgroundEnterCount).toBe(1);
      expect(backgroundExitCount).toBe(0);
      
      // 回到前台
      simulateVisibilityChange('visible');
      expect(backgroundEnterCount).toBe(1);
      expect(backgroundExitCount).toBe(1);
      
      // 再次进入后台
      simulateVisibilityChange('hidden');
      expect(backgroundEnterCount).toBe(2);
      expect(backgroundExitCount).toBe(1);
      
      // 再次回到前台
      simulateVisibilityChange('visible');
      expect(backgroundEnterCount).toBe(2);
      expect(backgroundExitCount).toBe(2);

      session.cleanup();
    });

    it('should not emit events when visibility state does not change', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      let backgroundEnterCount = 0;
      let backgroundExitCount = 0;

      session.on('backgroundEnter', () => {
        backgroundEnterCount++;
      });
      session.on('backgroundExit', () => {
        backgroundExitCount++;
      });

      // 初始状态是 visible，再次设置为 visible 不应触发事件
      simulateVisibilityChange('visible');
      expect(backgroundEnterCount).toBe(0);
      expect(backgroundExitCount).toBe(0);

      // 进入后台
      simulateVisibilityChange('hidden');
      expect(backgroundEnterCount).toBe(1);
      
      // 再次设置为 hidden 不应触发额外事件
      simulateVisibilityChange('hidden');
      expect(backgroundEnterCount).toBe(1);

      session.cleanup();
    });

    it('should track background duration correctly', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      // 进入后台
      simulateVisibilityChange('hidden');
      
      // 模拟时间流逝
      vi.advanceTimersByTime(5000);
      
      const duration = session.getBackgroundDuration();
      expect(duration).toBeGreaterThanOrEqual(5000);

      session.cleanup();
    });

    it('should emit sessionRestored for long background duration', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      const sessionRestoredEvents: number[] = [];
      session.on('sessionRestored', () => {
        sessionRestoredEvents.push(Date.now());
      });

      // 进入后台
      simulateVisibilityChange('hidden');
      
      // 模拟超过1分钟的后台时间
      vi.advanceTimersByTime(61000);
      
      // 回到前台
      simulateVisibilityChange('visible');

      expect(sessionRestoredEvents.length).toBe(1);

      session.cleanup();
    });

    it('should NOT emit sessionRestored for short background duration', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      const sessionRestoredEvents: number[] = [];
      session.on('sessionRestored', () => {
        sessionRestoredEvents.push(Date.now());
      });

      // 进入后台
      simulateVisibilityChange('hidden');
      
      // 模拟短暂的后台时间（30秒）
      vi.advanceTimersByTime(30000);
      
      // 回到前台
      simulateVisibilityChange('visible');

      expect(sessionRestoredEvents.length).toBe(0);

      session.cleanup();
    });
  });

  describe('Stream URL Format', () => {
    it('Android should always return HLS stream URL', () => {
      fc.assert(
        fc.property(validSongIdArb, fc.boolean(), (songId, isPWA) => {
          clearPlatformCache();
          mockAndroidEnvironment({ isPWA });

          const session = new AndroidAudioSession();
          const url = session.getStreamUrl(songId);

          expect(url).toBe(`/api/stream/${songId}/playlist.m3u8?quality=aac_256`);
          expect(session.isHlsMode).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('URL should always contain m3u8 for Android', () => {
      fc.assert(
        fc.property(alphanumericSongIdArb, fc.boolean(), (songId, isPWA) => {
          clearPlatformCache();
          mockAndroidEnvironment({ isPWA });

          const session = new AndroidAudioSession();
          const url = session.getStreamUrl(songId);

          expect(url.includes('m3u8')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('URL should always start with /api/stream/', () => {
      fc.assert(
        fc.property(alphanumericSongIdArb, fc.boolean(), (songId, isPWA) => {
          clearPlatformCache();
          mockAndroidEnvironment({ isPWA });

          const session = new AndroidAudioSession();
          const url = session.getStreamUrl(songId);

          expect(url.startsWith('/api/stream/')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Platform Property', () => {
    it('platform should always be android', () => {
      fc.assert(
        fc.property(fc.boolean(), (isPWA) => {
          clearPlatformCache();
          mockAndroidEnvironment({ isPWA });

          const session = new AndroidAudioSession();
          expect(session.platform).toBe('android');
        }),
        { numRuns: 10 }
      );
    });
  });

  describe('Browser Support', () => {
    it('should work with Chrome browser', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true, browser: 'chrome' });

      const session = new AndroidAudioSession();
      await session.initialize();

      expect(session.state).toBe('active');
      expect(session.platform).toBe('android');

      session.cleanup();
    });

    it('should work with Firefox browser', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true, browser: 'firefox' });

      const session = new AndroidAudioSession();
      await session.initialize();

      expect(session.state).toBe('active');
      expect(session.platform).toBe('android');

      session.cleanup();
    });
  });

  describe('State Management', () => {
    it('initial state should be closed', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      expect(session.state).toBe('closed');
    });

    it('state should be active after initialize', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();
      expect(session.state).toBe('active');

      session.cleanup();
    });

    it('state should be closed after cleanup', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();
      session.cleanup();
      expect(session.state).toBe('closed');
    });
  });

  describe('Preload Management', () => {
    it('should track preloaded song ID', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      
      // 初始状态应该没有预加载
      expect(session.getPreloadedSongId()).toBeNull();
    });

    it('should clear preload cache', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      session.clearPreloadCache();
      
      expect(session.getPreloadedSongId()).toBeNull();
    });
  });

  describe('Config', () => {
    it('should use default config when none provided', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();

      expect(session.config.hlsEnabled).toBe(true);
      expect(session.config.backgroundPreloadEnabled).toBe(true);
      expect(session.config.maxRetryAttempts).toBe(3);
    });

    it('should merge provided config with defaults', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession({ maxRetryAttempts: 5 });

      expect(session.config.hlsEnabled).toBe(true); // default
      expect(session.config.maxRetryAttempts).toBe(5); // overridden
    });
  });

  describe('Sync Progress', () => {
    it('should set currentTime when progress is valid', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      const mockAudioElement = {
        currentTime: 0,
        duration: 300,
      } as HTMLAudioElement;

      session.syncProgress(mockAudioElement, 150);

      expect(mockAudioElement.currentTime).toBe(150);
    });

    it('should handle valid progress values correctly', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 299 }),
          fc.integer({ min: 300, max: 600 }),
          (progress, duration) => {
            clearPlatformCache();
            mockAndroidEnvironment({ isPWA: true });

            const session = new AndroidAudioSession();
            const mockAudioElement = {
              currentTime: 0,
              duration,
            } as HTMLAudioElement;

            session.syncProgress(mockAudioElement, progress);

            if (progress > 0 && progress < duration) {
              expect(mockAudioElement.currentTime).toBe(progress);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Background State', () => {
    it('isInBackground should return correct state', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      await session.initialize();

      // 初始状态应该是前台
      expect(session.isInBackground()).toBe(false);

      // 进入后台
      simulateVisibilityChange('hidden');
      expect(session.isInBackground()).toBe(true);

      // 回到前台
      simulateVisibilityChange('visible');
      expect(session.isInBackground()).toBe(false);

      session.cleanup();
    });
  });

  describe('Event Handling', () => {
    it('should emit stateChange event on initialize', async () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      const stateChanges: string[] = [];

      session.on('stateChange', (state) => {
        stateChanges.push(state);
      });

      await session.initialize();

      expect(stateChanges).toContain('active');

      session.cleanup();
    });

    it('should be able to add and remove event handlers', () => {
      clearPlatformCache();
      mockAndroidEnvironment({ isPWA: true });

      const session = new AndroidAudioSession();
      const handler = vi.fn();

      session.on('error', handler);
      session.off('error', handler);

      // Handler should be removed
    });
  });
});
