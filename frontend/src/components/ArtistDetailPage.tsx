import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiChevronRight } from 'react-icons/fi';
import { getArtistDetail, getAlbumDetail } from '../api';
import { ArtistDetail, Song, Album } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { getProxiedImageUrl } from '../utils/image';
import { extractDominantColor } from '../utils/colorExtractor';
import SongCard from './SongCard';
import AlbumCard from './AlbumCard';
import { StickyHeader } from './StickyHeader';
import { FollowButton } from './FollowButton';
import DraggableImage from './DraggableImage';
import { ShuffleButton } from './ShuffleButton';
import ScrollableCardRow from './ScrollableCardRow';
import { ArtistHero } from './ArtistHero';
import { useIsMobile } from '../hooks/useIsMobile';
import MobileArtistDetailPage, { MobileArtistDetailLoading, MobileArtistDetailError } from './mobile/MobileArtistDetailPage';
import { useGoBack } from '../hooks/useNavigationHistory';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import OfflineFallback from './OfflineFallback';
import {
  ARTIST_OVERVIEW_FEATURED_LIMIT,
  buildArtistQueueSource,
  enrichSongForArtistNavigation,
  getFeaturedSongs,
  getLibrarySongs,
  isArtistQueueSource,
  mergeArtistAlbumGroups,
} from '../utils/artistPage';

