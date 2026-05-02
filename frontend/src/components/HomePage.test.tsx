import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HomePage from './HomePage';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  playHistoryStore: {
    topTracks: [] as Array<{
      songId: string;
      songName: string;
      artistId: string;
      artistName: string;
      albumId: string;
      albumName: string;
      artworkUrl: string;
      duration: number;
      playCount: number;
    }>,
    topArtists: [] as Array<{
      artistId: string;
      artistName: string;
      artworkUrl: string;
      playCount: number;
    }>,
    fetchTopArtists: vi.fn(),
    fetchTopTracks: vi.fn(),
  },
  playerStore: {
    setQueue: vi.fn(),
    queueSource: { type: null, id: null },
    isPlaying: false,
    pause: vi.fn(),
    play: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('../api', () => ({
  getAlbumDetail: vi.fn(),
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: () => ({ user: { username: 'owl' } }),
}));

vi.mock('../store/playHistoryStore', () => ({
  usePlayHistoryStore: () => mocks.playHistoryStore,
}));

vi.mock('../store/playerStore', () => ({
  usePlayerStore: () => mocks.playerStore,
}));

vi.mock('../hooks/useOnlineStatus', () => ({
  subscribeToNetworkRecovery: vi.fn(() => () => undefined),
}));

vi.mock('./SongCard', () => ({
  default: ({ song }: { song: { name: string } }) => <div>{song.name}</div>,
}));

vi.mock('./AlbumCard', () => ({
  default: ({ album }: { album: { name: string } }) => <div>{album.name}</div>,
}));

vi.mock('./ProfileArtistCard', () => ({
  default: ({ artist }: { artist: { name: string } }) => <div>{artist.name}</div>,
}));

vi.mock('./RecommendationSection', () => ({
  default: ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  ),
}));

vi.mock('./RecentlyPlayedSection', () => ({
  default: () => <div data-testid="recently-played" />,
}));

vi.mock('./HomeBrowseLinks', () => ({
  default: () => <div data-testid="home-browse-links" />,
}));

describe('HomePage', () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.playHistoryStore.fetchTopArtists.mockReset();
    mocks.playHistoryStore.fetchTopTracks.mockReset();
    mocks.playHistoryStore.topArtists = [];
    mocks.playHistoryStore.topTracks = [];
  });

  it('hides monthly sections when there is no data', () => {
    render(<HomePage />);

    expect(screen.queryByText('本月热门艺人')).not.toBeInTheDocument();
    expect(screen.queryByText('本月热门专辑')).not.toBeInTheDocument();
    expect(screen.queryByText('本月热门曲目')).not.toBeInTheDocument();
    expect(screen.queryByText('播放历史再积累一些，这里就会出现你最近最常听的艺人。')).not.toBeInTheDocument();
    expect(screen.queryByText('多播放一些本地歌曲后，这里会出现你本月最常听的专辑。')).not.toBeInTheDocument();
    expect(screen.queryByText('多听几首本地歌曲后，这里会开始生成你的月度热门曲目。')).not.toBeInTheDocument();
  });

  it('shows monthly sections after data is available', () => {
    mocks.playHistoryStore.topArtists = [
      { artistId: 'artist-1', artistName: 'Artist 1', artworkUrl: '', playCount: 3 },
    ];
    mocks.playHistoryStore.topTracks = [
      {
        songId: 'song-1',
        songName: 'Song 1',
        artistId: 'artist-1',
        artistName: 'Artist 1',
        albumId: 'album-1',
        albumName: 'Album 1',
        artworkUrl: '',
        duration: 180,
        playCount: 3,
      },
    ];

    render(<HomePage />);

    expect(screen.getByText('本月热门艺人')).toBeInTheDocument();
    expect(screen.getByText('本月热门专辑')).toBeInTheDocument();
    expect(screen.getByText('本月热门曲目')).toBeInTheDocument();
  });
});
