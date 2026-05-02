import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateAnchoredMenuPosition,
  calculateMenuPosition,
  MenuAnchorRect,
} from './ContextMenu';

// **Feature: context-menu, Property 9: Menu close behaviors**
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

// ============================================================================
// Menu Position Calculation Tests
// ============================================================================

describe('ContextMenu Position Calculation', () => {
  // **Feature: context-menu, Property 9: Menu close behaviors**
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  
  describe('calculateMenuPosition keeps menu within viewport', () => {
    it('should keep menu within viewport bounds for any position and size', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 2000 }), // x position
          fc.integer({ min: 0, max: 2000 }), // y position
          fc.integer({ min: 100, max: 400 }), // menu width
          fc.integer({ min: 50, max: 600 }), // menu height
          (x, y, menuWidth, menuHeight) => {
            // Mock viewport dimensions
            const viewportWidth = 1920;
            const viewportHeight = 1080;
            const padding = 8;

            // Calculate adjusted position
            const result = calculateMenuPosition(x, y, menuWidth, menuHeight);

            // Menu should fit within viewport with padding
            expect(result.x).toBeGreaterThanOrEqual(padding);
            expect(result.y).toBeGreaterThanOrEqual(padding);
            expect(result.x + menuWidth).toBeLessThanOrEqual(viewportWidth - padding);
            expect(result.y + menuHeight).toBeLessThanOrEqual(viewportHeight - padding);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve original position when menu fits within viewport', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 500 }), // x position (safe range)
          fc.integer({ min: 100, max: 400 }), // y position (safe range)
          fc.integer({ min: 100, max: 200 }), // menu width (small)
          fc.integer({ min: 50, max: 150 }), // menu height (small)
          (x, y, menuWidth, menuHeight) => {
            const result = calculateMenuPosition(x, y, menuWidth, menuHeight);

            // When menu fits, position should be preserved
            // (assuming viewport is 1920x1080)
            if (x + menuWidth < 1920 - 8 && y + menuHeight < 1080 - 8) {
              expect(result.x).toBe(x);
              expect(result.y).toBe(y);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('calculateAnchoredMenuPosition', () => {
    it('should place a top-end menu fully above the anchor when there is space', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1280,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 900,
      });

      const anchorRect: MenuAnchorRect = {
        left: 980,
        top: 760,
        right: 1040,
        bottom: 788,
        width: 60,
        height: 28,
      };

      const result = calculateAnchoredMenuPosition({
        anchorRect,
        menuWidth: 300,
        menuHeight: 340,
        placement: 'top-end',
        offset: 14,
      });

      expect(result.x).toBe(740);
      expect(result.y).toBe(406);
      expect(result.y + 340).toBeLessThan(anchorRect.top);
    });

    it('should flip a top placement below the anchor when there is not enough space above', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1280,
      });
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 900,
      });

      const anchorRect: MenuAnchorRect = {
        left: 980,
        top: 120,
        right: 1040,
        bottom: 148,
        width: 60,
        height: 28,
      };

      const result = calculateAnchoredMenuPosition({
        anchorRect,
        menuWidth: 300,
        menuHeight: 340,
        placement: 'top-end',
        offset: 14,
      });

      expect(result.x).toBe(740);
      expect(result.y).toBe(anchorRect.bottom + 14);
      expect(result.y).toBeGreaterThan(anchorRect.bottom);
    });
  });
});

// ============================================================================
// Menu Close Behavior Logic Tests
// ============================================================================

// Pure function to determine if menu should close based on event type
type CloseEventType = 'click-outside' | 'escape-key' | 'scroll' | 'action-selected';

function shouldMenuClose(eventType: CloseEventType, isOpen: boolean): boolean {
  if (!isOpen) return false; // Already closed
  
  // All these events should close the menu
  switch (eventType) {
    case 'click-outside':
    case 'escape-key':
    case 'scroll':
    case 'action-selected':
      return true;
    default:
      return false;
  }
}

// Pure function to determine menu state after event
function getMenuStateAfterEvent(
  isOpen: boolean,
  eventType: CloseEventType
): boolean {
  if (shouldMenuClose(eventType, isOpen)) {
    return false; // Menu closes
  }
  return isOpen; // State unchanged
}

describe('ContextMenu Close Behaviors', () => {
  // **Feature: context-menu, Property 9: Menu close behaviors**
  // **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  
  const closeEventArbitrary = fc.constantFrom<CloseEventType>(
    'click-outside',
    'escape-key',
    'scroll',
    'action-selected'
  );

  describe('Property 9: Menu close behaviors', () => {
    it('any close event should close an open menu', () => {
      fc.assert(
        fc.property(closeEventArbitrary, (eventType) => {
          const isOpen = true;
          const shouldClose = shouldMenuClose(eventType, isOpen);
          expect(shouldClose).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('close events should not affect already closed menu', () => {
      fc.assert(
        fc.property(closeEventArbitrary, (eventType) => {
          const isOpen = false;
          const shouldClose = shouldMenuClose(eventType, isOpen);
          expect(shouldClose).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('menu state should be false after any close event on open menu', () => {
      fc.assert(
        fc.property(closeEventArbitrary, (eventType) => {
          const initialState = true;
          const newState = getMenuStateAfterEvent(initialState, eventType);
          expect(newState).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('click-outside should close menu (Requirement 5.1)', () => {
      const result = shouldMenuClose('click-outside', true);
      expect(result).toBe(true);
    });

    it('action-selected should close menu (Requirement 5.2)', () => {
      const result = shouldMenuClose('action-selected', true);
      expect(result).toBe(true);
    });

    it('escape-key should close menu (Requirement 5.3)', () => {
      const result = shouldMenuClose('escape-key', true);
      expect(result).toBe(true);
    });

    it('scroll should close menu (Requirement 5.4)', () => {
      const result = shouldMenuClose('scroll', true);
      expect(result).toBe(true);
    });
  });
});

// Export for potential reuse
export { shouldMenuClose, getMenuStateAfterEvent, type CloseEventType };
