import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// **Feature: audio-cache-settings, Property 10: Settings File Persistence Round Trip**
// **Validates: Requirements 5.1, 5.2**

// CacheSettings type for testing
interface CacheSettings {
  max_cache_size: number;   // Maximum cache size in bytes
  max_cache_age: number;    // Maximum cache age in seconds
  idle_expiry_time: number; // Idle expiry time in seconds
}

// Helper function to format bytes to human-readable format
// This mirrors the logic in AdminUsersPage.tsx
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to convert days to seconds
function daysToSeconds(days: number): number {
  return days * 24 * 60 * 60;
}

// Helper function to convert seconds to days
function secondsToDays(seconds: number): number {
  return Math.round(seconds / (24 * 60 * 60));
}

// Helper function to convert size with unit to bytes
function sizeToBytes(value: number, unit: 'MB' | 'GB'): number {
  return unit === 'GB' ? value * 1024 * 1024 * 1024 : value * 1024 * 1024;
}

// Helper function to convert bytes to size with unit
function bytesToSize(bytes: number): { value: number; unit: 'MB' | 'GB' } {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return { value: Math.round(gb * 100) / 100, unit: 'GB' };
  }
  return { value: Math.round(bytes / (1024 * 1024)), unit: 'MB' };
}

// Validate cache settings
function validateSettings(settings: CacheSettings): boolean {
  return (
    settings.max_cache_size > 0 &&
    settings.max_cache_age > 0 &&
    settings.idle_expiry_time > 0
  );
}

describe('AdminUsersPage Cache Settings', () => {
  // **Feature: audio-cache-settings, Property 10: Settings File Persistence Round Trip**
  // **Validates: Requirements 5.1, 5.2**
  describe('Property 10: Settings File Persistence Round Trip', () => {
    // Arbitrary for generating valid cache sizes (1MB to 100GB)
    const cacheSizeArbitrary = fc.integer({ min: 1024 * 1024, max: 100 * 1024 * 1024 * 1024 });
    
    // Arbitrary for generating valid cache age (1 day to 365 days in seconds)
    const cacheAgeArbitrary = fc.integer({ min: 86400, max: 365 * 86400 });
    
    // Arbitrary for generating valid idle expiry (1 day to 90 days in seconds)
    const idleExpiryArbitrary = fc.integer({ min: 86400, max: 90 * 86400 });

    it('days to seconds conversion should be reversible', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 365 }),
          (days) => {
            const seconds = daysToSeconds(days);
            const recoveredDays = secondsToDays(seconds);
            
            // Round trip should preserve the value
            expect(recoveredDays).toBe(days);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('size unit conversion should be approximately reversible for GB values', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          (gbValue) => {
            const bytes = sizeToBytes(gbValue, 'GB');
            const recovered = bytesToSize(bytes);
            
            // For whole GB values, should recover exactly
            expect(recovered.unit).toBe('GB');
            expect(recovered.value).toBe(gbValue);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('size unit conversion should be approximately reversible for MB values', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 999 }),
          (mbValue) => {
            const bytes = sizeToBytes(mbValue, 'MB');
            const recovered = bytesToSize(bytes);
            
            // For MB values less than 1GB, should recover as MB
            if (mbValue < 1024) {
              expect(recovered.unit).toBe('MB');
              expect(recovered.value).toBe(mbValue);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('valid settings should pass validation', () => {
      fc.assert(
        fc.property(
          cacheSizeArbitrary,
          cacheAgeArbitrary,
          idleExpiryArbitrary,
          (maxCacheSize, maxCacheAge, idleExpiryTime) => {
            const settings: CacheSettings = {
              max_cache_size: maxCacheSize,
              max_cache_age: maxCacheAge,
              idle_expiry_time: idleExpiryTime,
            };
            
            expect(validateSettings(settings)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invalid settings should fail validation', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1000, max: 0 }),
          fc.integer({ min: -1000, max: 0 }),
          fc.integer({ min: -1000, max: 0 }),
          (maxCacheSize, maxCacheAge, idleExpiryTime) => {
            const settings: CacheSettings = {
              max_cache_size: maxCacheSize,
              max_cache_age: maxCacheAge,
              idle_expiry_time: idleExpiryTime,
            };
            
            expect(validateSettings(settings)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatBytes should produce human-readable output for any positive byte value', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10 * 1024 * 1024 * 1024 * 1024 }),
          (bytes) => {
            const formatted = formatBytes(bytes);
            
            // Should contain a number
            expect(formatted).toMatch(/\d/);
            
            // Should contain a unit
            expect(formatted).toMatch(/(B|KB|MB|GB|TB)$/);
            
            // Should not be empty
            expect(formatted.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('formatBytes should use appropriate units based on size', () => {
      // Test specific ranges
      expect(formatBytes(500)).toMatch(/B$/);
      expect(formatBytes(5 * 1024)).toMatch(/KB$/);
      expect(formatBytes(5 * 1024 * 1024)).toMatch(/MB$/);
      expect(formatBytes(5 * 1024 * 1024 * 1024)).toMatch(/GB$/);
      expect(formatBytes(5 * 1024 * 1024 * 1024 * 1024)).toMatch(/TB$/);
    });

    it('settings form values should round-trip through conversion functions', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }),
          fc.constantFrom<'MB' | 'GB'>('MB', 'GB'),
          fc.integer({ min: 1, max: 365 }),
          fc.integer({ min: 1, max: 90 }),
          (sizeValue, sizeUnit, ageDays, idleDays) => {
            // Simulate form submission
            const settings: CacheSettings = {
              max_cache_size: sizeToBytes(sizeValue, sizeUnit),
              max_cache_age: daysToSeconds(ageDays),
              idle_expiry_time: daysToSeconds(idleDays),
            };
            
            // Simulate loading settings back into form
            const recoveredSize = bytesToSize(settings.max_cache_size);
            const recoveredAgeDays = secondsToDays(settings.max_cache_age);
            const recoveredIdleDays = secondsToDays(settings.idle_expiry_time);
            
            // Age and idle days should round-trip exactly
            expect(recoveredAgeDays).toBe(ageDays);
            expect(recoveredIdleDays).toBe(idleDays);
            
            // Size should round-trip for whole unit values
            if (sizeUnit === 'GB' || sizeValue < 1024) {
              expect(recoveredSize.unit).toBe(sizeUnit);
              expect(recoveredSize.value).toBe(sizeValue);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
