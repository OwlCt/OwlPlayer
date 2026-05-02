import { useState, useCallback } from 'react';
import { getArtworkType, ArtistArtworkData } from '../utils/artworkSelector';
import { ArtistHeroVideo } from './ArtistHeroVideo';
import { ArtistHeroImage } from './ArtistHeroImage';

interface ArtistHeroProps {
  motionVideoUrl?: string;
  landscapeUrl?: string;
  artworkUrl?: string;
  artworkWidth?: number;
  artworkHeight?: number;
  artistName: string;
  className?: string;
  /** If true, treat high-res artwork (>= 1000x1000) as landscape display */
  useHighResAsLandscape?: boolean;
}

/**
 * ArtistHero container component orchestrates video/image display based on artwork type.
 * Handles fallback when video fails to load.
 * 
 * Priority order: motionVideoUrl > landscapeUrl > artworkUrl (avatar)
 * 
 * Requirements: 4.1, 4.2
 * - Check for motion video first, then landscape artwork, then circular avatar
 * - Display appropriate artwork type based on current data
 */
export function ArtistHero({
  motionVideoUrl,
  landscapeUrl,
  artworkUrl,
  artworkWidth,
  artworkHeight,
  artistName,
  className = '',
  useHighResAsLandscape = true,
}: ArtistHeroProps) {
  // Track if video failed to load, to trigger fallback
  const [videoFailed, setVideoFailed] = useState(false);

  // Check if artwork is high-res (>= 1000x1000)
  const isHighResArtwork = !!(
    artworkUrl &&
    artworkWidth && artworkWidth >= 1000 &&
    artworkHeight && artworkHeight >= 1000
  );

  // If high-res artwork and no landscape URL, use artwork as landscape
  const effectiveLandscapeUrl = landscapeUrl || (useHighResAsLandscape && isHighResArtwork ? artworkUrl : undefined);

  // Build artwork data for type selection
  const artworkData: ArtistArtworkData = {
    // If video failed, treat as if no video URL exists
    motionVideoUrl: videoFailed ? undefined : motionVideoUrl,
    landscapeUrl: effectiveLandscapeUrl,
    artworkUrl,
  };

  const artworkType = getArtworkType(artworkData);

  // Handle video error - fallback to next priority
  const handleVideoError = useCallback(() => {
    setVideoFailed(true);
  }, []);

  // Reset video failed state when motionVideoUrl changes
  // This allows retry when a new video URL is provided
  const [prevVideoUrl, setPrevVideoUrl] = useState(motionVideoUrl);
  if (motionVideoUrl !== prevVideoUrl) {
    setPrevVideoUrl(motionVideoUrl);
    setVideoFailed(false);
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {artworkType === 'video' && motionVideoUrl && (
        <ArtistHeroVideo
          videoUrl={motionVideoUrl}
          onError={handleVideoError}
          className="absolute inset-0"
        />
      )}
      {artworkType === 'landscape' && effectiveLandscapeUrl && (
        <ArtistHeroImage
          imageUrl={effectiveLandscapeUrl}
          isLandscape={true}
          alt={artistName}
          className="absolute inset-0"
        />
      )}
      {artworkType === 'avatar' && artworkUrl && (
        <ArtistHeroImage
          imageUrl={artworkUrl}
          isLandscape={!!(artworkWidth && artworkHeight && artworkWidth > artworkHeight)}
          alt={artistName}
          className="absolute inset-0"
        />
      )}
      {/* Gradient overlay for better text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
    </div>
  );
}

export default ArtistHero;
