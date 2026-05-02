import { act, render, screen } from '@testing-library/react';
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
  default: ({ song }: { song: { name: string } }) => <div>{song.name}</div>,
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

describe('ArtistDetailPage hook order', () => {
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
  });

  it('keeps hook order stable when the first render is loading and the next render has artist data', async () => {
    let resolveArtist: ((value: unknown) => void) | undefined;
    const artistPromise = new Promise((resolve) => {
      resolveArtist = resolve;
    });

    (getArtistDetail as unknown as ReturnType<typeof vi.fn>).mockReturnValue(artistPromise);

    render(
      <MemoryRouter initialEntries={['/artist/artist-1']}>
        <Routes>
          <Route path="/artist/:artistId" element={<ArtistDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(getArtistDetail).toHaveBeenCalledWith('artist-1');

    await act(async () => {
      resolveArtist?.({
        id: 'artist-1',
        name: '测试艺人',
        artworkUrl: 'https://example.com/artist.jpg',
        artworkWidth: 1200,
        artworkHeight: 1200,
        motionVideoUrl: '',
        landscapeUrl: '',
        genres: ['摇滚'],
        topSongs: [],
        featuredSongs: [],
        featuredSongsSource: 'history',
        librarySongs: [],
        essentialAlbums: [],
        albums: [],
        singlesAndEPs: [],
        liveAlbums: [],
        compilationAlbums: [],
        appearsOnAlbums: [],
      });

      await artistPromise;
    });

    expect(await screen.findByRole('heading', { name: '测试艺人' })).toBeInTheDocument();
  });
});
