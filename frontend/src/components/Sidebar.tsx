import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FiPlus, FiHeart, FiMaximize2, FiSearch } from 'react-icons/fi';
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand } from 'react-icons/tb';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { useLibraryAlbumsStore, LibraryAlbum } from '../store/libraryAlbumsStore';
import { useFollowedArtistsStore, FollowedArtist } from '../store/followedArtistsStore';
import { usePlaylistsStore } from '../store/playlistsStore';
import { usePlayerStore } from '../store/playerStore';
import { useLibraryStore, FilterTab, sortLibraryItems, filterLibraryItems, searchLibraryItems, LibraryItem } from '../store/libraryStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import LibraryItemRow, { getBackgroundClass, getTextColorClass, NowPlayingIcon } from './LibraryItemRow';
import { ImageType } from '../utils/dragLink';
import { getPlaylist, getAlbumDetail, getArtistDetail, PlaylistWithDates } from '../api';
import { Song } from '../types';
import PlaylistEditModal, { PlaylistUpdateData } from './PlaylistEditModal';
import { savePlaylistEdit } from '../utils/playlistEdit';
import { buildArtistQueueSource, getLibrarySongs } from '../utils/artistPage';
import { useOfflineLibraryItems } from '../hooks/useOfflineLibraryItems';

// Play icon SVG component for consistency
const PlayIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);

// 音乐库图标组件 - 两条竖线 + 空心方块 (IID 样式)
const LibraryIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    {/* 第一条竖线 */}
    <rect x="3" y="3" width="2.5" height="18" rx="1" />
    {/* 第二条竖线 */}
    <rect x="8" y="3" width="2.5" height="18" rx="1" />
    {/* 空心方块 - 调整位置使视觉高度一致 */}
    <rect x="14" y="4" width="7" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onSelectPlaylist: (id: string) => void;
  onSelectArtist?: (id: string) => void;
  onSelectAlbum?: (id: string) => void;
  width?: number;
  onCollapse?: () => void;
}

