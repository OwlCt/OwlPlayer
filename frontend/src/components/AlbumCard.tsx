import { useState, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Album, PageContextType } from '../types';
import { getProxiedImageUrl } from '../utils/image';
import AlbumContextMenu from './AlbumContextMenu';
import { MenuPosition } from './ContextMenu';
import { generateDragUrl } from '../utils/dragLink';
import ClickableLink, { getArtistHref } from './ClickableLink';
import CachedImage from './CachedImage';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTouchClick } from '../hooks/useTouchClick';
import { getReleaseTypeLabel } from '../utils/releaseType';

interface AlbumCardProps {
  album: Album;
  onPlay?: () => void;
  onPause?: () => void;
  isPlaying?: boolean;  // Whether this album is currently playing
  pageContext?: PageContextType;  // Page context for menu visibility
  onCardClick?: (album: Album) => void; // Optional click handler for parent to control navigation/side effects
  onLongPress?: (album: Album) => void; // Optional long press handler for mobile context menu
}

export default function AlbumCard({ album, onPlay, onPause, isPlaying = false, pageContext, onCardClick, onLongPress }: AlbumCardProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const releaseYear = album.releaseDate?.slice(0, 4);
  const releaseTypeLabel = getReleaseTypeLabel(album.releaseType, album.isSingle);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
  };

  const handleDragStart = (e: DragEvent) => {
    const url = generateDragUrl('album', album.id);
    e.dataTransfer.setData('text/uri-list', url);
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.effectAllowed = 'copyLink';
  };

  const handleClick = () => {
    if (onCardClick) {
      onCardClick(album);
      return;
    }
    navigate(`/album/${album.id}`);
  };

  // Use touch-optimized click handler for mobile
  const touchHandlers = useTouchClick(handleClick, {
    onLongPress: onLongPress ? () => onLongPress(album) : undefined,
    longPressDelay: 500,
  });

  return (
    <>
    <div 
      className={`rounded-lg transition-colors cursor-pointer group relative ${isMobile ? 'py-2' : 'p-4 hover:bg-white/10'}`}
      {...(isMobile ? touchHandlers : { onClick: handleClick })}
      onContextMenu={handleContextMenu}
    >
      {/* Artwork */}
      <div className={`aspect-square rounded-md bg-spotify-gray overflow-hidden relative shadow-lg ${isMobile ? 'mb-2' : 'mb-4'}`}>
        {album.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(album.artworkUrl, isMobile ? 240 : 300)}
            alt={album.name}
            className="w-full h-full object-cover"
            allowDrag={!isMobile}
            draggable={!isMobile}
            onDragStart={isMobile ? undefined : handleDragStart}
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center text-spotify-light-gray ${isMobile ? 'text-2xl' : 'text-4xl'}`}>
            ♪
          </div>
        )}
        
        {/* Play/Pause button overlay - desktop only */}
        {!isMobile && (onPlay || onPause) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying && onPause) {
                onPause();
              } else if (onPlay) {
                onPlay();
              }
            }}
            className="absolute bottom-2 right-2 w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200 hover:scale-105"
          >
            <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
              {isPlaying ? (
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              ) : (
                <path d="M6 4l15 8-15 8V4z" />
              )}
            </svg>
          </button>
        )}
      </div>

      {/* Info - fixed height to ensure consistent card size */}
      <div className={isMobile ? 'min-h-[3rem]' : 'min-h-[4.5rem]'}>
        <div className="relative mb-1">
          <h3 className={`font-bold line-clamp-2 pr-5 ${isMobile ? 'text-sm' : ''}`}>{album.name}</h3>
          {album.contentRating === 'explicit' && (
            <span className="absolute top-2 right-0 w-3.5 h-3.5 bg-white/20 rounded-sm text-[8px] text-white/80 flex items-center justify-center font-medium">
              E
            </span>
          )}
        </div>
        <p className={`text-spotify-light-gray truncate ${isMobile ? 'text-xs' : 'text-sm'}`}>
          {releaseYear ? `${releaseYear} • ` : ''}
          {releaseTypeLabel}
          {album.artistName ? (
            <>
              {' • '}
              <ClickableLink
                text={album.artistName}
                href={getArtistHref(album.artistId)}
                disabled={!album.artistId}
              />
            </>
          ) : null}
        </p>
      </div>
    </div>

    {/* Context Menu */}
    <AlbumContextMenu
      album={album}
      isOpen={menuOpen}
      position={menuPosition}
      onClose={handleMenuClose}
      pageContext={pageContext}
    />
    </>
  );
}
