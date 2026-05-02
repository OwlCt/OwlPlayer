import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FiSearch, FiX, FiLoader, FiMoreHorizontal } from 'react-icons/fi';
import { IoClose } from 'react-icons/io5';
import { searchWithTopResults, searchPaginated } from '../../api';
import {
  SearchResultWithTop,
  Song,
  Album,
  Artist,
  ContentSuggestion,
  TermSuggestion,
  TopResultItem,
  BestMatchItem,
} from '../../types';
import { usePlayerStore } from '../../store/playerStore';
import { useNavigationStore } from '../../store/navigationStore';
import { useSearchHistoryStore, SearchHistoryItem } from '../../store/searchHistoryStore';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useBottomPadding } from '../../hooks/useBottomPadding';
import CachedImage from '../CachedImage';
import { getProxiedImageUrl } from '../../utils/image';
import { prefetchArtworks, prefetchArtistImages } from '../../utils/imagePrefetch';
import { useTouchClick } from '../../hooks/useTouchClick';
import LikeButton from '../LikeButton';
import AlbumSaveButton from '../AlbumSaveButton';
import FollowButton from '../FollowButton';
import MobileSongMenu from './MobileSongMenu';
import OfflineModeIcon from '../icons/OfflineModeIcon';

/**
 * Convert TopResultItem from API to BestMatchItem
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
 */
function getBestMatchFromResults(results: SearchResultWithTop): BestMatchItem | null {
  // If API provides topResults, use the first one
  if (results.topResults && results.topResults.length > 0) {
    return topResultToBestMatch(results.topResults[0]);
  }

  // Use order array to determine best match type
  const order = results.order || ['songs', 'artists', 'albums'];
  
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

/**
 * Mobile search result item component
 * Renders a single-column touch-optimized result row
 * Minimum touch target: 44px (Requirements: 4.2)
 */
interface MobileSearchResultItemProps {
  type: 'song' | 'album' | 'artist';
  id: string;
  name: string;
  subtitle: string;
  artworkUrl: string;
  isCircular?: boolean;
  contentRating?: string;
  onClick: () => void;
  // For action buttons
  song?: Song;
  album?: Album;
  artistInfo?: { id: string; name: string; artworkUrl?: string };
  onMenuClick?: () => void;
}

function MobileSearchResultItem({
  type,
  name,
  subtitle,
  artworkUrl,
  isCircular = false,
  contentRating,
  onClick,
  song,
  album,
  artistInfo,
  onMenuClick,
}: MobileSearchResultItemProps) {
  const touchHandlers = useTouchClick(onClick);
  const isExplicit = contentRating === 'explicit';

  const handleMenuClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    onMenuClick?.();
  };

  return (
    <div
      {...touchHandlers}
      className="flex items-center gap-3 w-full py-3 text-left min-h-[56px] select-none cursor-pointer"
      data-testid="mobile-search-result-item"
    >
      {/* Artwork */}
      <div
        className={`w-12 h-12 flex-shrink-0 bg-neutral-800 overflow-hidden ${
          isCircular ? 'rounded-full' : 'rounded'
        }`}
      >
        {artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(artworkUrl, 96)}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            {type === 'artist' ? '👤' : '♪'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-white font-medium truncate">{name}</span>
          {isExplicit && (
            <span className="flex-shrink-0 w-4 h-4 bg-white/20 rounded-sm text-[9px] text-white/80 flex items-center justify-center font-medium">
              E
            </span>
          )}
        </div>
        <div className="text-sm text-white/60 truncate">{subtitle}</div>
      </div>

      {/* Action buttons - stop propagation to prevent parent touch handlers */}
      <div 
        className="flex items-center gap-2 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
      >
        {/* Song: Menu button + Like button (only when liked) */}
        {type === 'song' && song && (
          <>
            <button
              onClick={handleMenuClick}
              className="p-2 text-white/60 hover:text-white"
              aria-label="更多选项"
            >
              <FiMoreHorizontal className="w-5 h-5" />
            </button>
            <LikeButton song={song} size="md" showOnHover={false} forceShow enableTooltip={false} onlyWhenLiked />
          </>
        )}
        {/* Album: Save button */}
        {type === 'album' && album && (
          <AlbumSaveButton album={album} size={20} enableTooltip={false} />
        )}
        {/* Artist: Follow button */}
        {type === 'artist' && artistInfo && (
          <FollowButton
            artistId={artistInfo.id}
            artistName={artistInfo.name}
            artworkUrl={artistInfo.artworkUrl}
            className="text-xs px-3 py-1"
          />
        )}
      </div>
    </div>
  );
}


/**
 * Mobile search history item component
 * Similar to MobileSearchResultItem but with delete button
 */
interface MobileSearchHistoryItemProps {
  item: SearchHistoryItem;
  onClick: () => void;
  onDelete: () => void;
}

function MobileSearchHistoryItem({
  item,
  onClick,
  onDelete,
}: MobileSearchHistoryItemProps) {
  const isArtist = item.type === 'artist';
  const touchHandlers = useTouchClick(onClick);
  const deleteTouchHandlers = useTouchClick(onDelete);

  // Wrap delete touch handlers to stop propagation
  const handleDeleteTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    deleteTouchHandlers.onTouchStart(e);
  };

  const handleDeleteTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    deleteTouchHandlers.onTouchMove(e);
  };

  const handleDeleteTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    deleteTouchHandlers.onTouchEnd(e);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteTouchHandlers.onClick(e);
  };

  return (
    <div
      {...touchHandlers}
      className="flex items-center gap-3 w-full py-3 text-left min-h-[56px] cursor-pointer select-none"
      data-testid="mobile-search-history-item"
    >
      {/* Artwork */}
      <div
        className={`w-12 h-12 flex-shrink-0 bg-neutral-800 overflow-hidden ${
          isArtist ? 'rounded-full' : 'rounded'
        }`}
      >
        {item.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(item.artworkUrl, 96)}
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            {isArtist ? '👤' : '♪'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{item.name}</div>
        <div className="text-sm text-white/60 truncate">{item.subtitle}</div>
      </div>

      {/* Delete button - uses separate touch handlers with stopPropagation */}
      <button
        onTouchStart={handleDeleteTouchStart}
        onTouchMove={handleDeleteTouchMove}
        onTouchEnd={handleDeleteTouchEnd}
        onClick={handleDeleteClick}
        className="p-2 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="删除搜索记录"
      >
        <IoClose className="w-5 h-5 text-white/60" />
      </button>
    </div>
  );
}


