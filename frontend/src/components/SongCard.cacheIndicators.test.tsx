import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Song } from '../types';
import SongCard from './SongCard';

const mocks = vi.hoisted(() => ({
  playerStore: {
    currentSong: null as Song | null,
    isPlaying: false,
    togglePlay: vi.fn(),
  },
  likedSongsStore: {
    isLiked: vi.fn(() => false),
  },
  offlineCacheStore: {
    cachedSongIds: new Set<string>(),
    downloadProgress: null,
    isDownloading: false,
  },
}));

vi.mock('../store/playerStore', () => ({
  usePlayerStore: () => mocks.playerStore,
}));

vi.mock('../store/likedSongsStore', () => ({
  useLikedSongsStore: () => mocks.likedSongsStore,
}));

vi.mock('../store/offlineCacheStore', () => ({
  useOfflineCacheStore: () => mocks.offlineCacheStore,
}));

vi.mock('./SongContextMenu', () => ({
  default: () => null,
}));

vi.mock('./LikeButton', () => ({
  LikeButton: () => null,
}));

vi.mock('./ClickableLink', () => ({
  default: ({ text }: { text: string }) => <span>{text}</span>,
  getArtistHref: () => '/artist/artist-1',
  getAlbumHref: () => '/album/album-1',
}));

vi.mock('./CachedImage', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

describe('SongCard cache indicators', () => {
  const song: Song = {
    id: 'song-1',
    name: '测试歌曲',
    artistName: '测试歌手',
    artistId: 'artist-1',
    albumName: '测试专辑',
    albumId: 'album-1',
    duration: 180000,
    artworkUrl: '',
    hasLyrics: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offlineCacheStore.cachedSongIds = new Set<string>();
    mocks.offlineCacheStore.downloadProgress = null;
    mocks.offlineCacheStore.isDownloading = false;
  });

  it('shows downloaded indicator for cached songs', () => {
    mocks.offlineCacheStore.cachedSongIds = new Set<string>(['song-1']);

    render(
      <MemoryRouter>
        <SongCard song={song} onPlay={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('已下载')).toBeInTheDocument();
  });

  it('shows downloading indicator for songs in an active album download', () => {
    mocks.offlineCacheStore.isDownloading = true;
    mocks.offlineCacheStore.downloadProgress = {
      totalSongs: 10,
      completedSongs: 2,
      currentSongId: 'song-2',
      currentSongProgress: 40,
      failedSongs: [],
      status: 'downloading',
      collectionType: 'album',
      collectionId: 'album-1',
    };

    render(
      <MemoryRouter>
        <SongCard song={song} onPlay={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText('下载中')).toBeInTheDocument();
  });
});
