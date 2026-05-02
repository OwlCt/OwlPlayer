import { Artist } from '../types';
import { getProxiedImageUrl } from '../utils/image';
import CachedImage from './CachedImage';
import { useIsMobile } from '../hooks/useIsMobile';
import { useTouchClick } from '../hooks/useTouchClick';

interface ArtistCardProps {
  artist: Artist;
  onPlay?: () => void;
  onPause?: () => void;
  isPlaying?: boolean;  // Whether this artist is currently playing
  onClick?: () => void;  // Click handler for navigation
}

export default function ArtistCard({ artist, onPlay, onPause, isPlaying = false, onClick }: ArtistCardProps) {
  const isMobile = useIsMobile();
  const touchHandlers = useTouchClick(onClick || (() => {}));

  return (
    <div 
      className="p-4 rounded-lg hover:bg-spotify-dark transition-colors cursor-pointer group relative"
      {...(isMobile && onClick ? touchHandlers : { onClick })}
    >
      {/* Artwork container - relative for button positioning */}
      <div className="relative mb-4">
        <div className="aspect-square rounded-full bg-spotify-gray overflow-hidden shadow-lg">
          {artist.artworkUrl ? (
            <CachedImage
              src={getProxiedImageUrl(artist.artworkUrl, 400)}
              alt={artist.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl text-spotify-light-gray">
              ♪
            </div>
          )}
        </div>
        
        {/* Play/Pause button - outside the circular overflow container */}
        {(onPlay || onPause) && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying && onPause) {
                onPause();
              } else if (onPlay) {
                onPlay();
              }
            }}
            className="absolute bottom-2 right-2 w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200 hover:scale-105"
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

      {/* Info */}
      <h3 className="font-bold truncate">{artist.name}</h3>
      <p className="text-sm text-spotify-light-gray">艺术家</p>
    </div>
  );
}
