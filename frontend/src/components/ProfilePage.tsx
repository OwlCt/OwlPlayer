import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoEyeOff } from 'react-icons/io5';
import { useAuthStore } from '../store/authStore';
import { usePlaylistsStore } from '../store/playlistsStore';
import { useFollowedArtistsStore } from '../store/followedArtistsStore';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { usePlayerStore } from '../store/playerStore';
import { extractDominantColor } from '../utils/colorExtractor';
import { getProxiedImageUrl } from '../utils/image';
import { getArtistDetail } from '../api';
import ProfileArtistCard from './ProfileArtistCard';
import SongCard from './SongCard';
import CachedImage from './CachedImage';
import ScrollableCardRow from './ScrollableCardRow';

// Default avatar URL
const DEFAULT_AVATAR = '/api/avatars/default.svg';

/**
 * Format profile statistics string
 * @param playlistCount Number of playlists
 * @param followedCount Number of followed artists
 * @returns Formatted string like "{n}个歌单 · 关注{m}位艺术家"
 */
export function formatProfileStats(playlistCount: number, followedCount: number): string {
  return `${playlistCount}个歌单 · 关注${followedCount}位艺术家`;
}

// Clickable stats component for profile navigation
interface ClickableStatsProps {
  playlistCount: number;
  followedCount: number;
  onPlaylistClick: () => void;
  onFollowedClick: () => void;
}

export function ClickableStats({ 
  playlistCount, 
  followedCount, 
  onPlaylistClick, 
  onFollowedClick 
}: ClickableStatsProps) {
  return (
    <p className="text-sm text-white/60">
      <span 
        onClick={onPlaylistClick}
        className="cursor-pointer hover:text-white hover:underline transition-colors"
      >
        {playlistCount}个歌单
      </span>
      <span> · </span>
      <span 
        onClick={onFollowedClick}
        className="cursor-pointer hover:text-white hover:underline transition-colors"
      >
        关注{followedCount}位艺术家
      </span>
    </p>
  );
}

// Section header component with optional privacy indicator and "显示全部" link
interface SectionHeaderProps {
  title: string;
  showPrivacyIndicator?: boolean;
  showAllLink?: string;
  onShowAll?: () => void;
}

