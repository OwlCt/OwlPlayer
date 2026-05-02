import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { offlineCacheService, type CachedAlbum, type CachedSong } from "./offlineCacheService";

vi.mock("../utils/transientAudioCache", () => ({
  clearTransientAudioCaches: vi.fn().mockResolvedValue(undefined),
}));

const { cacheManager } = await import("./cacheManager");

function createCachedSong(songId: string): CachedSong {
  return {
    id: songId,
    audio: new Blob(["audio"], { type: "audio/mp4" }),
    artwork: new Blob(["artwork"], { type: "image/jpeg" }),
    lyrics: {
      ttml: "",
      type: "",
    },
    metadata: {
      id: songId,
      name: `Song ${songId}`,
      artistName: "Artist",
      artistId: "artist-1",
      albumName: "Album",
      albumId: "album-1",
      duration: 180000,
      hasLyrics: false,
    },
    songDetail: {
      id: songId,
      type: "songs",
      href: `/songs/${songId}`,
      attributes: {
        name: `Song ${songId}`,
        albumName: "Album",
        artistName: "Artist",
        artwork: {
          url: "",
          width: 300,
          height: 300,
          bgColor: "",
          textColor1: "",
          textColor2: "",
          textColor3: "",
          textColor4: "",
        },
        durationInMillis: 180000,
        genreNames: [],
        releaseDate: "2026-01-01",
        composerName: "",
        discNumber: 1,
        trackNumber: 1,
        contentRating: "",
        isrc: "",
        audioLocale: "",
        hasLyrics: false,
        hasTimeSyncedLyrics: false,
        hasAppleDigitalMaster: false,
        hasDolbyAtmos: false,
        hasLossless: false,
        hasHighResolutionLossless: false,
        isVocalAttenuationAllowed: false,
        isMasteredForItunes: false,
        previews: [],
        url: "",
        playParams: {
          id: songId,
          kind: "song",
        },
        artistUrl: "",
        albumUrl: "",
        audioTraits: [],
        primaryArtistId: "artist-1",
      },
      relationships: {
        albums: { data: [] },
        artists: { data: [] },
      },
    },
    cachedAt: Date.now(),
  };
}

function createCachedAlbum(trackIds: string[]): CachedAlbum {
  return {
    id: "album-1",
    artwork: new Blob(["artwork"], { type: "image/jpeg" }),
    metadata: {
      id: "album-1",
      name: "Album",
      artistName: "Artist",
      artistId: "artist-1",
      releaseDate: "2026-01-01",
      trackCount: trackIds.length,
      genre: "Pop",
    },
    trackIds,
    cachedAt: Date.now(),
  };
}

describe("cacheManager integration", () => {
  beforeEach(async () => {
    offlineCacheService.close();
    await indexedDB.deleteDatabase("owlplayer-offline-cache");
    await offlineCacheService.init();
    await offlineCacheService.clearAllCache();
  });

  it("deletes every song for an album with no other references", async () => {
    const trackIds = ["song-1", "song-2", "song-3"];

    for (const trackId of trackIds) {
      await offlineCacheService.cacheSong(createCachedSong(trackId));
    }
    await offlineCacheService.cacheAlbum(createCachedAlbum(trackIds));
    await cacheManager.initializeAlbumReferences("album-1", trackIds);

    const result = await cacheManager.deleteAlbumCache("album-1");

    expect(result.deletedSongIds.sort()).toEqual(trackIds);
    expect(result.preservedSongIds).toEqual([]);
    expect(await offlineCacheService.getAllCachedSongIds()).toEqual([]);
    expect(await offlineCacheService.getCachedAlbum("album-1")).toBeNull();
    expect(await offlineCacheService.getAllSongReferences()).toEqual([]);
  });
});
