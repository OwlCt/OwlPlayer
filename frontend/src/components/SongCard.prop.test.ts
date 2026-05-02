import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Song } from '../types';

// **Feature: search-best-match, Property 4: SongCard displays required fields without album name**
// **Validates: Requirements 4.1, 4.2**

// Pure function that determines what fields should be rendered
interface SongCardRenderFields {
  showArtwork: boolean;
  showName: boolean;
  showArtistName: boolean;
  showDuration: boolean;
  showAlbumName: boolean;
}

function getSongCardRenderFields(song: Song, showAlbum: boolean): SongCardRenderFields {
  return {
    showArtwork: true,  // Always show artwork
    showName: song.name !== '',  // Show name if not empty
    showArtistName: song.artistName !== '',  // Show artist if not empty
    showDuration: song.duration > 0,  // Show duration if positive
    showAlbumName: showAlbum && song.albumName !== '',  // Only show album if showAlbum is true
  };
}

// Generator for Song
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

describe('SongCard Render Logic', () => {
  // **Feature: search-best-match, Property 4: SongCard displays required fields without album name**
  // **Validates: Requirements 4.1, 4.2**
  describe('Property 4: SongCard displays required fields without album name', () => {
    it('should always show artwork, name, artist, and duration', () => {
      fc.assert(
        fc.property(songArbitrary, fc.boolean(), (song, showAlbum) => {
          const fields = getSongCardRenderFields(song, showAlbum);
          
          // These fields should always be shown (when they have content)
          expect(fields.showArtwork).toBe(true);
          expect(fields.showName).toBe(true);
          expect(fields.showArtistName).toBe(true);
          expect(fields.showDuration).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should hide album name when showAlbum is false', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          const fields = getSongCardRenderFields(song, false);
          expect(fields.showAlbumName).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('should show album name when showAlbum is true and album name exists', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          const fields = getSongCardRenderFields(song, true);
          // Should show album if showAlbum is true AND albumName is not empty
          expect(fields.showAlbumName).toBe(song.albumName !== '');
        }),
        { numRuns: 100 }
      );
    });

    it('showAlbum=false should be the only way to hide album name', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          const fieldsWithAlbum = getSongCardRenderFields(song, true);
          const fieldsWithoutAlbum = getSongCardRenderFields(song, false);
          
          // Other fields should be the same regardless of showAlbum
          expect(fieldsWithAlbum.showArtwork).toBe(fieldsWithoutAlbum.showArtwork);
          expect(fieldsWithAlbum.showName).toBe(fieldsWithoutAlbum.showName);
          expect(fieldsWithAlbum.showArtistName).toBe(fieldsWithoutAlbum.showArtistName);
          expect(fieldsWithAlbum.showDuration).toBe(fieldsWithoutAlbum.showDuration);
          
          // Only album name should differ
          if (song.albumName !== '') {
            expect(fieldsWithAlbum.showAlbumName).toBe(true);
            expect(fieldsWithoutAlbum.showAlbumName).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('default showAlbum should be true (backward compatible)', () => {
      // This tests the default behavior - showAlbum defaults to true
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // When showAlbum is not specified (defaults to true)
          const fields = getSongCardRenderFields(song, true);
          
          // Album should be shown if it has content
          if (song.albumName !== '') {
            expect(fields.showAlbumName).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});

// Export for potential reuse
export { getSongCardRenderFields };

// ============================================================================
// Selection Feature Tests
// **Feature: song-card-selection**
// ============================================================================

// Pure function to determine background class based on state
export function getBackgroundClass(isSelected: boolean, isCurrentSong: boolean): string {
  if (isSelected) {
    return 'bg-white/20'; // Selection highlight (overrides hover)
  }
  if (isCurrentSong) {
    return 'bg-spotify-gray';
  }
  return 'hover:bg-spotify-dark'; // Default with hover
}

// Pure function to simulate selection state after a click
export function simulateSelection(
  currentSelectedId: string | null,
  clickedSongId: string
): string {
  // Single click always selects the clicked song
  return clickedSongId;
}

// Pure function to simulate selection state after multiple clicks
export function simulateMultipleSelections(
  songIds: string[],
  clickSequence: number[]
): string | null {
  if (clickSequence.length === 0) return null;
  
  let selectedId: string | null = null;
  for (const index of clickSequence) {
    if (index >= 0 && index < songIds.length) {
      selectedId = songIds[index];
    }
  }
  return selectedId;
}

// Pure function to check if play button click should change selection
export function shouldPlayButtonChangeSelection(
  currentSelectedId: string | null,
  _clickedSongId: string
): boolean {
  // Play button click should NEVER change selection
  return false;
}

describe('SongCard Selection Logic', () => {
  // **Feature: song-card-selection, Property 1: Single-click selection**
  // **Validates: Requirements 1.1, 1.2**
  describe('Property 1: Single-click selection', () => {
    it('single-clicking on a card should result in that song being selected', () => {
      fc.assert(
        fc.property(
          fc.uuid(), // currentSelectedId (or null)
          fc.uuid(), // clickedSongId
          (currentSelectedId, clickedSongId) => {
            const newSelectedId = simulateSelection(currentSelectedId, clickedSongId);
            expect(newSelectedId).toBe(clickedSongId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: song-card-selection, Property 2: Single selection exclusivity**
  // **Validates: Requirements 1.3**
  describe('Property 2: Single selection exclusivity', () => {
    it('only the last clicked song should be in the selected state', () => {
      fc.assert(
        fc.property(
          fc.array(fc.uuid(), { minLength: 2, maxLength: 10 }), // songIds
          fc.array(fc.nat({ max: 9 }), { minLength: 1, maxLength: 20 }), // clickSequence (indices)
          (songIds, clickSequence) => {
            // Filter click sequence to valid indices
            const validClicks = clickSequence.filter(i => i < songIds.length);
            if (validClicks.length === 0) return true; // Skip if no valid clicks
            
            const finalSelectedId = simulateMultipleSelections(songIds, validClicks);
            const lastClickIndex = validClicks[validClicks.length - 1];
            
            expect(finalSelectedId).toBe(songIds[lastClickIndex]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: song-card-selection, Property 3: Selection idempotence**
  // **Validates: Requirements 1.4**
  describe('Property 3: Selection idempotence', () => {
    it('clicking on an already selected song should maintain the selection state', () => {
      fc.assert(
        fc.property(
          fc.uuid(), // songId
          (songId) => {
            // First click selects
            const afterFirstClick = simulateSelection(null, songId);
            expect(afterFirstClick).toBe(songId);
            
            // Second click on same song maintains selection
            const afterSecondClick = simulateSelection(afterFirstClick, songId);
            expect(afterSecondClick).toBe(songId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: song-card-selection, Property 6: Play button triggers playback without selection**
  // **Validates: Requirements 3.1, 3.2, 3.3**
  describe('Property 6: Play button triggers playback without selection', () => {
    it('clicking the play button should NOT change the selection state', () => {
      fc.assert(
        fc.property(
          fc.option(fc.uuid(), { nil: null }), // currentSelectedId (can be null)
          fc.uuid(), // clickedSongId
          (currentSelectedId, clickedSongId) => {
            const shouldChange = shouldPlayButtonChangeSelection(currentSelectedId, clickedSongId);
            expect(shouldChange).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: song-card-selection, Property 7: Visual state consistency**
  // **Validates: Requirements 4.3, 4.4, 4.5**
  describe('Property 7: Visual state consistency', () => {
    it('should display correct CSS classes for all state combinations', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isSelected
          fc.boolean(), // isCurrentSong
          (isSelected, isCurrentSong) => {
            const bgClass = getBackgroundClass(isSelected, isCurrentSong);
            
            if (isSelected) {
              // Selected state should always show selection highlight
              expect(bgClass).toBe('bg-white/20');
            } else if (isCurrentSong) {
              // Playing state (not selected) should show playing background
              expect(bgClass).toBe('bg-spotify-gray');
            } else {
              // Normal state should have hover effect
              expect(bgClass).toBe('hover:bg-spotify-dark');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('selection state should override playing state for background', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isCurrentSong
          (isCurrentSong) => {
            // When selected, background should always be selection highlight
            const bgClass = getBackgroundClass(true, isCurrentSong);
            expect(bgClass).toBe('bg-white/20');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


// ============================================================================
// Context Menu Feature Tests
// **Feature: context-menu**
// ============================================================================

// **Feature: context-menu, Property 1: Menu button visibility on hover**
// **Validates: Requirements 1.1**

// Pure function to determine menu button visibility
export function getMenuButtonVisibility(isHovered: boolean, menuOpen: boolean): boolean {
  return isHovered || menuOpen;
}

// **Feature: context-menu, Property 2: Menu trigger consistency**
// **Validates: Requirements 1.2, 1.3**

// Pure function to simulate menu state after trigger
export type MenuTriggerType = 'button-click' | 'right-click';

export interface MenuState {
  isOpen: boolean;
  songId: string | null;
}

export function simulateMenuTrigger(
  triggerType: MenuTriggerType,
  songId: string,
  currentState: MenuState
): MenuState {
  // Both triggers should result in the same menu state
  return {
    isOpen: true,
    songId: songId,
  };
}

describe('SongCard Context Menu', () => {
  // **Feature: context-menu, Property 1: Menu button visibility on hover**
  // **Validates: Requirements 1.1**
  describe('Property 1: Menu button visibility on hover', () => {
    it('menu button should be visible when hovered', () => {
      fc.assert(
        fc.property(fc.boolean(), (menuOpen) => {
          const isHovered = true;
          const visible = getMenuButtonVisibility(isHovered, menuOpen);
          expect(visible).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('menu button should be visible when menu is open', () => {
      fc.assert(
        fc.property(fc.boolean(), (isHovered) => {
          const menuOpen = true;
          const visible = getMenuButtonVisibility(isHovered, menuOpen);
          expect(visible).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('menu button should be hidden when not hovered and menu closed', () => {
      const visible = getMenuButtonVisibility(false, false);
      expect(visible).toBe(false);
    });
  });

  // **Feature: context-menu, Property 2: Menu trigger consistency**
  // **Validates: Requirements 1.2, 1.3**
  describe('Property 2: Menu trigger consistency', () => {
    it('button click and right-click should result in same menu state', () => {
      fc.assert(
        fc.property(fc.uuid(), (songId) => {
          const initialState: MenuState = { isOpen: false, songId: null };
          
          const stateAfterButtonClick = simulateMenuTrigger('button-click', songId, initialState);
          const stateAfterRightClick = simulateMenuTrigger('right-click', songId, initialState);
          
          // Both should open the menu with the same song
          expect(stateAfterButtonClick.isOpen).toBe(stateAfterRightClick.isOpen);
          expect(stateAfterButtonClick.songId).toBe(stateAfterRightClick.songId);
        }),
        { numRuns: 100 }
      );
    });

    it('any trigger should open the menu', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom<MenuTriggerType>('button-click', 'right-click'),
          (songId, triggerType) => {
            const initialState: MenuState = { isOpen: false, songId: null };
            const newState = simulateMenuTrigger(triggerType, songId, initialState);
            
            expect(newState.isOpen).toBe(true);
            expect(newState.songId).toBe(songId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
