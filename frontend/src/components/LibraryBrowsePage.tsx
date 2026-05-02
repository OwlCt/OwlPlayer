import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { getAlbumDetail, getArtistDetail, searchPaginated } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import { useGoBack } from '../hooks/useNavigationHistory';
import { usePlayerStore } from '../store/playerStore';
import { Album, Artist, Song } from '../types';
import { buildArtistQueueSource, getLibrarySongs } from '../utils/artistPage';
import { getProxiedImageUrl } from '../utils/image';
import AlbumCard from './AlbumCard';
import ArtistCard from './ArtistCard';
import CachedImage from './CachedImage';
import SongCard from './SongCard';
import MobileHeader from './mobile/MobileHeader';
import { MobileTrackRow } from './mobile/MobileDetailPage';

type BrowseKind = 'songs' | 'albums' | 'artists';

interface LibraryBrowsePageProps {
  kind: BrowseKind;
}

const ALL_ITEMS_QUERY = ' ';
const PAGE_SIZE = 30;

const PAGE_CONFIG: Record<BrowseKind, { title: string; emptyText: string }> = {
  songs: { title: '全部歌曲', emptyText: '还没有可显示的歌曲' },
  albums: { title: '全部专辑', emptyText: '还没有可显示的专辑' },
  artists: { title: '全部艺术家', emptyText: '还没有可显示的艺术家' },
};

