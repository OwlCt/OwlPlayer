import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiPlay,
  FiPause,
  FiSkipBack,
  FiSkipForward,
  FiVolume2,
  FiVolumeX,
  FiVolume1,
  FiLayout,
  FiList,
  FiShuffle,
  FiRepeat,
  FiChevronUp,
} from "react-icons/fi";
import { usePlayerStore, PlayMode } from "../store/playerStore";
import { clsx } from "clsx";
import { getPlatformInfo } from "../utils/audioSession";

const FullscreenExpandIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M0.25 3C0.25 2.0335 1.0335 1.25 2 1.25H5.375V2.75H2C1.86193 2.75 1.75 2.86193 1.75 3V5.42857H0.25V3ZM14 2.75H10.625V1.25H14C14.9665 1.25 15.75 2.0335 15.75 3V5.42857H14.25V3C14.25 2.86193 14.1381 2.75 14 2.75ZM1.75 10.5714V13C1.75 13.1381 1.86193 13.25 2 13.25H5.375V14.75H2C1.0335 14.75 0.25 13.9665 0.25 13V10.5714H1.75ZM14.25 13V10.5714H15.75V13C15.75 13.9665 14.9665 14.75 14 14.75H10.625V13.25H14C14.1381 13.25 14.25 13.1381 14.25 13Z"
      fill="currentColor"
    />
  </svg>
);

const FullscreenCollapseIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.12 1.25V3.67857C12.12 3.81664 12.2319 3.92857 12.37 3.92857H15.75V5.42857H12.37C11.4035 5.42857 10.62 4.64507 10.62 3.67857V1.25H12.12ZM3.87998 3.67895V1.279H5.37998V3.67895C5.37998 4.64545 4.59648 5.42895 3.62998 5.42895H0.26998V3.92895H3.62998C3.76805 3.92895 3.87998 3.81702 3.87998 3.67895ZM10.62 12.2785C10.62 11.3116 11.4039 10.529 12.37 10.529H15.75V12.029H12.37C12.2315 12.029 12.12 12.1409 12.12 12.2785V14.739H10.62V12.2785ZM3.63091 12.0603H0.25V10.5603H3.63091C4.5983 10.5603 5.38 11.3447 5.38 12.3103V14.7389H3.88V12.3103C3.88 12.1714 3.76809 12.0603 3.63091 12.0603Z"
      fill="currentColor"
    />
  </svg>
);
import { getProxiedImageUrl } from "../utils/image";
import ClickableLink, { getArtistHref } from "./ClickableLink";
import { LikeButton } from "./LikeButton";
import CachedImage from "./CachedImage";
import { useResolvedCurrentSong } from "../hooks/useResolvedCurrentSong";
import {
  ContextMenu,
  MenuDivider,
  type MenuAnchorRect,
} from "./ContextMenu";
import {
  formatAudioBitDepth,
  formatAudioCodecLabel,
  formatAudioSampleRate,
} from "../utils/audioInfo";
import {
  DESKTOP_TRANSCODE_OPTIONS,
  getDesktopTranscodeOption,
  getPlaybackOutputMetaFromState,
  getPlaybackOutputShortLabel,
  resolvePlaybackActualOutputState,
} from "../utils/playbackQuality";
import { getManagedAudioSourceUrl } from "../utils/audioElementSource";

