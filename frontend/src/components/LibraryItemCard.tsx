import { useState, useCallback, MouseEvent, DragEvent } from 'react';
import { Album } from '../types';
import { ArtistInfo } from '../store/followedArtistsStore';
import { MenuPosition } from './ContextMenu';
import { generateDragUrl, ImageType } from '../utils/dragLink';
import { getProxiedImageUrl } from '../utils/image';
import ArtistContextMenu from './ArtistContextMenu';
import AlbumContextMenu from './AlbumContextMenu';
import PlaylistContextMenu from './PlaylistContextMenu';
import { getBackgroundClass, getTextColorClass, NowPlayingIcon } from './LibraryItemRow';
import CachedImage from './CachedImage';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTouchClick } from '../hooks/useTouchClick';
import { CacheStatus } from '../store/offlineCacheStore';

interface PlaylistInfo {
  id: string;
  name: string;
}

interface LibraryItemCardProps {
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
  // Visual state props
  isActive?: boolean;
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  // Cache status (optional, retained for data compatibility)
  isCached?: boolean;
  // Cache status for partial download support
  cacheStatus?: CacheStatus;
}

export default function LibraryItemCard({
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
  isActive = false,
  isPlaying = false,
  onPlay,
  onPause,
}: LibraryItemCardProps) {
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

  // Calculate dynamic classes
  const backgroundClass = getBackgroundClass(isActive, isHovered);
  const textColorClass = getTextColorClass(isPlaying);

  return (
    <>
      <button
        {...(isMobile ? touchHandlers : { onClick })}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={!isMobile}
        onDragStart={handleDragStart}
        className={`flex flex-col p-4 rounded-lg transition-colors ${backgroundClass || 'hover:bg-spotify-dark'}`}
      >
        <div className="relative w-full aspect-square mb-3">
          {imageUrl ? (
            <CachedImage
              src={getProxiedImageUrl(imageUrl, 300)}
              alt={name}
              className={`w-full h-full object-cover ${
                type === 'artist' ? 'rounded-full' : 'rounded-lg'
              }`}
            />
          ) : (
            <div className={`w-full h-full bg-spotify-gray flex items-center justify-center ${
              type === 'artist' ? 'rounded-full' : 'rounded-lg'
            }`}>
              <span className="text-spotify-light-gray text-4xl">♪</span>
            </div>
          )}
          {/* Play/Pause button - slides up on hover like AlbumCard */}
          {(onPlay || onPause) && (
            <button
              className={`absolute bottom-2 right-2 w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-xl transition-all duration-200 hover:scale-105 ${
                isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
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
                  className="w-6 h-6 text-black"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg
                  className="w-6 h-6 text-black"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M6 4l15 8-15 8V4z" />
                </svg>
              )}
            </button>
          )}
        </div>
        {/* Info section - albums use two-line title like search results */}
        {type === 'album' ? (
          <div className="min-h-[4.5rem] w-full">
            <div className="flex items-start justify-between w-full gap-2">
              <h3 className={`${textColorClass} font-bold line-clamp-2 text-left`}>{name}</h3>
              {isPlaying && <NowPlayingIcon className="w-4 h-4 flex-shrink-0 mt-1" />}
            </div>
            <p className="text-sm text-spotify-light-gray truncate w-full text-left flex items-center gap-1">
              <span>{subtitle}</span>
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between w-full gap-2">
              <p className={`${textColorClass} font-medium truncate text-left`}>{name}</p>
              {isPlaying && <NowPlayingIcon className="w-4 h-4 flex-shrink-0" />}
            </div>
            <p className="text-sm text-spotify-light-gray truncate w-full text-left flex items-center gap-1">
              <span>{subtitle}</span>
            </p>
          </>
        )}
      </button>
      {renderContextMenu()}
    </>
  );
}
