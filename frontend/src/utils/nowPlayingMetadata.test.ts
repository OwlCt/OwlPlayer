import { describe, expect, it } from 'vitest';
import type { AlbumDetail, SongDetail } from '../types';
import { getNowPlayingReleaseDate } from './nowPlayingMetadata';

describe('getNowPlayingReleaseDate', () => {
  it('prefers the song detail release date when available', () => {
    const songDetail = {
      album: {
        id: 'album-1',
        name: 'Album',
        artworkUrl: '',
        releaseDate: '2016-06-27',
      },
    } as SongDetail;
    const albumDetail = {
      id: 'album-1',
      name: 'Album',
      artistName: 'Artist',
      artworkUrl: '',
      trackCount: 9,
      releaseDate: '2015-01-01',
    } as AlbumDetail;

    expect(getNowPlayingReleaseDate(songDetail, albumDetail)).toBe('2016-06-27');
  });

  it('falls back to album detail when the song detail release date is missing', () => {
    const songDetail = {
      album: {
        id: 'album-1',
        name: 'Album',
        artworkUrl: '',
      },
    } as SongDetail;
    const albumDetail = {
      id: 'album-1',
      name: 'Album',
      artistName: 'Artist',
      artworkUrl: '',
      trackCount: 9,
      releaseDate: '2016-06-27',
    } as AlbumDetail;

    expect(getNowPlayingReleaseDate(songDetail, albumDetail)).toBe('2016-06-27');
  });

  it('returns unknown when neither source has a release date', () => {
    expect(getNowPlayingReleaseDate(null, null)).toBe('未知');
    expect(
      getNowPlayingReleaseDate(
        {
          album: {
            id: 'album-1',
            name: 'Album',
            artworkUrl: '',
            releaseDate: '   ',
          },
        } as SongDetail,
        {
          id: 'album-1',
          name: 'Album',
          artistName: 'Artist',
          artworkUrl: '',
          trackCount: 9,
          releaseDate: '',
        } as AlbumDetail
      )
    ).toBe('未知');
  });
});
