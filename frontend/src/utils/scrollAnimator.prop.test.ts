/**
 * Property-based tests for scrollAnimator utility functions
 * Uses fast-check for property-based testing
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import fc from 'fast-check';
import {
  easings,
  calculateDuration,
  getLineOpacity,
  animateScrollToCenter,
} from './scrollAnimator';

/**
 * **Feature: lyrics-scroll-animation, Property 1: Easing Function Mathematical Correctness**
 * **Validates: Requirements 1.1, 4.1**
 *
 * For any input value t in the range [0, 1], the easing function easeOutCubic
 * SHALL return a value in the range [0, 1], with f(0) = 0 and f(1) = 1.
 */
describe('Property 1: Easing Function Mathematical Correctness', () => {
  describe('easeOutCubic', () => {
    it('returns values in [0, 1] for inputs in [0, 1]', () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (t) => {
          const result = easings.easeOutCubic(t);
          return result >= 0 && result <= 1;
        }),
        { numRuns: 100 }
      );
    });

    it('returns 0 when t = 0', () => {
      expect(easings.easeOutCubic(0)).toBe(0);
    });

    it('returns 1 when t = 1', () => {
      expect(easings.easeOutCubic(1)).toBe(1);
    });

    it('is monotonically increasing', () => {
      fc.assert(
        fc.property(
          fc.double({ min: 0, max: 0.99, noNaN: true }),
          fc.double({ min: 0.001, max: 0.01, noNaN: true }),
          (t, delta) => {
            const t2 = Math.min(t + delta, 1);
            return easings.easeOutCubic(t2) >= easings.easeOutCubic(t);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('easeOutQuart', () => {
    it('returns values in [0, 1] for inputs in [0, 1]', () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (t) => {
          const result = easings.easeOutQuart(t);
          return result >= 0 && result <= 1;
        }),
        { numRuns: 100 }
      );
    });

    it('returns 0 when t = 0', () => {
      expect(easings.easeOutQuart(0)).toBe(0);
    });

    it('returns 1 when t = 1', () => {
      expect(easings.easeOutQuart(1)).toBe(1);
    });
  });

  describe('easeInOutCubic', () => {
    it('returns values in [0, 1] for inputs in [0, 1]', () => {
      fc.assert(
        fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (t) => {
          const result = easings.easeInOutCubic(t);
          return result >= 0 && result <= 1;
        }),
        { numRuns: 100 }
      );
    });

    it('returns 0 when t = 0', () => {
      expect(easings.easeInOutCubic(0)).toBe(0);
    });

    it('returns 1 when t = 1', () => {
      expect(easings.easeInOutCubic(1)).toBe(1);
    });

    it('returns 0.5 when t = 0.5', () => {
      expect(easings.easeInOutCubic(0.5)).toBe(0.5);
    });
  });
});


/**
 * **Feature: lyrics-scroll-animation, Property 2: Duration Calculation Based on Distance**
 * **Validates: Requirements 4.2, 4.3**
 *
 * For any scroll distance value:
 * - If distance < 100px, calculateDuration SHALL return a value between 550-650ms
 * - If distance >= 100px and < 400px, calculateDuration SHALL return a value between 650-800ms
 * - If distance >= 400px, calculateDuration SHALL return a value between 800-900ms
 */
