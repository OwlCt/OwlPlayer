import { useState } from 'react';
import { Song } from '../types';
import { useOfflineCacheStore, CacheStatus } from '../store/offlineCacheStore';
import { DownloadProgress } from '../services/downloadManager';
import ConfirmDialog from './ConfirmDialog';
import PartialCacheDialog from './PartialCacheDialog';

interface DownloadButtonProps {
  type: 'album' | 'playlist';
  id: string;
  trackIds: string[];
  size?: 'sm' | 'md' | 'lg' | number;
  showLabel?: boolean;
  className?: string;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDeleteComplete?: () => void;
}

function DownloadArrowIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="17"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M6.5 14L12 19.5L17.5 14"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UncachedIcon({ size }: { size: number }) {
  const strokeColor = '#9ca3af';
  const arrowSize = size * 0.65;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={strokeColor} strokeWidth="1.5" fill="none" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <DownloadArrowIcon color={strokeColor} size={arrowSize} />
      </div>
    </div>
  );
}

function DownloadingIcon({ size, progress }: { size: number; progress: number }) {
  const bgColor = '#9ca3af';
  const progressColor = '#1DB954';
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progress / 100) * circumference;
  const squareSize = size * 0.25;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke={bgColor}
          strokeWidth="1.5"
          fill="none"
          opacity={0.3}
        />
        <circle
          cx="12"
          cy="12"
          r={radius}
          stroke={progressColor}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          transform="rotate(-90 12 12)"
        />
      </svg>
      <div className="absolute bg-white" style={{ width: squareSize, height: squareSize }} />
    </div>
  );
}

function DownloadedIcon({ size }: { size: number }) {
  const fillColor = '#1DB954';
  const arrowColor = '#000000';
  const arrowSize = size * 0.65;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill={fillColor} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <DownloadArrowIcon color={arrowColor} size={arrowSize} />
      </div>
    </div>
  );
}

function PartialDownloadIcon({ size }: { size: number }) {
  const strokeColor = '#1DB954';
  const arrowColor = '#1DB954';
  const arrowSize = size * 0.65;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke={strokeColor} strokeWidth="1.5" fill="none" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <DownloadArrowIcon color={arrowColor} size={arrowSize} />
      </div>
      <div
        className="absolute bg-orange-500 rounded-full"
        style={{ width: size * 0.25, height: size * 0.25, top: 0, right: 0 }}
      />
    </div>
  );
}

function getButtonSize(size: 'sm' | 'md' | 'lg' | number): number {
  if (typeof size === 'number') {
    return size;
  }

  switch (size) {
    case 'sm':
      return 16;
    case 'md':
      return 32;
    case 'lg':
      return 32;
  }
}

function calculateProgress(progress: DownloadProgress | null): number {
  if (!progress || progress.totalSongs === 0) return 0;
  return Math.round((progress.completedSongs / progress.totalSongs) * 100);
}

export default function DownloadButton({
  type,
  id,
  trackIds,
  size = 'md',
  showLabel = false,
  className = '',
  onDownloadStart,
  onDownloadComplete,
  onDeleteComplete,
}: DownloadButtonProps) {
  const {
    cachedSongIds,
    songReferences,
    getAlbumCacheStatus,
    getPlaylistCacheStatus,
    downloadProgress,
    isDownloading,
    startAlbumDownload,
    startPlaylistDownload,
    cancelDownload,
    deleteAlbumCache,
    deletePlaylistCache,
  } = useOfflineCacheStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPartialDialog, setShowPartialDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const cacheStatus: CacheStatus = type === 'album'
    ? getAlbumCacheStatus(id, trackIds)
    : getPlaylistCacheStatus(id, trackIds);
  const cachedCount = trackIds.filter((trackId) => {
    if (!cachedSongIds.has(trackId)) return false;
    const refs = songReferences[trackId];
    if (!refs) return false;
    return type === 'album' ? refs.albumIds.includes(id) : refs.playlistIds.includes(id);
  }).length;
  const isCurrentlyDownloading = isDownloading &&
    downloadProgress?.collectionId === id &&
    downloadProgress?.collectionType === type;
  const buttonSize = getButtonSize(size);
  const progress = calculateProgress(downloadProgress);

  const handleDownload = async () => {
    try {
      onDownloadStart?.();
      if (type === 'album') {
        await startAlbumDownload(id);
      } else {
        await startPlaylistDownload(id);
      }
      onDownloadComplete?.();
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      if (type === 'album') {
        await deleteAlbumCache(id);
      } else {
        await deletePlaylistCache(id);
      }
      onDeleteComplete?.();
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isCurrentlyDownloading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button onClick={cancelDownload} className="transition-all hover:scale-105" title="取消下载">
          <DownloadingIcon size={buttonSize} progress={progress} />
        </button>
        {showLabel && (
          <span className="text-sm text-spotify-light-gray">
            下载中 {downloadProgress?.completedSongs}/{downloadProgress?.totalSongs}
          </span>
        )}
      </div>
    );
  }

  if (cacheStatus === 'partial') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => setShowPartialDialog(true)}
          disabled={isDeleting}
          className="transition-all hover:scale-105 disabled:opacity-50"
          title="部分下载"
        >
          <PartialDownloadIcon size={buttonSize} />
        </button>
        {showLabel && (
          <span className="text-sm text-spotify-light-gray">
            部分下载 ({cachedCount}/{trackIds.length})
          </span>
        )}
        <PartialCacheDialog
          isOpen={showPartialDialog}
          title="部分下载"
          message="此内容有新歌曲尚未下载。"
          cachedCount={cachedCount}
          totalCount={trackIds.length}
          onIncrementalDownload={async () => {
            setShowPartialDialog(false);
            await handleDownload();
          }}
          onDelete={async () => {
            setShowPartialDialog(false);
            await handleConfirmDelete();
          }}
          onCancel={() => setShowPartialDialog(false)}
        />
      </div>
    );
  }

  if (cacheStatus === 'full') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
          className="transition-all hover:scale-105 disabled:opacity-50"
          title="已下载"
        >
          <DownloadedIcon size={buttonSize} />
        </button>
        {showLabel && <span className="text-sm text-spotify-light-gray">已下载</span>}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="从下载内容中删除?"
          message="你将无法离线播放此内容。"
          confirmText="删除"
          cancelText="取消"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isDeleting}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={() => void handleDownload()}
        disabled={isDownloading}
        className="transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        title="下载以离线播放"
      >
        <UncachedIcon size={buttonSize} />
      </button>
      {showLabel && <span className="text-sm text-spotify-light-gray">下载</span>}
    </div>
  );
}

