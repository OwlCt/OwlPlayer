import { useState } from 'react';
import { IoMusicalNotes, IoPencil, IoTrash } from 'react-icons/io5';
import { ContextMenu, MenuItem, MenuDivider, MenuPosition } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import { usePlayerStore } from '../store/playerStore';
import { getPlaylist } from '../api';

interface PlaylistInfo {
  id: string;
  name: string;
}

interface PlaylistContextMenuProps {
  playlist: PlaylistInfo;
  isOpen: boolean;
  position: MenuPosition;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Menu item labels (exported for testing)
export const PLAYLIST_MENU_ITEMS = {
  ADD_TO_QUEUE: '加入播放队列',
  EDIT_DETAILS: '编辑详情',
  DELETE: '删除',
} as const;

export default function PlaylistContextMenu({ 
  playlist, 
  isOpen, 
  position, 
  onClose, 
  onEdit, 
  onDelete 
}: PlaylistContextMenuProps) {
  const { addSongsToQueue } = usePlayerStore();
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleAddToQueue = async () => {
    // Fetch playlist songs from API
    setIsLoadingQueue(true);
    try {
      const playlistData = await getPlaylist(playlist.id);
      if (playlistData.songs && playlistData.songs.length > 0) {
        addSongsToQueue(playlistData.songs);
      }
      onClose();
    } catch (error) {
      console.error('Failed to fetch playlist songs:', error);
      // Don't modify queue on error, just close menu
      onClose();
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit();
    }
    onClose();
  };

  const handleDeleteClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmDelete = () => {
    if (onDelete) {
      onDelete();
    }
    setShowConfirmDialog(false);
    onClose();
  };

  const handleCancelDelete = () => {
    setShowConfirmDialog(false);
  };

  return (
    <ContextMenu isOpen={isOpen} position={position} onClose={onClose}>
      <MenuItem
        icon={<IoMusicalNotes />}
        label={isLoadingQueue ? '加载中...' : PLAYLIST_MENU_ITEMS.ADD_TO_QUEUE}
        onClick={handleAddToQueue}
        disabled={isLoadingQueue}
      />
      <MenuItem
        icon={<IoPencil />}
        label={PLAYLIST_MENU_ITEMS.EDIT_DETAILS}
        onClick={handleEdit}
      />
      <MenuDivider />
      <MenuItem
        icon={<IoTrash />}
        label={PLAYLIST_MENU_ITEMS.DELETE}
        onClick={handleDeleteClick}
        danger
      />
      
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="要从音乐库中删除吗？"
        message={`我们将从音乐库中删除「${playlist.name}」。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </ContextMenu>
  );
}
