/**
 * 平台检测属性测试
 * **Feature: playback-control-refactor**
 * **Property 3: Platform Detection and Implementation Selection**
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  detectPlatform,
  clearPlatformCache,
  isIOSPWA,
  isAndroidPWA,
  isMobileDevice,
  type PlatformInfo,
} from './detection';
import type { Platform } from './types';

// ============================================================================
// **Feature: playback-control-refactor**
// Property-based tests for platform detection
// ============================================================================

// 模拟 navigator 和 window 对象
const originalNavigator = global.navigator;
const originalWindow = global.window;

interface MockNavigatorConfig {
  userAgent: string;
  standalone?: boolean;
}

interface MockWindowConfig {
  displayMode: 'standalone' | 'browser';
  hasOntouchend?: boolean;
}

function mockEnvironment(navConfig: MockNavigatorConfig, winConfig: MockWindowConfig) {
  // Mock navigator
  Object.defineProperty(global, 'navigator', {
    value: {
      userAgent: navConfig.userAgent,
      standalone: navConfig.standalone,
      mediaSession: {},
    },
    writable: true,
    configurable: true,
  });

  // Mock window.matchMedia
  Object.defineProperty(global, 'window', {
    value: {
      ...global.window,
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(display-mode: standalone)' && winConfig.displayMode === 'standalone',
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

  // Mock document.ontouchend for iPad detection
  if (winConfig.hasOntouchend) {
    Object.defineProperty(document, 'ontouchend', {
      value: null,
      writable: true,
      configurable: true,
    });
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
}

// User Agent 生成器
const iOSUserAgents = fc.constantFrom(
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
);

const androidUserAgents = fc.constantFrom(
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0'
);

const desktopUserAgents = fc.constantFrom(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
);

describe('Platform Detection', () => {
  beforeEach(() => {
    clearPlatformCache();
  });

  afterEach(() => {
    restoreEnvironment();
    clearPlatformCache();
  });

  // **Feature: playback-control-refactor, Property 3: Platform Detection and Implementation Selection**
  // **Validates: Requirements 3.1, 3.2, 3.3**
  describe('Property 3: Platform Detection and Implementation Selection', () => {
    it('should detect iOS platform for all iOS user agents', () => {
      fc.assert(
        fc.property(iOSUserAgents, fc.boolean(), (userAgent, isPWA) => {
          clearPlatformCache();
          mockEnvironment(
            { userAgent },
            { displayMode: isPWA ? 'standalone' : 'browser' }
          );

          const info = detectPlatform();
          expect(info.platform).toBe('ios');
          expect(info.supportsHLS).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should detect Android platform for all Android user agents', () => {
      fc.assert(
        fc.property(androidUserAgents, fc.boolean(), (userAgent, isPWA) => {
          clearPlatformCache();
          mockEnvironment(
            { userAgent },
            { displayMode: isPWA ? 'standalone' : 'browser' }
          );

          const info = detectPlatform();
          expect(info.platform).toBe('android');
          expect(info.supportsHLS).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should detect Desktop platform for all desktop user agents', () => {
      fc.assert(
        fc.property(desktopUserAgents, fc.boolean(), (userAgent, isPWA) => {
          clearPlatformCache();
          mockEnvironment(
            { userAgent },
            { displayMode: isPWA ? 'standalone' : 'browser' }
          );

          const info = detectPlatform();
          expect(info.platform).toBe('desktop');
          expect(info.supportsHLS).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should return exactly one of three platforms for any user agent', () => {
      const allUserAgents = fc.oneof(iOSUserAgents, androidUserAgents, desktopUserAgents);

      fc.assert(
        fc.property(allUserAgents, fc.boolean(), (userAgent, isPWA) => {
          clearPlatformCache();
          mockEnvironment(
            { userAgent },
            { displayMode: isPWA ? 'standalone' : 'browser' }
          );

          const info = detectPlatform();
          const validPlatforms: Platform[] = ['ios', 'android', 'desktop'];
          expect(validPlatforms).toContain(info.platform);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('PWA Detection', () => {
    it('should detect PWA mode when display-mode is standalone', () => {
      fc.assert(
        fc.property(
          fc.oneof(iOSUserAgents, androidUserAgents, desktopUserAgents),
          (userAgent) => {
            clearPlatformCache();
            mockEnvironment(
              { userAgent },
              { displayMode: 'standalone' }
            );

            const info = detectPlatform();
            expect(info.isPWA).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should detect non-PWA mode when display-mode is browser', () => {
      fc.assert(
        fc.property(
          fc.oneof(iOSUserAgents, androidUserAgents, desktopUserAgents),
          (userAgent) => {
            clearPlatformCache();
            mockEnvironment(
              { userAgent },
              { displayMode: 'browser' }
            );

            const info = detectPlatform();
            expect(info.isPWA).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Browser Detection', () => {
    it('should detect Safari browser correctly', () => {
      const safariUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
      clearPlatformCache();
      mockEnvironment(
        { userAgent: safariUA },
        { displayMode: 'browser' }
      );

      const info = detectPlatform();
      expect(info.browser).toBe('safari');
    });

    it('should detect Chrome browser correctly', () => {
      const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      clearPlatformCache();
      mockEnvironment(
        { userAgent: chromeUA },
        { displayMode: 'browser' }
      );

      const info = detectPlatform();
      expect(info.browser).toBe('chrome');
    });

    it('should detect Firefox browser correctly', () => {
      const firefoxUA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0';
      clearPlatformCache();
      mockEnvironment(
        { userAgent: firefoxUA },
        { displayMode: 'browser' }
      );

      const info = detectPlatform();
      expect(info.browser).toBe('firefox');
    });
  });

  describe('Helper Functions', () => {
    it('isIOSPWA should return true only for iOS in PWA mode', () => {
      fc.assert(
        fc.property(iOSUserAgents, () => {
          clearPlatformCache();
          mockEnvironment(
            { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
            { displayMode: 'standalone' }
          );

          expect(isIOSPWA()).toBe(true);
        }),
        { numRuns: 10 }
      );

      // Non-PWA iOS should return false
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        { displayMode: 'browser' }
      );
      expect(isIOSPWA()).toBe(false);
    });

    it('isAndroidPWA should return true only for Android in PWA mode', () => {
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0' },
        { displayMode: 'standalone' }
      );

      expect(isAndroidPWA()).toBe(true);

      // Non-PWA Android should return false
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0' },
        { displayMode: 'browser' }
      );
      expect(isAndroidPWA()).toBe(false);
    });

    it('isMobileDevice should return true for iOS and Android', () => {
      // iOS
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        { displayMode: 'browser' }
      );
      expect(isMobileDevice()).toBe(true);

      // Android
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' },
        { displayMode: 'browser' }
      );
      expect(isMobileDevice()).toBe(true);

      // Desktop
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        { displayMode: 'browser' }
      );
      expect(isMobileDevice()).toBe(false);
    });
  });

  describe('Caching Behavior', () => {
    it('should return cached result on subsequent calls', () => {
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        { displayMode: 'standalone' }
      );

      const first = detectPlatform();
      const second = detectPlatform();

      expect(first).toBe(second); // Same reference
    });

    it('should return fresh result after cache clear', () => {
      clearPlatformCache();
      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
        { displayMode: 'standalone' }
      );

      const first = detectPlatform();
      clearPlatformCache();

      mockEnvironment(
        { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' },
        { displayMode: 'browser' }
      );

      const second = detectPlatform();

      expect(first.platform).toBe('ios');
      expect(second.platform).toBe('android');
    });
  });
});
