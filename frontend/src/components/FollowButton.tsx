import { useState } from 'react';
import { useFollowedArtistsStore, ArtistInfo } from '../store/followedArtistsStore';
import { useToastStore } from '../store/toastStore';

interface FollowButtonProps {
  artistId: string;
  artistName: string;
  artworkUrl?: string;
  className?: string;
}

export function FollowButton({ artistId, artistName, artworkUrl, className = '' }: FollowButtonProps) {
  const { isFollowed, followArtist, unfollowArtist } = useFollowedArtistsStore();
  const { showToast } = useToastStore();
  const [isLoading, setIsLoading] = useState(false);

  const followed = isFollowed(artistId);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      if (followed) {
        await unfollowArtist(artistId);
        showToast('已取消关注。');
      } else {
        const artist: ArtistInfo = {
          id: artistId,
          name: artistName,
          artworkUrl,
        };
        await followArtist(artist);
        showToast('已关注艺术家。');
      }
    } catch (err) {
      console.error('Follow/unfollow failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Determine button content
  const getButtonContent = () => {
    if (followed) {
      return <span>关注中</span>;
    }
    return <span>关注</span>;
  };

  const getButtonStyles = () => {
    const baseStyles = `
      inline-flex items-center justify-center
      px-4 py-1.5
      text-sm font-medium
      rounded-full
      transition-all duration-150
      border
      cursor-pointer
      bg-transparent border-white/50 text-white hover:border-white hover:scale-105
    `;

    return baseStyles;
  };

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      className={`${getButtonStyles()} ${className}`}
    >
      {getButtonContent()}
    </button>
  );
}

export default FollowButton;
