import { useState } from 'react';
import { IoEllipsisHorizontal, IoPause, IoPlay } from 'react-icons/io5';
import { PageContextType, Song } from '../types';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { useOfflineCacheStore } from '../store/offlineCacheStore';
import { usePlayerStore } from '../store/playerStore';
import { getProxiedImageUrl } from '../utils/image';
import {
  MiniDownloadedIcon,
  MiniDownloadingIcon,
} from './CacheStatusIndicator';
import CachedImage from './CachedImage';
import ClickableLink, { getAlbumHref, getArtistHref } from './ClickableLink';
import { MenuPosition } from './ContextMenu';
import { LikeButton } from './LikeButton';
import SongContextMenu from './SongContextMenu';

interface SongCardProps {
  song: Song;
  onPlay: () => void;
  showIndex?: number;
  showAlbum?: boolean;
  hideArtwork?: boolean;
  showLikeButton?: boolean;
  alwaysShowLikedStatus?: boolean;
  addedAt?: string;
  isSelected?: boolean;
  onSelect?: (songId: string) => void;
  pageContext?: PageContextType;
  isCurrentSource?: boolean;
  useGridLayout?: boolean;
  hideDate?: boolean;
  showDiscoveryBadge?: boolean;
}

export default function SongCard({
  song,
  onPlay,
  showIndex,
  showAlbum = true,
  hideArtwork = false,
  showLikeButton = true,
  alwaysShowLikedStatus = false,
  addedAt,
  isSelected = false,
  onSelect,
  pageContext,
  isCurrentSource = true,
  useGridLayout = false,
  hideDate = false,
  showDiscoveryBadge = false,
}: SongCardProps) {
  const { currentSong, isPlaying, togglePlay } = usePlayerStore();
  const { isLiked } = useLikedSongsStore();
  const { cachedSongIds, downloadProgress, isDownloading } = useOfflineCacheStore();
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [menuCloseOnScroll, setMenuCloseOnScroll] = useState(true);

  const isCurrentSong = currentSong?.id === song.id;
  const liked = isLiked(song.id);
  const isCached = cachedSongIds.has(song.id);
  const isInDownloadQueue = isDownloading &&
    downloadProgress &&
    !isCached &&
    (
      (downloadProgress.collectionType === 'album' &&
        song.albumId === downloadProgress.collectionId) ||
      (downloadProgress.collectionType === 'playlist' &&
        downloadProgress.currentSongId === song.id)
    );
  const isCurrentlyDownloading = isDownloading &&
    downloadProgress?.currentSongId === song.id;
  const showDownloadingIndicator = isInDownloadQueue || isCurrentlyDownloading;
  const songDownloadProgress = isCurrentlyDownloading && downloadProgress?.totalSongs
    ? Math.round((downloadProgress.completedSongs / downloadProgress.totalSongs) * 100)
    : 0;

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 30) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const handleClick = () => {
    onSelect?.(song.id);
  };

  const handleDoubleClick = () => {
    onSelect?.(song.id);
    if (isCurrentSong) {
      togglePlay();
    } else {
      onPlay();
    }
  };

  const handlePlayButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCurrentSong) {
      togglePlay();
    } else {
      onPlay();
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(song.id);
    setMenuCloseOnScroll(true);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  };

  const handleMenuButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect?.(song.id);
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuCloseOnScroll(false);
    setMenuPosition({ x: rect.right, y: rect.bottom });
    setMenuOpen(true);
  };

  const getRowClasses = () => {
    const base = useGridLayout
      ? `track-list-grid track-row items-center cursor-pointer group ${hideDate ? 'no-date' : ''}`
      : 'flex items-center gap-4 p-2 rounded-lg cursor-pointer group transition-colors';

    const isArtistPage = pageContext === 'artist';
    let stateClass = '';

    if (isSelected) {
      stateClass = useGridLayout ? 'selected' : (isArtistPage ? 'bg-white/20 hover:bg-white/25' : 'bg-white/20');
    } else if (isCurrentSong) {
      stateClass = useGridLayout ? 'playing' : (isArtistPage ? 'hover:bg-white/15' : 'bg-spotify-gray');
    } else {
      stateClass = useGridLayout ? '' : (isArtistPage ? 'hover:bg-white/10' : 'hover:bg-spotify-dark');
    }

    return `${base} ${stateClass}`;
  };
  if (useGridLayout) {
    return (
      <>
        <div
          data-song-card
          role="row"
          aria-selected={isSelected}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={getRowClasses()}
        >
          <div className="flex items-center justify-center" role="gridcell">
            {isCurrentSong && isPlaying && isCurrentSource && !isHovered ? (
              <div className="equalizer">
                <div className="equalizer-bar"></div>
                <div className="equalizer-bar"></div>
                <div className="equalizer-bar"></div>
                <div className="equalizer-bar"></div>
              </div>
            ) : showIndex !== undefined ? (
              <span className={`text-base tabular-nums ${isCurrentSong && isCurrentSource ? 'text-spotify-green' : 'text-spotify-light-gray'} group-hover:hidden`}>
                {showIndex}
              </span>
            ) : null}
            <button
              onClick={handlePlayButtonClick}
              className={`flex items-center justify-center ${showIndex !== undefined || (isCurrentSong && isPlaying && isCurrentSource) ? 'hidden group-hover:flex' : ''}`}
            >
              {isCurrentSong && isPlaying ? (
                <IoPause className="h-4 w-4 text-white" />
              ) : (
                <IoPlay className="h-4 w-4 text-white" />
              )}
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-3" role="gridcell">
            {!hideArtwork && (
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-spotify-gray">
                {song.artworkUrl ? (
                  <CachedImage
                    src={getProxiedImageUrl(song.artworkUrl, 80)}
                    alt={song.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-spotify-light-gray">♪</div>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`truncate text-base font-normal ${isCurrentSong && isCurrentSource ? 'text-spotify-green' : 'text-white'}`}>
                  {song.name}
                </span>
                {song.contentRating === 'explicit' && (
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm bg-white/20 text-[9px] font-medium text-white/80">
                    E
                  </span>
                )}
                {showDiscoveryBadge && song.source === 'discovery' && (
                  <span className="flex-shrink-0 rounded bg-spotify-green/90 px-1.5 py-0.5 text-[10px] font-medium text-black">
                    发现
                  </span>
                )}
              </div>
              <div className="truncate text-sm text-spotify-light-gray flex items-center gap-1">
                {showDownloadingIndicator && (
                  <MiniDownloadingIcon
                    size={14}
                    progress={songDownloadProgress}
                  />
                )}
                {!showDownloadingIndicator && isCached && (
                  <MiniDownloadedIcon size={14} />
                )}
                <ClickableLink
                  text={song.artistName}
                  href={getArtistHref(song.artistId)}
                  disabled={!song.artistId}
                />
              </div>
            </div>
          </div>

          {showAlbum && (
            <div className="col-album min-w-0 truncate text-sm text-spotify-light-gray" role="gridcell">
              <ClickableLink
                text={song.albumName}
                href={getAlbumHref(song.albumId)}
                disabled={!song.albumId}
              />
            </div>
          )}

          {!hideDate && addedAt && (
            <div className="col-date text-sm text-spotify-light-gray" role="gridcell">
              {formatRelativeTime(addedAt)}
            </div>
          )}

          <div className="flex items-center justify-end gap-2" role="gridcell">
            {showLikeButton && (
              <div className={`transition-opacity ${isHovered || (alwaysShowLikedStatus && liked) ? 'opacity-100' : 'opacity-0'}`}>
                <LikeButton song={song} size="sm" showOnHover={false} />
              </div>
            )}
            <span className="w-10 text-right text-sm tabular-nums text-spotify-light-gray">
              {formatDuration(song.duration)}
            </span>
            <button
              onClick={handleMenuButtonClick}
              className={`rounded-full p-1 hover:bg-white/10 transition-opacity ${isHovered || menuOpen ? 'opacity-100' : 'opacity-0'}`}
            >
              <IoEllipsisHorizontal className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>

        <SongContextMenu
          song={song}
          isOpen={menuOpen}
          position={menuPosition}
          onClose={() => setMenuOpen(false)}
          pageContext={pageContext}
          closeOnScroll={menuCloseOnScroll}
        />
      </>
    );
  }

  return (
    <>
      <div
        data-song-card
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={getRowClasses()}
      >
        <div className="flex w-8 items-center justify-center">
          {isCurrentSong && isPlaying && isCurrentSource && !isHovered ? (
            <div className="equalizer">
              <div className="equalizer-bar"></div>
              <div className="equalizer-bar"></div>
              <div className="equalizer-bar"></div>
              <div className="equalizer-bar"></div>
            </div>
          ) : showIndex !== undefined ? (
            <span className={`text-sm ${isCurrentSong && isCurrentSource ? 'text-spotify-green' : 'text-spotify-light-gray'} group-hover:hidden`}>
              {showIndex}
            </span>
          ) : null}
          <button
            onClick={handlePlayButtonClick}
            className={`flex items-center justify-center ${showIndex !== undefined || (isCurrentSong && isPlaying && isCurrentSource) ? 'hidden group-hover:flex' : ''}`}
          >
            {isCurrentSong && isPlaying ? (
              <IoPause className="text-white" />
            ) : (
              <IoPlay className="text-white" />
            )}
          </button>
        </div>

        {!hideArtwork && (
          <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-spotify-gray">
            {song.artworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(song.artworkUrl, 80)}
                alt={song.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-spotify-light-gray">♪</div>
            )}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className={`truncate font-medium ${isCurrentSong ? 'text-spotify-green' : 'text-white'}`}>
              {song.name}
            </h3>
            {song.contentRating === 'explicit' && (
              <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm bg-white/20 text-[9px] font-medium text-white/80">
                E
              </span>
            )}
            {showDiscoveryBadge && song.source === 'discovery' && (
              <span className="flex-shrink-0 rounded bg-spotify-green/90 px-1.5 py-0.5 text-[10px] font-medium text-black">
                发现
              </span>
            )}
          </div>
          <p className="truncate text-sm text-spotify-light-gray flex items-center gap-1">
            {showDownloadingIndicator && (
              <MiniDownloadingIcon size={14} progress={songDownloadProgress} />
            )}
            {!showDownloadingIndicator && isCached && (
              <MiniDownloadedIcon size={14} />
            )}
            <ClickableLink
              text={song.artistName}
              href={getArtistHref(song.artistId)}
              disabled={!song.artistId}
            />
          </p>
        </div>

        {showAlbum && (
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-sm text-spotify-light-gray">
              <ClickableLink
                text={song.albumName}
                href={getAlbumHref(song.albumId)}
                disabled={!song.albumId}
              />
            </p>
          </div>
        )}

        {addedAt && (
          <div className="hidden w-24 text-right text-sm text-spotify-light-gray lg:block" style={{ position: 'relative', left: '-160px' }}>
            {formatRelativeTime(addedAt)}
          </div>
        )}

        {showLikeButton && (
          <div className={`transition-opacity ${isHovered || (alwaysShowLikedStatus && liked) ? 'opacity-100' : 'opacity-0'}`}>
            <LikeButton song={song} size="sm" showOnHover={false} />
          </div>
        )}

        <div className="w-12 text-right text-sm text-spotify-light-gray">
          {formatDuration(song.duration)}
        </div>

        <button
          onClick={handleMenuButtonClick}
          className={`rounded-full p-1 hover:bg-white/10 transition-opacity ${isHovered || menuOpen ? 'opacity-100' : 'opacity-0'}`}
        >
          <IoEllipsisHorizontal className="h-5 w-5 text-white" />
        </button>
      </div>

      <SongContextMenu
        song={song}
        isOpen={menuOpen}
        position={menuPosition}
        onClose={() => setMenuOpen(false)}
        pageContext={pageContext}
        closeOnScroll={menuCloseOnScroll}
      />
    </>
  );
}
