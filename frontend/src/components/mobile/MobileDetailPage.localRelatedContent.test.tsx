import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileDetailPage from "./MobileDetailPage";
import { usePlayerStore } from "../../store/playerStore";
import { useRecentlyPlayedStore } from "../../store/recentlyPlayedStore";
import { useLikedSongsStore } from "../../store/likedSongsStore";
import { useToastStore } from "../../store/toastStore";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { useGoBack } from "../../hooks/useNavigationHistory";
import {
  getAlbumDetail,
  getAlbumMoreByArtist,
  getAlbumOtherVersions,
} from "../../api";

vi.mock("../../api", () => ({
  getAlbumDetail: vi.fn(),
  getPlaylist: vi.fn(),
  getAlbumOtherVersions: vi.fn(),
  getAlbumMoreByArtist: vi.fn(),
  OfflineModeError: class OfflineModeError extends Error {},
}));

vi.mock("../../store/playerStore", () => ({
  usePlayerStore: vi.fn(),
}));

vi.mock("../../store/recentlyPlayedStore", () => ({
  useRecentlyPlayedStore: vi.fn(),
}));

vi.mock("../../store/likedSongsStore", () => ({
  useLikedSongsStore: vi.fn(),
  likedSongToSong: vi.fn(),
}));

vi.mock("../../store/authStore", () => ({
  useAuthStore: {
    getState: () => ({ user: null }),
  },
}));

vi.mock("../../store/toastStore", () => ({
  useToastStore: vi.fn(),
}));

vi.mock("../../hooks/useNavigationHistory", () => ({
  useGoBack: vi.fn(),
}));

vi.mock("../../hooks/useBottomPadding", () => ({
  useBottomPadding: () => ({ paddingClass: "pb-52" }),
}));

vi.mock("../../hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

vi.mock("../../utils/image", () => ({
  getProxiedImageUrl: (url: string) => url,
}));

vi.mock("../../utils/colorExtractor", () => ({
  extractDominantColor: vi.fn(() => Promise.resolve("rgb(38, 38, 38)")),
}));

vi.mock("../ScrollableCardRow", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../AlbumCard", () => ({
  default: ({ album }: { album: { name: string } }) => (
    <div data-testid="mobile-album-card">{album.name}</div>
  ),
}));

