import { useState, useEffect, useRef } from 'react';
import { FiHeart, FiClock } from 'react-icons/fi';
import { Song } from '../types';
import { getPlaylist, PlaylistWithDates, OfflineModeError } from '../api';
import { useLikedSongsStore, likedSongToSong, LikedSong } from '../store/likedSongsStore';
import { usePlayerStore, QueueSource } from '../store/playerStore';
import { usePlaylistsStore } from '../store/playlistsStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { offlineCacheService, CachedSong } from '../services/offlineCacheService';
import { convertCachedPlaylistToPlaylist, revokeObjectUrls } from '../utils/offlineCacheConverter';
import SongCard from './SongCard';
import { getProxiedImageUrl } from '../utils/image';
import { extractDominantColor } from '../utils/colorExtractor';
import { StickyHeader } from './StickyHeader';
import DraggableImage from './DraggableImage';
import ShuffleButton from './ShuffleButton';
import { PlaylistDownloadButton } from './DownloadButton';
import PlaylistEditModal, { PlaylistUpdateData } from './PlaylistEditModal';
import { savePlaylistEdit } from '../utils/playlistEdit';
import OfflineFallback from './OfflineFallback';

// Props interface supporting both playlist and liked songs modes
export interface SongListPageProps {
  variant: 'playlist' | 'liked';
  playlistId?: string;
}

// Extended song type with added date
interface SongWithDate {
  song: Song;
  addedAt?: string;
}

