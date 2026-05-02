import { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';
import CachedImage from './CachedImage';

interface MotionArtworkProps {
  videoUrl: string;
  fallbackImage?: string;
  alt?: string;
  className?: string;
  quality?: 'low' | 'high'; // low: 480p, high: 720p/1080p
  onError?: () => void;
  /** Song ID for cache-first fallback image lookup */
  songId?: string;
  /** Album ID for cache-first fallback image lookup */
  albumId?: string;
}

/**
 * MotionArtwork component displays a looping, muted video as dynamic artwork.
 * Falls back to static image if video fails to load.
 * Uses HLS.js for m3u8 playback on non-Safari browsers, native HLS on Safari.
 */
export function MotionArtwork({
  videoUrl,
  fallbackImage,
  alt = '',
  className = '',
  quality = 'high',
  onError,
  songId,
  albumId,
}: MotionArtworkProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) {
      setHasError(true);
      return;
    }

    // Reset states when videoUrl changes
    setHasError(false);
    setIsLoaded(false);

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsUrl = videoUrl.includes('.m3u8');

    if (isHlsUrl && Hls.isSupported()) {
      // Use HLS.js for non-Safari browsers
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const levels = hls.levels;
        let target = -1;

        if (quality === 'low') {
          // Prefer 480p for smaller displays (album detail page)
          target = levels.findIndex(l => l.height === 480);
          if (target === -1) {
            // Fallback to closest lower resolution
            target = levels.findIndex(l => l.height <= 480);
          }
        } else {
          // Prefer 720p or 1080p for larger displays (now playing)
          target =
            levels.findIndex(l => l.height === 720) !== -1
              ? levels.findIndex(l => l.height === 720)
              : levels.findIndex(l => l.height === 1080) !== -1
                ? levels.findIndex(l => l.height === 1080)
                : levels.length - 1;
        }

        if (target !== -1) {
          hls.currentLevel = target;
        }
        video.play().catch(() => {
          // Autoplay might be blocked
        });
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setHasError(true);
          onError?.();
          hls.destroy();
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = videoUrl;
      video.play().catch(() => {});
    } else if (!isHlsUrl) {
      // Regular video file (mp4, etc.)
      video.src = videoUrl;
      video.play().catch(() => {});
    } else {
      // HLS not supported and no fallback
      setHasError(true);
      onError?.();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoUrl, quality, onError]);

  const handleCanPlay = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Show fallback image if video fails or no video URL
  if (hasError || !videoUrl) {
    if (fallbackImage) {
      return (
        <CachedImage 
          src={fallbackImage} 
          alt={alt} 
          className={`w-full h-full object-cover ${className}`}
          songId={songId}
          albumId={albumId}
        />
      );
    }
    return null;
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Fallback image shown while video loads */}
      {!isLoaded && fallbackImage && (
        <CachedImage 
          src={fallbackImage} 
          alt={alt} 
          className="absolute inset-0 w-full h-full object-cover"
          songId={songId}
          albumId={albumId}
        />
      )}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        onCanPlay={handleCanPlay}
        onError={handleError}
        className={`w-full h-full object-cover ${!isLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
      />
    </div>
  );
}

export default MotionArtwork;
