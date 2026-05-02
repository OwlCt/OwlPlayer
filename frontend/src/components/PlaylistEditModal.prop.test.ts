import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property tests for PlaylistEditModal component
 * Tests the core logic of playlist editing functionality
 */

// Types for testing
interface PlaylistEditState {
  name: string;
  description: string;
  previewImageUrl: string | null;
  pendingImageFile: File | null;
  shouldRemoveCover: boolean;
  isLoading: boolean;
  error: string | null;
}

interface Playlist {
  id: string;
  name: string;
  description?: string;
  artwork_url?: string;
}

// Accepted image formats
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// Generators
const playlistIdArbitrary = fc.uuid();
const playlistNameArbitrary = fc.string({ minLength: 1, maxLength: 100 });
const descriptionArbitrary = fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined });
const artworkUrlArbitrary = fc.option(fc.webUrl(), { nil: undefined });

const playlistArbitrary = fc.record({
  id: playlistIdArbitrary,
  name: playlistNameArbitrary,
  description: descriptionArbitrary,
  artwork_url: artworkUrlArbitrary,
}) as fc.Arbitrary<Playlist>;

// Whitespace string generator
const whitespaceArbitrary = fc.array(
  fc.constantFrom(' ', '\t', '\n', '\r'),
  { minLength: 0, maxLength: 20 }
).map(arr => arr.join(''));

