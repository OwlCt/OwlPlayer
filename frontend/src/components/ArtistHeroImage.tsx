import { getProxiedImageUrl } from '../utils/image';

interface ArtistHeroImageProps {
  imageUrl: string;
  isLandscape: boolean;
  alt?: string;
  className?: string;
}

/**
 * ArtistHeroImage component displays landscape or standard artwork as the artist header background.
 * Uses CSS object-fit: cover for proper cropping to fill the container.
 * 
 * Requirements: 2.1, 2.2, 2.3
 * - Display landscape image as header background when no motion video available
 * - Use appropriate resolution for display size
 * - Fall back to circular avatar display when neither video nor landscape available
 * 
 * Note: Apple Music artist images only support certain resolutions (300, 500, 1000, original).
 * Intermediate sizes like 1500, 1920, 2000 return 403 Forbidden.
 * Backend handles fallback to valid sizes automatically.
 */
export function ArtistHeroImage({ imageUrl, isLandscape, alt = '', className = '' }: ArtistHeroImageProps) {
  // Use 1000 for artist square images (Apple Music supported size)
  // For true landscape images (editorialArtwork), use 1920
  // Backend will handle fallback if the requested size returns 403
  const resolution = isLandscape ? 1000 : 1000;
  const proxiedUrl = getProxiedImageUrl(imageUrl, resolution);

  return (
    <img
      src={proxiedUrl}
      alt={alt}
      // object-position: center 33% means the focal point is at 33% from top (upper 1/3)
      // This ensures artist's head/face is visible when cropping square images to landscape
      className={`w-full h-full object-cover ${className}`}
      style={{ objectPosition: 'center 33%' }}
    />
  );
}

export default ArtistHeroImage;
