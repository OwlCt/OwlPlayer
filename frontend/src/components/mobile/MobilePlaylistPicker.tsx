import { useState, useEffect, useCallback, useRef } from 'react';
import { FiSearch, FiPlus, FiLoader } from 'react-icons/fi';
import { IoCheckmarkCircle } from 'react-icons/io5';
import MobileBottomSheet from './MobileBottomSheet';
import CachedImage from '../CachedImage';
import { getProxiedImageUrl } from '../../utils/image';
import { Song } from '../../types';
import { usePlaylistsStore, Playlist } from '../../store/playlistsStore';
import { useLikedSongsStore } from '../../store/likedSongsStore';

// Special ID for liked songs "playlist"
export const LIKED_SONGS_PLAYLIST_ID = '__liked_songs__';

interface PlaylistSelection {
  playlistId: string;
  playlistName: string;
  artworkUrl?: string;
  isSelected: boolean;
  wasOriginallySelected: boolean;
  isPinned?: boolean;
}

interface MobilePlaylistPickerProps {
  song: Song;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Mobile playlist picker component
 * Bottom sheet style for selecting playlists to add a song to
 */
export default function MobilePlaylistPicker({ song, isOpen, onClose }: MobilePlaylistPickerProps) {
  const { playlists, fetchPlaylists, getSongPlaylists, batchUpdateSongPlaylists, createPlaylist } = usePlaylistsStore();
  const { isLiked, likeSong, unlikeSong } = useLikedSongsStore();

  const [selections, setSelections] = useState<PlaylistSelection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const hasInitialized = useRef(false);


  // Initialize selections when modal opens
  const initializeSelections = useCallback(async () => {
    if (!isOpen || hasInitialized.current) return;
    hasInitialized.current = true;

    setIsLoading(true);
    setError(null);

    try {
      await fetchPlaylists();
      const currentPlaylists = usePlaylistsStore.getState().playlists;
      const songPlaylistIds = await getSongPlaylists(song.id);
      const songPlaylistSet = new Set(songPlaylistIds);
      const songIsLiked = isLiked(song.id);

      const newSelections: PlaylistSelection[] = [
        {
          playlistId: LIKED_SONGS_PLAYLIST_ID,
          playlistName: '已点赞的歌曲',
          isSelected: songIsLiked,
          wasOriginallySelected: songIsLiked,
          isPinned: true,
        },
        ...currentPlaylists.map((playlist: Playlist) => ({
          playlistId: playlist.id,
          playlistName: playlist.name,
          artworkUrl: playlist.artwork_url,
          isSelected: songPlaylistSet.has(playlist.id),
          wasOriginallySelected: songPlaylistSet.has(playlist.id),
        })),
      ];

      setSelections(newSelections);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载歌单失败');
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, song.id, fetchPlaylists, getSongPlaylists, isLiked]);

  useEffect(() => {
    initializeSelections();
  }, [initializeSelections]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasInitialized.current = false;
      setSearchQuery('');
      setError(null);
      setIsCreatingPlaylist(false);
      setNewPlaylistName('');
    }
  }, [isOpen]);

  const toggleSelection = (playlistId: string) => {
    setSelections(prev =>
      prev.map(s =>
        s.playlistId === playlistId
          ? { ...s, isSelected: !s.isSelected }
          : s
      )
    );
  };

