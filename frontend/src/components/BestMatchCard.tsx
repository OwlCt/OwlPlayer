import { BestMatchItem } from '../types';
import { getProxiedImageUrl } from '../utils/image';
import CachedImage from './CachedImage';

interface BestMatchCardProps {
  item: BestMatchItem;
  onClick: () => void;
  onPlay?: () => void;  // Play button callback
  onPause?: () => void; // Pause button callback
  isPlaying?: boolean;  // Whether this item is currently playing
}

const typeLabels: Record<BestMatchItem['type'], string> = {
  artist: '艺术家',
  album: '专辑',
  song: '歌曲',
};

export default function BestMatchCard({ item, onClick, onPlay, onPause, isPlaying = false }: BestMatchCardProps) {
  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying && onPause) {
      onPause();
    } else if (onPlay) {
      onPlay();
    }
  };

  // Show play button for all types (song, album, artist)
  const showPlayButton = onPlay || onPause;

  return (
    <div
      onClick={onClick}
      className="bg-spotify-dark p-6 rounded-lg hover:bg-spotify-gray transition-colors cursor-pointer group relative min-w-[300px]"
    >
      {/* Image - increased to 120x120px */}
      <div className={`w-[120px] h-[120px] mb-5 overflow-hidden shadow-lg ${
        item.isCircular ? 'rounded-full' : 'rounded-md'
      }`}>
        {item.imageUrl ? (
          <CachedImage
            src={getProxiedImageUrl(item.imageUrl, 240)}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-spotify-gray flex items-center justify-center text-5xl text-white/20">
            ♪
          </div>
        )}
      </div>

      {/* Info - adjusted spacing */}
      <h3 className="font-bold text-2xl truncate mb-2">{item.name}</h3>
      <p className="text-sm text-spotify-light-gray truncate">
        {item.subtitle && <span>{item.subtitle} • </span>}
        {typeLabels[item.type]}
      </p>

      {/* Play/Pause button (shown on hover) */}
      {showPlayButton && (
        <button
          onClick={handlePlayClick}
          className="absolute bottom-5 right-5 w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 hover:scale-105"
        >
          <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
            {isPlaying ? (
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            ) : (
              <path d="M6 4l15 8-15 8V4z" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}
