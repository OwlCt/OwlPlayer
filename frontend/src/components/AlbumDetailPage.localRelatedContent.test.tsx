import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AlbumDetailPage from "./AlbumDetailPage";
import { usePlayerStore } from "../store/playerStore";
import { useRecentlyPlayedStore } from "../store/recentlyPlayedStore";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import {
  getAlbumAppearsOn,
  getAlbumDetail,
  getAlbumMoreByArtist,
  getAlbumOtherVersions,
  getAlbumYouMightAlsoLike,
} from "../api";

vi.mock("../api", () => ({
  getAlbumDetail: vi.fn(),
  getAlbumOtherVersions: vi.fn(),
  getAlbumYouMightAlsoLike: vi.fn(),
  getAlbumMoreByArtist: vi.fn(),
  getAlbumAppearsOn: vi.fn(),
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

vi.mock("../utils/image", () => ({
  getProxiedImageUrl: (url: string) => url,
}));

vi.mock("../utils/colorExtractor", () => ({
  extractDominantColor: vi.fn(() => Promise.resolve("rgb(38, 38, 38)")),
}));

vi.mock("./StickyHeader", () => ({
  StickyHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("./AlbumSaveButton", () => ({
  AlbumSaveButton: () => null,
}));

vi.mock("./DownloadButton", () => ({
  AlbumDownloadButton: () => <div data-testid="album-download-button" />,
}));

vi.mock("./LikeButton", () => ({
  LikeButton: () => null,
}));

vi.mock("./ShuffleButton", () => ({
  ShuffleButton: () => <button type="button">shuffle</button>,
}));

vi.mock("./ClickableLink", () => ({
  default: ({ text }: { text: string }) => <span>{text}</span>,
  getArtistHref: () => "/artist/artist-1",
}));

vi.mock("./AdaptiveTitle", () => ({
  AdaptiveTitle: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock("./CachedImage", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("./MotionArtwork", () => ({
  default: () => null,
}));

vi.mock("./ScrollableCardRow", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("./AlbumCard", () => ({
  default: ({ album }: { album: { name: string } }) => (
    <div data-testid="album-card">{album.name}</div>
  ),
}));

vi.mock("./SongCard", () => ({
  default: ({ song }: { song: { name: string } }) => (
    <div data-testid="song-card">{song.name}</div>
  ),
}));

vi.mock("./SongContextMenu", () => ({
  default: () => null,
}));

vi.mock("./OfflineFallback", () => ({
  default: ({ message }: { message: string }) => <div>{message}</div>,
}));

vi.mock("../services/offlineCacheService", () => ({
  offlineCacheService: {
    getCachedAlbum: vi.fn(),
    getCachedSong: vi.fn(),
  },
}));

vi.mock("../utils/offlineCacheConverter", () => ({
  convertCachedAlbumToAlbumDetail: vi.fn(),
  revokeObjectUrls: vi.fn(),
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

describe("AlbumDetailPage local related content", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (usePlayerStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      setQueue: vi.fn(),
      currentSong: null,
      isPlaying: false,
      togglePlay: vi.fn(),
      toggleShuffle: vi.fn(),
      isShuffled: false,
      queueSource: { type: null, id: null },
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

    (
      getAlbumOtherVersions as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      getAlbumMoreByArtist as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ albums: [], hasMore: false });
    (
      getAlbumAppearsOn as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ albums: [], hasMore: false });
    (
      getAlbumYouMightAlsoLike as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ albums: [], hasMore: false });
  });

  it("renders local shelves in backend order and skips remote related requests", async () => {
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
          title: "先听这几首",
          songs: [
            {
              id: "song-1",
              name: "推荐歌曲",
              artistName: "本地艺人",
              albumName: "后续专辑",
              duration: 180000,
              artworkUrl: "",
              hasLyrics: false,
            },
          ],
        },
      ]),
    );

    render(
      <MemoryRouter initialEntries={["/album/1"]}>
        <Routes>
          <Route path="/album/:albumId" element={<AlbumDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "更多本地艺人的作品" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("album-download-button")).toBeInTheDocument();
    expect(screen.getByTestId("album-card")).toHaveTextContent("后续专辑");
    expect(
      screen.queryByRole("heading", { name: "先听这几首" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("song-card")).not.toBeInTheDocument();

    const headings = screen
      .getAllByRole("heading")
      .map((heading) => heading.textContent)
      .filter((text): text is string => Boolean(text));
    expect(headings).toEqual(["本地专辑", "更多本地艺人的作品"]);

    expect(getAlbumOtherVersions).not.toHaveBeenCalled();
    expect(getAlbumMoreByArtist).not.toHaveBeenCalled();
    expect(getAlbumAppearsOn).not.toHaveBeenCalled();
    expect(getAlbumYouMightAlsoLike).not.toHaveBeenCalled();
  });

  it("does not render local artist songs on album pages", async () => {
    (getAlbumDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      createLocalAlbumDetail("2", [
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
      <MemoryRouter initialEntries={["/album/2"]}>
        <Routes>
          <Route path="/album/:albumId" element={<AlbumDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "本地专辑" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "更多本地艺人的作品" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "你常听的歌曲" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("song-card")).not.toBeInTheDocument();
    expect(getAlbumOtherVersions).not.toHaveBeenCalled();
    expect(getAlbumMoreByArtist).not.toHaveBeenCalled();
    expect(getAlbumAppearsOn).not.toHaveBeenCalled();
    expect(getAlbumYouMightAlsoLike).not.toHaveBeenCalled();
  });

  it("keeps remote related-content behavior when local shelves are absent", async () => {
    (getAlbumDetail as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "3",
      name: "远程专辑",
      artistId: "artist-remote",
      artistName: "远程艺人",
      artworkUrl: "",
      releaseDate: "2024-01-01",
      trackCount: 1,
      tracks: [
        {
          id: "track-3",
          name: "远程歌曲",
          artistName: "远程艺人",
          albumName: "远程专辑",
          duration: 180000,
          artworkUrl: "",
          hasLyrics: false,
        },
      ],
      artists: [{ id: "artist-remote", name: "远程艺人" }],
    });
    (
      getAlbumMoreByArtist as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      albums: [
        {
          id: "remote-more",
          name: "远程更多作品",
          artistName: "远程艺人",
          artworkUrl: "",
          releaseDate: "2023-01-01",
          trackCount: 9,
        },
      ],
      hasMore: false,
    });
    (
      getAlbumAppearsOn as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      albums: [
        {
          id: "remote-appears",
          name: "远程参与作品",
          artistName: "远程艺人",
          artworkUrl: "",
          releaseDate: "2022-01-01",
          trackCount: 12,
        },
      ],
      hasMore: false,
    });
    (
      getAlbumYouMightAlsoLike as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      albums: [
        {
          id: "remote-like",
          name: "远程推荐",
          artistName: "其他艺人",
          artworkUrl: "",
          releaseDate: "2021-01-01",
          trackCount: 10,
        },
      ],
      hasMore: false,
    });

    render(
      <MemoryRouter initialEntries={["/album/3"]}>
        <Routes>
          <Route path="/album/:albumId" element={<AlbumDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("远程更多作品")).toBeInTheDocument();
    expect(screen.getByText("远程参与作品")).toBeInTheDocument();
    expect(screen.getByText("远程推荐")).toBeInTheDocument();

    expect(getAlbumOtherVersions).toHaveBeenCalledWith("3");
    expect(getAlbumMoreByArtist).toHaveBeenCalledWith("3");
    expect(getAlbumAppearsOn).toHaveBeenCalledWith("3");
    expect(getAlbumYouMightAlsoLike).toHaveBeenCalledWith("3");
  });
});
