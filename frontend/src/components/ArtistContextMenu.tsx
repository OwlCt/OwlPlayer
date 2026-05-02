import { useState } from 'react';
import { IoPersonAdd, IoPersonRemove } from 'react-icons/io5';
import { ContextMenu, MenuItem, MenuPosition } from './ContextMenu';
import ConfirmDialog from './ConfirmDialog';
import { useFollowedArtistsStore, ArtistInfo } from '../store/followedArtistsStore';

interface ArtistContextMenuProps {
  artist: ArtistInfo;
  isOpen: boolean;
  position: MenuPosition;
  onClose: () => void;
}

// Menu item labels (exported for testing)
export const ARTIST_MENU_ITEMS = {
  FOLLOW: '关注',
  UNFOLLOW: '取消关注',
} as const;

/**
 * Determines the menu label based on follow state.
 * Exported for property testing.
 */
export function getArtistMenuLabel(isFollowed: boolean): string {
  return isFollowed ? ARTIST_MENU_ITEMS.UNFOLLOW : ARTIST_MENU_ITEMS.FOLLOW;
}

export default function ArtistContextMenu({ artist, isOpen, position, onClose }: ArtistContextMenuProps) {
  const { isFollowed, followArtist, unfollowArtist } = useFollowedArtistsStore();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const artistIsFollowed = isFollowed(artist.id);

  const handleFollowClick = async () => {
    try {
      await followArtist(artist);
    } catch (err) {
      console.error('Failed to follow artist:', err);
    }
    onClose();
  };

  const handleUnfollowClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmUnfollow = async () => {
    try {
      await unfollowArtist(artist.id);
    } catch (err) {
      console.error('Failed to unfollow artist:', err);
    }
    setShowConfirmDialog(false);
    onClose();
  };

  const handleCancelUnfollow = () => {
    setShowConfirmDialog(false);
  };

  return (
    <ContextMenu isOpen={isOpen} position={position} onClose={onClose}>
      <MenuItem
        icon={artistIsFollowed ? <IoPersonRemove /> : <IoPersonAdd />}
        label={getArtistMenuLabel(artistIsFollowed)}
        onClick={artistIsFollowed ? handleUnfollowClick : handleFollowClick}
      />
      
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="取消关注"
        message={`确定要取消关注「${artist.name}」吗？`}
        confirmText="取消关注"
        cancelText="保留"
        onConfirm={handleConfirmUnfollow}
        onCancel={handleCancelUnfollow}
        isDestructive
      />
    </ContextMenu>
  );
}
