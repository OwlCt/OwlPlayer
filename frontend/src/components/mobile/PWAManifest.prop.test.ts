import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import manifest from '../../../logo/manifest.json';

// **Feature: spotify-mobile-ui, Property 14: PWA Manifest Validity**
// **Validates: Requirements 9.1, 9.2**

// Required fields for a valid PWA manifest
interface PWAManifest {
  name: string;
  short_name?: string;
  icons: Array<{
    src: string;
    sizes: string;
    type: string;
    purpose?: string;
  }>;
  theme_color: string;
  background_color?: string;
  display: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';
  start_url: string;
}

// Validation functions for manifest properties
function isValidHexColor(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function isValidIconSize(sizes: string): boolean {
  // Format: "WxH" where W and H are positive integers
  return /^\d+x\d+$/.test(sizes);
}

function isValidIconType(type: string): boolean {
  return ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(type);
}

function isValidDisplay(display: string): boolean {
  return ['standalone', 'fullscreen', 'minimal-ui', 'browser'].includes(display);
}

function validateManifest(m: PWAManifest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!m.name || typeof m.name !== 'string' || m.name.trim() === '') {
    errors.push('name is required and must be a non-empty string');
  }

  if (!m.icons || !Array.isArray(m.icons) || m.icons.length === 0) {
    errors.push('icons array is required and must have at least one icon');
  } else {
    m.icons.forEach((icon, index) => {
      if (!icon.src) errors.push(`icons[${index}].src is required`);
      if (!icon.sizes || !isValidIconSize(icon.sizes)) {
        errors.push(`icons[${index}].sizes must be in format "WxH"`);
      }
      if (!icon.type || !isValidIconType(icon.type)) {
        errors.push(`icons[${index}].type must be a valid image MIME type`);
      }
    });
  }

  if (!m.theme_color || !isValidHexColor(m.theme_color)) {
    errors.push('theme_color must be a valid hex color');
  }

  if (!m.display || !isValidDisplay(m.display)) {
    errors.push('display must be one of: standalone, fullscreen, minimal-ui, browser');
  }

  if (!m.start_url || typeof m.start_url !== 'string') {
    errors.push('start_url is required');
  }

  return { valid: errors.length === 0, errors };
}

describe('PWA Manifest Validity', () => {
  // **Feature: spotify-mobile-ui, Property 14: PWA Manifest Validity**
  // **Validates: Requirements 9.1, 9.2**
  describe('Property 14: PWA Manifest Validity', () => {
    it('should have a valid app name', () => {
      expect(manifest.name).toBeDefined();
      expect(typeof manifest.name).toBe('string');
      expect(manifest.name.trim().length).toBeGreaterThan(0);
    });

    it('should have valid icons array with required properties', () => {
      expect(manifest.icons).toBeDefined();
      expect(Array.isArray(manifest.icons)).toBe(true);
      expect(manifest.icons.length).toBeGreaterThan(0);

      manifest.icons.forEach((icon) => {
        expect(icon.src).toBeDefined();
        expect(typeof icon.src).toBe('string');
        expect(isValidIconSize(icon.sizes)).toBe(true);
        expect(isValidIconType(icon.type)).toBe(true);
      });
    });

    it('should have valid theme_color as hex color', () => {
      expect(manifest.theme_color).toBeDefined();
      expect(isValidHexColor(manifest.theme_color)).toBe(true);
    });

    it('should have display set to standalone for PWA mode', () => {
      expect(manifest.display).toBe('standalone');
    });

    it('should have a valid start_url', () => {
      expect(manifest.start_url).toBeDefined();
      expect(typeof manifest.start_url).toBe('string');
    });

    it('should pass complete manifest validation', () => {
      const result = validateManifest(manifest as PWAManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    // Property-based test: For any valid manifest structure, validation should be consistent
    it('should consistently validate manifest structure', () => {
      // Generate variations of the manifest with valid values
      const validNameArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);
      // Generate valid hex color using array of hex digits
      const hexDigit = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F');
      const validHexColorArb = fc.tuple(hexDigit, hexDigit, hexDigit, hexDigit, hexDigit, hexDigit)
        .map(digits => `#${digits.join('')}`);
      const validDisplayArb = fc.constantFrom('standalone', 'fullscreen', 'minimal-ui', 'browser') as fc.Arbitrary<'standalone' | 'fullscreen' | 'minimal-ui' | 'browser'>;
      const validIconArb = fc.record({
        src: fc.stringMatching(/^[a-zA-Z0-9_-]+$/).filter(s => s.length > 0).map(s => `/${s}.png`),
        sizes: fc.tuple(fc.integer({ min: 16, max: 1024 }), fc.integer({ min: 16, max: 1024 }))
          .map(([w, h]) => `${w}x${h}`),
        type: fc.constantFrom('image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'),
      });

      fc.assert(
        fc.property(
          validNameArb,
          validHexColorArb,
          validDisplayArb,
          fc.array(validIconArb, { minLength: 1, maxLength: 5 }),
          (name, themeColor, display, icons) => {
            const testManifest: PWAManifest = {
              name,
              theme_color: themeColor,
              display,
              icons,
              start_url: '/',
            };
            const result = validateManifest(testManifest);
            expect(result.valid).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    // Property-based test: Invalid manifests should fail validation
    it('should reject manifests with missing required fields', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('name', 'icons', 'theme_color', 'display', 'start_url'),
          (missingField) => {
            const testManifest: Partial<PWAManifest> = {
              name: 'Test App',
              icons: [{ src: '/icon.png', sizes: '192x192', type: 'image/png' }],
              theme_color: '#000000',
              display: 'standalone',
              start_url: '/',
            };
            
            // Remove the field
            delete testManifest[missingField as keyof PWAManifest];
            
            const result = validateManifest(testManifest as PWAManifest);
            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
