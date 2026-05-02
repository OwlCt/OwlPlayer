/**
 * Unit tests for SearchSuggestions component
 * Requirements: 1.2, 1.3
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchSuggestions, { getTotalSuggestionCount } from './SearchSuggestions';
import { SuggestionResult, ContentSuggestion } from '../../types';

// Mock CachedImage component
vi.mock('../CachedImage', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} data-testid="cached-image" />
  ),
}));

describe('SearchSuggestions', () => {
  const mockTerms = [
    { displayTerm: 'taylor swift', searchTerm: 'taylor swift' },
    { displayTerm: 'taylor swift 1989', searchTerm: 'taylor swift 1989' },
  ];

  const mockContents: ContentSuggestion[] = [
    {
      id: '1',
      type: 'artist',
      name: 'Taylor Swift',
      artworkUrl: 'https://example.com/taylor.jpg',
      subtitle: undefined,
    },
    {
      id: '2',
      type: 'album',
      name: '1989',
      artworkUrl: 'https://example.com/1989.jpg',
      subtitle: 'Taylor Swift',
    },
    {
      id: '3',
      type: 'song',
      name: 'Shake It Off',
      artworkUrl: 'https://example.com/shake.jpg',
      subtitle: 'Taylor Swift',
    },
  ];

  const mockSuggestions: SuggestionResult = {
    terms: mockTerms,
    contents: mockContents,
  };

  const defaultProps = {
    suggestions: mockSuggestions,
    isLoading: false,
    onTermSelect: vi.fn(),
    onContentSelect: vi.fn(),
    highlightedIndex: -1,
  };

  it('renders nothing when suggestions is null and not loading', () => {
    const { container } = render(
      <SearchSuggestions {...defaultProps} suggestions={null} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when suggestions are empty', () => {
    const { container } = render(
      <SearchSuggestions
        {...defaultProps}
        suggestions={{ terms: [], contents: [] }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state when loading and no suggestions', () => {
    render(
      <SearchSuggestions {...defaultProps} suggestions={null} isLoading={true} />
    );
    // Should show loading spinner
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
  });

  // Test term suggestion rendering (Requirements 1.2)
  describe('Term suggestions', () => {
    it('renders term suggestions as clickable items', () => {
      render(<SearchSuggestions {...defaultProps} />);
      
      expect(screen.getByText('taylor swift')).toBeInTheDocument();
      expect(screen.getByText('taylor swift 1989')).toBeInTheDocument();
    });

    it('calls onTermSelect when term is clicked', () => {
      const onTermSelect = vi.fn();
      render(<SearchSuggestions {...defaultProps} onTermSelect={onTermSelect} />);
      
      fireEvent.click(screen.getByText('taylor swift'));
      expect(onTermSelect).toHaveBeenCalledWith('taylor swift');
    });

    it('highlights term at highlightedIndex', () => {
      render(<SearchSuggestions {...defaultProps} highlightedIndex={0} />);
      
      const firstTerm = screen.getByText('taylor swift').closest('button');
      expect(firstTerm).toHaveClass('bg-white/10');
    });
  });

  // Test content suggestion rendering (Requirements 1.3)
  describe('Content suggestions', () => {
    it('renders content suggestions with artwork', () => {
      render(<SearchSuggestions {...defaultProps} />);
      
      expect(screen.getByText('Taylor Swift')).toBeInTheDocument();
      expect(screen.getByText('1989')).toBeInTheDocument();
      expect(screen.getByText('Shake It Off')).toBeInTheDocument();
    });

    it('shows correct type labels for content', () => {
      render(<SearchSuggestions {...defaultProps} />);
      
      // Artist type
      expect(screen.getByText('艺术家')).toBeInTheDocument();
      // Album type with subtitle
      expect(screen.getAllByText(/专辑/).length).toBeGreaterThan(0);
      // Song type with subtitle
      expect(screen.getAllByText(/歌曲/).length).toBeGreaterThan(0);
    });

    it('calls onContentSelect when content is clicked', () => {
      const onContentSelect = vi.fn();
      render(<SearchSuggestions {...defaultProps} onContentSelect={onContentSelect} />);
      
      fireEvent.click(screen.getByText('Taylor Swift'));
      expect(onContentSelect).toHaveBeenCalledWith(mockContents[0]);
    });

    it('renders circular image for artist', () => {
      render(
        <SearchSuggestions
          {...defaultProps}
          suggestions={{ terms: [], contents: [mockContents[0]] }}
        />
      );
      
      const imageContainer = screen.getByText('Taylor Swift')
        .closest('button')
        ?.querySelector('.rounded-full');
      expect(imageContainer).toBeInTheDocument();
    });

    it('renders square image for album/song', () => {
      render(
        <SearchSuggestions
          {...defaultProps}
          suggestions={{ terms: [], contents: [mockContents[1]] }}
        />
      );
      
      const imageContainer = screen.getByText('1989')
        .closest('button')
        ?.querySelector('.rounded:not(.rounded-full)');
      expect(imageContainer).toBeInTheDocument();
    });

    it('highlights content at correct index (after terms)', () => {
      // highlightedIndex 2 should highlight first content (index 0 in contents)
      render(<SearchSuggestions {...defaultProps} highlightedIndex={2} />);
      
      const artistButton = screen.getByText('Taylor Swift').closest('button');
      expect(artistButton).toHaveClass('bg-white/10');
    });
  });

  // Test getTotalSuggestionCount helper
  describe('getTotalSuggestionCount', () => {
    it('returns 0 for null suggestions', () => {
      expect(getTotalSuggestionCount(null)).toBe(0);
    });

    it('returns correct count for suggestions', () => {
      expect(getTotalSuggestionCount(mockSuggestions)).toBe(5); // 2 terms + 3 contents
    });

    it('returns correct count for terms only', () => {
      expect(getTotalSuggestionCount({ terms: mockTerms, contents: [] })).toBe(2);
    });

    it('returns correct count for contents only', () => {
      expect(getTotalSuggestionCount({ terms: [], contents: mockContents })).toBe(3);
    });
  });
});
