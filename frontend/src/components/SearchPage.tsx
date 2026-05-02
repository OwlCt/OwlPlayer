import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiLoader } from 'react-icons/fi';
import { searchWithTopResults, searchPaginated, getAlbumDetail, getArtistDetail } from '../api';
import { SearchResultWithTop, Song, Album, Artist, SearchFilterTab, TopResultItem, BestMatchItem } from '../types';
import { usePlayerStore } from '../store/playerStore';
import { useRecentlyPlayedStore } from '../store/recentlyPlayedStore';
import { useNavigationStore } from '../store/navigationStore';
import { useSearchHistoryStore } from '../store/searchHistoryStore';
import SongCard from './SongCard';
import AlbumCard from './AlbumCard';
import ArtistCard from './ArtistCard';
import FilterTabBar from './FilterTabBar';
import BestMatchCard from './BestMatchCard';
import ScrollableCardRow from './ScrollableCardRow';
import { buildArtistQueueSource, getLibrarySongs } from '../utils/artistPage';
import { prefetchArtworks, prefetchArtistImages } from '../utils/imagePrefetch';

const ITEMS_PER_PAGE = 20;
const INITIAL_RECORDS_DISPLAY = 15; // 唱片分类首次加载数量
const SONGS_DISPLAY = 4;  // Show 4 songs in the first row alongside best match

/**
 * Convert TopResultItem from API to BestMatchItem for BestMatchCard component
 */
function topResultToBestMatch(topResult: TopResultItem): BestMatchItem {
  return {
    type: topResult.type,
    id: topResult.id,
    name: topResult.name,
    subtitle: topResult.subtitle,
    imageUrl: topResult.artworkUrl,
    isCircular: topResult.type === 'artist',
  };
}

/**
 * Get best match from search results
 * Uses order[0] to determine which type should be the best match
 */
function getBestMatchFromResults(results: SearchResultWithTop): BestMatchItem | null {
  // If API provides topResults, use the first one
  if (results.topResults && results.topResults.length > 0) {
    return topResultToBestMatch(results.topResults[0]);
  }

  // Use order array to determine best match type
  const order = results.order || ['songs', 'artists', 'albums'];
  const firstType = order[0];

  // Get the first item of the first type in order
  switch (firstType) {
    case 'songs':
      if (results.songs && results.songs.length > 0) {
        const song = results.songs[0];
        return {
          type: 'song',
          id: song.id,
          name: song.name,
          subtitle: song.artistName,
          imageUrl: song.artworkUrl,
          isCircular: false,
        };
      }
      break;
    case 'artists':
      if (results.artists && results.artists.length > 0) {
        const artist = results.artists[0];
        return {
          type: 'artist',
          id: artist.id,
          name: artist.name,
          subtitle: artist.genres?.[0] || '',
          imageUrl: artist.artworkUrl,
          isCircular: true,
        };
      }
      break;
    case 'albums':
      if (results.albums && results.albums.length > 0) {
        const album = results.albums[0];
        return {
          type: 'album',
          id: album.id,
          name: album.name,
          subtitle: album.artistName,
          imageUrl: album.artworkUrl,
          isCircular: false,
        };
      }
      // Fallback to singlesAndEPs if no albums
      if (results.singlesAndEPs && results.singlesAndEPs.length > 0) {
        const album = results.singlesAndEPs[0];
        return {
          type: 'album',
          id: album.id,
          name: album.name,
          subtitle: album.artistName,
          imageUrl: album.artworkUrl,
          isCircular: false,
        };
      }
      break;
  }

  // Fallback: try each type in order until we find one with results
  for (const type of order) {
    switch (type) {
      case 'songs':
        if (results.songs && results.songs.length > 0) {
          const song = results.songs[0];
          return {
            type: 'song',
            id: song.id,
            name: song.name,
            subtitle: song.artistName,
            imageUrl: song.artworkUrl,
            isCircular: false,
          };
        }
        break;
      case 'artists':
        if (results.artists && results.artists.length > 0) {
          const artist = results.artists[0];
          return {
            type: 'artist',
            id: artist.id,
            name: artist.name,
            subtitle: artist.genres?.[0] || '',
            imageUrl: artist.artworkUrl,
            isCircular: true,
          };
        }
        break;
      case 'albums':
        if (results.albums && results.albums.length > 0) {
          const album = results.albums[0];
          return {
            type: 'album',
            id: album.id,
            name: album.name,
            subtitle: album.artistName,
            imageUrl: album.artworkUrl,
            isCircular: false,
          };
        }
        if (results.singlesAndEPs && results.singlesAndEPs.length > 0) {
          const album = results.singlesAndEPs[0];
          return {
            type: 'album',
            id: album.id,
            name: album.name,
            subtitle: album.artistName,
            imageUrl: album.artworkUrl,
            isCircular: false,
          };
        }
        break;
    }
  }

  return null;
}

