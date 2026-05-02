import React from 'react';
import { FiChevronDown, FiGlobe } from 'react-icons/fi';
import { GESTURE_CONFIG } from './MobileLyricsConfig';
import ScrollingText from '../ScrollingText';

export interface MobileLyricsHeaderProps {
  /** Song name to display */
  songName: string;
  /** Artist name to display */
  artistName: string;
  /** Callback when close button is clicked or swipe down gesture */
  onClose: () => void;
  /** Whether translations are available for this song */
  hasTranslation: boolean;
  /** Whether translation is currently enabled */
  showTranslation: boolean;
  /** Callback when translation toggle is clicked */
  onToggleTranslation: () => void;
  /** Touch start handler for follow-finger swipe gesture */
  onTouchStart?: (e: React.TouchEvent) => void;
  /** Touch move handler for follow-finger swipe gesture */
  onTouchMove?: (e: React.TouchEvent) => void;
  /** Touch end handler for follow-finger swipe gesture */
  onTouchEnd?: (e: React.TouchEvent) => void;
}

/**
 * MobileLyricsHeader component for displaying song info and controls.
 * 
 * Features:
 * - Displays song name and artist name
 * - Close button with proper touch target (44px)
 * - Swipe down gesture on header to close
 * - Translation toggle button when translations available
 * 
 * Requirements: 1.4, 2.2, 8.1
 */
export const MobileLyricsHeader: React.FC<MobileLyricsHeaderProps> = ({
  songName,
  artistName,
  onClose,
  hasTranslation,
  showTranslation,
  onToggleTranslation,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}) => {
  // Minimum touch target size for accessibility (44px)
  const minTouchTarget = GESTURE_CONFIG.minTouchTarget;

  return (
    <header 
      className="relative z-10 flex items-center justify-between px-4 py-3"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Close button - Requirement 2.2 */}
      <button
        onClick={onClose}
        className="flex items-center justify-center text-white/80 active:text-white/60 transition-colors"
        style={{
          width: minTouchTarget,
          height: minTouchTarget,
          minWidth: minTouchTarget,
          minHeight: minTouchTarget,
        }}
        aria-label="关闭歌词"
        data-testid="lyrics-header-close"
      >
        <FiChevronDown size={28} />
      </button>

      {/* Song info - Requirement 1.4 */}
      <div className="flex-1 text-center min-w-0 px-2">
        <ScrollingText
          text={songName || '未知歌曲'}
          className="text-base font-semibold text-white truncate"
          data-testid="lyrics-header-song-name"
        />
        <ScrollingText
          text={artistName || '未知艺术家'}
          className="text-sm text-white/70 truncate"
          data-testid="lyrics-header-artist-name"
        />
      </div>

      {/* Translation toggle button - Requirement 8.1 */}
      <button
        onClick={hasTranslation ? onToggleTranslation : undefined}
        disabled={!hasTranslation}
        className={`flex items-center justify-center transition-colors active:opacity-70 ${
          !hasTranslation
            ? 'text-white/20 cursor-not-allowed'
            : showTranslation
              ? 'text-green-500'
              : 'text-white/60'
        }`}
        style={{
          width: minTouchTarget,
          height: minTouchTarget,
          minWidth: minTouchTarget,
          minHeight: minTouchTarget,
        }}
        aria-label={!hasTranslation ? '无翻译' : showTranslation ? '隐藏翻译' : '显示翻译'}
        aria-pressed={hasTranslation ? showTranslation : undefined}
        data-testid="lyrics-header-translation-toggle"
      >
        <FiGlobe size={24} />
      </button>
    </header>
  );
};

export default MobileLyricsHeader;
