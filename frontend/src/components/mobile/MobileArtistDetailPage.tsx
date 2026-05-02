import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlay, FiPause, FiMoreHorizontal } from 'react-icons/fi';
import { getAlbumDetail } from '../../api';
import { ArtistDetail, Song, Album } from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { useRecentlyPlayedStore } from '../../store/recentlyPlayedStore';
import AlbumCard from '../AlbumCard';
import ScrollableCardRow from '../ScrollableCardRow';
import { FollowButton } from '../FollowButton';
import { ShuffleButton } from '../ShuffleButton';
import { ArtistHero } from '../ArtistHero';
import MobileHeader from './MobileHeader';
import MobileArtistMenu from './MobileArtistMenu';
import MobileSongMenu from './MobileSongMenu';
import { MobileTrackRow } from './MobileDetailPage';
import { useGoBack } from '../../hooks/useNavigationHistory';
import {
  ARTIST_OVERVIEW_FEATURED_LIMIT,
  buildArtistQueueSource,
  enrichSongForArtistNavigation,
  getFeaturedSongsHeading,
  getFeaturedSongs,
  getLibrarySongs,
  isArtistQueueSource,
  mergeArtistAlbumGroups,
  sortAlbumsByReleaseDateDesc,
} from '../../utils/artistPage';

interface MobileArtistDetailPageProps {
  artist: ArtistDetail;
  themeColor: string;
  artistId: string;
}

