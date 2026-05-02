import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { usePlaylistsStore } from '../../store/playlistsStore';
import { useFollowedArtistsStore } from '../../store/followedArtistsStore';
import { usePlayHistoryStore } from '../../store/playHistoryStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import { useLikedSongsStore } from '../../store/likedSongsStore';
import { usePlayerStore } from '../../store/playerStore';
import { useBottomPadding } from '../../hooks/useBottomPadding';
import { extractDominantColor } from '../../utils/colorExtractor';
import { getProxiedImageUrl } from '../../utils/image';
import { getArtistDetail } from '../../api';
import MobileHeader from './MobileHeader';
import CachedImage from '../CachedImage';
const DEFAULT_AVATAR = '/api/avatars/default.svg';

export default function MobileProfilePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const { playlists, fetchPlaylists } = usePlaylistsStore();
  const { followedArtists, fetchFollowedArtists, getFollowedArtistsCount } = useFollowedArtistsStore();
  const { topArtists, topTracks, fetchTopArtists, fetchTopTracks, fetchHistory, history } = usePlayHistoryStore();
  const { fetchRecentlyPlayed } = useRecentlyPlayedStore();
  const { fetchLikedSongs } = useLikedSongsStore();
  const { playSong, setQueue } = usePlayerStore();
  const { paddingClass: bottomPaddingClass } = useBottomPadding();

  const [themeColor, setThemeColor] = useState<string>('rgb(38, 38, 38)');
  const [headerOpacity, setHeaderOpacity] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [recentlyPlayedArtists, setRecentlyPlayedArtists] = useState<{ id: string; name: string; artworkUrl: string }[]>([]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Fetch all data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchPlaylists(),
          fetchFollowedArtists(),
          fetchTopArtists(4),
          fetchTopTracks(50),
          fetchRecentlyPlayed(),
          fetchLikedSongs(),
          fetchHistory(50),
        ]);
      } catch (error) {
        console.error('Failed to load profile data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, fetchPlaylists, fetchFollowedArtists, fetchTopArtists, fetchTopTracks, fetchRecentlyPlayed, fetchLikedSongs, fetchHistory]);


  // Extract unique artists from play history
  useEffect(() => {
    const fetchRecentArtists = async () => {
      const artistMap = new Map<string, { id: string; name: string }>();
      
      history.forEach(item => {
        if (item.artistId && !artistMap.has(item.artistId)) {
          artistMap.set(item.artistId, {
            id: item.artistId,
            name: item.artistName,
          });
        }
      });
      
      const uniqueArtists = Array.from(artistMap.values()).slice(0, 4);
      
      if (uniqueArtists.length === 0) {
        setRecentlyPlayedArtists([]);
        return;
      }

      const artistsWithArtwork = await Promise.all(
        uniqueArtists.map(async (artist) => {
          try {
            const detail = await getArtistDetail(artist.id);
            return {
              id: artist.id,
              name: artist.name,
              artworkUrl: detail.artworkUrl || '',
            };
          } catch {
            return {
              id: artist.id,
              name: artist.name,
              artworkUrl: '',
            };
          }
        })
      );
      
      setRecentlyPlayedArtists(artistsWithArtwork);
    };

    fetchRecentArtists();
  }, [history]);

  // Extract theme color from user avatar
  useEffect(() => {
    if (user?.avatar_url) {
      extractDominantColor(user.avatar_url).then(setThemeColor);
    }
  }, [user?.avatar_url]);

  // Handle scroll for header opacity
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const opacity = Math.min(scrollTop / 100, 1);
    setHeaderOpacity(opacity);
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  const avatarUrl = user.avatar_url || DEFAULT_AVATAR;
  const playlistCount = playlists.length;
  const followedCount = getFollowedArtistsCount();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <MobileHeader
        title={user.username}
        opacity={headerOpacity}
        backgroundColor={themeColor}
        showBackButton={true}
      />

      <div 
        className={`h-full overflow-y-auto ${bottomPaddingClass}`}
        onScroll={handleScroll}
      >
        {/* Profile Header with gradient background */}
        <div
          className="pt-20 pb-6 px-4"
          style={{
            background: `linear-gradient(to bottom, ${themeColor} 0%, transparent 100%)`,
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 80px)',
          }}
        >
          <div className="flex flex-col items-center">
            <img
              src={avatarUrl}
              alt={user.username}
              className="w-28 h-28 rounded-full object-cover bg-neutral-700 shadow-xl mb-4"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
              }}
            />
            <h1 className="text-2xl font-bold text-white mb-2">{user.username}</h1>
            <p className="text-sm text-white/60">
              <span onClick={() => navigate('/profile/playlists')} className="active:text-white">
                {playlistCount}个歌单
              </span>
              <span> · </span>
              <span onClick={() => navigate('/profile/followed-artists')} className="active:text-white">
                关注{followedCount}位艺术家
              </span>
            </p>
          </div>
        </div>

        {/* Content sections */}
        <div className="px-4 space-y-6">
          {/* 本月热门艺人 */}
          {topArtists.length > 0 && (
            <ProfileSection
              title="本月热门艺人"
              onShowAll={() => navigate('/profile/top-artists')}
            >
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {topArtists.slice(0, 6).map((artist) => (
                  <ArtistCard
                    key={artist.artistId}
                    id={artist.artistId}
                    name={artist.artistName}
                    artworkUrl={artist.artworkUrl}
                    onClick={() => navigate(`/artist/${artist.artistId}`)}
                  />
                ))}
              </div>
            </ProfileSection>
          )}

          {/* 本月热门曲目 */}
          {topTracks.length > 0 && (
            <ProfileSection
              title="本月热门曲目"
              onShowAll={() => navigate('/profile/top-tracks')}
            >
              <div className="space-y-2">
                {topTracks.slice(0, 4).map((track, index) => {
                  const allSongs = topTracks.map((t) => ({
                    id: t.songId,
                    name: t.songName,
                    artistId: t.artistId,
                    artistName: t.artistName,
                    albumId: t.albumId,
                    albumName: t.albumName,
                    artworkUrl: t.artworkUrl,
                    duration: t.duration,
                    hasLyrics: false,
                  }));
                  return (
                    <TrackRow
                      key={track.songId}
                      index={index + 1}
                      name={track.songName}
                      artistName={track.artistName}
                      artworkUrl={track.artworkUrl}
                      onClick={() => {
                        setQueue(allSongs, index, { type: null, id: 'profile-top-tracks', name: '本月热门曲目' });
                        playSong(allSongs[index]);
                      }}
                    />
                  );
                })}
              </div>
            </ProfileSection>
          )}

          {/* 最近听过其作品的艺人 */}
          {recentlyPlayedArtists.length > 0 && (
            <ProfileSection
              title="最近听过其作品的艺人"
              onShowAll={() => navigate('/profile/recent-artists')}
            >
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {recentlyPlayedArtists.slice(0, 6).map((artist) => (
                  <ArtistCard
                    key={artist.id}
                    id={artist.id}
                    name={artist.name}
                    artworkUrl={artist.artworkUrl}
                    onClick={() => navigate(`/artist/${artist.id}`)}
                  />
                ))}
              </div>
            </ProfileSection>
          )}

          {/* 关注中 */}
          {followedArtists.length > 0 && (
            <ProfileSection
              title="关注中"
              onShowAll={() => navigate('/profile/followed-artists')}
            >
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {followedArtists.slice(0, 6).map((artist) => (
                  <ArtistCard
                    key={artist.artist_id}
                    id={artist.artist_id}
                    name={artist.artist_name}
                    artworkUrl={artist.artwork_url}
                    onClick={() => navigate(`/artist/${artist.artist_id}`)}
                  />
                ))}
              </div>
            </ProfileSection>
          )}

          {/* 创建的歌单 */}
          {playlists.length > 0 && (
            <ProfileSection
              title="创建的歌单"
              onShowAll={() => navigate('/profile/playlists')}
            >
              <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                {playlists.slice(0, 6).map((playlist) => (
                  <PlaylistCard
                    key={playlist.id}
                    id={playlist.id}
                    name={playlist.name}
                    artworkUrl={playlist.artwork_url}
                    onClick={() => navigate(`/playlist/${playlist.id}`)}
                  />
                ))}
              </div>
            </ProfileSection>
          )}
        </div>
      </div>
    </div>
  );
}


