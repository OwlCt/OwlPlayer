import { describe, expect, it, vi } from "vitest";
import {
  resolveSongCachedForDetailRow,
  type DetailPageVariant,
} from "./MobileDetailPage";

describe("resolveSongCachedForDetailRow", () => {
  const cachedSongIds = new Set(["song-1"]);

  const createResolverInput = (
    variant: DetailPageVariant,
    collectionId?: string,
  ) => ({
    songId: "song-1",
    variant,
    collectionId,
    cachedSongIds,
    isSongCachedForAlbum: vi.fn(),
    isSongCachedForPlaylist: vi.fn(),
  });

  it("uses album-specific references instead of global cache membership", () => {
    const input = createResolverInput("album", "album-1");
    input.isSongCachedForAlbum.mockReturnValue(false);

    expect(resolveSongCachedForDetailRow(input)).toBe(false);
    expect(input.isSongCachedForAlbum).toHaveBeenCalledWith("song-1", "album-1");
    expect(input.isSongCachedForPlaylist).not.toHaveBeenCalled();
  });

  it("uses playlist-specific references for liked songs", () => {
    const input = createResolverInput("liked");
    input.isSongCachedForPlaylist.mockReturnValue(true);

    expect(resolveSongCachedForDetailRow(input)).toBe(true);
    expect(input.isSongCachedForPlaylist).toHaveBeenCalledWith(
      "song-1",
      "liked-songs",
    );
    expect(input.isSongCachedForAlbum).not.toHaveBeenCalled();
  });

  it("falls back to global cache membership when no collection id is available", () => {
    const input = createResolverInput("playlist");

    expect(resolveSongCachedForDetailRow(input)).toBe(true);
    expect(input.isSongCachedForAlbum).not.toHaveBeenCalled();
    expect(input.isSongCachedForPlaylist).not.toHaveBeenCalled();
  });
});