const MicGlyph = ({ size = 18 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <defs>
      <mask id="mic-body-mask">
        <rect width="24" height="24" fill="white" />
        <rect x="9" y="10.6" width="6" height="12" rx="3" fill="black" />
      </mask>
    </defs>
    <g transform="rotate(45 12 12)">
      <circle cx="12" cy="7" r="6" mask="url(#mic-body-mask)" />
      <rect x="9" y="10.6" width="6" height="12" rx="3" />
    </g>
  </svg>
);

export default function PlayerBar() {
  const {
    currentSong,
    isPlaying,
    volume,
    progress,
    duration,
    togglePlay,
    setVolume,
    seek,
    next,
    previous,
    toggleNowPlaying,
    showNowPlaying,
    nowPlayingSection,
    openNowPlayingSection,
    playMode,
    isShuffled,
    togglePlayMode,
    toggleShuffle,
    lyricsVisible,
    toggleLyricsVisibility,
    toggleFullscreenView,
    showFullscreenView,
    fullscreenLyricsMode,
    setFullscreenLyricsMode,
    desktopTranscodeQuality,
    setDesktopTranscodeQuality,
    audioRef,
    iosHlsQuality,
  } = usePlayerStore();

  const [prevVolume, setPrevVolume] = useState(70);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [qualityMenuAnchorRect, setQualityMenuAnchorRect] =
    useState<MenuAnchorRect | null>(null);
  const qualityButtonRef = useRef<HTMLButtonElement>(null);
  const platformInfo = getPlatformInfo();
  const resolvedCurrentSong = useResolvedCurrentSong(currentSong);
  const displaySong = resolvedCurrentSong?.song ?? currentSong;
  const displayArtworkUrl =
    resolvedCurrentSong?.artworkUrl ?? currentSong?.artworkUrl ?? "";
  const currentAudioInfo = resolvedCurrentSong?.songDetail?.audioInfo;
  const selectedDesktopTranscodeOption = getDesktopTranscodeOption(
    desktopTranscodeQuality,
  );
  const desktopQualityLabel = useMemo(
    () =>
      formatAudioCodecLabel(
        currentAudioInfo?.codec,
        currentAudioInfo?.container,
      ),
    [currentAudioInfo],
  );
  const desktopQualityDetails = useMemo(
    () =>
      [
        formatAudioBitDepth(currentAudioInfo?.bitDepth),
        formatAudioSampleRate(currentAudioInfo?.sampleRate),
      ]
        .filter(Boolean)
        .join(" · "),
    [currentAudioInfo?.bitDepth, currentAudioInfo?.sampleRate],
  );
  const playbackSourceUrl =
    (audioRef &&
      (getManagedAudioSourceUrl(audioRef) ||
        audioRef.currentSrc ||
        audioRef.src)) ||
    null;
  const desktopOutputState = useMemo(
    () =>
      resolvePlaybackActualOutputState({
        sourceUrl: playbackSourceUrl,
        platform: platformInfo.platform,
        desktopTranscodeQuality,
        iosHlsQuality,
        audioInfo: currentAudioInfo,
      }),
    [
      currentAudioInfo,
      desktopTranscodeQuality,
      iosHlsQuality,
      playbackSourceUrl,
      platformInfo.platform,
    ],
  );
  const desktopOutputMeta = useMemo(
    () => getPlaybackOutputMetaFromState(desktopOutputState),
    [desktopOutputState],
  );
  const desktopOutputDetails = useMemo(() => {
    if (desktopOutputState.isLossless) {
      return (
        [
          formatAudioBitDepth(currentAudioInfo?.bitDepth),
          formatAudioSampleRate(currentAudioInfo?.sampleRate),
        ]
          .filter(Boolean)
          .join(" · ") || null
      );
    }

    if (
      desktopOutputMeta.bitrateLabel &&
      !desktopOutputMeta.label?.includes(desktopOutputMeta.bitrateLabel)
    ) {
      return desktopOutputMeta.bitrateLabel;
    }

    return null;
  }, [
    currentAudioInfo?.bitDepth,
    currentAudioInfo?.sampleRate,
    desktopOutputMeta.bitrateLabel,
    desktopOutputMeta.label,
    desktopOutputState.isLossless,
  ]);
  const qualityIndicatorTone =
    desktopOutputState.isLossless === null
      ? "neutral"
      : desktopOutputState.isLossless
        ? "lossless"
        : "lossy";
  const showDesktopQualityControl =
    platformInfo.platform === "desktop" && Boolean(currentSong);

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0) setPrevVolume(newVolume);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume);
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <FiVolumeX size={18} />;
    if (volume < 50) return <FiVolume1 size={18} />;
    return <FiVolume2 size={18} />;
  };

  // Get play mode icon and title based on current mode
  const getPlayModeInfo = (
    mode: PlayMode,
  ): { icon: React.ReactNode; title: string } => {
    switch (mode) {
      case "sequential":
        return { icon: <FiRepeat size={18} />, title: "顺序播放" };
      case "loop":
        return {
          icon: <FiRepeat size={18} className="text-green-500" />,
          title: "循环播放",
        };
      case "single":
        return {
          icon: (
            <span className="relative">
              <FiRepeat size={18} className="text-green-500" />
              <span className="absolute -top-0.5 -right-1 text-[10px] font-bold text-green-500">
                1
              </span>
            </span>
          ),
          title: "单曲循环",
        };
    }
  };

  const playModeInfo = getPlayModeInfo(playMode);

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const volumePercent = volume;

  const updateQualityMenuAnchor = useCallback(() => {
    if (!qualityButtonRef.current) {
      return false;
    }

    const rect = qualityButtonRef.current.getBoundingClientRect();
    setQualityMenuAnchorRect({
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
    return true;
  }, []);

  useEffect(() => {
    if (!qualityMenuOpen) {
      return;
    }

    updateQualityMenuAnchor();
    window.addEventListener("resize", updateQualityMenuAnchor);

    return () => {
      window.removeEventListener("resize", updateQualityMenuAnchor);
    };
  }, [qualityMenuOpen, updateQualityMenuAnchor]);

  const toggleQualityMenu = () => {
    if (qualityMenuOpen) {
      setQualityMenuOpen(false);
      return;
    }

    if (updateQualityMenuAnchor()) {
      setQualityMenuOpen(true);
      return;
    }

    setQualityMenuOpen((open) => !open);
  };

  return (
    <div className="h-[78px] bg-black px-4 flex items-center gap-4 z-50 relative overflow-visible">
      {/* Left: Current song info */}
      <div className="flex items-center gap-4 min-w-0 w-[30%] max-w-[300px] flex-shrink-0">
        {currentSong ? (
          <>
            <div
              className="w-14 h-14 bg-white/10 rounded overflow-hidden flex-shrink-0 cursor-pointer relative group/album"
              onClick={toggleNowPlaying}
            >
              {displayArtworkUrl ? (
                <CachedImage
                  src={getProxiedImageUrl(displayArtworkUrl, 112)}
                  alt={displaySong?.name}
                  className="w-full h-full object-cover"
                  songId={currentSong.id}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40">
                  ♪
                </div>
              )}
              {/* Arrow overlay */}
              <div className="absolute top-0 right-0 p-0.5 opacity-0 group-hover/album:opacity-100 transition-opacity duration-200">
                <div className="w-5 h-5 rounded-full bg-black/60 flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-black/80">
                  <FiChevronUp
                    size={12}
                    className={clsx(
                      "text-white/80 transition-transform duration-200",
                      showNowPlaying && "rotate-180",
                    )}
                  />
                </div>
              </div>
            </div>
            <div className="min-w-0 flex items-center gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-medium truncate text-white hover:underline cursor-pointer">
                  {displaySong?.name}
                </h4>
                <p className="text-xs text-white/60 truncate">
                  <ClickableLink
                    text={displaySong?.artistName || ""}
                    href={getArtistHref(displaySong?.artistId)}
                    className="text-white/60 hover:underline"
                  />
                </p>
              </div>
              {displaySong && (
                <LikeButton
                  song={displaySong}
                  size="base"
                  showOnHover={false}
                  enableTooltip={false}
                />
              )}
            </div>
          </>
        ) : (
          <div className="text-white/40 text-sm">暂无播放</div>
        )}
      </div>

      {/* Center: Playback controls */}
      <div className="flex-1 min-w-0 flex flex-col items-center gap-2 px-2">
        {/* Control buttons */}
        {/* Layout: [Shuffle] [Previous] [Play/Pause] [Next] [PlayMode] */}
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Shuffle button - left of previous */}
          <button
            onClick={toggleShuffle}
            className={clsx(
              "relative transition-colors p-1",
              isShuffled ? "text-green-500" : "text-white/60 hover:text-white",
            )}
            title={isShuffled ? "关闭随机播放" : "开启随机播放"}
            data-testid="shuffle-button"
          >
            <FiShuffle size={18} />
            {/* Active indicator dot */}
            {isShuffled && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-green-500 rounded-full" />
            )}
          </button>

          <button
            onClick={previous}
            className="text-white/60 hover:text-white transition-colors disabled:opacity-30"
            disabled={!currentSong}
            data-testid="previous-button"
          >
            <FiSkipBack size={20} />
          </button>

          <button
            onClick={togglePlay}
            className="w-8 h-8 bg-white rounded-full flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
            disabled={!currentSong}
            data-testid="play-pause-button"
          >
            {isPlaying ? (
              <FiPause className="text-black" size={16} />
            ) : (
              <FiPlay className="text-black ml-0.5" size={16} />
            )}
          </button>

          <button
            onClick={next}
            className="text-white/60 hover:text-white transition-colors disabled:opacity-30"
            disabled={!currentSong}
            data-testid="next-button"
          >
            <FiSkipForward size={20} />
          </button>

          {/* Play mode button - right of next */}
          <button
            onClick={togglePlayMode}
            className="transition-colors p-1 text-white/60 hover:text-white"
            title={playModeInfo.title}
            data-testid="playmode-button"
          >
            {playModeInfo.icon}
          </button>
        </div>

        {/* Progress bar - Always show time */}
        <div className="w-full max-w-[600px] flex items-center gap-2">
          <span className="text-xs text-white/60 w-10 text-right font-mono flex-shrink-0">
            {formatTime(progress)}
          </span>
          {/* Outer container with padding for larger hover area */}
          <div className="flex-1 py-2 -my-2 group" style={{ minWidth: "80px" }}>
            <div className="relative h-1">
              <div className="absolute inset-0 bg-white/20 rounded-full" />
              <div
                className="absolute left-0 top-0 h-full bg-white group-hover:bg-green-500 rounded-full transition-colors"
                style={{ width: `${progressPercent}%` }}
              />
              {/* Progress thumb indicator */}
              <div
                className="absolute top-1/2 w-3 h-3 bg-white rounded-full transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progressPercent}%`, marginLeft: "-6px" }}
              />
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={progress}
                onChange={handleProgressChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ margin: "-8px 0", height: "calc(100% + 16px)" }}
                disabled={!currentSong}
              />
            </div>
          </div>
          <span className="text-xs text-white/60 w-10 font-mono flex-shrink-0">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Right: Volume and extras */}
      <div className="flex items-center justify-end gap-1 w-[30%] min-w-[180px] max-w-[300px] flex-shrink-0">
        {showDesktopQualityControl && (
          <div className="flex-shrink-0">
            <button
              ref={qualityButtonRef}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                toggleQualityMenu();
              }}
              className={clsx(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all",
                qualityMenuOpen
                  ? qualityIndicatorTone === "lossy"
                    ? "border-amber-400/30 bg-amber-500/12 text-amber-200 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]"
                    : "border-emerald-400/30 bg-emerald-500/12 text-emerald-300 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                  : "border-white/10 bg-white/[0.06] text-white/68 hover:border-white/15 hover:bg-white/[0.09] hover:text-white",
              )}
              title="音质"
            >
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  qualityIndicatorTone === "lossless" &&
                    "bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.5)]",
                  qualityIndicatorTone === "lossy" &&
                    "bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.45)]",
                  qualityIndicatorTone === "neutral" && "bg-white/30",
                )}
              />
              {getPlaybackOutputShortLabel(desktopOutputState) ??
                selectedDesktopTranscodeOption.shortLabel}
            </button>
          </div>
        )}

        {/* Lyrics Button */}
        <button
          onClick={() => {
            if (showFullscreenView) {
              // In fullscreen mode, toggle lyrics view
              setFullscreenLyricsMode(!fullscreenLyricsMode);
            } else {
              toggleLyricsVisibility();
            }
          }}
          className={clsx(
            "transition-colors p-1.5 rounded-full flex-shrink-0",
            !currentSong && "opacity-30 cursor-not-allowed",
            currentSong &&
              (showFullscreenView ? fullscreenLyricsMode : lyricsVisible)
              ? "text-green-500"
              : "text-white/60 hover:text-white",
          )}
          disabled={!currentSong}
          title="歌词"
        >
          <MicGlyph size={18} />
        </button>

        {/* Queue Button */}
        <button
          onClick={() => openNowPlayingSection("queue")}
          className={clsx(
            "transition-colors p-1.5 rounded-full flex-shrink-0",
            !currentSong && "opacity-30 cursor-not-allowed",
            currentSong && showNowPlaying && nowPlayingSection === "queue"
              ? "text-green-500"
              : "text-white/60 hover:text-white",
          )}
          disabled={!currentSong}
          title="队列"
        >
          <FiList size={18} />
        </button>

        {/* Now Playing View Toggle */}
        <button
          onClick={toggleNowPlaying}
          className={clsx(
            "transition-colors p-1.5 rounded-full flex-shrink-0",
            showNowPlaying
              ? "text-green-500"
              : "text-white/60 hover:text-white",
          )}
          title="正在播放"
        >
          <FiLayout size={18} style={{ transform: "scaleX(-1)" }} />
        </button>

        {/* Volume control - Always show volume */}
        <div className="flex items-center gap-1 group flex-shrink-0">
          <button
            onClick={toggleMute}
            className="text-white/60 hover:text-white transition-colors flex-shrink-0 p-1"
          >
            {getVolumeIcon()}
          </button>
          {/* Outer container with padding for larger hover area */}
          <div
            className="py-2 -my-2 flex-shrink-0 hidden sm:block"
            style={{ minWidth: "50px", width: "80px" }}
          >
            <div className="relative h-1">
              <div className="absolute inset-0 bg-white/20 rounded-full" />
              <div
                className="absolute left-0 top-0 h-full bg-white group-hover:bg-green-500 rounded-full transition-colors"
                style={{ width: `${volumePercent}%` }}
              />
              {/* Volume thumb indicator */}
              <div
                className="absolute top-1/2 w-3 h-3 bg-white rounded-full transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${volumePercent}%`, marginLeft: "-6px" }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={handleVolumeChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ margin: "-8px 0", height: "calc(100% + 16px)" }}
              />
            </div>
          </div>
        </div>

        {/* Fullscreen Button — also toggles browser fullscreen */}
        <button
          onClick={() => {
            toggleFullscreenView();
            // Enter browser fullscreen when opening, exit when closing
            if (!showFullscreenView) {
              document.documentElement.requestFullscreen?.().catch(() => {});
            } else {
              if (document.fullscreenElement)
                document.exitFullscreen?.().catch(() => {});
            }
          }}
          className={`transition-colors p-1.5 rounded-full flex-shrink-0 ${
            showFullscreenView
              ? "text-green-500"
              : "text-white/60 hover:text-white"
          }`}
          disabled={!currentSong}
          title="全屏播放"
        >
          {showFullscreenView ? (
            <FullscreenCollapseIcon size={16} />
          ) : (
            <FullscreenExpandIcon size={16} />
          )}
        </button>
      </div>
      <ContextMenu
        isOpen={qualityMenuOpen}
        position={{
          x: qualityMenuAnchorRect?.left ?? 0,
          y: qualityMenuAnchorRect?.top ?? 0,
        }}
        anchorRect={qualityMenuAnchorRect ?? undefined}
        placement="top-end"
        offset={14}
        onClose={() => setQualityMenuOpen(false)}
        closeOnScroll={false}
        className="playerbar-quality-menu-enter origin-bottom-right w-[216px] max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl border-white/10 bg-[#282828]/96 shadow-[0_18px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      >
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
            音质
          </div>
          <div className="mt-2 rounded-md bg-white/[0.04] px-2.5 py-2">
            <div className="grid grid-cols-[48px,max-content,minmax(0,1fr)] items-baseline gap-x-2 gap-y-1">
              <div className="contents">
                <span className="text-[11px] text-white/45">当前输出</span>
                <span className="truncate text-[11px] text-white/80">
                  {desktopOutputMeta.label ||
                    (desktopOutputState.requestedQuality === "lossless"
                      ? "待确认"
                      : "等待检测")}
                </span>
                <span className="truncate text-[10px] leading-4 text-white/40">
                  {desktopOutputDetails || ""}
                </span>
              </div>
              <div className="contents">
                <span className="text-[11px] text-white/45">原始文件</span>
                <span className="truncate text-[11px] text-white/70">
                  {desktopQualityLabel || "未检测到"}
                </span>
                <span className="truncate text-[10px] leading-4 text-white/40">
                  {desktopQualityDetails || ""}
                </span>
              </div>
            </div>
          </div>
        </div>
        <MenuDivider />
        {DESKTOP_TRANSCODE_OPTIONS.map((option) => {
          const active = option.value === desktopTranscodeQuality;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                void setDesktopTranscodeQuality(option.value);
                setQualityMenuOpen(false);
              }}
              className={clsx(
                "block w-full px-3 py-2 text-left transition-colors",
                active
                  ? "bg-white/10 text-emerald-300"
                  : "text-white hover:bg-white/10",
              )}
            >
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span>{option.label}</span>
                {active && (
                  <span className="text-[10px] text-emerald-300/80">当前</span>
                )}
              </div>
              {option.description && (
                <div
                  className={clsx(
                    "mt-1 text-[11px] leading-4",
                    active ? "text-emerald-300/65" : "text-white/40",
                  )}
                >
                  {option.description}
                </div>
              )}
            </button>
          );
        })}
      </ContextMenu>
    </div>
  );
}
