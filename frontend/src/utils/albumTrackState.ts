/**
 * Utility functions for album track row state logic
 * These functions are extracted for testability
 */

export interface TrackPlayState {
  isCurrentSong: boolean;
  isPlaying: boolean;
  isHovered: boolean;
}

/**
 * Determines which icon should be displayed for a track row
 * @returns 'pause' if current song is playing, 'play' otherwise
 */
export function getTrackPlayIcon(state: TrackPlayState): 'play' | 'pause' {
  if (state.isCurrentSong && state.isPlaying) {
    return 'pause';
  }
  return 'play';
}

/**
 * Determines if the track index should be highlighted (green)
 * @returns true if this is the current song
 */
export function shouldHighlightTrack(isCurrentSong: boolean): boolean {
  return isCurrentSong;
}

/**
 * Determines if the play button should be visible
 * @returns true if the row is hovered
 */
export function shouldShowPlayButton(isHovered: boolean): boolean {
  return isHovered;
}

/**
 * Determines if the track index should be visible
 * @returns true if the row is NOT hovered
 */
export function shouldShowTrackIndex(isHovered: boolean): boolean {
  return !isHovered;
}
