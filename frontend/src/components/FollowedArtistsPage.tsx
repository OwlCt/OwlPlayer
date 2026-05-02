import { useCallback } from 'react';
import { useFollowedArtistsStore } from '../store/followedArtistsStore';
import ArtistListPage from './ArtistListPage';

export default function FollowedArtistsPage() {
  const { followedArtists, fetchFollowedArtists, isLoading } = useFollowedArtistsStore();

  const handleFetch = useCallback(() => {
    fetchFollowedArtists();
  }, [fetchFollowedArtists]);

  const artists = followedArtists.map((a) => ({
    id: a.artist_id,
    name: a.artist_name,
    artworkUrl: a.artwork_url,
  }));

  return (
    <ArtistListPage
      title="关注中"
      emptyTitle="还没有关注的艺人"
      emptyDescription="浏览艺人页面并点击关注按钮"
      artists={artists}
      isLoading={isLoading}
      onFetch={handleFetch}
    />
  );
}
