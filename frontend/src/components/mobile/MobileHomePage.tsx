import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBottomPadding } from '../../hooks/useBottomPadding';
import { subscribeToNetworkRecovery } from '../../hooks/useOnlineStatus';
import { usePlayHistoryStore } from '../../store/playHistoryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import { buildTopAlbums } from '../../utils/homePage';
import { getProxiedImageUrl } from '../../utils/image';
import QuickAccessGrid, { QuickAccessItem } from './QuickAccessGrid';
import ScrollableCardRow from '../ScrollableCardRow';
import CachedImage from '../CachedImage';
import HomeBrowseLinks from '../HomeBrowseLinks';

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 px-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
    </div>
  );
}

function HomeTrackRow({
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
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg py-2 text-left active:bg-white/5"
    >
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

function HomeArtistCard({
  name,
  artworkUrl,
  onClick,
}: {
  name: string;
  artworkUrl: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-28 flex-shrink-0 text-center"
    >
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

function HomeAlbumCard({
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
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-lg py-2 transition-colors"
    >
      <div className="relative mb-2 aspect-square overflow-hidden rounded-md bg-neutral-800 shadow-lg">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 240)}
            alt={name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pink-600 to-purple-600 text-2xl">💜</div>
        )}
      </div>
      <div className="min-h-[3rem]">
        <h3 className="mb-1 line-clamp-2 text-sm font-bold text-white">{name}</h3>
        <p className="line-clamp-1 text-xs text-white/60">{artistName}</p>
      </div>
    </div>
  );
}

export default function MobileHomePage() {
  const navigate = useNavigate();
  const { paddingClass: bottomPaddingClass } = useBottomPadding();
  const { items: recentItems, fetchRecentlyPlayed } = useRecentlyPlayedStore();
  const { topTracks, topArtists, fetchTopArtists, fetchTopTracks } = usePlayHistoryStore();
  const { setQueue } = usePlayerStore();

  useEffect(() => {
    fetchRecentlyPlayed();
    fetchTopTracks(20);
    fetchTopArtists(8);
  }, [fetchRecentlyPlayed, fetchTopArtists, fetchTopTracks]);

  useEffect(() => {
    const unsubscribe = subscribeToNetworkRecovery(() => {
      fetchRecentlyPlayed();
      fetchTopTracks(20);
      fetchTopArtists(8);
    });
    return unsubscribe;
  }, [fetchRecentlyPlayed, fetchTopArtists, fetchTopTracks]);
  const topTrackSongs = useMemo(
    () =>
      topTracks.slice(0, 5).map((track) => ({
        id: track.songId,
        name: track.songName,
        artistName: track.artistName,
        artistId: track.artistId,
        albumName: track.albumName,
        albumId: track.albumId,
        duration: track.duration,
        artworkUrl: track.artworkUrl,
        hasLyrics: false,
      })),
    [topTracks]
  );
  const topAlbums = useMemo(() => buildTopAlbums(topTracks, 10), [topTracks]);
  const hasTopArtists = topArtists.length > 0;
  const hasTopAlbums = topAlbums.length > 0;
  const hasTopTracks = topTrackSongs.length > 0;
  const quickAccessItems = useMemo<QuickAccessItem[]>(
    () =>
      recentItems.map((item) => ({
        id: item.id,
        type: item.type,
        name: item.name,
        imageUrl: item.artworkUrl,
        lastPlayedAt: item.lastPlayedAt,
      })),
    [recentItems]
  );

  return (
    <div className={`bg-black ${bottomPaddingClass}`}>
      <div className="px-3" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top, 0px) + 16px)' }}>
        {quickAccessItems.length > 0 ? (
          <section className="mb-6">
            <SectionTitle title="最近播放" />
            <QuickAccessGrid items={quickAccessItems} />
          </section>
        ) : null}

        {hasTopArtists ? (
          <div className="mb-6">
            <SectionTitle title="本月热门艺人" />
            <div className="flex gap-3 overflow-x-auto px-3 pb-2 scrollbar-hide">
              {topArtists.map((artist) => (
                <HomeArtistCard
                  key={artist.artistId}
                  name={artist.artistName}
                  artworkUrl={artist.artworkUrl}
                  onClick={() => navigate(`/artist/${artist.artistId}`)}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasTopAlbums ? (
          <div className="mb-6">
            <SectionTitle title="本月热门专辑" />
            <ScrollableCardRow cardWidth={140} gap={12} edgePadding={12}>
              {topAlbums.map((album) => (
                <HomeAlbumCard
                  key={`${album.albumId || album.albumName}-${album.artistName}`}
                  name={album.albumName}
                  artistName={album.artistName}
                  artworkUrl={album.artworkUrl}
                  onClick={() => album.albumId && navigate(`/album/${album.albumId}`)}
                />
              ))}
            </ScrollableCardRow>
          </div>
        ) : null}

        {hasTopTracks ? (
          <div className="mb-6 px-1">
            <SectionTitle title="本月热门曲目" />
            {topTrackSongs.map((song, index) => (
              <HomeTrackRow
                key={song.id}
                index={index + 1}
                name={song.name}
                artistName={song.artistName}
                artworkUrl={song.artworkUrl}
                onClick={() => setQueue(topTrackSongs, index, { type: 'profile-top-tracks', id: 'monthly-top-tracks', name: '本月热门曲目' })}
              />
            ))}
          </div>
        ) : null}

        <div className="mb-6">
          <HomeBrowseLinks mode="mobile" />
        </div>
      </div>
    </div>
  );
}
