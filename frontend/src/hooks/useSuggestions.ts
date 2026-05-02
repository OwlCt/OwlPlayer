/**
 * Hook for managing search suggestions with debounce and caching
 * Fetches suggestions from the API after a configurable debounce delay
 * Caches results to avoid redundant requests when refocusing
 * 
 * Requirements: 1.1, 6.3
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { SuggestionResult } from '../types';
import { getSearchSuggestions } from '../api';

export interface UseSuggestionsReturn {
  suggestions: SuggestionResult | null;
  isLoading: boolean;
  error: Error | null;
  fetchSuggestions: (term: string) => void;
  clearSuggestions: () => void;
}

/**
 * Custom hook for fetching search suggestions with debounce and caching
 * @param debounceMs - Debounce delay in milliseconds (default: 300ms per Requirements 1.1)
 */
export function useSuggestions(debounceMs: number = 300): UseSuggestionsReturn {
  const [suggestions, setSuggestions] = useState<SuggestionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Refs for debounce timer and abort controller
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Cache for suggestions - stores last successful result per search term
  const cacheRef = useRef<{ term: string; result: SuggestionResult } | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchSuggestions = useCallback((term: string) => {
    // Clear any existing debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Don't fetch for empty terms (Requirements 1.7)
    if (!term.trim()) {
      setSuggestions(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Check cache - if same term, use cached result immediately
    if (cacheRef.current && cacheRef.current.term === term.trim()) {
      setSuggestions(cacheRef.current.result);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Set loading state immediately for better UX
    setIsLoading(true);
    setError(null);

    // Debounce the API call (Requirements 1.1 - 300ms debounce)
    debounceTimerRef.current = setTimeout(async () => {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        const result = await getSearchSuggestions(term);
        setSuggestions(result);
        setError(null);
        // Cache the successful result
        cacheRef.current = { term: term.trim(), result };
      } catch (err) {
        // Don't set error if request was aborted
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // Requirements 7.1: Hide dropdown on error, allow manual search
        setError(err instanceof Error ? err : new Error('Failed to fetch suggestions'));
        setSuggestions(null);
      } finally {
        setIsLoading(false);
      }
    }, debounceMs);
  }, [debounceMs]);

  const clearSuggestions = useCallback(() => {
    // Clear debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Only hide suggestions UI, keep cache intact for refocus
    setSuggestions(null);
    setIsLoading(false);
    setError(null);
    // Note: cacheRef is NOT cleared here, so refocusing with same term uses cache
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    fetchSuggestions,
    clearSuggestions,
  };
}
