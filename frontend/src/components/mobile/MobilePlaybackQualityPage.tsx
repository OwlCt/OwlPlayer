import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBottomPadding } from "../../hooks/useBottomPadding";
import { usePlayerStore } from "../../store/playerStore";
import { getPlatformInfo } from "../../utils/audioSession";
import {
  getMobilePlaybackQuality,
  loadDownloadAudioQuality,
  MOBILE_PLAYBACK_QUALITY_OPTIONS,
  mapMobilePlaybackQualityToDesktopTranscodeQuality,
  saveDownloadAudioQuality,
  type MobilePlaybackQuality,
} from "../../utils/playbackQuality";
import MobileHeader from "./MobileHeader";

export default function MobilePlaybackQualityPage() {
  const navigate = useNavigate();
  const { paddingClass: bottomPaddingClass } = useBottomPadding();
  const iosHlsQuality = usePlayerStore((state) => state.iosHlsQuality);
  const setIOSHLSQuality = usePlayerStore((state) => state.setIOSHLSQuality);
  const desktopTranscodeQuality = usePlayerStore(
    (state) => state.desktopTranscodeQuality,
  );
  const setDesktopTranscodeQuality = usePlayerStore(
    (state) => state.setDesktopTranscodeQuality,
  );
  const [isUpdatingQuality, setIsUpdatingQuality] = useState(false);
  const [downloadAudioQuality, setDownloadAudioQuality] = useState(
    loadDownloadAudioQuality,
  );
  const platform = getPlatformInfo().platform;
  const isSupportedPlatform = platform === "ios" || platform === "android";
  const currentQuality = getMobilePlaybackQuality(
    platform,
    desktopTranscodeQuality,
    iosHlsQuality,
  );

  const handleQualityChange = async (value: MobilePlaybackQuality) => {
    if (
      !isSupportedPlatform ||
      !currentQuality ||
      isUpdatingQuality ||
      value === currentQuality
    ) {
      return;
    }

    setIsUpdatingQuality(true);
    try {
      if (platform === "ios") {
        await setIOSHLSQuality(value);
        return;
      }

      await setDesktopTranscodeQuality(
        mapMobilePlaybackQualityToDesktopTranscodeQuality(value),
      );
    } finally {
      setIsUpdatingQuality(false);
    }
  };

  const handleDownloadQualityChange = (value: MobilePlaybackQuality) => {
    if (value === downloadAudioQuality) {
      return;
    }

    saveDownloadAudioQuality(value);
    setDownloadAudioQuality(value);
  };

  return (
    <div className={`min-h-screen bg-black ${bottomPaddingClass}`}>
      <MobileHeader
        title="音频质量"
        opacity={1}
        backgroundColor="rgb(0, 0, 0)"
        showBackButton={true}
        onBack={() => navigate("/settings")}
      />

      <div
        className="pt-14 px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      >
        {isSupportedPlatform && currentQuality ? (
          <AudioQualitySection
            title="在线播放音频质量"
            value={currentQuality}
            disabled={isUpdatingQuality}
            onChange={(value) => void handleQualityChange(value)}
          />
        ) : (
          <div className="pt-2">
            <h2 className="mb-3 text-lg font-semibold text-white">
              在线播放音频质量
            </h2>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
              当前平台不支持在这里调整在线播放音频质量。
            </div>
          </div>
        )}

        <AudioQualitySection
          title="离线缓存音频质量"
          value={downloadAudioQuality}
          className="mt-8"
          onChange={handleDownloadQualityChange}
        />
      </div>
    </div>
  );
}

interface AudioQualitySectionProps {
  title: string;
  value: MobilePlaybackQuality;
  onChange: (value: MobilePlaybackQuality) => void;
  disabled?: boolean;
  className?: string;
}

function AudioQualitySection({
  title,
  value,
  onChange,
  disabled = false,
  className,
}: AudioQualitySectionProps) {
  return (
    <section className={className}>
      <h2 className="mb-3 pt-2 text-lg font-semibold text-white">{title}</h2>
      <div className="space-y-2">
        {MOBILE_PLAYBACK_QUALITY_OPTIONS.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={`${title}-${option.value}`}
              type="button"
              disabled={disabled}
              aria-label={`${title} ${option.label}`}
              aria-pressed={active}
              onClick={() => !disabled && onChange(option.value)}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                active
                  ? "border-green-500/60 bg-green-500/10"
                  : "border-white/10 bg-white/[0.03] active:bg-white/5"
              } ${disabled ? "opacity-70" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] text-white">{option.label}</span>
                {active && (
                  <span className="text-xs font-medium text-green-400">
                    当前
                  </span>
                )}
              </div>
              {option.description && (
                <div className="mt-1 text-sm text-white/50">
                  {option.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
