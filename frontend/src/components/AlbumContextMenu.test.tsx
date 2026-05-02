import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as fc from 'fast-check';
import AlbumContextMenu, { ALBUM_MENU_ITEMS } from './AlbumContextMenu';
import { Album } from '../types';
import { useLibraryAlbumsStore } from '../store/libraryAlbumsStore';

// Mock the stores
vi.mock('../store/playerStore', () => ({
  usePlayerStore: () => ({
    addToQueue: vi.fn(),
  }),
}));

vi.mock('../store/playlistsStore', () => ({
  usePlaylistsStore: () => ({
    addSongToPlaylist: vi.fn(),
    createPlaylist: vi.fn(),
  }),
}));

vi.mock('../store/libraryAlbumsStore', () => ({
  useLibraryAlbumsStore: vi.fn(),
}));

vi.mock('../utils/menuVisibility', () => ({
  getAlbumMenuVisibility: () => ({ showGoToArtist: false }),
}));

// Generate valid date strings directly to avoid Invalid Date issues
const validDateArbitrary = fc.tuple(
  fc.integer({ min: 2000, max: 2030 }),
  fc.integer({ min: 1, max: 12 }),
  fc.integer({ min: 1, max: 28 })
).map(([year, month, day]) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);

// Album arbitrary for property-based testing
const albumArbitrary = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artworkUrl: fc.webUrl(),
  trackCount: fc.integer({ min: 1, max: 20 }),
  artistId: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
  releaseDate: fc.option(validDateArbitrary, { nil: undefined }),
  tracks: fc.constant(undefined),
  genres: fc.constant(undefined),
  copyright: fc.constant(undefined),
}) as fc.Arbitrary<Album>;

describe('AlbumContextMenu', () => {
  const mockOnClose = vi.fn();
  const mockSaveAlbum = vi.fn();
  const mockRemoveAlbum = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderMenu = (album: Album, isSaved: boolean) => {
    (useLibraryAlbumsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      saveAlbum: mockSaveAlbum,
      removeAlbum: mockRemoveAlbum,
      isSaved: () => isSaved,
    });

    return render(
      <MemoryRouter>
        <AlbumContextMenu
          album={album}
          isOpen={true}
          position={{ x: 0, y: 0 }}
          onClose={mockOnClose}
        />
      </MemoryRouter>
    );
  };

  /**
   * **Feature: library-album-remove-button, Property 1: Menu label reflects saved state**
   * 
   * *For any* album and saved state, the menu should display "从音乐库中删除" 
   * if the album is saved in the library, and "添加到音乐库" if the album is not saved.
   * 
   * **Validates: Requirements 1.1, 1.4**
   */
  it('Property 1: Menu label reflects saved state', () => {
    fc.assert(
      fc.property(
        albumArbitrary,
        fc.boolean(),
        (album, isSaved) => {
          const { unmount } = renderMenu(album, isSaved);
          
          if (isSaved) {
            // When album is saved, should show "从音乐库中删除"
            expect(screen.getByText(ALBUM_MENU_ITEMS.REMOVE_FROM_LIBRARY)).toBeInTheDocument();
            expect(screen.queryByText(ALBUM_MENU_ITEMS.ADD_TO_LIBRARY)).not.toBeInTheDocument();
          } else {
            // When album is not saved, should show "添加到音乐库"
            expect(screen.getByText(ALBUM_MENU_ITEMS.ADD_TO_LIBRARY)).toBeInTheDocument();
            expect(screen.queryByText(ALBUM_MENU_ITEMS.REMOVE_FROM_LIBRARY)).not.toBeInTheDocument();
          }
          
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
