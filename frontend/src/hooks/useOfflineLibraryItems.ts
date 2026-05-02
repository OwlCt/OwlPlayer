import { useEffect, useMemo, useState } from "react";
import { LibraryItem } from "../store/libraryStore";
import {
  CacheStatus,
  shouldShowCacheSection,
  useOfflineCacheStore,
} from "../store/offlineCacheStore";

function getCachedStatus(partialIds: Set<string>, targetId: string): CacheStatus {
  return partialIds.has(targetId) ? "partial" : "full";
}

export function useOfflineLibraryItems() {
  const {
    cachedAlbums,
    cachedPlaylists,
    cachedAlbumIds,
    cachedPlaylistIds,
    partialAlbumIds,
    partialPlaylistIds,
  } = useOfflineCacheStore();
  const [albumArtworkUrls, setAlbumArtworkUrls] = useState<
    Record<string, string>
  >({});
  const [playlistArtworkUrls, setPlaylistArtworkUrls] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    if (typeof URL === "undefined") {
      return undefined;
    }

    const entries = cachedAlbums.map((album) => [
      album.id,
      URL.createObjectURL(album.artwork),
    ] as const);
    setAlbumArtworkUrls(Object.fromEntries(entries));

    return () => {
      entries.forEach(([, url]) => URL.revokeObjectURL(url));
    };
  }, [cachedAlbums]);

  useEffect(() => {
    if (typeof URL === "undefined") {
      return undefined;
    }

    const entries = cachedPlaylists.map((playlist) => [
      playlist.id,
      URL.createObjectURL(playlist.artwork),
    ] as const);
    setPlaylistArtworkUrls(Object.fromEntries(entries));

    return () => {
      entries.forEach(([, url]) => URL.revokeObjectURL(url));
    };
  }, [cachedPlaylists]);

  const cachedOnlyItems = useMemo<LibraryItem[]>(() => {
    const albumItems = cachedAlbums.map((album) => ({
      type: "album" as const,
      id: album.id,
      name: album.metadata.name,
      subtitle: `专辑 • ${album.metadata.artistName}`,
      imageUrl: albumArtworkUrls[album.id],
      artistId: album.metadata.artistId,
      artistName: album.metadata.artistName,
      createdAt: new Date(album.cachedAt).toISOString(),
      isCached: true,
      cacheStatus: getCachedStatus(partialAlbumIds, album.id),
    }));
    const playlistItems = cachedPlaylists.map((playlist) => ({
      type: "playlist" as const,
      id: playlist.id,
      name: playlist.metadata.name,
      subtitle: `歌单 • ${playlist.metadata.songCount} 首歌曲`,
      imageUrl: playlistArtworkUrls[playlist.id],
      createdAt: new Date(playlist.cachedAt).toISOString(),
      isCached: true,
      cacheStatus: getCachedStatus(partialPlaylistIds, playlist.id),
    }));

    return [...albumItems, ...playlistItems];
  }, [
    albumArtworkUrls,
    cachedAlbums,
    cachedPlaylists,
    partialAlbumIds,
    partialPlaylistIds,
    playlistArtworkUrls,
  ]);

  return {
    cachedAlbumIds,
    cachedPlaylistIds,
    partialAlbumIds,
    partialPlaylistIds,
    cachedOnlyItems,
    showCachedFilter: shouldShowCacheSection(
      new Set<string>(),
      cachedAlbumIds,
      cachedPlaylistIds,
    ),
  };
}
