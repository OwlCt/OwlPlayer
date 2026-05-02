import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../../types';
import { MobileTrackRow } from './MobileDetailPage';

vi.mock('../LikeButton', () => ({
  LikeButton: () => null,
}));

vi.mock('../icons/MobileNowPlayingIcon', () => ({
  MobileNowPlayingIcon: () => null,
}));

describe('MobileTrackRow cache indicators', () => {
  const song: Song = {
    id: 'song-1',
    name: '测试歌曲',
    artistName: '测试歌手',
    albumName: '测试专辑',
    duration: 180000,
    artworkUrl: '',
    hasLyrics: false,
  };

  it('shows downloaded indicator for cached songs', () => {
    render(
      <MobileTrackRow
        track={song}
        index={0}
        isPlaying={false}
        isCurrentTrack={false}
        onTap={vi.fn()}
        onLongPress={vi.fn()}
        isCached
      />,
    );

    expect(screen.getByLabelText('已下载')).toBeInTheDocument();
  });

  it('shows downloading indicator when a mobile row is downloading', () => {
    render(
      <MobileTrackRow
        track={song}
        index={0}
        isPlaying={false}
        isCurrentTrack={false}
        onTap={vi.fn()}
        onLongPress={vi.fn()}
        isDownloading
        downloadProgress={35}
      />,
    );

    expect(screen.getByLabelText('下载中')).toBeInTheDocument();
  });
});