vi.mock("../CachedImage", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("../MotionArtwork", () => ({
  default: () => null,
}));

vi.mock("./MobileSongMenu", () => ({
  default: () => null,
}));

vi.mock("./MobileAlbumMenu", () => ({
  default: () => null,
}));

vi.mock("./MobilePlaylistMenu", () => ({
  default: () => null,
}));

vi.mock("./MobileDownloadButton", () => ({
  MobileAlbumDownloadButton: () => (
    <div data-testid="mobile-album-download-button" />
  ),
  MobilePlaylistDownloadButton: () => (
    <div data-testid="mobile-playlist-download-button" />
  ),
}));

vi.mock("../AlbumSaveButton", () => ({
  AlbumSaveButton: () => null,
}));

vi.mock("../LikeButton", () => ({
  LikeButton: () => null,
}));

vi.mock("../ShuffleButton", () => ({
  ShuffleButton: () => <button type="button">shuffle</button>,
}));

vi.mock("../icons/MobileNowPlayingIcon", () => ({
  MobileNowPlayingIcon: () => null,
}));

vi.mock("../../services/offlineCacheService", () => ({
  offlineCacheService: {
    getCachedAlbum: vi.fn(),
    getCachedPlaylist: vi.fn(),
    getCachedSong: vi.fn(),
  },
}));

vi.mock("../../utils/offlineCacheConverter", () => ({
  convertCachedAlbumToAlbumDetail: vi.fn(),
  convertCachedPlaylistToPlaylist: vi.fn(),
  revokeObjectUrls: vi.fn(),
}));

vi.mock("./MobileHeader", () => ({
  default: ({ title }: { title?: string }) => <div>{title}</div>,
}));

function createLocalAlbumDetail(
  albumId: string,
  shelves: Array<Record<string, unknown>>,
) {
  return {
    id: albumId,
    name: "本地专辑",
    artistId: "artist-1",
    artistName: "本地艺人",
    artworkUrl: "",
    releaseDate: "2024-01-01",
    trackCount: 1,
    tracks: [
      {
        id: `track-${albumId}`,
        name: "本地歌曲",
        artistName: "本地艺人",
        albumName: "本地专辑",
        duration: 180000,
        artworkUrl: "",
        hasLyrics: false,
      },
    ],
    artists: [{ id: "artist-1", name: "本地艺人" }],
    localRelatedContent: {
      shelves,
    },
  };
}

describe("MobileDetailPage local related content", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: vi.fn(),
      currentSong: null,
      isPlaying: false,
      queueSource: { type: null, id: null },
      toggleShuffle: vi.fn(),
      isShuffled: false,
      pause: vi.fn(),
      play: vi.fn(),
    });

    (
      useRecentlyPlayedStore as unknown as ReturnType<typeof vi.fn>
    ).mockReturnValue({
      recordPlay: vi.fn(),
    });

    (useLikedSongsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      {
        likedSongs: [],
        fetchLikedSongs: vi.fn(),
      },
    );

    (useToastStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      showToast: vi.fn(),
    });

    (useOnlineStatus as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      isOnline: true,
    });

    (useGoBack as unknown as ReturnType<typeof vi.fn>).mockReturnValue(vi.fn());

    (
      getAlbumOtherVersions as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      getAlbumMoreByArtist as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ albums: [], hasMore: false });
  });

  it("renders only album shelves on mobile local album pages", async () => {
    (getAlbumDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      createLocalAlbumDetail("1", [
        {
          id: "more-by-artist",
          kind: "albums",
          title: "更多本地艺人的作品",
          albums: [
            {
              id: "2",
              name: "后续专辑",
              artistName: "本地艺人",
              artworkUrl: "",
              trackCount: 8,
              releaseDate: "2025-01-01",
            },
          ],
        },
        {
          id: "artist-songs",
          kind: "songs",
          title: "你常听的歌曲",
          songs: [
            {
              id: "song-1",
              name: "常听歌曲",
              artistName: "本地艺人",
              albumName: "本地专辑",
              duration: 180000,
              artworkUrl: "",
              hasLyrics: false,
            },
          ],
        },
      ]),
    );

    render(
      <MemoryRouter>
        <MobileDetailPage variant="album" id="1" />
      </MemoryRouter>,
    );

    expect(await screen.findByText("更多本地艺人的作品")).toBeInTheDocument();
    expect(
      screen.getByTestId("mobile-album-download-button"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("mobile-album-card")).toHaveTextContent(
      "后续专辑",
    );
    expect(screen.queryByText("你常听的歌曲")).not.toBeInTheDocument();
    expect(screen.queryByText("常听歌曲")).not.toBeInTheDocument();

    const localSectionTexts = screen
      .getAllByText(/更多本地艺人的作品/)
      .map((node) => node.textContent);
    expect(localSectionTexts).toContain("更多本地艺人的作品");

    expect(getAlbumOtherVersions).not.toHaveBeenCalled();
    expect(getAlbumMoreByArtist).not.toHaveBeenCalled();
  });

  it("does not render artist songs on mobile album pages", async () => {
    (getAlbumDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      createLocalAlbumDetail("2", [
        {
          id: "artist-songs",
          kind: "songs",
          title: "先听这几首",
          songs: [
            {
              id: "song-1",
              name: "推荐歌曲",
              artistName: "本地艺人",
              albumName: "本地专辑",
              duration: 180000,
              artworkUrl: "",
              hasLyrics: false,
            },
          ],
        },
      ]),
    );

    render(
      <MemoryRouter>
        <MobileDetailPage variant="album" id="2" />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "本地专辑" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("先听这几首")).not.toBeInTheDocument();
    expect(screen.queryByText("更多本地艺人的作品")).not.toBeInTheDocument();
    expect(screen.queryByText("推荐歌曲")).not.toBeInTheDocument();
    expect(getAlbumOtherVersions).not.toHaveBeenCalled();
    expect(getAlbumMoreByArtist).not.toHaveBeenCalled();
  });
});
