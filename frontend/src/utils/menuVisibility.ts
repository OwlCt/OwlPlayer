import { PageContextType } from '../types';

/**
 * Menu visibility configuration for song context menu
 */
export interface SongMenuVisibility {
  showAddToLibrary: boolean;
  showGoToAlbum: boolean;
  showGoToArtist: boolean;
}

/**
 * Menu visibility configuration for album context menu
 */
export interface AlbumMenuVisibility {
  showGoToArtist: boolean;
}

/**
 * Calculate which menu items should be visible in the song context menu
 * based on the current page context.
 * 
 * @param pageContext - The current page context ('default', 'album', or 'artist')
 * @returns Object indicating which menu items should be shown
 */
export function getSongMenuVisibility(pageContext: PageContextType = 'default'): SongMenuVisibility {
  return {
    showAddToLibrary: false,  // Always hidden - like button serves this purpose
    showGoToAlbum: pageContext !== 'album',
    showGoToArtist: pageContext !== 'artist',
  };
}

/**
 * Calculate which menu items should be visible in the album context menu
 * based on the current page context.
 * 
 * @param pageContext - The current page context ('default', 'album', or 'artist')
 * @returns Object indicating which menu items should be shown
 */
export function getAlbumMenuVisibility(pageContext: PageContextType = 'default'): AlbumMenuVisibility {
  return {
    showGoToArtist: pageContext !== 'artist',
  };
}
