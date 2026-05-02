import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileArtistAllSongsPage from './MobileArtistAllSongsPage';
import { usePlayerStore } from '../../store/playerStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import { useGoBack } from '../../hooks/useNavigationHistory';

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock('../../store/recentlyPlayedStore', () => ({
  useRecentlyPlayedStore: vi.fn(),
}));

vi.mock('../../hooks/useNavigationHistory', () => ({
  useGoBack: vi.fn(),
}));

vi.mock('./MobileHeader', () => ({
  default: ({ title }: { title?: string }) => <div>{title}</div>,
}));

vi.mock('./MobileSongMenu', () => ({
  default: () => null,
}));

vi.mock('../CachedImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock('./MobileDetailPage', () => ({
  MobileTrackRow: ({
    track,
    onTap,
    showArtwork,
    secondaryText,
  }: {
    track: { name: string };
    onTap: () => void;
    showArtwork?: boolean;
    secondaryText?: string;
  }) => (
    <button
      type="button"
      data-testid="mobile-track-row"
      data-show-artwork={String(showArtwork)}
      data-secondary-text={secondaryText}
      onClick={onTap}
    >
      {track.name}
    </button>
  ),
}));

describe('MobileArtistAllSongsPage', () => {
  const setQueueMock = vi.fn();
  const recordPlayMock = vi.fn();
  const pauseMock = vi.fn();
  const playMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    setQueueMock.mockReset();
    recordPlayMock.mockReset();
    pauseMock.mockReset();
    playMock.mockReset();

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: setQueueMock,
      queueSource: { type: null, id: null },
      isPlaying: false,
      currentSong: null,
      pause: pauseMock,
      play: playMock,
    });

    (useRecentlyPlayedStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recordPlay: recordPlayMock,
    });

    (useGoBack as unknown as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());

    class MockIntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  it('shows the featured module copy and keeps featured/library queue semantics distinct', () => {
    render(
      <MemoryRouter>
        <MobileArtistAllSongsPage
          artistId="artist-1"
          artistName="测试艺人"
          featuredSongs={[
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
            },
          ]}
          featuredSongsSource="history"
          librarySongs={[
            {
              id: 'library-1',
              name: '曲库歌曲',
              artistName: '测试艺人',
              artistId: 'artist-1',
              albumName: '曲库专辑',
              albumId: 'library-album-1',
              duration: 180000,
              artworkUrl: 'https://example.com/library.jpg',
              hasLyrics: false,
              trackNumber: 1,
            },
          ]}
          albums={[
            {
              id: 'library-album-1',
              name: '曲库专辑',
              artistName: '测试艺人',
              artistId: 'artist-1',
              artworkUrl: 'https://example.com/library.jpg',
              releaseDate: '2024-01-01',
              trackCount: 1,
            },
          ]}
        />
      </MemoryRouter>
    );

    const featuredModule = screen.getByTestId('mobile-artist-featured-module');
    expect(within(featuredModule).getByRole('heading', { name: '你常听的歌曲' })).toBeInTheDocument();
    const featuredRow = within(featuredModule).getByTestId('mobile-track-row');
    expect(featuredRow).toHaveAttribute('data-show-artwork', 'true');
    expect(featuredRow).toHaveAttribute('data-secondary-text', '测试艺人 · 推荐专辑');
    expect(screen.getByTestId('mobile-artist-library-groups')).toBeInTheDocument();

    fireEvent.click(within(featuredModule).getByRole('button', { name: '推荐歌曲' }));
    fireEvent.click(screen.getByRole('button', { name: '曲库歌曲' }));

    expect(setQueueMock).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([expect.objectContaining({ id: 'featured-1' })]),
      0,
      expect.objectContaining({ type: 'artist', id: 'artist-1', variant: 'featured' })
    );
    expect(setQueueMock).toHaveBeenNthCalledWith(
      2,
      expect.arrayContaining([expect.objectContaining({ id: 'library-1' })]),
      0,
      expect.objectContaining({ type: 'artist', id: 'artist-1', variant: 'library' })
    );
  });

  it('offers a play-all shortcut that targets the library queue', () => {
    render(
      <MemoryRouter>
        <MobileArtistAllSongsPage
          artistId="artist-1"
          artistName="测试艺人"
          featuredSongs={[]}
          librarySongs={[
            {
              id: 'library-1',
              name: '曲库歌曲',
              artistName: '测试艺人',
              artistId: 'artist-1',
              albumName: '曲库专辑',
              albumId: 'library-album-1',
              duration: 180000,
              artworkUrl: 'https://example.com/library.jpg',
              hasLyrics: false,
              trackNumber: 1,
            },
          ]}
          albums={[
            {
              id: 'library-album-1',
              name: '曲库专辑',
              artistName: '测试艺人',
              artistId: 'artist-1',
              artworkUrl: 'https://example.com/library.jpg',
              releaseDate: '2024-01-01',
              trackCount: 1,
            },
          ]}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '播放全部' }));

    expect(recordPlayMock).toHaveBeenCalledWith('artist', 'artist-1');
    expect(setQueueMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'library-1' })]),
      0,
      expect.objectContaining({ type: 'artist', id: 'artist-1', variant: 'library' })
    );
    expect(pauseMock).not.toHaveBeenCalled();
    expect(playMock).not.toHaveBeenCalled();
  });
});