/**
 * Browse category card component
 * Displays genre/category cards when search is empty
 * Spotify-style card with background color, tilted image, and text overlay
 */
interface BrowseCategoryCardProps {
  name: string;
  color: string;
  imageUrl?: string;
  onClick: () => void;
}

function BrowseCategoryCard({ name, color, imageUrl, onClick }: BrowseCategoryCardProps) {
  return (
    <button
      onClick={onClick}
      className="relative h-[100px] rounded-lg overflow-hidden text-left min-h-[44px] w-full"
      style={{ backgroundColor: color }}
    >
      {/* Category name - top left */}
      <span className="absolute top-3 left-3 text-white font-bold text-base z-10 drop-shadow-md">
        {name}
      </span>
      {/* Image - bottom right, rotated */}
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          draggable="false"
          loading="lazy"
          className="absolute -bottom-1 -right-4 w-[70px] h-[70px] object-cover rounded shadow-lg"
          style={{ transform: 'rotate(25deg)' }}
        />
      )}
    </button>
  );
}

// Browse categories with colors and images (Spotify-style)
const BROWSE_CATEGORIES = [
  { name: '流行', color: 'rgb(220, 20, 140)', query: '流行', imageUrl: '/images/genres/pop.jpg' },
  { name: '嘻哈', color: 'rgb(71, 125, 149)', query: '嘻哈', imageUrl: '/images/genres/hiphop.jpg' },
  { name: '摇滚', color: 'rgb(0, 100, 80)', query: '摇滚', imageUrl: '/images/genres/rock.jpg' },
  { name: '电子', color: 'rgb(71, 125, 149)', query: '电子', imageUrl: '/images/genres/electronic.jpg' },
  { name: '古典', color: 'rgb(125, 75, 50)', query: '古典', imageUrl: '/images/genres/classical.jpg' },
  { name: '爵士', color: 'rgb(141, 103, 171)', query: '爵士', imageUrl: '/images/genres/jazz.jpg' },
  { name: 'R&B', color: 'rgb(186, 93, 7)', query: 'R&B', imageUrl: '/images/genres/rnb.jpg' },
  { name: '民谣', color: 'rgb(188, 89, 0)', query: '民谣', imageUrl: '/images/genres/folk.jpg' },
];

// Search filter tabs (null means no filter / show all)
type MobileSearchFilterTab = 'songs' | 'artists' | 'albums' | null;

