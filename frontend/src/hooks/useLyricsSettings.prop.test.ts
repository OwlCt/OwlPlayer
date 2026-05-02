import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  LyricsSettings,
  serializeSettings,
  deserializeSettings,
  defaultSettings,
} from './useLyricsSettings';

// **Feature: mobile-lyrics-view, Property 12: Translation preference persistence**
// **Validates: Requirements 8.4**

/**
 * Arbitrary for generating valid LyricsSettings.
 */
const lyricsSettingsArb: fc.Arbitrary<LyricsSettings> = fc.record({
  showTranslation: fc.boolean(),
  showTransliteration: fc.boolean(),
  chineseVariant: fc.constantFrom('simplified', 'traditional', 'auto') as fc.Arbitrary<'simplified' | 'traditional' | 'auto'>,
});

describe('Property 12: Translation preference persistence', () => {
  // **Feature: mobile-lyrics-view, Property 12: Translation preference persistence**
  // **Validates: Requirements 8.4**
  
  it('should round-trip serialize and deserialize settings correctly', () => {
    fc.assert(
      fc.property(lyricsSettingsArb, (settings) => {
        const serialized = serializeSettings(settings);
        const deserialized = deserializeSettings(serialized);
        
        expect(deserialized.showTranslation).toBe(settings.showTranslation);
        expect(deserialized.showTransliteration).toBe(settings.showTransliteration);
        expect(deserialized.chineseVariant).toBe(settings.chineseVariant);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve translation preference after serialization', () => {
    fc.assert(
      fc.property(fc.boolean(), (showTranslation) => {
        const settings: LyricsSettings = {
          ...defaultSettings,
          showTranslation,
        };
        
        const serialized = serializeSettings(settings);
        const deserialized = deserializeSettings(serialized);
        
        expect(deserialized.showTranslation).toBe(showTranslation);
      }),
      { numRuns: 100 }
    );
  });

  it('should return default settings when deserializing null', () => {
    const result = deserializeSettings(null);
    expect(result).toEqual(defaultSettings);
  });

  it('should return default settings when deserializing invalid JSON', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => {
          try {
            JSON.parse(s);
            return false; // Valid JSON, skip
          } catch {
            return true; // Invalid JSON, keep
          }
        }),
        (invalidJson) => {
          const result = deserializeSettings(invalidJson);
          expect(result).toEqual(defaultSettings);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should merge partial settings with defaults', () => {
    fc.assert(
      fc.property(fc.boolean(), (showTranslation) => {
        // Partial settings - only showTranslation
        const partialJson = JSON.stringify({ showTranslation });
        const result = deserializeSettings(partialJson);
        
        expect(result.showTranslation).toBe(showTranslation);
        // Other fields should use defaults
        expect(result.showTransliteration).toBe(defaultSettings.showTransliteration);
        expect(result.chineseVariant).toBe(defaultSettings.chineseVariant);
      }),
      { numRuns: 100 }
    );
  });

  it('should produce valid JSON when serializing', () => {
    fc.assert(
      fc.property(lyricsSettingsArb, (settings) => {
        const serialized = serializeSettings(settings);
        
        // Should not throw when parsing
        expect(() => JSON.parse(serialized)).not.toThrow();
        
        // Should be a valid object
        const parsed = JSON.parse(serialized);
        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  it('should handle all chineseVariant values correctly', () => {
    const variants: Array<'simplified' | 'traditional' | 'auto'> = ['simplified', 'traditional', 'auto'];
    
    variants.forEach(variant => {
      const settings: LyricsSettings = {
        ...defaultSettings,
        chineseVariant: variant,
      };
      
      const serialized = serializeSettings(settings);
      const deserialized = deserializeSettings(serialized);
      
      expect(deserialized.chineseVariant).toBe(variant);
    });
  });

  it('should be idempotent - multiple serializations produce same result', () => {
    fc.assert(
      fc.property(lyricsSettingsArb, (settings) => {
        const serialized1 = serializeSettings(settings);
        const serialized2 = serializeSettings(settings);
        
        expect(serialized1).toBe(serialized2);
      }),
      { numRuns: 100 }
    );
  });

  it('should preserve all boolean combinations', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (showTranslation, showTransliteration) => {
        const settings: LyricsSettings = {
          showTranslation,
          showTransliteration,
          chineseVariant: 'auto',
        };
        
        const serialized = serializeSettings(settings);
        const deserialized = deserializeSettings(serialized);
        
        expect(deserialized.showTranslation).toBe(showTranslation);
        expect(deserialized.showTransliteration).toBe(showTransliteration);
      }),
      { numRuns: 100 }
    );
  });
});
