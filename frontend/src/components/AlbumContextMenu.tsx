import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoCheckmarkCircle, IoAddCircleOutline, IoMusicalNotes, IoPerson } from 'react-icons/io5';
import { Album, PageContextType } from '../types';
import { ContextMenu, MenuItem, MenuDivider, MenuPosition } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import { usePlayerStore } from '../store/playerStore';
import { useLibraryAlbumsStore } from '../store/libraryAlbumsStore';
import { getAlbumMenuVisibility } from '../utils/menuVisibility';
import { getAlbumDetail } from '../api';

interface AlbumContextMenuProps {
  album: Album;
  isOpen: boolean;
  position: MenuPosition;
  onClose: () => void;
  pageContext?: PageContextType;
  closeOnScroll?: boolean;
}

// Menu item labels (exported for testing)
export const ALBUM_MENU_ITEMS = {
  ADD_TO_LIBRARY: '添加到音乐库',
  REMOVE_FROM_LIBRARY: '从音乐库中删除',
  ADD_TO_QUEUE: '加入播放队列',
  GO_TO_ARTIST: '转至艺术家',
} as const;

export default function AlbumContextMenu({
  album,
  isOpen,
  position,
  onClose,
  pageContext,
  closeOnScroll = true,
}: AlbumContextMenuProps) {
  const navigate = useNavigate();
  const { addSongsToQueue } = usePlayerStore();
  const { saveAlbum, removeAlbum, isSaved } = useLibraryAlbumsStore();
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const albumSaved = isSaved(album.id);
  const menuVisibility = getAlbumMenuVisibility(pageContext);

  const handleAddToLibrary = async () => {
    if (!albumSaved) {
      await saveAlbum(album);
    }
    onClose();
  };

  const handleRemoveClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmRemove = async () => {
    await removeAlbum(album.id);
    setShowConfirmDialog(false);
    onClose();
  };

  const handleCancelRemove = () => {
    setShowConfirmDialog(false);
  };

  const handleAddToQueue = async () => {
    // If tracks are already loaded, use them directly
    if (album.tracks && album.tracks.length > 0) {
      addSongsToQueue(album.tracks);
      onClose();
      return;
    }
    
    // Otherwise, fetch album tracks from API
    setIsLoadingQueue(true);
    try {
      const albumDetail = await getAlbumDetail(album.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        addSongsToQueue(albumDetail.tracks);
      }
      onClose();
    } catch (error) {
      console.error('Failed to fetch album tracks:', error);
      // Don't modify queue on error, just close menu
      onClose();
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const handleGoToArtist = async () => {
    // Navigate to artist page using album's artistId, or first track's artistId
    const artistId = album.artistId || album.tracks?.[0]?.artistId;
    if (artistId) {
      navigate(`/artist/${artistId}`);
      onClose();
      return;
    }
    
    // If no artistId available, search for the artist and navigate to first result
    try {
      const { search } = await import('../api');
      const results = await search(album.artistName, 'artists');
      if (results.artists && results.artists.length > 0) {
        navigate(`/artist/${results.artists[0].id}`);
      } else {
        // Fallback to search page if no artist found
        navigate(`/search?q=${encodeURIComponent(album.artistName)}`);
      }
    } catch {
      // Fallback to search page on error
      navigate(`/search?q=${encodeURIComponent(album.artistName)}`);
    }
    onClose();
  };

  return (
    <ContextMenu
      isOpen={isOpen}
      position={position}
      onClose={onClose}
      closeOnScroll={closeOnScroll}
    >
      <MenuItem
        icon={albumSaved ? <IoCheckmarkCircle className="text-green-500" /> : <IoAddCircleOutline />}
        label={albumSaved ? ALBUM_MENU_ITEMS.REMOVE_FROM_LIBRARY : ALBUM_MENU_ITEMS.ADD_TO_LIBRARY}
        onClick={albumSaved ? handleRemoveClick : handleAddToLibrary}
      />
      <MenuItem
        icon={<IoMusicalNotes />}
        label={isLoadingQueue ? '加载中...' : ALBUM_MENU_ITEMS.ADD_TO_QUEUE}
        onClick={handleAddToQueue}
        disabled={isLoadingQueue}
      />
      
      {menuVisibility.showGoToArtist && (
        <>
          <MenuDivider />
          <MenuItem
            icon={<IoPerson />}
            label={ALBUM_MENU_ITEMS.GO_TO_ARTIST}
            onClick={handleGoToArtist}
          />
        </>
      )}
      
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="从音乐库中删除"
        message={`确定要将「${album.name}」从音乐库中删除吗？`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
        isDestructive
      />
    </ContextMenu>
  );
}
