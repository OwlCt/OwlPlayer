/**
 * Image type for drag link generation
 */
export type ImageType = 'artist' | 'album' | 'playlist';

/**
 * Generates a drag URL for the given image type and ID.
 * The URL follows the format: {origin}/{type}/{id}
 * 
 * @param type - The type of image (artist, album, playlist)
 * @param id - The unique identifier for the content
 * @returns The full URL to the content page
 */
export function generateDragUrl(type: ImageType, id: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/${type}/${id}`;
}
