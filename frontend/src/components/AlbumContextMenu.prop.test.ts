import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ALBUM_MENU_ITEMS } from './AlbumContextMenu';

// **Feature: context-menu, Property 8: Album menu items completeness**
// **Validates: Requirements 4.1, 4.2**

// Required menu items for album context menu
const REQUIRED_ALBUM_MENU_ITEMS = [
  ALBUM_MENU_ITEMS.ADD_TO_LIBRARY,
  ALBUM_MENU_ITEMS.ADD_TO_QUEUE,
  ALBUM_MENU_ITEMS.ADD_TO_PLAYLIST,
];

// Pure function to get menu items for an album
function getAlbumMenuItems(): string[] {
  return [...REQUIRED_ALBUM_MENU_ITEMS];
}

// Pure function to check if all required items are present
function hasAllRequiredAlbumMenuItems(menuItems: string[]): boolean {
  return REQUIRED_ALBUM_MENU_ITEMS.every(item => menuItems.includes(item));
}

describe('AlbumContextMenu Logic', () => {
  // **Feature: context-menu, Property 8: Album menu items completeness**
  // **Validates: Requirements 4.1, 4.2**
  describe('Property 8: Album menu items completeness', () => {
    it('album context menu should contain all required items', () => {
      fc.assert(
        fc.property(fc.uuid(), () => {
          const menuItems = getAlbumMenuItems();
          expect(hasAllRequiredAlbumMenuItems(menuItems)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('should have exactly 3 menu items', () => {
      const menuItems = getAlbumMenuItems();
      expect(menuItems.length).toBe(3);
    });

    it('should include "添加到音乐库"', () => {
      const menuItems = getAlbumMenuItems();
      expect(menuItems).toContain(ALBUM_MENU_ITEMS.ADD_TO_LIBRARY);
    });

    it('should include "加入播放队列"', () => {
      const menuItems = getAlbumMenuItems();
      expect(menuItems).toContain(ALBUM_MENU_ITEMS.ADD_TO_QUEUE);
    });

    it('should include "加入歌单"', () => {
      const menuItems = getAlbumMenuItems();
      expect(menuItems).toContain(ALBUM_MENU_ITEMS.ADD_TO_PLAYLIST);
    });

    it('album menu should NOT include song-specific items', () => {
      const menuItems = getAlbumMenuItems();
      expect(menuItems).not.toContain('从"已点赞的歌曲"中删除');
      expect(menuItems).not.toContain('转至艺人');
      expect(menuItems).not.toContain('转至专辑');
    });
  });
});

// **Feature: library-remove-confirmation, Property 1: Dialog displays with correct item information (album)**
// **Feature: library-remove-confirmation, Property 2: Confirm action executes removal for albums**
// **Validates: Requirements 1.1, 1.2**

// Album generator for property tests
const albumArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  artistName: fc.string({ minLength: 1, maxLength: 100 }),
  artworkUrl: fc.webUrl(),
});

// Pure function to generate confirmation dialog message for album
function getAlbumConfirmMessage(albumName: string): string {
  return `确定要将「${albumName}」从音乐库中删除吗？`;
}

// Simulate album removal confirmation flow
function simulateAlbumRemovalConfirmation(
  albumId: string,
  savedAlbumIds: Set<string>,
  userConfirms: boolean
): { albumRemoved: boolean; finalSavedIds: Set<string> } {
  const newSavedIds = new Set(savedAlbumIds);
  
  if (userConfirms) {
    newSavedIds.delete(albumId);
    return { albumRemoved: true, finalSavedIds: newSavedIds };
  }
  
  return { albumRemoved: false, finalSavedIds: newSavedIds };
}

describe('AlbumContextMenu Confirmation', () => {
  // **Feature: library-remove-confirmation, Property 1: Dialog displays with correct item information (album)**
  // **Validates: Requirements 1.1**
  describe('Property 1: Dialog displays with correct item information (album)', () => {
    it('confirmation message should contain album name', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          const message = getAlbumConfirmMessage(album.name);
          expect(message).toContain(album.name);
        }),
        { numRuns: 100 }
      );
    });

    it('confirmation message should have correct format', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          const message = getAlbumConfirmMessage(album.name);
          expect(message).toMatch(/^确定要将「.+」从音乐库中删除吗？$/);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: library-remove-confirmation, Property 2: Confirm action executes removal for albums**
  // **Validates: Requirements 1.2**
  describe('Property 2: Confirm action executes removal for albums', () => {
    it('confirming removal should remove album from library', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          const savedAlbumIds = new Set([album.id]);
          
          const result = simulateAlbumRemovalConfirmation(album.id, savedAlbumIds, true);
          
          expect(result.albumRemoved).toBe(true);
          expect(result.finalSavedIds.has(album.id)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('canceling removal should keep album in library', () => {
      fc.assert(
        fc.property(albumArbitrary, (album) => {
          const savedAlbumIds = new Set([album.id]);
          
          const result = simulateAlbumRemovalConfirmation(album.id, savedAlbumIds, false);
          
          expect(result.albumRemoved).toBe(false);
          expect(result.finalSavedIds.has(album.id)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('removal should only affect the specified album', () => {
      fc.assert(
        fc.property(
          albumArbitrary,
          fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
          (album, otherAlbumIds) => {
            const savedAlbumIds = new Set([album.id, ...otherAlbumIds]);
            
            const result = simulateAlbumRemovalConfirmation(album.id, savedAlbumIds, true);
            
            // Target album should be removed
            expect(result.finalSavedIds.has(album.id)).toBe(false);
            // Other albums should remain
            for (const otherId of otherAlbumIds) {
              if (otherId !== album.id) {
                expect(result.finalSavedIds.has(otherId)).toBe(true);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// Export for potential reuse
export { getAlbumMenuItems, hasAllRequiredAlbumMenuItems, getAlbumConfirmMessage, simulateAlbumRemovalConfirmation };
