import { useState, useEffect, useCallback, useRef, useMemo, type MouseEvent as ReactMouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiClock } from 'react-icons/fi';
import { IoArrowDownCircleOutline, IoCheckmarkCircle, IoEllipsisHorizontal } from 'react-icons/io5';
import { getArtistDetail, getAlbumDetail } from '../api';
import { ArtistDetail, Song, Album } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { useOfflineCacheStore } from '../store/offlineCacheStore';
import { useToastStore } from '../store/toastStore';
import { getProxiedImageUrl } from '../utils/image';
import { getReleaseTypeLabel } from '../utils/releaseType';
import SongCard from './SongCard';
import AlbumCard from './AlbumCard';
import CachedImage from './CachedImage';
import AlbumContextMenu from './AlbumContextMenu';
import { MenuPosition } from './ContextMenu';
import { AlbumSaveButton } from './AlbumSaveButton';
import {
  ARTIST_ALL_SONGS_FEATURED_LIMIT,
  GroupedArtistSongs,
  buildArtistQueueSource,
  enrichSongForArtistNavigation,
  getFeaturedSongs,
  getFeaturedSongsHeading,
  getLibrarySongs,
  groupLibrarySongsWithAlbumInfo,
  isArtistQueueSource,
  mergeArtistAlbumGroups,
  sliceGroupedArtistSongs,
} from '../utils/artistPage';

// Note: SongCard has data-song-card attribute for click-outside detection

type ContentType =
  | 'songs'
  | 'library'
  | 'albums'
  | 'singles'
  | 'live'
  | 'compilations'
  | 'appears-on';

interface ArtistContentPageProps {
  contentType: ContentType;
}

const TITLES: Record<Exclude<ContentType, 'songs'>, string> = {
  library: '全部歌曲',
  albums: '专辑',
  singles: '单曲 & EP',
  live: '现场专辑',
  compilations: '合辑',
  'appears-on': '参与作品',
};

const PAGE_SIZE = 50;

function getReleaseYear(releaseDate?: string): number | null {
  if (!releaseDate) {
    return null;
  }

  const year = new Date(releaseDate).getFullYear();
  return Number.isNaN(year) ? null : year;
}

function getLibraryGroupMeta(album: {
  releaseType?: string;
  isSingle?: boolean;
  releaseDate?: string;
  songs: Song[];
}): string {
  const parts: string[] = [];

  parts.push(getReleaseTypeLabel(album.releaseType, album.isSingle));

  const year = getReleaseYear(album.releaseDate);
  if (year !== null) {
    parts.push(String(year));
  }

  parts.push(`${album.songs.length} 首歌曲`);

  return parts.join(' • ');
}

