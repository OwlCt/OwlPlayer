import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAlbumDetail, getArtistDetail, searchPaginated } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlayerStore } from '../store/playerStore';
import { Album, Artist, Song } from '../types';
import { buildArtistQueueSource, getLibrarySongs } from '../utils/artistPage';
import { getHomePreviewDayKey, hashHomePreviewSeed, shuffleArrayWithSeed } from '../utils/homePage';
import { getProxiedImageUrl } from '../utils/image';
import { prefetchArtworks, prefetchArtistImages } from '../utils/imagePrefetch';
import AlbumCard from './AlbumCard';
import ArtistCard from './ArtistCard';
import CachedImage from './CachedImage';
import ScrollableCardRow from './ScrollableCardRow';
import SongCard from './SongCard';

const ALL_ITEMS_QUERY = ' ';
const DESKTOP_PREVIEW_LIMIT = 5;
const MOBILE_PREVIEW_LIMIT = 6;
const MOBILE_SONG_PREVIEW_LIMIT = 5;
const HOME_LIBRARY_SONGS_QUEUE_ID = 'home-library-songs-preview';
const SONG_CANDIDATE_BATCH = 18;
const PREVIEW_BATCH_MULTIPLIER = 3;
const HOME_PREVIEW_CACHE_PREFIX = 'owlplayer:home-preview';
type HomeBrowseLinksMode = 'auto' | 'desktop' | 'mobile';

function SectionHeader({
  title,
  onViewAll,
  mobile = false,
}: {
  title: string;
  onViewAll: () => void;
  mobile?: boolean;
}) {
  return (
    <div className={`mb-3 flex items-center justify-between ${mobile ? 'px-3' : ''}`}>
      <h2 className={`font-bold text-white ${mobile ? 'text-lg' : 'text-2xl'}`}>{title}</h2>
      <button
        onClick={onViewAll}
        className={`font-medium text-white/60 transition-colors hover:text-white ${mobile ? 'text-sm' : 'text-sm'}`}
      >
        显示全部
      </button>
    </div>
  );
}

function MobileArtistCard({
  name,
  artworkUrl,
  onClick,
}: {
  name: string;
  artworkUrl: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="w-28 flex-shrink-0 text-center">
      <div className="mb-2 h-28 w-28 overflow-hidden rounded-full bg-neutral-800">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 200)}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl text-white/40">♪</div>
        )}
      </div>
      <p className="truncate text-base font-medium text-white">{name}</p>
    </button>
  );
}

function MobileAlbumCard({
  name,
  artistName,
  artworkUrl,
  onClick,
}: {
  name: string;
  artistName: string;
  artworkUrl?: string;
  onClick: () => void;
}) {
  return (
    <div onClick={onClick} className="group cursor-pointer rounded-lg py-2 transition-colors">
      <div className="relative mb-2 aspect-square overflow-hidden rounded-md bg-neutral-800 shadow-lg">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 240)}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-2xl text-white/40">♪</div>
        )}
      </div>
      <div className="min-h-[3rem]">
        <h3 className="mb-1 line-clamp-2 text-sm font-bold text-white">{name}</h3>
        <p className="line-clamp-1 text-xs text-white/60">{artistName}</p>
      </div>
    </div>
  );
}

function MobileSongRow({
  index,
  name,
  artistName,
  artworkUrl,
  onClick,
}: {
  index: number;
  name: string;
  artistName: string;
  artworkUrl: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg py-2 text-left active:bg-white/5">
      <span className="w-6 text-center text-sm text-white/50">{index}</span>
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-neutral-800">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 96)}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">♪</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-white">{name}</p>
        <p className="truncate text-xs text-white/50">{artistName}</p>
      </div>
    </button>
  );
}

type PreviewType = 'songs' | 'albums' | 'artists';

interface HomePreviewCacheEntry<T> {
  dayKey: string;
  items: T[];
}

function getHomePreviewCacheKey(type: PreviewType, limit: number) {
  return `${HOME_PREVIEW_CACHE_PREFIX}:${type}:${limit}`;
}

function readHomePreviewCache<T>(type: PreviewType, limit: number, dayKey: string): T[] | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getHomePreviewCacheKey(type, limit));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as HomePreviewCacheEntry<T>;
    if (parsed.dayKey !== dayKey || !Array.isArray(parsed.items)) {
      return null;
    }

    return parsed.items;
  } catch {
    return null;
  }
}

