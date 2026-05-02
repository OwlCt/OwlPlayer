import { getProxiedImageUrl } from '../utils/image';
import CachedImage from './CachedImage';

export interface ProfileArtistCardProps {
  artist: {
    id: string;
    name: string;
    artworkUrl: string;
  };
  onClick: () => void;
}

/**
 * ProfileArtistCard - Circular artwork artist card for profile page
 * Displays artist with circular artwork, name below, and "艺术家" label
 */
export default function ProfileArtistCard({ artist, onClick }: ProfileArtistCardProps) {
  return (
    <div
      onClick={onClick}
      className="p-4 rounded-lg hover:bg-spotify-dark transition-colors cursor-pointer group"
    >
      {/* Circular artwork */}
      <div className="aspect-square rounded-full bg-spotify-gray overflow-hidden shadow-lg mb-4">
        {artist.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artist.artworkUrl, 300)}
            alt={artist.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-spotify-light-gray">
            ♪
          </div>
        )}
      </div>

      {/* Artist name */}
      <h3 className="font-bold truncate text-center">{artist.name}</h3>
      {/* Label */}
      <p className="text-sm text-spotify-light-gray text-center">艺术家</p>
    </div>
  );
}
