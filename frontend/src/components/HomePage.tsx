import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAlbumDetail } from '../api';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { usePlayerStore } from '../store/playerStore';
import { subscribeToNetworkRecovery } from '../hooks/useOnlineStatus';
import { buildTopAlbums } from '../utils/homePage';
import SongCard from './SongCard';
import AlbumCard from './AlbumCard';
import ProfileArtistCard from './ProfileArtistCard';
import RecommendationSection from './RecommendationSection';
import RecentlyPlayedSection from './RecentlyPlayedSection';
import HomeBrowseLinks from './HomeBrowseLinks';

function HomeSectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { topTracks, topArtists, fetchTopArtists, fetchTopTracks } = usePlayHistoryStore();
  const { setQueue, queueSource, isPlaying, pause, play } = usePlayerStore();

  useEffect(() => {
    fetchTopTracks(20);
    fetchTopArtists(10);
  }, [fetchTopArtists, fetchTopTracks]);

  useEffect(() => {
    const unsubscribe = subscribeToNetworkRecovery(() => {
      fetchTopTracks(20);
      fetchTopArtists(10);
    });
    return unsubscribe;
  }, [fetchTopArtists, fetchTopTracks]);

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

  const handlePlayAlbum = async (albumId: string) => {
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

  return (
    <div className="space-y-10 p-8 pb-24">
      <RecentlyPlayedSection />

      {hasTopArtists ? (
        <section>
          <RecommendationSection title="本月热门艺人" itemCount={topArtists.length}>
            {topArtists.map((artist) => (
              <ProfileArtistCard
                key={artist.artistId}
                artist={{
                  id: artist.artistId,
                  name: artist.artistName,
                  artworkUrl: artist.artworkUrl,
                }}
                onClick={() => navigate(`/artist/${artist.artistId}`)}
              />
            ))}
          </RecommendationSection>
        </section>
      ) : null}

      {hasTopAlbums ? (
        <section>
          <RecommendationSection title="本月热门专辑" itemCount={topAlbums.length}>
            {topAlbums.map((album) => (
              <AlbumCard
                key={`${album.albumId || album.albumName}-${album.artistName}`}
                album={{
                  id: album.albumId,
                  name: album.albumName,
                  artistId: undefined,
                  artistName: album.artistName,
                  artworkUrl: album.artworkUrl,
                  trackCount: 0,
                }}
                isPlaying={isPlaying && queueSource.type === 'album' && queueSource.id === album.albumId}
                onPlay={() => album.albumId && handlePlayAlbum(album.albumId)}
                onPause={pause}
                onCardClick={() => album.albumId && navigate(`/album/${album.albumId}`)}
              />
            ))}
          </RecommendationSection>
        </section>
      ) : null}

      {hasTopTracks ? (
        <section>
          <HomeSectionHeader title="本月热门曲目" />
          <div className="space-y-2">
            {topTrackSongs.map((song, index) => (
              <SongCard
                key={song.id}
                song={song}
                showIndex={index + 1}
                onPlay={() => setQueue(topTrackSongs, index, { type: 'profile-top-tracks', id: 'monthly-top-tracks', name: '本月热门曲目' })}
                pageContext="default"
                isCurrentSource={queueSource.type === 'profile-top-tracks' && queueSource.id === 'monthly-top-tracks'}
              />
            ))}
          </div>
        </section>
      ) : null}

      <HomeBrowseLinks mode="desktop" />
    </div>
  );
}