function SectionHeader({ title, showPrivacyIndicator, showAllLink, onShowAll }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        {onShowAll ? (
          <h2
            className="text-xl font-bold cursor-pointer hover:underline"
            onClick={onShowAll}
          >
            {title}
          </h2>
        ) : (
          <h2 className="text-xl font-bold">{title}</h2>
        )}
        {showPrivacyIndicator && (
          <span className="flex items-center gap-1 text-xs text-spotify-light-gray bg-spotify-gray px-2 py-1 rounded-full">
            <IoEyeOff className="w-3 h-3" />
            仅自己可见
          </span>
        )}
      </div>
      {showAllLink && (
        <button
          onClick={onShowAll}
          className="text-sm text-spotify-light-gray hover:text-white hover:underline"
        >
          显示全部
        </button>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const { playlists, fetchPlaylists } = usePlaylistsStore();
  const { followedArtists, fetchFollowedArtists, getFollowedArtistsCount } = useFollowedArtistsStore();
  const { history, topArtists, topTracks, fetchHistory, fetchTopArtists, fetchTopTracks } = usePlayHistoryStore();
  const { fetchRecentlyPlayed } = useRecentlyPlayedStore();
  const { fetchLikedSongs } = useLikedSongsStore();
  const { playSong, setQueue } = usePlayerStore();

  const [themeColor, setThemeColor] = useState<string>('rgb(38, 38, 38)');
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
          fetchTopTracks(50), // Fetch more tracks for full queue playback
          fetchRecentlyPlayed(),
          fetchLikedSongs(),
          fetchHistory(50), // Fetch play history for recent artists
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

  // Extract unique artists from play history and fetch real artwork
  useEffect(() => {
    const fetchRecentArtists = async () => {
      const artistMap = new Map<string, { id: string; name: string }>();
      
      // Get unique artists from play history
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

      // Fetch real artist artwork from API
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

  if (!isAuthenticated || !user) {
    return null;
  }

  const avatarUrl = user.avatar_url || DEFAULT_AVATAR;
  const playlistCount = playlists.length;
  const followedCount = getFollowedArtistsCount();

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-full"
      style={{
        background: `linear-gradient(to bottom, ${themeColor} 0%, transparent 400px), linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgb(18,18,18) 400px)`,
      }}
    >
      <div className="p-8">
        {/* Profile Header */}
        <div className="flex gap-6 mb-8">
          {/* Avatar */}
          <div className="w-48 h-48 flex-shrink-0 rounded-full overflow-hidden shadow-xl">
            <img
              src={avatarUrl}
              alt={user.username}
              className="w-full h-full object-cover bg-neutral-700"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
              }}
            />
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center pt-16">
            <p className="text-sm text-white/60 uppercase tracking-wider mb-2">个人资料</p>
            <h1 className="text-5xl font-bold mb-4">{user.username}</h1>
            <ClickableStats
              playlistCount={playlistCount}
              followedCount={followedCount}
              onPlaylistClick={() => navigate('/profile/playlists')}
              onFollowedClick={() => navigate('/profile/followed-artists')}
            />
          </div>
        </div>

        {/* 本月热门艺人 Section */}
        {topArtists.length > 0 && (
          <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
            <div style={{ paddingLeft: '32px', paddingRight: '32px' }}>
              <SectionHeader
                title="本月热门艺人"
                showPrivacyIndicator
                showAllLink="/profile/top-artists"
                onShowAll={() => navigate('/profile/top-artists')}
              />
            </div>
            <ScrollableCardRow cardWidth={200} gap={16} edgePadding={16}>
              {topArtists.slice(0, 10).map((artist) => (
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
            </ScrollableCardRow>
          </section>
        )}

        {/* 本月热门曲目 Section */}
        {topTracks.length > 0 && (
          <section className="mb-8">
            <SectionHeader
              title="本月热门曲目"
              showPrivacyIndicator
              showAllLink="/profile/top-tracks"
              onShowAll={() => navigate('/profile/top-tracks')}
            />
            <div className="space-y-1">
              {topTracks.slice(0, 4).map((track, index) => {
                const song = {
                  id: track.songId,
                  name: track.songName,
                  artistId: track.artistId,
                  artistName: track.artistName,
                  albumId: track.albumId,
                  albumName: track.albumName,
                  artworkUrl: track.artworkUrl,
                  duration: track.duration,
                  hasLyrics: false,
                };
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
                  <SongCard
                    key={track.songId}
                    song={song}
                    showIndex={index + 1}
                    alwaysShowLikedStatus
                    onPlay={() => {
                      setQueue(allSongs, index, { type: null, id: 'profile-top-tracks', name: '本月热门曲目' });
                      playSong(allSongs[index]);
                    }}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* 最近听过其作品的艺人 Section */}
        {recentlyPlayedArtists.length > 0 && (
          <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
            <div style={{ paddingLeft: '32px', paddingRight: '32px' }}>
              <SectionHeader
                title="最近听过其作品的艺人"
                showAllLink="/profile/recent-artists"
                onShowAll={() => navigate('/profile/recent-artists')}
              />
            </div>
            <ScrollableCardRow cardWidth={200} gap={16} edgePadding={16}>
              {recentlyPlayedArtists.slice(0, 10).map((artist) => (
                <ProfileArtistCard
                  key={artist.id}
                  artist={artist}
                  onClick={() => navigate(`/artist/${artist.id}`)}
                />
              ))}
            </ScrollableCardRow>
          </section>
        )}

        {/* 关注中 Section */}
        {followedArtists.length > 0 && (
          <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
            <div style={{ paddingLeft: '32px', paddingRight: '32px' }}>
              <SectionHeader
                title="关注中"
                showAllLink="/profile/followed-artists"
                onShowAll={() => navigate('/profile/followed-artists')}
              />
            </div>
            <ScrollableCardRow cardWidth={200} gap={16} edgePadding={16}>
              {followedArtists.slice(0, 10).map((artist) => (
                <ProfileArtistCard
                  key={artist.artist_id}
                  artist={{
                    id: artist.artist_id,
                    name: artist.artist_name,
                    artworkUrl: artist.artwork_url,
                  }}
                  onClick={() => navigate(`/artist/${artist.artist_id}`)}
                />
              ))}
            </ScrollableCardRow>
          </section>
        )}

        {/* 创建的歌单 Section */}
        {playlists.length > 0 && (
          <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
            <div style={{ paddingLeft: '32px', paddingRight: '32px' }}>
              <SectionHeader
                title="创建的歌单"
                showAllLink="/profile/playlists"
                onShowAll={() => navigate('/profile/playlists')}
              />
            </div>
            <ScrollableCardRow cardWidth={200} gap={16} edgePadding={16}>
              {playlists.slice(0, 10).map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => navigate(`/playlist/${playlist.id}`)}
                  className="p-4 rounded-lg hover:bg-spotify-dark transition-colors cursor-pointer group"
                >
                  {/* Playlist artwork */}
                  <div className="aspect-square rounded-lg bg-spotify-gray overflow-hidden shadow-lg mb-4">
                    {playlist.artwork_url ? (
                      <CachedImage
                        src={getProxiedImageUrl(playlist.artwork_url, 300)}
                        alt={playlist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl text-spotify-light-gray bg-gradient-to-br from-spotify-gray to-spotify-dark">
                        ♪
                      </div>
                    )}
                  </div>
                  {/* Playlist name */}
                  <h3 className="font-bold truncate">{playlist.name}</h3>
                  {/* Creator attribution */}
                  <p className="text-sm text-spotify-light-gray truncate">
                    由 {user?.username} 创建
                  </p>
                </div>
              ))}
            </ScrollableCardRow>
          </section>
        )}
      </div>
    </div>
  );
}