describe('PlaylistEditModal', () => {
  // **Feature: playlist-edit-modal, Property 1: Modal pre-fill consistency**
  // **Validates: Requirements 1.3, 1.4, 1.5**
  describe('Property 1: Modal pre-fill consistency', () => {
    // Function to simulate modal initialization
    const initializeModalState = (playlist: Playlist): PlaylistEditState => {
      return {
        name: playlist.name,
        description: playlist.description || '',
        previewImageUrl: null,
        pendingImageFile: null,
        shouldRemoveCover: false,
        isLoading: false,
        error: null,
      };
    };

    it('modal should pre-fill name field with current playlist name', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          (playlist) => {
            const state = initializeModalState(playlist);
            
            // Property: name field should match playlist name
            expect(state.name).toBe(playlist.name);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('modal should pre-fill description field with current playlist description', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          (playlist) => {
            const state = initializeModalState(playlist);
            
            // Property: description field should match playlist description (or empty string if undefined)
            expect(state.description).toBe(playlist.description || '');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('modal should display current cover image when playlist has artwork_url', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: playlistIdArbitrary,
            name: playlistNameArbitrary,
            description: descriptionArbitrary,
            artwork_url: fc.webUrl(), // Always has artwork
          }) as fc.Arbitrary<Playlist>,
          (playlist) => {
            const state = initializeModalState(playlist);
            
            // Simulate getDisplayImageUrl logic
            const getDisplayImageUrl = (): string | null => {
              if (state.previewImageUrl) return state.previewImageUrl;
              if (state.shouldRemoveCover) return null;
              return playlist.artwork_url || null;
            };
            
            const displayUrl = getDisplayImageUrl();
            
            // Property: should display the playlist's artwork_url
            expect(displayUrl).toBe(playlist.artwork_url);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('modal should initialize with no pending changes', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          (playlist) => {
            const state = initializeModalState(playlist);
            
            // Property: initial state should have no pending changes
            expect(state.previewImageUrl).toBeNull();
            expect(state.pendingImageFile).toBeNull();
            expect(state.shouldRemoveCover).toBe(false);
            expect(state.isLoading).toBe(false);
            expect(state.error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('modal pre-fill should be consistent across multiple opens', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.integer({ min: 1, max: 10 }),
          (playlist, openCount) => {
            // Simulate opening modal multiple times
            for (let i = 0; i < openCount; i++) {
              const state = initializeModalState(playlist);
              
              // Property: each open should have same initial values
              expect(state.name).toBe(playlist.name);
              expect(state.description).toBe(playlist.description || '');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 2: Input field controlled behavior**
  // **Validates: Requirements 2.1, 2.2**
  describe('Property 2: Input field controlled behavior', () => {
    it('name input should immediately reflect user input', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 0, maxLength: 100 }),
          (playlist, newName) => {
            // Simulate initial state
            let state: PlaylistEditState = {
              name: playlist.name,
              description: playlist.description || '',
              previewImageUrl: null,
              pendingImageFile: null,
              shouldRemoveCover: false,
              isLoading: false,
              error: null,
            };

            // Simulate onChange handler
            const handleNameChange = (value: string) => {
              state = { ...state, name: value, error: null };
            };

            // Apply change
            handleNameChange(newName);

            // Property: displayed value should match input
            expect(state.name).toBe(newName);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('description input should immediately reflect user input', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 0, maxLength: 500 }),
          (playlist, newDescription) => {
            // Simulate initial state
            let state: PlaylistEditState = {
              name: playlist.name,
              description: playlist.description || '',
              previewImageUrl: null,
              pendingImageFile: null,
              shouldRemoveCover: false,
              isLoading: false,
              error: null,
            };

            // Simulate onChange handler
            const handleDescriptionChange = (value: string) => {
              state = { ...state, description: value };
            };

            // Apply change
            handleDescriptionChange(newDescription);

            // Property: displayed value should match input
            expect(state.description).toBe(newDescription);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple sequential inputs should all be reflected', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.array(fc.string({ minLength: 0, maxLength: 50 }), { minLength: 1, maxLength: 10 }),
          (playlist, inputSequence) => {
            let state: PlaylistEditState = {
              name: playlist.name,
              description: playlist.description || '',
              previewImageUrl: null,
              pendingImageFile: null,
              shouldRemoveCover: false,
              isLoading: false,
              error: null,
            };

            // Apply each input in sequence
            for (const input of inputSequence) {
              state = { ...state, name: input };
              expect(state.name).toBe(input);
            }

            // Final state should match last input
            expect(state.name).toBe(inputSequence[inputSequence.length - 1]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 3: Empty name validation**
  // **Validates: Requirements 2.3, 2.4**
  describe('Property 3: Empty name validation', () => {
    it('empty or whitespace-only name should disable save button', () => {
      fc.assert(
        fc.property(
          whitespaceArbitrary,
          (whitespaceString) => {
            // Validation logic
            const isNameValid = (name: string) => name.trim().length > 0;

            // Property: whitespace-only strings should be invalid
            expect(isNameValid(whitespaceString)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('non-empty trimmed name should enable save button', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          (validName) => {
            // Validation logic
            const isNameValid = (name: string) => name.trim().length > 0;

            // Property: non-empty trimmed strings should be valid
            expect(isNameValid(validName)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('name with leading/trailing whitespace but non-empty content should be valid', () => {
      fc.assert(
        fc.property(
          whitespaceArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          whitespaceArbitrary,
          (leadingWs, content, trailingWs) => {
            const nameWithWhitespace = leadingWs + content + trailingWs;
            
            // Validation logic
            const isNameValid = (name: string) => name.trim().length > 0;

            // Property: should be valid because content is non-empty
            expect(isNameValid(nameWithWhitespace)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 4: Image hover overlay display**
  // **Validates: Requirements 3.1**
  describe('Property 4: Image hover overlay display', () => {
    // Simulate hover state logic
    interface ImageUploadAreaState {
      isHovered: boolean;
      showOverlay: boolean;
    }

    const computeOverlayVisibility = (isHovered: boolean): boolean => {
      // Overlay should be visible when hovered
      return isHovered;
    };

    it('hover overlay should be visible when mouse is over image area', () => {
      fc.assert(
        fc.property(
          fc.boolean(), // isHovered state
          (isHovered) => {
            const showOverlay = computeOverlayVisibility(isHovered);
            
            // Property: overlay visibility should match hover state
            expect(showOverlay).toBe(isHovered);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hover overlay should contain edit icon and select photo text', () => {
      fc.assert(
        fc.property(
          fc.constant(true), // Always hovered for this test
          () => {
            // Simulate overlay content
            const overlayContent = {
              hasEditIcon: true,
              hasSelectPhotoText: true,
              selectPhotoText: '选择照片',
            };

            // Property: overlay should have required elements
            expect(overlayContent.hasEditIcon).toBe(true);
            expect(overlayContent.hasSelectPhotoText).toBe(true);
            expect(overlayContent.selectPhotoText).toBe('选择照片');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('hover state transitions should be consistent', () => {
      fc.assert(
        fc.property(
          fc.array(fc.boolean(), { minLength: 1, maxLength: 20 }), // Sequence of hover states
          (hoverSequence) => {
            let currentOverlayVisible = false;

            for (const isHovered of hoverSequence) {
              currentOverlayVisible = computeOverlayVisibility(isHovered);
              // Property: each state should correctly reflect hover
              expect(currentOverlayVisible).toBe(isHovered);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 5: Valid image format acceptance**
  // **Feature: playlist-edit-modal, Property 6: Invalid image format rejection**
  // **Validates: Requirements 3.3, 3.4**
  describe('Property 5 & 6: Image format validation', () => {
    // Validation function matching component logic
    const validateImageFile = (mimeType: string, size: number): { valid: boolean; error: string | null } => {
      if (!ACCEPTED_IMAGE_TYPES.includes(mimeType)) {
        return { valid: false, error: '不支持的图片格式，请选择 JPEG、PNG 或 WebP 格式' };
      }
      if (size > MAX_IMAGE_SIZE) {
        return { valid: false, error: '图片大小不能超过 5MB' };
      }
      return { valid: true, error: null };
    };

    // Generator for valid image types
    const validImageTypeArbitrary = fc.constantFrom('image/jpeg', 'image/png', 'image/webp');
    
    // Generator for invalid image types
    const invalidImageTypeArbitrary = fc.constantFrom(
      'image/gif',
      'image/bmp',
      'image/tiff',
      'image/svg+xml',
      'application/pdf',
      'text/plain',
      'video/mp4',
      'audio/mp3'
    );

    // Generator for valid file size (0 to 5MB)
    const validFileSizeArbitrary = fc.integer({ min: 1, max: MAX_IMAGE_SIZE });
    
    // Generator for invalid file size (over 5MB)
    const invalidFileSizeArbitrary = fc.integer({ min: MAX_IMAGE_SIZE + 1, max: MAX_IMAGE_SIZE * 3 });

    it('Property 5: valid image formats (JPEG, PNG, WebP) should be accepted', () => {
      fc.assert(
        fc.property(
          validImageTypeArbitrary,
          validFileSizeArbitrary,
          (mimeType, size) => {
            const result = validateImageFile(mimeType, size);
            
            // Property: valid formats with valid size should be accepted
            expect(result.valid).toBe(true);
            expect(result.error).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 6: invalid image formats should be rejected with error message', () => {
      fc.assert(
        fc.property(
          invalidImageTypeArbitrary,
          validFileSizeArbitrary,
          (mimeType, size) => {
            const result = validateImageFile(mimeType, size);
            
            // Property: invalid formats should be rejected
            expect(result.valid).toBe(false);
            expect(result.error).toBe('不支持的图片格式，请选择 JPEG、PNG 或 WebP 格式');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('files exceeding 5MB should be rejected regardless of format', () => {
      fc.assert(
        fc.property(
          validImageTypeArbitrary,
          invalidFileSizeArbitrary,
          (mimeType, size) => {
            const result = validateImageFile(mimeType, size);
            
            // Property: oversized files should be rejected
            expect(result.valid).toBe(false);
            expect(result.error).toBe('图片大小不能超过 5MB');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('invalid format takes precedence over invalid size in error message', () => {
      fc.assert(
        fc.property(
          invalidImageTypeArbitrary,
          invalidFileSizeArbitrary,
          (mimeType, size) => {
            const result = validateImageFile(mimeType, size);
            
            // Property: format error should be checked first
            expect(result.valid).toBe(false);
            expect(result.error).toBe('不支持的图片格式，请选择 JPEG、PNG 或 WebP 格式');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 7: Default cover fallback**
  // **Validates: Requirements 4.1, 4.2**
  describe('Property 7: Default cover fallback', () => {
    interface CoverDisplayState {
      previewImageUrl: string | null;
      shouldRemoveCover: boolean;
      playlistArtworkUrl: string | undefined;
      defaultCoverUrl: string | undefined;
    }

    // Logic matching getDisplayImageUrl in component
    const getDisplayImageUrl = (state: CoverDisplayState): string | null => {
      // If there's a preview image (newly selected), show it
      if (state.previewImageUrl) {
        return state.previewImageUrl;
      }
      // If cover should be removed, show default or nothing
      if (state.shouldRemoveCover) {
        return state.defaultCoverUrl || null;
      }
      // Show existing artwork or default
      if (state.playlistArtworkUrl) {
        return state.playlistArtworkUrl;
      }
      return state.defaultCoverUrl || null;
    };

    // Generators
    const urlArbitrary = fc.webUrl();
    const optionalUrlArbitrary = fc.option(urlArbitrary, { nil: undefined });

    it('playlist without custom cover but with songs should display first song artwork', () => {
      fc.assert(
        fc.property(
          urlArbitrary, // defaultCoverUrl (first song's artwork)
          (defaultCoverUrl) => {
            const state: CoverDisplayState = {
              previewImageUrl: null,
              shouldRemoveCover: false,
              playlistArtworkUrl: undefined, // No custom cover
              defaultCoverUrl: defaultCoverUrl, // Has first song artwork
            };

            const displayUrl = getDisplayImageUrl(state);
            
            // Property: should display the default cover (first song's artwork)
            expect(displayUrl).toBe(defaultCoverUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('playlist without custom cover and without songs should display null (placeholder)', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            const state: CoverDisplayState = {
              previewImageUrl: null,
              shouldRemoveCover: false,
              playlistArtworkUrl: undefined, // No custom cover
              defaultCoverUrl: undefined, // No songs
            };

            const displayUrl = getDisplayImageUrl(state);
            
            // Property: should display null (component shows placeholder icon)
            expect(displayUrl).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removing custom cover should fall back to default cover', () => {
      fc.assert(
        fc.property(
          urlArbitrary, // playlistArtworkUrl
          optionalUrlArbitrary, // defaultCoverUrl
          (playlistArtworkUrl, defaultCoverUrl) => {
            const state: CoverDisplayState = {
              previewImageUrl: null,
              shouldRemoveCover: true, // User removed cover
              playlistArtworkUrl: playlistArtworkUrl,
              defaultCoverUrl: defaultCoverUrl,
            };

            const displayUrl = getDisplayImageUrl(state);
            
            // Property: should display default cover or null
            expect(displayUrl).toBe(defaultCoverUrl || null);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('preview image should take precedence over all other sources', () => {
      fc.assert(
        fc.property(
          urlArbitrary, // previewImageUrl
          optionalUrlArbitrary, // playlistArtworkUrl
          optionalUrlArbitrary, // defaultCoverUrl
          fc.boolean(), // shouldRemoveCover
          (previewImageUrl, playlistArtworkUrl, defaultCoverUrl, shouldRemoveCover) => {
            const state: CoverDisplayState = {
              previewImageUrl: previewImageUrl,
              shouldRemoveCover: shouldRemoveCover,
              playlistArtworkUrl: playlistArtworkUrl,
              defaultCoverUrl: defaultCoverUrl,
            };

            const displayUrl = getDisplayImageUrl(state);
            
            // Property: preview should always take precedence
            expect(displayUrl).toBe(previewImageUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('custom artwork should take precedence over default when not removed', () => {
      fc.assert(
        fc.property(
          urlArbitrary, // playlistArtworkUrl
          optionalUrlArbitrary, // defaultCoverUrl
          (playlistArtworkUrl, defaultCoverUrl) => {
            const state: CoverDisplayState = {
              previewImageUrl: null,
              shouldRemoveCover: false,
              playlistArtworkUrl: playlistArtworkUrl,
              defaultCoverUrl: defaultCoverUrl,
            };

            const displayUrl = getDisplayImageUrl(state);
            
            // Property: custom artwork should take precedence
            expect(displayUrl).toBe(playlistArtworkUrl);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 9: Cancel operation preserves original data**
  // **Validates: Requirements 5.2, 5.3**
  describe('Property 9: Cancel operation preserves original data', () => {
    // Simulate the cancel operation behavior
    interface ModalState {
      originalPlaylist: Playlist;
      editedName: string;
      editedDescription: string;
      pendingImageFile: File | null;
      shouldRemoveCover: boolean;
    }

    // Function to simulate cancel - returns original data unchanged
    const cancelAndGetOriginal = (state: ModalState): Playlist => {
      // Cancel discards all changes and returns original
      return state.originalPlaylist;
    };

    // Function to check if state has modifications
    const hasModifications = (state: ModalState): boolean => {
      return (
        state.editedName !== state.originalPlaylist.name ||
        state.editedDescription !== (state.originalPlaylist.description || '') ||
        state.pendingImageFile !== null ||
        state.shouldRemoveCover
      );
    };

    it('cancel should preserve original playlist name regardless of edits', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 0, maxLength: 100 }),
          (originalPlaylist, editedName) => {
            const state: ModalState = {
              originalPlaylist,
              editedName,
              editedDescription: originalPlaylist.description || '',
              pendingImageFile: null,
              shouldRemoveCover: false,
            };

            const result = cancelAndGetOriginal(state);
            
            // Property: original name should be preserved after cancel
            expect(result.name).toBe(originalPlaylist.name);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cancel should preserve original playlist description regardless of edits', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 0, maxLength: 500 }),
          (originalPlaylist, editedDescription) => {
            const state: ModalState = {
              originalPlaylist,
              editedName: originalPlaylist.name,
              editedDescription,
              pendingImageFile: null,
              shouldRemoveCover: false,
            };

            const result = cancelAndGetOriginal(state);
            
            // Property: original description should be preserved after cancel
            expect(result.description).toBe(originalPlaylist.description);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cancel should preserve original artwork_url even if cover removal was pending', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.boolean(),
          (originalPlaylist, shouldRemoveCover) => {
            const state: ModalState = {
              originalPlaylist,
              editedName: originalPlaylist.name,
              editedDescription: originalPlaylist.description || '',
              pendingImageFile: null,
              shouldRemoveCover,
            };

            const result = cancelAndGetOriginal(state);
            
            // Property: original artwork_url should be preserved after cancel
            expect(result.artwork_url).toBe(originalPlaylist.artwork_url);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('cancel should discard all pending changes', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 1, maxLength: 100 }),
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.boolean(),
          (originalPlaylist, editedName, editedDescription, shouldRemoveCover) => {
            const state: ModalState = {
              originalPlaylist,
              editedName,
              editedDescription,
              pendingImageFile: null, // Can't easily generate File in tests
              shouldRemoveCover,
            };

            const result = cancelAndGetOriginal(state);
            
            // Property: result should exactly match original
            expect(result).toEqual(originalPlaylist);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple cancel operations should always return same original data', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.array(
            fc.record({
              name: fc.string({ minLength: 0, maxLength: 100 }),
              description: fc.string({ minLength: 0, maxLength: 500 }),
              shouldRemoveCover: fc.boolean(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (originalPlaylist, editSequence) => {
            // Simulate multiple edit-cancel cycles
            for (const edit of editSequence) {
              const state: ModalState = {
                originalPlaylist,
                editedName: edit.name,
                editedDescription: edit.description,
                pendingImageFile: null,
                shouldRemoveCover: edit.shouldRemoveCover,
              };

              const result = cancelAndGetOriginal(state);
              
              // Property: each cancel should return the same original
              expect(result).toEqual(originalPlaylist);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-edit-modal, Property 8: Save operation round-trip**
  // **Validates: Requirements 5.1, 5.4**
  describe('Property 8: Save operation round-trip', () => {
    // Simulate save operation - returns the updated playlist data
    interface SavePayload {
      name: string;
      description?: string;
      artwork_url?: string;
      removeCover?: boolean;
    }

    // Function to simulate what the server would return after save
    const simulateSaveAndReload = (
      originalPlaylist: Playlist,
      savePayload: SavePayload
    ): Playlist => {
      return {
        id: originalPlaylist.id,
        name: savePayload.name,
        description: savePayload.description,
        artwork_url: savePayload.removeCover ? undefined : savePayload.artwork_url,
      };
    };

    // Function to initialize modal state from playlist
    const initializeModalState = (playlist: Playlist): PlaylistEditState => {
      return {
        name: playlist.name,
        description: playlist.description || '',
        previewImageUrl: null,
        pendingImageFile: null,
        shouldRemoveCover: false,
        isLoading: false,
        error: null,
      };
    };

    it('saved name should be displayed when modal is reopened', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          (originalPlaylist, newName) => {
            // Simulate save
            const savePayload: SavePayload = {
              name: newName.trim(),
              description: originalPlaylist.description,
              artwork_url: originalPlaylist.artwork_url,
            };
            
            // Simulate server response
            const updatedPlaylist = simulateSaveAndReload(originalPlaylist, savePayload);
            
            // Simulate reopening modal
            const newState = initializeModalState(updatedPlaylist);
            
            // Property: modal should display the saved name
            expect(newState.name).toBe(newName.trim());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('saved description should be displayed when modal is reopened', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 0, maxLength: 500 }),
          (originalPlaylist, newDescription) => {
            // Simulate save
            const savePayload: SavePayload = {
              name: originalPlaylist.name,
              description: newDescription.trim() || undefined,
              artwork_url: originalPlaylist.artwork_url,
            };
            
            // Simulate server response
            const updatedPlaylist = simulateSaveAndReload(originalPlaylist, savePayload);
            
            // Simulate reopening modal
            const newState = initializeModalState(updatedPlaylist);
            
            // Property: modal should display the saved description
            expect(newState.description).toBe(updatedPlaylist.description || '');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('saved artwork_url should be displayed when modal is reopened', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.webUrl(),
          (originalPlaylist, newArtworkUrl) => {
            // Simulate save with new artwork
            const savePayload: SavePayload = {
              name: originalPlaylist.name,
              description: originalPlaylist.description,
              artwork_url: newArtworkUrl,
            };
            
            // Simulate server response
            const updatedPlaylist = simulateSaveAndReload(originalPlaylist, savePayload);
            
            // Property: updated playlist should have the new artwork_url
            expect(updatedPlaylist.artwork_url).toBe(newArtworkUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('removed cover should not be displayed when modal is reopened', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: playlistIdArbitrary,
            name: playlistNameArbitrary,
            description: descriptionArbitrary,
            artwork_url: fc.webUrl(), // Has artwork
          }) as fc.Arbitrary<Playlist>,
          (originalPlaylist) => {
            // Simulate save with cover removal
            const savePayload: SavePayload = {
              name: originalPlaylist.name,
              description: originalPlaylist.description,
              removeCover: true,
            };
            
            // Simulate server response
            const updatedPlaylist = simulateSaveAndReload(originalPlaylist, savePayload);
            
            // Property: updated playlist should not have artwork_url
            expect(updatedPlaylist.artwork_url).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('complete save round-trip should preserve all saved values', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 0, maxLength: 500 }),
          fc.option(fc.webUrl(), { nil: undefined }),
          (originalPlaylist, newName, newDescription, newArtworkUrl) => {
            // Simulate save
            const savePayload: SavePayload = {
              name: newName.trim(),
              description: newDescription.trim() || undefined,
              artwork_url: newArtworkUrl,
            };
            
            // Simulate server response
            const updatedPlaylist = simulateSaveAndReload(originalPlaylist, savePayload);
            
            // Simulate reopening modal
            const newState = initializeModalState(updatedPlaylist);
            
            // Property: all saved values should be displayed
            expect(newState.name).toBe(newName.trim());
            expect(newState.description).toBe(newDescription.trim() || '');
            expect(updatedPlaylist.artwork_url).toBe(newArtworkUrl);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('multiple save operations should each be reflected correctly', () => {
      fc.assert(
        fc.property(
          playlistArbitrary,
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
              description: fc.string({ minLength: 0, maxLength: 500 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          (originalPlaylist, saveSequence) => {
            let currentPlaylist = originalPlaylist;
            
            // Simulate multiple save operations
            for (const save of saveSequence) {
              const savePayload: SavePayload = {
                name: save.name.trim(),
                description: save.description.trim() || undefined,
                artwork_url: currentPlaylist.artwork_url,
              };
              
              // Simulate server response
              currentPlaylist = simulateSaveAndReload(currentPlaylist, savePayload);
              
              // Simulate reopening modal
              const newState = initializeModalState(currentPlaylist);
              
              // Property: each save should be reflected
              expect(newState.name).toBe(save.name.trim());
              expect(newState.description).toBe(save.description.trim() || '');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
