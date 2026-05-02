import type { AlbumDetail, Song, SongDetail } from '../types';

export interface ResolvedNowPlayingSongData {
  song: Song;
  artworkUrl: string;
  artistArtworkUrl?: string;
  motionVideoUrl?: string;
  motionTallVideoUrl?: string;
}

export function resolveNowPlayingSongData(
  currentSong: Song,
  songDetail?: SongDetail | null,
  albumDetail?: AlbumDetail | null,
  artistArtworkOverride?: string | null
): ResolvedNowPlayingSongData {
  const primaryArtist = songDetail?.artists?.[0];
  const detailAlbum = songDetail?.album;
  const artworkUrl = albumDetail?.artworkUrl || detailAlbum?.artworkUrl || currentSong.artworkUrl || '';

  return {
    song: {
      ...currentSong,
      name: songDetail?.name || currentSong.name,
      artistName: primaryArtist?.name || currentSong.artistName,
      artistId: primaryArtist?.id || currentSong.artistId,
      albumName: detailAlbum?.name || currentSong.albumName,
      albumId: detailAlbum?.id || currentSong.albumId,
      artworkUrl,
      hasLyrics: songDetail?.hasLyrics ?? currentSong.hasLyrics,
      fieldSources: songDetail?.fieldSources || currentSong.fieldSources,
    },
    artworkUrl,
    artistArtworkUrl: artistArtworkOverride || primaryArtist?.artworkUrl || albumDetail?.artists?.[0]?.artworkUrl,
    motionVideoUrl: albumDetail?.motionVideoUrl,
    motionTallVideoUrl: albumDetail?.motionTallVideoUrl,
  };
}