function writeHomePreviewCache<T>(type: PreviewType, limit: number, dayKey: string, items: T[]) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const payload: HomePreviewCacheEntry<T> = { dayKey, items };
    window.localStorage.setItem(getHomePreviewCacheKey(type, limit), JSON.stringify(payload));
  } catch {
    // Ignore storage failures and fall back to in-memory state only.
  }
}

async function loadSongPreview(limit: number): Promise<Song[]> {
  return loadRandomPreview('songs', limit);
}

async function loadRandomPreview<T extends Song | Album | Artist>(
  type: PreviewType,
  limit: number
): Promise<T[]> {
  const dayKey = getHomePreviewDayKey();
  const cachedItems = readHomePreviewCache<T>(type, limit, dayKey);
  if (cachedItems && cachedItems.length > 0) {
    return cachedItems;
  }

  const probe = await searchPaginated(ALL_ITEMS_QUERY, type, 0, 1);
  const total = probe.total > 0 ? probe.total : probe.items.length;
  const batchSize = Math.max(limit * PREVIEW_BATCH_MULTIPLIER, SONG_CANDIDATE_BATCH);

  if (total <= 0) {
    return [];
  }

  const maxOffset = Math.max(0, total - batchSize);
  const seededOffset = maxOffset === 0 ? 0 : hashHomePreviewSeed(`${type}-${dayKey}-offset`) % (maxOffset + 1);
  const batch = await searchPaginated(ALL_ITEMS_QUERY, type, seededOffset, batchSize);
  const candidates = (batch.items as T[]).length > 0 ? (batch.items as T[]) : (probe.items as T[]);
  const items = shuffleArrayWithSeed(candidates, hashHomePreviewSeed(`${type}-${dayKey}-shuffle`)).slice(0, limit);
  writeHomePreviewCache(type, limit, dayKey, items);
  return items;
}

