import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Song, Album } from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import { getProxiedImageUrl } from '../../utils/image';
import { getReleaseTypeLabel } from '../../utils/releaseType';
import MobileHeader from './MobileHeader';
import MobileSongMenu from './MobileSongMenu';
import { MobileTrackRow } from './MobileDetailPage';
import { useGoBack } from '../../hooks/useNavigationHistory';
import CachedImage from '../CachedImage';
import {
  ARTIST_ALL_SONGS_FEATURED_LIMIT,
  buildArtistQueueSource,
  enrichSongForArtistNavigation,
  getFeaturedSongsHeading,
  groupLibrarySongsWithAlbumInfo,
  isArtistQueueSource,
  sliceGroupedArtistSongs,
} from '../../utils/artistPage';

const INITIAL_LOAD_COUNT = 10;
const LOAD_INCREMENT = 10;

interface MobileArtistAllSongsPageProps {
  artistId: string;
  artistName: string;
  featuredSongs: Song[];
  featuredSongsSource?: 'history' | 'library_fallback';
  librarySongs: Song[];
  albums?: Album[];
}

function getReleaseYear(releaseDate?: string): number | null {
  if (!releaseDate) {
    return null;
  }

  const year = new Date(releaseDate).getFullYear();
  return Number.isNaN(year) ? null : year;
}

function getLibraryGroupMetaParts(album: {
  releaseType?: string;
  isSingle?: boolean;
  releaseDate?: string;
  songs: Song[];
}): string[] {
  const parts: string[] = [];

  parts.push(getReleaseTypeLabel(album.releaseType, album.isSingle));

  const year = getReleaseYear(album.releaseDate);
  if (year !== null) {
    parts.push(String(year));
  }

  parts.push(`${album.songs.length} 首歌曲`);

  return parts;
}

