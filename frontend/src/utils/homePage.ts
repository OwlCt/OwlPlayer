import { LibraryAlbum } from '../store/libraryAlbumsStore';
import { TopTrackItem } from '../store/playHistoryStore';

export const HOME_SECTION_ORDER = [
  'recent',
  'browse-all',
  'top-artists',
  'top-albums',
  'top-tracks',
  'discover',
  'daily',
] as const;

export interface HomeStatItem {
  key: 'liked-songs' | 'albums' | 'artists' | 'playlists';
  label: string;
  value: number;
  path: string;
}

export function buildMyMusicStats(counts: {
  likedSongs: number;
  albums: number;
  artists: number;
  playlists: number;
}): HomeStatItem[] {
  return [
    { key: 'liked-songs', label: '已点赞歌曲', value: counts.likedSongs, path: '/liked-songs' },
    { key: 'albums', label: '收藏专辑', value: counts.albums, path: '/profile' },
    { key: 'artists', label: '关注艺人', value: counts.artists, path: '/profile/followed-artists' },
    { key: 'playlists', label: '歌单', value: counts.playlists, path: '/profile/playlists' },
  ];
}

export function sortRecentLibraryAlbums(albums: LibraryAlbum[]): LibraryAlbum[] {
  return [...albums].sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
    const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
    return rightTime - leftTime;
  });
}

export interface HomeTopAlbumItem {
  albumId: string;
  albumName: string;
  artistName: string;
  artworkUrl: string;
  playCount: number;
}

export function buildTopAlbums(topTracks: TopTrackItem[], limit: number = 10): HomeTopAlbumItem[] {
  const grouped = new Map<string, HomeTopAlbumItem>();

  topTracks.forEach((track) => {
    const albumKey = track.albumId || `${track.albumName}::${track.artistName}`;
    const existing = grouped.get(albumKey);

    if (existing) {
      existing.playCount += track.playCount;
      if (!existing.artworkUrl && track.artworkUrl) {
        existing.artworkUrl = track.artworkUrl;
      }
      return;
    }

    grouped.set(albumKey, {
      albumId: track.albumId,
      albumName: track.albumName,
      artistName: track.artistName,
      artworkUrl: track.artworkUrl,
      playCount: track.playCount,
    });
  });

  return [...grouped.values()]
    .filter((album) => album.albumName)
    .sort((left, right) => {
      if (right.playCount !== left.playCount) {
        return right.playCount - left.playCount;
      }
      return left.albumName.localeCompare(right.albumName, 'zh-CN');
    })
    .slice(0, limit);
}

export function getHomePreviewDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function hashHomePreviewSeed(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function shuffleArrayWithSeed<T>(items: T[], seed: number): T[] {
  const next = [...items];
  let state = seed >>> 0;

  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}
