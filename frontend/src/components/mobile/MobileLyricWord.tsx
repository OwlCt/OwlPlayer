import React, { useMemo } from 'react';
import { LyricWord } from '../../utils/ttmlParser';
import { calculateWordFillPercentage } from './MobileLyricsConfig';

export interface MobileLyricWordProps {
  /** Word data with timing information */
  word: LyricWord;
  /** Current playback time in milliseconds */
  currentTime: number;
  /** Whether reduced motion is preferred */
  reducedMotion?: boolean;
}

/**
 * MobileLyricWord component for karaoke-style fill animation.
 * Uses inline-block with overflow hidden for precise text alignment.
 * 
 * The fill effect is achieved by:
 * 1. Container with relative positioning
 * 2. Base layer: dim text
 * 3. Fill layer: bright text with width-based clipping
 * 
 * Uses CSS transforms for GPU acceleration to maintain 60fps.
 */
export const MobileLyricWord: React.FC<MobileLyricWordProps> = ({
  word,
  currentTime,
  reducedMotion = false,
}) => {
  // Calculate fill percentage based on current time and word timestamps
  const fillPercent = useMemo(() => {
    return calculateWordFillPercentage(currentTime, word.timestamp, word.endTime);
  }, [currentTime, word.timestamp, word.endTime]);

  // For reduced motion, show instant fill (0% or 100%)
  const displayFillPercent = reducedMotion
    ? (fillPercent > 0 ? 100 : 0)
    : fillPercent;

  return (
    <span
      className="relative inline-block"
      style={{
        whiteSpace: 'pre',
      }}
    >
      {/* Base layer - dim text */}
      <span className="text-white/40">
        {word.text}
      </span>
      
      {/* Fill layer - bright text with width clipping */}
      <span
        className="absolute left-0 top-0 overflow-hidden text-white"
        style={{
          width: `${displayFillPercent}%`,
          whiteSpace: 'pre',
        }}
        aria-hidden="true"
      >
        {word.text}
      </span>
    </span>
  );
};

export default MobileLyricWord;
