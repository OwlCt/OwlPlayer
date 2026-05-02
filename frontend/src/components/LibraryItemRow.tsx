import { useState, useCallback, MouseEvent, DragEvent } from 'react';
import { Album } from '../types';
import { ArtistInfo } from '../store/followedArtistsStore';
import { MenuPosition } from './ContextMenu';
import { generateDragUrl, ImageType } from '../utils/dragLink';
import { getProxiedImageUrl } from '../utils/image';
import ArtistContextMenu from './ArtistContextMenu';
import AlbumContextMenu from './AlbumContextMenu';
import PlaylistContextMenu from './PlaylistContextMenu';
import CachedImage from './CachedImage';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTouchClick } from '../hooks/useTouchClick';
import { CacheStatus } from '../store/offlineCacheStore';

// 正在播放音量图标 - 绿色扬声器图标
export const NowPlayingIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg
    role="img"
    aria-hidden="true"
    className={className}
    viewBox="0 0 16 16"
    style={{ fill: '#1db954' }}
  >
    <path d="M10.016 1.125A.75.75 0 0 0 8.99.85l-6.925 4a3.64 3.64 0 0 0 0 6.299l6.925 4a.75.75 0 0 0 1.125-.65v-13a.75.75 0 0 0-.1-.375zM11.5 5.56a2.75 2.75 0 0 1 0 4.88z"></path>
    <path d="M16 8a5.75 5.75 0 0 1-4.5 5.614v-1.55a4.252 4.252 0 0 0 0-8.127v-1.55A5.75 5.75 0 0 1 16 8"></path>
  </svg>
);

/**
 * Calculate background class based on active and hover states.
 * Hierarchy: active+hovered > active > hovered > default
 */
export function getBackgroundClass(isActive: boolean, isHovered: boolean): string {
  if (isActive && isHovered) return 'bg-white/30';
  if (isActive) return 'bg-white/20';
  if (isHovered) return 'bg-white/10';
  return '';
}

/**
 * Calculate text color class based on playing state.
 */
export function getTextColorClass(isPlaying: boolean): string {
  return isPlaying ? 'text-spotify-green' : 'text-white';
}

/**
 * Determine if play overlay should be visible.
 * Overlay is visible only when item is hovered and has an onPlay callback.
 */
export function shouldShowPlayOverlay(isHovered: boolean, hasOnPlay: boolean): boolean {
  return isHovered && hasOnPlay;
}

interface PlaylistInfo {
  id: string;
  name: string;
}

interface LibraryItemRowProps {
  type: ImageType;
  id: string;
  name: string;
  subtitle: string;
  imageUrl?: string;
  onClick: () => void;
  // Type-specific data
  artistData?: ArtistInfo;
  albumData?: Album;
  playlistData?: PlaylistInfo;
  // Callbacks for playlist
  onEdit?: () => void;
  onDelete?: () => void;
  // Mini mode
  mini?: boolean;
  // Visual state props
  isActive?: boolean;      // Whether this item is the currently active page
  isPlaying?: boolean;     // Whether this item is currently playing
  onPlay?: () => void;     // Callback when play button is clicked
  onPause?: () => void;    // Callback when pause button is clicked
  // Cache status (optional, retained for data compatibility)
  isCached?: boolean;
  // Cache status for partial download support
  cacheStatus?: CacheStatus;
}

