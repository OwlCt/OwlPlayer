import type { ReleaseType } from '../types';

export type ReleaseFilter = 'all' | ReleaseType;

export const RELEASE_TYPE_LABELS: Record<ReleaseType, string> = {
  album: '专辑',
  ep: 'EP',
  single: '单曲',
};

export function normalizeReleaseType(
  releaseType?: string,
  isSingle?: boolean
): ReleaseType {
  switch (releaseType) {
    case 'ep':
      return 'ep';
    case 'single':
      return 'single';
    case 'album':
      return 'album';
    default:
      return isSingle ? 'ep' : 'album';
  }
}

export function getReleaseTypeLabel(
  releaseType?: string,
  isSingle?: boolean
): string {
  return RELEASE_TYPE_LABELS[normalizeReleaseType(releaseType, isSingle)];
}

export function matchesReleaseTypeFilter(
  releaseType: string | undefined,
  isSingle: boolean | undefined,
  filter: ReleaseFilter
): boolean {
  if (filter === 'all') {
    return true;
  }
  return normalizeReleaseType(releaseType, isSingle) === filter;
}

export function isShortReleaseType(
  releaseType?: string,
  isSingle?: boolean
): boolean {
  const normalized = normalizeReleaseType(releaseType, isSingle);
  return normalized === 'ep' || normalized === 'single';
}
