import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IoMusicalNotes, IoList, IoPerson, IoDisc, IoRemoveCircleOutline } from 'react-icons/io5';
import { Song, PageContextType } from '../../types';
import MobileMenu, { MobileMenuItem, MobileMenuDivider, MobileMenuHeader } from './MobileMenu';
import MobilePlaylistPicker from './MobilePlaylistPicker';
import { usePlayerStore } from '../../store/playerStore';
import { useLikedSongsStore } from '../../store/likedSongsStore';
import { getSongMenuVisibility } from '../../utils/menuVisibility';

interface MobileSongMenuProps {
  song: Song | null;
  isOpen: boolean;
  onClose: () => void;
  pageContext?: PageContextType;
  /** Callback when "Add to Playlist" is clicked - opens playlist picker */
  onAddToPlaylist?: () => void;
}

// Icon for liked state: Green filled circle with transparent checkmark cutout
const LikedIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <defs>
      <mask id="checkmark-mask-mobile-song">
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
    <circle cx="12" cy="12" r="11" fill="#1DB954" mask="url(#checkmark-mask-mobile-song)" />
  </svg>
);

// Icon for not liked state: Gray circle outline with plus icon
const NotLikedIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
    <circle
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      className="text-white/70"
    />
    <line
      x1="12"
      y1="8"
      x2="12"
      y2="16"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="text-white/70"
    />
    <line
      x1="8"
      y1="12"
      x2="16"
      y2="12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="text-white/70"
    />
  </svg>
);

/**
 * MobileSongMenu - Mobile-optimized song context menu
 * Uses bottom sheet presentation with same content as PC version
 */
