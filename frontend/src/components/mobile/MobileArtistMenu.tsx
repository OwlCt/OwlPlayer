import { useState } from 'react';
import { IoPersonAdd, IoPersonRemove } from 'react-icons/io5';
import MobileMenu, { MobileMenuItem, MobileMenuHeader } from './MobileMenu';
import ConfirmDialog from '../ConfirmDialog';
import { useFollowedArtistsStore, ArtistInfo } from '../../store/followedArtistsStore';

interface MobileArtistMenuProps {
  artist: ArtistInfo | null;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * MobileArtistMenu - Mobile-optimized artist context menu
 * Uses bottom sheet presentation with same content as PC version
 */
export default function MobileArtistMenu({ artist, isOpen, onClose }: MobileArtistMenuProps) {
  const { isFollowed, followArtist, unfollowArtist } = useFollowedArtistsStore();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  if (!artist) return null;

  const artistIsFollowed = isFollowed(artist.id);

  // Build header info
  const header: MobileMenuHeader = {
    artworkUrl: artist.artworkUrl,
    title: artist.name,
    subtitle: '艺术家',
  };

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
    <>
      <MobileMenu isOpen={isOpen} onClose={onClose} header={header}>
        {/* Follow/Unfollow */}
        <MobileMenuItem
          icon={artistIsFollowed ? <IoPersonRemove size={22} /> : <IoPersonAdd size={22} />}
          label={artistIsFollowed ? '取消关注' : '关注'}
          onClick={artistIsFollowed ? handleUnfollowClick : handleFollowClick}
        />
      </MobileMenu>

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
    </>
  );
}
