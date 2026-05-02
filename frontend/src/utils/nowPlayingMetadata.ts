import type { AlbumDetail, SongDetail } from '../types';

function normalizeReleaseDate(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getNowPlayingReleaseDate(
  songDetail?: SongDetail | null,
  albumDetail?: AlbumDetail | null
): string {
  return (
    normalizeReleaseDate(songDetail?.album?.releaseDate) ??
    normalizeReleaseDate(albumDetail?.releaseDate) ??
    '未知'
  );
}
