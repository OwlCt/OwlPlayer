import { forwardRef, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Song } from '../types';
import NowPlayingView from './NowPlayingView';

const mocks = vi.hoisted(() => {
  const playerStoreState = {
    currentSong: null as Song | null,
    seek: vi.fn(),
    queue: [] as Song[],
    queueIndex: 0,
    toggleNowPlaying: vi.fn(),
    showTranslation: false,
    toggleTranslation: vi.fn(),
    nowPlayingSection: 'artist' as 'lyrics' | 'artist' | 'queue',
    setNowPlayingSection: vi.fn(),
    queueSource: { type: 'album' as const, id: 'album-1', name: '测试专辑' },
    activateExpandedLyrics: vi.fn(),
    expandedLyricsMode: false,
    setLyricsVisible: vi.fn(),
    reorderQueue: vi.fn(),
    playFromQueue: vi.fn(),
    removeFromQueue: vi.fn(),
    isShuffled: false,
    addToQueue: vi.fn(),
  };

  const likedSongsStoreState = {
    isLiked: vi.fn(() => false),
    likeSong: vi.fn(),
    unlikeSong: vi.fn(),
  };

  const playlistsStoreState = {
    addSongToPlaylist: vi.fn(),
    createPlaylist: vi.fn(),
    getNextPlaylistName: vi.fn(() => '新歌单'),
  };

  const offlineCacheStoreState = {
    cachedSongIds: new Set<string>(),
  };

  const followedArtistsStoreState = {
    isFollowed: vi.fn(() => false),
    followArtist: vi.fn(),
    unfollowArtist: vi.fn(),
  };

  return {
    playerStoreState,
    likedSongsStoreState,
    playlistsStoreState,
    offlineCacheStoreState,
    followedArtistsStoreState,
  };
});

vi.mock('framer-motion', () => {
  const createMotionComponent = (tag: string) =>
    forwardRef<HTMLElement, any>(({ children, ...props }, ref) => {
      const {
        initial: _initial,
        animate: _animate,
        exit: _exit,
        transition: _transition,
        variants: _variants,
        layout: _layout,
        layoutId: _layoutId,
        whileHover: _whileHover,
        whileTap: _whileTap,
        drag: _drag,
        dragConstraints: _dragConstraints,
        ...rest
      } = props;
      const Component = tag as keyof JSX.IntrinsicElements;
      return (
        <Component ref={ref as any} {...rest}>
          {children}
        </Component>
      );
    });

  const motion = new Proxy(
    {},
    {
      get: (_target, tag: string) => createMotionComponent(tag),
    }
  );

  return {
    motion,
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

vi.mock('overlayscrollbars-react', () => ({
  OverlayScrollbarsComponent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <>{children}</>,
  closestCenter: vi.fn(),
  KeyboardSensor: class {},
  PointerSensor: class {},
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  DragOverlay: ({ children }: any) => <>{children}</>,
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
  verticalListSortingStrategy: {},
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: () => '',
    },
  },
}));

vi.mock('../store/playerStore', () => ({
  usePlayerStore: () => mocks.playerStoreState,
}));

vi.mock('../store/likedSongsStore', () => ({
  useLikedSongsStore: () => mocks.likedSongsStoreState,
}));

vi.mock('../store/playlistsStore', () => ({
  usePlaylistsStore: () => mocks.playlistsStoreState,
}));

vi.mock('../store/offlineCacheStore', () => ({
  useOfflineCacheStore: () => mocks.offlineCacheStoreState,
}));

vi.mock('../store/followedArtistsStore', () => ({
  useFollowedArtistsStore: () => mocks.followedArtistsStoreState,
}));

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: true }),
  getManualOfflineMode: () => false,
}));

