import { useEffect, useMemo, useState } from 'react';
import { getSongDetail } from '../api';
import { useOfflineCacheStore } from '../store/offlineCacheStore';
import type { Song, SongDetail } from '../types';
import { resolveNowPlayingSongData } from '../utils/nowPlayingDetails';
import { getSongDetailFromCache, revokeObjectUrls } from '../utils/offlineCacheConverter';
import { useOnlineStatus } from './useOnlineStatus';

const currentSongDetailCache = new Map<string, SongDetail | null>();

export function useResolvedCurrentSong(currentSong: Song | null) {
  const { isOnline } = useOnlineStatus();
  const { cachedSongIds } = useOfflineCacheStore();
  const [songDetail, setSongDetail] = useState<SongDetail | null>(() =>
    currentSong ? currentSongDetailCache.get(currentSong.id) ?? null : null
  );

  useEffect(() => {
    if (!currentSong) {
      setSongDetail(null);
      return;
    }

    const cachedDetail = currentSongDetailCache.get(currentSong.id) ?? null;
    setSongDetail(cachedDetail);

    let cancelled = false;
    const fetchSongDetail = async () => {
      try {
        if (!isOnline && cachedSongIds.has(currentSong.id)) {
          const cached = await getSongDetailFromCache(currentSong.id);
          if (!cancelled && cached?.songDetail) {
            currentSongDetailCache.set(currentSong.id, cached.songDetail as SongDetail);
            setSongDetail(cached.songDetail as SongDetail);
          }
          if (cached?.objectUrls?.length) {
            revokeObjectUrls(cached.objectUrls);
          }
          return;
        }

        if (!isOnline) {
          return;
        }

        const detail = await getSongDetail(currentSong.id);
        if (!cancelled) {
          currentSongDetailCache.set(currentSong.id, detail);
          setSongDetail(detail);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to resolve current song detail', error);
        }
      }
    };

    void fetchSongDetail();
    return () => {
      cancelled = true;
    };
  }, [currentSong, isOnline, cachedSongIds]);

  return useMemo(() => {
    if (!currentSong) {
      return null;
    }

    const resolved = resolveNowPlayingSongData(currentSong, songDetail, null);
    return {
      song: resolved.song,
      artworkUrl: resolved.artworkUrl,
      songDetail,
    };
  }, [currentSong, songDetail]);
}
