/**
 * SearchSuggestions component
 * Displays search suggestions dropdown with term suggestions and content suggestions
 * 
 * Requirements: 1.2, 1.3, 8.1, 8.2, 8.5
 */
import { SuggestionResult, TermSuggestion, ContentSuggestion } from '../../types';
import { getProxiedImageUrl } from '../../utils/image';
import CachedImage from '../CachedImage';
import { FiSearch } from 'react-icons/fi';

export interface SearchSuggestionsProps {
  suggestions: SuggestionResult | null;
  isLoading: boolean;
  onTermSelect: (term: string) => void;
  onContentSelect: (item: ContentSuggestion) => void;
  highlightedIndex: number;
}

/**
 * SearchSuggestions component
 * Displays term suggestions as clickable text items (Requirements 1.2)
 * Displays content suggestions as rich preview cards with artwork (Requirements 1.3)
 * Supports keyboard navigation highlighting (Requirements 8.1, 8.2)
 * Shows term suggestions above content suggestions (Requirements 8.5)
 */
export default function SearchSuggestions({
  suggestions,
  isLoading,
  onTermSelect,
  onContentSelect,
  highlightedIndex,
}: SearchSuggestionsProps) {
  // Don't render if no suggestions and not loading
  if (!suggestions && !isLoading) return null;
  
  // Don't render if suggestions are empty
  if (suggestions && suggestions.terms.length === 0 && suggestions.contents.length === 0) {
    return null;
  }

  const totalTerms = suggestions?.terms.length || 0;

  // Check if an index is highlighted
  const isHighlighted = (index: number) => index === highlightedIndex;

  // Render term suggestion item
  const renderTermItem = (term: TermSuggestion, index: number) => (
    <button
      key={`term-${index}`}
      onClick={() => onTermSelect(term.searchTerm)}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
        isHighlighted(index)
          ? 'bg-white/10'
          : 'hover:bg-white/5'
      }`}
      data-suggestion-index={index}
    >
      <FiSearch className="w-4 h-4 text-neutral-400 flex-shrink-0" />
      <span className="text-white truncate">{term.displayTerm}</span>
    </button>
  );

  // Render content suggestion item
  const renderContentItem = (content: ContentSuggestion, index: number) => {
    const actualIndex = totalTerms + index;
    const isArtist = content.type === 'artist';
    
    return (
      <button
        key={`content-${content.type}-${content.id}`}
        onClick={() => onContentSelect(content)}
        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
          isHighlighted(actualIndex)
            ? 'bg-white/10'
            : 'hover:bg-white/5'
        }`}
        data-suggestion-index={actualIndex}
      >
        {/* Artwork - circular for artist, square for others */}
        <div 
          className={`w-10 h-10 bg-neutral-700 overflow-hidden flex-shrink-0 ${
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
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
              {isArtist ? '👤' : '♪'}
            </div>
          )}
        </div>

        {/* Content info */}
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium truncate">{content.name}</div>
          <div className="text-sm text-neutral-400 truncate">
            {getContentTypeLabel(content.type)}
            {content.subtitle && (
              <>
                <span className="mx-1">·</span>
                {content.subtitle}
              </>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="absolute top-full left-0 right-0 mt-2 bg-spotify-gray rounded-lg shadow-xl overflow-hidden z-50">
      {/* Loading state */}
      {isLoading && !suggestions && (
        <div className="px-4 py-6 text-center text-neutral-400">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-neutral-400 border-t-transparent mx-auto" />
        </div>
      )}

      {/* Suggestions content */}
      {suggestions && (
        <div className="max-h-[400px] overflow-y-auto">
          {/* Term suggestions (Requirements 8.5: show above content) */}
          {suggestions.terms.length > 0 && (
            <div className="py-1">
              {suggestions.terms.map((term, index) => renderTermItem(term, index))}
            </div>
          )}

          {/* Divider between terms and content */}
          {suggestions.terms.length > 0 && suggestions.contents.length > 0 && (
            <div className="border-t border-white/10" />
          )}

          {/* Content suggestions */}
          {suggestions.contents.length > 0 && (
            <div className="py-1">
              {suggestions.contents.map((content, index) => renderContentItem(content, index))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get display label for content type
 */
function getContentTypeLabel(type: ContentSuggestion['type']): string {
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
}

/**
 * Calculate total suggestion count for keyboard navigation
 */
export function getTotalSuggestionCount(suggestions: SuggestionResult | null): number {
  if (!suggestions) return 0;
  return suggestions.terms.length + suggestions.contents.length;
}
