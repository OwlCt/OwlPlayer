import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'fs';
import * as path from 'path';

// **Feature: spotify-mobile-ui, Property 15: Safe Area Handling**
// **Validates: Requirements 9.4**

// Read the CSS file content
const cssFilePath = path.resolve(__dirname, '../../index.css');
const cssContent = fs.readFileSync(cssFilePath, 'utf-8');

// Safe area CSS class definitions that should exist
const REQUIRED_SAFE_AREA_CLASSES = [
  'safe-area-top',
  'safe-area-bottom',
  'safe-area-left',
  'safe-area-right',
  'safe-area-x',
  'safe-area-y',
  'safe-area-all',
] as const;

// CSS properties that should use env() for safe areas
const SAFE_AREA_ENV_PROPERTIES = [
  'env(safe-area-inset-top)',
  'env(safe-area-inset-bottom)',
  'env(safe-area-inset-left)',
  'env(safe-area-inset-right)',
] as const;

// Function to check if a CSS class is defined in the stylesheet
function isCssClassDefined(cssContent: string, className: string): boolean {
  // Match class definition like .class-name { or .class-name,
  const classPattern = new RegExp(`\\.${className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[{,]`);
  return classPattern.test(cssContent);
}

// Function to check if CSS content uses safe area env() function
function usesSafeAreaEnv(cssContent: string, envProperty: string): boolean {
  return cssContent.includes(envProperty);
}

// Function to extract CSS rules for a given class
function getCssRulesForClass(cssContent: string, className: string): string | null {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\.${escapedClassName}\\s*\\{([^}]*)\\}`, 'g');
  const match = pattern.exec(cssContent);
  return match ? match[1] : null;
}

describe('Safe Area Handling', () => {
  // **Feature: spotify-mobile-ui, Property 15: Safe Area Handling**
  // **Validates: Requirements 9.4**
  describe('Property 15: Safe Area Handling', () => {
    it('should define all required safe area CSS classes', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...REQUIRED_SAFE_AREA_CLASSES),
          (className) => {
            expect(isCssClassDefined(cssContent, className)).toBe(true);
          }
        ),
        { numRuns: REQUIRED_SAFE_AREA_CLASSES.length }
      );
    });

    it('should use env() function for safe area insets', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...SAFE_AREA_ENV_PROPERTIES),
          (envProperty) => {
            expect(usesSafeAreaEnv(cssContent, envProperty)).toBe(true);
          }
        ),
        { numRuns: SAFE_AREA_ENV_PROPERTIES.length }
      );
    });

    it('should have safe-area-top class with padding-top using env(safe-area-inset-top)', () => {
      const rules = getCssRulesForClass(cssContent, 'safe-area-top');
      expect(rules).not.toBeNull();
      expect(rules).toContain('padding-top');
      expect(rules).toContain('env(safe-area-inset-top)');
    });

    it('should have safe-area-bottom class with padding-bottom using env(safe-area-inset-bottom)', () => {
      const rules = getCssRulesForClass(cssContent, 'safe-area-bottom');
      expect(rules).not.toBeNull();
      expect(rules).toContain('padding-bottom');
      expect(rules).toContain('env(safe-area-inset-bottom)');
    });

    it('should have safe-area-all class with all four safe area insets', () => {
      const rules = getCssRulesForClass(cssContent, 'safe-area-all');
      expect(rules).not.toBeNull();
      expect(rules).toContain('env(safe-area-inset-top)');
      expect(rules).toContain('env(safe-area-inset-bottom)');
      expect(rules).toContain('env(safe-area-inset-left)');
      expect(rules).toContain('env(safe-area-inset-right)');
    });

    it('should have standalone mode specific styles', () => {
      // Check for @media all and (display-mode: standalone) rule
      expect(cssContent).toContain('display-mode: standalone');
    });

    it('should have iOS Safari specific fixes', () => {
      // Check for @supports (-webkit-touch-callout: none) rule
      expect(cssContent).toContain('-webkit-touch-callout');
    });

    // Property test: For any combination of safe area classes, they should all be defined
    it('should have consistent safe area class definitions', () => {
      const directions = ['top', 'bottom', 'left', 'right'] as const;
      
      fc.assert(
        fc.property(
          fc.constantFrom(...directions),
          (direction) => {
            const className = `safe-area-${direction}`;
            const envProperty = `env(safe-area-inset-${direction})`;
            
            // Class should be defined
            expect(isCssClassDefined(cssContent, className)).toBe(true);
            
            // Class should use the corresponding env() property
            const rules = getCssRulesForClass(cssContent, className);
            expect(rules).toContain(envProperty);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
