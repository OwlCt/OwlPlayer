/**
 * Unit tests for useSuggestions hook
 * Tests debounce behavior, state management, and error handling
 * 
 * Requirements: 1.1, 7.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSuggestions } from './useSuggestions';
import * as api from '../api';
import { SuggestionResult } from '../types';

// Mock the API module
vi.mock('../api', () => ({
  getSearchSuggestions: vi.fn(),
}));

const mockGetSearchSuggestions = vi.mocked(api.getSearchSuggestions);

// Mock suggestion result
const mockSuggestionResult: SuggestionResult = {
  terms: [
    { displayTerm: 'taylor swift', searchTerm: 'taylor swift' },
    { displayTerm: 'taylor swift 1989', searchTerm: 'taylor swift 1989' },
  ],
  contents: [
    {
      id: 'artist-1',
      type: 'artist',
      name: 'Taylor Swift',
      artworkUrl: 'https://example.com/taylor.jpg',
    },
    {
      id: 'album-1',
      type: 'album',
      name: '1989',
      artworkUrl: 'https://example.com/1989.jpg',
      subtitle: 'Taylor Swift',
    },
  ],
};

describe('useSuggestions', () => {
  beforeEach(() => {
    mockGetSearchSuggestions.mockReset();
  });

  describe('initial state', () => {
    it('should return null suggestions initially', () => {
      const { result } = renderHook(() => useSuggestions());

      expect(result.current.suggestions).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('debounce behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should debounce API calls by default 300ms', async () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions());

      act(() => {
        result.current.fetchSuggestions('tay');
      });

      // Should be loading immediately
      expect(result.current.isLoading).toBe(true);

      // API should not be called yet (before debounce)
      expect(mockGetSearchSuggestions).not.toHaveBeenCalled();

      // Advance time by 200ms (still within debounce)
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(mockGetSearchSuggestions).not.toHaveBeenCalled();

      // Advance time to complete debounce (300ms total)
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Now API should be called
      expect(mockGetSearchSuggestions).toHaveBeenCalledWith('tay');
    });

    it('should use custom debounce delay', async () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions(500));

      act(() => {
        result.current.fetchSuggestions('tay');
      });

      // Advance time by 300ms (default debounce)
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(mockGetSearchSuggestions).not.toHaveBeenCalled();

      // Advance time to complete custom debounce (500ms total)
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(mockGetSearchSuggestions).toHaveBeenCalledWith('tay');
    });

    it('should cancel previous debounce when new term is entered', async () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions());

      act(() => {
        result.current.fetchSuggestions('tay');
      });

      // Advance time by 200ms
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Enter new term before debounce completes
      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      // Advance time by 300ms (should only call with 'taylor')
      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(mockGetSearchSuggestions).toHaveBeenCalledTimes(1);
      expect(mockGetSearchSuggestions).toHaveBeenCalledWith('taylor');
    });
  });

  describe('state management', () => {
    it('should update suggestions on successful fetch', async () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      // Use very short debounce for testing
      const { result } = renderHook(() => useSuggestions(10));

      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual(mockSuggestionResult);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should clear suggestions for empty term', async () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions(10));

      // First fetch some suggestions
      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual(mockSuggestionResult);
      });

      // Now clear with empty term
      act(() => {
        result.current.fetchSuggestions('');
      });

      expect(result.current.suggestions).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should clear suggestions for whitespace-only term', () => {
      const { result } = renderHook(() => useSuggestions());

      act(() => {
        result.current.fetchSuggestions('   ');
      });

      expect(result.current.suggestions).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(mockGetSearchSuggestions).not.toHaveBeenCalled();
    });

    it('should clear suggestions when clearSuggestions is called', async () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions(10));

      // Fetch suggestions
      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      await waitFor(() => {
        expect(result.current.suggestions).toEqual(mockSuggestionResult);
      });

      // Clear suggestions
      act(() => {
        result.current.clearSuggestions();
      });

      expect(result.current.suggestions).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should set error state on API failure', async () => {
      const mockError = new Error('API Error');
      mockGetSearchSuggestions.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSuggestions(10));

      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      await waitFor(() => {
        expect(result.current.error).toEqual(mockError);
      });

      expect(result.current.suggestions).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    it('should clear error when clearSuggestions is called', async () => {
      const mockError = new Error('API Error');
      mockGetSearchSuggestions.mockRejectedValue(mockError);

      const { result } = renderHook(() => useSuggestions(10));

      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      await waitFor(() => {
        expect(result.current.error).toEqual(mockError);
      });

      act(() => {
        result.current.clearSuggestions();
      });

      expect(result.current.error).toBeNull();
    });

    it('should clear error when new fetch is initiated', async () => {
      const mockError = new Error('API Error');
      mockGetSearchSuggestions.mockRejectedValueOnce(mockError);
      mockGetSearchSuggestions.mockResolvedValueOnce(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions(10));

      // First fetch fails
      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      await waitFor(() => {
        expect(result.current.error).toEqual(mockError);
      });

      // Second fetch should clear error
      act(() => {
        result.current.fetchSuggestions('swift');
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should cancel debounce timer on clearSuggestions', () => {
      mockGetSearchSuggestions.mockResolvedValue(mockSuggestionResult);

      const { result } = renderHook(() => useSuggestions());

      act(() => {
        result.current.fetchSuggestions('taylor');
      });

      // Clear before debounce completes
      act(() => {
        result.current.clearSuggestions();
      });

      // Advance past debounce
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // API should not have been called
      expect(mockGetSearchSuggestions).not.toHaveBeenCalled();
    });
  });
});
