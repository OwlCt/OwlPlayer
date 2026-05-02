import { useCallback } from 'react';
import { usePlaylistsStore } from '../../store/playlistsStore';
import MobileProfileListPage from './MobileProfileListPage';

export default function MobilePlaylistsPage() {
  const { playlists, fetchPlaylists, isLoading } = usePlaylistsStore();

  const handleFetch = useCallback(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const items = playlists.map((p) => ({
    id: p.id,
    name: p.name,
    artworkUrl: p.artwork_url,
  }));

  return (
    <MobileProfileListPage
      type="playlists"
      title="创建的歌单"
      emptyTitle="还没有创建歌单"
      emptyDescription="创建你的第一个歌单来收藏喜欢的音乐"
      items={items}
      isLoading={isLoading}
      onFetch={handleFetch}
    />
  );
}
