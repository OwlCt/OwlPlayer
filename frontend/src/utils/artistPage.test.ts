import { describe, expect, it } from 'vitest';
import {
  buildArtistQueueSource,
  enrichSongForArtistNavigation,
  getFeaturedSongsHeading,
  getLibrarySongs,
  groupLibrarySongsByAlbum,
  groupLibrarySongsWithAlbumInfo,
  isArtistQueueSource,
} from './artistPage';

describe('artistPage utils', () => {
  it('switches featured title by source', () => {
    expect(getFeaturedSongsHeading('history')).toBe('你常听的歌曲');
    expect(getFeaturedSongsHeading('library_fallback')).toBe('先听这几首');
    expect(getFeaturedSongsHeading(undefined)).toBe('先听这几首');
  });

  it('prefers library songs for page-level playback', () => {
    const featuredSong = { id: 'featured-1' } as any;
    const librarySong = { id: 'library-1' } as any;

    expect(
      getLibrarySongs({
        librarySongs: [librarySong],
        featuredSongs: [featuredSong],
        topSongs: [featuredSong],
      })[0].id
    ).toBe('library-1');
  });

  it('groups library songs by album while preserving order', () => {
    const groups = groupLibrarySongsByAlbum([
      { id: '1', albumId: 'album-a', albumName: 'Album A' } as any,
      { id: '2', albumId: 'album-a', albumName: 'Album A' } as any,
      { id: '3', albumId: 'album-b', albumName: 'Album B' } as any,
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].albumName).toBe('Album A');
    expect(groups[0].songs.map((song) => song.id)).toEqual(['1', '2']);
    expect(groups[1].albumName).toBe('Album B');
  });

  it('backfills album metadata when library songs are missing album ids', () => {
    const groups = groupLibrarySongsWithAlbumInfo(
      [
        {
          id: 'song-1',
          albumName: 'Album A',
          artworkUrl: 'https://example.com/a.jpg',
        } as any,
      ],
      [
        {
          id: 'album-a',
          name: 'Album A',
          artistName: 'Artist',
          artworkUrl: 'https://example.com/a.jpg',
          releaseDate: '2024-01-01',
          trackCount: 1,
          releaseType: 'single',
          isSingle: true,
        } as any,
      ]
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('album-a');
    expect(groups[0].albumId).toBe('album-a');
    expect(groups[0].releaseDate).toBe('2024-01-01');
    expect(groups[0].releaseType).toBe('single');
    expect(groups[0].isSingle).toBe(true);
  });

  it('enriches artist-page songs with direct navigation targets before menus open', () => {
    const song = enrichSongForArtistNavigation(
      {
        id: 'song-1',
        name: 'Song A',
        artistName: '',
        albumName: 'Album A',
        duration: 180000,
        artworkUrl: 'https://example.com/a.jpg',
        hasLyrics: false,
      } as any,
      {
        artistId: 'artist-1',
        artistName: 'Artist A',
        albums: [
          {
            id: 'album-a',
            name: 'Album A',
            artistId: 'artist-1',
            artistName: 'Artist A',
            artworkUrl: 'https://example.com/a.jpg',
            trackCount: 1,
          } as any,
        ],
      }
    );

    expect(song.artistId).toBe('artist-1');
    expect(song.artistName).toBe('Artist A');
    expect(song.albumId).toBe('album-a');
  });

  it('prefers explicit fallback album targets when the song payload is incomplete', () => {
    const song = enrichSongForArtistNavigation(
      {
        id: 'song-1',
        name: 'Song A',
        artistName: 'Artist A',
        albumName: '',
        duration: 180000,
        artworkUrl: '',
        hasLyrics: false,
      } as any,
      {
        artistId: 'artist-1',
        artistName: 'Artist A',
        fallbackAlbumId: 'album-fallback',
        fallbackAlbumName: 'Fallback Album',
      }
    );

    expect(song.albumId).toBe('album-fallback');
    expect(song.albumName).toBe('Fallback Album');
  });

  it('builds queue sources with explicit variants', () => {
    const source = buildArtistQueueSource('42', 'Artist', 'library');

    expect(isArtistQueueSource(source, '42')).toBe(true);
    expect(isArtistQueueSource(source, '42', 'library')).toBe(true);
    expect(isArtistQueueSource(source, '42', 'featured')).toBe(false);
  });
});
