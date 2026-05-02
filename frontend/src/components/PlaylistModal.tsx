import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Song } from '../types';
import { usePlaylistsStore, Playlist } from '../store/playlistsStore';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { getProxiedImageUrl } from '../utils/image';

// Special ID for liked songs "playlist"
export const LIKED_SONGS_PLAYLIST_ID = '__liked_songs__';

interface PlaylistModalProps {
  song: Song;
  isOpen: boolean;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

interface PlaylistSelection {
  playlistId: string;
  playlistName: string;
  artworkUrl?: string;
  isSelected: boolean;
  wasOriginallySelected: boolean;
  isPinned?: boolean;
}

export function PlaylistModal({ song, isOpen, onClose, anchorRef }: PlaylistModalProps) {
  const { playlists, fetchPlaylists, getSongPlaylists, batchUpdateSongPlaylists, createPlaylist } = usePlaylistsStore();
  const { isLiked, likeSong, unlikeSong } = useLikedSongsStore();
  
  const [selections, setSelections] = useState<PlaylistSelection[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Track if initialization has occurred for this modal open
  const hasInitialized = useRef(false);

  // Calculate position relative to anchor element
  useEffect(() => {
    if (!isOpen || !anchorRef?.current) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const modal = modalRef.current;
      if (!anchor) return;

      const anchorRect = anchor.getBoundingClientRect();
      const modalWidth = 350;
      const modalHeight = modal?.offsetHeight || 500;
      const padding = 8;

      // Position above the button by default
      let top = anchorRect.top - modalHeight - padding;
      let left = anchorRect.left + anchorRect.width / 2 - modalWidth / 2;

      // If not enough space above, position below
      if (top < padding) {
        top = anchorRect.bottom + padding;
      }

      // Keep within horizontal bounds
      if (left < padding) {
        left = padding;
      } else if (left + modalWidth > window.innerWidth - padding) {
        left = window.innerWidth - modalWidth - padding;
      }

      setPosition({ top, left });
    };

    // Initial position
    updatePosition();

    // Update on scroll/resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, anchorRef, selections.length]);

  // Initialize selections when modal opens
  const initializeSelections = useCallback(async () => {
    if (!isOpen || hasInitialized.current) return;
    hasInitialized.current = true;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Fetch playlists - store handles preventing concurrent requests
      await fetchPlaylists();
      
      // Get current playlists from store after fetch
      const currentPlaylists = usePlaylistsStore.getState().playlists;
      
      // Get playlists containing this song
      const songPlaylistIds = await getSongPlaylists(song.id);
      const songPlaylistSet = new Set(songPlaylistIds);
      
      // Check if song is liked
      const songIsLiked = isLiked(song.id);
      
      // Build selections array
      const newSelections: PlaylistSelection[] = [
        // Liked songs as pinned first item
        {
          playlistId: LIKED_SONGS_PLAYLIST_ID,
          playlistName: '已点赞的歌曲',
          isSelected: songIsLiked,
          wasOriginallySelected: songIsLiked,
          isPinned: true,
        },
        // User playlists
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
      setError(err instanceof Error ? err.message : 'Failed to load playlists');
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

  // Toggle playlist selection
  const toggleSelection = (playlistId: string) => {
    setSelections(prev => 
      prev.map(s => 
        s.playlistId === playlistId 
          ? { ...s, isSelected: !s.isSelected }
          : s
      )
    );
  };

  // Filter playlists by search query
  const filteredSelections = selections.filter(s => {
    // Always show pinned (liked songs)
    if (s.isPinned) return true;
    // Filter by search query
    if (!searchQuery) return true;
    return s.playlistName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      // Compute changes
      const likedSelection = selections.find(s => s.playlistId === LIKED_SONGS_PLAYLIST_ID);
      const playlistSelections = selections.filter(s => s.playlistId !== LIKED_SONGS_PLAYLIST_ID);
      
      // Handle liked songs changes
      if (likedSelection) {
        if (likedSelection.wasOriginallySelected && !likedSelection.isSelected) {
          // Unlike
          await unlikeSong(song.id);
        } else if (!likedSelection.wasOriginallySelected && likedSelection.isSelected) {
          // Like
          await likeSong(song);
        }
      }
      
      // Compute playlist add/remove
      const addToPlaylists: string[] = [];
      const removeFromPlaylists: string[] = [];
      
      for (const selection of playlistSelections) {
        if (!selection.wasOriginallySelected && selection.isSelected) {
          addToPlaylists.push(selection.playlistId);
        } else if (selection.wasOriginallySelected && !selection.isSelected) {
          removeFromPlaylists.push(selection.playlistId);
        }
      }
      
      // Apply playlist changes
      if (addToPlaylists.length > 0 || removeFromPlaylists.length > 0) {
        await batchUpdateSongPlaylists(song, addToPlaylists, removeFromPlaylists);
      }
      
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle create new playlist
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    try {
      const newPlaylist = await createPlaylist(newPlaylistName.trim());
      if (newPlaylist) {
        // Add to selections with checked state
        setSelections(prev => [
          prev[0], // Keep liked songs at top
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
      setError(err instanceof Error ? err.message : 'Failed to create playlist');
    }
  };

  if (!isOpen) return null;

  // Use positioned dropdown style when anchor is provided
  const useDropdown = !!anchorRef;

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999]"
      onClick={onClose}
    >
      {/* Backdrop - only show dim overlay for centered modal */}
      {!useDropdown && <div className="absolute inset-0 bg-black/60" />}
      
      <div 
        ref={modalRef}
        className={`bg-[#282828] rounded-lg w-[350px] max-h-[500px] flex flex-col shadow-xl ${
          useDropdown 
            ? 'fixed' 
            : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
        }`}
        style={useDropdown && position ? { top: position.top, left: position.left } : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <h2 className="text-white text-lg font-semibold">加入歌单</h2>
        </div>
        
        {/* Search */}
        <div className="p-3 border-b border-white/10">
          <div className="relative">
            <svg 
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="查找歌单"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#3e3e3e] text-white text-sm rounded-md pl-10 pr-4 py-2 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>
        </div>
        
        {/* Create new playlist */}
        <div className="px-3 py-2 border-b border-white/10">
          {isCreatingPlaylist ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="歌单名称"
                value={newPlaylistName}
                onChange={e => setNewPlaylistName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
                autoFocus
                className="flex-1 bg-[#3e3e3e] text-white text-sm rounded-md px-3 py-1.5 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-white/20"
              />
              <button
                onClick={handleCreatePlaylist}
                disabled={!newPlaylistName.trim()}
                className="text-sm text-white bg-[#1DB954] px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                创建
              </button>
              <button
                onClick={() => {
                  setIsCreatingPlaylist(false);
                  setNewPlaylistName('');
                }}
                className="text-sm text-gray-400 hover:text-white"
              >
                取消
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsCreatingPlaylist(true)}
              className="flex items-center gap-2 text-white hover:text-white/80 py-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span className="text-sm">新建歌单</span>
            </button>
          )}
        </div>
        
        {/* Playlist list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
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
          <div className="px-4 py-2 text-red-400 text-sm bg-red-900/20">
            {error}
          </div>
        )}
        
        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 text-sm text-black bg-white rounded-full font-medium hover:scale-105 transition-transform disabled:opacity-50 disabled:hover:scale-100 flex items-center gap-2"
          >
            {isSaving && (
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            )}
            完成
          </button>
        </div>
      </div>
    </div>
  );

  // Use createPortal to render modal at document.body level
  // This ensures the modal is not affected by parent stacking contexts
  return createPortal(modalContent, document.body);
}

// Playlist item component
interface PlaylistItemProps {
  selection: PlaylistSelection;
  onToggle: () => void;
}

function PlaylistItem({ selection, onToggle }: PlaylistItemProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
    >
      {/* Artwork */}
      <div className="w-10 h-10 rounded bg-[#3e3e3e] flex-shrink-0 overflow-hidden">
        {selection.isPinned ? (
          // Liked songs icon
          <div className="w-full h-full bg-gradient-to-br from-[#450af5] to-[#c4efd9] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
        ) : selection.artworkUrl ? (
          <img src={getProxiedImageUrl(selection.artworkUrl, 80)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
            </svg>
          </div>
        )}
      </div>
      
      {/* Name */}
      <span className="flex-1 text-left text-white text-sm truncate">
        {selection.playlistName}
      </span>
      
      {/* Pin icon for liked songs */}
      {selection.isPinned && (
        <svg className="w-4 h-4 text-[#1DB954]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/>
        </svg>
      )}
      
      {/* Checkbox */}
      <div className="w-5 h-5 flex items-center justify-center">
        {selection.isSelected ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <defs>
              <mask id={`checkmark-mask-playlist-${selection.playlistId}`}>
                <rect width="24" height="24" fill="white" />
                <polyline
                  points="7 12 10.5 15.5 17 9"
                  stroke="black"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </mask>
            </defs>
            <circle cx="12" cy="12" r="11" fill="#1DB954" mask={`url(#checkmark-mask-playlist-${selection.playlistId})`} />
          </svg>
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-gray-500" />
        )}
      </div>
    </button>
  );
}

export default PlaylistModal;