export default function MobileSongMenu({ 
  song, 
  isOpen, 
  onClose, 
  pageContext,
  onAddToPlaylist 
}: MobileSongMenuProps) {
  const navigate = useNavigate();
  const { addToQueue, removeFromQueue, queue, currentSong, next } = usePlayerStore();
  const { isLiked, likeSong, unlikeSong } = useLikedSongsStore();
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  
  // Keep a reference to the song for the playlist picker even after menu closes
  const songForPlaylistRef = useRef<Song | null>(null);

  // Update the ref when we have a valid song and menu is open
  useEffect(() => {
    if (song && isOpen) {
      songForPlaylistRef.current = song;
    }
  }, [song, isOpen]);

  // Clear the ref when playlist picker closes
  useEffect(() => {
    if (!showPlaylistPicker) {
      // Small delay to ensure animation completes before clearing
      const timer = setTimeout(() => {
        if (!isOpen) {
          songForPlaylistRef.current = null;
        }
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [showPlaylistPicker, isOpen]);

  // Get the song to use - either current song or the saved reference for playlist picker
  const effectiveSong = song || songForPlaylistRef.current;

  if (!effectiveSong && !showPlaylistPicker) return null;

  const liked = effectiveSong ? isLiked(effectiveSong.id) : false;
  const menuVisibility = getSongMenuVisibility(pageContext);
  const isNowPlaying = pageContext === 'now-playing';

  // Build header info
  const header: MobileMenuHeader | undefined = effectiveSong ? {
    artworkUrl: effectiveSong.artworkUrl,
    title: effectiveSong.name,
    subtitle: `${effectiveSong.artistName} · ${effectiveSong.albumName}`,
  } : undefined;

  const handleAddToQueue = () => {
    if (effectiveSong) {
      addToQueue(effectiveSong);
    }
    onClose();
  };

  const handleRemoveFromQueue = () => {
    if (!effectiveSong) {
      onClose();
      return;
    }
    // Check if this is the currently playing song
    const isCurrentSong = currentSong?.id === effectiveSong.id;
    
    if (isCurrentSong) {
      // If it's the current song, play next first, then remove
      // The removeFromQueue will handle the index adjustment
      next();
      // After next(), the queueIndex has moved, so we need to remove the previous index
      // But since next() already moved forward, the old song is now at queueIndex - 1
      // However, removeFromQueue expects the actual index in the queue
      const songIndex = queue.findIndex((s) => s.id === effectiveSong.id);
      if (songIndex !== -1) {
        // Use setTimeout to ensure next() completes first
        setTimeout(() => removeFromQueue(songIndex), 0);
      }
    } else {
      // Not the current song, just remove it
      const songIndex = queue.findIndex((s) => s.id === effectiveSong.id);
      if (songIndex !== -1) {
        removeFromQueue(songIndex);
      }
    }
    onClose();
  };

  const handleAddToPlaylist = () => {
    if (onAddToPlaylist) {
      onAddToPlaylist();
      onClose();
    } else {
      // Store the song reference before closing menu
      if (effectiveSong) {
        songForPlaylistRef.current = effectiveSong;
      }
      // Open playlist picker directly without closing menu first
      setShowPlaylistPicker(true);
      onClose();
    }
  };

  const handlePlaylistPickerClose = () => {
    setShowPlaylistPicker(false);
  };

  const handleLikeToggle = async () => {
    if (!effectiveSong) {
      onClose();
      return;
    }
    if (liked) {
      await unlikeSong(effectiveSong.id);
    } else {
      await likeSong(effectiveSong);
    }
    onClose();
  };

  const handleGoToArtist = () => {
    if (!effectiveSong) {
      onClose();
      return;
    }
    if (effectiveSong.artistId) {
      navigate(`/artist/${effectiveSong.artistId}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(effectiveSong.artistName)}`);
    }
    onClose();
  };

  const handleGoToAlbum = () => {
    if (!effectiveSong) {
      onClose();
      return;
    }
    if (effectiveSong.albumId) {
      navigate(`/album/${effectiveSong.albumId}`);
    } else {
      navigate(`/search?q=${encodeURIComponent(effectiveSong.albumName)}`);
    }
    onClose();
  };

  return (
    <>
    {effectiveSong && (
      <MobileMenu isOpen={isOpen} onClose={onClose} header={header}>
        {/* Add to queue / Remove from queue */}
        {isNowPlaying ? (
          <MobileMenuItem
            icon={<IoRemoveCircleOutline size={22} />}
            label="从播放队列中移除"
            onClick={handleRemoveFromQueue}
          />
        ) : (
          <MobileMenuItem
            icon={<IoMusicalNotes size={22} />}
            label="加入播放队列"
            onClick={handleAddToQueue}
          />
        )}

        {/* Add to playlist */}
        <MobileMenuItem
          icon={<IoList size={22} />}
          label="加入歌单"
          onClick={handleAddToPlaylist}
        />

        <MobileMenuDivider />

        {/* Like/Unlike */}
        <MobileMenuItem
          icon={liked ? <LikedIcon /> : <NotLikedIcon />}
          label={liked ? '从"已点赞的歌曲"中删除' : '收藏至你已点赞的歌曲'}
          onClick={handleLikeToggle}
        />

        {/* Go to artist / Go to album */}
        {(menuVisibility.showGoToArtist || menuVisibility.showGoToAlbum) && <MobileMenuDivider />}

        {menuVisibility.showGoToArtist && (
          <MobileMenuItem
            icon={<IoPerson size={22} />}
            label="转至艺术家"
            onClick={handleGoToArtist}
          />
        )}

        {menuVisibility.showGoToAlbum && (
          <MobileMenuItem
            icon={<IoDisc size={22} />}
            label="转至专辑"
            onClick={handleGoToAlbum}
          />
        )}
      </MobileMenu>
    )}

    {/* Playlist picker - use songForPlaylistRef to ensure song data persists */}
    {songForPlaylistRef.current && (
      <MobilePlaylistPicker
        song={songForPlaylistRef.current}
        isOpen={showPlaylistPicker}
        onClose={handlePlaylistPickerClose}
      />
    )}
    </>
  );
}
