import React, { useRef, useCallback, useMemo, useEffect, useState } from 'react';
import { LyricLine } from '../../utils/ttmlParser';
import { MobileLyricLine } from './MobileLyricLine';
import { VIRTUAL_SCROLL_CONFIG, TYPOGRAPHY_CONFIG, GESTURE_CONFIG } from './MobileLyricsConfig';

export interface MobileLyricsContentProps {
  /** Array of lyric lines to display */
  lines: LyricLine[];
  /** Index of the currently active line */
  currentLineIndex: number;
  /** Current playback time in milliseconds */
  currentTimeMs: number;
  /** Whether lyrics have word-level timing */
  hasWordTiming: boolean;
  /** Whether to show translation below each line */
  showTranslation: boolean;
  /** Callback when a line is clicked for seeking */
  onLineClick: (line: LyricLine) => void;
  /** Whether auto-scroll is paused */
  isPaused: boolean;
  /** Callback when user scroll pause state changes */
  onUserScroll?: (paused: boolean) => void;
  /** Whether reduced motion is preferred */
  reducedMotion?: boolean;
  /** Ref to the scroll container for external control */
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

/**
 * Determines if virtual scrolling should be enabled based on line count.
 * Property 9: Virtual scrolling for large lyrics
 * Validates: Requirements 7.4
 */
export function shouldEnableVirtualScroll(lineCount: number): boolean {
  return lineCount > VIRTUAL_SCROLL_CONFIG.threshold;
}

/**
 * Calculates which lines should be rendered in virtual scroll mode.
 * Returns start and end indices for the visible range.
 */
export function getVisibleRange(
  currentLineIndex: number,
  totalLines: number,
  overscan: number = VIRTUAL_SCROLL_CONFIG.overscan
): { start: number; end: number } {
  // Center around current line with overscan buffer
  const start = Math.max(0, currentLineIndex - overscan - 10);
  const end = Math.min(totalLines - 1, currentLineIndex + overscan + 10);
  return { start, end };
}


/**
 * MobileLyricsContent component for displaying scrollable lyrics.
 * 
 * Features:
 * - Renders lyric lines with proper spacing
 * - Implements virtual scrolling for lyrics > 50 lines
 * - Handles line click for seeking
 * - Displays scroll pause indicator
 * - GPU-accelerated scrolling
 * 
 * Requirements: 5.1, 5.4, 6.1, 7.4
 */
export const MobileLyricsContent: React.FC<MobileLyricsContentProps> = ({
  lines,
  currentLineIndex,
  currentTimeMs,
  hasWordTiming,
  showTranslation,
  onLineClick,
  isPaused,
  onUserScroll,
  reducedMotion = false,
  scrollContainerRef,
}) => {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = scrollContainerRef || internalScrollRef;
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTouchingRef = useRef(false); // Track if user is currently touching

  // Determine if virtual scrolling should be enabled
  // Property 9: Virtual scrolling for large lyrics
  const useVirtualScroll = useMemo(() => {
    return shouldEnableVirtualScroll(lines.length);
  }, [lines.length]);

  // Calculate visible range for virtual scrolling
  const visibleRange = useMemo(() => {
    if (!useVirtualScroll) {
      return { start: 0, end: lines.length - 1 };
    }
    return getVisibleRange(currentLineIndex, lines.length);
  }, [useVirtualScroll, currentLineIndex, lines.length]);

  // Handle touch start - pause auto-scroll immediately
  const handleTouchStart = useCallback(() => {
    isTouchingRef.current = true;
    
    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = null;
    }
    
    if (!isUserScrolling) {
      setIsUserScrolling(true);
      onUserScroll?.(true); // Notify parent: paused
    }
  }, [isUserScrolling, onUserScroll]);

  // Handle touch end - start 5s countdown
  const handleTouchEnd = useCallback(() => {
    isTouchingRef.current = false;
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Start countdown from when finger leaves screen
    scrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
      onUserScroll?.(false); // Notify parent: resumed
    }, GESTURE_CONFIG.autoScrollPauseDuration);
  }, [onUserScroll]);

  // Handle scroll event - only track if user is touching (to ignore programmatic scrolls)
  const handleScroll = useCallback(() => {
    // Only consider it user scrolling if they're actually touching the screen
    if (isTouchingRef.current && !isUserScrolling) {
      setIsUserScrolling(true);
      onUserScroll?.(true); // Notify parent: paused
    }
  }, [isUserScrolling, onUserScroll]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle line click for seeking
  // Property 7: Line tap seeks to timestamp
  const handleLineClick = useCallback((line: LyricLine) => {
    onLineClick(line);
    // Resume auto-scroll immediately after tap (Requirement 5.5)
    setIsUserScrolling(false);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
  }, [onLineClick]);

  // Render lines (with virtual scrolling support)
  const renderedLines = useMemo(() => {
    const linesToRender: React.ReactNode[] = [];
    
    // Add spacer for virtual scroll offset
    if (useVirtualScroll && visibleRange.start > 0) {
      const spacerHeight = visibleRange.start * VIRTUAL_SCROLL_CONFIG.estimatedLineHeight;
      linesToRender.push(
        <div key="spacer-top" style={{ height: spacerHeight }} aria-hidden="true" />
      );
    }

    // Render visible lines
    for (let i = visibleRange.start; i <= visibleRange.end && i < lines.length; i++) {
      const line = lines[i];
      const adjacentIndex = i - currentLineIndex;
      const isActive = i === currentLineIndex;

      linesToRender.push(
        <MobileLyricLine
          key={line.key}
          line={line}
          currentTime={currentTimeMs}
          isActive={isActive}
          adjacentIndex={adjacentIndex}
          lineIndex={i}
          showTranslation={showTranslation}
          onClick={() => handleLineClick(line)}
          reducedMotion={reducedMotion}
        />
      );
    }

    // Add bottom spacer for virtual scroll
    if (useVirtualScroll && visibleRange.end < lines.length - 1) {
      const spacerHeight = (lines.length - 1 - visibleRange.end) * VIRTUAL_SCROLL_CONFIG.estimatedLineHeight;
      linesToRender.push(
        <div key="spacer-bottom" style={{ height: spacerHeight }} aria-hidden="true" />
      );
    }

    return linesToRender;
  }, [
    lines,
    visibleRange,
    currentLineIndex,
    currentTimeMs,
    showTranslation,
    handleLineClick,
    reducedMotion,
    useVirtualScroll,
  ]);

  return (
    <div className="relative h-full w-full">
      {/* Scroll container */}
      <div
        ref={scrollRef as React.RefObject<HTMLDivElement>}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden no-scrollbar"
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={(e) => e.stopPropagation()}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          willChange: 'scroll-position',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {/* Top padding to position first line at upper 1/3 */}
        <div style={{ height: '33vh' }} aria-hidden="true" />
        
        {/* Lyric lines */}
        <div
          className="px-4"
          style={{
            fontSize: `${TYPOGRAPHY_CONFIG.mainFontSize}px`,
            lineHeight: TYPOGRAPHY_CONFIG.lineHeight,
          }}
        >
          {renderedLines}
        </div>
        
        {/* Bottom padding to allow last line to scroll to upper 1/3 */}
        <div style={{ height: '67vh' }} aria-hidden="true" />
      </div>

      {/* Scroll pause indicator (Requirement 5.4) */}
      {isPaused && (
        <div 
          className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="text-xs text-white/70">已暂停自动滚动</span>
        </div>
      )}
    </div>
  );
};

export default MobileLyricsContent;