  const filteredSelections = selections.filter(s => {
    if (s.isPinned) return true;
    if (!searchQuery) return true;
    return s.playlistName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const likedSelection = selections.find(s => s.playlistId === LIKED_SONGS_PLAYLIST_ID);
      const playlistSelections = selections.filter(s => s.playlistId !== LIKED_SONGS_PLAYLIST_ID);

      if (likedSelection) {
        if (likedSelection.wasOriginallySelected && !likedSelection.isSelected) {
          await unlikeSong(song.id);
        } else if (!likedSelection.wasOriginallySelected && likedSelection.isSelected) {
          await likeSong(song);
        }
      }

      const addToPlaylists: string[] = [];
      const removeFromPlaylists: string[] = [];

      for (const selection of playlistSelections) {
        if (!selection.wasOriginallySelected && selection.isSelected) {
          addToPlaylists.push(selection.playlistId);
        } else if (selection.wasOriginallySelected && !selection.isSelected) {
          removeFromPlaylists.push(selection.playlistId);
        }
      }

      if (addToPlaylists.length > 0 || removeFromPlaylists.length > 0) {
        await batchUpdateSongPlaylists(song, addToPlaylists, removeFromPlaylists);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;

    try {
      const newPlaylist = await createPlaylist(newPlaylistName.trim());
      if (newPlaylist) {
        setSelections(prev => [
          prev[0],
          {
            playlistId: newPlaylist.id,
            playlistName: newPlaylist.name,
            artworkUrl: newPlaylist.artwork_url,
            isSelected: true,
            wasOriginallySelected: false,
          },
          ...prev.slice(1),
        ]);
      }
      setIsCreatingPlaylist(false);
      setNewPlaylistName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建歌单失败');
    }
  };

  return (
    <MobileBottomSheet isOpen={isOpen} onClose={onClose} showDragHandle={true}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <div className="w-12 h-12 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
          {song.artworkUrl ? (
            <CachedImage
              src={getProxiedImageUrl(song.artworkUrl, 96)}
              alt={song.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40 text-xl">
              ♪
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-[15px] truncate">{song.name}</div>
          <div className="text-white/60 text-sm truncate">{song.artistName}</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-white/10">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="查找歌单"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-white/10 text-white text-sm rounded-lg pl-10 pr-4 py-2.5 placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      </div>

      {/* Create new playlist */}
      <div className="px-5 py-3 border-b border-white/10">
        {isCreatingPlaylist ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="歌单名称"
              value={newPlaylistName}
              onChange={e => setNewPlaylistName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
              autoFocus
              className="flex-1 bg-white/10 text-white text-sm rounded-lg px-3 py-2 placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <button
              onClick={handleCreatePlaylist}
              disabled={!newPlaylistName.trim()}
              className="text-sm text-black bg-white px-4 py-2 rounded-full font-medium disabled:opacity-50"
            >
              创建
            </button>
            <button
              onClick={() => {
                setIsCreatingPlaylist(false);
                setNewPlaylistName('');
              }}
              className="text-sm text-white/60 px-2"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsCreatingPlaylist(true)}
            className="flex items-center gap-3 text-white py-1 w-full"
          >
            <span className="w-6 h-6 flex items-center justify-center">
              <FiPlus className="w-5 h-5" />
            </span>
            <span className="text-[15px]">新建歌单</span>
          </button>
        )}
      </div>

      {/* Playlist list */}
      <div className="max-h-[40vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <FiLoader className="w-6 h-6 text-white/60 animate-spin" />
          </div>
        ) : (
          filteredSelections.map(selection => (
            <PlaylistItem
              key={selection.playlistId}
              selection={selection}
              onToggle={() => toggleSelection(selection.playlistId)}
            />
          ))
        )}
      </div>

      {/* Error message */}
      {error && (
        <div className="px-5 py-2 text-red-400 text-sm bg-red-900/20">
          {error}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/10 flex gap-3 safe-area-bottom">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 text-[15px] text-white bg-white/10 rounded-full font-medium"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 px-4 py-3 text-[15px] text-black bg-white rounded-full font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving && <FiLoader className="w-4 h-4 animate-spin" />}
          完成
        </button>
      </div>
    </MobileBottomSheet>
  );
}

interface PlaylistItemProps {
  selection: PlaylistSelection;
  onToggle: () => void;
}

function PlaylistItem({ selection, onToggle }: PlaylistItemProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-4 px-5 py-3.5 min-h-[52px] active:bg-white/10 transition-colors"
    >
      {/* Artwork */}
      <div className="w-10 h-10 rounded bg-neutral-800 flex-shrink-0 overflow-hidden">
        {selection.isPinned ? (
          <div className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#c4efd9] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
        ) : selection.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(selection.artworkUrl, 80)}
            alt={selection.playlistName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            ♪
          </div>
        )}
      </div>

      {/* Name */}
      <span className="flex-1 text-left text-white text-[15px] truncate">
        {selection.playlistName}
      </span>

      {/* Checkbox */}
      <div className="w-6 h-6 flex items-center justify-center">
        {selection.isSelected ? (
          <IoCheckmarkCircle className="w-6 h-6 text-[#1DB954]" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-white/40" />
        )}
      </div>
    </button>
  );
}
