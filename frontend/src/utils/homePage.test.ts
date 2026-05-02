import { describe, expect, it } from 'vitest';
import {
  buildMyMusicStats,
  buildTopAlbums,
  getHomePreviewDayKey,
  hashHomePreviewSeed,
  HOME_SECTION_ORDER,
  shuffleArrayWithSeed,
  sortRecentLibraryAlbums,
} from './homePage';

describe('homePage utils', () => {
  it('keeps the approved home section order', () => {
    expect(HOME_SECTION_ORDER).toEqual([
      'recent',
      'browse-all',
      'top-artists',
      'top-albums',
      'top-tracks',
      'discover',
      'daily',
    ]);
  });

  it('sorts recently added library albums by created_at descending', () => {
    const sorted = sortRecentLibraryAlbums([
      { album_id: 'old', created_at: '2026-03-01T00:00:00Z' } as any,
      { album_id: 'new', created_at: '2026-03-15T00:00:00Z' } as any,
      { album_id: 'mid', created_at: '2026-03-10T00:00:00Z' } as any,
    ]);

    expect(sorted.map((album) => album.album_id)).toEqual(['new', 'mid', 'old']);
  });

  it('builds my music stats with stable navigation paths', () => {
    const stats = buildMyMusicStats({
      likedSongs: 12,
      albums: 7,
      artists: 3,
      playlists: 5,
    });

    expect(stats.map((item) => item.label)).toEqual(['已点赞歌曲', '收藏专辑', '关注艺人', '歌单']);
    expect(stats.map((item) => item.value)).toEqual([12, 7, 3, 5]);
    expect(stats.map((item) => item.path)).toEqual([
      '/liked-songs',
      '/profile',
      '/profile/followed-artists',
      '/profile/playlists',
    ]);
  });

  it('builds top albums by aggregating monthly top tracks', () => {
    const albums = buildTopAlbums([
      {
        songId: 'song-1',
        songName: 'A',
        artistId: 'artist-1',
        artistName: 'Artist A',
        albumId: 'album-1',
        albumName: 'Album A',
        artworkUrl: 'art-a',
        duration: 1000,
        playCount: 8,
      },
      {
        songId: 'song-2',
        songName: 'B',
        artistId: 'artist-1',
        artistName: 'Artist A',
        albumId: 'album-1',
        albumName: 'Album A',
        artworkUrl: 'art-a',
        duration: 1000,
        playCount: 3,
      },
      {
        songId: 'song-3',
        songName: 'C',
        artistId: 'artist-2',
        artistName: 'Artist B',
        albumId: 'album-2',
        albumName: 'Album B',
        artworkUrl: 'art-b',
        duration: 1000,
        playCount: 9,
      },
    ]);

    expect(albums).toEqual([
      {
        albumId: 'album-1',
        albumName: 'Album A',
        artistName: 'Artist A',
        artworkUrl: 'art-a',
        playCount: 11,
      },
      {
        albumId: 'album-2',
        albumName: 'Album B',
        artistName: 'Artist B',
        artworkUrl: 'art-b',
        playCount: 9,
      },
    ]);
  });

  it('builds a stable local day key for preview caching', () => {
    expect(getHomePreviewDayKey(new Date('2026-04-02T10:11:12'))).toBe('2026-04-02');
  });

  it('hashes preview seeds deterministically', () => {
    expect(hashHomePreviewSeed('artists-2026-04-02-shuffle')).toBe(hashHomePreviewSeed('artists-2026-04-02-shuffle'));
    expect(hashHomePreviewSeed('artists-2026-04-02-shuffle')).not.toBe(hashHomePreviewSeed('albums-2026-04-02-shuffle'));
  });

  it('shuffles preview items deterministically without mutating the source array', () => {
    const source = ['a', 'b', 'c', 'd', 'e'];
    const seed = hashHomePreviewSeed('songs-2026-04-02-shuffle');

    const first = shuffleArrayWithSeed(source, seed);
    const second = shuffleArrayWithSeed(source, seed);

    expect(first).toEqual(second);
    expect(first).not.toEqual(source);
    expect(source).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
