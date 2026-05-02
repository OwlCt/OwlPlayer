import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOWNLOAD_AUDIO_QUALITY_KEY } from "../../utils/playbackQuality";
import MobilePlaybackQualityPage from "./MobilePlaybackQualityPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  platform: "ios" as "ios" | "android",
  playerStoreState: {
    iosHlsQuality: "aac256" as const,
    setIOSHLSQuality: vi.fn(() => Promise.resolve()),
    desktopTranscodeQuality: "aac320" as const,
    setDesktopTranscodeQuality: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("./MobileHeader", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../hooks/useBottomPadding", () => ({
  useBottomPadding: () => ({ paddingClass: "" }),
}));

vi.mock("../../utils/audioSession", () => ({
  getPlatformInfo: () => ({
    platform: mocks.platform,
    isPWA: false,
    browser: "chrome",
    supportsHLS: mocks.platform === "ios",
    supportsMediaSession: true,
  }),
}));

vi.mock("../../store/playerStore", () => ({
  usePlayerStore: (selector: (state: typeof mocks.playerStoreState) => unknown) =>
    selector(mocks.playerStoreState),
}));

describe("MobilePlaybackQualityPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    localStorage.clear();
    mocks.platform = "ios";
    mocks.playerStoreState.iosHlsQuality = "aac256";
    mocks.playerStoreState.desktopTranscodeQuality = "aac320";
    mocks.playerStoreState.setIOSHLSQuality.mockClear();
    mocks.playerStoreState.setDesktopTranscodeQuality.mockClear();
  });

  it("uses the shared iOS options without platform-specific labels", async () => {
    render(<MobilePlaybackQualityPage />);

    expect(screen.getByText("音频质量")).toBeInTheDocument();
    expect(screen.getByText("在线播放音频质量")).toBeInTheDocument();
    expect(screen.getByText("离线缓存音频质量")).toBeInTheDocument();
    expect(screen.queryByText("iOS 音质")).not.toBeInTheDocument();
    expect(screen.queryByText("Android 音质")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "在线播放音频质量 AAC 320 kbps",
      }),
    );

    await waitFor(() => {
      expect(mocks.playerStoreState.setIOSHLSQuality).toHaveBeenCalledWith(
        "aac320",
      );
    });
    expect(
      mocks.playerStoreState.setDesktopTranscodeQuality,
    ).not.toHaveBeenCalled();
  });

  it("maps shared AAC 256 selection to the Android transcode default", async () => {
    mocks.platform = "android";

    render(<MobilePlaybackQualityPage />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "在线播放音频质量 AAC 256 kbps",
      }),
    );

    await waitFor(() => {
      expect(
        mocks.playerStoreState.setDesktopTranscodeQuality,
      ).toHaveBeenCalledWith("auto");
    });
    expect(mocks.playerStoreState.setIOSHLSQuality).not.toHaveBeenCalled();
  });

  it("persists offline download audio quality locally", () => {
    render(<MobilePlaybackQualityPage />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "离线缓存音频质量 AAC 192 kbps",
      }),
    );

    expect(localStorage.getItem(DOWNLOAD_AUDIO_QUALITY_KEY)).toBe("aac192");
  });
});