export function AlbumDownloadButton({
  albumId,
  trackIds,
  size = 'lg',
  className = '',
}: {
  albumId: string;
  trackIds: string[];
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
}) {
  return (
    <DownloadButton
      type="album"
      id={albumId}
      trackIds={trackIds}
      size={size}
      showLabel={false}
      className={className}
    />
  );
}

export function PlaylistDownloadButton({
  playlistId,
  trackIds,
  size = 'lg',
  className = '',
}: {
  playlistId: string;
  trackIds: string[];
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
}) {
  return (
    <DownloadButton
      type="playlist"
      id={playlistId}
      trackIds={trackIds}
      size={size}
      showLabel={false}
      className={className}
    />
  );
}

export function CompactDownloadButton({
  type,
  id,
  trackIds,
  className = '',
}: {
  type: 'album' | 'playlist';
  id: string;
  trackIds: string[];
  className?: string;
}) {
  return (
    <DownloadButton
      type={type}
      id={id}
      trackIds={trackIds}
      size="sm"
      showLabel={false}
      className={className}
    />
  );
}

const LIKED_SONGS_ID = 'liked-songs';

export function LikedSongsDownloadButton({
  songs,
  size = 'lg',
  className = '',
}: {
  songs: Song[];
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
}) {
  const {
    cachedSongIds,
    songReferences,
    getPlaylistCacheStatus,
    downloadProgress,
    isDownloading,
    startLikedSongsDownload,
    cancelDownload,
    deletePlaylistCache,
  } = useOfflineCacheStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPartialDialog, setShowPartialDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const trackIds = songs.map((song) => song.id);
  const cacheStatus = getPlaylistCacheStatus(LIKED_SONGS_ID, trackIds);
  const cachedCount = trackIds.filter((trackId) => {
    if (!cachedSongIds.has(trackId)) return false;
    const refs = songReferences[trackId];
    if (!refs) return false;
    return refs.playlistIds.includes(LIKED_SONGS_ID);
  }).length;
  const isCurrentlyDownloading = isDownloading &&
    downloadProgress?.collectionId === LIKED_SONGS_ID &&
    downloadProgress?.collectionType === 'playlist';
  const buttonSize = getButtonSize(size);
  const progress = calculateProgress(downloadProgress);

  const handleDownload = async () => {
    if (songs.length === 0) return;
    try {
      await startLikedSongsDownload(songs);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      await deletePlaylistCache(LIKED_SONGS_ID);
    } catch (error) {
      console.error('Delete failed:', error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isCurrentlyDownloading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button onClick={cancelDownload} className="transition-all hover:scale-105" title="取消下载">
          <DownloadingIcon size={buttonSize} progress={progress} />
        </button>
      </div>
    );
  }

  if (cacheStatus === 'partial') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => setShowPartialDialog(true)}
          disabled={isDeleting}
          className="transition-all hover:scale-105 disabled:opacity-50"
          title="部分下载"
        >
          <PartialDownloadIcon size={buttonSize} />
        </button>
        <PartialCacheDialog
          isOpen={showPartialDialog}
          title="部分下载"
          message="此内容有新歌曲尚未下载。"
          cachedCount={cachedCount}
          totalCount={trackIds.length}
          onIncrementalDownload={async () => {
            setShowPartialDialog(false);
            await handleDownload();
          }}
          onDelete={async () => {
            setShowPartialDialog(false);
            await handleConfirmDelete();
          }}
          onCancel={() => setShowPartialDialog(false)}
        />
      </div>
    );
  }

  if (cacheStatus === 'full') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
          className="transition-all hover:scale-105 disabled:opacity-50"
          title="已下载"
        >
          <DownloadedIcon size={buttonSize} />
        </button>
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="从下载内容中删除?"
          message="你将无法离线播放此内容。"
          confirmText="删除"
          cancelText="取消"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isDeleting}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={() => void handleDownload()}
        disabled={isDownloading}
        className="transition-all hover:scale-105 disabled:opacity-50"
        title="下载以离线播放"
      >
        <UncachedIcon size={buttonSize} />
      </button>
    </div>
  );
}
