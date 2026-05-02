import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRecentlyPlayedStore, RecentlyPlayedItem } from '../store/recentlyPlayedStore';
import { getProxiedImageUrl } from '../utils/image';
import CachedImage from './CachedImage';

interface RecentlyPlayedCardProps {
  item: RecentlyPlayedItem;
  onClick: () => void;
}

function RecentlyPlayedCard({ item, onClick }: RecentlyPlayedCardProps) {
  const isLikedSongs = item.type === 'liked-songs';

  // Determine the correct ID prop for CachedImage based on item type
  const getCachedImageProps = () => {
    switch (item.type) {
      case 'album':
        return { albumId: item.id };
      case 'playlist':
      case 'daily-mix':
        return { playlistId: item.id };
      default:
        return {};
    }
  };

  // Display name - use fixed name for liked-songs to match library
  const displayName = isLikedSongs ? '已点赞的歌曲' : item.name;

  return (
    <div
      className="flex items-center gap-3 h-14 rounded-md bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group overflow-hidden"
      onClick={onClick}
    >
      <div className="w-14 h-14 flex-shrink-0 overflow-hidden rounded-md">
        {isLikedSongs ? (
          <div className="w-full h-full bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        ) : item.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(item.artworkUrl, 112)}
            alt={item.name}
            className="w-full h-full object-cover"
            {...getCachedImageProps()}
          />
        ) : (
          <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
            <span className="text-lg">♪</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 pr-3 flex items-center">
        <h3 className="font-bold text-white text-sm line-clamp-2">{displayName}</h3>
      </div>
    </div>
  );
}

export default function RecentlyPlayedSection() {
  const navigate = useNavigate();
  const { items, fetchRecentlyPlayed } = useRecentlyPlayedStore();
  const visibleItems = items.filter((item) => item.type !== 'daily-mix');

  useEffect(() => {
    fetchRecentlyPlayed();
  }, [fetchRecentlyPlayed]);

  if (visibleItems.length === 0) {
    return null;
  }

  const handleClick = (item: RecentlyPlayedItem) => {
    switch (item.type) {
      case 'liked-songs':
        navigate('/liked-songs');
        break;
      case 'playlist':
        navigate(`/playlist/${item.id}`);
        break;
      case 'album':
        navigate(`/album/${item.id}`);
        break;
      case 'artist':
        navigate(`/artist/${item.id}`);
        break;
    }
  };

  return (
    <section className="mb-8" style={{ marginLeft: '-24px', marginRight: '-24px' }}>
      <h2 className="text-2xl font-bold text-white mb-4" style={{ paddingLeft: '40px', paddingRight: '40px' }}>最近播放</h2>
      <div className="grid grid-cols-2 min-[1500px]:grid-cols-4 gap-2" style={{ paddingLeft: '40px', paddingRight: '40px' }}>
        {visibleItems.slice(0, 8).map((item) => (
          <RecentlyPlayedCard
            key={`${item.type}-${item.id}`}
            item={item}
            onClick={() => handleClick(item)}
          />
        ))}
      </div>
    </section>
  );
}
