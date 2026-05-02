import { useState } from 'react';
import { IoPlay, IoPause } from 'react-icons/io5';
import { FiHeart } from 'react-icons/fi';
import { TopTrackItem } from '../store/playHistoryStore';
import { usePlayerStore } from '../store/playerStore';
import { useLikedSongsStore } from '../store/likedSongsStore';
import { getProxiedImageUrl } from '../utils/image';
import ClickableLink, { getArtistHref, getAlbumHref } from './ClickableLink';
import CachedImage from './CachedImage';

export interface ProfileTrackRowProps {
  track: TopTrackItem;
  index: number;
  onPlay: () => void;
  isLiked: boolean;
}

/**
 * Format duration from milliseconds to mm:ss format
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * ProfileTrackRow - Song row component for profile page top tracks
 * Displays: index, artwork, song name, artist name, album name, like status, duration
 */
export default function ProfileTrackRow({ track, index, onPlay, isLiked }: ProfileTrackRowProps) {
  const { currentSong, isPlaying, togglePlay } = usePlayerStore();
  const [isHovered, setIsHovered] = useState(false);

  const isCurrentSong = currentSong?.id === track.songId;

  const handleClick = () => {
    if (isCurrentSong) {
      togglePlay();
    } else {
      onPlay();
    }
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex items-center gap-4 p-2 rounded-lg cursor-pointer group transition-colors ${
        isCurrentSong ? 'bg-spotify-gray' : 'hover:bg-spotify-dark'
      }`}
    >
      {/* Index or play button */}
      <div className="w-8 flex items-center justify-center">
        {isCurrentSong && isPlaying && !isHovered ? (
          <div className="equalizer">
            <div className="equalizer-bar"></div>
            <div className="equalizer-bar"></div>
            <div className="equalizer-bar"></div>
            <div className="equalizer-bar"></div>
          </div>
        ) : (
          <>
            <span className={`text-sm ${isCurrentSong ? 'text-spotify-green' : 'text-spotify-light-gray'} group-hover:hidden`}>
              {index}
            </span>
            <button className="hidden group-hover:flex items-center justify-center">
              {isCurrentSong && isPlaying ? (
                <IoPause className="text-white" />
              ) : (
                <IoPlay className="text-white" />
              )}
            </button>
          </>
        )}
      </div>

      {/* Artwork */}
      <div className="w-10 h-10 bg-spotify-gray rounded overflow-hidden flex-shrink-0">
        {track.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(track.artworkUrl, 80)}
            alt={track.songName}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-spotify-light-gray">
            ♪
          </div>
        )}
      </div>

      {/* Song info */}
      <div className="flex-1 min-w-0">
        <h3 className={`font-medium truncate ${isCurrentSong ? 'text-spotify-green' : 'text-white'}`}>
          {track.songName}
        </h3>
        <p className="text-sm text-spotify-light-gray truncate">
          <ClickableLink
            text={track.artistName}
            href={getArtistHref(track.artistId)}
            disabled={!track.artistId}
          />
        </p>
      </div>

      {/* Album name */}
      <div className="hidden md:block flex-1 min-w-0">
        <p className="text-sm text-spotify-light-gray truncate">
          <ClickableLink
            text={track.albumName}
            href={getAlbumHref(track.albumId)}
            disabled={!track.albumId}
          />
        </p>
      </div>

      {/* Like status indicator */}
      <div className="w-8 flex items-center justify-center">
        {isLiked && (
          <FiHeart className="w-4 h-4 text-spotify-green fill-spotify-green" />
        )}
      </div>

      {/* Duration */}
      <div className="text-sm text-spotify-light-gray w-12 text-right">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
}
