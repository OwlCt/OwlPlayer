import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Song } from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { usePlayHistoryStore } from '../../store/playHistoryStore';
import { useAuthStore } from '../../store/authStore';
import MobileHeader from './MobileHeader';
import MobileSongMenu from './MobileSongMenu';
import { MobileTrackRow } from './MobileDetailPage';
import { useGoBack } from '../../hooks/useNavigationHistory';

// Initial load count and increment for lazy loading
const INITIAL_LOAD_COUNT = 20;
const LOAD_INCREMENT = 20;

export default function MobileRecentlyPlayedPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { history, fetchHistory, isLoading: storeLoading } = usePlayHistoryStore();
  const { setQueue, queueSource, isPlaying, currentSong, playSong } = usePlayerStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_LOAD_COUNT);
  const [isLoading, setIsLoading] = useState(true);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, navigate]);

  // Fetch history on mount
  useEffect(() => {
    if (isAuthenticated) {
      setIsLoading(true);
      fetchHistory(100).finally(() => setIsLoading(false));
    }
  }, [isAuthenticated, fetchHistory]);

  // Convert history items to Song format
  const songs: Song[] = useMemo(() => {
    return history.map((item) => ({
      id: item.songId,
      name: item.songName,
      artistId: item.artistId,
      artistName: item.artistName,
      albumId: item.albumId,
      albumName: item.albumName,
      artworkUrl: item.artworkUrl,
      duration: item.duration,
      hasLyrics: false,
    }));
  }, [history]);

  // Check if current queue source is recently played
  const isCurrentSource = queueSource.type === 'recently-played';

  // Get visible songs (lazy loading)
  const visibleSongs = useMemo(() => {
    return songs.slice(0, visibleCount);
  }, [songs, visibleCount]);

  const hasMore = visibleCount < songs.length;

  // Load more callback
  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) => Math.min(prev + LOAD_INCREMENT, songs.length));
    }
  }, [hasMore, songs.length]);

  // IntersectionObserver for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadMore]);

  // Handle track tap - play song
  const handleTrackTap = useCallback(
    (index: number) => {
      if (songs.length === 0) return;
      setQueue(songs, index, { type: 'recently-played', id: null, name: '最近播放' });
      playSong(songs[index]);
    },
    [songs, setQueue, playSong]
  );

  // Handle long press - show menu
  const handleLongPress = useCallback((song: Song) => {
    setMenuSong(song);
    setMenuOpen(true);
  }, []);

  // Handle back
  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  // Loading state
  if (isLoading || storeLoading) {
    return (
      <div className="min-h-screen bg-black">
        <MobileHeader title="最近播放" opacity={1} backgroundColor="rgb(0, 0, 0)" showBackButton={true} />
        <div
          className="flex items-center justify-center pt-32"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 128px)' }}
        >
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex h-full flex-col bg-black"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
    >
      {/* Header */}
      <MobileHeader title="最近播放" opacity={1} onBack={handleBack} />

      {/* Song list */}
      <div className="flex-1 overflow-y-auto pb-52">
        {/* Stats */}
        <div className="px-4 py-2">
          <p className="text-white/60 text-sm">{songs.length} 首歌曲</p>
        </div>

        {songs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-neutral-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/40" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">还没有播放记录</h2>
            <p className="text-white/50 text-sm">开始播放音乐来记录你的播放历史</p>
          </div>
        ) : (
          <div>
            {visibleSongs.map((song, index) => {
              return (
                <MobileTrackRow
                  key={`${song.id}-${index}`}
                  track={song}
                  index={index}
                  isPlaying={isPlaying}
                  isCurrentTrack={currentSong?.id === song.id && isCurrentSource}
                  onTap={() => handleTrackTap(index)}
                  onLongPress={() => handleLongPress(song)}
                  showArtwork
                />
              );
            })}
            {/* Load more trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center text-white/40 text-sm">
                加载中...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Song context menu */}
      <MobileSongMenu
        song={menuSong}
        isOpen={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setMenuSong(null);
        }}
      />
    </div>
  );
}
