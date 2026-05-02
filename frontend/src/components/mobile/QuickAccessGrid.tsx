import { useNavigate } from 'react-router-dom';
import CachedImage from '../CachedImage';
import { useTouchClick } from '../../hooks/useTouchClick';
import { getProxiedImageUrl } from '../../utils/image';

/**
 * Quick access item type definition
 * Represents items that can appear in the quick access grid
 */
export interface QuickAccessItem {
  id: string;
  type: 'playlist' | 'album' | 'artist' | 'liked-songs' | 'daily-mix';
  name: string;
  imageUrl?: string;
  lastPlayedAt?: string; // ISO timestamp for sorting by recency
}

/**
 * Maximum number of items to display in the grid
 * Requirements: 3.4 - limit display to 8 items (4 rows)
 */
export const MAX_QUICK_ACCESS_ITEMS = 8;

/**
 * Number of columns in the grid layout
 * Requirements: 3.2 - 2-column grid layout
 */
export const GRID_COLUMNS = 2;

/**
 * Sorts items by recency (most recent first) and limits to max items
 * Pure function for testability
 * 
 * @param items - Array of quick access items
 * @param maxItems - Maximum number of items to return (default: 6)
 * @returns Sorted and limited array of items
 * 
 * Requirements: 3.4 - most recent first, limit to 6 items
 */
export function sortAndLimitItems(
  items: QuickAccessItem[],
  maxItems: number = MAX_QUICK_ACCESS_ITEMS
): QuickAccessItem[] {
  // Sort by lastPlayedAt descending (most recent first)
  const sorted = [...items].sort((a, b) => {
    const dateA = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
    const dateB = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
    return dateB - dateA;
  });
  
  // Limit to maxItems
  return sorted.slice(0, maxItems);
}

/**
 * Generates the navigation route for a quick access item
 * Pure function for testability
 * 
 * @param item - The quick access item
 * @returns The route path to navigate to
 * 
 * Requirements: 3.3 - navigate to content on tap
 */
export function getItemRoute(item: QuickAccessItem): string {
  switch (item.type) {
    case 'liked-songs':
      return '/liked-songs';
    case 'playlist':
      return `/playlist/${item.id}`;
    case 'album':
      return `/album/${item.id}`;
    case 'artist':
      return `/artist/${item.id}`;
    case 'daily-mix':
      return `/playlist/${item.id}`;
    default:
      return '/';
  }
}

interface QuickAccessCardProps {
  item: QuickAccessItem;
  onClick: () => void;
}

/**
 * Individual card component for quick access grid
 * Compact card style with artwork and name
 * Uses useTouchClick to prevent accidental clicks during scroll
 */
function QuickAccessCard({ item, onClick }: QuickAccessCardProps) {
  const isLikedSongs = item.type === 'liked-songs';
  const touchHandlers = useTouchClick(onClick);

  // Display name - use fixed name for liked-songs to match library
  const displayName = isLikedSongs ? '已点赞的歌曲' : item.name;

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

  return (
    <button
      {...touchHandlers}
      className="flex items-center gap-2 h-12 rounded-md bg-white/5 hover:bg-white/10 active:bg-white/15 transition-colors overflow-hidden w-full text-left min-h-[44px]"
      aria-label={`打开 ${displayName}`}
    >
      {/* Artwork */}
      <div className="w-12 h-12 flex-shrink-0 overflow-hidden rounded-md">
        {isLikedSongs ? (
          <div className="w-full h-full bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </div>
        ) : item.imageUrl ? (
          <CachedImage
            src={getProxiedImageUrl(item.imageUrl, 112)}
            alt={item.name}
            className="w-full h-full object-cover"
            {...getCachedImageProps()}
          />
        ) : (
          <div className="w-full h-full bg-neutral-700 flex items-center justify-center">
            <span className="text-lg text-white/60">♪</span>
          </div>
        )}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0 pr-3">
        <span className="font-medium text-white text-xs line-clamp-2">
          {displayName}
        </span>
      </div>
    </button>
  );
}

interface QuickAccessGridProps {
  items: QuickAccessItem[];
  maxItems?: number;
  className?: string;
}

/**
 * QuickAccessGrid component for mobile home page.
 * Displays recent playlists, albums, and liked songs in a 2-column grid.
 * Limited to 6 items maximum, sorted by most recent first.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export default function QuickAccessGrid({
  items,
  maxItems = MAX_QUICK_ACCESS_ITEMS,
  className = '',
}: QuickAccessGridProps) {
  const navigate = useNavigate();

  // Sort by recency and limit items
  const displayItems = sortAndLimitItems(items, maxItems);

  // Handle item click - navigate to content
  const handleItemClick = (item: QuickAccessItem) => {
    const route = getItemRoute(item);
    navigate(route);
  };

  if (displayItems.length === 0) {
    return null;
  }

  return (
    <section className={`${className}`}>
      {/* 2-column grid layout (Requirements: 3.2) */}
      <div className="grid grid-cols-2 gap-2">
        {displayItems.map((item) => (
          <QuickAccessCard
            key={`${item.type}-${item.id}`}
            item={item}
            onClick={() => handleItemClick(item)}
          />
        ))}
      </div>
    </section>
  );
}
