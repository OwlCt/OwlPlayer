import { forwardRef, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Album, Song } from '../types';
import SongCard from './SongCard';
import AlbumCard from './AlbumCard';
import NowPlayingView from './NowPlayingView';

const mocks = vi.hoisted(() => {
  const playerStoreState = {
    currentSong: null as Song | null,
    isPlaying: false,
    togglePlay: vi.fn(),
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
  };

  const likedSongsStoreState = {
    isLiked: vi.fn(() => false),
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
      get: (_target, tag: string) => {
        return createMotionComponent(tag);
      },
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

vi.mock('../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../hooks/useTouchClick', () => ({
  useTouchClick: () => ({}),
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

vi.mock('./SongContextMenu', () => ({
  default: () => null,
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
  getAlbumHref: (albumId?: string) => (albumId ? `/album/${albumId}` : undefined),
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

describe('metadata pill removal', () => {
  const songWithMetadata: Song = {
    id: 'song-1',
    name: '测试歌曲',
    artistName: '测试歌手',
    artistId: 'artist-1',
    albumName: '测试专辑',
    albumId: 'album-1',
    duration: 215000,
    artworkUrl: '/song.jpg',
    hasLyrics: true,
    availabilityStatus: 'unavailable',
    fieldSources: {
      name: { source: 'tag', confidence: 0.9, enhanced: true },
    },
  };

  const albumWithMetadata: Album = {
    id: 'album-1',
    name: '测试专辑',
    artistName: '测试歌手',
    artistId: 'artist-1',
    artworkUrl: '/album.jpg',
    releaseDate: '2024-01-01',
    trackCount: 10,
    availabilityStatus: 'stale',
    fieldSources: {
      name: { source: 'tag', confidence: 0.9, enhanced: true },
    },
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
    mocks.playerStoreState.currentSong = null;
    mocks.playerStoreState.isPlaying = false;
    mocks.playerStoreState.queue = [];
    mocks.playerStoreState.queueIndex = 0;
    mocks.playerStoreState.nowPlayingSection = 'artist';
    mocks.playerStoreState.queueSource = { type: 'album', id: 'album-1', name: '测试专辑' };
    mocks.likedSongsStoreState.isLiked.mockReturnValue(false);
    mocks.offlineCacheStoreState.cachedSongIds = new Set<string>();
    mocks.followedArtistsStoreState.isFollowed.mockReturnValue(false);
  });

  it('does not render metadata pills in SongCard', () => {
    renderWithRouter(<SongCard song={songWithMetadata} onPlay={vi.fn()} />);

    expect(screen.queryByText('标签')).not.toBeInTheDocument();
    expect(screen.queryByText('已增强')).not.toBeInTheDocument();
    expect(screen.queryByText('文件不可用')).not.toBeInTheDocument();
    expect(screen.queryByText('待重扫')).not.toBeInTheDocument();
  });

  it('does not render metadata pills in AlbumCard', () => {
    renderWithRouter(<AlbumCard album={albumWithMetadata} />);

    expect(screen.queryByText('标签')).not.toBeInTheDocument();
    expect(screen.queryByText('已增强')).not.toBeInTheDocument();
    expect(screen.queryByText('文件不可用')).not.toBeInTheDocument();
    expect(screen.queryByText('待重扫')).not.toBeInTheDocument();
  });

  it('keeps metadata source summary in NowPlayingView without any pills', async () => {
    mocks.playerStoreState.currentSong = songWithMetadata;
    mocks.playerStoreState.queue = [songWithMetadata];

    renderWithRouter(<NowPlayingView />);

    await waitFor(() => {
      expect(screen.getByText('元数据来源：标签 · 在线增强')).toBeInTheDocument();
    });

    expect(screen.queryByText('已增强')).not.toBeInTheDocument();
    expect(screen.queryByText('文件不可用')).not.toBeInTheDocument();
    expect(screen.queryByText('待重扫')).not.toBeInTheDocument();
  });
});
