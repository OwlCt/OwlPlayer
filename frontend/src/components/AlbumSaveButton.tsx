import { useState } from 'react';
import { Album } from '../types';
import { useLibraryAlbumsStore } from '../store/libraryAlbumsStore';
import { useToastStore } from '../store/toastStore';

interface AlbumSaveButtonProps {
  album: Album;
  size?: 'sm' | 'md' | number;
  className?: string;
  enableTooltip?: boolean;
  ariaLabel?: string;
}

export function AlbumSaveButton({
  album,
  size = 'md',
  className = '',
  enableTooltip = true,
  ariaLabel,
}: AlbumSaveButtonProps) {
  const { isSaved, saveAlbum, removeAlbum } = useLibraryAlbumsStore();
  const { showToast } = useToastStore();
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const saved = isSaved(album.id);
  const sizeClasses = typeof size === 'number' 
    ? '' 
    : size === 'sm' ? 'w-4 h-4' : 'w-8 h-8';
  const sizeStyle = typeof size === 'number' ? { width: size, height: size } : undefined;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      if (saved) {
        await removeAlbum(album.id);
        showToast('已从音乐库中移除。');
      } else {
        await saveAlbum(album);
        showToast('已添加到音乐库。');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const tooltipText = saved ? '从音乐库中移除' : '收藏至音乐库';

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={isLoading}
        aria-label={ariaLabel || tooltipText}
        className={`
          flex items-center justify-center
          transition-all duration-150
          ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
          ${className}
        `}
      >
        <div className="relative">
          {/* Not saved: Gray circle outline with plus icon */}
          <svg
            className={`${sizeClasses} transition-all duration-300 ease-out absolute inset-0
              ${saved ? 'opacity-0 scale-50 rotate-90' : 'opacity-100 scale-100 rotate-0'}`}
            style={sizeStyle}
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
          {/* Saved: Green filled circle with transparent checkmark cutout */}
          <svg
            className={`${sizeClasses} transition-all duration-300 ease-out
              ${saved ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 -rotate-90'}`}
            style={sizeStyle}
            viewBox="0 0 24 24"
            fill="none"
          >
            <defs>
              <mask id="checkmark-mask-album">
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
            <circle cx="12" cy="12" r="11" fill="#1DB954" mask="url(#checkmark-mask-album)" />
          </svg>
        </div>
      </button>
      
      {/* Custom tooltip - only show on desktop */}
      {enableTooltip && showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-[#282828] text-white text-sm rounded-md whitespace-nowrap shadow-lg z-50">
          {tooltipText}
        </div>
      )}
    </div>
  );
}

export default AlbumSaveButton;
