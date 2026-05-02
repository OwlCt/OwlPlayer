import { useState, useEffect, useCallback, useRef, TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiHeart, FiChevronDown, FiCheck, FiSearch, FiPlus, FiX } from 'react-icons/fi';
import { useLikedSongsStore } from '../../store/likedSongsStore';
import { useLibraryAlbumsStore, LibraryAlbum } from '../../store/libraryAlbumsStore';
import { useFollowedArtistsStore, FollowedArtist } from '../../store/followedArtistsStore';
import { usePlaylistsStore, Playlist } from '../../store/playlistsStore';
import { useLibraryStore, FilterTab, SortOption, sortLibraryItems, filterLibraryItems, searchLibraryItems, LibraryItem } from '../../store/libraryStore';
import { usePlayerStore } from '../../store/playerStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useBottomPadding } from '../../hooks/useBottomPadding';
import CachedImage from '../CachedImage';
import { getProxiedImageUrl } from '../../utils/image';
import MobileArtistMenu from './MobileArtistMenu';
import MobileAlbumMenu from './MobileAlbumMenu';
import MobilePlaylistMenu from './MobilePlaylistMenu';
import MobileBottomSheet from './MobileBottomSheet';
import { useTouchClick, isTapGesture } from '../../hooks/useTouchClick';
import { useOfflineLibraryItems } from '../../hooks/useOfflineLibraryItems';
import {
  getReleaseTypeLabel,
} from '../../utils/releaseType';

/**
 * Type indicator labels for library items
 */
export const TYPE_LABELS: Record<string, string> = {
  playlist: '歌单',
  album: '专辑',
  artist: '艺术家',
  'liked-songs': '歌单',
};

export function getLibraryItemTypeLabel(item: Pick<LibraryItem, 'type' | 'releaseType' | 'isSingle'>): string {
  if (item.type === 'album') {
    return getReleaseTypeLabel(item.releaseType, item.isSingle);
  }
  return TYPE_LABELS[item.type] || item.type;
}

/**
 * Library item display info structure
 * Used for property testing to verify all required information is present
 */
export interface LibraryItemDisplayInfo {
  hasArtwork: boolean;
  hasTitle: boolean;
  hasTypeIndicator: boolean;
  title: string;
  typeIndicator: string;
  artworkUrl?: string;
}

/**
 * Extract display information from a library item
 * This function is used to verify that all required information is present
 * for each library item displayed on mobile.
 * 
 * **Feature: spotify-mobile-ui, Property 8: Library Item Information**
 * **Validates: Requirements 5.2**
 */
export function getLibraryItemDisplayInfo(item: LibraryItem): LibraryItemDisplayInfo {
  const typeLabel = getLibraryItemTypeLabel(item);
  
  return {
    hasArtwork: item.imageUrl !== undefined && item.imageUrl !== null && item.imageUrl !== '',
    hasTitle: item.name !== undefined && item.name !== null && item.name.trim() !== '',
    hasTypeIndicator: typeLabel !== undefined && typeLabel !== null && typeLabel.trim() !== '',
    title: item.name,
    typeIndicator: typeLabel,
    artworkUrl: item.imageUrl,
  };
}

/**
 * Sort option labels
 */
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'recent-played', label: '最近播放' },
  { value: 'recent-added', label: '最近添加' },
  { value: 'alphabetical', label: '按字母顺序' },
  { value: 'creator', label: '按创建者' },
];

/**
 * Filter tab options
 */
const BASE_FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'playlists', label: '歌单' },
  { value: 'artists', label: '艺人' },
  { value: 'albums', label: '专辑' },
];


/**
 * MobileLibraryItem component
 * Renders a single library item row with large touch targets (min 44px)
 * Displays album art, title, and type indicator
 * 
 * Requirements: 5.1, 5.2
 */