function BrowseListRow({
  title,
  subtitle,
  artworkUrl,
  rounded = false,
  onClick,
}: {
  title: string;
  subtitle?: string;
  artworkUrl?: string;
  rounded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors active:bg-white/10"
    >
      <div className={`h-14 w-14 shrink-0 overflow-hidden bg-neutral-800 ${rounded ? 'rounded-full' : 'rounded'}`}>
        {artworkUrl ? (
          <CachedImage src={getProxiedImageUrl(artworkUrl, 112)} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">♪</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-white">{title}</div>
        {subtitle ? <div className="truncate text-sm text-white/60">{subtitle}</div> : null}
      </div>
    </button>
  );
}

export default function LibraryBrowsePage({ kind }: LibraryBrowsePageProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const goBack = useGoBack();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [items, setItems] = useState<Song[] | Album[] | Artist[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setQueue, queueSource, isPlaying, pause, play, currentSong } = usePlayerStore();

  const config = PAGE_CONFIG[kind];
  const songs = useMemo(() => (kind === 'songs' ? (items as Song[]) : []), [items, kind]);
  const albums = useMemo(() => (kind === 'albums' ? (items as Album[]) : []), [items, kind]);
  const artists = useMemo(() => (kind === 'artists' ? (items as Artist[]) : []), [items, kind]);

  const loadItems = useCallback(
    async (offset: number, append: boolean = false) => {
      try {
        setError(null);
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const result = await searchPaginated(ALL_ITEMS_QUERY, kind, offset, PAGE_SIZE);
        const nextItems = result.items as Song[] | Album[] | Artist[];

        setItems((prev) => {
          if (!append) {
            return nextItems;
          }

          const existingIds = new Set(prev.map((item) => item.id));
          return [...prev, ...nextItems.filter((item) => !existingIds.has(item.id))];
        });
        setTotal(result.total >= 0 ? result.total : offset + nextItems.length);
        setHasMore(result.hasMore);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [kind]
  );

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setHasMore(true);
    setError(null);
    loadItems(0, false);
  }, [loadItems]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadItems(items.length, true);
        }
      },
      { threshold: 0.1 }
    );

    const current = loadMoreRef.current;
    if (current) {
      observerRef.current.observe(current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, items.length, loadItems, loading, loadingMore]);

  const playAlbum = async (albumId: string) => {
    if (queueSource.type === 'album' && queueSource.id === albumId) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    const detail = await getAlbumDetail(albumId);
    if (detail.tracks && detail.tracks.length > 0) {
      setQueue(detail.tracks, 0, { type: 'album', id: albumId, name: detail.name });
    }
  };

  const playArtist = async (artistId: string, artistName: string) => {
    const isCurrentSource = queueSource.type === 'artist' && queueSource.id === artistId && queueSource.variant === 'library';
    if (isCurrentSource) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    const detail = await getArtistDetail(artistId);
    const librarySongs = getLibrarySongs(detail);
    if (librarySongs.length > 0) {
      setQueue(librarySongs, 0, buildArtistQueueSource(artistId, artistName, 'library'));
    }
  };

  const playSongList = (index: number) => {
    setQueue(songs, index, { type: 'search', id: `all-${kind}`, name: config.title });
  };

  const desktopContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      );
    }

    if (error) {
      return <div className="rounded-xl bg-white/5 p-6 text-white/60">{error}</div>;
    }

    if (items.length === 0) {
      return <div className="rounded-xl bg-white/5 p-6 text-white/60">{config.emptyText}</div>;
    }

    if (kind === 'songs') {
      const isCurrentSource = queueSource.type === 'search' && queueSource.id === `all-${kind}`;

      return (
        <div className="track-list-container">
          <div
            className="track-list-grid items-center h-9 text-sm text-spotify-light-gray border-b border-white/10 mb-2"
            role="row"
          >
            <div className="text-center" role="columnheader">#</div>
            <div role="columnheader">标题</div>
            <div className="col-album" role="columnheader">专辑</div>
            <div className="flex justify-end pr-8" role="columnheader">时长</div>
          </div>
          {songs.map((song, index) => (
            <SongCard
              key={song.id}
              song={song}
              onPlay={() => playSongList(index)}
              showIndex={index + 1}
              showAlbum
              showLikeButton
              isCurrentSource={isCurrentSource}
              useGridLayout
              hideDate
            />
          ))}
        </div>
      );
    }

    if (kind === 'albums') {
      return (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 240px))' }}>
          {albums.map((album) => (
            <AlbumCard
              key={album.id}
              album={album}
              isPlaying={isPlaying && queueSource.type === 'album' && queueSource.id === album.id}
              onPlay={() => playAlbum(album.id)}
              onPause={pause}
              onCardClick={() => navigate(`/album/${album.id}`)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 240px))' }}>
        {artists.map((artist) => {
          const isCurrentSource = queueSource.type === 'artist' && queueSource.id === artist.id && queueSource.variant === 'library';
          return (
            <ArtistCard
              key={artist.id}
              artist={artist}
              onClick={() => navigate(`/artist/${artist.id}`)}
              onPlay={() => playArtist(artist.id, artist.name)}
              onPause={pause}
              isPlaying={isPlaying && isCurrentSource}
            />
          );
        })}
      </div>
    );
  };

  const mobileContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        </div>
      );
    }

    if (error) {
      return <div className="px-4 py-8 text-white/60">{error}</div>;
    }

    if (items.length === 0) {
      return <div className="px-4 py-8 text-white/60">{config.emptyText}</div>;
    }

    if (kind === 'songs') {
      const isCurrentSource = queueSource.type === 'search' && queueSource.id === `all-${kind}`;

      return (
        <div>
          {songs.map((song, index) => (
            <MobileTrackRow
              key={song.id}
              track={song}
              index={index}
              isPlaying={isPlaying}
              isCurrentTrack={currentSong?.id === song.id && isCurrentSource}
              onTap={() => playSongList(index)}
              onLongPress={() => {}}
              showArtwork
            />
          ))}
        </div>
      );
    }

    if (kind === 'albums') {
      return (
        <div className="space-y-1">
          {albums.map((album) => (
            <BrowseListRow
              key={album.id}
              title={album.name}
              subtitle={album.artistName}
              artworkUrl={album.artworkUrl}
              onClick={() => navigate(`/album/${album.id}`)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-1">
        {artists.map((artist) => (
          <BrowseListRow
            key={artist.id}
            title={artist.name}
            subtitle="艺术家"
            artworkUrl={artist.artworkUrl}
            rounded
            onClick={() => navigate(`/artist/${artist.id}`)}
          />
        ))}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-black" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
        <MobileHeader title={config.title} opacity={1} onBack={goBack} />
        <div className="flex-1 overflow-y-auto pb-52">
          <div className="px-4 py-2 text-sm text-white/60">{total > 0 ? `${total} 项` : config.title}</div>
          {mobileContent()}
          <div ref={loadMoreRef} className="py-5 text-center text-sm text-white/40">
            {loadingMore ? '加载中...' : !hasMore && items.length > 0 ? '没有更多了' : ''}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-8 pt-4">
      <button
        onClick={goBack}
        className="mb-6 flex items-center gap-2 text-white/60 transition-colors hover:text-white"
      >
        <FiArrowLeft size={20} />
        返回
      </button>

      <div className="mb-6">
        <h1 className="mb-2 text-3xl font-bold text-white">{config.title}</h1>
        {total > 0 ? <p className="text-white/60">{total} 项</p> : null}
      </div>

      {desktopContent()}

      <div ref={loadMoreRef} className="flex h-20 items-center justify-center">
        {loadingMore ? <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" /> : null}
        {!loadingMore && !hasMore && items.length > 0 ? <span className="text-white/40">没有更多了</span> : null}
      </div>
    </div>
  );
}
