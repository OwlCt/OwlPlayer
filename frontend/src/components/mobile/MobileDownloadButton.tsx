import { useState } from "react";
import type { Song } from "../../types";
import {
  useOfflineCacheStore,
  type CacheStatus,
} from "../../store/offlineCacheStore";
import type { DownloadProgress } from "../../services/downloadManager";
import ConfirmDialog from "../ConfirmDialog";
import PartialCacheDialog from "../PartialCacheDialog";

function MobileDownloadArrowIcon({
  color,
  size,
}: {
  color: string;
  size: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="17"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M7 14L12 19L17 14"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MobileUncachedIcon({ size }: { size: number }) {
  const strokeColor = "#9ca3af";
  const arrowSize = size * 0.7;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={strokeColor}
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <MobileDownloadArrowIcon color={strokeColor} size={arrowSize} />
      </div>
    </div>
  );
}

function MobileDownloadingIcon({
  size,
  progress,
}: {
  size: number;
  progress: number;
}) {
  const bgColor = "#9ca3af";
  const progressColor = "#1DB954";
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progress / 100) * circumference;
  const squareSize = size * 0.25;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
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
      <div
        className="absolute bg-white"
        style={{ width: squareSize, height: squareSize }}
      />
    </div>
  );
}

function MobileDownloadedIcon({ size }: { size: number }) {
  const fillColor = "#1DB954";
  const arrowColor = "#000000";
  const arrowSize = size * 0.7;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill={fillColor} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <MobileDownloadArrowIcon color={arrowColor} size={arrowSize} />
      </div>
    </div>
  );
}

function MobilePartialDownloadIcon({ size }: { size: number }) {
  const strokeColor = "#1DB954";
  const arrowColor = "#1DB954";
  const arrowSize = size * 0.7;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke={strokeColor}
          strokeWidth="1.5"
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <MobileDownloadArrowIcon color={arrowColor} size={arrowSize} />
      </div>
      <div
        className="absolute bg-orange-500 rounded-full"
        style={{ width: size * 0.25, height: size * 0.25, top: 0, right: 0 }}
      />
    </div>
  );
}

function calculateProgress(progress: DownloadProgress | null): number {
  if (!progress || progress.totalSongs === 0) return 0;
  return Math.round((progress.completedSongs / progress.totalSongs) * 100);
}

interface MobileDownloadButtonProps {
  type: "album" | "playlist";
  id: string;
  trackIds: string[];
  size?: number;
}

