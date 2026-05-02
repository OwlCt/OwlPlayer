/**
 * Property-based tests for NowPlayingSection state management
 * 
 * **Feature: player-bar-lyrics-queue-buttons**
 * Tests the correctness properties for section state management in playerStore
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { usePlayerStore, NowPlayingSectionType } from './playerStore';

// Arbitrary for generating section types
const sectionArb = fc.constantFrom<NowPlayingSectionType>('lyrics', 'artist', 'queue');

// Arbitrary for generating initial state
const initialStateArb = fc.record({
  showNowPlaying: fc.boolean(),
  nowPlayingSection: sectionArb,
});

describe('NowPlayingSection State Management', () => {
  beforeEach(() => {
    // Reset store state before each test
    usePlayerStore.setState({
      showNowPlaying: false,
      nowPlayingSection: 'lyrics',
    });
  });

  /**
   * **Feature: player-bar-lyrics-queue-buttons, Property 1: Opening NowPlayingView sets correct section**
   * 
   * *For any* section type ('lyrics' or 'queue'), when `openNowPlayingSection(section)` is called
   * from a closed state, the resulting state SHALL have `showNowPlaying=true` AND 
   * `nowPlayingSection` equal to the specified section.
   * 
   * **Validates: Requirements 1.2, 1.3**
   */
  describe('Property 1: Opening NowPlayingView sets correct section', () => {
    it('should open NowPlayingView with the specified section when closed', () => {
      fc.assert(
        fc.property(sectionArb, (section) => {
          // Setup: ensure NowPlayingView is closed
          usePlayerStore.setState({ showNowPlaying: false });
          
          // Action: open with specified section
          usePlayerStore.getState().openNowPlayingSection(section);
          
          // Assert: NowPlayingView is open with correct section
          const state = usePlayerStore.getState();
          expect(state.showNowPlaying).toBe(true);
          expect(state.nowPlayingSection).toBe(section);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: player-bar-lyrics-queue-buttons, Property 3: Return to artist view behavior**
   * 
   * *For any* player state where `showNowPlaying=true` and `nowPlayingSection=S`,
   * calling `openNowPlayingSection(S)` (same section) SHALL result in 
   * `showNowPlaying=true` AND `nowPlayingSection='artist'` (return to artist view).
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 3: Return to artist view behavior', () => {
    it('should return to artist view when clicking the same section button', () => {
      fc.assert(
        fc.property(sectionArb, (section) => {
          // Setup: NowPlayingView is open with the section
          usePlayerStore.setState({ 
            showNowPlaying: true, 
            nowPlayingSection: section 
          });
          
          // Action: click the same section button
          usePlayerStore.getState().openNowPlayingSection(section);
          
          // Assert: NowPlayingView stays open and returns to artist view
          const state = usePlayerStore.getState();
          expect(state.showNowPlaying).toBe(true);
          expect(state.nowPlayingSection).toBe('artist');
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: player-bar-lyrics-queue-buttons, Property 4: Section switching without closing**
   * 
   * *For any* player state where `showNowPlaying=true` and `nowPlayingSection=S1`,
   * calling `openNowPlayingSection(S2)` where S2≠S1 SHALL result in 
   * `showNowPlaying=true` AND `nowPlayingSection=S2`.
   * 
   * **Validates: Requirements 2.3, 2.4**
   */
  describe('Property 4: Section switching without closing', () => {
    it('should switch section without closing when clicking a different section button', () => {
      fc.assert(
        fc.property(
          sectionArb,
          sectionArb,
          (currentSection, targetSection) => {
            // Skip if same section (covered by Property 3)
            fc.pre(currentSection !== targetSection);
            
            // Setup: NowPlayingView is open with currentSection
            usePlayerStore.setState({ 
              showNowPlaying: true, 
              nowPlayingSection: currentSection 
            });
            
            // Action: click a different section button
            usePlayerStore.getState().openNowPlayingSection(targetSection);
            
            // Assert: NowPlayingView stays open with new section
            const state = usePlayerStore.getState();
            expect(state.showNowPlaying).toBe(true);
            expect(state.nowPlayingSection).toBe(targetSection);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional test: setNowPlayingSection should update section without affecting showNowPlaying
   */
  describe('setNowPlayingSection', () => {
    it('should update section without changing showNowPlaying state', () => {
      fc.assert(
        fc.property(
          initialStateArb,
          sectionArb,
          (initialState, newSection) => {
            // Setup
            usePlayerStore.setState(initialState);
            
            // Action
            usePlayerStore.getState().setNowPlayingSection(newSection);
            
            // Assert: section changed, showNowPlaying unchanged
            const state = usePlayerStore.getState();
            expect(state.nowPlayingSection).toBe(newSection);
            expect(state.showNowPlaying).toBe(initialState.showNowPlaying);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
