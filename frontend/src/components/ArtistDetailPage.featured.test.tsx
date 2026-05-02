import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArtistDetailPage from './ArtistDetailPage';
import { getArtistDetail } from '../api';
import { usePlayerStore } from '../store/playerStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { useGoBack } from '../hooks/useNavigationHistory';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { extractDominantColor } from '../utils/colorExtractor';

vi.mock('../api', () => ({
  getArtistDetail: vi.fn(),
  getAlbumDetail: vi.fn(),
  getPlaylist: vi.fn(),
}));

vi.mock('../store/playerStore', () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock('../store/recentlyPlayedStore', () => ({
  useRecentlyPlayedStore: vi.fn(),
}));

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}));

vi.mock('../hooks/useNavigationHistory', () => ({
  useGoBack: vi.fn(),
}));

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock('../utils/colorExtractor', () => ({
  extractDominantColor: vi.fn(),
}));

vi.mock('./SongCard', () => ({
  default: ({
    song,
    showAlbum,
    hideArtwork,
  }: {
    song: { name: string; albumName: string; artistId?: string; albumId?: string };
    showAlbum?: boolean;
    hideArtwork?: boolean;
  }) => (
    <div
      data-testid="song-card"
      data-show-album={String(showAlbum)}
      data-hide-artwork={String(hideArtwork)}
      data-artist-id={song.artistId}
      data-album-id={song.albumId}
    >
      <span>{song.name}</span>
      <span>{song.albumName}</span>
    </div>
  ),
}));

vi.mock('./AlbumCard', () => ({
  default: ({ album }: { album: { name: string } }) => <div>{album.name}</div>,
}));

vi.mock('./StickyHeader', () => ({
  StickyHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./FollowButton', () => ({
  FollowButton: () => <button type="button">follow</button>,
}));

vi.mock('./DraggableImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('./ShuffleButton', () => ({
  ShuffleButton: () => <button type="button">shuffle</button>,
}));

vi.mock('./ScrollableCardRow', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('./ArtistHero', () => ({
  ArtistHero: ({ artistName }: { artistName: string }) => <div>{artistName} hero</div>,
}));

vi.mock('./mobile/MobileArtistDetailPage', () => ({
  default: () => <div>mobile artist detail</div>,
  MobileArtistDetailLoading: () => <div>mobile loading</div>,
  MobileArtistDetailError: ({ error }: { error: string }) => <div>{error}</div>,
}));

vi.mock('./OfflineFallback', () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

describe('ArtistDetailPage featured module', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: vi.fn(),
      toggleShuffle: vi.fn(),
      isShuffled: false,
      queueSource: { type: 'queue', id: 'queue-1' },
      isPlaying: false,
      pause: vi.fn(),
      play: vi.fn(),
    });

    (useRecentlyPlayedStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recordPlay: vi.fn(),
    });

    (useIsMobile as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (useGoBack as unknown as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
    (useOnlineStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isOnline: true,
    });
    (extractDominantColor as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('rgb(38, 38, 38)');

    (getArtistDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'artist-featured-1',
      name: '测试艺人',
      artworkUrl: 'https://example.com/artist.jpg',
      artworkWidth: 1200,
      artworkHeight: 1200,
      motionVideoUrl: '',
      landscapeUrl: '',
      genres: ['摇滚'],
      topSongs: [],
      featuredSongsSource: 'library_fallback',
      featuredSongs: Array.from({ length: 5 }, (_, index) => ({
        id: `featured-${index + 1}`,
        name: `推荐歌曲 ${index + 1}`,
        artistName: '测试艺人',
        artistId: 'artist-featured-1',
        albumName: `推荐专辑 ${index + 1}`,
        albumId: `album-${index + 1}`,
        duration: 180000,
        artworkUrl: 'https://example.com/featured.jpg',
        hasLyrics: false,
      })),
      librarySongs: [
        {
          id: 'library-1',
          name: '曲库歌曲 1',
          artistName: '测试艺人',
          artistId: 'artist-featured-1',
          albumName: '曲库专辑',
          albumId: 'library-album-1',
          duration: 180000,
          artworkUrl: 'https://example.com/library.jpg',
          hasLyrics: false,
        },
      ],
      essentialAlbums: [],
      albums: [],
      singlesAndEPs: [],
      liveAlbums: [],
      compilationAlbums: [],
      appearsOnAlbums: [],
    });
  });

  it('renders the five-song preview on the artist page as all songs with artwork and album names', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/artist/artist-featured-1']}>
          <Routes>
            <Route path="/artist/:artistId" element={<ArtistDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const featuredModule = await screen.findByTestId('artist-overview-featured-songs');

    expect(within(featuredModule).getByRole('heading', { name: '全部歌曲' })).toBeInTheDocument();
    const songCards = within(featuredModule).getAllByTestId('song-card');
    expect(songCards).toHaveLength(5);
    expect(within(featuredModule).getByText('推荐专辑 1')).toBeInTheDocument();
    songCards.forEach((card) => {
      expect(card).toHaveAttribute('data-show-album', 'true');
      expect(card).toHaveAttribute('data-hide-artwork', 'undefined');
    });
    expect(screen.queryByTestId('artist-library-entry')).not.toBeInTheDocument();
    expect(screen.queryByText('曲库歌曲 1')).not.toBeInTheDocument();
    expect(screen.queryByText('本地推荐')).not.toBeInTheDocument();
  });

  it('navigates to the artist all songs page when clicking the all songs heading', async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/artist/artist-featured-1']}>
          <Routes>
            <Route path="/artist/:artistId" element={<ArtistDetailPage />} />
            <Route path="/artist/:artistId/all-songs" element={<div>artist all songs page</div>} />
          </Routes>
        </MemoryRouter>
      );
    });

    fireEvent.click(await screen.findByRole('heading', { name: '全部歌曲' }));

    expect(screen.getByText('artist all songs page')).toBeInTheDocument();
  });

  it('enriches featured songs with direct navigation targets before rendering song cards', async () => {
    (getArtistDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'artist-featured-1',
      name: '测试艺人',
      artworkUrl: 'https://example.com/artist.jpg',
      artworkWidth: 1200,
      artworkHeight: 1200,
      motionVideoUrl: '',
      landscapeUrl: '',
      genres: ['摇滚'],
      topSongs: [],
      featuredSongsSource: 'library_fallback',
      featuredSongs: [
        {
          id: 'featured-1',
          name: '推荐歌曲 1',
          artistName: '测试艺人',
          albumName: '推荐专辑 1',
          duration: 180000,
          artworkUrl: 'https://example.com/featured.jpg',
          hasLyrics: false,
        },
      ],
      librarySongs: [],
      essentialAlbums: [
        {
          id: 'album-1',
          name: '推荐专辑 1',
          artistName: '测试艺人',
          artistId: 'artist-featured-1',
          artworkUrl: 'https://example.com/featured.jpg',
          trackCount: 1,
        },
      ],
      albums: [],
      singlesAndEPs: [],
      liveAlbums: [],
      compilationAlbums: [],
      appearsOnAlbums: [],
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/artist/artist-featured-1']}>
          <Routes>
            <Route path="/artist/:artistId" element={<ArtistDetailPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    const songCard = (await screen.findAllByTestId('song-card'))[0];
    expect(songCard).toHaveAttribute('data-artist-id', 'artist-featured-1');
    expect(songCard).toHaveAttribute('data-album-id', 'album-1');
  });
});
