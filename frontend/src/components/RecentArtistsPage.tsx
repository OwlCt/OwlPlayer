import { useMemo, useCallback, useState, useEffect } from 'react';
import { usePlayHistoryStore } from '../store/playHistoryStore';
import { getArtistDetail } from '../api';
import ArtistListPage from './ArtistListPage';

export default function RecentArtistsPage() {
  const { history, fetchHistory, isLoading } = usePlayHistoryStore();
  const [artistsWithArtwork, setArtistsWithArtwork] = useState<{ id: string; name: string; artworkUrl: string }[]>([]);
  const [isFetchingArtwork, setIsFetchingArtwork] = useState(false);

  const handleFetch = useCallback(() => {
    fetchHistory(100); // Fetch more history to get diverse artists
  }, [fetchHistory]);

  // Extract unique artists from play history, ordered by most recent play
  const uniqueArtists = useMemo(() => {
    const artistMap = new Map<string, { id: string; name: string }>();

    history.forEach((item) => {
      if (item.artistId && !artistMap.has(item.artistId)) {
        artistMap.set(item.artistId, {
          id: item.artistId,
          name: item.artistName,
        });
      }
    });

    return Array.from(artistMap.values());
  }, [history]);

  // Fetch real artist artwork from API
  useEffect(() => {
    const fetchArtistArtwork = async () => {
      if (uniqueArtists.length === 0) {
        setArtistsWithArtwork([]);
        return;
      }

      setIsFetchingArtwork(true);
      try {
        const artistsWithRealArtwork = await Promise.all(
          uniqueArtists.map(async (artist) => {
            try {
              const detail = await getArtistDetail(artist.id);
              return {
                id: artist.id,
                name: artist.name,
                artworkUrl: detail.artworkUrl || '',
              };
            } catch {
              return {
                id: artist.id,
                name: artist.name,
                artworkUrl: '',
              };
            }
          })
        );
        setArtistsWithArtwork(artistsWithRealArtwork);
      } finally {
        setIsFetchingArtwork(false);
      }
    };

    fetchArtistArtwork();
  }, [uniqueArtists]);

  return (
    <ArtistListPage
      title="最近听过其作品的艺人"
      emptyTitle="还没有最近播放的艺人"
      emptyDescription="开始播放音乐来发现更多艺人"
      artists={artistsWithArtwork}
      isLoading={isLoading || isFetchingArtwork}
      onFetch={handleFetch}
    />
  );
}
