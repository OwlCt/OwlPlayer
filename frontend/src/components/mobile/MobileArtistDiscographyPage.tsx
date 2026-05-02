import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Album, ReleaseType } from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { getProxiedImageUrl } from '../../utils/image';
import CachedImage from '../CachedImage';
import MobileHeader from './MobileHeader';
import MobileAlbumMenu from './MobileAlbumMenu';
import { useTouchClick } from '../../hooks/useTouchClick';
import { useGoBack } from '../../hooks/useNavigationHistory';
import { getReleaseTypeLabel, normalizeReleaseType } from '../../utils/releaseType';

const INITIAL_LOAD_COUNT = 10;
const LOAD_INCREMENT = 10;

type DiscographyFilter = ReleaseType | 'live' | 'compilation';

interface DiscographyData {
  essentialAlbums?: Album[];
  albums?: Album[];
  singlesAndEPs?: Album[];
  liveAlbums?: Album[];
  compilationAlbums?: Album[];
}

interface MobileArtistDiscographyPageProps {
  artistId: string;
  artistName: string;
  discography: DiscographyData;
}

interface DiscographyEntry extends Album {
  filterType: DiscographyFilter;
  typeLabel: string;
}

const DISCOGRAPHY_LABELS: Record<DiscographyFilter, string> = {
  album: '专辑',
  ep: 'EP',
  single: '单曲',
  live: '现场',
  compilation: '合辑',
};

