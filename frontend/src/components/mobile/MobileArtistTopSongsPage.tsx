import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Song, Album } from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import MobileHeader from './MobileHeader';
import MobileSongMenu from './MobileSongMenu';
import { MobileTrackRow } from './MobileDetailPage';
import { useGoBack } from '../../hooks/useNavigationHistory';
import { buildArtistQueueSource, enrichSongForArtistNavigation, isArtistQueueSource } from '../../utils/artistPage';

// Initial load count and increment for lazy loading
const INITIAL_LOAD_COUNT = 10;
const LOAD_INCREMENT = 10;

interface MobileArtistTopSongsPageProps {
  artistId: string;
  artistName: string;
  sectionTitle: string;
  topSongs: Song[];
  albums?: Album[];
}

export default function MobileArtistTopSongsPage({
  artistId,
  artistName,
  sectionTitle,
  topSongs,
  albums = [],
}: MobileArtistTopSongsPageProps) {
  const { setQueue, queueSource, isPlaying, currentSong } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_LOAD_COUNT);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Check if current queue source is this artist
  const isCurrentArtistSource = isArtistQueueSource(queueSource, artistId, 'featured');

  // Get visible songs (lazy loading)
  const visibleSongs = useMemo(() => {
    return topSongs.slice(0, visibleCount);
  }, [topSongs, visibleCount]);

  const hasMore = visibleCount < topSongs.length;

  // Load more callback
  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount(prev => Math.min(prev + LOAD_INCREMENT, topSongs.length));
    }
  }, [hasMore, topSongs.length]);

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
  const handleTrackTap = useCallback((index: number) => {
    if (topSongs.length === 0) return;
    recordPlay('artist', artistId);
    setQueue(topSongs, index, buildArtistQueueSource(artistId, artistName, 'featured'));
  }, [artistId, artistName, topSongs, recordPlay, setQueue]);

  // Handle long press - show menu
  const handleLongPress = useCallback((song: Song) => {
    setMenuSong(enrichSongForArtistNavigation(song, {
      artistId,
      artistName,
      albums,
    }));
    setMenuOpen(true);
  }, [albums, artistId, artistName]);

  // Handle back
  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  return (
    <div className="flex flex-col h-full bg-black" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      {/* Header */}
      <MobileHeader title={`${artistName} · ${sectionTitle}`} opacity={1} onBack={handleBack} />

      {/* Song list */}
      {/* pb-52: extra bottom padding to ensure content is not hidden behind MiniPlayer + BottomNav */}
      <div className="flex-1 overflow-y-auto pb-52">
        {topSongs.length === 0 ? (
          <div className="text-center py-12 text-white/40">暂无可展示歌曲</div>
        ) : (
          <div>
            {visibleSongs.map((song, index) => {
              return (
                <MobileTrackRow
                  key={song.id}
                  track={song}
                  index={index}
                  isPlaying={isPlaying}
                  isCurrentTrack={currentSong?.id === song.id && isCurrentArtistSource}
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
