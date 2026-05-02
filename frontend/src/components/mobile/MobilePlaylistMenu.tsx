import { useState } from 'react';
import {
  IoArrowDownCircleOutline,
  IoCheckmarkCircle,
  IoMusicalNotes,
  IoPencil,
  IoTrash,
} from 'react-icons/io5';
import MobileMenu, { MobileMenuItem, MobileMenuDivider, MobileMenuHeader } from './MobileMenu';
import ConfirmDialog from '../ConfirmDialog';
import { usePlayerStore } from '../../store/playerStore';
import { useOfflineCacheStore } from '../../store/offlineCacheStore';
import { useToastStore } from '../../store/toastStore';
import { getPlaylist } from '../../api';

interface PlaylistInfo {
  id: string;
  name: string;
  artworkUrl?: string;
  songCount?: number;
}

interface MobilePlaylistMenuProps {
  playlist: PlaylistInfo | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * MobilePlaylistMenu - Mobile-optimized playlist context menu
 * Uses bottom sheet presentation with same content as PC version
 */
export default function MobilePlaylistMenu({ 
  playlist, 
  isOpen, 
  onClose, 
  onEdit, 
  onDelete 
}: MobilePlaylistMenuProps) {
  const { addSongsToQueue } = usePlayerStore();
  const {
    cachedPlaylistIds,
    partialPlaylistIds,
    startPlaylistDownload,
    deletePlaylistCache,
    cancelDownload,
    downloadProgress,
  } = useOfflineCacheStore();
  const { showToast } = useToastStore();
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!playlist) return null;

  // Build header info
  const header: MobileMenuHeader = {
    artworkUrl: playlist.artworkUrl,
    title: playlist.name,
    subtitle: playlist.songCount !== undefined ? `${playlist.songCount} 首歌曲` : '歌单',
  };
  const playlistCacheStatus = !cachedPlaylistIds.has(playlist.id)
    ? 'none'
    : partialPlaylistIds.has(playlist.id)
      ? 'partial'
      : 'full';
  const isPlaylistDownloading =
    downloadProgress?.status === 'downloading' &&
    downloadProgress.collectionType === 'playlist' &&
    downloadProgress.collectionId === playlist.id;
  const cacheButtonLabel = isPlaylistDownloading
    ? '取消缓存'
    : playlistCacheStatus === 'full'
      ? '删除缓存'
      : playlistCacheStatus === 'partial'
        ? '更新缓存'
        : '缓存歌单';

  const handleAddToQueue = async () => {
    setIsLoadingQueue(true);
    try {
      const playlistData = await getPlaylist(playlist.id);
      if (playlistData.songs && playlistData.songs.length > 0) {
        addSongsToQueue(playlistData.songs);
      }
      onClose();
    } catch (error) {
      console.error('Failed to fetch playlist songs:', error);
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

  const handleCacheAction = async () => {
    try {
      if (isPlaylistDownloading) {
        cancelDownload();
        showToast('已取消缓存。');
        onClose();
        return;
      }

      if (playlistCacheStatus === 'full') {
        await deletePlaylistCache(playlist.id);
        showToast('已删除缓存。');
        onClose();
        return;
      }

      await startPlaylistDownload(playlist.id);
      showToast(playlistCacheStatus === 'partial' ? '已开始更新缓存。' : '已开始缓存。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '缓存操作失败');
    }

    onClose();
  };

  return (
    <>
      <MobileMenu isOpen={isOpen} onClose={onClose} header={header}>
        {/* Add to queue */}
        <MobileMenuItem
          icon={<IoMusicalNotes size={22} />}
          label={isLoadingQueue ? '加载中...' : '加入播放队列'}
          onClick={handleAddToQueue}
          disabled={isLoadingQueue}
        />

        <MobileMenuItem
          icon={
            playlistCacheStatus === 'full' ? (
              <IoCheckmarkCircle size={22} className="text-spotify-green" />
            ) : (
              <IoArrowDownCircleOutline
                size={22}
                className={isPlaylistDownloading ? 'animate-spin' : undefined}
              />
            )
          }
          label={cacheButtonLabel}
          onClick={() => void handleCacheAction()}
        />

        {/* Edit details */}
        <MobileMenuItem
          icon={<IoPencil size={22} />}
          label="编辑详情"
          onClick={handleEdit}
        />

        <MobileMenuDivider />

        {/* Delete */}
        <MobileMenuItem
          icon={<IoTrash size={22} />}
          label="删除"
          onClick={handleDeleteClick}
          danger
        />
      </MobileMenu>

      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="要从音乐库中删除吗？"
        message={`我们将从音乐库中删除「${playlist.name}」。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </>
  );
}
