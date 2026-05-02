import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SongListPage from "./SongListPage";
import { getPlaylist } from "../api";
import { useLikedSongsStore } from "../store/likedSongsStore";
import { usePlayerStore } from "../store/playerStore";
import { usePlaylistsStore } from "../store/playlistsStore";
import { useRecentlyPlayedStore } from "../store/recentlyPlayedStore";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

vi.mock("../api", () => ({
  getPlaylist: vi.fn(),
  OfflineModeError: class OfflineModeError extends Error {},
}));

vi.mock("../store/likedSongsStore", () => ({
  useLikedSongsStore: vi.fn(),
  likedSongToSong: vi.fn(),
}));

vi.mock("../store/playlistsStore", () => ({
  usePlaylistsStore: vi.fn(),
}));

vi.mock("../store/playerStore", () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock("../store/recentlyPlayedStore", () => ({
  useRecentlyPlayedStore: vi.fn(),
}));

vi.mock("../hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock("../services/offlineCacheService", () => ({
  offlineCacheService: {
    getCachedPlaylist: vi.fn(),
    getCachedSong: vi.fn(),
  },
}));

vi.mock("../utils/offlineCacheConverter", () => ({
  convertCachedPlaylistToPlaylist: vi.fn(),
  revokeObjectUrls: vi.fn(),
}));

vi.mock("../utils/image", () => ({
  getProxiedImageUrl: (url: string) => url,
}));

vi.mock("../utils/colorExtractor", () => ({
  extractDominantColor: vi.fn(() => Promise.resolve("rgb(38, 38, 38)")),
}));

vi.mock("./StickyHeader", () => ({
  StickyHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./SongCard", () => ({
  default: () => null,
}));

vi.mock("./DraggableImage", () => ({
  default: () => null,
}));

vi.mock("./ShuffleButton", () => ({
  default: () => null,
}));

vi.mock("./PlaylistEditModal", () => ({
  default: () => null,
}));

vi.mock("./OfflineFallback", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("./DownloadButton", () => ({
  PlaylistDownloadButton: ({
    trackIds,
  }: {
    playlistId: string;
    trackIds: string[];
  }) => <div data-testid="playlist-download-button">{trackIds.join(",")}</div>,
}));

describe("SongListPage download button", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useLikedSongsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        likedSongs: [],
        isLoading: false,
        fetchLikedSongs: vi.fn(),
      },
    );

    (usePlaylistsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      fetchPlaylists: vi.fn(),
    });

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: vi.fn(),
      toggleShuffle: vi.fn(),
      isShuffled: false,
      queueSource: { type: null, id: null },
      isPlaying: false,
      pause: vi.fn(),
      play: vi.fn(),
    });

    (
      useRecentlyPlayedStore as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      recordPlay: vi.fn(),
    });

    (useOnlineStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isOnline: true,
    });
  });

  it("passes only non-MV track ids to playlist download button", async () => {
    (getPlaylist as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "playlist-1",
      name: "测试歌单",
      songs: [
        {
          id: "song-1",
          name: "普通歌曲",
          artistName: "歌手",
          albumName: "专辑",
          duration: 180000,
          artworkUrl: "",
          hasLyrics: false,
        },
        {
          id: "mv-1",
          name: "MV",
          artistName: "歌手",
          albumName: "专辑",
          duration: 200000,
          artworkUrl: "",
          hasLyrics: false,
          isMusicVideo: true,
        },
      ],
    });

    render(<SongListPage variant="playlist" playlistId="playlist-1" />);

    expect(
      await screen.findByTestId("playlist-download-button"),
    ).toHaveTextContent("song-1");
    expect(screen.getByTestId("playlist-download-button")).not.toHaveTextContent(
      "mv-1",
    );
  });
});
