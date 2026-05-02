import { useNavigate } from 'react-router-dom';
import { IoMusicalNotes, IoList, IoPerson, IoDisc } from 'react-icons/io5';
import { Song, PageContextType } from '../types';
import { ContextMenu, MenuItem, MenuDivider, MenuPosition } from './ContextMenu';
import PlaylistSubmenu from './PlaylistSubmenu';
import { usePlayerStore } from '../store/playerStore';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { usePlaylistsStore } from '../store/playlistsStore';
import { getSongMenuVisibility } from '../utils/menuVisibility';

interface SongContextMenuProps {
  song: Song;
  isOpen: boolean;
  position: MenuPosition;
  onClose: () => void;
  pageContext?: PageContextType;
  closeOnScroll?: boolean;
}

// Menu item labels (exported for testing)
export const SONG_MENU_ITEMS = {
  ADD_TO_QUEUE: '加入播放队列',
  ADD_TO_PLAYLIST: '加入歌单',
  ADD_TO_LIKED: '收藏至你已点赞的歌曲',
  REMOVE_FROM_LIKED: '从"已点赞的歌曲"中删除',
  GO_TO_ARTIST: '转至艺术家',
  GO_TO_ALBUM: '转至专辑',
} as const;

// Helper function to get like menu label based on liked state (exported for testing)
export function getLikeMenuLabel(liked: boolean): string {
  return liked ? SONG_MENU_ITEMS.REMOVE_FROM_LIKED : SONG_MENU_ITEMS.ADD_TO_LIKED;
}

// Icon for liked state: Green filled circle with transparent checkmark cutout
const LikedIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
    <defs>
      <mask id="checkmark-mask-song-context">
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
    <circle cx="12" cy="12" r="11" fill="#1DB954" mask="url(#checkmark-mask-song-context)" />
  </svg>
);

// Icon for not liked state: Gray circle outline with plus icon
const NotLikedIcon = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      className="text-gray-400"
    />
    <line
      x1="12"
      y1="8"
      x2="12"
      y2="16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="text-gray-400"
    />
    <line
      x1="8"
      y1="12"
      x2="16"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="text-gray-400"
    />
  </svg>
);

export default function SongContextMenu({
  song,
  isOpen,
  position,
  onClose,
  pageContext,
  closeOnScroll = true,
}: SongContextMenuProps) {
  const navigate = useNavigate();
  const { addToQueue } = usePlayerStore();
  const { isLiked, likeSong, unlikeSong } = useLikedSongsStore();
  const { addSongToPlaylist, createPlaylist, getNextPlaylistName } = usePlaylistsStore();

  const liked = isLiked(song.id);
  const menuVisibility = getSongMenuVisibility(pageContext);

  const handleAddToQueue = () => {
    addToQueue(song);
    onClose();
  };

  const handleLikeToggle = async () => {
    if (liked) {
      await unlikeSong(song.id);
    } else {
      await likeSong(song);
    }
    onClose();
  };


  const handleGoToArtist = () => {
    if (song.artistId) {
      navigate(`/artist/${song.artistId}`);
    } else {
      // Fallback: search by artist name
      navigate(`/search?q=${encodeURIComponent(song.artistName)}`);
    }
    onClose();
  };

  const handleGoToAlbum = () => {
    if (song.albumId) {
      navigate(`/album/${song.albumId}`);
    } else {
      // Fallback: search by album name
      navigate(`/search?q=${encodeURIComponent(song.albumName)}`);
    }
    onClose();
  };

  const handleSelectPlaylist = async (playlistId: string) => {
    await addSongToPlaylist(playlistId, song);
    onClose();
  };

  const handleCreatePlaylist = async () => {
    const newPlaylist = await createPlaylist(getNextPlaylistName());
    if (newPlaylist) {
      await addSongToPlaylist(newPlaylist.id, song);
    }
    onClose();
  };

  return (
    <ContextMenu
      isOpen={isOpen}
      position={position}
      onClose={onClose}
      closeOnScroll={closeOnScroll}
    >
      <MenuItem
        icon={<IoMusicalNotes />}
        label={SONG_MENU_ITEMS.ADD_TO_QUEUE}
        onClick={handleAddToQueue}
      />
      <MenuItem
        icon={<IoList />}
        label={SONG_MENU_ITEMS.ADD_TO_PLAYLIST}
        hasSubmenu
        submenu={
          <PlaylistSubmenu
            onSelectPlaylist={handleSelectPlaylist}
            onCreatePlaylist={handleCreatePlaylist}
          />
        }
      />
      
      <MenuDivider />
      
      <MenuItem
        icon={liked ? <LikedIcon /> : <NotLikedIcon />}
        label={getLikeMenuLabel(liked)}
        onClick={handleLikeToggle}
      />
      
      {(menuVisibility.showGoToArtist || menuVisibility.showGoToAlbum) && <MenuDivider />}
      
      {menuVisibility.showGoToArtist && (
        <MenuItem
          icon={<IoPerson />}
          label={SONG_MENU_ITEMS.GO_TO_ARTIST}
          onClick={handleGoToArtist}
        />
      )}
      {menuVisibility.showGoToAlbum && (
        <MenuItem
          icon={<IoDisc />}
          label={SONG_MENU_ITEMS.GO_TO_ALBUM}
          onClick={handleGoToAlbum}
        />
      )}
    </ContextMenu>
  );
}
