import { useNavigate } from 'react-router-dom';
import { useSearchHistoryStore, SearchHistoryItem as SearchHistoryItemType } from '../store/searchHistoryStore';
import SearchHistoryItem from './SearchHistoryItem';

interface SearchHistoryDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  onItemClick?: (item: SearchHistoryItemType) => void;
}

/**
 * SearchHistoryDropdown component
 * Displays recent search history when search input is focused and empty
 * Shows up to 10 recent items with "最近的搜索记录" header
 */
export default function SearchHistoryDropdown({ 
  isOpen, 
  onClose,
  onItemClick 
}: SearchHistoryDropdownProps) {
  const navigate = useNavigate();
  const { getRecentItems, removeItem } = useSearchHistoryStore();
  
  const recentItems = getRecentItems(10);

  if (!isOpen) return null;

  // Handle item click - navigate based on type
  const handleItemClick = (item: SearchHistoryItemType) => {
    onItemClick?.(item);
    
    switch (item.type) {
      case 'song':
        // Song click → navigate to album detail page
        if (item.albumId) {
          navigate(`/album/${item.albumId}`);
        }
        break;
      case 'artist':
        // Artist click → navigate to artist detail page
        navigate(`/artist/${item.id}`);
        break;
      case 'album':
        // Album click → navigate to album detail page
        navigate(`/album/${item.id}`);
        break;
    }
    
    onClose();
  };

  // Handle artist name click in subtitle (by ID)
  const handleArtistClick = (artistId: string) => {
    navigate(`/artist/${artistId}`);
    onClose();
  };

  // Handle artist name click when no artistId available (search by name)
  const handleArtistNameClick = (artistName: string) => {
    navigate(`/search?q=${encodeURIComponent(artistName)}`);
    onClose();
  };

  // Handle delete item
  const handleDeleteItem = (item: SearchHistoryItemType) => {
    removeItem(item.id, item.type);
  };

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-white font-semibold">最近的搜索记录</h3>
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto">
        {recentItems.length === 0 ? (
          // Empty state
          <div className="px-4 py-8 text-center text-spotify-light-gray">
            暂无搜索记录
          </div>
        ) : (
          // Search history items
          <div className="p-2">
            {recentItems.map((item) => (
              <SearchHistoryItem
                key={`${item.type}-${item.id}`}
                item={item}
                onClick={() => handleItemClick(item)}
                onArtistClick={handleArtistClick}
                onArtistNameClick={handleArtistNameClick}
                onDelete={() => handleDeleteItem(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
