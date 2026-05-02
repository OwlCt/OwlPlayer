import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock } from 'react-icons/fi';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { extractDominantColor } from '../utils/colorExtractor';
import { getProxiedImageUrl } from '../utils/image';
import { StickyHeader } from './StickyHeader';
import SongCard from './SongCard';
import ShuffleButton from './ShuffleButton';

export default function TopTracksPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { topTracks, fetchTopTracks, isLoading } = usePlayHistoryStore();
  const { isLiked, fetchLikedSongs } = useLikedSongsStore();
  const { playSong, setQueue, toggleShuffle, isShuffled, queueSource, isPlaying, pause, play } = usePlayerStore();

  const [themeColor, setThemeColor] = useState<string>('rgb(88, 28, 135)');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [localShuffle, setLocalShuffle] = useState(false);

  const actionBarRef = useRef<HTMLDivElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Fetch data on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchTopTracks(100); // Fetch more tracks for full list
      fetchLikedSongs();
    }
  }, [isAuthenticated, fetchTopTracks, fetchLikedSongs]);

  // Extract theme color from first track artwork
  useEffect(() => {
    if (topTracks.length > 0 && topTracks[0].artworkUrl) {
      const imageUrl = getProxiedImageUrl(topTracks[0].artworkUrl, 100);
      extractDominantColor(imageUrl).then(setThemeColor);
    }
  }, [topTracks]);

  // Sync localShuffle from playerStore when queueSource matches
  useEffect(() => {
    if (queueSource.type === 'profile-top-tracks') {
      setLocalShuffle(isShuffled);
    }
  }, [queueSource, isShuffled]);

  // Clear selection when clicking outside song cards
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('[class*="bg-[#282828]"]')) return;
      if (!target.closest('[data-song-card]')) {
        setSelectedSongId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Convert top tracks to songs
  const songs = topTracks.map(t => ({
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

  // Check if current queue source matches this page
  const isCurrentSource = queueSource.type === 'profile-top-tracks';
  const isCurrentSourcePlaying = isPlaying && isCurrentSource;

  const handlePlayAll = () => {
    if (songs.length === 0) return;
    setQueue(songs, 0, { type: 'profile-top-tracks', id: null, name: '本月热门曲目' });
    if (localShuffle !== isShuffled) {
      toggleShuffle();
    }
  };

  const handlePlayPauseClick = () => {
    if (isCurrentSourcePlaying) {
      pause();
    } else if (isCurrentSource) {
      play();
    } else {
      handlePlayAll();
    }
  };

  const handlePlaySong = (index: number) => {
    setQueue(songs, index, { type: 'profile-top-tracks', id: null, name: '本月热门曲目' });
  };

  // Format total duration
  const formatTotalDuration = () => {
    const totalMs = songs.reduce((acc, song) => acc + song.duration, 0);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    if (hours > 0) {
      return `${hours} 小时 ${minutes} 分钟`;
    }
    return `${minutes} 分钟`;
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse">
          <div
            className="h-48 rounded-lg mb-6"
            style={{ background: `linear-gradient(to bottom, ${themeColor}, rgb(18, 18, 18))` }}
          />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-spotify-gray rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Track header for sticky header
  const trackHeader = (
    <div className="track-list-container px-4">
      <div
        className="track-list-grid items-center h-9 text-sm text-spotify-light-gray border-b border-white/10"
        role="row"
      >
        <div className="text-center" role="columnheader">#</div>
        <div role="columnheader">标题</div>
        <div className="col-album" role="columnheader">专辑</div>
        <div className="col-date" role="columnheader">播放次数</div>
        <div className="flex justify-end pr-8" role="columnheader">
          <FiClock size={16} />
        </div>
      </div>
    </div>
  );

  return (
    <StickyHeader
      title="本月热门曲目"
      themeColor={themeColor}
      onPlay={handlePlayPauseClick}
      actionBarRef={actionBarRef}
      showTrackHeader={true}
      customTrackHeader={trackHeader}
      triggerOffset={5}
      isCurrentSourcePlaying={isCurrentSourcePlaying}
    >
      <div
        className="min-h-full"
        style={{
          background: `linear-gradient(to bottom, ${themeColor} 0%, transparent 400px), linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgb(18,18,18) 400px)`,
        }}
      >
        {/* Header */}
        <div className="p-6 pb-8">
          <div className="flex items-end gap-6">
            {/* Cover */}
            <div className="w-64 h-64 bg-gradient-to-br from-purple-600 to-blue-400 rounded-lg flex items-center justify-center shadow-2xl">
              <svg className="w-24 h-24 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>

            {/* Info */}
            <div className="flex-1">
              <p className="text-sm text-white/80 mb-2">歌单</p>
              <h1 className="text-5xl font-bold text-white mb-6">本月热门曲目</h1>
              <p className="text-sm text-white/80">
                {songs.length} 首歌曲 · {formatTotalDuration()}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div ref={actionBarRef} className="px-6 py-4 flex items-center gap-4">
          <button
            onClick={handlePlayPauseClick}
            disabled={songs.length === 0}
            className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24">
              {isCurrentSourcePlaying ? (
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              ) : (
                <path d="M6 4l15 8-15 8V4z" />
              )}
            </svg>
          </button>
          <ShuffleButton
            isActive={localShuffle}
            onClick={() => setLocalShuffle(!localShuffle)}
            size="lg"
          />
        </div>

        {/* Song list */}
        <div className="px-4 pb-32 track-list-container">
          {songs.length === 0 ? (
            <div className="text-center py-16">
              <svg className="w-16 h-16 text-spotify-light-gray mx-auto mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
              <h2 className="text-xl font-semibold text-white mb-2">还没有播放记录</h2>
              <p className="text-spotify-light-gray">开始播放音乐来生成你的热门曲目</p>
            </div>
          ) : (
            <div role="grid" aria-label="本月热门曲目" aria-rowcount={songs.length + 1}>
              {/* Header row */}
              <div
                className="track-list-grid items-center h-9 text-sm text-spotify-light-gray border-b border-white/10 mb-2"
                role="row"
                aria-rowindex={1}
              >
                <div className="text-center" role="columnheader">#</div>
                <div role="columnheader">标题</div>
                <div className="col-album" role="columnheader">专辑</div>
                <div className="col-date" role="columnheader">播放次数</div>
                <div className="flex justify-end pr-8" role="columnheader">
                  <FiClock size={16} />
                </div>
              </div>

              {/* Songs */}
              {songs.map((song, index) => (
                <SongCard
                  key={song.id}
                  song={song}
                  onPlay={() => handlePlaySong(index)}
                  showIndex={index + 1}
                  showAlbum={true}
                  showLikeButton={true}
                  addedAt={`${topTracks[index]?.playCount || 0} 次`}
                  isSelected={selectedSongId === song.id}
                  onSelect={setSelectedSongId}
                  isCurrentSource={isCurrentSource}
                  useGridLayout={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </StickyHeader>
  );
}