export default function SongListPage({ variant, playlistId }: SongListPageProps) {
  // State
  const [songs, setSongs] = useState<SongWithDate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string>(
    variant === 'liked' ? 'rgb(88, 28, 135)' : 'rgb(38, 38, 38)'
  );
  const [playlist, setPlaylist] = useState<PlaylistWithDates | null>(null);
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  // Object URLs to revoke on unmount (for offline cached data)
  const [objectUrlsToRevoke, setObjectUrlsToRevoke] = useState<string[]>([]);
  
  // Stores
  const { likedSongs, isLoading: likedLoading, fetchLikedSongs } = useLikedSongsStore();
  const { fetchPlaylists } = usePlaylistsStore();
  const { setQueue, toggleShuffle, isShuffled, queueSource, isPlaying, pause, play } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const { isOnline } = useOnlineStatus();
  
  // Local shuffle state
  const [localShuffle, setLocalShuffle] = useState(false);
  
  // Ref for action bar (play button area) for sticky header
  const actionBarRef = useRef<HTMLDivElement>(null);

  // Load data based on variant
  useEffect(() => {
    if (variant === 'liked') {
      fetchLikedSongs();
    } else if (variant === 'playlist' && playlistId) {
      loadPlaylist(playlistId);
    }
  }, [variant, playlistId, fetchLikedSongs, isOnline]);

  // Cleanup Object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (objectUrlsToRevoke.length > 0) {
        revokeObjectUrls(objectUrlsToRevoke);
      }
    };
  }, [objectUrlsToRevoke]);

  // Update songs when liked songs change
  useEffect(() => {
    if (variant === 'liked') {
      setIsLoading(likedLoading);
      setSongs(likedSongs.map((ls: LikedSong) => ({
        song: likedSongToSong(ls),
        addedAt: ls.created_at,
      })));
    }
  }, [variant, likedSongs, likedLoading]);


  // Extract theme color from first song artwork
  useEffect(() => {
    if (songs.length > 0 && songs[0].song.artworkUrl && variant === 'playlist') {
      const imageUrl = getProxiedImageUrl(songs[0].song.artworkUrl, 100);
      extractDominantColor(imageUrl).then(setThemeColor);
    }
  }, [songs, variant]);

  // Update document title when not playing
  useEffect(() => {
    if (isPlaying) return;
    const baseTitle = 'OwlPlayer';
    if (variant === 'liked') {
      document.title = `已点赞的歌曲 | ${baseTitle}`;
      return;
    }
    const title = playlist?.name || '歌单';
    document.title = `${title} | ${baseTitle}`;
  }, [variant, playlist?.name, isPlaying]);

  // Sync localShuffle from playerStore when queueSource matches current page
  useEffect(() => {
    const isCurrentSource = variant === 'liked'
      ? queueSource.type === 'liked-songs'
      : queueSource.type === 'playlist' && queueSource.id === playlistId;
    
    if (isCurrentSource) {
      setLocalShuffle(isShuffled);
    }
  }, [queueSource, isShuffled, variant, playlistId]);

  // Clear selection when clicking outside song cards
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't clear selection if clicking inside a context menu
      if (target.closest('[class*="bg-[#282828]"]')) {
        return;
      }
      // Check if click is inside a song card (has data-song-card attribute or is child of one)
      if (!target.closest('[data-song-card]')) {
        setSelectedSongId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Load playlist data
  const loadPlaylist = async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    // Revoke previous Object URLs if any
    if (objectUrlsToRevoke.length > 0) {
      revokeObjectUrls(objectUrlsToRevoke);
      setObjectUrlsToRevoke([]);
    }
    
    try {
      if (isOnline) {
        // Online: use API
        const data = await getPlaylist(id);
        setPlaylist(data);
        // Extract song and addedAt from the API response
        setSongs(data.songs.map(s => ({ 
          song: {
            id: s.id,
            name: s.name,
            artistName: s.artistName,
            artistId: s.artistId,
            albumName: s.albumName,
            albumId: s.albumId,
            duration: s.duration,
            artworkUrl: s.artworkUrl,
            hasLyrics: s.hasLyrics,
            isMusicVideo: s.isMusicVideo,
            contentRating: s.contentRating,
          },
          addedAt: s.addedAt,
        })));
      } else {
        // Offline: load from IndexedDB cache
        const cachedPlaylist = await offlineCacheService.getCachedPlaylist(id);
        if (!cachedPlaylist) {
          setError('此歌单未缓存，无法离线查看');
          return;
        }
        
        // Load cached songs for this playlist
        const cachedSongsPromises = cachedPlaylist.trackIds.map(trackId => 
          offlineCacheService.getCachedSong(trackId)
        );
        const cachedSongsResults = await Promise.all(cachedSongsPromises);
        const validSongs = cachedSongsResults.filter((s): s is CachedSong => s !== null);
        
        // Convert to Playlist format
        const playlistData = convertCachedPlaylistToPlaylist(cachedPlaylist, validSongs);
        setObjectUrlsToRevoke(playlistData._objectUrls);
        
        // Set playlist metadata
        setPlaylist({
          id: playlistData.id,
          name: playlistData.name,
          description: cachedPlaylist.metadata.description,
          songs: playlistData.songs.map(s => ({
            ...s,
            addedAt: undefined,
          })),
          created_at: playlistData.createdAt,
        } as PlaylistWithDates);
        
        // Set songs
        setSongs(playlistData.songs.map(s => ({
          song: s,
          addedAt: undefined,
        })));
      }
    } catch (err) {
      // If offline mode error, try to load from local cache
      if (err instanceof OfflineModeError) {
        try {
          const cachedPlaylist = await offlineCacheService.getCachedPlaylist(id);
          if (!cachedPlaylist) {
            setError('离线模式已启用，此歌单未缓存');
            return;
          }
          
          // Load cached songs for this playlist
          const cachedSongsPromises = cachedPlaylist.trackIds.map(trackId => 
            offlineCacheService.getCachedSong(trackId)
          );
          const cachedSongsResults = await Promise.all(cachedSongsPromises);
          const validSongs = cachedSongsResults.filter((s): s is CachedSong => s !== null);
          
          // Convert to Playlist format
          const playlistData = convertCachedPlaylistToPlaylist(cachedPlaylist, validSongs);
          setObjectUrlsToRevoke(playlistData._objectUrls);
          
          // Set playlist metadata
          setPlaylist({
            id: playlistData.id,
            name: playlistData.name,
            description: cachedPlaylist.metadata.description,
            songs: playlistData.songs.map(s => ({
              ...s,
              addedAt: undefined,
            })),
            created_at: playlistData.createdAt,
          } as PlaylistWithDates);
          
          // Set songs
          setSongs(playlistData.songs.map(s => ({
            song: s,
            addedAt: undefined,
          })));
        } catch (cacheErr) {
          setError('离线模式已启用，此歌单未缓存');
        }
      } else {
        setError(err instanceof Error ? err.message : '加载歌单失败');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Format total duration
  const formatTotalDuration = () => {
    const totalMs = songs.reduce((acc, { song }) => acc + song.duration, 0);
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    if (hours > 0) {
      return `${hours} 小时 ${minutes} 分钟`;
    }
    return `${minutes} 分 ${seconds} 秒`;
  };

  // Check if current queue source matches this page (regardless of play state)
  const isCurrentSource = (
    (variant === 'liked' && queueSource.type === 'liked-songs') ||
    (variant === 'playlist' && queueSource.type === 'playlist' && queueSource.id === playlistId)
  );

  // Check if current source is playing
  const isCurrentSourcePlaying = isPlaying && isCurrentSource;

  // Play handlers
  const handlePlayAll = () => {
    if (songs.length === 0) return;
    // Record play for recently played sorting
    if (variant === 'liked') {
      recordPlay('liked-songs', 'liked-songs');
    } else if (playlistId) {
      recordPlay('playlist', playlistId);
    }
    const songList = songs.map(s => s.song);
    const source: QueueSource = variant === 'liked'
      ? { type: 'liked-songs', id: null, name: '喜欢的歌曲' }
      : { type: 'playlist', id: playlistId || null, name: playlist?.name };
    setQueue(songList, 0, source);
    // Sync shuffle state to playerStore
    if (localShuffle !== isShuffled) {
      toggleShuffle();
    }
  };

  const handlePlayPauseClick = () => {
    if (isCurrentSourcePlaying) {
      pause();
    } else if (isCurrentSource) {
      // Resume playback when source matches but paused
      play();
    } else {
      handlePlayAll();
    }
  };

  const handlePlaySong = (index: number) => {
    // Record play for recently played sorting
    if (variant === 'liked') {
      recordPlay('liked-songs', 'liked-songs');
    } else if (playlistId) {
      recordPlay('playlist', playlistId);
    }
    const songList = songs.map(s => s.song);
    const source: QueueSource = variant === 'liked'
      ? { type: 'liked-songs', id: null, name: '喜欢的歌曲' }
      : { type: 'playlist', id: playlistId || null, name: playlist?.name };
    setQueue(songList, index, source);
  };

  // Get title and cover based on variant
  const getTitle = () => variant === 'liked' ? '已点赞的歌曲' : (playlist?.name || '歌单');
  const getSongCount = () => songs.length;
  const cacheableTrackIds = songs
    .map(({ song }) => song)
    .filter((song) => !song.isMusicVideo)
    .map((song) => song.id);

  // Handle double click on title to open edit modal (only for playlists)
  const handleTitleDoubleClick = () => {
    if (variant !== 'playlist' || !playlist) return;
    setIsEditModalOpen(true);
  };

  // Handle save from edit modal
  const handleEditModalSave = async (updates: PlaylistUpdateData) => {
    if (!playlistId) return;

    await savePlaylistEdit(playlistId, updates);

    // Refresh local playlist data
    await loadPlaylist(playlistId);

    // Refresh sidebar
    fetchPlaylists();
  };


  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 p-6">
        <div className="animate-pulse">
          <div 
            className="h-48 rounded-lg mb-6"
            style={{ background: `linear-gradient(to bottom, ${themeColor}, rgb(18, 18, 18))` }}
          />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-spotify-gray rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    // Check if it's an offline-related error
    const isOfflineError = error.includes('离线') || error.includes('未缓存') || !isOnline;
    
    if (isOfflineError) {
      return <OfflineFallback message={error} showPath={false} />;
    }
    
    return (
      <div className="flex-1 p-8 text-center text-spotify-light-gray">
        {error}
      </div>
    );
  }

  // Spotify-style track header using CSS Grid (for sticky header)
  // px-4 matches the song list container padding
  const playlistTrackHeader = (
    <div className="track-list-container px-4">
      <div 
        className="track-list-grid items-center h-9 text-sm text-spotify-light-gray border-b border-white/10"
        role="row"
      >
        <div className="text-center" role="columnheader">#</div>
        <div role="columnheader">标题</div>
        <div className="col-album" role="columnheader">专辑</div>
        <div className="col-date" role="columnheader">添加日期</div>
        <div className="flex justify-end pr-8" role="columnheader">
          <FiClock size={16} />
        </div>
      </div>
    </div>
  );

  return (
    <StickyHeader
      title={getTitle()}
      themeColor={themeColor}
      onPlay={handlePlayPauseClick}
      actionBarRef={actionBarRef}
      showTrackHeader={true}
      customTrackHeader={playlistTrackHeader}
      triggerOffset={5}
      isCurrentSourcePlaying={isCurrentSourcePlaying}
    >
      <div 
        className="min-h-full"
        style={{
          background: `linear-gradient(to bottom, ${themeColor} 0%, transparent 400px), linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgb(18,18,18) 400px)`
        }}
      >
        {/* Header with gradient */}
        <div className="p-6 pb-8">
          <div className="flex items-end gap-6">
            {/* Cover / Heart icon */}
            {variant === 'liked' ? (
              <div className="w-64 h-64 bg-gradient-to-br from-purple-600 to-blue-400 rounded-lg flex items-center justify-center shadow-2xl">
                <FiHeart className="w-24 h-24 text-white fill-current" />
              </div>
            ) : (
              <div className="w-64 h-64 bg-spotify-gray rounded-lg shadow-xl flex items-center justify-center overflow-hidden">
                {songs.length > 0 && songs[0].song.artworkUrl && playlistId ? (
                  <DraggableImage
                    type="playlist"
                    id={playlistId}
                    src={getProxiedImageUrl(songs[0].song.artworkUrl, 300)}
                    alt={getTitle()}
                    className="w-full h-full object-cover"
                    playlistData={playlist ? { id: playlist.id, name: playlist.name } : { id: playlistId, name: getTitle() }}
                    onEdit={() => setIsEditModalOpen(true)}
                  />
                ) : (
                  <span className="text-6xl text-spotify-light-gray">♪</span>
                )}
              </div>
            )}

            {/* Info */}
            <div className="flex-1">
              <p className="text-sm text-white/80 mb-2">歌单</p>
              <h1
                className={`text-5xl font-bold text-white mb-4 ${variant === 'playlist' ? 'cursor-pointer hover:text-white/80 transition-colors' : ''}`}
                onDoubleClick={handleTitleDoubleClick}
                title={variant === 'playlist' ? '双击编辑歌单' : undefined}
              >
                {getTitle()}
              </h1>
              {variant === 'playlist' && playlist?.description && (
                <p className="text-sm text-white/60 mb-4">{playlist.description}</p>
              )}
              <p className="text-sm text-white/80">
                {getSongCount()} 首歌曲，{formatTotalDuration()}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div ref={actionBarRef} className="px-6 py-4 flex items-center gap-4">
          <button
            onClick={handlePlayPauseClick}
            disabled={songs.length === 0}
            className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24">
              {isCurrentSourcePlaying ? (
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              ) : (
                <path d="M6 4l15 8-15 8V4z" />
              )}
            </svg>
          </button>
          <ShuffleButton
            isActive={localShuffle}
            onClick={() => setLocalShuffle(!localShuffle)}
            size="lg"
          />
          {variant === 'playlist' && playlistId && cacheableTrackIds.length > 0 && (
            <PlaylistDownloadButton
              playlistId={playlistId}
              trackIds={cacheableTrackIds}
              size="md"
            />
          )}
        </div>


        {/* Song list - wrapped in container for container queries */}
        <div className="px-4 pb-32 track-list-container">
          {songs.length === 0 ? (
            <div className="text-center py-16">
              <FiHeart className="w-16 h-16 text-spotify-light-gray mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-white mb-2">
                {variant === 'liked' ? '还没有点赞的歌曲' : '歌单为空'}
              </h2>
              <p className="text-spotify-light-gray">
                {variant === 'liked' 
                  ? '点击歌曲旁边的勾选图标来添加喜欢的歌曲' 
                  : '搜索歌曲来添加吧'}
              </p>
            </div>
          ) : (
            <div 
              role="grid" 
              aria-label={variant === 'liked' ? '已点赞的歌曲' : playlist?.name || '歌单'}
              aria-rowcount={songs.length + 1}
            >
              {/* Spotify-style header row */}
              <div 
                className="track-list-grid items-center h-9 text-sm text-spotify-light-gray border-b border-white/10 mb-2"
                role="row"
                aria-rowindex={1}
              >
                <div className="text-center" role="columnheader">#</div>
                <div role="columnheader">标题</div>
                <div className="col-album" role="columnheader">专辑</div>
                <div className="col-date" role="columnheader">添加日期</div>
                <div className="flex justify-end pr-8" role="columnheader">
                  <FiClock size={16} />
                </div>
              </div>

              {/* Songs with grid layout */}
              {songs.map(({ song, addedAt }, index) => (
                <SongCard
                  key={song.id}
                  song={song}
                  onPlay={() => handlePlaySong(index)}
                  showIndex={index + 1}
                  showAlbum={true}
                  showLikeButton={true}
                  addedAt={addedAt}
                  isSelected={selectedSongId === song.id}
                  onSelect={setSelectedSongId}
                  isCurrentSource={isCurrentSource}
                  useGridLayout={true}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Playlist Edit Modal */}
      {variant === 'playlist' && playlist && (
        <PlaylistEditModal
          playlist={{
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            artwork_url: playlist.artwork_url,
          }}
          defaultCoverUrl={songs.length > 0 ? songs[0].song.artworkUrl : undefined}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleEditModalSave}
        />
      )}
    </StickyHeader>
  );
}
