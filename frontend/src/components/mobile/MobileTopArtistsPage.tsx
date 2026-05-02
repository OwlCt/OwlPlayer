import { useState, useCallback } from 'react';
import { usePlayHistoryStore } from '../../store/playHistoryStore';
import MobileProfileListPage from './MobileProfileListPage';

export default function MobileTopArtistsPage() {
  const { topArtists, fetchTopArtists } = usePlayHistoryStore();
  const [isLoading, setIsLoading] = useState(true);

  const handleFetch = useCallback(() => {
    setIsLoading(true);
    fetchTopArtists(100).finally(() => setIsLoading(false));
  }, [fetchTopArtists]);

  const artists = topArtists.map((a) => ({
    id: a.artistId,
    name: a.artistName,
    artworkUrl: a.artworkUrl,
  }));

  return (
    <MobileProfileListPage
      type="artists"
      title="本月热门艺人"
      emptyTitle="本月还没有播放记录"
      emptyDescription="开始播放音乐来发现你的热门艺人"
      items={artists}
      isLoading={isLoading}
      onFetch={handleFetch}
    />
  );
}
