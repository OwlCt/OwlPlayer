import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ArtistContentPage from './ArtistContentPage';
import { usePlayerStore } from '../store/playerStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { useOfflineCacheStore } from '../store/offlineCacheStore';
import { useLibraryAlbumsStore } from '../store/libraryAlbumsStore';
import { useToastStore } from '../store/toastStore';
import { getArtistDetail } from '../api';

vi.mock('../api', () => ({
  getArtistDetail: vi.fn(),
  getAlbumDetail: vi.fn(),
}));

vi.mock('../store/playerStore', () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock('../store/recentlyPlayedStore', () => ({
  useRecentlyPlayedStore: vi.fn(),
}));

vi.mock('../store/offlineCacheStore', () => ({
  useOfflineCacheStore: vi.fn(),
}));

vi.mock('../store/libraryAlbumsStore', () => ({
  useLibraryAlbumsStore: vi.fn(),
}));

vi.mock('../store/toastStore', () => ({
  useToastStore: vi.fn(),
}));

vi.mock('./SongCard', () => ({
  default: ({
    song,
    onPlay,
    showAlbum,
    hideArtwork,
  }: {
    song: { name: string; albumName: string; artistId?: string; albumId?: string };
    onPlay: () => void;
    showAlbum?: boolean;
    hideArtwork?: boolean;
  }) => (
    <button
      type="button"
      data-testid="song-card"
      data-show-album={String(showAlbum)}
      data-hide-artwork={String(hideArtwork)}
      data-artist-id={song.artistId}
      data-album-id={song.albumId}
      onClick={onPlay}
    >
      <span>{song.name}</span>
      <span>{song.albumName}</span>
    </button>
  ),
}));

vi.mock('./CachedImage', () => ({
  default: ({ alt, className }: { alt: string; className?: string }) => (
    <img alt={alt} className={className} />
  ),
}));

describe('ArtistContentPage', () => {
  const setQueueMock = vi.fn();

  beforeAll(() => {
    class MockIntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setQueueMock.mockReset();

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: setQueueMock,
      isPlaying: false,
      queueSource: { type: null, id: null },
      pause: vi.fn(),
      play: vi.fn(),
    });

    (useRecentlyPlayedStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recordPlay: vi.fn(),
    });

    (useOfflineCacheStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      startAlbumDownload: vi.fn(),
      deleteAlbumCache: vi.fn(),
      getAlbumCacheStatusByCount: vi.fn(() => 'none'),
      downloadProgress: null,
      cancelDownload: vi.fn(),
    });

    (useLibraryAlbumsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isSaved: vi.fn(() => false),
      saveAlbum: vi.fn(),
      removeAlbum: vi.fn(),
    });

    (useToastStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      showToast: vi.fn(),
    });

    (getArtistDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'artist-1',
      name: '测试艺人',
      artworkUrl: 'https://example.com/artist.jpg',
      genres: [],
      topSongs: [],
      featuredSongs: [
        {
          id: 'featured-1',
          name: '推荐歌曲',
          artistName: '测试艺人',
          artistId: 'artist-1',
          albumName: '推荐专辑',
          albumId: 'featured-album-1',
          duration: 180000,
          artworkUrl: 'https://example.com/featured.jpg',
          hasLyrics: false,
          trackNumber: 1,
        },
      ],
      featuredSongsSource: 'history',
      librarySongs: [
        {
          id: 'song-1',
          name: '测试歌曲',
          artistName: '测试艺人',
          artistId: 'artist-1',
          albumName: '测试专辑',
          albumId: 'album-1',
          duration: 180000,
          artworkUrl: 'https://example.com/artwork.jpg',
          hasLyrics: false,
          trackNumber: 1,
        },
      ],
      albums: [
        {
          id: 'album-1',
          name: '测试专辑',
          artistName: '测试艺人',
          artistId: 'artist-1',
          artworkUrl: 'https://example.com/artwork.jpg',
          releaseDate: '2024-01-01',
          trackCount: 1,
          releaseType: 'single',
          isSingle: true,
        },
      ],
      singlesAndEPs: [],
      essentialAlbums: [],
      liveAlbums: [],
      compilationAlbums: [],
      appearsOnAlbums: [],
    });
  });

  it('hides the 全部歌曲 label and renders library, cache, and more actions for grouped albums', async () => {
    render(
      <MemoryRouter initialEntries={['/artist/artist-1/all-songs']}>
        <Routes>
          <Route path="/artist/:artistId/all-songs" element={<ArtistContentPage contentType="library" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: '测试艺人' })).toBeInTheDocument();
    expect(screen.queryByText('全部歌曲')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '你常听的歌曲' })).toBeInTheDocument();
    expect(screen.getByTestId('artist-featured-module')).toBeInTheDocument();
    const featuredSongCard = within(screen.getByTestId('artist-featured-module')).getByTestId('song-card');
    expect(featuredSongCard).toHaveAttribute('data-show-album', 'true');
    expect(featuredSongCard).toHaveAttribute('data-hide-artwork', 'undefined');
    expect(within(screen.getByTestId('artist-featured-module')).getByText('推荐专辑')).toBeInTheDocument();
    expect(screen.getByTestId('artist-library-groups')).toBeInTheDocument();
    expect(screen.getByText(/单曲/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '播放专辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收藏至音乐库' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '缓存专辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多选项' })).toBeInTheDocument();
  });

  it('renders album actions even when library songs do not include albumId', async () => {
    (getArtistDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'artist-1',
      name: '测试艺人',
      artworkUrl: 'https://example.com/artist.jpg',
      genres: [],
      topSongs: [],
      featuredSongs: [],
      librarySongs: [
        {
          id: 'song-1',
          name: '测试歌曲',
          artistName: '测试艺人',
          artistId: 'artist-1',
          albumName: '测试专辑',
          duration: 180000,
          artworkUrl: 'https://example.com/artwork.jpg',
          hasLyrics: false,
          trackNumber: 1,
        },
      ],
      albums: [
        {
          id: 'album-1',
          name: '测试专辑',
          artistName: '测试艺人',
          artistId: 'artist-1',
          artworkUrl: 'https://example.com/artwork.jpg',
          releaseDate: '2024-01-01',
          trackCount: 1,
          releaseType: 'single',
          isSingle: true,
        },
      ],
      singlesAndEPs: [],
      essentialAlbums: [],
      liveAlbums: [],
      compilationAlbums: [],
      appearsOnAlbums: [],
    });

    render(
      <MemoryRouter initialEntries={['/artist/artist-1/all-songs']}>
        <Routes>
          <Route path="/artist/:artistId/all-songs" element={<ArtistContentPage contentType="library" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: '测试艺人' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收藏至音乐库' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '缓存专辑' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更多选项' })).toBeInTheDocument();
  });

  it('enriches grouped library songs before rendering song menus', async () => {
    (getArtistDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'artist-1',
      name: '测试艺人',
      artworkUrl: 'https://example.com/artist.jpg',
      genres: [],
      topSongs: [],
      featuredSongs: [],
      librarySongs: [
        {
          id: 'song-1',
          name: '测试歌曲',
          artistName: '测试艺人',
          albumName: '测试专辑',
          duration: 180000,
          artworkUrl: 'https://example.com/artwork.jpg',
          hasLyrics: false,
          trackNumber: 1,
        },
      ],
      albums: [
        {
          id: 'album-1',
          name: '测试专辑',
          artistName: '测试艺人',
          artistId: 'artist-1',
          artworkUrl: 'https://example.com/artwork.jpg',
          releaseDate: '2024-01-01',
          trackCount: 1,
          releaseType: 'album',
          isSingle: false,
        },
      ],
      singlesAndEPs: [],
      essentialAlbums: [],
      liveAlbums: [],
      compilationAlbums: [],
      appearsOnAlbums: [],
    });

    render(
      <MemoryRouter initialEntries={['/artist/artist-1/all-songs']}>
        <Routes>
          <Route path="/artist/:artistId/all-songs" element={<ArtistContentPage contentType="library" />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: '测试艺人' })).toBeInTheDocument();
    const songCard = screen.getByTestId('song-card');
    expect(songCard).toHaveAttribute('data-artist-id', 'artist-1');
    expect(songCard).toHaveAttribute('data-album-id', 'album-1');
  });

  it('keeps featured playback on the featured queue while library groups remain visible', async () => {
    render(
      <MemoryRouter initialEntries={['/artist/artist-1/all-songs']}>
        <Routes>
          <Route path="/artist/:artistId/all-songs" element={<ArtistContentPage contentType="library" />} />
        </Routes>
      </MemoryRouter>
    );

    const featuredModule = await screen.findByTestId('artist-featured-module');
    fireEvent.click(within(featuredModule).getByTestId('song-card'));

    expect(setQueueMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'featured-1' })]),
      0,
      expect.objectContaining({
        type: 'artist',
        id: 'artist-1',
        variant: 'featured',
      })
    );
    expect(screen.getByTestId('artist-library-groups')).toBeInTheDocument();
  });
});
