import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Album } from '../types';
import { AlbumSaveButton } from './AlbumSaveButton';

const mocks = vi.hoisted(() => ({
  libraryAlbumsStore: {
    isSaved: vi.fn(() => false),
    saveAlbum: vi.fn(),
    removeAlbum: vi.fn(),
  },
  toastStore: {
    showToast: vi.fn(),
  },
}));

vi.mock('../store/libraryAlbumsStore', () => ({
  useLibraryAlbumsStore: () => mocks.libraryAlbumsStore,
}));

vi.mock('../store/toastStore', () => ({
  useToastStore: () => mocks.toastStore,
}));

describe('AlbumSaveButton icon style', () => {
  const album: Album = {
    id: 'album-1',
    name: '测试专辑',
    artistName: '测试歌手',
    artworkUrl: '',
    trackCount: 10,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.libraryAlbumsStore.isSaved.mockReturnValue(false);
  });

  it('uses the reference cutout checkmark style when saved', () => {
    mocks.libraryAlbumsStore.isSaved.mockReturnValue(true);

    const { container } = render(
      <AlbumSaveButton album={album} enableTooltip={false} />,
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
    expect(container.querySelector('mask#checkmark-mask-album')).not.toBeNull();
    expect(
      container.querySelector('circle[mask=\"url(#checkmark-mask-album)\"]'),
    ).not.toBeNull();
  });
});
