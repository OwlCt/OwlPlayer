import { useState, useEffect, useCallback, ImgHTMLAttributes, forwardRef, useRef } from 'react';
import { cacheImageBlob, getCachedImageBlobUrl, isImageBlobCached } from '../services/imageBlobCache';
import { getCacheFirstArtworkUrl, getCacheFirstAlbumArtworkUrl, getCacheFirstPlaylistArtworkUrl } from '../utils/cacheFirstImage';

interface CachedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'onError' | 'onLoad'> {
  src: string;
  fallbackSrc?: string;
  maxRetries?: number;
  retryDelay?: number;
  showLoadingPlaceholder?: boolean;
  /** Allow dragging the image (default: false for protection) */
  allowDrag?: boolean;
  /** Song ID for cache-first artwork lookup */
  songId?: string;
  /** Album ID for cache-first artwork lookup */
  albumId?: string;
  /** Playlist ID for cache-first artwork lookup */
  playlistId?: string;
}

// CSS styles to protect image from long-press save and drag
const protectedImageStyle: React.CSSProperties = {
  WebkitTouchCallout: 'none', // Disable iOS long-press menu
  WebkitUserSelect: 'none',   // Disable selection on webkit
  userSelect: 'none',         // Disable selection
  pointerEvents: 'none',      // Disable all pointer events on the image itself
};

export function shouldRetryImageLoad(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return false;
  }

  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.pathname.startsWith('/api/artwork/')) {
      return false;
    }
  } catch {
    if (trimmed.startsWith('/api/artwork/')) {
      return false;
    }
  }

  return true;
}

/**
 * CachedImage component with automatic retry on load failure.
 * Handles the case where backend is still caching the image.
 */
export const CachedImage = forwardRef<HTMLImageElement, CachedImageProps>(({
  src,
  fallbackSrc,
  maxRetries = 3,
  retryDelay = 800,
  showLoadingPlaceholder = false,
  allowDrag = false,
  songId,
  albumId,
  playlistId,
  className,
  alt,
  style,
  draggable,
  ...props
}, ref) => {
  // Merge protection styles unless dragging is explicitly allowed
  const imageStyle = allowDrag ? style : { ...protectedImageStyle, ...style };
  const isDraggable = allowDrag ? draggable : false;
  const retryTimeoutRef = useRef<number | null>(null);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Check cache first when component mounts or IDs change
  useEffect(() => {
    const checkCache = async () => {
      let cachedUrl: string | null = null;

      try {
        cachedUrl = await getCachedImageBlobUrl(src);
      } catch {}

      if (!cachedUrl) {
        try {
          if (songId) {
            cachedUrl = await getCacheFirstArtworkUrl(songId, src);
          } else if (albumId) {
            cachedUrl = await getCacheFirstAlbumArtworkUrl(albumId, src);
          } else if (playlistId) {
            cachedUrl = await getCacheFirstPlaylistArtworkUrl(playlistId, src);
          }
        } catch (error) {
          console.warn('[CachedImage] Cache check failed:', error);
        }
      }

      if (cachedUrl && cachedUrl !== src) {
        setCurrentSrc(cachedUrl);
      } else {
        setCurrentSrc(src);
      }
    };
    
    checkCache();
  }, [src, songId, albumId, playlistId]);

  // Reset transient state only when the incoming source context changes.
  useEffect(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setRetryCount(0);
    setIsLoaded(false);
    setHasError(false);
  }, [src, songId, albumId, playlistId]);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current !== null) {
        window.clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const handleError = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    if (shouldRetryImageLoad(src) && retryCount < maxRetries) {
      retryTimeoutRef.current = window.setTimeout(() => {
        const separator = src.includes('?') ? '&' : '?';
        setCurrentSrc(`${src}${separator}_retry=${retryCount + 1}&_t=${Date.now()}`);
        setRetryCount((prev) => prev + 1);
        retryTimeoutRef.current = null;
      }, retryDelay * Math.pow(1.5, retryCount));
      return;
    }

    if (fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setHasError(true);
      setIsLoaded(true);
    } else {
      setHasError(true);
      setIsLoaded(true);
    }
  }, [src, retryCount, maxRetries, retryDelay, fallbackSrc]);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
    setHasError(false);

    // Persist successfully loaded images to IndexedDB so they survive cache evictions.
    // Skip when offline: the response is likely the SW's offline placeholder SVG, not
    // the real image, and we don't want to permanently cache the placeholder.
    const online = typeof navigator === 'undefined' || navigator.onLine;
    if (online && currentSrc && !currentSrc.startsWith('blob:') && !currentSrc.startsWith('data:')) {
      void (async () => {
        try {
          if (await isImageBlobCached(currentSrc)) return;
          const res = await fetch(currentSrc, { credentials: 'same-origin', cache: 'default' });
          if (!res.ok) return;
          const blob = await res.blob();
          // SW offline placeholder is image/svg+xml; skip it so we don't permanently cache
          // the dark grey placeholder. Real artwork is jpeg/png/webp.
          if (blob.size > 0 && !blob.type.includes('svg')) {
            await cacheImageBlob(currentSrc, blob);
          }
        } catch {}
      })();
    }
  }, [currentSrc]);

  if (!src) {
    return null;
  }

  // If showing loading placeholder, wrap in relative container
  if (showLoadingPlaceholder) {
    return (
      <div className="relative" style={{ width: '100%', height: '100%' }}>
        {!isLoaded && !hasError && (
          <div 
            className={`absolute inset-0 bg-white/10 animate-pulse ${className}`}
          />
        )}
        <img
          ref={ref}
          src={currentSrc}
          alt={alt}
          className={className}
          onError={handleError}
          onLoad={handleLoad}
          draggable={isDraggable}
          onContextMenu={allowDrag ? undefined : (e) => e.preventDefault()}
          style={{
            ...imageStyle,
            opacity: isLoaded ? 1 : 0,
            transition: 'opacity 0.2s ease-in-out'
          }}
          {...props}
        />
      </div>
    );
  }

  // Simple mode - just retry on error without placeholder
  return (
    <img
      ref={ref}
      src={currentSrc}
      alt={alt}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
      draggable={isDraggable}
      onContextMenu={allowDrag ? undefined : (e) => e.preventDefault()}
      style={imageStyle}
      {...props}
    />
  );
});

CachedImage.displayName = 'CachedImage';

export default CachedImage;
