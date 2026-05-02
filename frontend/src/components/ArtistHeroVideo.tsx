import { useRef, useEffect, useState } from 'react';
import Hls from 'hls.js';

interface ArtistHeroVideoProps {
  videoUrl: string;
  onError?: () => void;
  className?: string;
}

/**
 * ArtistHeroVideo component displays a looping, muted video as the artist header background.
 * Uses HLS.js for m3u8 playback on non-Safari browsers, native HLS on Safari.
 * 
 * Requirements: 1.3, 1.4
 * - Display video as header background when motion video data is available
 * - Loop video continuously without audio
 */
export function ArtistHeroVideo({ videoUrl, onError, className = '' }: ArtistHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    // Reset error state when videoUrl changes
    setHasError(false);

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
        // Prefer 720p resolution
        capLevelToPlayerSize: true,
      });

      hls.loadSource(videoUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Find 720p level or closest
        const levels = hls.levels;
        const target720p = levels.findIndex(l => l.height === 720);
        if (target720p !== -1) {
          hls.currentLevel = target720p;
        }
        video.play().catch(() => {
          // Autoplay might be blocked, that's ok
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
  }, [videoUrl, onError]);

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  // Don't render if there's an error
  if (hasError) {
    return null;
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      onError={handleError}
      className={`w-full h-full object-cover ${className}`}
    />
  );
}

export default ArtistHeroVideo;