export default function HomeBrowseLinks({
  mode = 'auto',
}: {
  mode?: HomeBrowseLinksMode;
}) {
  const navigate = useNavigate();
  const detectedMobile = useIsMobile();
  const isMobile =
    mode === 'mobile' ? true :
    mode === 'desktop' ? false :
    detectedMobile;
  const { setQueue, queueSource, isPlaying, pause, play } = usePlayerStore();
  const [songs, setSongs] = useState<Song[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadPreviews = async () => {
      const previewLimit = isMobile ? MOBILE_PREVIEW_LIMIT : DESKTOP_PREVIEW_LIMIT;
      const songLimit = isMobile ? MOBILE_SONG_PREVIEW_LIMIT : DESKTOP_PREVIEW_LIMIT;

      const [artistResult, albumResult, songResult] = await Promise.allSettled([
        loadRandomPreview<Artist>('artists', previewLimit),
        loadRandomPreview<Album>('albums', previewLimit),
        loadSongPreview(songLimit),
      ]);

      if (cancelled) {
        return;
      }

      setArtists(artistResult.status === 'fulfilled' ? artistResult.value : []);
      setAlbums(albumResult.status === 'fulfilled' ? albumResult.value : []);
      setSongs(songResult.status === 'fulfilled' ? songResult.value : []);

      // Prefetch images so they're available offline
      if (artistResult.status === 'fulfilled') {
        prefetchArtistImages(
          artistResult.value.map(a => ({ artworkUrl: a.artworkUrl })),
          [200, 300]
        );
      }
      if (albumResult.status === 'fulfilled') {
        prefetchArtworks(
          albumResult.value.map(a => ({ artworkUrl: a.artworkUrl })),
          [240, 300]
        );
      }
      if (songResult.status === 'fulfilled') {
        prefetchArtworks(
          songResult.value.map(s => ({ artworkUrl: s.artworkUrl })),
          [80, 96, 300]
        );
      }
    };

    loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [isMobile]);

  const songPreviewQueueSource = useMemo(
    () => ({ type: 'search' as const, id: HOME_LIBRARY_SONGS_QUEUE_ID, name: '全部歌曲' }),
    []
  );

  const playSongPreview = (index: number) => {
    setQueue(songs, index, songPreviewQueueSource);
  };

  const playArtistPreview = async (artist: Artist) => {
    const isCurrentArtistSource =
      queueSource.type === 'artist' &&
      queueSource.id === artist.id &&
      queueSource.variant === 'library';

    if (isCurrentArtistSource) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    const detail = await getArtistDetail(artist.id);
    const artistSongs = getLibrarySongs(detail);
    if (artistSongs.length > 0) {
      setQueue(artistSongs, 0, buildArtistQueueSource(artist.id, detail.name, 'library'));
    }
  };

  const playAlbumPreview = async (album: Album) => {
    const isCurrentAlbumSource =
      queueSource.type === 'album' &&
      queueSource.id === album.id;

    if (isCurrentAlbumSource) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    const detail = await getAlbumDetail(album.id);
    if (detail.tracks && detail.tracks.length > 0) {
      setQueue(detail.tracks, 0, { type: 'album', id: album.id, name: detail.name });
    }
  };

  if (artists.length === 0 && albums.length === 0 && songs.length === 0) {
    return null;
  }

  if (isMobile) {
    return (
      <div className="space-y-6">
        {artists.length > 0 ? (
          <section>
            <SectionHeader title="全部艺术家" onViewAll={() => navigate('/artists')} mobile />
            <div className="flex gap-3 overflow-x-auto px-3 pb-2 scrollbar-hide">
              {artists.map((artist) => (
                <MobileArtistCard
                  key={artist.id}
                  name={artist.name}
                  artworkUrl={artist.artworkUrl}
                  onClick={() => navigate(`/artist/${artist.id}`)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {albums.length > 0 ? (
          <section>
            <SectionHeader title="全部专辑" onViewAll={() => navigate('/albums')} mobile />
            <ScrollableCardRow cardWidth={140} gap={12} edgePadding={12} mobileEdgePadding={12}>
              {albums.map((album) => (
                <MobileAlbumCard
                  key={album.id}
                  name={album.name}
                  artistName={album.artistName}
                  artworkUrl={album.artworkUrl}
                  onClick={() => navigate(`/album/${album.id}`)}
                />
              ))}
            </ScrollableCardRow>
          </section>
        ) : null}

        {songs.length > 0 ? (
          <section>
            <SectionHeader title="全部歌曲" onViewAll={() => navigate('/songs')} mobile />
            <div className="px-1">
              {songs.map((song, index) => (
                <MobileSongRow
                  key={song.id}
                  index={index + 1}
                  name={song.name}
                  artistName={song.artistName}
                  artworkUrl={song.artworkUrl}
                  onClick={() => playSongPreview(index)}
                />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  const isSongPreviewSource = queueSource.type === 'search' && queueSource.id === HOME_LIBRARY_SONGS_QUEUE_ID;

  return (
    <div className="space-y-8">
      {artists.length > 0 ? (
        <section>
          <SectionHeader title="全部艺术家" onViewAll={() => navigate('/artists')} />
          <ScrollableCardRow cardWidth={200} gap={16}>
            {artists.map((artist) => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                onClick={() => navigate(`/artist/${artist.id}`)}
                onPlay={() => playArtistPreview(artist)}
                onPause={pause}
                isPlaying={
                  isPlaying &&
                  queueSource.type === 'artist' &&
                  queueSource.id === artist.id &&
                  queueSource.variant === 'library'
                }
              />
            ))}
          </ScrollableCardRow>
        </section>
      ) : null}

      {albums.length > 0 ? (
        <section>
          <SectionHeader title="全部专辑" onViewAll={() => navigate('/albums')} />
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {albums.map((album) => (
              <AlbumCard
                key={album.id}
                album={album}
                onPlay={() => playAlbumPreview(album)}
                onPause={pause}
                isPlaying={isPlaying && queueSource.type === 'album' && queueSource.id === album.id}
                onCardClick={() => navigate(`/album/${album.id}`)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {songs.length > 0 ? (
        <section>
          <SectionHeader title="全部歌曲" onViewAll={() => navigate('/songs')} />
          <div className="space-y-1">
            {songs.map((song, index) => (
              <SongCard
                key={song.id}
                song={song}
                onPlay={() => playSongPreview(index)}
                showIndex={index + 1}
                showAlbum
                isCurrentSource={isSongPreviewSource}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