export default function MobileArtistDetailPage({
  artist,
  themeColor,
  artistId,
}: MobileArtistDetailPageProps) {
  const navigate = useNavigate();
  const { setQueue, toggleShuffle, isShuffled, queueSource, isPlaying, pause, play, currentSong } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  // Local state
  const [localShuffle, setLocalShuffle] = useState(false);
  const [headerOpacity, setHeaderOpacity] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [artistMenuOpen, setArtistMenuOpen] = useState(false);
  const [showExpandedFeaturedSongs, setShowExpandedFeaturedSongs] = useState(false);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Overscroll zoom state for pull-down effect
  const [overscrollScale, setOverscrollScale] = useState(1);
  const [overscrollTranslateY, setOverscrollTranslateY] = useState(0);

  const featuredSongs = getFeaturedSongs(artist);
  const librarySongs = getLibrarySongs(artist);
  const featuredSectionTitle = getFeaturedSongsHeading(artist.featuredSongsSource);
  const expandedFeaturedLimit = Math.min(10, featuredSongs.length);
  const previewFeaturedSongs = featuredSongs.slice(
    0,
    showExpandedFeaturedSongs ? expandedFeaturedLimit : ARTIST_OVERVIEW_FEATURED_LIMIT
  );
  const canExpandFeaturedSongs = featuredSongs.length > ARTIST_OVERVIEW_FEATURED_LIMIT;
  const isCurrentArtistLibrarySource = isArtistQueueSource(queueSource, artistId, 'library');
  const isCurrentArtistFeaturedSource = isArtistQueueSource(queueSource, artistId, 'featured');
  const isCurrentArtistPlaying = isPlaying && isCurrentArtistLibrarySource;

  // Sync localShuffle from playerStore when queueSource matches current artist
  useEffect(() => {
    if (artistId && isArtistQueueSource(queueSource, artistId, 'library')) {
      setLocalShuffle(isShuffled);
    }
  }, [artistId, queueSource, isShuffled]);

  useEffect(() => {
    setShowExpandedFeaturedSongs(false);
  }, [artistId]);

  // Scroll handling for header opacity
  useEffect(() => {
    let scrollableParent: HTMLElement | null = null;

    const checkPositions = () => {
      const hero = heroRef.current;
      if (!hero) return;

      const heroRect = hero.getBoundingClientRect();
      const scrollAmount = -heroRect.top;
      const heroHeight = heroRect.height;

      // Header opacity based on scroll progress through hero
      // Only become fully opaque when hero is completely covered (scrollAmount >= heroHeight - header height)
      const headerHeight = 56; // h-14 = 56px
      let newOpacity = 0;
      if (scrollAmount > 0) {
        newOpacity = Math.min(1, scrollAmount / (heroHeight - headerHeight));
      }
      setHeaderOpacity(newOpacity);
    };

    const handleScroll = () => {
      requestAnimationFrame(checkPositions);
    };

    const findScrollableParentElement = (): HTMLElement | null => {
      let element: HTMLElement | null = scrollContainerRef.current;
      while (element) {
        const parent = element.parentElement;
        if (parent) {
          const style = getComputedStyle(parent);
          if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            return parent;
          }
        }
        element = parent;
      }
      return null;
    };

    scrollableParent = findScrollableParentElement();

    if (scrollableParent) {
      scrollableParent.addEventListener('scroll', handleScroll, { passive: true });
    }

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    checkPositions();

    return () => {
      if (scrollableParent) {
        scrollableParent.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, []);

  // Check if a specific album is currently playing
  const isAlbumPlaying = (albumId: string) => {
    return isPlaying && queueSource.type === 'album' && queueSource.id === albumId;
  };

  // Check if a specific album is the current queue source
  const isAlbumCurrentSource = (albumId: string) => {
    return queueSource.type === 'album' && queueSource.id === albumId;
  };

  const handlePlayAlbum = async (album: Album) => {
    recordPlay('album', album.id);
    if (isAlbumCurrentSource(album.id)) {
      play();
      return;
    }

    try {
      const albumDetail = await getAlbumDetail(album.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        setQueue(albumDetail.tracks, 0, { type: 'album', id: album.id, name: albumDetail.name });
      }
    } catch (err) {
      console.error('Failed to load album tracks:', err);
    }
  };

  const handleAlbumClick = (album: Album) => {
    navigate(`/album/${album.id}`);
  };

  const handlePlayAll = () => {
    if (librarySongs.length > 0) {
      recordPlay('artist', artist.id);
      setQueue(librarySongs, 0, buildArtistQueueSource(artist.id, artist.name, 'library'));
      if (localShuffle !== isShuffled) {
        toggleShuffle();
      }
    }
  };

  const handlePlayPauseClick = () => {
    if (isCurrentArtistPlaying) {
      pause();
    } else if (isCurrentArtistLibrarySource) {
      play();
    } else {
      handlePlayAll();
    }
  };

  const handleMobileTrackTap = useCallback((index: number) => {
    if (featuredSongs.length === 0) return;
    recordPlay('artist', artist.id);
    setQueue(featuredSongs, index, buildArtistQueueSource(artist.id, artist.name, 'featured'));
  }, [artist, featuredSongs, recordPlay, setQueue]);

  const goBack = useGoBack();
  const handleBack = () => {
    goBack();
  };

  const handleViewMoreDiscography = () => navigate(`/artist/${artistId}/discography`);

  const featuredExpandButtonLabel = showExpandedFeaturedSongs
    ? '收起推荐歌曲'
    : `展开查看 ${expandedFeaturedLimit} 首`;

  const overviewAlbums = useMemo(
    () =>
      sortAlbumsByReleaseDateDesc(
        mergeArtistAlbumGroups(
          artist.essentialAlbums,
          artist.albums,
        )
      ).slice(0, 10),
    [artist.albums, artist.essentialAlbums]
  );
  const allKnownAlbums = useMemo(
    () =>
      mergeArtistAlbumGroups(
        artist.essentialAlbums,
        artist.albums,
        artist.singlesAndEPs,
        artist.liveAlbums,
        artist.compilationAlbums,
        artist.appearsOnAlbums
      ),
    [
      artist.albums,
      artist.appearsOnAlbums,
      artist.compilationAlbums,
      artist.essentialAlbums,
      artist.liveAlbums,
      artist.singlesAndEPs,
    ]
  );

  const handleMobileLongPress = useCallback((song: Song) => {
    setMenuSong(enrichSongForArtistNavigation(song, {
      artistId: artist.id,
      artistName: artist.name,
      albums: allKnownAlbums,
    }));
    setMenuOpen(true);
  }, [allKnownAlbums, artist.id, artist.name]);

  const hasAlbums = overviewAlbums.length > 0;


  return (
    <div ref={scrollContainerRef} className="min-h-full bg-black relative">
      {/* Global header with transparent to opaque transition */}
      <MobileHeader
        title={artist.name}
        opacity={headerOpacity}
        backgroundColor={themeColor}
        onBack={handleBack}
      />

      {/* Content */}
      <div>
        {/* Hero section - full width artwork display */}
        <div ref={heroRef} className="relative" data-testid="mobile-artist-hero">
          {/* Hero background */}
          <div className="h-[400px] w-full">
            {artist.artworkUrl || artist.motionVideoUrl || artist.landscapeUrl ? (
              <ArtistHero
                motionVideoUrl={artist.motionVideoUrl}
                landscapeUrl={artist.landscapeUrl}
                artworkUrl={artist.artworkUrl}
                artworkWidth={artist.artworkWidth}
                artworkHeight={artist.artworkHeight}
                artistName={artist.name}
              />
            ) : (
              /* No artwork fallback */
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: themeColor }}
              >
                <span className="text-8xl text-white/20">♪</span>
              </div>
            )}
          </div>
          {/* Gradient overlay for smooth transition */}
          <div
            className="absolute bottom-0 left-0 right-0 h-32"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.8) 70%, rgb(0,0,0) 100%)',
            }}
          />
          {/* Artist info overlay */}
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold text-white mb-1 drop-shadow-lg line-clamp-2">
              {artist.name}
            </h1>
            {artist.genres && artist.genres.length > 0 && (
              <p className="text-sm text-white/80">
                {artist.genres.slice(0, 3).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Action buttons - Spotify style layout */}
        <div className="flex items-center justify-between px-4 py-3">
          {/* Left side: action icons */}
          <div className="flex items-center gap-5">
            {/* Follow button */}
            <FollowButton
              artistId={artist.id}
              artistName={artist.name}
              artworkUrl={artist.artworkUrl}
            />

            {/* More options - opens artist menu */}
            <button
              onClick={() => setArtistMenuOpen(true)}
              className="w-10 h-10 flex items-center justify-center text-white/60"
              aria-label="更多选项"
            >
              <FiMoreHorizontal size={22} />
            </button>
          </div>

          {/* Right side: shuffle + play button */}
          <div className="flex items-center gap-4">
            {/* Shuffle button */}
            <ShuffleButton
              isActive={localShuffle}
              onClick={() => setLocalShuffle(!localShuffle)}
              size="md"
              disableHover
            />

            {/* Play button */}
            <button
              onClick={handlePlayPauseClick}
              disabled={librarySongs.length === 0}
              className="w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform disabled:opacity-50"
              aria-label={isCurrentArtistPlaying ? '暂停' : '播放'}
            >
              {isCurrentArtistPlaying ? (
                <FiPause size={24} className="text-black" />
              ) : (
                <FiPlay size={24} className="text-black ml-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Top Songs section */}
        {featuredSongs.length > 0 && (
          <div className="mb-5 px-4" data-testid="mobile-artist-overview-featured-songs">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">{featuredSectionTitle}</h2>
              </div>
              {canExpandFeaturedSongs && (
                <button
                  onClick={() => setShowExpandedFeaturedSongs((prev) => !prev)}
                  className="text-sm font-medium text-white/60"
                >
                  {featuredExpandButtonLabel}
                </button>
              )}
            </div>
            <div>
              {previewFeaturedSongs.map((song, index) => {
                return (
                  <MobileTrackRow
                    key={song.id}
                    track={song}
                    index={index}
                    isPlaying={isPlaying}
                    isCurrentTrack={currentSong?.id === song.id && isCurrentArtistFeaturedSource}
                    onTap={() => handleMobileTrackTap(index)}
                    onLongPress={() => handleMobileLongPress(song)}
                    showArtwork
                    secondaryText={`${song.artistName} · ${song.albumName}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {featuredSongs.length === 0 && (
          <div className="mb-8 py-12 text-center text-white/40">
            暂无可展示歌曲
          </div>
        )}

        {/* Albums section */}
        {hasAlbums && (
          <div className="mb-6">
            <div className="flex items-center justify-between px-4 mb-3">
              <h2 className="text-lg font-bold text-white">专辑</h2>
              <button
                onClick={handleViewMoreDiscography}
                className="text-sm font-medium text-white/60"
              >
                查看全部
              </button>
            </div>
            <ScrollableCardRow cardWidth={140} gap={12} edgePadding={16}>
              {overviewAlbums.map((album) => (
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
          </div>
        )}

        {/* Bottom padding for mini player + bottom nav */}
        <div className="h-52" />
      </div>

      {/* Song context menu */}
      <MobileSongMenu
        song={menuSong}
        isOpen={menuOpen}
        onClose={() => {
          setMenuOpen(false);
          setMenuSong(null);
        }}
      />

      {/* Artist menu */}
      <MobileArtistMenu
        artist={{
          id: artist.id,
          name: artist.name,
          artworkUrl: artist.artworkUrl,
        }}
        isOpen={artistMenuOpen}
        onClose={() => setArtistMenuOpen(false)}
      />
    </div>
  );
}

// Loading state component
export function MobileArtistDetailLoading({ onBack }: { onBack: () => void }) {
  return (
    <div className="h-full flex flex-col bg-black">
      <MobileHeader opacity={0} onBack={onBack} />
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
      </div>
    </div>
  );
}

// Error state component
export function MobileArtistDetailError({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <div className="h-full flex flex-col bg-black">
      <MobileHeader opacity={0} onBack={onBack} />
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-white/10 rounded-full text-white"
        >
          返回
        </button>
      </div>
    </div>
  );
}
