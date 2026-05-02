import { useState, useEffect, useCallback, useRef } from 'react';
import { FiSearch, FiHeart, FiGrid, FiList, FiPlus } from 'react-icons/fi';
import { TbArrowsDiagonalMinimize2 } from 'react-icons/tb';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { useLibraryAlbumsStore, LibraryAlbum } from '../store/libraryAlbumsStore';
import { useFollowedArtistsStore, FollowedArtist, ArtistInfo } from '../store/followedArtistsStore';
import { usePlaylistsStore, Playlist } from '../store/playlistsStore';
import { usePlayerStore } from '../store/playerStore';
import { useLibraryStore, FilterTab, ViewMode, sortLibraryItems, filterLibraryItems, searchLibraryItems, LibraryItem } from '../store/libraryStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import SortDropdown from './SortDropdown';
import { getPlaylist, getAlbumDetail, getArtistDetail, PlaylistWithDates } from '../api';
import { Song, Album } from '../types';
import { isItemActive as checkItemActive, isValidPlaylistName } from '../utils/libraryActiveState';
import LibraryItemRow, { getBackgroundClass, getTextColorClass, NowPlayingIcon } from './LibraryItemRow';
import LibraryItemCard from './LibraryItemCard';
import { ImageType } from '../utils/dragLink';
import PlaylistEditModal, { PlaylistUpdateData } from './PlaylistEditModal';
import { savePlaylistEdit } from '../utils/playlistEdit';
import { buildArtistQueueSource, getLibrarySongs } from '../utils/artistPage';
import { getReleaseTypeLabel, matchesReleaseTypeFilter, type ReleaseFilter } from '../utils/releaseType';
import { useOfflineLibraryItems } from '../hooks/useOfflineLibraryItems';

// Liked Songs Row component for special rendering (list/compact view)
interface LikedSongsRowProps {
  subtitle: string;
  onClick: () => void;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  hasLikedSongs: boolean;
}