// Simple in-memory cache for artist data to avoid re-fetching on back navigation
const artistDetailCache = new Map<string, { data: ArtistDetail; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedArtistDetail(artistId: string): ArtistDetail | null {
  const cached = artistDetailCache.get(artistId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedArtistDetail(artistId: string, data: ArtistDetail): void {
  artistDetailCache.set(artistId, { data, timestamp: Date.now() });
}

export default function ArtistDetailPage() {
  const { artistId } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { setQueue, toggleShuffle, isShuffled, queueSource, isPlaying, pause, play } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const actionBarRef = useRef<HTMLDivElement>(null);

  // Try to get cached data first
  const cachedData = artistId ? getCachedArtistDetail(artistId) : null;

  const [artist, setArtist] = useState<ArtistDetail | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);
  const [themeColor, setThemeColor] = useState<string>('rgb(38, 38, 38)');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [localShuffle, setLocalShuffle] = useState(false);

  // Clear selection when clicking outside song cards
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't clear selection if clicking inside a context menu
      if (target.closest('[class*="bg-[#282828]"]')) {
        return;
      }
      if (!target.closest('[data-song-card]')) {
        setSelectedSongId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (artistId) {
      // If we have cached data, don't reload
      const cached = getCachedArtistDetail(artistId);
      if (cached) {
        setArtist(cached);
        setLoading(false);
        return;
      }
      loadArtistDetail(artistId);
    }
  }, [artistId]);

  // Extract theme color from artist artwork
  useEffect(() => {
    if (artist?.artworkUrl) {
      const imageUrl = getProxiedImageUrl(artist.artworkUrl, 100);
      extractDominantColor(imageUrl).then(setThemeColor);
    }
  }, [artist?.artworkUrl]);

  // Update document title when not playing
  useEffect(() => {
    if (isPlaying || !artist?.name) return;
    document.title = `${artist.name} | OwlPlayer`;
  }, [artist?.name, isPlaying]);

  // Sync localShuffle from playerStore when queueSource matches current artist
  useEffect(() => {
    if (artistId && isArtistQueueSource(queueSource, artistId, 'library')) {
      setLocalShuffle(isShuffled);
    }
  }, [artistId, queueSource, isShuffled]);

  const loadArtistDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getArtistDetail(id);
      setArtist(data);
      setCachedArtistDetail(id, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load artist');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    if (artistId) {
      loadArtistDetail(artistId);
    }
  };

  const handlePlaySong = (song: Song, allSongs: Song[], variant: 'featured' | 'library') => {
    const index = allSongs.findIndex(s => s.id === song.id);
    if (artistId) recordPlay('artist', artistId);
    setQueue(allSongs, index, buildArtistQueueSource(artistId || '', artist?.name || '', variant));
  };

  const handleAlbumClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  // Check if a specific album is currently playing
  const isAlbumPlaying = (albumId: string) => {
    return isPlaying && queueSource.type === 'album' && queueSource.id === albumId;
  };

  // Check if a specific album is the current queue source (playing or paused)
  const isAlbumCurrentSource = (albumId: string) => {
    return queueSource.type === 'album' && queueSource.id === albumId;
  };

  const handlePlayAlbum = async (album: Album) => {
    // Record play for recently played sorting
    recordPlay('album', album.id);
    // If this album is already the current source, just resume playback
    if (isAlbumCurrentSource(album.id)) {
      play();
      return;
    }
    
    // Otherwise, load the album and start playing from the beginning
    try {
      const albumDetail = await getAlbumDetail(album.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        setQueue(albumDetail.tracks, 0, { type: 'album', id: album.id, name: albumDetail.name });
      }
    } catch (err) {
      console.error('Failed to load album tracks:', err);
    }
  };

  // View More navigation handlers - use replace to avoid history loop
  const handleViewMoreAllSongs = () => {
    navigate(`/artist/${artistId}/all-songs`, { replace: true });
  };

  const handleViewMoreAlbums = () => {
    navigate(`/artist/${artistId}/albums`, { replace: true });
  };

  const handleViewMoreSingles = () => {
    navigate(`/artist/${artistId}/singles`, { replace: true });
  };

  const handleViewMoreLive = () => {
    navigate(`/artist/${artistId}/live`, { replace: true });
  };

  const handleViewMoreCompilations = () => {
    navigate(`/artist/${artistId}/compilations`, { replace: true });
  };

  const handleViewMoreAppearsOn = () => {
    navigate(`/artist/${artistId}/appears-on`, { replace: true });
  };

  const handlePlayAll = () => {
    const librarySongs = artist ? getLibrarySongs(artist) : [];
    if (artist && librarySongs.length > 0) {
      recordPlay('artist', artist.id);
      setQueue(librarySongs, 0, buildArtistQueueSource(artist.id, artist.name, 'library'));
      if (localShuffle !== isShuffled) {
        toggleShuffle();
      }
    }
  };

  // Check if current queue source is this artist (regardless of play state)
  const isCurrentArtistLibrarySource = !!artistId && isArtistQueueSource(queueSource, artistId, 'library');
  const isCurrentArtistFeaturedSource = !!artistId && isArtistQueueSource(queueSource, artistId, 'featured');
  const isCurrentArtistPlaying = isPlaying && isCurrentArtistLibrarySource;

  const handlePlayPauseClick = () => {
    if (isCurrentArtistPlaying) {
      pause();
    } else if (isCurrentArtistLibrarySource) {
      play();
    } else {
      handlePlayAll();
    }
  };

  // Mobile: handle back navigation
  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };
  
  // 检测离线状态
  const { isOnline } = useOnlineStatus();
  const artistAlbums = useMemo(
    () => (artist ? mergeArtistAlbumGroups(artist.essentialAlbums, artist.albums) : []),
    [artist]
  );

  // Mobile loading state
  if (isMobile && loading) {
    return <MobileArtistDetailLoading onBack={handleBack} />;
  }

  // Mobile error state - 离线时显示 OfflineFallback
  if (isMobile && error) {
    if (!isOnline) {
      return <OfflineFallback message="离线状态，无法加载艺术家信息" onBack={handleBack} />;
    }
    return <MobileArtistDetailError error={error} onBack={handleBack} />;
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error) {
    // 离线时显示 OfflineFallback
    if (!isOnline) {
      return <OfflineFallback message="离线状态，无法加载艺术家信息" />;
    }
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-spotify-green text-black rounded-full font-medium hover:bg-spotify-green/90 transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="p-8">
        <p className="text-white/60">未找到艺术家</p>
      </div>
    );
  }

  // Preview items
  const featuredSongs = getFeaturedSongs(artist);
  const featuredSectionTitle = '全部歌曲';
  const previewFeaturedSongs = featuredSongs.slice(0, ARTIST_OVERVIEW_FEATURED_LIMIT);
  const hasMoreFeaturedSongs = featuredSongs.length > ARTIST_OVERVIEW_FEATURED_LIMIT;
  const allKnownAlbums = mergeArtistAlbumGroups(
    artist.essentialAlbums,
    artist.albums,
    artist.singlesAndEPs,
    artist.liveAlbums,
    artist.compilationAlbums,
    artist.appearsOnAlbums
  );
  const enrichArtistSong = (song: Song) => {
    if (!artistId) {
      return song;
    }

    return enrichSongForArtistNavigation(song, {
      artistId,
      artistName: artist.name,
      albums: allKnownAlbums,
    });
  };
  const hasAnyAlbumContent =
    artistAlbums.length > 0 ||
    !!artist.singlesAndEPs?.length ||
    !!artist.liveAlbums?.length ||
    !!artist.compilationAlbums?.length ||
    !!artist.appearsOnAlbums?.length;

  // Check if artist has high-res artwork for hero display
  // Criteria: one side >= 2000, OR both sides >= 1000
  // If dimensions not provided (0), assume high-res NOT available (use circular avatar)
  const hasHighResArtwork = !!(
    artist.artworkUrl && 
    artist.artworkWidth && 
    artist.artworkHeight &&
    (
      // One side >= 2000
      artist.artworkWidth >= 2000 || artist.artworkHeight >= 2000 ||
      // OR both sides >= 1000
      (artist.artworkWidth >= 1000 && artist.artworkHeight >= 1000)
    )
  );
  
  // Check if artist has any artwork for hero display (video, landscape, or high-res standard artwork)
  const hasHeroArtwork = !!(artist.motionVideoUrl || artist.landscapeUrl || hasHighResArtwork);
  
  // Use 550px hero height for all hero artwork types
  const heroHeight = 'h-[550px]';

  // Mobile layout - delegate to MobileArtistDetailPage
  if (isMobile) {
    return (
      <MobileArtistDetailPage
        artist={artist}
        themeColor={themeColor}
        artistId={artistId || ''}
      />
    );
  }

  // Desktop layout
  return (
    <StickyHeader
      title={artist.name}
      themeColor={themeColor}
      onPlay={handlePlayPauseClick}
      actionBarRef={actionBarRef}
      isCurrentSourcePlaying={isCurrentArtistPlaying}
      showTrackHeader={false}
    >
      <div 
        className="min-h-full"
        style={{
          background: hasHeroArtwork 
            ? undefined 
            : `linear-gradient(to bottom, ${themeColor} 0%, transparent 400px), linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgb(18,18,18) 400px)`
        }}
      >
        {/* Hero section with video/landscape/artwork */}
        {hasHeroArtwork ? (
          <div className="relative">
            {/* Hero background */}
            <div className={`${heroHeight} w-full`}>
              <ArtistHero
                motionVideoUrl={artist.motionVideoUrl}
                landscapeUrl={artist.landscapeUrl}
                artworkUrl={hasHighResArtwork ? artist.artworkUrl : undefined}
                artworkWidth={artist.artworkWidth}
                artworkHeight={artist.artworkHeight}
                artistName={artist.name}
              />
            </div>
            {/* Gradient overlay for smooth transition */}
            <div 
              className="absolute bottom-0 left-0 right-0 h-48"
              style={{
                background: 'linear-gradient(to bottom, transparent 0%, rgba(18,18,18,0.6) 50%, rgb(18,18,18) 100%)'
              }}
            />
            {/* Artist info overlay */}
            <div className="absolute bottom-8 left-12 right-8">
              <p className="text-sm text-white/80 uppercase tracking-wider mb-2">艺术家</p>
              <h1 className="text-6xl font-bold mb-4 drop-shadow-lg">{artist.name}</h1>
              {artist.genres && artist.genres.length > 0 && (
                <p className="text-sm text-white/80">
                  {artist.genres.slice(0, 3).join(' • ')}
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Fallback: circular avatar for low-res or no artwork */
          <div className="p-8">
            <div className="flex gap-6 mb-8">
              {/* Circular artwork */}
              <div className="w-64 h-64 flex-shrink-0 rounded-full overflow-hidden shadow-xl">
                {artist.artworkUrl ? (
                  <DraggableImage
                    type="artist"
                    id={artist.id}
                    src={getProxiedImageUrl(artist.artworkUrl, 400)}
                    alt={artist.name}
                    className="w-full h-full object-cover"
                    artistData={{
                      id: artist.id,
                      name: artist.name,
                      artworkUrl: artist.artworkUrl,
                    }}
                  />
                ) : (
                  <div className="w-full h-full bg-spotify-gray flex items-center justify-center text-6xl text-white/20">
                    ♪
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex flex-col justify-center pt-32">
                <p className="text-sm text-white/60 uppercase tracking-wider mb-2">艺术家</p>
                <h1 className="text-5xl font-bold mb-4">{artist.name}</h1>
                {artist.genres && artist.genres.length > 0 && (
                  <p className="text-sm text-white/60">
                    {artist.genres.slice(0, 3).join(' • ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="px-8 pt-4">
          {/* Play button, Shuffle button and Follow button */}
          <div ref={actionBarRef} className="flex items-center gap-4 mb-6">
            <button
              onClick={handlePlayPauseClick}
              className="w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
            >
              <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24">
                {isCurrentArtistPlaying ? (
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                ) : (
                  <path d="M6 4l15 8-15 8V4z" />
                )}
              </svg>
            </button>
            <ShuffleButton
              isActive={localShuffle}
              onClick={() => setLocalShuffle(!localShuffle)}
              size="lg"
            />
            <FollowButton
              artistId={artist.id}
              artistName={artist.name}
              artworkUrl={artist.artworkUrl}
            />
          </div>

          {/* Featured Songs */}
          <section className="mb-8" data-testid="artist-overview-featured-songs">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2
                  className="cursor-pointer text-2xl font-bold hover:underline"
                  onClick={handleViewMoreAllSongs}
                >
                  {featuredSectionTitle}
                </h2>
              </div>
              {hasMoreFeaturedSongs && (
                <button
                  onClick={handleViewMoreAllSongs}
                  className="flex items-center gap-1 text-sm font-medium text-white/60 transition-colors hover:text-white"
                >
                  <span>查看全部</span>
                  <FiChevronRight size={16} />
                </button>
              )}
            </div>
            {previewFeaturedSongs.length > 0 ? (
              <div className="space-y-1">
                {previewFeaturedSongs.map((song, index) => (
                  <SongCard
                    key={song.id}
                    song={enrichArtistSong(song)}
                    onPlay={() => handlePlaySong(song, featuredSongs, 'featured')}
                    showIndex={index + 1}
                    showAlbum
                    isSelected={selectedSongId === song.id}
                    onSelect={setSelectedSongId}
                    pageContext="artist"
                    isCurrentSource={isCurrentArtistFeaturedSource}
                  />
                ))}
              </div>
            ) : (
              <p className="text-white/60">暂无可展示歌曲</p>
            )}
          </section>
          {/* Albums */}
          {artistAlbums.length > 0 && (
            <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
              <div className="flex items-center justify-between mb-4" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                <h2 className="text-2xl font-bold">
                  <span 
                    className="cursor-pointer hover:underline"
                    onClick={handleViewMoreAlbums}
                  >
                    专辑
                  </span>
                  <span className="text-base font-normal text-white/60 ml-2">
                    ({artistAlbums.length})
                  </span>
                </h2>
                <button
                  onClick={handleViewMoreAlbums}
                  className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                >
                  <span>查看全部</span>
                  <FiChevronRight size={16} />
                </button>
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {artistAlbums.slice(0, 10).map((album) => (
                  <AlbumCard 
                    key={album.id}
                    album={album} 
                    pageContext="artist" 
                    isPlaying={isAlbumPlaying(album.id)}
                    onPlay={() => handlePlayAlbum(album)}
                    onPause={pause}
                    onCardClick={handleAlbumClick}
                  />
                ))}
              </ScrollableCardRow>
            </section>
          )}

          {/* Singles & EPs */}
          {artist.singlesAndEPs && artist.singlesAndEPs.length > 0 && (
            <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
              <div className="flex items-center justify-between mb-4" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                <h2 className="text-2xl font-bold">
                  <span 
                    className="cursor-pointer hover:underline"
                    onClick={handleViewMoreSingles}
                  >
                    单曲 & EP
                  </span>
                  <span className="text-base font-normal text-white/60 ml-2">
                    ({artist.singlesAndEPs.length})
                  </span>
                </h2>
                <button
                  onClick={handleViewMoreSingles}
                  className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                >
                  <span>查看全部</span>
                  <FiChevronRight size={16} />
                </button>
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {artist.singlesAndEPs.slice(0, 10).map((album) => (
                  <AlbumCard 
                    key={album.id}
                    album={album} 
                    pageContext="artist" 
                    isPlaying={isAlbumPlaying(album.id)}
                    onPlay={() => handlePlayAlbum(album)}
                    onPause={pause}
                    onCardClick={handleAlbumClick}
                  />
                ))}
              </ScrollableCardRow>
            </section>
          )}

          {/* Live Albums */}
          {artist.liveAlbums && artist.liveAlbums.length > 0 && (
            <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
              <div className="flex items-center justify-between mb-4" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                <h2 className="text-2xl font-bold">
                  <span 
                    className="cursor-pointer hover:underline"
                    onClick={handleViewMoreLive}
                  >
                    现场专辑
                  </span>
                  <span className="text-base font-normal text-white/60 ml-2">
                    ({artist.liveAlbums.length})
                  </span>
                </h2>
                <button
                  onClick={handleViewMoreLive}
                  className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                >
                  <span>查看全部</span>
                  <FiChevronRight size={16} />
                </button>
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {artist.liveAlbums.slice(0, 10).map((album) => (
                  <AlbumCard 
                    key={album.id}
                    album={album} 
                    pageContext="artist" 
                    isPlaying={isAlbumPlaying(album.id)}
                    onPlay={() => handlePlayAlbum(album)}
                    onPause={pause}
                    onCardClick={handleAlbumClick}
                  />
                ))}
              </ScrollableCardRow>
            </section>
          )}

          {/* Compilation Albums */}
          {artist.compilationAlbums && artist.compilationAlbums.length > 0 && (
            <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
              <div className="flex items-center justify-between mb-4" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                <h2 className="text-2xl font-bold">
                  <span 
                    className="cursor-pointer hover:underline"
                    onClick={handleViewMoreCompilations}
                  >
                    合辑
                  </span>
                  <span className="text-base font-normal text-white/60 ml-2">
                    ({artist.compilationAlbums.length})
                  </span>
                </h2>
                <button
                  onClick={handleViewMoreCompilations}
                  className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                >
                  <span>查看全部</span>
                  <FiChevronRight size={16} />
                </button>
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {artist.compilationAlbums.slice(0, 10).map((album) => (
                  <AlbumCard 
                    key={album.id}
                    album={album} 
                    pageContext="artist" 
                    isPlaying={isAlbumPlaying(album.id)}
                    onPlay={() => handlePlayAlbum(album)}
                    onPause={pause}
                    onCardClick={handleAlbumClick}
                  />
                ))}
              </ScrollableCardRow>
            </section>
          )}

          {/* Appears On Albums */}
          {artist.appearsOnAlbums && artist.appearsOnAlbums.length > 0 && (
            <section className="mb-8" style={{ marginLeft: '-32px', marginRight: '-32px' }}>
              <div className="flex items-center justify-between mb-4" style={{ paddingLeft: '32px', paddingRight: '32px' }}>
                <h2 className="text-2xl font-bold">
                  <span 
                    className="cursor-pointer hover:underline"
                    onClick={handleViewMoreAppearsOn}
                  >
                    参与作品
                  </span>
                  <span className="text-base font-normal text-white/60 ml-2">
                    ({artist.appearsOnAlbums.length})
                  </span>
                </h2>
                <button
                  onClick={handleViewMoreAppearsOn}
                  className="flex items-center gap-1 text-sm font-medium text-white/60 hover:text-white transition-colors"
                >
                  <span>查看全部</span>
                  <FiChevronRight size={16} />
                </button>
              </div>
              <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
                {artist.appearsOnAlbums.slice(0, 10).map((album) => (
                  <AlbumCard 
                    key={album.id}
                    album={album} 
                    pageContext="artist" 
                    isPlaying={isAlbumPlaying(album.id)}
                    onPlay={() => handlePlayAlbum(album)}
                    onPause={pause}
                    onCardClick={handleAlbumClick}
                  />
                ))}
              </ScrollableCardRow>
            </section>
          )}

          {/* No albums at all */}
          {!hasAnyAlbumContent && (
            <section>
              <h2 className="text-2xl font-bold mb-4">专辑</h2>
              <p className="text-white/60">暂无专辑</p>
            </section>
          )}
        </div>
        {/* Close the wrapper div for dynamic artwork mode */}
      </div>
    </StickyHeader>
  );
}