export default function MobileArtistAllSongsPage({
  artistId,
  artistName,
  featuredSongs,
  featuredSongsSource,
  librarySongs,
  albums = [],
}: MobileArtistAllSongsPageProps) {
  const navigate = useNavigate();
  const { setQueue, queueSource, isPlaying, currentSong, pause, play } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_LOAD_COUNT);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const featuredSectionRef = useRef<HTMLDivElement>(null);
  const librarySectionRef = useRef<HTMLDivElement>(null);

  const isCurrentArtistSource = isArtistQueueSource(queueSource, artistId, 'library');
  const isCurrentArtistFeaturedSource = isArtistQueueSource(queueSource, artistId, 'featured');
  const isCurrentArtistPlaying = isCurrentArtistSource && isPlaying;
  const featuredSectionTitle = getFeaturedSongsHeading(featuredSongsSource);
  const previewFeaturedSongs = featuredSongs.slice(0, ARTIST_ALL_SONGS_FEATURED_LIMIT);
  const featuredArtworkUrl = previewFeaturedSongs[0]?.artworkUrl;

  const groupedSongs = useMemo(() => {
    return groupLibrarySongsWithAlbumInfo(librarySongs, albums);
  }, [albums, librarySongs]);

  const visibleGroups = useMemo(() => {
    return sliceGroupedArtistSongs(groupedSongs, visibleCount);
  }, [groupedSongs, visibleCount]);

  const groupMap = useMemo(() => {
    return new Map(groupedSongs.map((group) => [group.key, group]));
  }, [groupedSongs]);

  const hasMore = visibleCount < librarySongs.length;
  const albumGroupCount = groupedSongs.length;

  const loadMore = useCallback(() => {
    if (hasMore) {
      setVisibleCount((prev) => Math.min(prev + LOAD_INCREMENT, librarySongs.length));
    }
  }, [hasMore, librarySongs.length]);

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

  useEffect(() => {
    setVisibleCount(INITIAL_LOAD_COUNT);
  }, [artistId]);

  const isAlbumCurrentSource = useCallback((albumId?: string) => {
    if (!albumId) {
      return isCurrentArtistSource;
    }

    return queueSource.type === 'album' && queueSource.id === albumId;
  }, [isCurrentArtistSource, queueSource.id, queueSource.type]);

  const handleTrackTap = useCallback((song: Song) => {
    const index = librarySongs.findIndex((item) => item.id === song.id);
    if (index < 0) {
      return;
    }

    recordPlay('artist', artistId);
    setQueue(librarySongs, index, buildArtistQueueSource(artistId, artistName, 'library'));
  }, [artistId, artistName, librarySongs, recordPlay, setQueue]);

  const handleFeaturedTrackTap = useCallback((song: Song) => {
    const index = featuredSongs.findIndex((item) => item.id === song.id);
    if (index < 0) {
      return;
    }

    recordPlay('artist', artistId);
    setQueue(featuredSongs, index, buildArtistQueueSource(artistId, artistName, 'featured'));
  }, [artistId, artistName, featuredSongs, recordPlay, setQueue]);

  const handlePlayFeaturedCollection = useCallback(() => {
    if (featuredSongs.length === 0) {
      return;
    }

    recordPlay('artist', artistId);
    setQueue(featuredSongs, 0, buildArtistQueueSource(artistId, artistName, 'featured'));
  }, [artistId, artistName, featuredSongs, recordPlay, setQueue]);

  const handlePlayAll = useCallback(() => {
    if (librarySongs.length === 0) {
      return;
    }

    if (isCurrentArtistSource) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    recordPlay('artist', artistId);
    setQueue(librarySongs, 0, buildArtistQueueSource(artistId, artistName, 'library'));
  }, [artistId, artistName, isCurrentArtistSource, isPlaying, librarySongs, pause, play, recordPlay, setQueue]);

  const handlePlayGroup = useCallback((groupKey: string) => {
    const group = groupMap.get(groupKey);
    if (!group || group.songs.length === 0) {
      return;
    }

    if (isAlbumCurrentSource(group.albumId)) {
      if (isPlaying) {
        pause();
      } else {
        play();
      }
      return;
    }

    if (group.albumId) {
      recordPlay('album', group.albumId);
      setQueue(group.songs, 0, { type: 'album', id: group.albumId, name: group.albumName });
      return;
    }

    recordPlay('artist', artistId);
    setQueue(group.songs, 0, buildArtistQueueSource(artistId, artistName, 'library'));
  }, [artistId, artistName, groupMap, isAlbumCurrentSource, isPlaying, pause, play, recordPlay, setQueue]);

  const handleLongPress = useCallback((song: Song, fallbackAlbum?: { id?: string; name?: string }) => {
    setMenuSong(enrichSongForArtistNavigation(song, {
      artistId,
      artistName,
      albums,
      fallbackAlbumId: fallbackAlbum?.id,
      fallbackAlbumName: fallbackAlbum?.name,
    }));
    setMenuOpen(true);
  }, [albums, artistId, artistName]);

  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  const scrollToSection = useCallback((section: 'featured' | 'library') => {
    const target = section === 'featured' ? featuredSectionRef.current : librarySectionRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="flex h-full flex-col bg-black" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <MobileHeader title={`${artistName} · 全部歌曲`} opacity={1} onBack={handleBack} />

      <div className="flex-1 overflow-y-auto pb-52">
        {librarySongs.length === 0 ? (
          <div className="py-12 text-center text-white/40">这位艺人的本地曲库还是空的。</div>
        ) : (
          <div className="px-4 pb-4 pt-3">
            <div className="mb-4 overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(52,211,153,0.18),_rgba(255,255,255,0.04)_42%,_rgba(255,255,255,0.02)_100%)] p-4">
              <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-white/40">全部歌曲</p>
              <h1 className="text-[30px] font-bold leading-tight text-white">{artistName}</h1>
              <p className="mt-2 text-sm leading-6 text-white/60">按专辑整理，长按歌曲可打开更多操作。</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/75">
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                  {librarySongs.length} 首歌曲
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                  {albumGroupCount} 张唱片
                </span>
                {previewFeaturedSongs.length > 0 && (
                  <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5">
                    {previewFeaturedSongs.length} 首推荐
                  </span>
                )}
              </div>
            </div>

            <div className="sticky top-0 z-20 -mx-4 mb-6 border-y border-white/5 bg-black/80 px-4 py-3 backdrop-blur-xl">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <button
                  type="button"
                  onClick={handlePlayAll}
                  className="inline-flex h-10 items-center rounded-full bg-spotify-green px-4 text-sm font-semibold text-black"
                >
                  {isCurrentArtistPlaying ? '暂停播放' : isCurrentArtistSource ? '继续播放' : '播放全部'}
                </button>
                {previewFeaturedSongs.length > 0 && (
                  <button
                    type="button"
                    onClick={() => scrollToSection('featured')}
                    className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80"
                  >
                    跳到推荐
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => scrollToSection('library')}
                  className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.05] px-4 text-sm text-white/80"
                >
                  按专辑浏览
                </button>
              </div>
            </div>

            {previewFeaturedSongs.length > 0 && (
              <section
                ref={featuredSectionRef}
                className="mb-8 scroll-mt-24"
                data-testid="mobile-artist-featured-module"
              >
                <div className="mb-4 flex gap-3">
                  <div className="flex h-[88px] w-[88px] flex-shrink-0 overflow-hidden rounded-2xl bg-neutral-800">
                    {featuredArtworkUrl ? (
                      <CachedImage
                        src={getProxiedImageUrl(featuredArtworkUrl, 192)}
                        alt={featuredSectionTitle}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-white/20">♪</div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-end">
                    <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-white/35">推荐集</p>
                    <h2 className="text-lg font-bold text-white">{featuredSectionTitle}</h2>
                    <p className="mt-1 text-sm text-white/50">{previewFeaturedSongs.length} 首更适合先听的歌曲</p>
                    <button
                      type="button"
                      onClick={handlePlayFeaturedCollection}
                      className="mt-3 inline-flex h-9 w-fit items-center gap-2 rounded-full bg-spotify-green px-4 text-sm font-medium text-black"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5.14v13.72L19 12 8 5.14z" />
                      </svg>
                      <span>播放推荐</span>
                    </button>
                  </div>
                </div>

                <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.03]">
                  {previewFeaturedSongs.map((song, index) => (
                    <MobileTrackRow
                      key={song.id}
                      track={song}
                      index={index}
                      isPlaying={isPlaying}
                      isCurrentTrack={currentSong?.id === song.id && isCurrentArtistFeaturedSource}
                      onTap={() => handleFeaturedTrackTap(song)}
                      onLongPress={() => handleLongPress(song)}
                      showArtwork
                      secondaryText={`${song.artistName} · ${song.albumName}`}
                    />
                  ))}
                </div>
              </section>
            )}

            <div
              ref={librarySectionRef}
              className="space-y-6 scroll-mt-24"
              data-testid="mobile-artist-library-groups"
            >
              {visibleGroups.map((group) => {
                const fullGroup = groupMap.get(group.key) || group;
                const isCurrentGroupSource = isAlbumCurrentSource(fullGroup.albumId);
                const isCurrentGroupPlaying = isPlaying && isCurrentGroupSource;
                const visibleSongCount = group.songs.length;
                const totalSongCount = fullGroup.songs.length;
                const metaParts = getLibraryGroupMetaParts(fullGroup);

                return (
                  <section
                    key={group.key}
                    className="overflow-hidden rounded-[28px] border border-white/8 bg-gradient-to-b from-white/[0.05] to-white/[0.02]"
                  >
                    <div className="p-4">
                      <div className="flex gap-3">
                        <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl bg-neutral-800">
                          {fullGroup.artworkUrl ? (
                            <CachedImage
                              src={getProxiedImageUrl(fullGroup.artworkUrl, 160)}
                              alt={fullGroup.albumName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-2xl text-white/20">
                              ♪
                            </div>
                          )}
                        </div>

                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                disabled={!fullGroup.albumId}
                                onClick={() => fullGroup.albumId && navigate(`/album/${fullGroup.albumId}`)}
                                className={`line-clamp-2 text-left text-base font-bold leading-6 text-white ${
                                  fullGroup.albumId ? 'active:opacity-70' : ''
                                }`}
                              >
                                {fullGroup.albumName}
                              </button>
                              {isCurrentGroupSource && (
                                <div className="mt-2 inline-flex rounded-full border border-spotify-green/30 bg-spotify-green/10 px-2.5 py-1 text-[11px] font-medium text-spotify-green">
                                  当前播放队列
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {metaParts.map((part) => (
                              <span
                                key={`${group.key}-${part}`}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/65"
                              >
                                {part}
                              </span>
                            ))}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handlePlayGroup(fullGroup.key)}
                              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-full bg-spotify-green px-4 text-sm font-semibold text-black min-[360px]:flex-none min-[360px]:px-5"
                              aria-label={isCurrentGroupPlaying ? '暂停专辑' : '播放专辑'}
                            >
                              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                                {isCurrentGroupPlaying ? (
                                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                                ) : (
                                  <path d="M8 5.14v13.72L19 12 8 5.14z" />
                                )}
                              </svg>
                              <span>{isCurrentGroupPlaying ? '暂停' : '播放'}</span>
                            </button>
                            {fullGroup.albumId && (
                              <button
                                type="button"
                                onClick={() => navigate(`/album/${fullGroup.albumId}`)}
                                className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-white/80"
                              >
                                打开专辑
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/5 bg-black/20">
                      {group.songs.map((song) => (
                        <MobileTrackRow
                          key={song.id}
                          track={song}
                          index={Math.max((song.trackNumber || 1) - 1, 0)}
                          isPlaying={isPlaying}
                          isCurrentTrack={currentSong?.id === song.id && isCurrentGroupSource}
                          onTap={() => handleTrackTap(song)}
                          onLongPress={() => handleLongPress(song, { id: fullGroup.albumId, name: fullGroup.albumName })}
                          showArtwork={false}
                        />
                      ))}
                      {visibleSongCount < totalSongCount && (
                        <div className="px-4 pb-4 pt-2 text-xs text-white/45">
                          已显示 {visibleSongCount} / {totalSongCount} 首，继续向下滚动可加载更多。
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}

              {hasMore && (
                <div ref={loadMoreRef} className="py-4 text-center text-sm text-white/40">
                  加载中...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <MobileSongMenu
        song={menuSong}
        isOpen={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setMenuSong(null);
        }}
      />
    </div>
  );
}
