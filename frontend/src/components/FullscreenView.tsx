import { useState, useEffect, useRef, useCallback, Suspense, lazy, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../store/playerStore';
import { useFollowedArtistsStore } from '../store/followedArtistsStore';
import CachedImage from './CachedImage';
import ScrollingText from './ScrollingText';
import MotionArtwork from './MotionArtwork';
import { LikeButton } from './LikeButton';
import { getCacheFirstArtworkUrl } from '../utils/cacheFirstImage';
import { getAlbumDetail } from '../api';
import PlayerBar from './PlayerBar';
import { clsx } from 'clsx';
import type { AlbumDetail } from '../types';
import { getProxiedImageUrl } from '../utils/image';
import { resolveNowPlayingSongData } from '../utils/nowPlayingDetails';
import { useResolvedCurrentSong } from '../hooks/useResolvedCurrentSong';

const ExpandedLyricsPage = lazy(() => import('./ExpandedLyricsPage'));

// Caches
const fsAlbumDetailCache = new Map<string, AlbumDetail | null>();

export default function FullscreenView() {
  const navigate = useNavigate();
  const {
    currentSong,
    closeFullscreenView,
    fullscreenLyricsMode,
    setFullscreenLyricsMode,
  } = usePlayerStore();
  const resolvedCurrentSong = useResolvedCurrentSong(currentSong);

  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const mouseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const infoCardsRef = useRef<HTMLDivElement>(null);
  const displaySong = resolvedCurrentSong?.song ?? currentSong;
  const songDetail = resolvedCurrentSong?.songDetail ?? null;

  const resolvedNowPlaying = useMemo(() => {
    if (!currentSong) {
      return null;
    }
    return resolveNowPlayingSongData(currentSong, songDetail, albumDetail);
  }, [currentSong, songDetail, albumDetail]);

  const effectiveArtworkUrl = resolvedNowPlaying?.artworkUrl ?? displaySong?.artworkUrl ?? '';
  const effectiveArtistArtworkUrl = resolvedNowPlaying?.artistArtworkUrl ?? '';
  const effectiveMotionVideoUrl = resolvedNowPlaying?.motionVideoUrl ?? null;

  // Background image
  useEffect(() => {
    if (!currentSong || !effectiveArtworkUrl) { setBackgroundUrl(''); return; }
    (async () => {
      const fallback = getProxiedImageUrl(effectiveArtworkUrl, 800);
      setBackgroundUrl(await getCacheFirstArtworkUrl(currentSong.id, fallback));
    })();
  }, [currentSong?.id, effectiveArtworkUrl]);

  // Fetch album motion video
  useEffect(() => {
    if (!currentSong?.albumId) { setAlbumDetail(null); return; }
    if (fsAlbumDetailCache.has(currentSong.albumId)) {
      setAlbumDetail(fsAlbumDetailCache.get(currentSong.albumId) || null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await getAlbumDetail(currentSong.albumId!);
        if (!cancelled) {
          fsAlbumDetailCache.set(currentSong.albumId!, detail);
          setAlbumDetail(detail);
        }
      } catch {
        if (!cancelled) {
          fsAlbumDetailCache.set(currentSong.albumId!, null);
          setAlbumDetail(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSong?.albumId]);

  // Auto-hide controls in lyrics mode
  useEffect(() => {
    if (!fullscreenLyricsMode) { setControlsVisible(true); return; }
    const onMove = () => {
      setControlsVisible(true);
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
      mouseTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    };
    onMove();
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (mouseTimerRef.current) clearTimeout(mouseTimerRef.current);
    };
  }, [fullscreenLyricsMode]);

  // Close fullscreen view + exit browser fullscreen
  const handleClose = useCallback(() => {
    closeFullscreenView();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }, [closeFullscreenView]);

  // ESC to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // Scroll to info cards
  const scrollToInfo = useCallback(() => {
    infoCardsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Navigate — close fullscreen overlay but stay in browser fullscreen
  const navigateAway = useCallback((path: string) => {
    closeFullscreenView();
    navigate(path);
  }, [closeFullscreenView, navigate]);

  const firstArtistId = songDetail?.artists?.[0]?.id || albumDetail?.artists?.[0]?.id || displaySong?.artistId;

  if (!currentSong) return null;

  const composer = songDetail?.credits?.composer || songDetail?.composerName || '';
  const genres = songDetail?.genres?.join(', ') || '';
  const artists = songDetail?.artists?.map((a: any) => a.name).join(', ') || displaySong?.artistName || '';

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-black text-white flex flex-col select-none overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1] }}
    >
      {/* Blurred background - GPU composited for Safari/Firefox */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        animate={{ opacity: fullscreenLyricsMode ? 0.35 : 0.5 }}
        transition={{ duration: 0.6 }}
        style={{
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(80px) saturate(1.5)',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
      <div className="absolute inset-0 z-0 bg-black/50 pointer-events-none" />

      {/* Content area */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <AnimatePresence mode="wait">
          {!fullscreenLyricsMode ? (
            /* ===== Artwork + Info (scrollable) ===== */
            <motion.div
              key="artwork-view"
              className="flex-1 min-h-0 flex flex-col"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1] }}
            >
              {/* Close button */}
              <div className="flex justify-end px-6 pt-4 pb-2 flex-shrink-0">
                <button
                  onClick={handleClose}
                  className="p-2 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-all"
                  title="关闭 (Esc)"
                >
                  <FiChevronDown size={24} />
                </button>
              </div>

              {/* Scrollable content */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
              >
                {/* First screen: centered artwork + song info */}
                <div className="min-h-[calc(100vh-160px)] flex flex-col items-center justify-center px-8 py-8">
                  {/* Album artwork — larger */}
                  <motion.div
                    className="w-full max-w-[min(580px,68vh)] aspect-square rounded-xl shadow-2xl overflow-hidden mb-8"
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, ease: [0.22, 0.7, 0.36, 1], delay: 0.05 }}
                  >
                    {effectiveMotionVideoUrl ? (
                      <MotionArtwork
                        videoUrl={effectiveMotionVideoUrl}
                        fallbackImage={effectiveArtworkUrl ? getProxiedImageUrl(effectiveArtworkUrl, 600) : undefined}
                        alt={displaySong?.name}
                        songId={currentSong.id}
                        quality="high"
                      />
                    ) : effectiveArtworkUrl ? (
                      <CachedImage
                        src={getProxiedImageUrl(effectiveArtworkUrl, 600)}
                        alt={displaySong?.name}
                        className="w-full h-full object-cover"
                        songId={currentSong.id}
                      />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/40 text-7xl">
                        ♪
                      </div>
                    )}
                  </motion.div>

                  {/* Song info + actions */}
                  <motion.div
                    className="w-full max-w-[min(580px,68vh)] flex items-center gap-4"
                    initial={{ y: 16, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1], delay: 0.1 }}
                  >
                    <div className="flex-1 min-w-0">
                      <ScrollingText text={displaySong?.name || '未知歌曲'} className="text-2xl font-bold text-white" />
                      <ScrollingText
                        text={displaySong?.artistName || '未知艺术家'}
                        className="text-lg text-white/60 hover:underline cursor-pointer mt-1"
                        onClick={firstArtistId ? () => navigateAway(`/artist/${firstArtistId}`) : undefined}
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {displaySong && <LikeButton song={displaySong} size="md" showOnHover={false} />}
                    </div>
                  </motion.div>

                  {/* Scroll hint — hover effect + click to scroll */}
                  <motion.div
                    className="mt-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                  >
                    <button
                      onClick={scrollToInfo}
                      className="p-2 rounded-full text-white/20 hover:text-white/60 hover:bg-white/5 transition-all"
                      title="查看详情"
                    >
                      <FiChevronDown size={24} />
                    </button>
                  </motion.div>
                </div>

                {/* Below fold: info cards */}
                <div ref={infoCardsRef} className="px-8 pb-12 max-w-[640px] mx-auto space-y-4">
                  <ArtistInfoCards
                    song={displaySong}
                    songDetail={songDetail}
                    artistArtworkUrl={effectiveArtistArtworkUrl}
                    artists={artists}
                    composer={composer}
                    genres={genres}
                    firstArtistId={firstArtistId}
                    onNavigate={navigateAway}
                  />
                </div>
              </div>
            </motion.div>
          ) : (
            /* ===== Fullscreen Lyrics ===== */
            <motion.div
              key="lyrics-view"
              className="flex-1 min-h-0 flex flex-col"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1] }}
            >
              <div className="flex-1 min-h-0 [&>div]:rounded-none">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  </div>
                }>
                  <ExpandedLyricsPage onMinimize={() => setFullscreenLyricsMode(false)} controlsVisible={controlsVisible} />
                </Suspense>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom: PlayerBar — absolute in lyrics mode so content fills full height */}
      <motion.div
        className={clsx(
          "z-20 flex-shrink-0",
          fullscreenLyricsMode ? "absolute bottom-0 left-0 right-0" : "relative"
        )}
        animate={{
          opacity: fullscreenLyricsMode ? (controlsVisible ? 1 : 0) : 1,
          y: fullscreenLyricsMode ? (controlsVisible ? 0 : 20) : 0,
        }}
        transition={{ duration: 0.35, ease: [0.22, 0.7, 0.36, 1] }}
        style={{ pointerEvents: fullscreenLyricsMode && !controlsVisible ? 'none' : 'auto' }}
      >
        <PlayerBar />
      </motion.div>
    </motion.div>
  );
}