interface MobileLibraryItemProps {
  item: LibraryItem;
  onClick: () => void;
  onLongPress: () => void;
  isPlaying?: boolean;
}

export function MobileLibraryItem({
  item,
  onClick,
  onLongPress,
  isPlaying = false,
}: MobileLibraryItemProps) {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const isTouchMovedRef = useRef(false);
  const [isLongPressHighlight, setIsLongPressHighlight] = useState(false);

  // Handle touch start for long press detection
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    isLongPressRef.current = false;
    isTouchMovedRef.current = false;

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setIsLongPressHighlight(true);
      onLongPress();
    }, 500); // 500ms long press threshold
  };

  // Handle touch move - cancel long press and mark as scrolling if moved too much
  const handleTouchMove = (e: TouchEvent) => {
    if (!touchStartPosRef.current) return;
    
    const touch = e.touches[0];
    
    // Use isTapGesture to check if user has moved enough to be considered scrolling
    if (!isTapGesture(touchStartPosRef.current.x, touchStartPosRef.current.y, touch.clientX, touch.clientY, 10)) {
      isTouchMovedRef.current = true;
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  };

  // Handle touch end
  const handleTouchEnd = (e: TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // Only trigger click if it wasn't a long press and user didn't scroll
    if (!isLongPressRef.current && !isTouchMovedRef.current && touchStartPosRef.current) {
      const touch = e.changedTouches[0];
      if (isTapGesture(touchStartPosRef.current.x, touchStartPosRef.current.y, touch.clientX, touch.clientY, 10)) {
        onClick();
      }
    }
    
    touchStartPosRef.current = null;
    isLongPressRef.current = false;
    isTouchMovedRef.current = false;
    setIsLongPressHighlight(false);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const isArtist = item.type === 'artist';
  const typeLabel = getLibraryItemTypeLabel(item);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        setIsLongPressHighlight(true);
        onLongPress();
      }}
      className={`flex items-center gap-3 w-full p-3 rounded-lg transition-colors text-left min-h-[56px] cursor-pointer select-none ${isLongPressHighlight ? 'bg-white/10' : ''}`}
      data-testid="mobile-library-item"
    >
      {/* Album art - 48x48 with proper shape */}
      <div
        className={`w-12 h-12 flex-shrink-0 bg-neutral-800 overflow-hidden ${
          isArtist ? 'rounded-full' : 'rounded'
        } ${isPlaying ? 'ring-2 ring-spotify-green' : ''}`}
      >
        {item.imageUrl ? (
          <CachedImage
            src={getProxiedImageUrl(item.imageUrl, 96)}
            alt={item.name}
            className="w-full h-full object-cover"
            albumId={item.type === 'album' ? item.id : undefined}
            playlistId={item.type === 'playlist' ? item.id : undefined}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            {isArtist ? '👤' : '♪'}
          </div>
        )}
      </div>

      {/* Content - name and type indicator */}
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${isPlaying ? 'text-spotify-green' : 'text-white'}`}>
          {item.name}
        </div>
        <div className="text-sm text-white/60 truncate flex items-center gap-1">
          <span>{typeLabel} {item.subtitle && item.subtitle !== typeLabel ? `· ${item.subtitle.replace(/^(歌单|专辑|艺术家|EP|单曲)\s*·?\s*/, '')}` : ''}</span>
        </div>
      </div>
    </div>
  );
}


/**
 * LikedSongsItem component
 * Special item for liked songs entry
 * Uses useTouchClick to prevent accidental clicks during scroll
 */
interface LikedSongsItemProps {
  count: number;
  onClick: () => void;
  isPlaying?: boolean;
}

function LikedSongsItem({ count, onClick, isPlaying = false }: LikedSongsItemProps) {
  const touchHandlers = useTouchClick(onClick);
  
  return (
    <div
      {...touchHandlers}
      className="flex items-center gap-3 w-full p-3 rounded-lg active:bg-white/10 transition-colors text-left min-h-[56px] cursor-pointer select-none"
      data-testid="mobile-library-liked-songs"
    >
      {/* Gradient icon */}
      <div className={`w-12 h-12 flex-shrink-0 bg-gradient-to-br from-purple-600 to-blue-400 rounded flex items-center justify-center ${isPlaying ? 'ring-2 ring-spotify-green' : ''}`}>
        <FiHeart className="w-5 h-5 text-white" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${isPlaying ? 'text-spotify-green' : 'text-white'}`}>
          已点赞的歌曲
        </div>
        <div className="text-sm text-white/60 truncate">歌单 · {count} 首歌曲</div>
      </div>
    </div>
  );
}