const SEARCH_FILTER_TABS: { value: Exclude<MobileSearchFilterTab, null>; label: string }[] = [
  { value: 'songs', label: '歌曲' },
  { value: 'artists', label: '艺人' },
  { value: 'albums', label: '唱片' },
];

/**
 * Mobile term suggestion item component
 */
interface MobileTermSuggestionItemProps {
  term: TermSuggestion;
  onClick: () => void;
}

function MobileTermSuggestionItem({ term, onClick }: MobileTermSuggestionItemProps) {
  const touchHandlers = useTouchClick(onClick);

  return (
    <button
      {...touchHandlers}
      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors text-left min-h-[48px] select-none"
    >
      <FiSearch className="w-5 h-5 text-white/40 flex-shrink-0" />
      <span className="text-white truncate">{term.displayTerm}</span>
    </button>
  );
}

/**
 * Mobile content suggestion item component
 */
interface MobileContentSuggestionItemProps {
  content: ContentSuggestion;
  onClick: () => void;
}

function MobileContentSuggestionItem({ content, onClick }: MobileContentSuggestionItemProps) {
  const touchHandlers = useTouchClick(onClick);
  const isArtist = content.type === 'artist';

  const getTypeLabel = (type: ContentSuggestion['type']) => {
    switch (type) {
      case 'artist':
        return '艺术家';
      case 'album':
        return '专辑';
      case 'song':
        return '歌曲';
      default:
        return '';
    }
  };

  return (
    <button
      {...touchHandlers}
      className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors text-left min-h-[56px] select-none"
    >
      {/* Artwork */}
      <div
        className={`w-10 h-10 flex-shrink-0 bg-neutral-800 overflow-hidden ${
          isArtist ? 'rounded-full' : 'rounded'
        }`}
      >
        {content.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(content.artworkUrl, 80)}
            alt={content.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40">
            {isArtist ? '👤' : '♪'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{content.name}</div>
        <div className="text-sm text-white/60 truncate">
          {getTypeLabel(content.type)}
          {content.subtitle && ` · ${content.subtitle}`}
        </div>
      </div>
    </button>
  );
}

/**
 * Mobile Best Match Card component
 * Displays the top/best match result at the top of search results
 */
interface MobileBestMatchCardProps {
  item: BestMatchItem;
  onClick: () => void;
  // For song type - pass the full song object for LikeButton
  song?: Song;
  // For album type - pass the full album object for AlbumSaveButton
  album?: Album;
  // For artist type - pass artist info for FollowButton
  artistInfo?: { id: string; name: string; artworkUrl?: string };
}

const typeLabels: Record<BestMatchItem['type'], string> = {
  artist: '艺术家',
  album: '专辑',
  song: '歌曲',
};

function MobileBestMatchCard({ item, onClick, song, album, artistInfo }: MobileBestMatchCardProps) {
  const touchHandlers = useTouchClick(onClick);

  return (
    <div
      {...touchHandlers}
      className="bg-neutral-800/50 p-4 rounded-xl active:bg-neutral-700/50 transition-colors relative"
      data-testid="mobile-best-match-card"
    >
      <div className="flex items-center gap-4">
        {/* Artwork - larger for best match */}
        <div
          className={`w-20 h-20 flex-shrink-0 bg-neutral-700 overflow-hidden shadow-lg ${
            item.isCircular ? 'rounded-full' : 'rounded-lg'
          }`}
        >
          {item.imageUrl ? (
            <CachedImage
              src={getProxiedImageUrl(item.imageUrl, 160)}
              alt={item.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-3xl text-white/20">
              ♪
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-lg text-white truncate">{item.name}</h3>
          <p className="text-sm text-white/60 truncate">
            {item.subtitle && <span>{item.subtitle} · </span>}
            {typeLabels[item.type]}
          </p>
        </div>

        {/* Action button based on type - stop propagation to prevent parent touch handlers */}
        <div 
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {item.type === 'song' && song && (
            <LikeButton song={song} size="md" showOnHover={false} forceShow enableTooltip={false} onlyWhenLiked />
          )}
          {item.type === 'album' && album && (
            <AlbumSaveButton album={album} size={24} enableTooltip={false} />
          )}
          {item.type === 'artist' && artistInfo && (
            <FollowButton
              artistId={artistInfo.id}
              artistName={artistInfo.name}
              artworkUrl={artistInfo.artworkUrl}
              className="text-xs px-3 py-1"
            />
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * MobileSearchPage component
 * Mobile-optimized search page with:
 * - Full-width search input with auto-focus (Requirements: 4.1)
 * - Single-column results list optimized for touch (Requirements: 4.2)
 * - Touch feedback on result tap (Requirements: 4.3)
 * - Recent searches and browse categories when input is empty (Requirements: 4.4)
 */
export default function MobileSearchPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { searchQuery, searchResults, setSearchState } = useNavigationStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const { paddingClass: bottomPaddingClass } = useBottomPadding();

  const [query, setQuery] = useState(searchQuery);
  const [results, setResults] = useState<SearchResultWithTop | null>(
    searchResults ? (searchResults as SearchResultWithTop) : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileSearchFilterTab>(null);
  
  // Pagination state for filtered tabs
  const [paginatedSongs, setPaginatedSongs] = useState<Song[]>([]);
  const [paginatedArtists, setPaginatedArtists] = useState<Artist[]>([]);
  const [paginatedAlbums, setPaginatedAlbums] = useState<Album[]>([]);
  const [paginationState, setPaginationState] = useState<{
    hasMore: boolean;
    offset: number;
    loading: boolean;
  }>({ hasMore: false, offset: 0, loading: false });
  
  // Scroll container ref for infinite scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Song menu state
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Search suggestions hook - same as desktop
  const {
    suggestions,
    isLoading: suggestionsLoading,
    error: suggestionsError,
    fetchSuggestions,
    clearSuggestions,
  } = useSuggestions(300);

  const { setQueue } = usePlayerStore();
  const { getRecentItems, removeItem, addItem: addSearchHistoryItem } =
    useSearchHistoryStore();

  // Removed auto-focus on mount - user should manually tap to focus

  // Execute search function
  const executeSearch = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim()) return;

      setLoading(true);
      setError(null);
      setActiveTab(null); // Reset filter when searching
      // Reset pagination state
      setPaginatedSongs([]);
      setPaginatedArtists([]);
      setPaginatedAlbums([]);
      setPaginationState({ hasMore: false, offset: 0, loading: false });

      try {
        const data = await searchWithTopResults(searchTerm);
        setResults(data);
        setSearchState(searchTerm, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '搜索失败');
      } finally {
        setLoading(false);
      }
    },
    [setSearchState]
  );

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

  useEffect(() => {
    if (!results) return;

    const topSongs = results.topResults?.filter(item => item.type === 'song') || [];
    const topAlbums = results.topResults?.filter(item => item.type === 'album') || [];
    const topArtists = results.topResults?.filter(item => item.type === 'artist') || [];

    prefetchArtworks([...(results.songs || []), ...paginatedSongs, ...topSongs], [80, 300]);
    prefetchArtworks(
      [
        ...(results.albums || []),
        ...(results.singlesAndEPs || []),
        ...paginatedAlbums,
        ...topAlbums,
      ],
      [240, 300]
    );
    prefetchArtistImages([...(results.artists || []), ...paginatedArtists, ...topArtists], [300]);
  }, [results, paginatedSongs, paginatedAlbums, paginatedArtists]);

  // Handle search input change - fetch suggestions (like desktop)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Fetch suggestions for autocomplete
    if (value.trim()) {
      fetchSuggestions(value);
    } else {
      clearSuggestions();
      setResults(null);
      setSearchState('', null);
    }
  };

  // Clear search
  const handleClearSearch = () => {
    setQuery('');
    setResults(null);
    clearSuggestions();
    setSearchState('', null);
    inputRef.current?.focus();
  };

  // Handle term suggestion select - execute search
  const handleTermSelect = (term: string) => {
    setQuery(term);
    clearSuggestions();
    executeSearch(term);
  };

  // Handle content suggestion select - navigate to detail page
  const handleContentSelect = (content: ContentSuggestion) => {
    clearSuggestions();
    // Add to search history
    addSearchHistoryItem({
      type: content.type,
      id: content.id,
      name: content.name,
      subtitle:
        content.type === 'artist'
          ? '艺术家'
          : `${content.type === 'album' ? '专辑' : '歌曲'} · ${content.subtitle || ''}`,
      artworkUrl: content.artworkUrl,
    });

    // Navigate based on type
    switch (content.type) {
      case 'artist':
        navigate(`/artist/${content.id}`);
        break;
      case 'album':
        navigate(`/album/${content.id}`);
        break;
      case 'song':
        // For songs, navigate to album (we don't have albumId in ContentSuggestion)
        // Just set the query and search
        setQuery(content.name);
        executeSearch(content.name);
        break;
    }
  };


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

  // Handle song play
  const handlePlaySong = (song: Song, allSongs: Song[]) => {
    recordSongToHistory(song);
    const index = allSongs.findIndex((s) => s.id === song.id);
    setQueue(allSongs, index, { type: 'search', id: null, name: '搜索结果' });
  };

  // Handle album click
  const handleAlbumClick = (album: Album) => {
    recordAlbumToHistory(album);
    navigate(`/album/${album.id}`);
  };

  // Handle artist click
  const handleArtistClick = (artist: Artist) => {
    recordArtistToHistory(artist);
    navigate(`/artist/${artist.id}`);
  };

  // Handle search history item click
  const handleHistoryItemClick = (item: SearchHistoryItem) => {
    switch (item.type) {
      case 'song':
        if (item.albumId) {
          navigate(`/album/${item.albumId}`);
        }
        break;
      case 'artist':
        navigate(`/artist/${item.id}`);
        break;
      case 'album':
        navigate(`/album/${item.id}`);
        break;
    }
  };

  // Handle browse category click
  const handleCategoryClick = (categoryQuery: string) => {
    setQuery(categoryQuery);
    executeSearch(categoryQuery);
  };

  // Load paginated results for a specific tab
  const loadPaginatedResults = useCallback(
    async (tab: Exclude<MobileSearchFilterTab, null>, offset: number = 0) => {
      if (!query.trim()) return;
      
      setPaginationState(prev => ({ ...prev, loading: true }));
      
      try {
        const typeMap = {
          songs: 'songs' as const,
          artists: 'artists' as const,
          albums: 'albums' as const,
        };
        
        const result = await searchPaginated(query, typeMap[tab], offset, 20);
        
        if (offset === 0) {
          // First page - replace data
          if (tab === 'songs') {
            setPaginatedSongs(result.items as Song[]);
          } else if (tab === 'artists') {
            setPaginatedArtists(result.items as Artist[]);
          } else {
            setPaginatedAlbums(result.items as Album[]);
          }
        } else {
          // Subsequent pages - append data
          if (tab === 'songs') {
            setPaginatedSongs(prev => [...prev, ...(result.items as Song[])]);
          } else if (tab === 'artists') {
            setPaginatedArtists(prev => [...prev, ...(result.items as Artist[])]);
          } else {
            setPaginatedAlbums(prev => [...prev, ...(result.items as Album[])]);
          }
        }
        
        setPaginationState({
          hasMore: result.hasMore,
          offset: result.offset + result.items.length,
          loading: false,
        });
      } catch (err) {
        console.error('Failed to load paginated results:', err);
        setPaginationState(prev => ({ ...prev, loading: false }));
      }
    },
    [query]
  );

  // Handle tab change - load paginated data
  const handleTabChange = useCallback(
    (tab: MobileSearchFilterTab) => {
      setActiveTab(tab);
      
      if (tab !== null) {
        // Reset pagination state and load first page
        setPaginationState({ hasMore: false, offset: 0, loading: false });
        loadPaginatedResults(tab, 0);
      }
    },
    [loadPaginatedResults]
  );

  // Load more when scrolling to bottom
  const handleLoadMore = useCallback(() => {
    if (activeTab && paginationState.hasMore && !paginationState.loading) {
      loadPaginatedResults(activeTab, paginationState.offset);
    }
  }, [activeTab, paginationState, loadPaginatedResults]);

  // Scroll event handler for infinite scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || activeTab === null) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when scrolled to within 200px of bottom
      if (scrollHeight - scrollTop - clientHeight < 200) {
        handleLoadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [activeTab, handleLoadMore]);

  // Handle best match click - navigate to detail page
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

  // Check if we have results for each category
  const hasResultsFor = {
    songs: (results?.songs?.length ?? 0) > 0,
    artists: (results?.artists?.length ?? 0) > 0,
    albums: (results?.albums?.length ?? 0) > 0 || (results?.singlesAndEPs?.length ?? 0) > 0,
  };

  // Check if we have any results
  const hasResults =
    results &&
    (hasResultsFor.songs || hasResultsFor.artists || hasResultsFor.albums);

  // Get recent search items
  const recentItems = getRecentItems(10);

  // Show empty state (recent searches + browse categories) when no query
  const showEmptyState = !query.trim() && !loading;

  // Show suggestions when: input has text AND (has suggestions OR loading suggestions) AND no error
  const hasSuggestions =
    suggestions &&
    (suggestions.terms.length > 0 || suggestions.contents.length > 0);
  const showSuggestions =
    query.trim() !== '' &&
    !suggestionsError &&
    (hasSuggestions || suggestionsLoading) &&
    !results; // Don't show suggestions when we have search results

  // Determine if header should be gray (focused, loading, or has results)
  const headerGray = inputFocused || loading || results;

  // Update theme-color meta tag for safe area to match header
  useEffect(() => {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const color = headerGray ? '#121212' : '#000000'; // match safe area color or black
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', color);
    }
  }, [headerGray]);

  // Calculate header height for content padding
  // Header: safe-area-inset-top + 16px + 48px (input) + 12px (pb-3) = safe-area-inset-top + 76px
  // With filter tabs: + 36px (min-h) + 12px (pb-3) = + 48px
  const hasFilterTabs = !loading && !showEmptyState && results && hasResults;

  return (
    <div className="flex flex-col h-full">
      {/* Search input header + Filter tabs - fixed at top to prevent overscroll animation */}
      <div className={`fixed top-0 left-0 right-0 z-10 ${headerGray ? 'bg-[#121212]' : 'bg-black'}`}>
        <form
          action=""
          className="px-4 pb-3"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) {
              clearSuggestions();
              executeSearch(query.trim());
              inputRef.current?.blur();
            }
          }}
        >
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/60" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={handleInputChange}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="搜索歌曲、专辑或艺术家"
              className="w-full h-12 pl-10 pr-10 bg-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20 [&::-webkit-search-cancel-button]:hidden"
              data-testid="mobile-search-input"
            />
            {query && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-white/10 min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="清除搜索"
              >
                <FiX className="w-5 h-5 text-white/60" />
              </button>
            )}
          </div>
        </form>

        {/* Filter tabs - sticky below search, only show when has results */}
        {!loading && !showEmptyState && results && hasResults && (
          <div className="flex items-center gap-2 overflow-x-auto px-4 pb-3 scrollbar-hide">
            {SEARCH_FILTER_TABS.map((tab) => {
              // Only show tabs that have results
              const hasTabResults =
                (tab.value === 'songs' && hasResultsFor.songs) ||
                (tab.value === 'artists' && hasResultsFor.artists) ||
                (tab.value === 'albums' && hasResultsFor.albums);
              if (!hasTabResults) return null;

              return (
                <button
                  key={tab.value}
                  onClick={() => handleTabChange(activeTab === tab.value ? null : tab.value)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors min-h-[36px] ${
                    activeTab === tab.value
                      ? 'bg-white text-black'
                      : 'bg-neutral-800 text-white active:bg-neutral-600'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content area */}
      {/* Bottom padding accounts for MiniPlayer + BottomNav + offline indicator */}
      {/* Top padding accounts for fixed header height */}
      {/* Negative margin-top + extra padding creates extended background for overscroll */}
      <div 
        ref={scrollContainerRef} 
        className={`flex-1 overflow-y-auto px-4 bg-black ${bottomPaddingClass}`}
        style={{ 
          paddingTop: hasFilterTabs 
            ? 'calc(env(safe-area-inset-top, 0px) + 76px + 48px + 12px + 100px)' 
            : 'calc(env(safe-area-inset-top, 0px) + 76px + 12px + 100px)',
          marginTop: '-100px'
        }}
      >
        {/* Loading state */}
        {loading && (
          <div className="flex justify-center py-12">
            <FiLoader className="w-8 h-8 text-white/60 animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="text-center py-12">
            {!navigator.onLine ? (
              <>
                <OfflineModeIcon size={32} className="text-red-400 mx-auto mb-2" />
                <div className="text-white/60 mb-2">离线状态，无法搜索</div>
                <div className="text-white/40 text-sm">请连接网络后重试</div>
              </>
            ) : (
              <>
                <div className="text-red-400 mb-2">搜索出错了</div>
                <div className="text-white/40 text-sm">{error}</div>
              </>
            )}
          </div>
        )}

        {/* Empty state - Recent searches + Browse categories (Requirements: 4.4) */}
        {showEmptyState && (
          <div className="space-y-6">
            {/* Recent searches */}
            {recentItems.length > 0 && (
              <section>
                <h2 className="text-lg font-bold text-white mb-3">最近搜索</h2>
                <div className="space-y-1">
                  {recentItems.map((item) => (
                    <MobileSearchHistoryItem
                      key={`${item.type}-${item.id}`}
                      item={item}
                      onClick={() => handleHistoryItemClick(item)}
                      onDelete={() => removeItem(item.id, item.type)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Browse categories */}
            <section>
              <h2 className="text-lg font-bold text-white mb-3">浏览全部</h2>
              <div className="grid grid-cols-2 gap-3">
                {BROWSE_CATEGORIES.map((category) => (
                  <BrowseCategoryCard
                    key={category.name}
                    name={category.name}
                    color={category.color}
                    imageUrl={category.imageUrl}
                    onClick={() => handleCategoryClick(category.query)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}

        {/* Search suggestions - shown while typing (like desktop) */}
        {showSuggestions && (
          <div className="space-y-1">
            {/* Loading state for suggestions */}
            {suggestionsLoading && !suggestions && (
              <div className="flex justify-center py-8">
                <FiLoader className="w-6 h-6 text-white/60 animate-spin" />
              </div>
            )}

            {/* Term suggestions */}
            {suggestions && suggestions.terms.length > 0 && (
              <div className="py-1">
                {suggestions.terms.map((term, index) => (
                  <MobileTermSuggestionItem
                    key={`term-${index}`}
                    term={term}
                    onClick={() => handleTermSelect(term.searchTerm)}
                  />
                ))}
              </div>
            )}

            {/* Divider */}
            {suggestions &&
              suggestions.terms.length > 0 &&
              suggestions.contents.length > 0 && (
                <div className="border-t border-white/10 my-2" />
              )}

            {/* Content suggestions */}
            {suggestions && suggestions.contents.length > 0 && (
              <div className="py-1">
                {suggestions.contents.map((content) => (
                  <MobileContentSuggestionItem
                    key={`content-${content.type}-${content.id}`}
                    content={content}
                    onClick={() => handleContentSelect(content)}
                  />
                ))}
              </div>
            )}
          </div>
        )}


        {/* Search results - Single column list (Requirements: 4.2) */}
        {!loading && !showEmptyState && results && (
          <div className="space-y-1" data-testid="mobile-search-results">
            {/* No results message */}
            {!hasResults && (
              <div className="text-center py-12 text-white/40">
                未找到 "{query}" 的相关结果
              </div>
            )}

            {/* No filter (null) - show best match + all categories */}
            {activeTab === null && hasResults && (
              <>
                {/* Best Match / Top Result - shown at the top like PC */}
                {getBestMatchFromResults(results) && (() => {
                  const bestMatch = getBestMatchFromResults(results)!;
                  // Find the corresponding full object for action buttons
                  const matchedSong = bestMatch.type === 'song' 
                    ? results.songs?.find(s => s.id === bestMatch.id) 
                    : undefined;
                  const matchedAlbum = bestMatch.type === 'album'
                    ? [...(results.albums || []), ...(results.singlesAndEPs || [])].find(a => a.id === bestMatch.id)
                    : undefined;
                  const matchedArtist = bestMatch.type === 'artist'
                    ? results.artists?.find(a => a.id === bestMatch.id)
                    : undefined;
                  
                  return (
                    <section className="mb-4">
                      <h3 className="text-lg font-bold text-white mb-3">
                        热门结果
                      </h3>
                      <MobileBestMatchCard
                        item={bestMatch}
                        onClick={handleBestMatchClick}
                        song={matchedSong}
                        album={matchedAlbum}
                        artistInfo={matchedArtist ? {
                          id: matchedArtist.id,
                          name: matchedArtist.name,
                          artworkUrl: matchedArtist.artworkUrl,
                        } : undefined}
                      />
                    </section>
                  );
                })()}

                {/* Songs */}
                {hasResultsFor.songs && (
                  <section>
                    <h3 className="text-lg font-bold text-white mb-2 mt-4">
                      歌曲
                    </h3>
                    {results.songs!.slice(0, 5).map((song) => (
                      <MobileSearchResultItem
                        key={`song-${song.id}`}
                        type="song"
                        id={song.id}
                        name={song.name}
                        subtitle={song.artistName}
                        artworkUrl={song.artworkUrl}
                        contentRating={song.contentRating}
                        onClick={() => handlePlaySong(song, results.songs!)}
                        song={song}
                        onMenuClick={() => {
                          setMenuSong(song);
                          setMenuOpen(true);
                        }}
                      />
                    ))}
                  </section>
                )}

                {/* Artists */}
                {hasResultsFor.artists && (
                  <section>
                    <h3 className="text-lg font-bold text-white mb-2 mt-4">
                      艺术家
                    </h3>
                    {results.artists!.slice(0, 5).map((artist) => (
                      <MobileSearchResultItem
                        key={`artist-${artist.id}`}
                        type="artist"
                        id={artist.id}
                        name={artist.name}
                        subtitle={artist.genres?.[0] || '艺术家'}
                        artworkUrl={artist.artworkUrl}
                        isCircular
                        onClick={() => handleArtistClick(artist)}
                        artistInfo={{
                          id: artist.id,
                          name: artist.name,
                          artworkUrl: artist.artworkUrl,
                        }}
                      />
                    ))}
                  </section>
                )}

                {/* Albums */}
                {hasResultsFor.albums && (
                  <section>
                    <h3 className="text-lg font-bold text-white mb-2 mt-4">
                      唱片
                    </h3>
                    {[...(results.albums || []), ...(results.singlesAndEPs || [])]
                      .slice(0, 5)
                      .map((album) => (
                        <MobileSearchResultItem
                          key={`album-${album.id}`}
                          type="album"
                          id={album.id}
                          name={album.name}
                          subtitle={album.artistName}
                          artworkUrl={album.artworkUrl}
                          contentRating={album.contentRating}
                          onClick={() => handleAlbumClick(album)}
                          album={album}
                        />
                      ))}
                  </section>
                )}
              </>
            )}

            {/* Songs tab - paginated */}
            {activeTab === 'songs' && (
              <section>
                {(paginatedSongs.length > 0 ? paginatedSongs : results.songs || []).map((song) => (
                  <MobileSearchResultItem
                    key={`song-${song.id}`}
                    type="song"
                    id={song.id}
                    name={song.name}
                    subtitle={song.artistName}
                    artworkUrl={song.artworkUrl}
                    contentRating={song.contentRating}
                    onClick={() => handlePlaySong(song, paginatedSongs.length > 0 ? paginatedSongs : results.songs!)}
                    song={song}
                    onMenuClick={() => {
                      setMenuSong(song);
                      setMenuOpen(true);
                    }}
                  />
                ))}
                {/* Loading indicator */}
                {paginationState.loading && (
                  <div className="flex justify-center py-4">
                    <FiLoader className="w-6 h-6 text-white/60 animate-spin" />
                  </div>
                )}
                {/* No more results */}
                {!paginationState.loading && !paginationState.hasMore && paginatedSongs.length > 0 && (
                  <div className="text-center py-4 text-white/40 text-sm">
                    没有更多了
                  </div>
                )}
              </section>
            )}

            {/* Artists tab - paginated */}
            {activeTab === 'artists' && (
              <section>
                {(paginatedArtists.length > 0 ? paginatedArtists : results.artists || []).map((artist) => (
                  <MobileSearchResultItem
                    key={`artist-${artist.id}`}
                    type="artist"
                    id={artist.id}
                    name={artist.name}
                    subtitle={artist.genres?.[0] || '艺术家'}
                    artworkUrl={artist.artworkUrl}
                    isCircular
                    onClick={() => handleArtistClick(artist)}
                    artistInfo={{
                      id: artist.id,
                      name: artist.name,
                      artworkUrl: artist.artworkUrl,
                    }}
                  />
                ))}
                {/* Loading indicator */}
                {paginationState.loading && (
                  <div className="flex justify-center py-4">
                    <FiLoader className="w-6 h-6 text-white/60 animate-spin" />
                  </div>
                )}
                {/* No more results */}
                {!paginationState.loading && !paginationState.hasMore && paginatedArtists.length > 0 && (
                  <div className="text-center py-4 text-white/40 text-sm">
                    没有更多了
                  </div>
                )}
              </section>
            )}

            {/* Albums tab - paginated */}
            {activeTab === 'albums' && (
              <section>
                {(paginatedAlbums.length > 0 ? paginatedAlbums : [...(results.albums || []), ...(results.singlesAndEPs || [])]).map((album) => (
                  <MobileSearchResultItem
                    key={`album-${album.id}`}
                    type="album"
                    id={album.id}
                    name={album.name}
                    subtitle={album.artistName}
                    artworkUrl={album.artworkUrl}
                    contentRating={album.contentRating}
                    onClick={() => handleAlbumClick(album)}
                    album={album}
                  />
                ))}
                {/* Loading indicator */}
                {paginationState.loading && (
                  <div className="flex justify-center py-4">
                    <FiLoader className="w-6 h-6 text-white/60 animate-spin" />
                  </div>
                )}
                {/* No more results */}
                {!paginationState.loading && !paginationState.hasMore && paginatedAlbums.length > 0 && (
                  <div className="text-center py-4 text-white/40 text-sm">
                    没有更多了
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {/* Song context menu */}
      <MobileSongMenu
        song={menuSong}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        pageContext="search"
      />
    </div>
  );
}
