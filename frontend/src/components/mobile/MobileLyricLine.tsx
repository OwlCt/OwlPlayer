import React, { useMemo } from 'react';
import { LyricLine } from '../../utils/ttmlParser';
import { MobileLyricWord } from './MobileLyricWord';
import { getLineOpacity, TYPOGRAPHY_CONFIG, ANIMATION_CONFIG } from './MobileLyricsConfig';

export interface MobileLyricLineProps {
  /** Lyric line data with timing information */
  line: LyricLine;
  /** Current playback time in milliseconds */
  currentTime: number;
  /** Whether this line is currently active */
  isActive: boolean;
  /** Distance from active line (0 = active, 1 = adjacent, etc.) */
  adjacentIndex: number;
  /** Index of this line in the lyrics array */
  lineIndex: number;
  /** Whether to show translation below main text */
  showTranslation: boolean;
  /** Callback when line is clicked/tapped */
  onClick: () => void;
  /** Whether reduced motion is preferred */
  reducedMotion?: boolean;
}

/**
 * MobileLyricLine component for displaying individual lyric lines.
 * 
 * Features:
 * - Supports both word-timed (karaoke) and line-timed lyrics
 * - Opacity based on distance from active line
 * - Scale animation for active line
 * - Translation display below main text
 * - GPU-accelerated animations using CSS transforms
 * 
 * Requirements: 3.1, 4.1, 4.2, 4.3, 8.2, 8.3, 9.3, 9.4
 */
export const MobileLyricLine: React.FC<MobileLyricLineProps> = ({
  line,
  currentTime,
  isActive,
  adjacentIndex,
  lineIndex,
  showTranslation,
  onClick,
  reducedMotion = false,
}) => {
  // Check if line has word-level timing
  const hasWordTiming = line.words && line.words.length > 0;

  // Calculate opacity based on distance from active line
  // Property 5: Line opacity based on distance
  const opacity = useMemo(() => {
    return getLineOpacity(adjacentIndex);
  }, [adjacentIndex]);

  // Scale: active line is slightly larger
  const scale = isActive ? 1.05 : 1.0;

  // Transition style for smooth animations
  // Requirement 4.2: 200ms ease-out animation for highlight transition
  // iOS optimization: use translateZ(0) to force GPU layer
  const transitionDuration = reducedMotion ? '0ms' : `${ANIMATION_CONFIG.lineHighlight.duration}ms`;
  const transitionStyle: React.CSSProperties = {
    transform: `scale(${scale}) translateZ(0)`,
    transformOrigin: 'left center',
    opacity,
    transition: `transform ${transitionDuration} ${ANIMATION_CONFIG.lineHighlight.easing}, opacity ${transitionDuration} ${ANIMATION_CONFIG.lineHighlight.easing}`,
    willChange: 'transform, opacity',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
  };

  return (
    <div
      className="py-3 px-4 cursor-pointer"
      style={transitionStyle}
      onClick={onClick}
      role="button"
      tabIndex={0}
      data-line-index={lineIndex}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`跳转到: ${line.text}`}
    >
      {/* Main lyric text */}
      <div
        className="font-medium leading-relaxed"
        style={{
          fontSize: `${TYPOGRAPHY_CONFIG.mainFontSize}px`,
          lineHeight: TYPOGRAPHY_CONFIG.lineHeight,
        }}
      >
        {hasWordTiming ? (
          // Word-by-word karaoke fill effect (Requirement 3.1)
          line.words!.map((word, index) => (
            <MobileLyricWord
              key={`${line.key}-word-${index}`}
              word={word}
              currentTime={currentTime}
              reducedMotion={reducedMotion}
            />
          ))
        ) : (
          // Line-level display for line-timed lyrics (Requirement 4.1)
          <span className={isActive ? 'text-white' : 'text-white/40'}>
            {line.text}
          </span>
        )}
      </div>

      {/* Translation text (Requirements 8.2, 8.3) */}
      {showTranslation && line.translation && (
        <div
          className="mt-1"
          style={{
            fontSize: `${TYPOGRAPHY_CONFIG.translationFontSize}px`,
            opacity: TYPOGRAPHY_CONFIG.translationOpacity,
            color: 'white',
          }}
        >
          {line.translation}
        </div>
      )}
    </div>
  );
};

export default MobileLyricLine;
