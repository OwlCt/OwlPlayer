/**
 * Property-based tests for iOS PWA detection utility
 * 
 * **Feature: ios-pwa-hls-playback, Property 2: Non-iOS detection returns false**
 * **Validates: Requirements 2.3**
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

// We need to test the module with mocked globals, so we'll use dynamic imports
describe('iOS PWA Detection - Property Tests', () => {
  // Store original values
  const originalNavigator = global.navigator;
  const originalWindow = global.window;
  const originalDocument = global.document;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original values
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
  });

  /**
   * Property 2: Non-iOS detection returns false
   * *For any* non-iOS device (Android, Windows, macOS desktop, Linux), 
   * the `isIOSPWA()` function SHALL return false regardless of standalone mode status.
   * 
   * **Validates: Requirements 2.3**
   */
  describe('Property 2: Non-iOS detection returns false', () => {
    // Generator for non-iOS user agents
    const nonIOSUserAgentArb = fc.oneof(
      // Android devices
      fc.constant('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'),
      fc.constant('Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'),
      fc.constant('Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-A515F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'),
      // Windows desktop
      fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
      fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'),
      fc.constant('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'),
      // macOS desktop (without touch - not iPad)
      fc.constant('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
      fc.constant('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'),
      // Linux desktop
      fc.constant('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'),
      fc.constant('Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'),
      // Chrome OS
      fc.constant('Mozilla/5.0 (X11; CrOS x86_64 15633.69.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.212 Safari/537.36'),
    );

    // Generator for standalone mode status
    const standaloneModeArb = fc.boolean();

    it('should return false for any non-iOS device regardless of standalone mode', async () => {
      await fc.assert(
        fc.asyncProperty(nonIOSUserAgentArb, standaloneModeArb, async (userAgent, isStandalone) => {
          // Mock navigator
          Object.defineProperty(global, 'navigator', {
            value: {
              userAgent,
              standalone: isStandalone, // Even if standalone is true, should return false for non-iOS
            },
            writable: true,
            configurable: true,
          });

          // Mock document without ontouchend (non-iPad)
          Object.defineProperty(global, 'document', {
            value: {},
            writable: true,
            configurable: true,
          });

          // Mock window with matchMedia
          Object.defineProperty(global, 'window', {
            value: {
              matchMedia: (query: string) => ({
                matches: isStandalone && query === '(display-mode: standalone)',
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
              }),
            },
            writable: true,
            configurable: true,
          });

          // Dynamically import to get fresh module with mocked globals
          const { isIOSPWA, isIOSDevice } = await import('./iosPwaDetection');

          // Non-iOS device should not be detected as iOS
          expect(isIOSDevice()).toBe(false);
          // Therefore isIOSPWA should always be false
          expect(isIOSPWA()).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional property: iOS device detection is correct
   * Validates that iOS user agents are correctly identified
   */
  describe('iOS device detection correctness', () => {
    const iOSUserAgentArb = fc.oneof(
      // iPhone
      fc.constant('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'),
      fc.constant('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'),
      // iPad
      fc.constant('Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'),
      // iPod
      fc.constant('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1'),
    );

    it('should correctly identify iOS devices', async () => {
      await fc.assert(
        fc.asyncProperty(iOSUserAgentArb, async (userAgent) => {
          Object.defineProperty(global, 'navigator', {
            value: { userAgent, standalone: false },
            writable: true,
            configurable: true,
          });

          Object.defineProperty(global, 'document', {
            value: {},
            writable: true,
            configurable: true,
          });

          const { isIOSDevice } = await import('./iosPwaDetection');
          expect(isIOSDevice()).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property: iOS PWA detection requires both iOS device AND standalone mode
   */
  describe('iOS PWA requires both conditions', () => {
    it('should return true only when both iOS device and standalone mode are true', async () => {
      const iPhoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1';

      await fc.assert(
        fc.asyncProperty(fc.boolean(), fc.boolean(), async (navigatorStandalone, displayModeStandalone) => {
          Object.defineProperty(global, 'navigator', {
            value: { userAgent: iPhoneUA, standalone: navigatorStandalone },
            writable: true,
            configurable: true,
          });

          Object.defineProperty(global, 'document', {
            value: {},
            writable: true,
            configurable: true,
          });

          Object.defineProperty(global, 'window', {
            value: {
              matchMedia: (query: string) => ({
                matches: displayModeStandalone && query === '(display-mode: standalone)',
                media: query,
                onchange: null,
                addListener: () => {},
                removeListener: () => {},
                addEventListener: () => {},
                removeEventListener: () => {},
                dispatchEvent: () => false,
              }),
            },
            writable: true,
            configurable: true,
          });

          const { isIOSPWA, isIOSDevice, isStandaloneMode } = await import('./iosPwaDetection');

          const isIOS = isIOSDevice();
          const isStandalone = isStandaloneMode();
          const isPWA = isIOSPWA();

          // iOS device should always be detected
          expect(isIOS).toBe(true);
          
          // Standalone mode should be true if either navigator.standalone or display-mode matches
          const expectedStandalone = navigatorStandalone || displayModeStandalone;
          expect(isStandalone).toBe(expectedStandalone);
          
          // isIOSPWA should be true only when both conditions are met
          expect(isPWA).toBe(isIOS && expectedStandalone);
        }),
        { numRuns: 100 }
      );
    });
  });
});