vi.mock('../api', () => ({
  getLyrics: vi.fn(async () => ({ available: false, songId: 'song-1', ttml: '', type: 'lyrics' })),
  getSongDetail: vi.fn(async () => ({
    composerName: '测试作曲',
    credits: {},
    artists: [
      {
        id: 'artist-1',
        name: '测试歌手',
        fieldSources: {
          name: { source: 'remote', confidence: 0.95, enhanced: true },
        },
      },
    ],
    album: {
      id: 'album-1',
      name: '测试专辑',
      artworkUrl: '/album.jpg',
      releaseDate: '2024-01-01',
      trackCount: 10,
      fieldSources: {
        name: { source: 'remote', confidence: 0.95, enhanced: true },
      },
    },
  })),
  getAlbumDetail: vi.fn(async () => ({
    id: 'album-1',
    name: '测试专辑',
    artistName: '测试歌手',
    artworkUrl: '/album.jpg',
    trackCount: 10,
    tracks: [],
    fieldSources: {
      name: { source: 'remote', confidence: 0.95, enhanced: true },
    },
  })),
}));

vi.mock('../utils/nowPlayingDetails', () => ({
  resolveNowPlayingSongData: () => null,
}));

vi.mock('../utils/nowPlayingMetadata', () => ({
  getNowPlayingReleaseDate: () => '2024年1月1日',
}));

vi.mock('../utils/cacheFirstImage', () => ({
  getCacheFirstArtworkUrl: vi.fn(async (_songId: string, fallbackUrl: string) => fallbackUrl),
}));

vi.mock('./PlaylistSubmenu', () => ({
  default: () => <div>PlaylistSubmenu</div>,
}));

vi.mock('./ScrollingText', () => ({
  default: ({ text, className, onClick }: any) => (
    <span className={className} onClick={onClick}>
      {text}
    </span>
  ),
}));

vi.mock('./LikeButton', () => ({
  LikeButton: () => <span>LikeButton</span>,
}));

vi.mock('./ClickableLink', () => ({
  default: ({ text, className, onClick }: any) => (
    <span className={className} onClick={onClick}>
      {text}
    </span>
  ),
  getArtistHref: (artistId?: string) => (artistId ? `/artist/${artistId}` : undefined),
}));

vi.mock('./CachedImage', () => ({
  default: ({ alt, className }: any) => <img alt={alt} className={className} />,
}));

vi.mock('./MotionArtwork', () => ({
  default: ({ alt }: any) => <div>{alt}</div>,
}));

function renderWithRouter(ui: ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

function click(element: HTMLElement) {
  fireEvent.mouseDown(element);
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

describe('NowPlayingView', () => {
  const currentSong: Song = {
    id: 'song-1',
    name: '测试歌曲',
    artistName: '测试歌手',
    artistId: 'artist-1',
    albumName: '测试专辑',
    albumId: 'album-1',
    duration: 215000,
    artworkUrl: '/song.jpg',
    hasLyrics: true,
  };

  beforeEach(() => {
    if (!('ResizeObserver' in globalThis)) {
      class ResizeObserverMock {
        observe() {}
        disconnect() {}
        unobserve() {}
      }
      vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    }

    vi.clearAllMocks();
    mocks.playerStoreState.currentSong = currentSong;
    mocks.playerStoreState.queue = [currentSong];
    mocks.playerStoreState.queueIndex = 0;
    mocks.playerStoreState.nowPlayingSection = 'artist';
    mocks.playerStoreState.queueSource = { type: 'album', id: 'album-1', name: '测试专辑' };
    mocks.likedSongsStoreState.isLiked.mockReturnValue(false);
    mocks.followedArtistsStoreState.isFollowed.mockReturnValue(false);
  });

  it('closes the song menu when the more button is clicked again', async () => {
    renderWithRouter(<NowPlayingView />);

    const moreButton = screen.getByTitle('更多选项');

    click(moreButton);

    await waitFor(() => {
      expect(screen.getByText('加入播放队列')).toBeInTheDocument();
    });
    expect(moreButton).toHaveAttribute('aria-expanded', 'true');

    click(moreButton);

    await waitFor(() => {
      expect(screen.queryByText('加入播放队列')).not.toBeInTheDocument();
    });
    expect(moreButton).toHaveAttribute('aria-expanded', 'false');
  });
});
