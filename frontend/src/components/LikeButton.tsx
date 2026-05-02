import { useState, useRef } from 'react';
import { Song } from '../types';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { useToastStore } from '../store/toastStore';
import { PlaylistModal } from './PlaylistModal';
import MobilePlaylistPicker from './mobile/MobilePlaylistPicker';
import { useIsMobile } from '../hooks/useIsMobile';

interface LikeButtonProps {
  song: Song;
  size?: 'sm' | 'base' | 'md';
  className?: string;
  showOnHover?: boolean;
  forceShow?: boolean;
  enableTooltip?: boolean;
  /** If true, only show and allow interaction when already liked (for mobile song cards) */
  onlyWhenLiked?: boolean;
}

export function LikeButton({ song, size = 'md', className = '', showOnHover = true, forceShow = false, enableTooltip = true, onlyWhenLiked = false }: LikeButtonProps) {
  const { isLiked, likeSong } = useLikedSongsStore();
  const { showToast } = useToastStore();
  const isMobile = useIsMobile();
  const [isHovered, setIsHovered] = useState(false);
  const [showTooltipState, setShowTooltipState] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const liked = isLiked(song.id);
  
  // If onlyWhenLiked is true and song is not liked, don't render anything
  if (onlyWhenLiked && !liked) {
    return null;
  }
  
  const sizeClasses = size === 'sm' ? 'w-4 h-4' : size === 'base' ? 'w-[17px] h-[17px]' : 'w-5 h-5';
  // Larger touch target for mobile (44px minimum recommended)
  const touchAreaClasses = isMobile ? 'w-10 h-10' : '';

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isLoading) return;
    
    if (liked) {
      // If already liked, open playlist modal instead of unliking
      setShowPlaylistModal(true);
    } else {
      // If not liked, add to liked songs immediately
      setIsLoading(true);
      try {
        await likeSong(song);
        showToast('已添加到已点赞的歌曲。');
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle touch events to prevent triggering parent's tap handler
  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
  };

  // Determine visibility
  const shouldShow = liked || isHovered || !showOnHover || forceShow;
  // Update tooltip text based on liked state
  const tooltipText = liked ? '加入歌单' : '添加至已点赞的歌曲';

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseEnter={() => {
          setIsHovered(true);
          setShowTooltipState(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowTooltipState(false);
        }}
        disabled={isLoading}
        className={`
          flex items-center justify-center
          transition-all duration-150
          ${touchAreaClasses}
          ${shouldShow ? 'opacity-100' : 'opacity-0'}
          ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
          ${className}
        `}
      >
        <div className="relative">
          {/* Not liked: Gray circle outline with plus icon */}
          <svg
            className={`${sizeClasses} transition-all duration-300 ease-out absolute inset-0
              ${liked ? 'opacity-0 scale-50 rotate-90' : 'opacity-100 scale-100 rotate-0'}`}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              className="text-gray-400"
            />
            <line
              x1="12"
              y1="8"
              x2="12"
              y2="16"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-gray-400"
            />
            <line
              x1="8"
              y1="12"
              x2="16"
              y2="12"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="text-gray-400"
            />
          </svg>
          {/* Liked: Green filled circle with transparent checkmark cutout */}
          <svg
            className={`${sizeClasses} transition-all duration-300 ease-out
              ${liked ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90'}`}
            viewBox="0 0 24 24"
            fill="none"
          >
            <defs>
              <mask id="checkmark-mask-like">
                <rect width="24" height="24" fill="white" />
                <polyline
                  points="7 12 10.5 15.5 17 9"
                  stroke="black"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </mask>
            </defs>
            <circle cx="12" cy="12" r="11" fill="#1DB954" mask="url(#checkmark-mask-like)" />
          </svg>
        </div>
      </button>
      
      {/* Custom tooltip */}
      {enableTooltip && showTooltipState && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#282828] text-white text-sm rounded-md whitespace-nowrap shadow-lg z-50">
          {tooltipText}
        </div>
      )}
      
      {/* Playlist Modal - Desktop */}
      {!isMobile && (
        <PlaylistModal
          song={song}
          isOpen={showPlaylistModal}
          onClose={() => setShowPlaylistModal(false)}
          anchorRef={buttonRef}
        />
      )}
      
      {/* Playlist Picker - Mobile */}
      {isMobile && (
        <MobilePlaylistPicker
          song={song}
          isOpen={showPlaylistModal}
          onClose={() => setShowPlaylistModal(false)}
        />
      )}
    </div>
  );
}

export default LikeButton;
