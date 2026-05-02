import { describe, expect, it } from 'vitest';
import type { AlbumDetail, Song, SongDetail } from '../types';
import { resolveNowPlayingSongData } from './nowPlayingDetails';

const currentSong: Song = {
  id: 'song-1',
  name: 'Old Song',
  artistName: 'Old Artist',
  artistId: 'artist-old',
  albumName: 'Old Album',
  albumId: 'album-old',
  duration: 200000,
  artworkUrl: 'https://example.com/old-art.jpg',
  hasLyrics: false,
};

describe('resolveNowPlayingSongData', () => {
  it('prefers local song and album detail values over current song snapshot', () => {
    const songDetail: SongDetail = {
      ...currentSong,
      name: 'Local Song',
      artistName: 'Ignored Artist Name',
      hasLyrics: true,
      credits: {},
      album: {
        id: 'album-local',
        name: 'Local Album',
        artworkUrl: 'https://example.com/song-detail-album.jpg',
      },
      artists: [
        {
          id: 'artist-local',
          name: 'Local Artist',
          artworkUrl: 'https://example.com/artist-local.jpg',
        },
      ],
    };
    const albumDetail: AlbumDetail = {
      id: 'album-local',
      name: 'Local Album',
      artistName: 'Local Artist',
      artistId: 'artist-local',
      artworkUrl: '/api/artwork/album/42',
      trackCount: 10,
      motionVideoUrl: '/api/artwork/album/42/motion',
      artists: [
        {
          id: 'artist-local',
          name: 'Local Artist',
          artworkUrl: '/api/artwork/artist/7',
        },
      ],
    };

    const resolved = resolveNowPlayingSongData(currentSong, songDetail, albumDetail);

    expect(resolved.song.name).toBe('Local Song');
    expect(resolved.song.artistName).toBe('Local Artist');
    expect(resolved.song.artistId).toBe('artist-local');
    expect(resolved.song.albumName).toBe('Local Album');
    expect(resolved.song.albumId).toBe('album-local');
    expect(resolved.song.artworkUrl).toBe('/api/artwork/album/42');
    expect(resolved.song.hasLyrics).toBe(true);
    expect(resolved.artistArtworkUrl).toBe('https://example.com/artist-local.jpg');
    expect(resolved.motionVideoUrl).toBe('/api/artwork/album/42/motion');
  });

  it('falls back to current song snapshot when detail data is unavailable', () => {
    const resolved = resolveNowPlayingSongData(currentSong, null, null);

    expect(resolved.song).toEqual(currentSong);
    expect(resolved.artworkUrl).toBe(currentSong.artworkUrl);
    expect(resolved.artistArtworkUrl).toBeUndefined();
    expect(resolved.motionVideoUrl).toBeUndefined();
  });

  it('uses explicit artist artwork override first', () => {
    const songDetail: SongDetail = {
      ...currentSong,
      credits: {},
      artists: [
        {
          id: 'artist-local',
          name: 'Local Artist',
          artworkUrl: 'https://example.com/artist-local.jpg',
        },
      ],
    };

    const resolved = resolveNowPlayingSongData(
      currentSong,
      songDetail,
      null,
      'blob:https://example.com/cached-artist-art'
    );

    expect(resolved.artistArtworkUrl).toBe('blob:https://example.com/cached-artist-art');
  });

  it('falls back to album detail artist artwork when song detail artist artwork is missing', () => {
    const songDetail: SongDetail = {
      ...currentSong,
      credits: {},
      artists: [
        {
          id: 'artist-local',
          name: 'Local Artist',
        },
      ],
    };
    const albumDetail: AlbumDetail = {
      id: 'album-local',
      name: 'Local Album',
      artistName: 'Local Artist',
      artistId: 'artist-local',
      artworkUrl: '/api/artwork/album/42',
      trackCount: 10,
      artists: [
        {
          id: 'artist-local',
          name: 'Local Artist',
          artworkUrl: '/api/artwork/artist/7',
        },
      ],
    };

    const resolved = resolveNowPlayingSongData(currentSong, songDetail, albumDetail);

    expect(resolved.artistArtworkUrl).toBe('/api/artwork/artist/7');
  });
});