export default function Sidebar({ 
  currentPage, 
  onNavigate, 
  onSelectPlaylist,
  onSelectArtist,
  onSelectAlbum,
  width = 280,
  onCollapse,
}: SidebarProps) {
  // Mini 模式：宽度小于 100px 时只显示图标
  const isMini = width < 100;
  const [showCollapseIcon, setShowCollapseIcon] = useState(false);
  const [showCollapseTooltip, setShowCollapseTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const libraryTitleRef = useRef<HTMLDivElement>(null);
  const tooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Tooltip 显示/隐藏逻辑 - 带超时自动隐藏，防止触摸设备上 tooltip 卡住
  const showTooltip = useCallback((position: { x: number; y: number }) => {
    // 清除之前的超时
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    setTooltipPosition(position);
    setShowCollapseTooltip(true);
    // 3秒后自动隐藏 tooltip
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowCollapseTooltip(false);
    }, 3000);
  }, []);
  
  const hideTooltip = useCallback(() => {
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setShowCollapseTooltip(false);
  }, []);
  
  // 清理 tooltip 超时
  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);
  
  // Stores
  const { getLikedSongsCount, likedSongs } = useLikedSongsStore();
  const { savedAlbums } = useLibraryAlbumsStore();
  const { followedArtists } = useFollowedArtistsStore();
  const { playlists, createPlaylist, fetchPlaylists, deletePlaylist } = usePlaylistsStore();
  const { setQueue, isPlaying: isPlayerPlaying, pause, play, queueSource } = usePlayerStore();
  const { filter, toggleFilter, sortBy, searchQuery, setSearchQuery, setExpanded, setFilter } = useLibraryStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const {
    cachedAlbumIds,
    cachedPlaylistIds,
    partialAlbumIds,
    partialPlaylistIds,
    cachedOnlyItems,
    showCachedFilter,
  } = useOfflineLibraryItems();
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [likedSongsHovered, setLikedSongsHovered] = useState(false);
  
  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistWithDates | null>(null);

  // Helper function to determine if an item is active based on currentPage
  const isItemActive = useCallback((type: string, id: string): boolean => {
    switch (type) {
      case 'playlist':
        return currentPage === `playlist-${id}`;
      case 'album':
        return currentPage === `album-${id}`;
      case 'artist':
        return currentPage === `artist-${id}`;
      default:
        return false;
    }
  }, [currentPage]);

  // Helper function to determine if an item is currently playing
  // Only returns true if the queue was started from this specific item
  const isItemPlaying = useCallback((type: string, id: string): boolean => {
    if (!isPlayerPlaying) return false;
    // Check if the queue source matches this item
    return queueSource.type === type && queueSource.id === id;
  }, [isPlayerPlaying, queueSource]);

  // Helper function to determine if an item is the current queue source (regardless of play state)
  const isItemCurrentSource = useCallback((type: string, id: string): boolean => {
    return queueSource.type === type && queueSource.id === id;
  }, [queueSource]);

  // Helper function to determine if liked songs are currently playing
  const isLikedSongsPlaying = useCallback((): boolean => {
    if (!isPlayerPlaying) return false;
    // Check if the queue source is liked-songs
    return queueSource.type === 'liked-songs';
  }, [isPlayerPlaying, queueSource]);

  // Helper function to determine if liked songs is the current queue source (regardless of play state)
  const isLikedSongsCurrentSource = useCallback((): boolean => {
    return queueSource.type === 'liked-songs';
  }, [queueSource]);

  // onPlay callback for playlists
  const handlePlayPlaylist = useCallback(async (playlistId: string) => {
    // Record play for recently played sorting
    recordPlay('playlist', playlistId);
    // If this playlist is already the current source, just resume playback
    if (isItemCurrentSource('playlist', playlistId)) {
      play();
      return;
    }
    try {
      const playlist = await getPlaylist(playlistId);
      if (playlist.songs && playlist.songs.length > 0) {
        setQueue(playlist.songs, 0, { type: 'playlist', id: playlistId, name: playlist.name });
      }
    } catch (error) {
      console.error('Failed to play playlist:', error);
    }
  }, [setQueue, isItemCurrentSource, play, recordPlay]);

  // onPlay callback for albums
  const handlePlayAlbum = useCallback(async (albumId: string) => {
    // Record play for recently played sorting
    recordPlay('album', albumId);
    // If this album is already the current source, just resume playback
    if (isItemCurrentSource('album', albumId)) {
      play();
      return;
    }
    try {
      const album = await getAlbumDetail(albumId);
      if (album.tracks && album.tracks.length > 0) {
        setQueue(album.tracks, 0, { type: 'album', id: albumId, name: album.name });
      }
    } catch (error) {
      console.error('Failed to play album:', error);
    }
  }, [setQueue, isItemCurrentSource, play, recordPlay]);

  // onPlay callback for artists
  const handlePlayArtist = useCallback(async (artistId: string) => {
    // Record play for recently played sorting
    recordPlay('artist', artistId);
    // If this artist is already the current source, just resume playback
    if (isItemCurrentSource('artist', artistId)) {
      play();
      return;
    }
      try {
        const artist = await getArtistDetail(artistId);
        const songs = getLibrarySongs(artist);
        if (songs.length > 0) {
          setQueue(songs, 0, buildArtistQueueSource(artistId, artist.name, 'library'));
        }
      } catch (error) {
      console.error('Failed to play artist:', error);
    }
  }, [setQueue, isItemCurrentSource, play, recordPlay]);

  // onPlay callback for liked songs
  const handlePlayLikedSongs = useCallback(() => {
    // Record play for recently played sorting
    recordPlay('liked-songs', 'liked-songs');
    if (likedSongs.length > 0) {
      const songs: Song[] = likedSongs.map(ls => ({
        id: ls.song_id,
        name: ls.song_name,
        artistName: ls.artist_name,
        artistId: ls.artist_id,
        albumName: ls.album_name,
        albumId: ls.album_id,
        duration: ls.duration,
        artworkUrl: ls.artwork_url,
        hasLyrics: ls.has_lyrics,
      }));
      setQueue(songs, 0, { type: 'liked-songs', id: null, name: '喜欢的歌曲' });
    }
  }, [likedSongs, setQueue, recordPlay]);

  // onPause callback
  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  useEffect(() => {
    if (filter === 'cached' && !showCachedFilter) {
      setFilter('all');
    }
  }, [filter, setFilter, showCachedFilter]);

  // Sync local search with store
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearchQuery, setSearchQuery]);

  // 处理滚动条显示/隐藏逻辑
  const handleScrollAreaEnter = () => {
    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = null;
    }
    setShowScrollbar(true);
  };

  const handleScrollAreaLeave = () => {
    scrollbarTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false);
    }, 1800);
  };

  // 清理 timeout
  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    try {
      await createPlaylist(newPlaylistName);
      setNewPlaylistName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    try {
      // If the deleted playlist is currently being viewed, navigate away
      if (currentPage === `playlist-${playlistId}`) {
        onNavigate('liked-songs');
      }
      await deletePlaylist(playlistId);
    } catch (error) {
      console.error('Failed to delete playlist:', error);
    }
  };

  // Handle edit playlist from context menu
  const handleEditPlaylist = async (playlistId: string) => {
    try {
      const playlist = await getPlaylist(playlistId);
      setEditingPlaylist(playlist);
      setEditModalOpen(true);
    } catch (error) {
      console.error('Failed to load playlist for editing:', error);
    }
  };

  // Handle save from edit modal
  const handleEditModalSave = async (updates: PlaylistUpdateData) => {
    if (!editingPlaylist) return;

    await savePlaylistEdit(editingPlaylist.id, updates);

    // Refresh playlists
    fetchPlaylists();
  };

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'playlists', label: '歌单' },
    { id: 'artists', label: '艺人' },
    { id: 'albums', label: '专辑' },
    ...(showCachedFilter ? [{ id: 'cached' as const, label: '缓存' }] : []),
  ];

  // Convert data to LibraryItems for unified display
  const getLibraryItems = (): LibraryItem[] => {
    const items: LibraryItem[] = [];

    // Add playlists from library (user-created playlists)
    playlists.forEach(playlist => {
      items.push({
        type: 'playlist',
        id: playlist.id,
        name: playlist.name,
        subtitle: `歌单 • ${playlist.song_count} 首歌曲`,
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
      items.push({
        type: 'album',
        id: album.album_id,
        name: album.album_name,
        subtitle: `专辑 • ${album.artist_name}`,
        imageUrl: album.artwork_url,
        artistId: album.artist_id,
        artistName: album.artist_name,
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
  };

  // Get filtered and sorted items
  const getDisplayItems = () => {
    let items = getLibraryItems();
    items = filterLibraryItems(items, filter);
    items = searchLibraryItems(items, searchQuery);
    items = sortLibraryItems(items, sortBy);
    return items;
  };

  const displayItems = getDisplayItems();


  // Mini 模式布局
  if (isMini) {
    return (
      <aside className="w-full h-full bg-black flex flex-col p-2 relative">
        {/* 打开音乐库 Tooltip */}
        {showCollapseTooltip && createPortal(
          <div 
            className="fixed bg-[#282828] text-white text-sm font-medium px-3 py-2 rounded-md shadow-lg whitespace-nowrap z-[9999] pointer-events-none"
            style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
          >
            打开音乐库
          </div>,
          document.body
        )}
        <div className="flex-1 bg-neutral-900 rounded-lg flex flex-col overflow-hidden">
          {/* Mini Header - 音乐库图标 */}
          <div className="flex flex-col items-center py-4 gap-3">
            {/* 音乐库图标 - 悬浮时变成展开图标 */}
            <div 
              ref={libraryTitleRef}
              className="text-spotify-light-gray hover:text-white cursor-pointer transition-colors group"
              onMouseEnter={() => {
                if (libraryTitleRef.current) {
                  const rect = libraryTitleRef.current.getBoundingClientRect();
                  showTooltip({ x: rect.right + 8, y: rect.top });
                }
              }}
              onMouseLeave={hideTooltip}
              onClick={() => {
                hideTooltip();
                onCollapse?.();
              }}
            >
              <LibraryIcon className="w-6 h-6 group-hover:hidden" />
              <TbLayoutSidebarLeftExpand className="w-6 h-6 hidden group-hover:block" />
            </div>
            {/* 创建歌单按钮 */}
            <button
              onClick={() => setIsCreating(true)}
              className="p-2 rounded-full hover:bg-spotify-gray text-spotify-light-gray hover:text-white transition-colors"
              title="创建歌单"
            >
              <FiPlus size={20} />
            </button>
          </div>

          {/* Mini Content */}
          <OverlayScrollbarsComponent
            className={`flex-1 ${showScrollbar ? 'scrollbar-visible' : ''}`}
            onMouseEnter={handleScrollAreaEnter}
            onMouseLeave={handleScrollAreaLeave}
            options={{ 
              scrollbars: { 
                theme: 'os-theme-light',
                autoHide: 'move',
                clickScroll: true
              } 
            }}
          >
          <div className="py-2 flex flex-col items-center gap-2">
            {(filter === 'playlists' || filter === 'all') && (
              <button
                onClick={() => onNavigate('liked-songs')}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (isLikedSongsPlaying()) {
                    handlePause();
                  } else if (isLikedSongsCurrentSource()) {
                    play();
                  } else {
                    handlePlayLikedSongs();
                  }
                }}
                onMouseEnter={() => setLikedSongsHovered(true)}
                onMouseLeave={() => setLikedSongsHovered(false)}
                className={`rounded-lg transition-colors ${
                  getBackgroundClass(currentPage === 'liked-songs', likedSongsHovered)
                }`}
                title="已点赞的歌曲 (双击播放)"
              >
                <div className="relative">
                  <div className={`w-[52px] h-[52px] bg-gradient-to-br from-purple-600 to-blue-400 rounded flex items-center justify-center ${
                    isLikedSongsPlaying() ? 'ring-2 ring-spotify-green' : ''
                  }`}>
                    <FiHeart className="w-5 h-5 text-white" />
                  </div>
                </div>
              </button>
            )}

            {/* Library Items - Only show covers */}
            {displayItems.map((item) => (
              <LibraryItemRow
                key={`${item.type}-${item.id}`}
                type={item.type as ImageType}
                id={item.id}
                name={item.name}
                subtitle={item.subtitle || ''}
                imageUrl={item.imageUrl}
                onClick={() => {
                  if (item.type === 'playlist') {
                    onSelectPlaylist(item.id);
                  } else if (item.type === 'album' && onSelectAlbum) {
                    onSelectAlbum(item.id);
                  } else if (item.type === 'artist' && onSelectArtist) {
                    onSelectArtist(item.id);
                  }
                }}
                artistData={item.type === 'artist' ? { id: item.id, name: item.name, artworkUrl: item.imageUrl } : undefined}
                albumData={item.type === 'album' ? { id: item.id, name: item.name, artistId: item.artistId, artistName: item.artistName || item.subtitle || '', artworkUrl: item.imageUrl || '', trackCount: 0 } : undefined}
                playlistData={item.type === 'playlist' ? { id: item.id, name: item.name } : undefined}
                onEdit={item.type === 'playlist' ? () => handleEditPlaylist(item.id) : undefined}
                onDelete={item.type === 'playlist' ? () => handleDeletePlaylist(item.id) : undefined}
                isActive={isItemActive(item.type, item.id)}
                isPlaying={isItemPlaying(item.type, item.id)}
                onPlay={
                  item.type === 'playlist' ? () => handlePlayPlaylist(item.id) :
                  item.type === 'album' ? () => handlePlayAlbum(item.id) :
                  item.type === 'artist' ? () => handlePlayArtist(item.id) :
                  undefined
                }
                onPause={handlePause}
                mini
              />
            ))}
          </div>
          </OverlayScrollbarsComponent>
        </div>

        {/* Playlist Edit Modal */}
        {editingPlaylist && (
          <PlaylistEditModal
            playlist={{
              id: editingPlaylist.id,
              name: editingPlaylist.name,
              description: editingPlaylist.description,
              artwork_url: editingPlaylist.artwork_url,
            }}
            defaultCoverUrl={editingPlaylist.songs.length > 0 ? editingPlaylist.songs[0].artworkUrl : undefined}
            isOpen={editModalOpen}
            onClose={() => {
              setEditModalOpen(false);
              setEditingPlaylist(null);
            }}
            onSave={handleEditModalSave}
          />
        )}
      </aside>
    );
  }

  // 正常模式布局
  return (
    <aside className="w-full h-full bg-black flex flex-col p-2 relative">
      {/* Library Card */}
      <div 
        className="flex-1 bg-neutral-900 rounded-lg flex flex-col overflow-hidden group/library"
        onMouseEnter={() => setShowCollapseIcon(true)}
        onMouseLeave={() => setShowCollapseIcon(false)}
      >
      {/* Music Library Header */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          {/* 音乐库标题区域 - 悬停显示tooltip */}
          <div 
            ref={libraryTitleRef}
            className="relative flex items-center cursor-pointer"
            onMouseEnter={() => {
              if (libraryTitleRef.current) {
                const rect = libraryTitleRef.current.getBoundingClientRect();
                showTooltip({ x: rect.left, y: rect.top - 40 });
              }
            }}
            onMouseLeave={hideTooltip}
            onClick={() => {
              hideTooltip();
              onCollapse?.();
            }}
          >
            {/* 图标占位容器 - 先展开宽度，文字移动到位 */}
            <div 
              className={`transition-[width] duration-150 ease-out ${
                showCollapseIcon ? 'w-7' : 'w-0'
              }`}
            >
              {/* 折叠图标 - 延迟从卡片左边缘滑入 */}
              <TbLayoutSidebarLeftCollapse 
                className="w-5 h-5 text-white transition-all duration-200 ease-out"
                style={{ 
                  opacity: showCollapseIcon ? 1 : 0,
                  transform: showCollapseIcon ? 'translateX(0)' : 'translateX(-24px)',
                  transitionDelay: showCollapseIcon ? '120ms' : '0ms'
                }}
              />
            </div>
            <h2 className="text-white font-semibold">音乐库</h2>
          </div>
          {/* 折叠音乐库 Tooltip - 使用 Portal 渲染到 body */}
          {showCollapseTooltip && createPortal(
            <div 
              className="fixed bg-[#282828] text-white text-sm font-medium px-3 py-2 rounded-md shadow-lg whitespace-nowrap z-[9999] pointer-events-none"
              style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
            >
              折叠音乐库
            </div>,
            document.body
          )}
          
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsCreating(true);
              }}
              className="p-1.5 rounded-full hover:bg-spotify-gray text-spotify-light-gray hover:text-white transition-colors"
              title="创建歌单"
            >
              <FiPlus size={18} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(true);
              }}
              className="p-1.5 rounded-full hover:bg-spotify-gray text-spotify-light-gray hover:text-white transition-colors"
              title="展开音乐库"
            >
              <FiMaximize2 size={16} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-3">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => toggleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-white text-black'
                  : 'bg-spotify-gray text-white hover:bg-spotify-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-spotify-light-gray" size={14} />
          <input
            type="text"
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            placeholder="在音乐库中搜索"
            className="w-full pl-8 pr-2 py-1.5 bg-spotify-gray/50 rounded text-sm text-white placeholder-spotify-light-gray focus:outline-none focus:bg-spotify-gray"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 border-t border-spotify-gray/30" />

      {/* Content Area */}
      <OverlayScrollbarsComponent
        className={`flex-1 ${showScrollbar ? 'scrollbar-visible' : ''}`}
        onMouseEnter={handleScrollAreaEnter}
        onMouseLeave={handleScrollAreaLeave}
        options={{ 
          scrollbars: { 
            theme: 'os-theme-light',
            autoHide: 'move',
            clickScroll: true
          } 
        }}
      >
      <div className="px-2 py-2">
        {(filter === 'playlists' || filter === 'all') && (
          <button
            onClick={() => onNavigate('liked-songs')}
            onMouseEnter={() => setLikedSongsHovered(true)}
            onMouseLeave={() => setLikedSongsHovered(false)}
            className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${
              getBackgroundClass(currentPage === 'liked-songs', likedSongsHovered)
            }`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-400 rounded flex items-center justify-center">
                <FiHeart className="w-5 h-5 text-white" />
              </div>
              {/* Play/Pause overlay on hover */}
              {likedSongsHovered && likedSongs.length > 0 && (
                <div
                  className="absolute inset-0 bg-black/50 flex items-center justify-center rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isLikedSongsPlaying()) {
                      handlePause();
                    } else if (isLikedSongsCurrentSource()) {
                      // Resume playback when source matches but paused
                      play();
                    } else {
                      handlePlayLikedSongs();
                    }
                  }}
                >
                  {isLikedSongsPlaying() ? (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <PlayIcon className="w-6 h-6 text-white" />
                  )}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className={`${getTextColorClass(isLikedSongsPlaying())} font-medium truncate`}>已点赞的歌曲</p>
              <p className="text-sm text-spotify-light-gray truncate">歌单 • {getLikedSongsCount()} 首歌曲</p>
            </div>
            {isLikedSongsPlaying() && <NowPlayingIcon className="w-4 h-4 flex-shrink-0 mr-2" />}
          </button>
        )}

        {/* Create playlist input */}
        {isCreating && (
          <div className="px-2 mb-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
              onBlur={() => !newPlaylistName && setIsCreating(false)}
              placeholder="歌单名称..."
              className="w-full px-3 py-2 bg-spotify-gray rounded text-sm text-white placeholder-spotify-light-gray focus:outline-none focus:ring-1 focus:ring-spotify-green"
              autoFocus
            />
          </div>
        )}

        {/* Library Items */}
        <div className="space-y-1">
          {displayItems.length === 0 ? (
            <div className="text-center py-8 text-spotify-light-gray text-sm">
              {filter === 'playlists' && '暂无歌单'}
              {filter === 'artists' && '暂无关注的艺人'}
              {filter === 'albums' && '暂无收藏的专辑'}
            </div>
          ) : (
            displayItems.map((item) => (
              <LibraryItemRow
                key={`${item.type}-${item.id}`}
                type={item.type as ImageType}
                id={item.id}
                name={item.name}
                subtitle={item.subtitle || ''}
                imageUrl={item.imageUrl}
                onClick={() => {
                  if (item.type === 'playlist') {
                    onSelectPlaylist(item.id);
                  } else if (item.type === 'album' && onSelectAlbum) {
                    onSelectAlbum(item.id);
                  } else if (item.type === 'artist' && onSelectArtist) {
                    onSelectArtist(item.id);
                  }
                }}
                artistData={item.type === 'artist' ? { id: item.id, name: item.name, artworkUrl: item.imageUrl } : undefined}
                albumData={item.type === 'album' ? { id: item.id, name: item.name, artistId: item.artistId, artistName: item.artistName || item.subtitle || '', artworkUrl: item.imageUrl || '', trackCount: 0 } : undefined}
                playlistData={item.type === 'playlist' ? { id: item.id, name: item.name } : undefined}
                onEdit={item.type === 'playlist' ? () => handleEditPlaylist(item.id) : undefined}
                onDelete={item.type === 'playlist' ? () => handleDeletePlaylist(item.id) : undefined}
                isActive={isItemActive(item.type, item.id)}
                isPlaying={isItemPlaying(item.type, item.id)}
                onPlay={
                  item.type === 'playlist' ? () => handlePlayPlaylist(item.id) :
                  item.type === 'album' ? () => handlePlayAlbum(item.id) :
                  item.type === 'artist' ? () => handlePlayArtist(item.id) :
                  undefined
                }
                onPause={handlePause}
              />
            ))
          )}
        </div>
      </div>
      </OverlayScrollbarsComponent>
      </div>

      {/* Playlist Edit Modal */}
      {editingPlaylist && (
        <PlaylistEditModal
          playlist={{
            id: editingPlaylist.id,
            name: editingPlaylist.name,
            description: editingPlaylist.description,
            artwork_url: editingPlaylist.artwork_url,
          }}
          defaultCoverUrl={editingPlaylist.songs.length > 0 ? editingPlaylist.songs[0].artworkUrl : undefined}
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditingPlaylist(null);
          }}
          onSave={handleEditModalSave}
        />
      )}
    </aside>
  );
}