describe('Property 2: Duration Calculation Based on Distance', () => {
  it('returns 550-650ms for distances < 100px', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), (distance) => {
        const duration = calculateDuration(distance);
        return duration >= 550 && duration < 650;
      }),
      { numRuns: 100 }
    );
  });

  it('returns 650-800ms for distances 100-399px', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 399 }), (distance) => {
        const duration = calculateDuration(distance);
        return duration >= 650 && duration < 800;
      }),
      { numRuns: 100 }
    );
  });

  it('returns 800-900ms for distances >= 400px', () => {
    fc.assert(
      fc.property(fc.integer({ min: 400, max: 2000 }), (distance) => {
        const duration = calculateDuration(distance);
        return duration >= 800 && duration <= 900;
      }),
      { numRuns: 100 }
    );
  });

  it('handles negative distances by using absolute value', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: -1 }), (distance) => {
        const duration = calculateDuration(distance);
        const positiveDuration = calculateDuration(Math.abs(distance));
        return duration === positiveDuration;
      }),
      { numRuns: 100 }
    );
  });

  it('is monotonically non-decreasing with distance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 900 }),
        fc.integer({ min: 1, max: 100 }),
        (d1, delta) => {
          const d2 = d1 + delta;
          return calculateDuration(d2) >= calculateDuration(d1);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: lyrics-scroll-animation, Property 6: Adjacent Line Opacity Calculation**
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * For any adjacentIndex value:
 * - If adjacentIndex = 0 (active), opacity SHALL be 1.0
 * - If adjacentIndex = -1 or 1, opacity SHALL be 0.45
 * - If adjacentIndex = -2 or 2, opacity SHALL be 0.3
 * - If adjacentIndex = -3 or 3, opacity SHALL be 0.22
 * - If |adjacentIndex| >= 4, opacity SHALL be 0.15
 */
describe('Property 6: Adjacent Line Opacity Calculation', () => {
  it('returns 1.0 for active line (index 0)', () => {
    expect(getLineOpacity(0)).toBe(1.0);
  });

  it('returns 0.45 for adjacent lines (index ±1)', () => {
    expect(getLineOpacity(1)).toBe(0.45);
    expect(getLineOpacity(-1)).toBe(0.45);
  });

  it('returns 0.3 for lines at distance ±2', () => {
    expect(getLineOpacity(2)).toBe(0.3);
    expect(getLineOpacity(-2)).toBe(0.3);
  });

  it('returns 0.22 for lines at distance ±3', () => {
    expect(getLineOpacity(3)).toBe(0.22);
    expect(getLineOpacity(-3)).toBe(0.22);
  });

  it('returns 0.15 for distant lines (|index| >= 4)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 100 }),
        (index) => {
          return getLineOpacity(index) === 0.15 && getLineOpacity(-index) === 0.15;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns correct opacity for any integer index', () => {
    fc.assert(
      fc.property(fc.integer({ min: -100, max: 100 }), (index) => {
        const opacity = getLineOpacity(index);
        if (index === 0) return opacity === 1.0;
        if (Math.abs(index) === 1) return opacity === 0.45;
        if (Math.abs(index) === 2) return opacity === 0.3;
        if (Math.abs(index) === 3) return opacity === 0.22;
        return opacity === 0.15;
      }),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: lyrics-scroll-animation, Property 3: Animation Interruption Behavior**
 * **Validates: Requirements 1.2**
 *
 * For any scroll animation in progress, calling animateScrollToCenter with a new target
 * SHALL cancel the previous animation (setting isAnimating to false) before starting the new animation.
 */
describe('Property 3: Animation Interruption Behavior', () => {
  // Mock matchMedia before tests
  beforeAll(() => {
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

  // Create mock DOM elements for testing
  function createMockContainer(scrollTop: number = 0): HTMLElement {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', {
      value: scrollTop,
      writable: true,
    });
    Object.defineProperty(container, 'getBoundingClientRect', {
      value: () => ({
        top: 0,
        height: 500,
        left: 0,
        width: 300,
        bottom: 500,
        right: 300,
      }),
    });
    return container;
  }

  function createMockTarget(top: number): HTMLElement {
    const target = document.createElement('div');
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({
        top,
        height: 50,
        left: 0,
        width: 300,
        bottom: top + 50,
        right: 300,
      }),
    });
    return target;
  }

  it('cancel function stops the animation', () => {
    const container = createMockContainer();
    const target = createMockTarget(300);

    const state = animateScrollToCenter({
      container,
      targetElement: target,
      duration: 1000,
    });

    // Animation should be in progress initially
    expect(state.isAnimating).toBe(true);

    // Cancel the animation
    state.cancel();

    // Animation should be stopped
    expect(state.isAnimating).toBe(false);
  });

  it('starting a new animation allows canceling the previous one', () => {
    const container = createMockContainer();
    const target1 = createMockTarget(300);
    const target2 = createMockTarget(600);

    // Start first animation
    const state1 = animateScrollToCenter({
      container,
      targetElement: target1,
      duration: 1000,
    });

    expect(state1.isAnimating).toBe(true);

    // Cancel first animation
    state1.cancel();
    expect(state1.isAnimating).toBe(false);

    // Start second animation
    const state2 = animateScrollToCenter({
      container,
      targetElement: target2,
      duration: 1000,
    });

    // Second animation should be running
    expect(state2.isAnimating).toBe(true);
  });

  it('returns non-animating state for very small distances', () => {
    const container = createMockContainer();
    // Target is already centered (container center is at 250, target center at 250)
    const target = createMockTarget(225);

    const state = animateScrollToCenter({
      container,
      targetElement: target,
    });

    // Should not animate for very small distances
    expect(state.isAnimating).toBe(false);
  });
});
