import { useState, useCallback, DragEvent, MouseEvent } from 'react';
import { Album, PageContextType } from '../types';
import { ArtistInfo } from '../store/followedArtistsStore';
import { MenuPosition } from './ContextMenu';
import { generateDragUrl, ImageType } from '../utils/dragLink';
import ArtistContextMenu from './ArtistContextMenu';
import AlbumContextMenu from './AlbumContextMenu';
import PlaylistContextMenu from './PlaylistContextMenu';
import CachedImage from './CachedImage';

interface PlaylistInfo {
  id: string;
  name: string;
}

interface DraggableImageProps {
  type: ImageType;
  id: string;
  src: string;
  alt: string;
  className?: string;
  // Type-specific data
  artistData?: ArtistInfo;
  albumData?: Album;
  playlistData?: PlaylistInfo;
  // Context and callbacks
  pageContext?: PageContextType;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function DraggableImage({
  type,
  id,
  src,
  alt,
  className = '',
  artistData,
  albumData,
  playlistData,
  pageContext,
  onEdit,
  onDelete,
}: DraggableImageProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ x: 0, y: 0 });

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
            pageContext={pageContext}
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

  return (
    <>
      <CachedImage
        src={src}
        alt={alt}
        className={className}
        draggable
        onContextMenu={handleContextMenu}
        onDragStart={handleDragStart}
      />
      {renderContextMenu()}
    </>
  );
}