function sortAlbumsByReleaseDateDesc(albums: DiscographyEntry[]): DiscographyEntry[] {
  return [...albums].sort((a, b) => {
    const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;

    if (dateA !== dateB) {
      return dateB - dateA;
    }

    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

interface DiscographyItemProps {
  album: DiscographyEntry;
  onClick: () => void;
  onLongPress: () => void;
  isPlaying?: boolean;
}

function DiscographyItem({
  album,
  onClick,
  onLongPress,
  isPlaying = false,
}: DiscographyItemProps) {
  const touchHandlers = useTouchClick(onClick, { onLongPress, longPressDelay: 500 });
  const year = album.releaseDate ? new Date(album.releaseDate).getFullYear() : '';

  return (
    <div
      {...touchHandlers}
      className="flex items-center gap-3 w-full p-3 rounded-lg active:bg-white/10 transition-colors text-left min-h-[64px] cursor-pointer select-none"
      data-testid="discography-item"
    >
      <div
        className={`w-14 h-14 flex-shrink-0 bg-neutral-800 rounded overflow-hidden ${
          isPlaying ? 'ring-2 ring-spotify-green' : ''
        }`}
      >
        {album.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(album.artworkUrl, 112)}
            alt={album.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">♪</div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className={`font-medium truncate ${isPlaying ? 'text-spotify-green' : 'text-white'}`}>
          {album.name}
        </div>
        <div className="text-sm text-white/60 truncate">
          {year && `${year} · `}
          {album.typeLabel}
        </div>
      </div>
    </div>
  );
}

export default function MobileArtistDiscographyPage({
  artistId,
  artistName,
  discography,
}: MobileArtistDiscographyPageProps) {
  const navigate = useNavigate();
  const { queueSource, isPlaying } = usePlayerStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<DiscographyEntry | null>(null);
  const [activeFilter, setActiveFilter] = useState<DiscographyFilter>('album');
  const [visibleCount, setVisibleCount] = useState(INITIAL_LOAD_COUNT);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const categorizedAlbums = useMemo(() => {
    const buckets: Record<DiscographyFilter, DiscographyEntry[]> = {
      album: [],
      ep: [],
      single: [],
      live: [],
      compilation: [],
    };
    const seen = {
      album: new Set<string>(),
      ep: new Set<string>(),
      single: new Set<string>(),
      live: new Set<string>(),
      compilation: new Set<string>(),
    };

    const pushAlbums = (albums: Album[] = [], forcedType?: DiscographyFilter) => {
      albums.forEach((album) => {
        const filterType =
          forcedType || normalizeReleaseType(album.releaseType, album.isSingle);

        if (seen[filterType].has(album.id)) {
          return;
        }
        seen[filterType].add(album.id);

        buckets[filterType].push({
          ...album,
          filterType,
          typeLabel:
            forcedType && (forcedType === 'live' || forcedType === 'compilation')
              ? DISCOGRAPHY_LABELS[forcedType]
              : getReleaseTypeLabel(album.releaseType, album.isSingle),
        });
      });
    };

    pushAlbums([
      ...(discography.essentialAlbums || []),
      ...(discography.albums || []),
    ], 'album');
    pushAlbums(discography.singlesAndEPs || []);
    pushAlbums(discography.liveAlbums || [], 'live');
    pushAlbums(discography.compilationAlbums || [], 'compilation');

    return {
      album: sortAlbumsByReleaseDateDesc(buckets.album),
      ep: sortAlbumsByReleaseDateDesc(buckets.ep),
      single: sortAlbumsByReleaseDateDesc(buckets.single),
      live: sortAlbumsByReleaseDateDesc(buckets.live),
      compilation: sortAlbumsByReleaseDateDesc(buckets.compilation),
    };
  }, [discography]);

  const filterTabs = useMemo(() => {
    const tabs: { value: DiscographyFilter; label: string; count: number }[] = [
      { value: 'album', label: '专辑', count: categorizedAlbums.album.length },
      { value: 'ep', label: 'EP', count: categorizedAlbums.ep.length },
      { value: 'single', label: '单曲', count: categorizedAlbums.single.length },
    ];

    if (categorizedAlbums.live.length > 0) {
      tabs.push({
        value: 'live',
        label: DISCOGRAPHY_LABELS.live,
        count: categorizedAlbums.live.length,
      });
    }

    if (categorizedAlbums.compilation.length > 0) {
      tabs.push({
        value: 'compilation',
        label: DISCOGRAPHY_LABELS.compilation,
        count: categorizedAlbums.compilation.length,
      });
    }

    return tabs;
  }, [categorizedAlbums]);

  useEffect(() => {
    if (!filterTabs.some((tab) => tab.value === activeFilter)) {
      setActiveFilter('album');
    }
  }, [activeFilter, filterTabs]);

  useEffect(() => {
    setVisibleCount(INITIAL_LOAD_COUNT);
  }, [activeFilter, artistId]);

  const filteredAlbums = categorizedAlbums[activeFilter];
  const visibleAlbums = useMemo(
    () => filteredAlbums.slice(0, visibleCount),
    [filteredAlbums, visibleCount]
  );
  const hasMore = visibleCount < filteredAlbums.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) =>
        Math.min(prev + LOAD_INCREMENT, filteredAlbums.length)
      );
    }
  }, [filteredAlbums.length, hasMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadMore]);

  const isAlbumPlaying = (albumId: string) =>
    isPlaying && queueSource.type === 'album' && queueSource.id === albumId;

  const handleAlbumClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  const handleLongPress = (album: DiscographyEntry) => {
    setSelectedAlbum(album);
    setMenuOpen(true);
  };

  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  return (
    <div className="flex flex-col h-full bg-black">
      <MobileHeader title={artistName} opacity={1} onBack={handleBack} />

      <div
        className="flex-1 overflow-y-auto px-4 pb-52"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
      >
        <div className="mb-5 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveFilter(tab.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeFilter === tab.value
                    ? 'bg-white text-black'
                    : 'bg-white/[0.06] text-white/75 border border-white/10'
                }`}
              >
                {tab.label}
                <span className="ml-1 text-xs opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        {filteredAlbums.length === 0 ? (
          <div className="text-center py-12 text-white/40">
            暂无{DISCOGRAPHY_LABELS[activeFilter]}
          </div>
        ) : (
          <div className="space-y-1">
            {visibleAlbums.map((album) => (
              <DiscographyItem
                key={album.id}
                album={album}
                onClick={() => handleAlbumClick(album)}
                onLongPress={() => handleLongPress(album)}
                isPlaying={isAlbumPlaying(album.id)}
              />
            ))}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center text-white/40 text-sm">
                加载中...
              </div>
            )}
          </div>
        )}
      </div>

      {selectedAlbum && (
        <MobileAlbumMenu
          album={{
            id: selectedAlbum.id,
            name: selectedAlbum.name,
            artistId: artistId,
            artistName: artistName,
            artworkUrl: selectedAlbum.artworkUrl || '',
            trackCount: selectedAlbum.trackCount || 0,
            releaseType: selectedAlbum.releaseType,
            isSingle: selectedAlbum.isSingle,
          }}
          isOpen={menuOpen}
          onClose={() => {
            setMenuOpen(false);
            setSelectedAlbum(null);
          }}
        />
      )}
    </div>
  );
}
