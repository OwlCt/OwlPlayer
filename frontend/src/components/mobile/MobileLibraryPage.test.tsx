import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileLibraryPage from "./MobileLibraryPage";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetchLibraryAlbums: vi.fn(),
  fetchFollowedArtists: vi.fn(),
  fetchPlaylists: vi.fn(),
  deletePlaylist: vi.fn(),
  createPlaylist: vi.fn(),
  toggleFilter: vi.fn(),
  setSortBy: vi.fn(),
  setFilter: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("../../store/likedSongsStore", () => ({
  useLikedSongsStore: () => ({
    getLikedSongsCount: () => 0,
  }),
}));

vi.mock("../../store/libraryAlbumsStore", () => ({
  useLibraryAlbumsStore: () => ({
    savedAlbums: [
      {
        album_id: "album-1",
        album_name: "正专",
        artist_id: "artist-1",
        artist_name: "艺人甲",
        artwork_url: "cover-1.jpg",
        release_type: "album",
        is_single: false,
        created_at: "2026-04-16T00:00:00Z",
      },
      {
        album_id: "album-2",
        album_name: "扩展版",
        artist_id: "artist-1",
        artist_name: "艺人甲",
        artwork_url: "cover-2.jpg",
        release_type: "ep",
        is_single: false,
        created_at: "2026-04-16T00:00:00Z",
      },
      {
        album_id: "album-3",
        album_name: "独唱",
        artist_id: "artist-1",
        artist_name: "艺人甲",
        artwork_url: "cover-3.jpg",
        release_type: "single",
        is_single: true,
        created_at: "2026-04-16T00:00:00Z",
      },
    ],
    fetchLibraryAlbums: mocks.fetchLibraryAlbums,
  }),
}));

vi.mock("../../store/followedArtistsStore", () => ({
  useFollowedArtistsStore: () => ({
    followedArtists: [],
    fetchFollowedArtists: mocks.fetchFollowedArtists,
  }),
}));

vi.mock("../../store/playlistsStore", () => ({
  usePlaylistsStore: () => ({
    playlists: [],
    fetchPlaylists: mocks.fetchPlaylists,
    deletePlaylist: mocks.deletePlaylist,
    createPlaylist: mocks.createPlaylist,
  }),
}));

vi.mock("../../store/libraryStore", () => ({
  useLibraryStore: () => ({
    filter: "albums",
    toggleFilter: mocks.toggleFilter,
    sortBy: "recent-added",
    setSortBy: mocks.setSortBy,
    setFilter: mocks.setFilter,
  }),
  filterLibraryItems: (items: Array<{ type: string }>, filter: string) =>
    filter === "albums" ? items.filter((item) => item.type === "album") : items,
  searchLibraryItems: (items: unknown[]) => items,
  sortLibraryItems: (items: unknown[]) => items,
}));

vi.mock("../../store/playerStore", () => ({
  usePlayerStore: () => ({
    isPlaying: false,
    queueSource: { type: "album", id: "" },
  }),
}));

vi.mock("../../hooks/useOnlineStatus", () => ({
  useOnlineStatus: () => ({ isOnline: false }),
}));

vi.mock("../../hooks/useBottomPadding", () => ({
  useBottomPadding: () => ({ paddingClass: "" }),
}));

vi.mock("../../hooks/useOfflineLibraryItems", () => ({
  useOfflineLibraryItems: () => ({
    cachedAlbumIds: new Set<string>(),
    cachedPlaylistIds: new Set<string>(),
    partialAlbumIds: new Set<string>(),
    partialPlaylistIds: new Set<string>(),
    cachedOnlyItems: [],
    showCachedFilter: false,
  }),
}));

vi.mock("../../hooks/useTouchClick", () => ({
  useTouchClick: (onClick: () => void) => ({ onClick }),
  isTapGesture: () => true,
}));

vi.mock("../CachedImage", () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

vi.mock("../../utils/image", () => ({
  getProxiedImageUrl: (url: string) => url,
}));

vi.mock("./MobileArtistMenu", () => ({
  default: () => null,
}));

vi.mock("./MobileAlbumMenu", () => ({
  default: () => null,
}));

vi.mock("./MobilePlaylistMenu", () => ({
  default: () => null,
}));

vi.mock("./MobileBottomSheet", () => ({
  default: () => null,
}));

describe("MobileLibraryPage", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.fetchLibraryAlbums.mockReset();
    mocks.fetchFollowedArtists.mockReset();
    mocks.fetchPlaylists.mockReset();
    mocks.deletePlaylist.mockReset();
    mocks.createPlaylist.mockReset();
    mocks.toggleFilter.mockReset();
    mocks.setSortBy.mockReset();
    mocks.setFilter.mockReset();
  });

  it("shows all album-like releases without rendering EP/single sub-tabs", () => {
    render(<MobileLibraryPage />);

    expect(screen.getByText("正专")).toBeInTheDocument();
    expect(screen.getByText("扩展版")).toBeInTheDocument();
    expect(screen.getByText("独唱")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "EP" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "单曲" })).not.toBeInTheDocument();
  });
});
