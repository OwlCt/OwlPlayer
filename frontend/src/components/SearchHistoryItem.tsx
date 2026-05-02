import { IoClose } from 'react-icons/io5';
import { SearchHistoryItem as SearchHistoryItemType } from '../store/searchHistoryStore';
import { getProxiedImageUrl } from '../utils/image';
import CachedImage from './CachedImage';

interface SearchHistoryItemProps {
  item: SearchHistoryItemType;
  onClick: () => void;
  onArtistClick?: (artistId: string) => void;
  onArtistNameClick?: (artistName: string) => void;
  onDelete: () => void;
}

/**
 * SearchHistoryItem component
 * Renders different layouts based on item type:
 * - Song: square artwork + name + "歌曲 · {artistName}" with clickable artist
 * - Artist: circular artwork + name + "艺术家"
 * - Album: square artwork + name + "专辑 · {artistName}" with clickable artist
 */
export default function SearchHistoryItem({ 
  item, 
  onClick, 
  onArtistClick,
  onArtistNameClick,
  onDelete 
}: SearchHistoryItemProps) {
  const isArtist = item.type === 'artist';
  
  // Handle artist name click in subtitle
  const handleArtistNameClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.artistId && onArtistClick) {
      onArtistClick(item.artistId);
    } else if (onArtistNameClick) {
      // Fallback: use artist name to navigate (for old records without artistId)
      const artistName = item.subtitle.split(' · ')[1];
      if (artistName) {
        onArtistNameClick(artistName);
      }
    }
  };

  // Handle delete button click
  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  // Render subtitle based on item type
  const renderSubtitle = () => {
    if (item.type === 'artist') {
      return <span className="text-spotify-light-gray">艺术家</span>;
    }
    
    // For song and album, show type + clickable artist name
    const typeLabel = item.type === 'song' ? '歌曲' : '专辑';
    // Prefer artistName field, fallback to parsing from subtitle for old records
    const artistName = item.artistName || item.subtitle.split(' · ')[1];
    const hasClickHandler = onArtistClick || onArtistNameClick;
    
    return (
      <span className="text-spotify-light-gray">
        {typeLabel}
        {artistName && (
          <>
            <span className="mx-1">·</span>
            {hasClickHandler ? (
              <button
                onClick={handleArtistNameClick}
                className="hover:underline hover:text-white transition-colors"
              >
                {artistName}
              </button>
            ) : (
              <span>{artistName}</span>
            )}
          </>
        )}
      </span>
    );
  };

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-spotify-dark cursor-pointer group transition-colors"
    >
      {/* Artwork - circular for artist, square for others */}
      <div 
        className={`w-12 h-12 bg-spotify-gray overflow-hidden flex-shrink-0 ${
          isArtist ? 'rounded-full' : 'rounded'
        }`}
      >
        {item.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(item.artworkUrl, 96)}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-spotify-light-gray text-xl">
            {isArtist ? '👤' : '♪'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{item.name}</div>
        <div className="text-sm truncate">{renderSubtitle()}</div>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDeleteClick}
        className="p-2 rounded-full hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="删除搜索记录"
      >
        <IoClose className="w-5 h-5 text-spotify-light-gray hover:text-white" />
      </button>
    </div>
  );
}