export default function ArtistContentPage({ contentType }: ArtistContentPageProps) {
  const { artistId } = useParams();
  const navigate = useNavigate();
  const { setQueue, isPlaying, queueSource, pause, play } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const {
    startAlbumDownload,
    deleteAlbumCache,
    getAlbumCacheStatusByCount,
    downloadProgress,
    cancelDownload,
  } = useOfflineCacheStore();
  const { showToast } = useToastStore();

  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [albumMenuOpen, setAlbumMenuOpen] = useState(false);
  const [albumMenuPosition, setAlbumMenuPosition] = useState<MenuPosition>({ x: 0, y: 0 });
  const [menuAlbum, setMenuAlbum] = useState<Album | null>(null);
  const loaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[class*="bg-[#282828]"]')) {
        return;
      }
      if (!target.closest('[data-song-card]')) {
        setSelectedSongId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (artistId) {
      loadArtistDetail(artistId);
    }
  }, [artistId]);

  const loadArtistDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArtistDetail(id);
      setArtist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artist');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (artistId) {
      loadArtistDetail(artistId);
    }
  };

  const handleBack = () => {
    navigate(`/artist/${artistId}`, { replace: true });
  };

  const handlePlaySong = (song: Song, allSongs: Song[], variant: 'featured' | 'library') => {
    const index = allSongs.findIndex((item) => item.id === song.id);
    if (index < 0) {
      return;
    }

    if (artistId) {
      recordPlay('artist', artistId);
    }
    setQueue(allSongs, index, buildArtistQueueSource(artistId || '', artist?.name || '', variant));
  };

  const handleAlbumClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  const isAlbumPlaying = (albumId: string) => {
    return isPlaying && queueSource.type === 'album' && queueSource.id === albumId;
  };

  const isAlbumCurrentSource = (albumId: string) => {
    return queueSource.type === 'album' && queueSource.id === albumId;
  };

  const songQueueVariant = contentType === 'library' ? 'library' : 'featured';
  const isCurrentArtistSource = !!artistId && isArtistQueueSource(queueSource, artistId, songQueueVariant);

  const handlePlayAlbum = async (album: Album) => {
    recordPlay('album', album.id);
    if (isAlbumCurrentSource(album.id)) {
      play();
      return;
    }

    try {
      const albumDetail = await getAlbumDetail(album.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        setQueue(albumDetail.tracks, 0, { type: 'album', id: album.id, name: albumDetail.name });
      }
    } catch (err) {
      console.error('Failed to load album tracks:', err);
    }
  };

  const getAllItems = useCallback((): Song[] | Album[] => {
    if (!artist) {
      return [];
    }

    switch (contentType) {
      case 'songs':
        return getFeaturedSongs(artist);
      case 'library':
        return getLibrarySongs(artist);
      case 'albums':
        return mergeArtistAlbumGroups(artist.essentialAlbums, artist.albums);
      case 'singles':
        return artist.singlesAndEPs || [];
      case 'live':
        return artist.liveAlbums || [];
      case 'compilations':
        return artist.compilationAlbums || [];
      case 'appears-on':
        return artist.appearsOnAlbums || [];
      default:
        return [];
    }
  }, [artist, contentType]);

  const allItems = getAllItems();
  const title = contentType === 'songs' ? getFeaturedSongsHeading(artist?.featuredSongsSource) : TITLES[contentType];
  const items = allItems.slice(0, displayCount);
  const hasMore = displayCount < allItems.length;
  const featuredSongs = artist ? getFeaturedSongs(artist) : [];
  const featuredSectionTitle = getFeaturedSongsHeading(artist?.featuredSongsSource);
  const previewFeaturedSongs = featuredSongs.slice(0, ARTIST_ALL_SONGS_FEATURED_LIMIT);
  const isCurrentArtistFeaturedSource = !!artistId && isArtistQueueSource(queueSource, artistId, 'featured');
  const featuredArtworkUrl = previewFeaturedSongs[0]?.artworkUrl;

  const handlePlayFeaturedCollection = useCallback(() => {
    if (!artist || !artistId || featuredSongs.length === 0) {
      return;
    }

    recordPlay('artist', artistId);
    setQueue(featuredSongs, 0, buildArtistQueueSource(artistId, artist.name, 'featured'));
  }, [artist, artistId, featuredSongs, recordPlay, setQueue]);

  const libraryAlbums = useMemo(() => {
    if (!artist) {
      return [];
    }

    return [
      ...(artist.albums || []),
      ...(artist.singlesAndEPs || []),
      ...(artist.liveAlbums || []),
      ...(artist.compilationAlbums || []),
    ];
  }, [artist]);
  const allKnownAlbums = useMemo(() => {
    if (!artist) {
      return [];
    }

    return mergeArtistAlbumGroups(
      artist.essentialAlbums,
      artist.albums,
      artist.singlesAndEPs,
      artist.liveAlbums,
      artist.compilationAlbums,
      artist.appearsOnAlbums
    );
  }, [artist]);
  const enrichArtistSong = useCallback((song: Song, fallbackAlbum?: { id?: string; name?: string }) => {
    if (!artist || !artistId) {
      return song;
    }

    return enrichSongForArtistNavigation(song, {
      artistId,
      artistName: artist.name,
      albums: allKnownAlbums,
      fallbackAlbumId: fallbackAlbum?.id,
      fallbackAlbumName: fallbackAlbum?.name,
    });
  }, [allKnownAlbums, artist, artistId]);

  const groupedLibrarySongs = useMemo(
    () => (contentType === 'library' ? groupLibrarySongsWithAlbumInfo(allItems as Song[], libraryAlbums) : []),
    [allItems, contentType, libraryAlbums]
  );

  const groupedLibraryItems = useMemo(
    () => (contentType === 'library' ? sliceGroupedArtistSongs(groupedLibrarySongs, displayCount) : []),
    [contentType, displayCount, groupedLibrarySongs]
  );

  const groupedLibraryMap = useMemo(
    () => new Map(groupedLibrarySongs.map((group) => [group.key, group])),
    [groupedLibrarySongs]
  );

  const isLibraryGroupCurrentSource = useCallback((albumId?: string) => {
    if (!albumId) {
      return isCurrentArtistSource;
    }

    return queueSource.type === 'album' && queueSource.id === albumId;
  }, [isCurrentArtistSource, queueSource.id, queueSource.type]);

  const buildLibraryGroupAlbum = useCallback((group: GroupedArtistSongs): Album | null => {
    if (!artist) {
      return null;
    }

    const fallbackArtworkUrl = group.artworkUrl || group.songs[0]?.artworkUrl || '';

    return {
      id: group.albumId || group.key,
      name: group.albumName,
      artistId,
      artistName: artist.name,
      artworkUrl: fallbackArtworkUrl,
      releaseDate: group.releaseDate,
      trackCount: group.songs.length,
      tracks: group.songs.map((song) => ({
        ...song,
        artistId: song.artistId || artistId,
        artistName: song.artistName || artist.name,
        albumId: song.albumId || group.albumId,
        albumName: song.albumName || group.albumName,
      })),
      releaseType: group.releaseType,
      isSingle: group.isSingle,
    };
  }, [artist, artistId]);

  const handleLibraryGroupMenuOpen = useCallback((event: ReactMouseEvent<HTMLButtonElement>, group: GroupedArtistSongs) => {
    if (!group.albumId) {
      return;
    }

    const album = buildLibraryGroupAlbum(group);
    if (!album) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setMenuAlbum(album);
    setAlbumMenuPosition({ x: rect.right, y: rect.bottom });
    setAlbumMenuOpen(true);
  }, [buildLibraryGroupAlbum]);

  const handleLibraryGroupCache = useCallback(async (group: GroupedArtistSongs) => {
    if (!group.albumId) {
      return;
    }

    const cacheStatus = getAlbumCacheStatusByCount(group.albumId, group.songs.length);
    const isGroupDownloading =
      downloadProgress?.status === 'downloading' &&
      downloadProgress.collectionType === 'album' &&
      downloadProgress.collectionId === group.albumId;

    try {
      if (isGroupDownloading) {
        cancelDownload();
        showToast('已取消缓存。');
        return;
      }

      if (cacheStatus === 'full') {
        await deleteAlbumCache(group.albumId);
        showToast('已删除缓存。');
        return;
      }

      await startAlbumDownload(group.albumId);
      showToast(cacheStatus === 'partial' ? '已开始更新缓存。' : '已开始缓存。');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '缓存操作失败');
    }
  }, [cancelDownload, deleteAlbumCache, downloadProgress, getAlbumCacheStatusByCount, showToast, startAlbumDownload]);

  const handlePlayLibraryGroup = useCallback((groupKey: string) => {
    if (!artist || !artistId) {
      return;
    }

    const group = groupedLibraryMap.get(groupKey);
    if (!group || group.songs.length === 0) {
      return;
    }

    if (isLibraryGroupCurrentSource(group.albumId)) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    if (group.albumId) {
      recordPlay('album', group.albumId);
      setQueue(group.songs, 0, { type: 'album', id: group.albumId, name: group.albumName });
      return;
    }

    recordPlay('artist', artistId);
    setQueue(group.songs, 0, buildArtistQueueSource(artistId, artist.name, 'library'));
  }, [artist, artistId, groupedLibraryMap, isLibraryGroupCurrentSource, isPlaying, pause, play, recordPlay, setQueue]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) {
      return;
    }

    setLoadingMore(true);
    setTimeout(() => {
      setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, allItems.length));
      setLoadingMore(false);
    }, 100);
  }, [allItems.length, hasMore, loadingMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [contentType, artistId]);

  if (loading) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <div className="py-12 text-center">
          <p className="mb-4 text-red-500">{error}</p>
          <button
            onClick={handleRetry}
            className="rounded-full bg-spotify-green px-4 py-2 font-medium text-black transition-colors hover:bg-spotify-green/90"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="p-8">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
        >
          <FiArrowLeft size={20} />
          <span>返回</span>
        </button>
        <p className="text-white/60">未找到艺术家</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={handleBack}
        className="mb-6 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
      >
        <FiArrowLeft size={20} />
        <span>返回</span>
      </button>

      {contentType === 'library' ? (
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-white">{artist.name}</h1>
          <p className="mt-2 text-sm text-white/60">{(allItems as Song[]).length} 首歌曲</p>
        </div>
      ) : (
        <div className="mb-8 flex items-center gap-4">
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-full">
            {artist.artworkUrl ? (
              <CachedImage
                src={getProxiedImageUrl(artist.artworkUrl, 128)}
                alt={artist.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-spotify-gray text-2xl text-white/20">
                ♪
              </div>
            )}
          </div>
          <div>
            <p className="text-sm text-white/60">{artist.name}</p>
            <h1 className="text-3xl font-bold">{title}</h1>
            <p className="mt-1 text-sm text-white/60">{items.length} 项</p>
          </div>
        </div>
      )}

      {contentType === 'songs' ? (
        <div className="space-y-2">
          {(items as Song[]).map((song, index) => (
            <SongCard
              key={song.id}
              song={enrichArtistSong(song)}
              showIndex={index + 1}
              onPlay={() => handlePlaySong(song, allItems as Song[], 'featured')}
              isSelected={selectedSongId === song.id}
              onSelect={setSelectedSongId}
              isCurrentSource={isCurrentArtistSource}
            />
          ))}
        </div>
      ) : contentType === 'library' ? (
        <div className="space-y-12">
          {previewFeaturedSongs.length > 0 ? (
            <section
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
              data-testid="artist-featured-module"
            >
              <div className="mb-5 flex gap-5">
                <div className="h-32 w-32 flex-shrink-0 overflow-hidden rounded-2xl bg-spotify-gray shadow-lg">
                  {featuredArtworkUrl ? (
                    <CachedImage
                      src={getProxiedImageUrl(featuredArtworkUrl, 256)}
                      alt={featuredSectionTitle}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl text-white/20">♪</div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-end">
                  <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-white/40">推荐集</p>
                  <h2 className="text-3xl font-bold text-white">{featuredSectionTitle}</h2>
                  <div className="mt-4 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={handlePlayFeaturedCollection}
                      className="flex h-10 items-center gap-2 rounded-full bg-spotify-green px-4 font-medium text-black transition-transform hover:scale-105"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5.14v13.72L19 12 8 5.14z" />
                      </svg>
                      <span>播放推荐</span>
                    </button>
                    <span className="text-sm text-white/50">{previewFeaturedSongs.length} / {featuredSongs.length} 首</span>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                {previewFeaturedSongs.map((song, index) => (
                  <SongCard
                    key={song.id}
                    song={enrichArtistSong(song)}
                    showIndex={index + 1}
                    onPlay={() => handlePlaySong(song, featuredSongs, 'featured')}
                    showAlbum
                    isSelected={selectedSongId === song.id}
                    onSelect={setSelectedSongId}
                    pageContext="artist"
                    isCurrentSource={isCurrentArtistFeaturedSource}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="space-y-12" data-testid="artist-library-groups">
          {groupedLibraryItems.map((group) => {
            const fullGroup = groupedLibraryMap.get(group.key) || group;
            const libraryGroupAlbum = buildLibraryGroupAlbum(fullGroup);
            const isCurrentGroupSource = isLibraryGroupCurrentSource(fullGroup.albumId);
            const isCurrentGroupPlaying = isPlaying && isCurrentGroupSource;
            const cacheStatus = fullGroup.albumId
              ? getAlbumCacheStatusByCount(fullGroup.albumId, fullGroup.songs.length)
              : 'none';
            const isGroupDownloading =
              !!fullGroup.albumId &&
              downloadProgress?.status === 'downloading' &&
              downloadProgress.collectionType === 'album' &&
              downloadProgress.collectionId === fullGroup.albumId;
            const cacheButtonLabel = isGroupDownloading
              ? '取消缓存'
              : cacheStatus === 'full'
                ? '删除缓存'
                : cacheStatus === 'partial'
                  ? '更新缓存'
                  : '缓存专辑';

            return (
              <section key={group.key}>
                <div className="mb-4 flex gap-6">
                  <div className="h-[128px] w-[128px] flex-shrink-0 overflow-hidden rounded-xl bg-spotify-gray shadow-lg">
                    {fullGroup.artworkUrl ? (
                      <CachedImage
                        src={getProxiedImageUrl(fullGroup.artworkUrl, 256)}
                        alt={fullGroup.albumName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl text-white/20">
                        ♪
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-end">
                    <button
                      type="button"
                      disabled={!fullGroup.albumId}
                      onClick={() => fullGroup.albumId && navigate(`/album/${fullGroup.albumId}`)}
                      className={`mb-1 text-left text-2xl font-bold text-white ${
                        fullGroup.albumId ? 'cursor-pointer hover:underline' : 'cursor-default'
                      }`}
                    >
                      {fullGroup.albumName}
                    </button>
                    <p className="mb-4 text-sm text-white/60">{getLibraryGroupMeta(fullGroup)}</p>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => handlePlayLibraryGroup(fullGroup.key)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-spotify-green transition-transform hover:scale-105"
                        aria-label={isCurrentGroupPlaying ? '暂停专辑' : '播放专辑'}
                      >
                        <svg className="h-4 w-4 text-black" fill="currentColor" viewBox="0 0 24 24">
                          {isCurrentGroupPlaying ? (
                            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                          ) : (
                            <path d="M8 5.14v13.72L19 12 8 5.14z" />
                          )}
                        </svg>
                      </button>
                      {fullGroup.albumId && libraryGroupAlbum ? (
                        <AlbumSaveButton
                          album={libraryGroupAlbum}
                          size={28}
                          className="text-white/70 hover:text-white"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleLibraryGroupCache(fullGroup)}
                        disabled={!fullGroup.albumId}
                        className="flex h-8 w-8 items-center justify-center text-white/70 transition-colors hover:text-white disabled:cursor-not-allowed disabled:text-white/25"
                        aria-label={cacheButtonLabel}
                        title={cacheButtonLabel}
                      >
                        {cacheStatus === 'full' ? (
                          <IoCheckmarkCircle className="h-6 w-6 text-spotify-green" />
                        ) : (
                          <IoArrowDownCircleOutline className={`h-6 w-6 ${isGroupDownloading ? 'animate-spin' : ''}`} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(event) => handleLibraryGroupMenuOpen(event, fullGroup)}
                        className="flex h-8 w-8 items-center justify-center text-white/70 transition-colors hover:text-white"
                        aria-label="更多选项"
                        title="更多选项"
                      >
                        <IoEllipsisHorizontal className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mb-2 flex items-center gap-4 border-b border-white/10 px-2 py-2 text-sm text-white/50">
                  <span className="w-8 text-center">#</span>
                  <span className="flex-1">标题</span>
                  <span className="flex w-12 items-center justify-end">
                    <FiClock size={16} />
                  </span>
                </div>

                <div className="space-y-1">
                  {group.songs.map((song, index) => (
                    <SongCard
                      key={song.id}
                      song={enrichArtistSong(song, { id: fullGroup.albumId, name: fullGroup.albumName })}
                      showIndex={song.trackNumber || index + 1}
                      onPlay={() => handlePlaySong(song, allItems as Song[], 'library')}
                      showAlbum={false}
                      hideArtwork
                      isSelected={selectedSongId === song.id}
                      onSelect={setSelectedSongId}
                      pageContext="artist"
                      isCurrentSource={isCurrentGroupSource}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          </div>
        </div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {(items as Album[]).map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              isPlaying={isAlbumPlaying(album.id)}
              onPlay={() => handlePlayAlbum(album)}
              onPause={pause}
              onCardClick={handleAlbumClick}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <div ref={loaderRef} className="py-8 text-center">
          {loadingMore ? (
            <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-spotify-green border-t-transparent" />
          ) : (
            <span className="text-white/40">向下滚动加载更多</span>
          )}
        </div>
      )}

      {items.length > 0 && !hasMore && (
        <div className="py-8 text-center">
          <span className="text-white/40">没有更多了</span>
        </div>
      )}

      {items.length === 0 && (
        <p className="py-8 text-center text-white/60">暂无{contentType === 'library' ? '歌曲' : title}</p>
      )}

      {menuAlbum && (
        <AlbumContextMenu
          album={menuAlbum}
          isOpen={albumMenuOpen}
          position={albumMenuPosition}
          onClose={() => {
            setAlbumMenuOpen(false);
            setMenuAlbum(null);
          }}
          closeOnScroll={false}
        />
      )}
    </div>
  );
}
