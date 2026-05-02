import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileSettingsPage from "./MobileSettingsPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  logout: vi.fn(),
  setManualOffline: vi.fn(),
  handleTriggerClick: vi.fn(),
  closeDebug: vi.fn(),
  platform: "android" as "ios" | "android" | "desktop",
  playerStoreState: {
    iosHlsQuality: "aac320" as const,
    desktopTranscodeQuality: "auto" as const,
  },
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../store/authStore", () => ({
  useAuthStore: () => ({
    user: {
      username: "owl",
      avatar_url: "",
      is_admin: false,
    },
    isAuthenticated: true,
    logout: mocks.logout,
  }),
}));

vi.mock("./MobileHeader", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("./MobileDebugPanel", () => ({
  MobileDebugPanel: () => <div data-testid="debug-panel" />,
  useDebugTrigger: () => ({
    isDebugOpen: false,
    handleTriggerClick: mocks.handleTriggerClick,
    closeDebug: mocks.closeDebug,
  }),
}));

vi.mock("../../hooks/useOnlineStatus", () => ({
  useManualOfflineMode: () => ({
    isManualOffline: false,
    setManualOffline: mocks.setManualOffline,
  }),
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

describe("MobileSettingsPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.logout.mockReset();
    mocks.setManualOffline.mockReset();
    localStorage.clear();
    mocks.platform = "android";
    mocks.playerStoreState.iosHlsQuality = "aac320";
    mocks.playerStoreState.desktopTranscodeQuality = "auto";
  });

  it("shows a single quality entry that links to the settings subpage", () => {
    render(<MobileSettingsPage />);

    expect(screen.getByText("音频质量")).toBeInTheDocument();
    expect(screen.getByText("在线 AAC 256 · 缓存 AAC 256")).toBeInTheDocument();
    expect(screen.queryByText("iOS 音质")).not.toBeInTheDocument();
    expect(screen.queryByText("Android 音质")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("音频质量"));

    expect(mocks.navigate).toHaveBeenCalledWith("/settings/quality");
  });
});