export default function SearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { searchQuery, searchResults, setSearchState } = useNavigationStore();
  
  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<SearchResultWithTop | null>(
    searchResults ? (searchResults as SearchResultWithTop) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SearchFilterTab>('all');
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  
  // Pagination state for filtered views
  const [filteredSongs, setFilteredSongs] = useState<Song[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<Artist[]>([]);
  const [filteredAlbums, setFilteredAlbums] = useState<Album[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  // Ref for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  const { setQueue, isPlaying, queueSource, pause, play, currentSong } = usePlayerStore();
  const { recordPlay } = useRecentlyPlayedStore();
  const { addItem: addSearchHistoryItem } = useSearchHistoryStore();

  // Clear selection when clicking outside song cards
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't clear selection if clicking inside a context menu
      if (target.closest('[class*="bg-[#282828]"]')) {
        return;
      }
      // Check if click is inside a song card (has data-song-card attribute or is child of one)
      if (!target.closest('[data-song-card]')) {
        setSelectedSongId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!results) return;

    const topSongs = results.topResults?.filter(item => item.type === 'song') || [];
    const topAlbums = results.topResults?.filter(item => item.type === 'album') || [];
    const topArtists = results.topResults?.filter(item => item.type === 'artist') || [];

    prefetchArtworks([...(results.songs || []), ...filteredSongs, ...topSongs], [80, 300]);
    prefetchArtworks(
      [
        ...(results.albums || []),
        ...(results.singlesAndEPs || []),
        ...filteredAlbums,
        ...topAlbums,
      ],
      [240, 300]
    );
    prefetchArtistImages([...(results.artists || []), ...filteredArtists, ...topArtists], [300]);
  }, [results, filteredSongs, filteredAlbums, filteredArtists]);

  // Execute search function - now uses searchWithTopResults for Best Match and section ordering
  const executeSearch = useCallback(async (searchTerm: string) => {
    if (!searchTerm.trim()) return;

    setLoading(true);
    setError(null);
    setActiveTab('all');

    try {
      const data = await searchWithTopResults(searchTerm);
      setResults(data);
      setSearchState(searchTerm, data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [setSearchState]);

  // Handle URL query parameter on mount and when it changes
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    if (urlQuery) {
      const decodedQuery = decodeURIComponent(urlQuery);
      setQuery(decodedQuery);
      if (decodedQuery !== searchQuery || !searchResults) {
        executeSearch(decodedQuery);
      } else if (searchResults) {
        setResults(searchResults as SearchResultWithTop);
      }
    } else if (searchQuery && searchResults) {
      setQuery(searchQuery);
      setResults(searchResults as SearchResultWithTop);
    }
  }, [searchParams, searchQuery, searchResults, executeSearch]);

  // Load initial items for records tab to ensure minimum display count
  const loadInitialRecords = useCallback(async () => {
    if (!query) return;
    
    setLoadingMore(true);
    try {
      // Load more items to ensure we have enough
      const result = await searchPaginated(query, 'albums', 0, INITIAL_RECORDS_DISPLAY);
      const allAlbums = result.items as Album[];
      
      setFilteredAlbums(allAlbums.slice(0, INITIAL_RECORDS_DISPLAY));
      setHasMore(result.hasMore || allAlbums.length > INITIAL_RECORDS_DISPLAY);
    } catch (err) {
      console.error('Failed to load initial records:', err);
      // Fallback to existing data - combine albums and singlesAndEPs
      const combined = [...(results?.albums || []), ...(results?.singlesAndEPs || [])];
      setFilteredAlbums(combined);
    } finally {
      setLoadingMore(false);
    }
  }, [query, results]);

  // Reset filtered items when tab changes or results change
  useEffect(() => {
    if (!results) return;
    
    // Reset album API offset when tab changes
    albumApiOffsetRef.current = 0;
    
    if (activeTab === 'songs') {
      setFilteredSongs(results.songs || []);
      setHasMore(true);
    } else if (activeTab === 'artists') {
      setFilteredArtists(results.artists || []);
      setHasMore(true);
    } else if (activeTab === 'records') {
      // 唱片分类首次加载15个
      loadInitialRecords();
    }
  }, [activeTab, results, loadInitialRecords]);

  // Track the API offset separately for albums (since we filter client-side)
  const albumApiOffsetRef = useRef(0);
  
  // Load more items for filtered view
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || activeTab === 'all' || !query) return;

    setLoadingMore(true);
    try {
      let offset = 0;
      let type: 'songs' | 'albums' | 'artists' = 'songs';
      
      if (activeTab === 'songs') {
        offset = filteredSongs.length;
        type = 'songs';
      } else if (activeTab === 'artists') {
        offset = filteredArtists.length;
        type = 'artists';
      } else if (activeTab === 'records') {
        offset = albumApiOffsetRef.current;
        type = 'albums';
      }

      const result = await searchPaginated(query, type, offset, ITEMS_PER_PAGE);
      const newItems = result.items;

      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        if (activeTab === 'songs') {
          setFilteredSongs(prev => [...prev, ...(newItems as Song[])]);
          setHasMore(result.hasMore);
        } else if (activeTab === 'artists') {
          setFilteredArtists(prev => [...prev, ...(newItems as Artist[])]);
          setHasMore(result.hasMore);
        } else if (activeTab === 'records') {
          const allAlbums = newItems as Album[];
          albumApiOffsetRef.current += allAlbums.length;
          setFilteredAlbums(prev => [...prev, ...allAlbums]);
          setHasMore(result.hasMore);
        }
      }
    } catch (err) {
      console.error('Failed to load more items:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, activeTab, query, filteredSongs.length, filteredArtists.length]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (activeTab === 'all') return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [activeTab, hasMore, loadingMore, loadMore]);

  // Record search history for song
  const recordSongToHistory = (song: Song) => {
    addSearchHistoryItem({
      type: 'song',
      id: song.id,
      name: song.name,
      subtitle: `歌曲 · ${song.artistName}`,
      artworkUrl: song.artworkUrl,
      artistId: song.artistId,
      artistName: song.artistName,
      albumId: song.albumId,
    });
  };

  // Record search history for album
  const recordAlbumToHistory = (album: Album) => {
    addSearchHistoryItem({
      type: 'album',
      id: album.id,
      name: album.name,
      subtitle: `专辑 · ${album.artistName}`,
      artworkUrl: album.artworkUrl,
      artistId: album.artistId,
      artistName: album.artistName,
    });
  };

  // Record search history for artist
  const recordArtistToHistory = (artist: Artist) => {
    addSearchHistoryItem({
      type: 'artist',
      id: artist.id,
      name: artist.name,
      subtitle: '艺术家',
      artworkUrl: artist.artworkUrl,
    });
  };

  const handlePlaySong = (song: Song, allSongs: Song[]) => {
    recordSongToHistory(song);
    const index = allSongs.findIndex(s => s.id === song.id);
    setQueue(allSongs, index, { type: 'search', id: null, name: '搜索结果' });
  };

  const handleAlbumClick = (album: Album) => {
    recordAlbumToHistory(album);
    navigate(`/album/${album.id}`);
  };

  // Check if a specific album is currently playing
  const isAlbumPlaying = (albumId: string) => {
    return isPlaying && queueSource.type === 'album' && queueSource.id === albumId;
  };

  // Check if a specific album is the current queue source (playing or paused)
  const isAlbumCurrentSource = (albumId: string) => {
    return queueSource.type === 'album' && queueSource.id === albumId;
  };

  // Check if a specific artist is currently playing
  const isArtistPlaying = (artistId: string) => {
    return isPlaying && queueSource.type === 'artist' && queueSource.id === artistId;
  };

  // Check if a specific artist is the current queue source (playing or paused)
  const isArtistCurrentSource = (artistId: string) => {
    return queueSource.type === 'artist' && queueSource.id === artistId;
  };

  // Check if current queue source is search
  const isCurrentSearchSource = queueSource.type === 'search';

  const handlePlayAlbum = async (album: Album) => {
    // Record play for recently played sorting
    recordPlay('album', album.id);
    // If this album is already the current source, just resume playback
    if (isAlbumCurrentSource(album.id)) {
      play();
      return;
    }
    
    // Otherwise, load the album and start playing from the beginning
    try {
      const albumDetail = await getAlbumDetail(album.id);
      if (albumDetail.tracks && albumDetail.tracks.length > 0) {
        setQueue(albumDetail.tracks, 0, { type: 'album', id: album.id, name: albumDetail.name });
      }
    } catch (err) {
      console.error('Failed to load album tracks:', err);
    }
  };

  const handlePlayArtist = async (artist: Artist) => {
    // Record play for recently played sorting
    recordPlay('artist', artist.id);
    // If this artist is already the current source, just resume playback
    if (isArtistCurrentSource(artist.id)) {
      play();
      return;
    }
    
    // Otherwise, load the artist's top songs and start playing
      try {
        const artistDetail = await getArtistDetail(artist.id);
        const songs = getLibrarySongs(artistDetail);
        if (songs.length > 0) {
          setQueue(songs, 0, buildArtistQueueSource(artist.id, artistDetail.name, 'library'));
        }
      } catch (err) {
      console.error('Failed to load artist top songs:', err);
    }
  };

  const handleArtistClick = (artist: Artist) => {
    recordArtistToHistory(artist);
    navigate(`/artist/${artist.id}`);
  };

  const handleBestMatchClick = () => {
    if (!results) return;
    
    const bestMatch = getBestMatchFromResults(results);
    if (!bestMatch) return;

    switch (bestMatch.type) {
      case 'artist': {
        const artist = results.artists?.find(a => a.id === bestMatch.id);
        if (artist) recordArtistToHistory(artist);
        navigate(`/artist/${bestMatch.id}`);
        break;
      }
      case 'album': {
        const album = [...(results.albums || []), ...(results.singlesAndEPs || [])].find(a => a.id === bestMatch.id);
        if (album) recordAlbumToHistory(album);
        navigate(`/album/${bestMatch.id}`);
        break;
      }
      case 'song': {
        const song = results.songs?.find(s => s.id === bestMatch.id);
        if (song) handlePlaySong(song, results.songs || []);
        break;
      }
    }
  };

  const handleBestMatchPlay = async () => {
    if (!results) return;
    
    const bestMatch = getBestMatchFromResults(results);
    if (!bestMatch) return;

    switch (bestMatch.type) {
      case 'song': {
        const song = results.songs?.find(s => s.id === bestMatch.id);
        if (song) handlePlaySong(song, results.songs || []);
        break;
      }
      case 'album': {
        const album = [...(results.albums || []), ...(results.singlesAndEPs || [])].find(a => a.id === bestMatch.id);
        if (album) await handlePlayAlbum(album);
        break;
      }
      case 'artist': {
        const artist = results.artists?.find(a => a.id === bestMatch.id);
        if (artist) await handlePlayArtist(artist);
        break;
      }
    }
  };

  // Check if best match is currently playing
  const isBestMatchPlaying = () => {
    if (!results) return false;
    
    const bestMatch = getBestMatchFromResults(results);
    if (!bestMatch) return false;

    switch (bestMatch.type) {
      case 'song':
        // Must check both: queue source is search AND current song matches the best match song
        return isPlaying && isCurrentSearchSource && currentSong?.id === bestMatch.id;
      case 'album':
        return isAlbumPlaying(bestMatch.id);
      case 'artist':
        return isArtistPlaying(bestMatch.id);
      default:
        return false;
    }
  };

  // Render functions
  const renderSongItem = (song: Song, index: number, showAlbum = false) => (
    <SongCard
      key={song.id}
      song={song}
      onPlay={() => handlePlaySong(song, results?.songs || [])}
      showIndex={index + 1}
      showAlbum={showAlbum}
      isSelected={selectedSongId === song.id}
      onSelect={setSelectedSongId}
      isCurrentSource={isCurrentSearchSource}
    />
  );

  const renderAlbumItem = (album: Album, _index: number) => (
    <AlbumCard 
      key={album.id}
      album={album} 
      isPlaying={isAlbumPlaying(album.id)}
      onPlay={() => handlePlayAlbum(album)}
      onPause={pause}
      onCardClick={handleAlbumClick}
    />
  );

  const renderArtistItem = (artist: Artist, _index: number) => (
    <div key={artist.id} onClick={() => handleArtistClick(artist)}>
      <ArtistCard
        artist={artist}
        isPlaying={isArtistPlaying(artist.id)}
        onPlay={() => handlePlayArtist(artist)}
        onPause={pause}
      />
    </div>
  );

  // Check if we have results for each category
  const hasResults = {
    songs: (results?.songs?.length ?? 0) > 0,
    artists: (results?.artists?.length ?? 0) > 0,
    records: (results?.albums?.length ?? 0) > 0 || (results?.singlesAndEPs?.length ?? 0) > 0,
  };

  const hasAnyResults = hasResults.songs || hasResults.artists || hasResults.records;

  // Render load more indicator
  const renderLoadMoreIndicator = () => (
    <div ref={loadMoreRef} className="py-8 flex justify-center">
      {loadingMore && (
        <div className="flex items-center gap-2 text-white/60">
          <FiLoader className="animate-spin" size={20} />
          <span>加载中...</span>
        </div>
      )}
      {!loadingMore && !hasMore && (
        <span className="text-white/40">没有更多了</span>
      )}
    </div>
  );

  // Render filtered view based on active tab
  const renderFilteredView = () => {
    if (!results) return null;

    switch (activeTab) {
      case 'songs':
        return (
          <section>
            <h2 className="text-2xl font-bold mb-4">歌曲</h2>
            <div className="space-y-1">
              {filteredSongs.map((song, index) => renderSongItem(song, index, true))}
            </div>
            {renderLoadMoreIndicator()}
          </section>
        );
      case 'artists':
        return (
          <section>
            <h2 className="text-2xl font-bold mb-4">艺术家</h2>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {filteredArtists.map((artist, index) => renderArtistItem(artist, index))}
            </div>
            {renderLoadMoreIndicator()}
          </section>
        );
      case 'records':
        return (
          <section>
            <h2 className="text-2xl font-bold mb-4">唱片</h2>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {filteredAlbums.map((album, index) => renderAlbumItem(album, index))}
            </div>
            {renderLoadMoreIndicator()}
          </section>
        );
      default:
        return renderAllView();
    }
  };

  // Render "All" view with new layout
  // Best Match is the first result from search (artist > album > song priority)
  const renderAllView = () => {
    if (!results) return null;
    
    // Get best match from results (uses topResults if available, otherwise first result)
    const bestMatch = getBestMatchFromResults(results);

    return (
      <div className="space-y-8">
        {/* Row 1: Best Match + Songs */}
        {(bestMatch || hasResults.songs) && (
          <div className="flex flex-col min-[1500px]:flex-row gap-6">
            {/* Best Match Card */}
            {bestMatch && (
              <div className="w-full max-w-[400px] min-[1500px]:w-[340px] min-[1500px]:flex-shrink-0">
                <h2 className="text-2xl font-bold mb-4">热门结果</h2>
                <BestMatchCard
                  item={bestMatch}
                  onClick={handleBestMatchClick}
                  onPlay={handleBestMatchPlay}
                  onPause={pause}
                  isPlaying={isBestMatchPlaying()}
                />
              </div>
            )}
            {/* Songs List */}
            {hasResults.songs && (
              <div className="flex-1 min-w-0">
                <h2 
                  className="text-2xl font-bold mb-4 cursor-pointer hover:underline inline-block"
                  onClick={() => setActiveTab('songs')}
                >
                  歌曲
                </h2>
                <div className="space-y-2">
                  {results.songs.slice(0, SONGS_DISPLAY).map((song, index) => renderSongItem(song, index))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Artists section - always after Best Match + Songs row */}
        {hasResults.artists && (
          <section style={{ marginLeft: '-32px', marginRight: '-32px' }}>
            <h2 
              className="text-2xl font-bold mb-4 cursor-pointer hover:underline inline-block"
              style={{ paddingLeft: '32px', paddingRight: '32px' }}
              onClick={() => setActiveTab('artists')}
            >
              艺术家
            </h2>
            <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
              {results.artists.slice(0, 10).map((artist, index) => renderArtistItem(artist, index))}
            </ScrollableCardRow>
          </section>
        )}

        {/* Records section - combined albums and singles/EPs in API order */}
        {hasResults.records && (
          <section style={{ marginLeft: '-32px', marginRight: '-32px' }}>
            <h2 
              className="text-2xl font-bold mb-4 cursor-pointer hover:underline inline-block"
              style={{ paddingLeft: '32px', paddingRight: '32px' }}
              onClick={() => setActiveTab('records')}
            >
              唱片
            </h2>
            <ScrollableCardRow cardWidth={200} gap={16} edgePadding={32}>
              {[...(results.albums || []), ...(results.singlesAndEPs || [])].slice(0, 10).map((album, index) => renderAlbumItem(album, index))}
            </ScrollableCardRow>
          </section>
        )}
      </div>
    );
  };

  return (
    <div className="p-8">
      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-spotify-green border-t-transparent" />
        </div>
      )}

      {/* Error state - Requirements 7.2: Display error message to user */}
      {error && !loading && (
        <div className="text-center py-12">
          <div className="text-red-400 mb-2">搜索出错了</div>
          <div className="text-spotify-light-gray text-sm">{error}</div>
        </div>
      )}

      {/* Results */}
      {results && !loading && (
        <>
          {/* Filter Tab Bar */}
          <FilterTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasResults={hasResults}
          />

          {/* Filtered Results */}
          {hasAnyResults ? (
            renderFilteredView()
          ) : (
            <div className="text-center py-12 text-spotify-light-gray">
              未找到 "{query}" 的相关结果
            </div>
          )}
        </>
      )}

      {/* Initial state */}
      {!results && !loading && (
        <div className="text-center py-12 text-spotify-light-gray">
          搜索歌曲、专辑或艺术家
        </div>
      )}
    </div>
  );
}