function LikedSongsRow({
  subtitle,
  onClick,
  isActive,
  isPlaying,
  onPlay,
  onPause,
  hasLikedSongs,
}: LikedSongsRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const backgroundClass = getBackgroundClass(isActive, isHovered);
  const textColorClass = getTextColorClass(isPlaying);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${backgroundClass}`}
    >
      <div className="relative flex-shrink-0">
        <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-400 rounded flex items-center justify-center">
          <FiHeart className="w-5 h-5 text-white" />
        </div>
        {/* Play/Pause overlay on hover */}
        {isHovered && hasLikedSongs && (
          <div
            className="absolute inset-0 bg-black/50 flex items-center justify-center rounded"
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) {
                onPause();
              } else {
                onPlay();
              }
            }}
          >
            {isPlaying ? (
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className={`${textColorClass} font-medium truncate`}>已点赞的歌曲</p>
        <p className="text-sm text-spotify-light-gray truncate">{subtitle}</p>
      </div>
      {isPlaying && <NowPlayingIcon className="w-4 h-4 flex-shrink-0 mr-2" />}
    </button>
  );
}

// Liked Songs Card component for grid view
interface LikedSongsCardProps {
  subtitle: string;
  onClick: () => void;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  hasLikedSongs: boolean;
}

function LikedSongsCard({
  subtitle,
  onClick,
  isActive,
  isPlaying,
  onPlay,
  onPause,
  hasLikedSongs,
}: LikedSongsCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const backgroundClass = getBackgroundClass(isActive, isHovered);
  const textColorClass = getTextColorClass(isPlaying);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex flex-col p-4 rounded-lg transition-colors cursor-pointer ${backgroundClass || 'hover:bg-spotify-dark'}`}
    >
      <div className="relative w-full aspect-square mb-3">
        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-400 rounded-lg flex items-center justify-center">
          <FiHeart className="w-10 h-10 text-white" />
        </div>
        {/* Play/Pause button - slides up on hover like AlbumCard */}
        {hasLikedSongs && (
          <button
            className={`absolute bottom-2 right-2 w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-xl transition-all duration-200 hover:scale-105 ${
              isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) {
                onPause();
              } else {
                onPlay();
              }
            }}
          >
            {isPlaying ? (
              <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4l15 8-15 8V4z" />
              </svg>
            )}
          </button>
        )}
      </div>
      <div className="flex items-center justify-between w-full gap-2">
        <p className={`${textColorClass} font-medium truncate text-left`}>已点赞的歌曲</p>
        {isPlaying && <NowPlayingIcon className="w-4 h-4 flex-shrink-0" />}
      </div>
      <p className="text-sm text-spotify-light-gray truncate w-full text-left">{subtitle}</p>
    </div>
  );
}

interface ExpandedLibraryPageProps {
  onBack: () => void;
  onSelectPlaylist: (id: string) => void;
  onSelectAlbum?: (id: string) => void;
  onSelectArtist?: (id: string) => void;
  onNavigateToLikedSongs: () => void;
  isExiting?: boolean;
  // New props for active state and navigation
  currentPage: string;
  onNavigate: (page: string) => void;
}

export default function ExpandedLibraryPage({
  onBack,
  onSelectPlaylist,
  onSelectAlbum,
  onSelectArtist,
  onNavigateToLikedSongs,
  isExiting = false,
  currentPage,
  onNavigate,
}: ExpandedLibraryPageProps) {
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [albumReleaseFilter, setAlbumReleaseFilter] = useState<ReleaseFilter>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingPlaylist, setEditingPlaylist] = useState<PlaylistWithDates | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Stores
  const { getLikedSongsCount, likedSongs } = useLikedSongsStore();
  const { savedAlbums } = useLibraryAlbumsStore();
  const { followedArtists } = useFollowedArtistsStore();
  const { playlists, fetchPlaylists, createPlaylist, deletePlaylist } = usePlaylistsStore();
  const { setQueue, isPlaying: isPlayerPlaying, pause, play, queueSource } = usePlayerStore();
  const { filter, toggleFilter, sortBy, searchQuery, setSearchQuery, viewMode, setViewMode, setExpanded, setFilter } = useLibraryStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const {
    cachedAlbumIds,
    cachedPlaylistIds,
    partialAlbumIds,
    partialPlaylistIds,
    cachedOnlyItems,
    showCachedFilter,
  } = useOfflineLibraryItems();
  
  // Scrollbar visibility control
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollbarTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScrollbarMouseEnter = useCallback(() => {
    if (scrollbarTimeoutRef.current) {
      clearTimeout(scrollbarTimeoutRef.current);
      scrollbarTimeoutRef.current = null;
    }
    setShowScrollbar(true);
  }, []);

  const handleScrollbarMouseLeave = useCallback(() => {
    scrollbarTimeoutRef.current = setTimeout(() => {
      setShowScrollbar(false);
    }, 1800);
  }, []);

  // Cleanup scrollbar timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollbarTimeoutRef.current) {
        clearTimeout(scrollbarTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to determine if an item is active based on currentPage
  const isItemActive = useCallback((type: string, id: string): boolean => {
    return checkItemActive(type, id, currentPage);
  }, [currentPage]);

  // Helper function to determine if an item is currently playing
  const isItemPlaying = useCallback((type: string, id: string): boolean => {
    if (!isPlayerPlaying) return false;
    return queueSource.type === type && queueSource.id === id;
  }, [isPlayerPlaying, queueSource]);

  // Helper function to determine if liked songs are currently playing
  const isLikedSongsPlaying = useCallback((): boolean => {
    if (!isPlayerPlaying) return false;
    return queueSource.type === 'liked-songs';
  }, [isPlayerPlaying, queueSource]);

  // Helper function to determine if an item is the current queue source (regardless of play state)
  const isItemCurrentSource = useCallback((type: string, id: string): boolean => {
    return queueSource.type === type && queueSource.id === id;
  }, [queueSource]);

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
    // If liked songs is already the current source, just resume playback
    if (isLikedSongsCurrentSource()) {
      play();
      return;
    }
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
  }, [likedSongs, setQueue, isLikedSongsCurrentSource, play, recordPlay]);

  // onPause callback
  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  // Create playlist handler
  const handleCreatePlaylist = async () => {
    if (!isValidPlaylistName(newPlaylistName)) {
      setIsCreating(false);
      setNewPlaylistName('');
      return;
    }
    
    try {
      await createPlaylist(newPlaylistName);
      setNewPlaylistName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create playlist:', error);
    }
  };

  // Delete playlist handler
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

  // Edit playlist handler
  const handleEditPlaylist = async (playlistId: string) => {
    try {
      const playlist = await getPlaylist(playlistId);
      setEditingPlaylist(playlist);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error('Failed to get playlist for editing:', error);
    }
  };

  // Save playlist edits handler
  const handleSavePlaylistEdit = async (updates: PlaylistUpdateData) => {
    if (!editingPlaylist) return;

    await savePlaylistEdit(editingPlaylist.id, updates);

    setIsEditModalOpen(false);
    setEditingPlaylist(null);
  };

  useEffect(() => {
    setExpanded(true);
    fetchPlaylists();
    return () => setExpanded(false);
  }, [setExpanded, fetchPlaylists]);

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

  const baseFilterTabs: { id: FilterTab; label: string }[] = [
    { id: 'playlists', label: '歌单' },
    { id: 'artists', label: '艺人' },
    { id: 'albums', label: '专辑' },
  ];

  const filterTabs = showCachedFilter
    ? [...baseFilterTabs, { id: 'cached' as const, label: '缓存' }]
    : baseFilterTabs;
  const albumReleaseTabs: { id: ReleaseFilter; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'album', label: '专辑' },
    { id: 'ep', label: 'EP' },
    { id: 'single', label: '单曲' },
  ];

  const viewModes: { id: ViewMode; icon: React.ReactNode }[] = [
    { id: 'list', icon: <FiList size={18} /> },
    { id: 'grid', icon: <FiGrid size={18} /> },
  ];


  // Extended LibraryItem with original data for context menus
  interface ExtendedLibraryItem extends LibraryItem {
    artistData?: ArtistInfo;
    albumData?: Album;
    playlistData?: { id: string; name: string };
  }

  // Convert data to LibraryItems for unified display
  const getLibraryItems = (): ExtendedLibraryItem[] => {
    const items: ExtendedLibraryItem[] = [];

    // Add Liked Songs as a regular library item (not cached)
    items.push({
      type: 'liked-songs',
      id: 'liked-songs',
      name: '已点赞的歌曲',
      subtitle: `歌单 • ${getLikedSongsCount()} 首歌曲`,
      imageUrl: undefined, // Will use gradient placeholder
      createdAt: new Date().toISOString(),
    });

    // Add playlists from library
    playlists.forEach((playlist: Playlist) => {
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
        playlistData: { id: playlist.id, name: playlist.name },
      });
    });

    // Add albums from library
    savedAlbums.forEach((album: LibraryAlbum) => {
      const releaseLabel = getReleaseTypeLabel(album.release_type, album.is_single);
      items.push({
        type: 'album',
        id: album.album_id,
        name: album.album_name,
        subtitle: `${releaseLabel} • ${album.artist_name}`,
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
        albumData: {
          id: album.album_id,
          name: album.album_name,
          artistId: album.artist_id,
          artistName: album.artist_name,
          artworkUrl: album.artwork_url,
          releaseDate: album.release_date,
          trackCount: album.track_count,
          releaseType: album.release_type,
          isSingle: album.is_single,
        },
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
        artistData: {
          id: artist.artist_id,
          name: artist.artist_name,
          artworkUrl: artist.artwork_url,
        },
      });
    });

    if (filter === 'cached') {
      const existingKeys = new Set(
        items.map((item) => `${item.type}:${item.id}`),
      );
      items.push(
        ...cachedOnlyItems
          .filter((item) => !existingKeys.has(`${item.type}:${item.id}`))
          .map((item) => {
            if (item.type === 'album') {
              return {
                ...item,
                albumData: {
                  id: item.id,
                  name: item.name,
                  artistId: item.artistId,
                  artistName: item.artistName || '',
                  artworkUrl: item.imageUrl || '',
                  trackCount: 0,
                },
              } as ExtendedLibraryItem;
            }

            if (item.type === 'playlist') {
              return {
                ...item,
                playlistData: { id: item.id, name: item.name },
              } as ExtendedLibraryItem;
            }

            return item as ExtendedLibraryItem;
          }),
      );
    }

    return items;
  };

  // Get filtered and sorted items
  const getDisplayItems = (): ExtendedLibraryItem[] => {
    let items = getLibraryItems();
    items = filterLibraryItems(items, filter) as ExtendedLibraryItem[];
    if (filter === 'albums') {
      items = items.filter(
        (item) =>
          item.type !== 'album' ||
          matchesReleaseTypeFilter(item.releaseType, item.isSingle, albumReleaseFilter)
      );
    }
    items = searchLibraryItems(items, searchQuery) as ExtendedLibraryItem[];
    items = sortLibraryItems(items, sortBy) as ExtendedLibraryItem[];
    return items;
  };

  const displayItems = getDisplayItems();

  const renderItem = (item: ExtendedLibraryItem) => {
    const handleClick = () => {
      if (item.type === 'liked-songs') {
        onNavigateToLikedSongs();
      } else if (item.type === 'playlist') {
        onSelectPlaylist(item.id);
      } else if (item.type === 'album' && onSelectAlbum) {
        onSelectAlbum(item.id);
      } else if (item.type === 'artist' && onSelectArtist) {
        onSelectArtist(item.id);
      }
    };

    // Get play/pause handlers based on item type
    const getPlayHandler = () => {
      switch (item.type) {
        case 'playlist': return () => handlePlayPlaylist(item.id);
        case 'album': return () => handlePlayAlbum(item.id);
        case 'artist': return () => handlePlayArtist(item.id);
        case 'liked-songs': return handlePlayLikedSongs;
        default: return undefined;
      }
    };

    // Grid view - use LibraryItemCard for non-liked-songs items
    if (viewMode === 'grid') {
      // Liked songs in grid view - use LikedSongsCard component
      if (item.type === 'liked-songs') {
        return (
          <LikedSongsCard
            key="liked-songs-grid"
            subtitle={item.subtitle}
            onClick={handleClick}
            isActive={isItemActive('liked-songs', 'liked-songs')}
            isPlaying={isLikedSongsPlaying()}
            onPlay={handlePlayLikedSongs}
            onPause={handlePause}
            hasLikedSongs={likedSongs.length > 0}
          />
        );
      }
      
      // Other items in grid view - use LibraryItemCard
      const itemType = item.type as ImageType;
      return (
        <LibraryItemCard
          key={`${item.type}-${item.id}`}
          type={itemType}
          id={item.id}
          name={item.name}
          subtitle={item.subtitle}
          imageUrl={item.imageUrl}
          onClick={handleClick}
          artistData={item.artistData}
          albumData={item.albumData}
          playlistData={item.playlistData}
          onEdit={item.type === 'playlist' ? () => handleEditPlaylist(item.id) : undefined}
          onDelete={item.type === 'playlist' ? () => handleDeletePlaylist(item.id) : undefined}
          isActive={isItemActive(item.type, item.id)}
          isPlaying={isItemPlaying(item.type, item.id)}
          onPlay={getPlayHandler()}
          onPause={handlePause}
        />
      );
    }

    // List and compact views - use LibraryItemRow for non-liked-songs items
    if (item.type !== 'liked-songs') {
      const itemType = item.type as ImageType;
      return (
        <LibraryItemRow
          key={`${item.type}-${item.id}`}
          type={itemType}
          id={item.id}
          name={item.name}
          subtitle={item.subtitle}
          imageUrl={item.imageUrl}
          onClick={handleClick}
          artistData={item.artistData}
          albumData={item.albumData}
          playlistData={item.playlistData}
          onEdit={item.type === 'playlist' ? () => handleEditPlaylist(item.id) : undefined}
          onDelete={item.type === 'playlist' ? () => handleDeletePlaylist(item.id) : undefined}
          isActive={isItemActive(item.type, item.id)}
          isPlaying={isItemPlaying(item.type, item.id)}
          onPlay={getPlayHandler()}
          onPause={handlePause}
        />
      );
    }

    // Liked songs item - special rendering with hover state
    return (
      <LikedSongsRow
        key="liked-songs"
        subtitle={item.subtitle}
        onClick={handleClick}
        isActive={isItemActive('liked-songs', 'liked-songs')}
        isPlaying={isLikedSongsPlaying()}
        onPlay={handlePlayLikedSongs}
        onPause={handlePause}
        hasLikedSongs={likedSongs.length > 0}
      />
    );
  };


  return (
    <OverlayScrollbarsComponent
      className={`w-full h-full bg-neutral-900 rounded-lg ${isExiting ? 'library-expand-exit' : 'library-expand-enter'} ${showScrollbar ? 'scrollbar-visible' : ''}`}
      onMouseEnter={handleScrollbarMouseEnter}
      onMouseLeave={handleScrollbarMouseLeave}
      options={{ 
        scrollbars: { 
          theme: 'os-theme-light',
          autoHide: 'move',
          clickScroll: true
        } 
      }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-neutral-900/95 backdrop-blur-sm z-10 px-4 py-4 rounded-t-lg">
        {/* Top row: Title and controls */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold">音乐库</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsCreating(true)}
              className="p-1.5 rounded-full hover:bg-spotify-gray text-spotify-light-gray hover:text-white transition-colors"
              title="创建歌单"
            >
              <FiPlus size={18} />
            </button>
            <button
              onClick={onBack}
              className="p-1.5 rounded-full hover:bg-spotify-gray text-spotify-light-gray hover:text-white transition-colors"
              title="收起"
            >
              <TbArrowsDiagonalMinimize2 size={16} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
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
        {filter === 'albums' && (
          <div className="mb-4 flex flex-wrap gap-2">
            {albumReleaseTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setAlbumReleaseFilter(tab.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  albumReleaseFilter === tab.id
                    ? 'bg-white text-black'
                    : 'bg-spotify-gray/80 text-white hover:bg-spotify-dark'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Search and Controls */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative max-w-md">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-spotify-light-gray" size={16} />
            <input
              type="text"
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              placeholder="在音乐库中搜索"
              className="w-full pl-9 pr-4 py-2 bg-spotify-gray/50 rounded text-sm text-white placeholder-spotify-light-gray focus:outline-none focus:bg-spotify-gray"
            />
          </div>
          {/* Create playlist input */}
          {isCreating && (
            <div className="max-w-xs">
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                onBlur={handleCreatePlaylist}
                placeholder="歌单名称..."
                className="w-full px-3 py-2 bg-spotify-gray rounded text-sm text-white placeholder-spotify-light-gray focus:outline-none focus:ring-1 focus:ring-spotify-green"
                autoFocus
              />
            </div>
          )}
          <div className="flex-1" />
          <SortDropdown />
          <div className="flex items-center gap-1 bg-spotify-gray rounded-full p-1">
            {viewModes.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setViewMode(mode.id)}
                className={`p-2 rounded-full transition-colors ${
                  viewMode === mode.id
                    ? 'bg-white text-black'
                    : 'text-spotify-light-gray hover:text-white'
                }`}
              >
                {mode.icon}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-4">
        {/* Library Items */}
        {displayItems.length === 0 && !searchQuery ? (
          <div className="text-center py-16 text-spotify-light-gray">
            <p className="text-lg mb-2">
              {filter === 'playlists' && '暂无歌单'}
              {filter === 'artists' && '暂无关注的艺人'}
              {filter === 'albums' &&
                (albumReleaseFilter === 'all'
                  ? '暂无收藏的专辑'
                  : `暂无收藏的${getReleaseTypeLabel(albumReleaseFilter)}`)}
              {filter === 'all' && '音乐库为空'}
            </p>
            <p className="text-sm">开始收藏你喜欢的音乐吧</p>
          </div>
        ) : displayItems.length === 0 && searchQuery ? (
          <div className="text-center py-16 text-spotify-light-gray">
            <p className="text-lg mb-2">未找到结果</p>
            <p className="text-sm">尝试其他搜索词</p>
          </div>
        ) : (
          <div 
            className={viewMode === 'grid' ? 'grid gap-4' : 'space-y-1'}
            style={viewMode === 'grid' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' } : undefined}
          >
            {displayItems.map(renderItem)}
          </div>
        )}
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
          defaultCoverUrl={editingPlaylist.songs?.[0]?.artworkUrl}
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingPlaylist(null);
          }}
          onSave={handleSavePlaylistEdit}
        />
      )}
    </OverlayScrollbarsComponent>
  );
}