// Section component
interface ProfileSectionProps {
  title: string;
  onShowAll?: () => void;
  children: React.ReactNode;
}

function ProfileSection({ title, onShowAll, children }: ProfileSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {onShowAll && (
          <button
            onClick={onShowAll}
            className="text-sm text-white/60"
          >
            显示全部
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

// Artist card component
interface ArtistCardProps {
  id: string;
  name: string;
  artworkUrl: string;
  onClick: () => void;
}

function ArtistCard({ name, artworkUrl, onClick }: ArtistCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-28 text-center"
    >
      <div className="w-28 h-28 rounded-full overflow-hidden bg-neutral-800 mb-2">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 200)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-2xl">
            ♪
          </div>
        )}
      </div>
      <p className="text-base text-white font-medium truncate">{name}</p>
    </button>
  );
}

// Playlist card component
interface PlaylistCardProps {
  id: string;
  name: string;
  artworkUrl?: string;
  onClick: () => void;
}

function PlaylistCard({ name, artworkUrl, onClick }: PlaylistCardProps) {
  return (
    <button
      onClick={onClick}
      className="flex-shrink-0 w-28 text-left"
    >
      <div className="w-28 h-28 rounded-lg overflow-hidden bg-neutral-800 mb-2">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 200)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-2xl">
            ♪
          </div>
        )}
      </div>
      <p className="text-sm text-white truncate">{name}</p>
      <p className="text-xs text-white/50">歌单</p>
    </button>
  );
}

// Track row component
interface TrackRowProps {
  index: number;
  name: string;
  artistName: string;
  artworkUrl: string;
  onClick: () => void;
}

function TrackRow({ index, name, artistName, artworkUrl, onClick }: TrackRowProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full py-2 active:bg-white/5 rounded-lg"
    >
      <span className="w-6 text-center text-white/50 text-sm">{index}</span>
      <div className="w-12 h-12 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 96)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            ♪
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-white text-sm truncate">{name}</p>
        <p className="text-white/50 text-xs truncate">{artistName}</p>
      </div>
    </button>
  );
}
