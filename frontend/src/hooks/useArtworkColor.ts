import { useState, useEffect } from 'react';
import { extractColorsFromImage } from '../utils/colorExtractor';
import { getProxiedImageUrl } from '../utils/image';

interface ArtworkColors {
  dominant: string;
  vibrant: string;
  muted: string;
  darkMuted: string;
  lightMuted: string;
  isLoading: boolean;
}

const defaultColors: ArtworkColors = {
  dominant: '#1a1a1a',
  vibrant: '#1db954',
  muted: '#535353',
  darkMuted: '#151515',
  lightMuted: '#b3b3b3',
  isLoading: false,
};

/**
 * Hook to extract and manage colors from artwork
 * @param artworkUrl - The URL of the artwork image
 * @returns Colors extracted from the artwork
 */
export function useArtworkColor(artworkUrl: string | undefined): ArtworkColors {
  const [colors, setColors] = useState<ArtworkColors>(defaultColors);

  useEffect(() => {
    if (!artworkUrl) {
      setColors(defaultColors);
      return;
    }

    let cancelled = false;
    setColors(prev => ({ ...prev, isLoading: true }));

    // Use proxied URL to avoid CORS issues
    const proxiedUrl = getProxiedImageUrl(artworkUrl, 100);

    extractColorsFromImage(proxiedUrl)
      .then(extractedColors => {
        if (!cancelled) {
          setColors({
            ...extractedColors,
            isLoading: false,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setColors({ ...defaultColors, isLoading: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [artworkUrl]);

  return colors;
}

export default useArtworkColor;