/**
 * SortDropdown component
 * Dropdown for selecting sort option
 */
interface SortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
  isOpen: boolean;
  onToggle: () => void;
}

function SortDropdown({ value, onChange, isOpen, onToggle }: SortDropdownProps) {
  const currentLabel = SORT_OPTIONS.find(opt => opt.value === value)?.label || '排序';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  // Calculate menu position when opening
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={onToggle}
        className="flex items-center gap-1 px-3 py-2 text-sm text-white/80 active:text-white transition-colors min-h-[44px]"
      >
        <span>{currentLabel}</span>
        <FiChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={onToggle}
          />
          {/* Dropdown menu - fixed position to escape stacking context */}
          <div 
            className="fixed bg-neutral-800 rounded-lg shadow-xl z-[9999] min-w-[160px] py-1"
            style={{ top: menuPosition.top, right: menuPosition.right }}
          >
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  onToggle();
                }}
                className="flex items-center justify-between w-full px-4 py-3 text-sm text-left active:bg-white/10 transition-colors min-h-[44px]"
              >
                <span className={value === option.value ? 'text-spotify-green' : 'text-white'}>
                  {option.label}
                </span>
                {value === option.value && (
                  <FiCheck className="w-4 h-4 text-spotify-green" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/**
 * MobileLibraryPage component
 * Mobile-optimized library page with:
 * - Vertical list with large touch targets (Requirements: 5.1)
 * - Album art, title, and type indicator for each item (Requirements: 5.2)
 * - Long-press context menu (Requirements: 5.3)
 * - Header toolbar with sort and filter options (Requirements: 5.4)
 */
export default function MobileLibraryPage() {
  const navigate = useNavigate();
  
  // Stores
  const { getLikedSongsCount } = useLikedSongsStore();
  const { savedAlbums, fetchLibraryAlbums } = useLibraryAlbumsStore();
  const { followedArtists, fetchFollowedArtists } = useFollowedArtistsStore();
  const { playlists, fetchPlaylists, deletePlaylist, createPlaylist } = usePlaylistsStore();
  const { filter, toggleFilter, sortBy, setSortBy, setFilter } = useLibraryStore();
  const { isPlaying: isPlayerPlaying, queueSource } = usePlayerStore();
  const {
    cachedAlbumIds,
    cachedPlaylistIds,
    partialAlbumIds,
    partialPlaylistIds,
    cachedOnlyItems,
    showCachedFilter,
  } = useOfflineLibraryItems();

  // Local state
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch data on mount (only when online)
  const { isOnline } = useOnlineStatus();
  const { paddingClass: bottomPaddingClass } = useBottomPadding();
  useEffect(() => {
    if (isOnline) {
      fetchPlaylists();
      fetchLibraryAlbums();
      fetchFollowedArtists();
    }
  }, [fetchPlaylists, fetchLibraryAlbums, fetchFollowedArtists, isOnline]);

  useEffect(() => {
    if (filter === 'cached' && !showCachedFilter) {
      setFilter('all');
    }
  }, [filter, setFilter, showCachedFilter]);

  
  const filterTabs = showCachedFilter
    ? [...BASE_FILTER_TABS, { value: 'cached' as const, label: '缓存' }]
    : BASE_FILTER_TABS;

  // Convert data to LibraryItems for unified display
  const getLibraryItems = useCallback((): LibraryItem[] => {
    const items: LibraryItem[] = [];

    // Add playlists from library (user-created playlists)
    playlists.forEach((playlist: Playlist) => {
      items.push({
        type: 'playlist',
        id: playlist.id,
        name: playlist.name,
        subtitle: `歌单 · ${playlist.song_count} 首歌曲`,
        imageUrl: playlist.artwork_url,
        createdAt: playlist.created_at,
        isCached: cachedPlaylistIds.has(playlist.id),
        cacheStatus: cachedPlaylistIds.has(playlist.id)
          ? (partialPlaylistIds.has(playlist.id) ? 'partial' : 'full')
          : undefined,
      });
    });

    // Add albums from library
    savedAlbums.forEach((album: LibraryAlbum) => {
      const releaseLabel = getReleaseTypeLabel(album.release_type, album.is_single);
      items.push({
        type: 'album',
        id: album.album_id,
        name: album.album_name,
        subtitle: `${releaseLabel} · ${album.artist_name}`,
        imageUrl: album.artwork_url,
        artistId: album.artist_id,
        artistName: album.artist_name,
        releaseType: album.release_type,
        isSingle: album.is_single,
        createdAt: album.created_at,
        isCached: cachedAlbumIds.has(album.album_id),
        cacheStatus: cachedAlbumIds.has(album.album_id)
          ? (partialAlbumIds.has(album.album_id) ? 'partial' : 'full')
          : undefined,
      });
    });

    // Add followed artists
    followedArtists.forEach((artist: FollowedArtist) => {
      items.push({
        type: 'artist',
        id: artist.artist_id,
        name: artist.artist_name,
        subtitle: '艺术家',
        imageUrl: artist.artwork_url,
        createdAt: artist.created_at,
      });
    });

    if (filter === 'cached') {
      const existingKeys = new Set(
        items.map((item) => `${item.type}:${item.id}`),
      );
      items.push(
        ...cachedOnlyItems.filter(
          (item) => !existingKeys.has(`${item.type}:${item.id}`),
        ),
      );
    }

    return items;
  }, [
    cachedAlbumIds,
    cachedOnlyItems,
    cachedPlaylistIds,
    filter,
    followedArtists,
    partialAlbumIds,
    partialPlaylistIds,
    playlists,
    savedAlbums,
  ]);

  // Get filtered and sorted items
  const getDisplayItems = useCallback(() => {
    let items = getLibraryItems();
    items = filterLibraryItems(items, filter);
    // Apply search filter if searching
    if (searchQuery.trim()) {
      items = searchLibraryItems(items, searchQuery);
    }
    items = sortLibraryItems(items, sortBy);
    return items;
  }, [getLibraryItems, filter, sortBy, searchQuery]);

  const displayItems = getDisplayItems();

  // Check if liked songs is currently playing
  const isLikedSongsPlaying = useCallback((): boolean => {
    return isPlayerPlaying && queueSource.type === 'liked-songs';
  }, [isPlayerPlaying, queueSource]);

  // Check if an item is currently playing
  const isItemPlaying = useCallback((type: string, id: string): boolean => {
    return isPlayerPlaying && queueSource.type === type && queueSource.id === id;
  }, [isPlayerPlaying, queueSource]);

  // Handle liked songs click
  const handleLikedSongsClick = () => {
    navigate('/liked-songs');
  };

  // Handle item click - navigate to detail page
  const handleItemClick = (item: LibraryItem) => {
    switch (item.type) {
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

  // Handle long press - show context menu (Requirements: 5.3)
  const handleLongPress = (item: LibraryItem) => {
    setSelectedItem(item);
    setContextMenuOpen(true);
  };

  // Close context menu
  const handleCloseContextMenu = () => {
    setContextMenuOpen(false);
    setSelectedItem(null);
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    await deletePlaylist(playlistId);
    handleCloseContextMenu();
  };

  // Handle search button click - toggle search mode
  const handleSearchClick = () => {
    setIsSearching(true);
    // Focus input after state update
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Handle close search
  const handleCloseSearch = () => {
    setIsSearching(false);
    setSearchQuery('');
  };

  // Handle create playlist
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    try {
      const newPlaylist = await createPlaylist(newPlaylistName.trim());
      if (newPlaylist) {
        // Navigate to the new playlist
        navigate(`/playlist/${newPlaylist.id}`);
      }
    } catch (err) {
      console.error('Failed to create playlist:', err);
    } finally {
      setIsCreatingPlaylist(false);
      setNewPlaylistName('');
    }
  };

  // Handle create playlist button click
  const handleCreatePlaylistClick = () => {
    setIsCreatingPlaylist(true);
  };

  // Render context menu based on selected item type
  const renderContextMenu = () => {
    if (!selectedItem) return null;

    switch (selectedItem.type) {
      case 'artist':
        return (
          <MobileArtistMenu
            artist={{
              id: selectedItem.id,
              name: selectedItem.name,
              artworkUrl: selectedItem.imageUrl,
            }}
            isOpen={contextMenuOpen}
            onClose={handleCloseContextMenu}
          />
        );
      case 'album':
        return (
          <MobileAlbumMenu
            album={{
              id: selectedItem.id,
              name: selectedItem.name,
              artistId: selectedItem.artistId,
              artistName: selectedItem.artistName || '',
              artworkUrl: selectedItem.imageUrl || '',
              trackCount: 0,
            }}
            isOpen={contextMenuOpen}
            onClose={handleCloseContextMenu}
          />
        );
      case 'playlist':
        return (
          <MobilePlaylistMenu
            playlist={{
              id: selectedItem.id,
              name: selectedItem.name,
              artworkUrl: selectedItem.imageUrl,
            }}
            isOpen={contextMenuOpen}
            onClose={handleCloseContextMenu}
            onDelete={() => handleDeletePlaylist(selectedItem.id)}
          />
        );
      default:
        return null;
    }
  };

  const showLikedSongs = (filter === 'playlists' || filter === 'all') && 
    (!searchQuery.trim() || 
     '已点赞的歌曲'.toLowerCase().includes(searchQuery.toLowerCase()) ||
     'liked songs'.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-[#121212]">
      {/* Header toolbar with sort and filter options (Requirements: 5.4) */}
      {/* Fixed position to prevent overscroll animation on header */}
      <div className="fixed top-0 left-0 right-0 z-20 bg-[#121212]" style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5)' }}>
        {/* Header background with safe area */}
        <div 
          className="px-4 pb-2"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
        >
          {/* Title row with search and create buttons */}
          <div className="flex items-center justify-between mb-2">
            {isSearching ? (
              /* Search input mode */
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="搜索音乐库"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-neutral-800 text-white text-sm rounded-lg pl-10 pr-4 py-2.5 placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={handleCloseSearch}
                  className="text-white/80 hover:text-white text-sm px-2 py-2 min-w-[44px]"
                >
                  取消
                </button>
              </div>
            ) : (
              /* Normal title mode */
              <>
                <h1 className="text-2xl font-bold text-white">音乐库</h1>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSearchClick}
                    className="p-2 text-white/80 hover:text-white active:bg-white/10 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="搜索音乐库"
                  >
                    <FiSearch className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleCreatePlaylistClick}
                    className="p-2 text-white/80 hover:text-white active:bg-white/10 rounded-full transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                    aria-label="创建歌单"
                  >
                    <FiPlus className="w-5 h-5" />
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* Filter tabs + Sort dropdown in same row - hide when searching */}
          {!isSearching && (
            <div className="flex items-center gap-2">
              {/* Scrollable filter tabs */}
              <div className="flex-1 overflow-x-auto scrollbar-hide -ml-4 pl-4">
                <div className="flex items-center gap-2 pr-2">
                  {filterTabs.map((tab) => (
                    <button
                      key={tab.value}
                      onClick={() => toggleFilter(tab.value)}
                      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                        filter === tab.value
                          ? 'bg-white text-black'
                          : 'bg-neutral-800 text-white active:bg-neutral-600'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Sort dropdown - fixed position on the right with left shadow */}
              <div className="flex-shrink-0 relative">
                {/* Left shadow gradient */}
                <div className="absolute right-full top-0 bottom-0 w-6 bg-gradient-to-l from-[#121212] to-transparent pointer-events-none" />
                <div className="bg-[#121212]">
                  <SortDropdown
                    value={sortBy}
                    onChange={setSortBy}
                    isOpen={sortDropdownOpen}
                    onToggle={() => setSortDropdownOpen(!sortDropdownOpen)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Library items list */}
      {/* Bottom padding accounts for MiniPlayer + BottomNav + offline indicator */}
      {/* Top padding accounts for fixed header: safe-area + 8px + title(32px) + mb-2(8px) + tabs(44px) + pb-2(8px) + extra(8px) */}
      {/* Negative margin-top + extra padding creates extended background for overscroll */}
      <div 
        className={`flex-1 overflow-y-auto px-1 bg-[#121212] ${bottomPaddingClass}`}
        style={{ 
          paddingTop: isSearching 
            ? 'calc(env(safe-area-inset-top, 0px) + 8px + 44px + 8px + 8px + 100px)' 
            : 'calc(env(safe-area-inset-top, 0px) + 8px + 32px + 8px + 44px + 8px + 8px + 100px)',
          marginTop: '-100px'
        }}
      >
        {/* Liked Songs entry */}
        {showLikedSongs && (
          <LikedSongsItem
            count={getLikedSongsCount()}
            onClick={handleLikedSongsClick}
            isPlaying={isLikedSongsPlaying()}
          />
        )}

        {/* Library items */}
        {displayItems.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            {filter === 'playlists' && '暂无歌单'}
            {filter === 'artists' && '暂无关注的艺人'}
            {filter === 'albums' && '暂无收藏的专辑'}
            {filter === 'all' && '音乐库为空'}
          </div>
        ) : (
          <div className="space-y-1">
            {displayItems.map((item) => (
              <MobileLibraryItem
                key={`${item.type}-${item.id}`}
                item={item}
                onClick={() => handleItemClick(item)}
                onLongPress={() => handleLongPress(item)}
                isPlaying={isItemPlaying(item.type, item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {renderContextMenu()}

      {/* Create playlist bottom sheet */}
      <MobileBottomSheet
        isOpen={isCreatingPlaylist}
        onClose={() => {
          setIsCreatingPlaylist(false);
          setNewPlaylistName('');
        }}
        title="新建歌单"
      >
        <div className="px-4 py-4 pb-8">
          <input
            type="text"
            placeholder="歌单名称"
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreatePlaylist();
              }
            }}
            className="w-full bg-[#3e3e3e] text-white text-base rounded-lg px-4 py-3 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white/20 mb-4"
          />
          <div className="flex gap-3">
            <button
              onClick={() => {
                setIsCreatingPlaylist(false);
                setNewPlaylistName('');
              }}
              className="flex-1 px-4 py-3 text-sm text-gray-300 hover:text-white bg-neutral-700 rounded-full font-medium"
            >
              取消
            </button>
            <button
              onClick={handleCreatePlaylist}
              disabled={!newPlaylistName.trim()}
              className="flex-1 px-4 py-3 text-sm text-black bg-white rounded-full font-medium disabled:opacity-50"
            >
              创建
            </button>
          </div>
        </div>
      </MobileBottomSheet>
    </div>
  );
}
