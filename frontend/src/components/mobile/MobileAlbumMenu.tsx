import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IoAddCircleOutline,
  IoArrowDownCircleOutline,
  IoCheckmarkCircle,
  IoMusicalNotes,
  IoPerson,
} from 'react-icons/io5';
import { Album, PageContextType } from '../../types';
import MobileMenu, { MobileMenuItem, MobileMenuDivider, MobileMenuHeader } from './MobileMenu';
import ConfirmDialog from '../ConfirmDialog';
import { usePlayerStore } from '../../store/playerStore';
import { useLibraryAlbumsStore } from '../../store/libraryAlbumsStore';
import { useOfflineCacheStore } from '../../store/offlineCacheStore';
import { useToastStore } from '../../store/toastStore';
import { getAlbumMenuVisibility } from '../../utils/menuVisibility';
import { getAlbumDetail } from '../../api';

interface MobileAlbumMenuProps {
  album: Album | null;
  isOpen: boolean;
  onClose: () => void;
  pageContext?: PageContextType;
}

/**
 * MobileAlbumMenu - Mobile-optimized album context menu
 * Uses bottom sheet presentation with same content as PC version
 */
export default function MobileAlbumMenu({ album, isOpen, onClose, pageContext }: MobileAlbumMenuProps) {
  const navigate = useNavigate();
  const { addSongsToQueue } = usePlayerStore();
  const { saveAlbum, removeAlbum, isSaved } = useLibraryAlbumsStore();
  const {
    cachedAlbumIds,
    partialAlbumIds,
    startAlbumDownload,
    deleteAlbumCache,
    cancelDownload,
    downloadProgress,
  } = useOfflineCacheStore();
  const { showToast } = useToastStore();
  const [isLoadingQueue, setIsLoadingQueue] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!album) return null;

  const albumSaved = isSaved(album.id);
  const menuVisibility = getAlbumMenuVisibility(pageContext);
  const albumCacheStatus = !cachedAlbumIds.has(album.id)
    ? 'none'
    : partialAlbumIds.has(album.id)
      ? 'partial'
      : 'full';
  const isAlbumDownloading =
    downloadProgress?.status === 'downloading' &&
    downloadProgress.collectionType === 'album' &&
    downloadProgress.collectionId === album.id;
  const cacheButtonLabel = isAlbumDownloading
    ? '取消缓存'
    : albumCacheStatus === 'full'
      ? '删除缓存'
      : albumCacheStatus === 'partial'
        ? '更新缓存'
        : '缓存专辑';

  // Build header info
  const header: MobileMenuHeader = {
    artworkUrl: album.artworkUrl,
    title: album.name,
    subtitle: album.artistName,
  };

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
    if (album.tracks && album.tracks.length > 0) {
      addSongsToQueue(album.tracks);
      onClose();
      return;
    }
    
    setIsLoadingQueue(true);
    try {
      const albumDetail = await getAlbumDetail(album.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        addSongsToQueue(albumDetail.tracks);
      }
      onClose();
    } catch (error) {
      console.error('Failed to fetch album tracks:', error);
      onClose();
    } finally {
      setIsLoadingQueue(false);
    }
  };

  const handleGoToArtist = async () => {
    const artistId = album.artistId || album.tracks?.[0]?.artistId;
    if (artistId) {
      navigate(`/artist/${artistId}`);
      onClose();
      return;
    }
    
    try {
      const { search } = await import('../../api');
      const results = await search(album.artistName, 'artists');
      if (results.artists && results.artists.length > 0) {
        navigate(`/artist/${results.artists[0].id}`);
      } else {
        navigate(`/search?q=${encodeURIComponent(album.artistName)}`);
      }
    } catch {
      navigate(`/search?q=${encodeURIComponent(album.artistName)}`);
    }
    onClose();
  };

  const handleCacheAction = async () => {
    try {
      if (isAlbumDownloading) {
        cancelDownload();
        showToast('已取消缓存。');
        onClose();
        return;
      }

      if (albumCacheStatus === 'full') {
        await deleteAlbumCache(album.id);
        showToast('已删除缓存。');
        onClose();
        return;
      }

      await startAlbumDownload(album.id);
      showToast(albumCacheStatus === 'partial' ? '已开始更新缓存。' : '已开始缓存。');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '缓存操作失败');
    }

    onClose();
  };

  return (
    <>
      <MobileMenu isOpen={isOpen} onClose={onClose} header={header}>
        {/* Add/Remove from library */}
        <MobileMenuItem
          icon={albumSaved ? <IoCheckmarkCircle size={22} className="text-spotify-green" /> : <IoAddCircleOutline size={22} />}
          label={albumSaved ? '从音乐库中删除' : '添加到音乐库'}
          onClick={albumSaved ? handleRemoveClick : handleAddToLibrary}
        />

        {/* Add to queue */}
        <MobileMenuItem
          icon={<IoMusicalNotes size={22} />}
          label={isLoadingQueue ? '加载中...' : '加入播放队列'}
          onClick={handleAddToQueue}
          disabled={isLoadingQueue}
        />

        <MobileMenuItem
          icon={
            albumCacheStatus === 'full' ? (
              <IoCheckmarkCircle size={22} className="text-spotify-green" />
            ) : (
              <IoArrowDownCircleOutline
                size={22}
                className={isAlbumDownloading ? 'animate-spin' : undefined}
              />
            )
          }
          label={cacheButtonLabel}
          onClick={() => void handleCacheAction()}
        />

        {/* Go to artist */}
        {menuVisibility.showGoToArtist && (
          <>
            <MobileMenuDivider />
            <MobileMenuItem
              icon={<IoPerson size={22} />}
              label="转至艺术家"
              onClick={handleGoToArtist}
            />
          </>
        )}
      </MobileMenu>

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
    </>
  );
}
