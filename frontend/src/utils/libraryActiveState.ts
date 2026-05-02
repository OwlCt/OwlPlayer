/**
 * Utility functions for determining library item active and playing states.
 * These functions are extracted for testability and reuse across components.
 */

import { QueueSource } from '../store/playerStore';

/**
 * Determine if a library item is active based on the current page.
 * An item is active when the user is viewing its detail page.
 * 
 * @param type - The type of library item ('playlist', 'album', 'artist', 'liked-songs')
 * @param id - The unique identifier of the item
 * @param currentPage - The current page string (e.g., 'playlist-123', 'album-456')
 * @returns true if the item is the currently active page
 */
export function isItemActive(type: string, id: string, currentPage: string): boolean {
  switch (type) {
    case 'playlist':
      return currentPage === `playlist-${id}`;
    case 'album':
      return currentPage === `album-${id}`;
    case 'artist':
      return currentPage === `artist-${id}`;
    case 'liked-songs':
      return currentPage === 'liked-songs';
    default:
      return false;
  }
}

/**
 * Determine if a library item is currently playing.
 * An item is playing when the queue source matches the item's type and id.
 * 
 * @param type - The type of library item
 * @param id - The unique identifier of the item
 * @param isPlayerPlaying - Whether the player is currently playing
 * @param queueSource - The current queue source
 * @returns true if the item is currently playing
 */
export function isItemPlaying(
  type: string,
  id: string,
  isPlayerPlaying: boolean,
  queueSource: QueueSource
): boolean {
  if (!isPlayerPlaying) return false;
  return queueSource.type === type && queueSource.id === id;
}

/**
 * Determine if liked songs are currently playing.
 * 
 * @param isPlayerPlaying - Whether the player is currently playing
 * @param queueSource - The current queue source
 * @returns true if liked songs are currently playing
 */
export function isLikedSongsPlaying(
  isPlayerPlaying: boolean,
  queueSource: QueueSource
): boolean {
  if (!isPlayerPlaying) return false;
  return queueSource.type === 'liked-songs';
}

/**
 * Validate that a playlist name is not empty or whitespace-only.
 * 
 * @param name - The playlist name to validate
 * @returns true if the name is valid (non-empty, non-whitespace)
 */
export function isValidPlaylistName(name: string): boolean {
  return name.trim().length > 0;
}
