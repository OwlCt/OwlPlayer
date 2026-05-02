import { useState, useCallback } from 'react';
import { usePlayHistoryStore } from '../../store/playHistoryStore';
import { usePlayerStore } from '../../store/playerStore';
import MobileProfileListPage from './MobileProfileListPage';

export default function MobileTopTracksPage() {
  const { topTracks, fetchTopTracks } = usePlayHistoryStore();
  const { playSong, setQueue } = usePlayerStore();
  const [isLoading, setIsLoading] = useState(true);

  const handleFetch = useCallback(() => {
    setIsLoading(true);
    fetchTopTracks(100).finally(() => setIsLoading(false));
  }, [fetchTopTracks]);

  const tracks = topTracks.map((t) => ({
    id: t.songId,
    name: t.songName,
    artistId: t.artistId,
    artistName: t.artistName,
    albumId: t.albumId,
    albumName: t.albumName,
    artworkUrl: t.artworkUrl,
    duration: t.duration,
    playCount: t.playCount,
  }));

  const handlePlayTrack = useCallback((index: number) => {
    const songs = tracks.map((t) => ({
      id: t.id,
      name: t.name,
      artistId: t.artistId,
      artistName: t.artistName,
      albumId: t.albumId,
      albumName: t.albumName,
      artworkUrl: t.artworkUrl,
      duration: t.duration,
      hasLyrics: false,
    }));
    setQueue(songs, index, { type: 'profile-top-tracks', id: null, name: '本月热门曲目' });
    playSong(songs[index]);
  }, [tracks, setQueue, playSong]);

  return (
    <MobileProfileListPage
      type="tracks"
      title="本月热门曲目"
      emptyTitle="本月还没有播放记录"
      emptyDescription="开始播放音乐来生成你的热门曲目"
      items={tracks}
      isLoading={isLoading}
      onFetch={handleFetch}
      onPlayTrack={handlePlayTrack}
    />
  );
}
