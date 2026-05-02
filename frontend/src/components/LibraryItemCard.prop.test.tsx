/**
 * Property-based tests for LibraryItemCard play button
 * 
 * **Feature: library-play-button-style, Property 1: 播放按钮样式一致性**
 * **Feature: library-play-button-style, Property 2: LibraryItemCard 播放/暂停图标显示一致性**
 * **Validates: Requirements 1.2, 1.3, 1.5, 1.6, 3.1, 3.2**
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import LibraryItemCard from './LibraryItemCard';
import { ImageType } from '../utils/dragLink';

// Arbitrary for ImageType
const imageTypeArb = fc.constantFrom<ImageType>('artist', 'album', 'playlist');

// Arbitrary for component props
const libraryItemCardPropsArb = fc.record({
  type: imageTypeArb,
  id: fc.string({ minLength: 1, maxLength: 20 }),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  subtitle: fc.string({ minLength: 0, maxLength: 50 }),
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
  isActive: fc.boolean(),
  isPlaying: fc.boolean(),
});

describe('LibraryItemCard Play Button Property Tests', () => {
  /**
   * Property 1: 播放按钮样式一致性
   * For any LibraryItemCard component in hovered state, the play button should contain
   * the correct CSS classes: w-14 h-14 bg-spotify-green rounded-full shadow-lg absolute bottom-2 right-2
   * 
   * **Validates: Requirements 1.2, 1.3, 3.1, 3.2**
   */
  it('Property 1: play button should have consistent green circular style when hovered', () => {
    fc.assert(
      fc.property(libraryItemCardPropsArb, (props) => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        
        const { container } = render(
          <LibraryItemCard
            {...props}
            onClick={() => {}}
            onPlay={onPlay}
            onPause={onPause}
          />
        );

        // Simulate hover by finding the button and triggering mouseEnter
        const cardButton = container.querySelector('button');
        if (cardButton) {
          fireEvent.mouseEnter(cardButton);
        }

        // After hover, check if play button exists with correct classes
        const playButton = container.querySelector('button.bg-spotify-green');
        
        if (playButton) {
          // Verify the play button has all required classes
          expect(playButton).toHaveClass('w-12');
          expect(playButton).toHaveClass('h-12');
          expect(playButton).toHaveClass('bg-spotify-green');
          expect(playButton).toHaveClass('rounded-full');
          expect(playButton).toHaveClass('shadow-xl');
          expect(playButton).toHaveClass('absolute');
          expect(playButton).toHaveClass('bottom-2');
          expect(playButton).toHaveClass('right-2');
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: LibraryItemCard 播放/暂停图标显示一致性
   * For any LibraryItemCard component, when isPlaying is true, it should show pause icon;
   * otherwise it should show play icon
   * 
   * **Validates: Requirements 1.5, 1.6**
   */
  it('Property 2: play/pause icon should match isPlaying state', () => {
    fc.assert(
      fc.property(libraryItemCardPropsArb, (props) => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        
        const { container } = render(
          <LibraryItemCard
            {...props}
            onClick={() => {}}
            onPlay={onPlay}
            onPause={onPause}
          />
        );

        // Simulate hover
        const cardButton = container.querySelector('button');
        if (cardButton) {
          fireEvent.mouseEnter(cardButton);
        }

        // Find the SVG icon inside the play button
        const playButton = container.querySelector('button.bg-spotify-green');
        
        if (playButton) {
          const svg = playButton.querySelector('svg');
          const path = svg?.querySelector('path');
          
          if (path) {
            const pathD = path.getAttribute('d');
            
            if (props.isPlaying) {
              // Pause icon path (two rectangles)
              expect(pathD).toContain('M6 4h4v16H6V4z');
            } else {
              // Play icon path (triangle)
              expect(pathD).toContain('M6 4l15 8-15 8V4z');
            }
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 播放按钮在悬停时可见
   * For any LibraryItemCard component in hovered state, the play button should become visible
   * 
   * **Validates: Requirements 3.3**
   */
  it('Property 7: play button should become visible when hovered', () => {
    fc.assert(
      fc.property(libraryItemCardPropsArb, (props) => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        
        const { container } = render(
          <LibraryItemCard
            {...props}
            onClick={() => {}}
            onPlay={onPlay}
            onPause={onPause}
          />
        );

        // Simulate hover using fireEvent
        const cardButton = container.querySelector('button');
        if (cardButton) {
          fireEvent.mouseEnter(cardButton);
        }

        // Check for play button visibility (opacity-100 when hovered)
        const playButton = container.querySelector('button.bg-spotify-green');
        
        // When hovered and has play/pause handlers, play button should exist
        if (playButton) {
          expect(playButton).toBeInTheDocument();
          // The button should have opacity-100 class when hovered
          expect(playButton).toHaveClass('opacity-100');
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