export default function MobileDownloadButton({
  type,
  id,
  trackIds,
  size = 20,
}: MobileDownloadButtonProps) {
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

  const cacheStatus: CacheStatus =
    type === "album"
      ? getAlbumCacheStatus(id, trackIds)
      : getPlaylistCacheStatus(id, trackIds);
  const cachedCount = trackIds.filter((trackId) => {
    if (!cachedSongIds.has(trackId)) return false;
    const refs = songReferences[trackId];
    if (!refs) return false;
    return type === "album"
      ? refs.albumIds.includes(id)
      : refs.playlistIds.includes(id);
  }).length;
  const isCurrentlyDownloading =
    isDownloading &&
    downloadProgress?.collectionId === id &&
    downloadProgress?.collectionType === type;
  const progress = calculateProgress(downloadProgress);

  const handleDownload = async () => {
    try {
      if (type === "album") {
        await startAlbumDownload(id);
      } else {
        await startPlaylistDownload(id);
      }
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      if (type === "album") {
        await deleteAlbumCache(id);
      } else {
        await deletePlaylistCache(id);
      }
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isCurrentlyDownloading) {
    return (
      <button
        onClick={cancelDownload}
        className="transition-all active:scale-95"
        title="取消下载"
      >
        <MobileDownloadingIcon size={size} progress={progress} />
      </button>
    );
  }

  if (cacheStatus === "partial") {
    return (
      <>
        <button
          onClick={() => setShowPartialDialog(true)}
          disabled={isDeleting}
          className="transition-all active:scale-95 disabled:opacity-50"
          title="部分下载"
        >
          <MobilePartialDownloadIcon size={size} />
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
      </>
    );
  }

  if (cacheStatus === "full") {
    return (
      <>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
          className="transition-all active:scale-95 disabled:opacity-50"
          title="已下载"
        >
          <MobileDownloadedIcon size={size} />
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
      </>
    );
  }

  return (
    <button
      onClick={() => void handleDownload()}
      disabled={isDownloading}
      className="transition-all active:scale-95 disabled:opacity-50"
      title="下载以离线播放"
    >
      <MobileUncachedIcon size={size} />
    </button>
  );
}

export function MobileAlbumDownloadButton({
  albumId,
  trackIds,
  size = 20,
}: {
  albumId: string;
  trackIds: string[];
  size?: number;
}) {
  return (
    <MobileDownloadButton
      type="album"
      id={albumId}
      trackIds={trackIds}
      size={size}
    />
  );
}

export function MobilePlaylistDownloadButton({
  playlistId,
  trackIds,
  size = 20,
}: {
  playlistId: string;
  trackIds: string[];
  size?: number;
}) {
  return (
    <MobileDownloadButton
      type="playlist"
      id={playlistId}
      trackIds={trackIds}
      size={size}
    />
  );
}

const LIKED_SONGS_ID = "liked-songs";

export function MobileLikedSongsDownloadButton({
  songs,
  size = 20,
}: {
  songs: Song[];
  size?: number;
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
  const cacheStatus: CacheStatus = getPlaylistCacheStatus(
    LIKED_SONGS_ID,
    trackIds,
  );
  const cachedCount = trackIds.filter((trackId) => {
    if (!cachedSongIds.has(trackId)) return false;
    const refs = songReferences[trackId];
    if (!refs) return false;
    return refs.playlistIds.includes(LIKED_SONGS_ID);
  }).length;
  const isCurrentlyDownloading =
    isDownloading &&
    downloadProgress?.collectionId === LIKED_SONGS_ID &&
    downloadProgress?.collectionType === "playlist";
  const progress = calculateProgress(downloadProgress);

  const handleDownload = async () => {
    if (songs.length === 0) return;

    try {
      await startLikedSongsDownload(songs);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleConfirmDelete = async () => {
    try {
      setIsDeleting(true);
      await deletePlaylistCache(LIKED_SONGS_ID);
    } catch (error) {
      console.error("Delete failed:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (songs.length === 0) {
    return null;
  }

  if (isCurrentlyDownloading) {
    return (
      <button
        onClick={cancelDownload}
        className="transition-all active:scale-95"
        title="取消下载"
      >
        <MobileDownloadingIcon size={size} progress={progress} />
      </button>
    );
  }

  if (cacheStatus === "partial") {
    return (
      <>
        <button
          onClick={() => setShowPartialDialog(true)}
          disabled={isDeleting}
          className="transition-all active:scale-95 disabled:opacity-50"
          title="部分下载"
        >
          <MobilePartialDownloadIcon size={size} />
        </button>
        <PartialCacheDialog
          isOpen={showPartialDialog}
          title="部分下载"
          message="已点赞的歌曲中有新歌曲尚未下载。"
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
      </>
    );
  }

  if (cacheStatus === "full") {
    return (
      <>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          disabled={isDeleting}
          className="transition-all active:scale-95 disabled:opacity-50"
          title="已下载"
        >
          <MobileDownloadedIcon size={size} />
        </button>
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          title="从下载内容中删除?"
          message="你将无法离线播放已点赞的歌曲。"
          confirmText="删除"
          cancelText="取消"
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setShowDeleteConfirm(false)}
          isLoading={isDeleting}
        />
      </>
    );
  }

  return (
    <button
      onClick={() => void handleDownload()}
      disabled={isDownloading}
      className="transition-all active:scale-95 disabled:opacity-50"
      title="下载以离线播放"
    >
      <MobileUncachedIcon size={size} />
    </button>
  );
}