export default function LibraryItemRow({
  type,
  id,
  name,
  subtitle,
  imageUrl,
  onClick,
  artistData,
  albumData,
  playlistData,
  onEdit,
  onDelete,
  mini = false,
  isActive = false,
  isPlaying = false,
  onPlay,
  onPause,
}: LibraryItemRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const isMobile = useIsMobile();
  const touchHandlers = useTouchClick(onClick);
  
  // Handle right-click to show context menu
  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }, []);

  // Handle drag start to set drag data
  const handleDragStart = useCallback((e: DragEvent) => {
    const url = generateDragUrl(type, id);
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.effectAllowed = 'copyLink';
  }, [type, id]);

  // Close menu handler
  const handleCloseMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  // Render appropriate context menu based on type
  const renderContextMenu = () => {
    switch (type) {
      case 'artist':
        if (!artistData) return null;
        return (
          <ArtistContextMenu
            artist={artistData}
            isOpen={menuOpen}
            position={menuPosition}
            onClose={handleCloseMenu}
          />
        );
      case 'album':
        if (!albumData) return null;
        return (
          <AlbumContextMenu
            album={albumData}
            isOpen={menuOpen}
            position={menuPosition}
            onClose={handleCloseMenu}
          />
        );
      case 'playlist':
        if (!playlistData) return null;
        return (
          <PlaylistContextMenu
            playlist={playlistData}
            isOpen={menuOpen}
            position={menuPosition}
            onClose={handleCloseMenu}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        );
      default:
        return null;
    }
  };

  // Mini mode layout - 所有类型都使用双击播放，避免误触
  if (mini) {
    // Calculate dynamic classes for mini mode
    const miniBackgroundClass = getBackgroundClass(isActive, isHovered);
    
    return (
      <>
        <button
          {...(isMobile ? touchHandlers : { onClick })}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (isPlaying && onPause) {
              onPause();
            } else if (onPlay) {
              onPlay();
            }
          }}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          draggable={!isMobile}
          onDragStart={handleDragStart}
          className={`rounded-lg transition-colors p-1 ${miniBackgroundClass}`}
          title={`${name} (双击播放)`}
        >
          <div className="relative">
            {imageUrl ? (
              <CachedImage
                src={getProxiedImageUrl(imageUrl, 96)}
                alt={name}
                className={`w-[52px] h-[52px] aspect-square object-cover ${
                  type === 'artist' ? 'rounded-full' : 'rounded'
                } ${isPlaying ? 'ring-2 ring-spotify-green' : ''}`}
              />
            ) : (
              <div className={`w-[52px] h-[52px] aspect-square bg-spotify-gray flex items-center justify-center ${
                type === 'artist' ? 'rounded-full' : 'rounded'
              } ${isPlaying ? 'ring-2 ring-spotify-green' : ''}`}>
                <span className="text-spotify-light-gray text-lg">♪</span>
              </div>
            )}
          </div>
        </button>
        {renderContextMenu()}
      </>
    );
  }

  // Calculate dynamic classes
  const backgroundClass = getBackgroundClass(isActive, isHovered);
  const textColorClass = getTextColorClass(isPlaying);

  // Normal mode layout
  return (
    <>
      <button
        {...(isMobile ? touchHandlers : { onClick })}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${backgroundClass}`}
      >
        <div className="relative flex-shrink-0">
          {imageUrl ? (
            <CachedImage
              src={getProxiedImageUrl(imageUrl, 96)}
              alt={name}
              className={`w-12 h-12 object-cover ${
                type === 'artist' ? 'rounded-full' : 'rounded'
              }`}
            />
          ) : (
            <div className={`w-12 h-12 bg-spotify-gray flex items-center justify-center ${
              type === 'artist' ? 'rounded-full' : 'rounded'
            }`}>
              <span className="text-spotify-light-gray text-lg">♪</span>
            </div>
          )}
          {/* Play/Pause overlay on hover */}
          {isHovered && (onPlay || onPause) && (
            <div
              className={`absolute inset-0 bg-black/50 flex items-center justify-center ${
                type === 'artist' ? 'rounded-full' : 'rounded'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (isPlaying && onPause) {
                  onPause();
                } else if (onPlay) {
                  onPlay();
                }
              }}
            >
              {isPlaying ? (
                <svg
                  className="w-6 h-6 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className={`${textColorClass} font-medium truncate`}>{name}</p>
          <p className="text-sm text-spotify-light-gray truncate flex items-center gap-1">
            <span>{subtitle}</span>
          </p>
        </div>
        {isPlaying && <NowPlayingIcon className="w-4 h-4 flex-shrink-0 mr-2" />}
      </button>
      {renderContextMenu()}
    </>
  );
}
