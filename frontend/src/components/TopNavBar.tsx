import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiChevronLeft } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import UserAvatar from './UserAvatar';
import SearchHistoryDropdown from './SearchHistoryDropdown';
import SearchSuggestions, { getTotalSuggestionCount } from './search/SearchSuggestions';
import OfflineIndicator from './OfflineIndicator';
import { useSuggestions } from '../hooks/useSuggestions';
import { useNavigationHistory } from '../hooks/useNavigationHistory';
import { ContentSuggestion } from '../types';
import { getSongDetail } from '../api';
import { useSearchHistoryStore } from '../store/searchHistoryStore';
const owlLogo = '/OwlPlayer-400x400.png';

interface TopNavBarProps {
  onSearch?: (query: string) => void;
}

export default function TopNavBar({ onSearch }: TopNavBarProps) {
  const navigate = useNavigate();
  const { canGoBack, goBack } = useNavigationHistory();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use suggestions hook (Requirements 1.1, 6.3)
  // Requirements 7.1: error is used to hide dropdown on API failure while allowing manual search
  const { suggestions, isLoading, error, fetchSuggestions, clearSuggestions } = useSuggestions(300);
  
  // Search history store for content suggestion handling
  const { addItem: addSearchHistoryItem } = useSearchHistoryStore();

  // Determine which dropdown to show
  // Show search history when: input is focused AND input is empty
  // Show suggestions when: input is focused AND input is not empty AND has suggestions (no error)
  // Requirements 7.1: Hide dropdown on error, allow manual search to continue
  const showSearchHistory = isFocused && searchQuery.trim() === '';
  const showSuggestions = isFocused && searchQuery.trim() !== '' && !error && (suggestions !== null || isLoading);

  // Handle click outside to close dropdown (Requirements 8.4)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        clearSuggestions();
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [clearSuggestions]);

  // Reset highlighted index when suggestions change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return;

    if (onSearch) {
      onSearch(trimmedQuery);
    }
    setIsFocused(false);
    clearSuggestions();
    setHighlightedIndex(-1);
    navigate(`/search?q=${encodeURIComponent(trimmedQuery)}`);
  };

  const handleFocus = () => {
    setIsFocused(true);
    // Fetch suggestions if there's already a query (Requirements 1.1)
    if (searchQuery.trim()) {
      fetchSuggestions(searchQuery);
    }
  };

  const handleDropdownClose = () => {
    setIsFocused(false);
    clearSuggestions();
    setHighlightedIndex(-1);
  };

  // Handle input change - fetch suggestions (Requirements 1.1)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setHighlightedIndex(-1);
    
    if (value.trim()) {
      fetchSuggestions(value);
    } else {
      clearSuggestions();
    }
  };

  // Handle keyboard navigation (Requirements 8.1, 8.2, 8.3, 8.4)
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const totalCount = getTotalSuggestionCount(suggestions);
    
    if (!showSuggestions || totalCount === 0) {
      // Handle Escape to close history dropdown (Requirements 1.6)
      if (e.key === 'Escape' && showSearchHistory) {
        handleDropdownClose();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < totalCount - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev > 0 ? prev - 1 : totalCount - 1
        );
        break;
      case 'Enter':
        if (highlightedIndex >= 0 && suggestions) {
          e.preventDefault();
          const termsCount = suggestions.terms.length;
          if (highlightedIndex < termsCount) {
            // Select term suggestion
            handleTermSelect(suggestions.terms[highlightedIndex].searchTerm);
          } else {
            // Select content suggestion
            const contentIndex = highlightedIndex - termsCount;
            handleContentSelect(suggestions.contents[contentIndex]);
          }
        }
        break;
      case 'Escape':
        // Close dropdown (Requirements 1.6, 8.4)
        handleDropdownClose();
        inputRef.current?.blur();
        break;
    }
  };

  // Handle term suggestion selection (Requirements 1.4)
  const handleTermSelect = (term: string) => {
    setSearchQuery(term);
    setIsFocused(false);
    clearSuggestions();
    setHighlightedIndex(-1);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  // Handle content suggestion selection (Requirements 1.5)
  // Click should navigate directly to the content and record in search history
  const handleContentSelect = async (item: ContentSuggestion) => {
    setIsFocused(false);
    clearSuggestions();
    setHighlightedIndex(-1);
    
    switch (item.type) {
      case 'artist':
        // Record to search history
        addSearchHistoryItem({
          type: 'artist',
          id: item.id,
          name: item.name,
          subtitle: '艺术家',
          artworkUrl: item.artworkUrl,
        });
        navigate(`/artist/${item.id}`);
        break;
      case 'album':
        // Record to search history
        addSearchHistoryItem({
          type: 'album',
          id: item.id,
          name: item.name,
          subtitle: `专辑 · ${item.subtitle || ''}`,
          artworkUrl: item.artworkUrl,
          artistName: item.subtitle,
        });
        navigate(`/album/${item.id}`);
        break;
      case 'song':
        // For songs, fetch song detail and navigate to album with highlight
        try {
          const songDetail = await getSongDetail(item.id);
          // Record to search history
          addSearchHistoryItem({
            type: 'song',
            id: songDetail.id,
            name: songDetail.name,
            subtitle: `歌曲 · ${songDetail.artistName}`,
            artworkUrl: songDetail.artworkUrl,
            artistId: songDetail.artistId,
            artistName: songDetail.artistName,
            albumId: songDetail.albumId,
          });
          // Navigate to album page with highlight parameter
          if (songDetail.albumId) {
            navigate(`/album/${songDetail.albumId}?highlight=${songDetail.id}`);
          } else {
            // Fallback: navigate to search page if no album
            navigate(`/search?q=${encodeURIComponent(item.name)}`);
          }
        } catch (err) {
          console.error('Failed to load song detail:', err);
          // Fallback: navigate to search page
          navigate(`/search?q=${encodeURIComponent(item.name)}`);
        }
        break;
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-black z-30 flex items-center px-6 safe-area-top">
      {/* Logo - Click to go home */}
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-2 min-w-[140px] hover:opacity-80 transition-opacity"
      >
        <img src={owlLogo} alt="OwlPlayer" className="w-9 h-9 rounded-md shadow-sm" />
        <span className="sr-only">OwlPlayer</span>
      </button>

      {/* Navigation Buttons + Search Bar - Center (Dynamic Island Style) */}
      <motion.div layout className="flex-1 max-w-xl mx-auto flex items-center justify-center gap-2">
        <AnimatePresence mode="popLayout">
          {canGoBack && (
            <motion.button
              layout
              key="back-button"
              initial={{ scale: 0, opacity: 0, width: 0 }}
              animate={{ scale: 1, opacity: 1, width: '2.5rem' }} // w-10 is 2.5rem
              exit={{ scale: 0, opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              onClick={goBack}
              className="h-10 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 text-white transition-colors overflow-hidden"
              aria-label="返回"
            >
              <FiChevronLeft size={20} strokeWidth={2.5} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* Search Bar - The 'Pill' */}
        <motion.form layout onSubmit={handleSearchSubmit} className="flex-1 relative z-20">
          <div className="relative" ref={searchContainerRef}>
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 z-10" size={18} />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={handleInputChange}
              onFocus={handleFocus}
              onKeyDown={handleKeyDown}
              placeholder="想听什么？"
              className="w-full pl-11 pr-4 h-10 bg-neutral-800 hover:bg-neutral-700 rounded-full text-white text-sm placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-white/20 focus:bg-neutral-700 transition-colors"
            />
          
            {/* Search History Dropdown - shown when input is empty */}
            <SearchHistoryDropdown
              isOpen={showSearchHistory}
              onClose={handleDropdownClose}
            />
            
            {/* Search Suggestions Dropdown - shown when typing */}
            {showSuggestions && (
              <SearchSuggestions
                suggestions={suggestions}
                isLoading={isLoading}
                onTermSelect={handleTermSelect}
                onContentSelect={handleContentSelect}
                highlightedIndex={highlightedIndex}
              />
            )}
          </div>
        </motion.form>
      </motion.div>

      {/* User Area - Right */}
      <div className="flex items-center justify-end gap-2 min-w-[200px]">
        <OfflineIndicator />
        <UserAvatar />
      </div>
    </header>
  );
}