// ---- Info cards with navigation and follow ----
function ArtistInfoCards({ song, songDetail, artistArtworkUrl, artists, composer, genres, firstArtistId, onNavigate }: {
  song: any;
  songDetail: any;
  artistArtworkUrl: string;
  artists: string;
  composer: string;
  genres: string;
  firstArtistId: string | undefined;
  onNavigate: (path: string) => void;
}) {
  const { isFollowed, followArtist, unfollowArtist } = useFollowedArtistsStore();
  const [followLoading, setFollowLoading] = useState(false);
  const firstArtistArtwork = songDetail?.artists?.[0]?.artworkUrl;
  const artistIsFollowed = firstArtistId ? isFollowed(firstArtistId) : false;

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (followLoading || !firstArtistId) return;
    setFollowLoading(true);
    try {
      if (artistIsFollowed) {
        await unfollowArtist(firstArtistId);
      } else {
        await followArtist({ id: firstArtistId, name: song.artistName, artworkUrl: firstArtistArtwork });
      }
    } catch (err) {
      console.error('Follow/unfollow failed:', err);
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <>
      {/* Artist Card — clickable to navigate */}
      <motion.div
        className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm cursor-pointer hover:bg-white/10 transition-colors"
        onClick={() => firstArtistId && onNavigate(`/artist/${firstArtistId}`)}
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1] }}
      >
        <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4 flex items-center justify-between">
          关于艺人
          <FiChevronRight className="text-white/30" size={20} />
        </h3>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-white/10 flex-shrink-0 shadow-lg">
            {artistArtworkUrl ? (
              <CachedImage src={getProxiedImageUrl(artistArtworkUrl, 600)} alt={song.artistName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-3xl text-white/40">♪</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <ScrollingText text={song.artistName} className="font-semibold text-xl" />
            {genres && <p className="text-white/40 text-sm mt-1">{genres}</p>}
          </div>
          {/* Follow button */}
          {firstArtistId && (
            <button
              onClick={handleFollowClick}
              disabled={followLoading}
              className={clsx(
                "flex-shrink-0 px-4 py-1.5 text-sm font-medium rounded-full transition-all duration-150 border",
                artistIsFollowed
                  ? "bg-white/10 border-white/30 text-white/80 hover:bg-white/20"
                  : "bg-transparent border-white/50 text-white hover:border-white hover:scale-105"
              )}
            >
              {followLoading ? <span className="animate-pulse">...</span> : artistIsFollowed ? "关注中" : "关注"}
            </button>
          )}
        </div>
      </motion.div>

      {/* Album Info — clickable to navigate */}
      <motion.div
        className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm cursor-pointer hover:bg-white/10 transition-colors"
        onClick={() => song.albumId && onNavigate(`/album/${song.albumId}`)}
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1], delay: 0.05 }}
      >
        <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4 flex items-center justify-between">
          专辑信息
          <FiChevronRight className="text-white/30" size={20} />
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-white/40 mb-1">专辑</p>
            <p className="font-medium">{song.albumName}</p>
          </div>
          {genres && (
            <div>
              <p className="text-white/40 mb-1">流派</p>
              <p className="font-medium">{genres}</p>
            </div>
          )}
          {songDetail?.album?.releaseDate && (
            <div>
              <p className="text-white/40 mb-1">发行日期</p>
              <p className="font-medium">{songDetail.album.releaseDate}</p>
            </div>
          )}
          {songDetail?.album?.trackCount && (
            <div>
              <p className="text-white/40 mb-1">专辑曲目</p>
              <p className="font-medium">{songDetail.album.trackCount} 首</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Credits */}
      <motion.div
        className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm"
        initial={{ y: 30, opacity: 0 }}
        whileInView={{ y: 0, opacity: 1 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1], delay: 0.1 }}
      >
        <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">制作人员</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-white/40 mb-1">演唱</p>
            <p className="font-medium">{artists}</p>
          </div>
          {composer && (
            <div>
              <p className="text-white/40 mb-1">作曲</p>
              <p className="font-medium">{composer}</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Copyright */}
      {(songDetail?.credits?.recordLabel || songDetail?.credits?.copyright) && (
        <motion.div
          className="w-full bg-white/5 p-6 rounded-xl backdrop-blur-sm"
          initial={{ y: 30, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.4, ease: [0.22, 0.7, 0.36, 1], delay: 0.15 }}
        >
          <h3 className="text-lg font-semibold border-b border-white/10 pb-2 mb-4">版权信息</h3>
          <div className="space-y-3 text-sm">
            {songDetail.credits.recordLabel && (
              <div>
                <p className="text-white/40 mb-1">唱片公司</p>
                <p className="font-medium">{songDetail.credits.recordLabel}</p>
              </div>
            )}
            {songDetail.credits.copyright && (
              <div>
                <p className="text-white/40 mb-1">版权</p>
                <p className="font-medium text-white/70 text-xs">{songDetail.credits.copyright}</p>
              </div>
            )}
            {songDetail?.isrc && (
              <div>
                <p className="text-white/40 mb-1">ISRC</p>
                <p className="font-medium font-mono text-xs">{songDetail.isrc}</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </>
  );
}
