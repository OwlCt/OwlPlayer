/**
 * Artwork type for artist hero display
 */
export type ArtworkType = 'video' | 'landscape' | 'avatar';

/**
 * Artist artwork data for determining display type
 */
export interface ArtistArtworkData {
  motionVideoUrl?: string;
  landscapeUrl?: string;
  artworkUrl?: string;
}

/**
 * Determine the artwork type to display based on data availability.
 * Priority order: motionVideoUrl > landscapeUrl > artworkUrl (avatar)
 * 
 * @param data - Artist artwork data containing optional URLs
 * @returns The artwork type to display: 'video', 'landscape', or 'avatar'
 */
export function getArtworkType(data: ArtistArtworkData): ArtworkType {
  if (data.motionVideoUrl && data.motionVideoUrl.trim() !== '') {
    return 'video';
  }
  if (data.landscapeUrl && data.landscapeUrl.trim() !== '') {
    return 'landscape';
  }
  return 'avatar';
}
