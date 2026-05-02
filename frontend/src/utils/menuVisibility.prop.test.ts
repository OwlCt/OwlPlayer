import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getSongMenuVisibility, getAlbumMenuVisibility } from './menuVisibility';
import { PageContextType } from '../types';

// Generator for PageContextType
const pageContextArb = fc.constantFrom<PageContextType>('default', 'album', 'artist');

describe('Menu Visibility Property Tests', () => {
  /**
   * **Feature: context-menu-page-awareness, Property 1: Song menu "Go to Album" visibility is context-dependent**
   * 
   * For any page context value, the "转至专辑" menu item in SongContextMenu 
   * SHALL be visible if and only if the page context is NOT 'album'.
   * 
   * **Validates: Requirements 1.1, 4.1**
   */
  it('Property 1: Song menu "Go to Album" visibility equals (context !== album)', () => {
    fc.assert(
      fc.property(pageContextArb, (pageContext) => {
        const visibility = getSongMenuVisibility(pageContext);
        const expected = pageContext !== 'album';
        expect(visibility.showGoToAlbum).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: context-menu-page-awareness, Property 2: Song menu "Go to Artist" visibility is context-dependent**
   * 
   * For any page context value, the "转至艺术家" menu item in SongContextMenu 
   * SHALL be visible if and only if the page context is NOT 'artist'.
   * 
   * **Validates: Requirements 2.1, 4.2**
   */
  it('Property 2: Song menu "Go to Artist" visibility equals (context !== artist)', () => {
    fc.assert(
      fc.property(pageContextArb, (pageContext) => {
        const visibility = getSongMenuVisibility(pageContext);
        const expected = pageContext !== 'artist';
        expect(visibility.showGoToArtist).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: context-menu-page-awareness, Property 3: Song menu "Add to Library" is always hidden**
   * 
   * For any page context value, the "添加到音乐库" menu item 
   * SHALL NOT be present in the SongContextMenu.
   * 
   * **Validates: Requirements 3.1**
   */
  it('Property 3: Song menu "Add to Library" is always hidden regardless of context', () => {
    fc.assert(
      fc.property(pageContextArb, (pageContext) => {
        const visibility = getSongMenuVisibility(pageContext);
        expect(visibility.showAddToLibrary).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Feature: context-menu-page-awareness, Property 4: Album menu "Go to Artist" visibility is context-dependent**
   * 
   * For any page context value, the "转至艺术家" menu item in AlbumContextMenu 
   * SHALL be visible if and only if the page context is NOT 'artist'.
   * 
   * **Validates: Requirements 2.2**
   */
  it('Property 4: Album menu "Go to Artist" visibility equals (context !== artist)', () => {
    fc.assert(
      fc.property(pageContextArb, (pageContext) => {
        const visibility = getAlbumMenuVisibility(pageContext);
        const expected = pageContext !== 'artist';
        expect(visibility.showGoToArtist).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  // Additional test: default behavior when no context provided
  it('should use default context when pageContext is undefined', () => {
    const songVisibility = getSongMenuVisibility();
    expect(songVisibility.showAddToLibrary).toBe(false);
    expect(songVisibility.showGoToAlbum).toBe(true);
    expect(songVisibility.showGoToArtist).toBe(true);

    const albumVisibility = getAlbumMenuVisibility();
    expect(albumVisibility.showGoToArtist).toBe(true);
  });
});
