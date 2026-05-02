import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MobileArtistDetailPage from './MobileArtistDetailPage';
import { usePlayerStore } from '../../store/playerStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import { useGoBack } from '../../hooks/useNavigationHistory';

vi.mock('../../api', () => ({
  getAlbumDetail: vi.fn(),
}));

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock('../../store/recentlyPlayedStore', () => ({
  useRecentlyPlayedStore: vi.fn(),
}));

vi.mock('../../hooks/useNavigationHistory', () => ({
  useGoBack: vi.fn(),
}));

vi.mock('../AlbumCard', () => ({
  default: ({ album }: { album: { name: string } }) => <div>{album.name}</div>,
}));

vi.mock('../ScrollableCardRow', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../FollowButton', () => ({
  FollowButton: () => <button type="button">follow</button>,
}));

vi.mock('../ShuffleButton', () => ({
  ShuffleButton: () => <button type="button">shuffle</button>,
}));

vi.mock('../ArtistHero', () => ({
  ArtistHero: ({ artistName }: { artistName: string }) => <div>{artistName} hero</div>,
}));

vi.mock('./MobileHeader', () => ({
  default: ({ title }: { title?: string }) => <div>{title}</div>,
}));

vi.mock('./MobileArtistMenu', () => ({
  default: () => null,
}));

vi.mock('./MobileSongMenu', () => ({
  default: () => null,
}));

vi.mock('./MobileDetailPage', () => ({
  MobileTrackRow: ({
    track,
    showArtwork,
    secondaryText,
  }: {
    track: { name: string };
    showArtwork?: boolean;
    secondaryText?: string;
  }) => (
    <div
      data-testid="mobile-track-row"
      data-show-artwork={String(showArtwork)}
      data-secondary-text={secondaryText}
    >
      {track.name}
    </div>
  ),
}));

describe('MobileArtistDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: vi.fn(),
      toggleShuffle: vi.fn(),
      isShuffled: false,
      queueSource: { type: null, id: null },
      isPlaying: false,
      pause: vi.fn(),
      play: vi.fn(),
      currentSong: null,
    });

    (useRecentlyPlayedStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      recordPlay: vi.fn(),
    });

    (useGoBack as unknown as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());
  });

  it('renders the five-song preview on the artist page as all songs with artwork and album names', () => {
    render(
      <MemoryRouter>
        <MobileArtistDetailPage
          artistId="artist-1"
          themeColor="rgb(38, 38, 38)"
          artist={{
            id: 'artist-1',
            name: '测试艺人',
            artworkUrl: 'https://example.com/artist.jpg',
            artworkWidth: 1200,
            artworkHeight: 1200,
            genres: ['摇滚'],
            motionVideoUrl: '',
            landscapeUrl: '',
            featuredSongsSource: 'library_fallback',
            topSongs: [],
            featuredSongs: Array.from({ length: 5 }, (_, index) => ({
              id: `featured-${index + 1}`,
              name: `推荐歌曲 ${index + 1}`,
              artistName: '测试艺人',
              artistId: 'artist-1',
              albumName: `推荐专辑 ${index + 1}`,
              albumId: `album-${index + 1}`,
              duration: 180000,
              artworkUrl: 'https://example.com/featured.jpg',
              hasLyrics: false,
            })),
            librarySongs: [
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
              },
            ],
            essentialAlbums: [],
            albums: [],
            singlesAndEPs: [],
            liveAlbums: [],
            compilationAlbums: [],
            appearsOnAlbums: [],
          }}
        />
      </MemoryRouter>
    );

    const featuredModule = screen.getByTestId('mobile-artist-overview-featured-songs');
    expect(within(featuredModule).getByRole('heading', { name: '先听这几首' })).toBeInTheDocument();
    const trackRows = within(featuredModule).getAllByTestId('mobile-track-row');
    expect(trackRows).toHaveLength(5);
    expect(trackRows[0]).toHaveAttribute('data-show-artwork', 'true');
    expect(trackRows[0]).toHaveAttribute('data-secondary-text', '测试艺人 · 推荐专辑 1');
    expect(screen.queryByTestId('mobile-artist-library-entry')).not.toBeInTheDocument();
    expect(screen.queryByText('曲库歌曲')).not.toBeInTheDocument();
    expect(screen.queryByText('本地推荐')).not.toBeInTheDocument();
  });

  it('expands featured songs in place up to ten items and hides artist playlists from the overview', () => {
    render(
      <MemoryRouter>
        <MobileArtistDetailPage
          artistId="artist-1"
          themeColor="rgb(38, 38, 38)"
          artist={{
            id: 'artist-1',
            name: '测试艺人',
            artworkUrl: 'https://example.com/artist.jpg',
            artworkWidth: 1200,
            artworkHeight: 1200,
            genres: ['摇滚'],
            motionVideoUrl: '',
            landscapeUrl: '',
            featuredSongsSource: 'history',
            topSongs: [],
            featuredSongs: Array.from({ length: 12 }, (_, index) => ({
              id: `featured-${index + 1}`,
              name: `推荐歌曲 ${index + 1}`,
              artistName: '测试艺人',
              artistId: 'artist-1',
              albumName: `推荐专辑 ${index + 1}`,
              albumId: `album-${index + 1}`,
              duration: 180000,
              artworkUrl: 'https://example.com/featured.jpg',
              hasLyrics: false,
            })),
            librarySongs: [],
            essentialAlbums: [
              {
                id: 'album-1',
                name: '精选专辑',
                artistName: '测试艺人',
                artistId: 'artist-1',
                artworkUrl: 'https://example.com/album.jpg',
                releaseDate: '2024-01-01',
                trackCount: 10,
              },
            ],
            albums: [],
            singlesAndEPs: [],
            liveAlbums: [],
            compilationAlbums: [],
            appearsOnAlbums: [],
          }}
        />
      </MemoryRouter>
    );

    const featuredModule = screen.getByTestId('mobile-artist-overview-featured-songs');
    expect(within(featuredModule).getAllByTestId('mobile-track-row')).toHaveLength(5);
    expect(within(featuredModule).getByRole('heading', { name: '你常听的歌曲' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开查看 10 首' }));

    expect(within(featuredModule).getAllByTestId('mobile-track-row')).toHaveLength(10);
    expect(screen.getByRole('button', { name: '收起推荐歌曲' })).toBeInTheDocument();
    expect(screen.getByText('专辑')).toBeInTheDocument();
    expect(screen.queryByText('艺人歌单')).not.toBeInTheDocument();
  });
});
