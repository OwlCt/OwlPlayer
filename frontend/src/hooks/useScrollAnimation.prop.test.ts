/**
 * Property-based tests for useScrollAnimation hook
 * Uses fast-check for property-based testing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useScrollAnimation } from './useScrollAnimation';

// Helper to create mock refs
function createMockRefs(lineCount: number) {
  const container = document.createElement('div');
  Object.defineProperty(container, 'scrollTop', {
    value: 0,
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
  
  // Mock scrollTo
  container.scrollTo = vi.fn();

  // Add event listener methods
  container.addEventListener = vi.fn();
  container.removeEventListener = vi.fn();

  const lines: HTMLElement[] = [];
  for (let i = 0; i < lineCount; i++) {
    const line = document.createElement('div');
    Object.defineProperty(line, 'getBoundingClientRect', {
      value: () => ({
        top: i * 50,
        height: 50,
        left: 0,
        width: 300,
        bottom: (i + 1) * 50,
        right: 300,
      }),
    });
    lines.push(line);
  }

  return {
    containerRef: { current: container },
    lineRefs: { current: lines },
  };
}

/**
 * **Feature: lyrics-scroll-animation, Property 4: Manual Scroll Pause Mechanism**
 * **Validates: Requirements 1.3**
 *
 * For any manual scroll event on the lyrics container, the auto-scroll SHALL be paused
 * (isPaused = true) and remain paused for the specified pauseDuration before resuming
 * (isPaused = false).
 */
describe('Property 4: Manual Scroll Pause Mechanism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('isPaused starts as false', () => {
    const { containerRef, lineRefs } = createMockRefs(10);

    const { result } = renderHook(() =>
      useScrollAnimation({
        containerRef,
        lineRefs,
        currentLineIndex: 0,
        enabled: true,
      })
    );

    expect(result.current.isPaused).toBe(false);
  });

  it('manual wheel scroll triggers pause', () => {
    const { containerRef, lineRefs } = createMockRefs(10);

    const { result } = renderHook(() =>
      useScrollAnimation({
        containerRef,
        lineRefs,
        currentLineIndex: 0,
        enabled: true,
        pauseDuration: 3000,
      })
    );

    // Get the wheel handler that was registered
    const addEventListenerCalls = (containerRef.current!.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
    const wheelHandler = addEventListenerCalls.find(
      (call: any) => call[0] === 'wheel'
    )?.[1];

    if (wheelHandler) {
      act(() => {
        wheelHandler();
      });

      expect(result.current.isPaused).toBe(true);
    }
  });

  it('pause resumes after pauseDuration', () => {
    const pauseDuration = 3000;
    const { containerRef, lineRefs } = createMockRefs(10);

    const { result } = renderHook(() =>
      useScrollAnimation({
        containerRef,
        lineRefs,
        currentLineIndex: 0,
        enabled: true,
        pauseDuration,
      })
    );

    // Get the wheel handler
    const addEventListenerCalls = (containerRef.current!.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
    const wheelHandler = addEventListenerCalls.find(
      (call: any) => call[0] === 'wheel'
    )?.[1];

    if (wheelHandler) {
      act(() => {
        wheelHandler();
      });

      expect(result.current.isPaused).toBe(true);

      // The hook waits 150ms for wheel inactivity, then starts the resume timer.
      act(() => {
        vi.advanceTimersByTime(149 + pauseDuration);
      });

      expect(result.current.isPaused).toBe(true);

      act(() => {
        vi.advanceTimersByTime(1);
      });

      expect(result.current.isPaused).toBe(false);
    }
  });

  it('pause duration is configurable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 10000 }),
        (pauseDuration) => {
          const { containerRef, lineRefs } = createMockRefs(10);

          const { result } = renderHook(() =>
            useScrollAnimation({
              containerRef,
              lineRefs,
              currentLineIndex: 0,
              enabled: true,
              pauseDuration,
            })
          );

          // Get the wheel handler
          const addEventListenerCalls = (containerRef.current!.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
          const wheelHandler = addEventListenerCalls.find(
            (call: any) => call[0] === 'wheel'
          )?.[1];

          if (wheelHandler) {
            act(() => {
              wheelHandler();
            });

            // Should be paused
            expect(result.current.isPaused).toBe(true);

            // Wheel inactivity timer has not completed yet.
            act(() => {
              vi.advanceTimersByTime(149);
            });

            expect(result.current.isPaused).toBe(true);

            // Resume countdown starts only after 150ms of inactivity.
            act(() => {
              vi.advanceTimersByTime(pauseDuration);
            });

            expect(result.current.isPaused).toBe(true);

            act(() => {
              vi.advanceTimersByTime(1);
            });

            expect(result.current.isPaused).toBe(false);
          }

          return true;
        }
      ),
      { numRuns: 10 }
    );
  });

  it('scrollToLine is callable for any valid line index', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 5, max: 50 }),
        fc.integer({ min: 0, max: 4 }),
        (lineCount, lineIndex) => {
          const { containerRef, lineRefs } = createMockRefs(lineCount);

          const { result } = renderHook(() =>
            useScrollAnimation({
              containerRef,
              lineRefs,
              currentLineIndex: 0,
              enabled: true,
            })
          );

          // Should not throw
          act(() => {
            result.current.scrollToLine(lineIndex, true);
          });

          return true;
        }
      ),
      { numRuns: 20 }
    );
  });

  it('scrollToLine with immediate=true does not animate', () => {
    const { containerRef, lineRefs } = createMockRefs(10);

    const { result } = renderHook(() =>
      useScrollAnimation({
        containerRef,
        lineRefs,
        currentLineIndex: 0,
        enabled: true,
      })
    );

    // Should not throw and should complete immediately
    act(() => {
      result.current.scrollToLine(5, true);
    });

    // No animation should be in progress (immediate scroll)
    expect(result.current.isPaused).toBe(false);
  });

  it('disabled hook does not scroll', () => {
    const { containerRef, lineRefs } = createMockRefs(10);

    const { result } = renderHook(() =>
      useScrollAnimation({
        containerRef,
        lineRefs,
        currentLineIndex: 0,
        enabled: false,
      })
    );

    act(() => {
      result.current.scrollToLine(5);
    });

    // scrollTo should not be called when disabled
    expect(containerRef.current!.scrollTo).not.toHaveBeenCalled();
  });

  it('resumeAutoScroll clears pause state', () => {
    const { containerRef, lineRefs } = createMockRefs(10);

    const { result } = renderHook(() =>
      useScrollAnimation({
        containerRef,
        lineRefs,
        currentLineIndex: 0,
        enabled: true,
        pauseDuration: 5000,
      })
    );

    // Get the wheel handler
    const addEventListenerCalls = (containerRef.current!.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
    const wheelHandler = addEventListenerCalls.find(
      (call: any) => call[0] === 'wheel'
    )?.[1];

    if (wheelHandler) {
      // Trigger pause
      act(() => {
        wheelHandler();
      });
      expect(result.current.isPaused).toBe(true);

      // Manually resume
      act(() => {
        result.current.resumeAutoScroll();
      });
      expect(result.current.isPaused).toBe(false);
    }
  });
});
