import { Album, ArtistDetail, ReleaseType, Song } from '../types';
import { QueueSource } from '../store/playerStore';

export type ArtistSongsSource = 'history' | 'library_fallback';
export type ArtistQueueVariant = 'featured' | 'library';
export const ARTIST_OVERVIEW_FEATURED_LIMIT = 5;
export const ARTIST_ALL_SONGS_FEATURED_LIMIT = 20;

export interface GroupedArtistSongs {
  key: string;
  albumId?: string;
  albumName: string;
  songs: Song[];
  artworkUrl?: string;
  releaseDate?: string;
  releaseType?: ReleaseType;
  isSingle?: boolean;
}

export function getFeaturedSongsHeading(source?: ArtistSongsSource): string {
  return source === 'history' ? '你常听的歌曲' : '先听这几首';
}

export function getFeaturedSongs(artist: Pick<ArtistDetail, 'featuredSongs' | 'topSongs'>): Song[] {
  return artist.featuredSongs?.length ? artist.featuredSongs : artist.topSongs || [];
}

export function getLibrarySongs(artist: Pick<ArtistDetail, 'librarySongs' | 'featuredSongs' | 'topSongs'>): Song[] {
  if (artist.librarySongs?.length) {
    return artist.librarySongs;
  }
  return getFeaturedSongs(artist);
}

export function mergeArtistAlbumGroups(...albumGroups: Array<Album[] | undefined>): Album[] {
  return albumGroups
    .flatMap((albums) => albums || [])
    .filter((album, index, self) => self.findIndex((item) => item.id === album.id) === index);
}

export function buildArtistQueueSource(
  artistId: string,
  artistName: string,
  variant: ArtistQueueVariant
): QueueSource {
  return {
    type: 'artist',
    id: artistId,
    name: artistName,
    variant,
  };
}

export function isArtistQueueSource(queueSource: QueueSource, artistId: string, variant?: ArtistQueueVariant): boolean {
  if (queueSource.type !== 'artist' || queueSource.id !== artistId) {
    return false;
  }
  if (!variant) {
    return true;
  }
  return queueSource.variant === variant;
}

export function groupLibrarySongsByAlbum(songs: Song[]): GroupedArtistSongs[] {
  const groups = new Map<string, GroupedArtistSongs>();

  songs.forEach((song) => {
    const albumName = song.albumName || '未命名专辑';
    const key = song.albumId || `album:${albumName}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        albumId: song.albumId,
        albumName,
        songs: [],
        artworkUrl: song.artworkUrl || undefined,
      });
    }
    groups.get(key)?.songs.push(song);
  });

  return Array.from(groups.values());
}

function getReleaseTimestamp(releaseDate?: string): number | null {
  if (!releaseDate) {
    return null;
  }

  const timestamp = new Date(releaseDate).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

export function sortAlbumsByReleaseDateDesc(albums: Album[]): Album[] {
  return [...albums].sort((a, b) => {
    const releaseA = getReleaseTimestamp(a.releaseDate);
    const releaseB = getReleaseTimestamp(b.releaseDate);

    if (releaseA !== null && releaseB !== null && releaseA !== releaseB) {
      return releaseB - releaseA;
    }

    if (releaseA !== null) {
      return -1;
    }

    if (releaseB !== null) {
      return 1;
    }

    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

function sortGroupedArtistSongs(groups: GroupedArtistSongs[]): GroupedArtistSongs[] {
  return [...groups].sort((a, b) => {
    const releaseA = getReleaseTimestamp(a.releaseDate);
    const releaseB = getReleaseTimestamp(b.releaseDate);

    if (releaseA !== null && releaseB !== null && releaseA !== releaseB) {
      return releaseB - releaseA;
    }

    if (releaseA !== null) {
      return -1;
    }

    if (releaseB !== null) {
      return 1;
    }

    return a.albumName.localeCompare(b.albumName, 'zh-CN');
  });
}

function normalizeAlbumLookupValue(value?: string): string {
  return value?.trim().toLocaleLowerCase('zh-CN') || '';
}

function resolveAlbumMatch(
  target: { albumId?: string; albumName?: string; artworkUrl?: string },
  albums: Album[],
  albumMap: Map<string, Album>
): Album | undefined {
  if (target.albumId) {
    const albumById = albumMap.get(target.albumId);
    if (albumById) {
      return albumById;
    }
  }

  const normalizedAlbumName = normalizeAlbumLookupValue(target.albumName);
  if (!normalizedAlbumName) {
    return undefined;
  }

  const nameCandidates = albums.filter(
    (album) => normalizeAlbumLookupValue(album.name) === normalizedAlbumName
  );

  if (nameCandidates.length === 1) {
    return nameCandidates[0];
  }

  if (!target.artworkUrl) {
    return undefined;
  }

  return nameCandidates.find((album) => album.artworkUrl === target.artworkUrl);
}

function resolveAlbumForGroup(group: GroupedArtistSongs, albums: Album[], albumMap: Map<string, Album>): Album | undefined {
  return resolveAlbumMatch(group, albums, albumMap);
}

export function enrichSongForArtistNavigation(
  song: Song,
  options: {
    artistId: string;
    artistName: string;
    albums?: Album[];
    fallbackAlbumId?: string;
    fallbackAlbumName?: string;
  }
): Song {
  const albums = options.albums || [];
  const albumMap = new Map(albums.map((album) => [album.id, album]));
  const resolvedAlbum = resolveAlbumMatch(
    {
      albumId: song.albumId || options.fallbackAlbumId,
      albumName: song.albumName || options.fallbackAlbumName,
      artworkUrl: song.artworkUrl,
    },
    albums,
    albumMap
  );

  return {
    ...song,
    artistId: song.artistId || options.artistId,
    artistName: song.artistName || options.artistName,
    albumId: song.albumId || resolvedAlbum?.id || options.fallbackAlbumId,
    albumName: song.albumName || resolvedAlbum?.name || options.fallbackAlbumName || song.albumName,
  };
}

export function groupLibrarySongsWithAlbumInfo(songs: Song[], albums: Album[] = []): GroupedArtistSongs[] {
  const albumMap = new Map(albums.map((album) => [album.id, album]));

  return sortGroupedArtistSongs(
    groupLibrarySongsByAlbum(songs).map((group) => {
      const albumInfo = resolveAlbumForGroup(group, albums, albumMap);

      return {
        ...group,
        key: albumInfo?.id || group.key,
        albumId: albumInfo?.id || group.albumId,
        artworkUrl: albumInfo?.artworkUrl || group.artworkUrl || group.songs[0]?.artworkUrl,
        releaseDate: albumInfo?.releaseDate,
        releaseType: albumInfo?.releaseType,
        isSingle: albumInfo?.isSingle,
      };
    })
  );
}

export function sliceGroupedArtistSongs(groups: GroupedArtistSongs[], songLimit: number): GroupedArtistSongs[] {
  if (songLimit <= 0) {
    return [];
  }

  const visibleGroups: GroupedArtistSongs[] = [];
  let remainingSongs = songLimit;

  for (const group of groups) {
    if (remainingSongs <= 0) {
      break;
    }

    const visibleSongs = group.songs.slice(0, remainingSongs);
    if (visibleSongs.length === 0) {
      continue;
    }

    visibleGroups.push({
      ...group,
      songs: visibleSongs,
    });
    remainingSongs -= visibleSongs.length;
  }

  return visibleGroups;
}
