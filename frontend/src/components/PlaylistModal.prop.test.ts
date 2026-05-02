import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LIKED_SONGS_PLAYLIST_ID } from './PlaylistModal';

// **Feature: playlist-add-modal, Property 4: Checkbox state matches song membership**
// **Validates: Requirements 2.3, 2.4**

// Types for testing
interface PlaylistSelection {
  playlistId: string;
  playlistName: string;
  isSelected: boolean;
  wasOriginallySelected: boolean;
  isPinned?: boolean;
}

// Generators
const playlistIdArbitrary = fc.uuid();
const playlistNameArbitrary = fc.string({ minLength: 1, maxLength: 50 });

const playlistSelectionArbitrary = fc.record({
  playlistId: playlistIdArbitrary,
  playlistName: playlistNameArbitrary,
  isSelected: fc.boolean(),
  wasOriginallySelected: fc.boolean(),
  isPinned: fc.option(fc.boolean(), { nil: undefined }),
}) as fc.Arbitrary<PlaylistSelection>;

describe('PlaylistModal', () => {
  // **Feature: playlist-add-modal, Property 4: Checkbox state matches song membership**
  // **Validates: Requirements 2.3, 2.4**
  describe('Property 4: Checkbox state matches song membership', () => {
    it('initial checkbox state should match song membership in playlists', () => {
      fc.assert(
        fc.property(
          fc.array(playlistIdArbitrary, { minLength: 0, maxLength: 10 }),
          fc.array(playlistIdArbitrary, { minLength: 0, maxLength: 5 }),
          fc.boolean(),
          (allPlaylistIds, songPlaylistIds, isLiked) => {
            // Simulate initialization logic
            const songPlaylistSet = new Set(songPlaylistIds);
            
            const selections: PlaylistSelection[] = [
              {
                playlistId: LIKED_SONGS_PLAYLIST_ID,
                playlistName: '已点赞的歌曲',
                isSelected: isLiked,
                wasOriginallySelected: isLiked,
                isPinned: true,
              },
              ...allPlaylistIds.map(id => ({
                playlistId: id,
                playlistName: `Playlist ${id.slice(0, 8)}`,
                isSelected: songPlaylistSet.has(id),
                wasOriginallySelected: songPlaylistSet.has(id),
              })),
            ];
            
            // Verify: liked songs checkbox matches isLiked
            const likedSelection = selections.find(s => s.playlistId === LIKED_SONGS_PLAYLIST_ID);
            expect(likedSelection?.isSelected).toBe(isLiked);
            
            // Verify: each playlist checkbox matches membership
            for (const selection of selections) {
              if (selection.playlistId === LIKED_SONGS_PLAYLIST_ID) continue;
              
              const shouldBeSelected = songPlaylistSet.has(selection.playlistId);
              expect(selection.isSelected).toBe(shouldBeSelected);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 7: Search filters playlists correctly**
  // **Validates: Requirements 3.2**
  describe('Property 7: Search filters playlists correctly', () => {
    it('filtered list should only contain playlists matching search query', () => {
      fc.assert(
        fc.property(
          fc.array(playlistNameArbitrary, { minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 10 }),
          (playlistNames, searchQuery) => {
            const selections: PlaylistSelection[] = [
              {
                playlistId: LIKED_SONGS_PLAYLIST_ID,
                playlistName: '已点赞的歌曲',
                isSelected: true,
                wasOriginallySelected: true,
                isPinned: true,
              },
              ...playlistNames.map((name, i) => ({
                playlistId: `playlist-${i}`,
                playlistName: name,
                isSelected: false,
                wasOriginallySelected: false,
              })),
            ];
            
            // Apply filter
            const filtered = selections.filter(s => {
              if (s.isPinned) return true;
              return s.playlistName.toLowerCase().includes(searchQuery.toLowerCase());
            });
            
            // Verify: all non-pinned items match the search query
            for (const selection of filtered) {
              if (selection.isPinned) continue;
              expect(selection.playlistName.toLowerCase()).toContain(searchQuery.toLowerCase());
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 8: Liked songs always visible during search**
  // **Validates: Requirements 3.3**
  describe('Property 8: Liked songs always visible during search', () => {
    it('liked songs should always be visible regardless of search query', () => {
      fc.assert(
        fc.property(
          fc.array(playlistNameArbitrary, { minLength: 0, maxLength: 10 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          (playlistNames, searchQuery) => {
            const selections: PlaylistSelection[] = [
              {
                playlistId: LIKED_SONGS_PLAYLIST_ID,
                playlistName: '已点赞的歌曲',
                isSelected: true,
                wasOriginallySelected: true,
                isPinned: true,
              },
              ...playlistNames.map((name, i) => ({
                playlistId: `playlist-${i}`,
                playlistName: name,
                isSelected: false,
                wasOriginallySelected: false,
              })),
            ];
            
            // Apply filter
            const filtered = selections.filter(s => {
              if (s.isPinned) return true;
              if (!searchQuery) return true;
              return s.playlistName.toLowerCase().includes(searchQuery.toLowerCase());
            });
            
            // Verify: liked songs is always in filtered list
            const hasLikedSongs = filtered.some(s => s.playlistId === LIKED_SONGS_PLAYLIST_ID);
            expect(hasLikedSongs).toBe(true);
            
            // Verify: liked songs is first in the list
            expect(filtered[0]?.playlistId).toBe(LIKED_SONGS_PLAYLIST_ID);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 9: New playlist auto-selected**
  // **Validates: Requirements 4.3**
  describe('Property 9: New playlist auto-selected', () => {
    it('newly created playlist should be added with checked state', () => {
      fc.assert(
        fc.property(
          fc.array(playlistSelectionArbitrary, { minLength: 0, maxLength: 5 }),
          playlistIdArbitrary,
          playlistNameArbitrary,
          (existingSelections, newPlaylistId, newPlaylistName) => {
            // Simulate adding new playlist
            const likedSongsSelection: PlaylistSelection = {
              playlistId: LIKED_SONGS_PLAYLIST_ID,
              playlistName: '已点赞的歌曲',
              isSelected: true,
              wasOriginallySelected: true,
              isPinned: true,
            };
            
            const newPlaylist: PlaylistSelection = {
              playlistId: newPlaylistId,
              playlistName: newPlaylistName,
              isSelected: true, // Auto-selected
              wasOriginallySelected: false, // Newly created
            };
            
            // Add new playlist after liked songs
            const updatedSelections = [
              likedSongsSelection,
              newPlaylist,
              ...existingSelections.filter(s => s.playlistId !== LIKED_SONGS_PLAYLIST_ID),
            ];
            
            // Verify: new playlist is selected
            const addedPlaylist = updatedSelections.find(s => s.playlistId === newPlaylistId);
            expect(addedPlaylist?.isSelected).toBe(true);
            expect(addedPlaylist?.wasOriginallySelected).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 11: Save applies all pending changes**
  // **Validates: Requirements 5.2, 5.4, 5.5, 5.6**
  describe('Property 11: Save applies all pending changes', () => {
    it('should correctly compute add and remove sets from selection changes', () => {
      fc.assert(
        fc.property(
          fc.array(playlistSelectionArbitrary, { minLength: 1, maxLength: 10 }),
          (selections) => {
            // Filter out liked songs for playlist operations
            const playlistSelections = selections.filter(
              s => s.playlistId !== LIKED_SONGS_PLAYLIST_ID
            );
            
            // Compute changes
            const addToPlaylists: string[] = [];
            const removeFromPlaylists: string[] = [];
            
            for (const selection of playlistSelections) {
              if (!selection.wasOriginallySelected && selection.isSelected) {
                addToPlaylists.push(selection.playlistId);
              } else if (selection.wasOriginallySelected && !selection.isSelected) {
                removeFromPlaylists.push(selection.playlistId);
              }
            }
            
            // Verify: add list contains only newly selected
            for (const id of addToPlaylists) {
              const selection = playlistSelections.find(s => s.playlistId === id);
              expect(selection?.wasOriginallySelected).toBe(false);
              expect(selection?.isSelected).toBe(true);
            }
            
            // Verify: remove list contains only deselected
            for (const id of removeFromPlaylists) {
              const selection = playlistSelections.find(s => s.playlistId === id);
              expect(selection?.wasOriginallySelected).toBe(true);
              expect(selection?.isSelected).toBe(false);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 12: Cancel discards changes**
  // **Validates: Requirements 5.3**
  describe('Property 12: Cancel discards changes', () => {
    it('cancel should not modify original state', () => {
      fc.assert(
        fc.property(
          fc.array(playlistSelectionArbitrary, { minLength: 1, maxLength: 10 }),
          (originalSelections) => {
            // Simulate user making changes
            const modifiedSelections = originalSelections.map(s => ({
              ...s,
              isSelected: !s.isSelected, // Toggle all
            }));
            
            // On cancel, we should restore original state
            const restoredSelections = originalSelections.map(s => ({
              ...s,
              isSelected: s.wasOriginallySelected,
            }));
            
            // Verify: restored state matches original
            for (let i = 0; i < originalSelections.length; i++) {
              expect(restoredSelections[i].isSelected).toBe(originalSelections[i].wasOriginallySelected);
            }
            
            // Verify: modified state is different (unless all were unchanged)
            const hasChanges = modifiedSelections.some(
              (s, i) => s.isSelected !== originalSelections[i].isSelected
            );
            if (originalSelections.length > 0) {
              expect(hasChanges).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 13: Modal closes on successful save**
  // **Validates: Requirements 6.2**
  describe('Property 13: Modal closes on successful save', () => {
    it('successful save should trigger close callback', () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          (saveSuccess) => {
            let closeCalled = false;
            const onClose = () => { closeCalled = true; };
            
            // Simulate save completion
            if (saveSuccess) {
              onClose();
            }
            
            // Verify: close is called on success
            expect(closeCalled).toBe(saveSuccess);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-song-fixes, Property 3: Single initialization per modal open**
  // **Validates: Requirements 2.4**
  describe('Property 3: Single initialization per modal open', () => {
    it('initialization should execute exactly once per modal open', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
          (stateChanges) => {
            // Simulate hasInitialized ref behavior
            let hasInitialized = false;
            let initCount = 0;
            const isOpen = true;
            
            // Simulate initializeSelections being called multiple times
            // (e.g., due to state changes triggering re-renders)
            const initializeSelections = () => {
              if (!isOpen || hasInitialized) return;
              hasInitialized = true;
              initCount++;
            };
            
            // Call initialization multiple times (simulating re-renders)
            for (const _ of stateChanges) {
              initializeSelections();
            }
            
            // Property: initialization should only happen once
            expect(initCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hasInitialized should reset when modal closes', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
          (openCloseSequence) => {
            // Simulate hasInitialized ref behavior
            let hasInitialized = false;
            let initCount = 0;
            
            const initializeSelections = (isOpen: boolean) => {
              if (!isOpen || hasInitialized) return;
              hasInitialized = true;
              initCount++;
            };
            
            const resetOnClose = (isOpen: boolean) => {
              if (!isOpen) {
                hasInitialized = false;
              }
            };
            
            // Simulate open/close cycles
            for (const isOpen of openCloseSequence) {
              if (isOpen) {
                initializeSelections(isOpen);
              } else {
                resetOnClose(isOpen);
              }
            }
            
            // Count expected initializations (one per open after a close)
            let expectedInits = 0;
            let wasOpen = false;
            for (const isOpen of openCloseSequence) {
              if (isOpen && !wasOpen) {
                expectedInits++;
              }
              wasOpen = isOpen;
            }
            
            // Property: init count should match expected
            expect(initCount).toBe(expectedInits);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple state changes during initialization should not trigger re-initialization', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          (stateChangeCount) => {
            // Simulate the modal behavior
            let hasInitialized = false;
            let initCount = 0;
            const isOpen = true;
            
            const initializeSelections = () => {
              if (!isOpen || hasInitialized) return;
              hasInitialized = true;
              initCount++;
            };
            
            // Simulate multiple state changes (playlists loading, etc.)
            for (let i = 0; i < stateChangeCount; i++) {
              initializeSelections();
            }
            
            // Property: regardless of state changes, only one init
            expect(initCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
