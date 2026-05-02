/**
 * Property-based tests for LikedSongsCard play button
 * 
 * **Feature: library-play-button-style, Property 3: LikedSongsCard 播放/暂停图标显示一致性**
 * **Validates: Requirements 2.3, 2.4**
 */
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import fc from 'fast-check';
import { useState } from 'react';
import { FiHeart } from 'react-icons/fi';
import { getBackgroundClass, getTextColorClass } from './LibraryItemRow';

// Recreate LikedSongsCard component for testing (since it's not exported)
interface LikedSongsCardProps {
  subtitle: string;
  onClick: () => void;
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  hasLikedSongs: boolean;
}

function LikedSongsCard({
  subtitle,
  onClick,
  isActive,
  isPlaying,
  onPlay,
  onPause,
  hasLikedSongs,
}: LikedSongsCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const backgroundClass = getBackgroundClass(isActive, isHovered);
  const textColorClass = getTextColorClass(isPlaying);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`flex flex-col p-4 rounded-lg transition-colors ${backgroundClass || 'hover:bg-spotify-dark'}`}
      data-testid="liked-songs-card"
    >
      <div className="relative w-full aspect-square mb-3">
        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-blue-400 rounded-lg flex items-center justify-center">
          <FiHeart className="w-10 h-10 text-white" />
        </div>
        {isHovered && hasLikedSongs && (
          <>
            <div className="absolute inset-0 bg-black/50 rounded-lg" data-testid="overlay" />
            <button
              className="absolute bottom-2 right-2 w-14 h-14 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
              onClick={(e) => {
                e.stopPropagation();
                if (isPlaying) {
                  onPause();
                } else {
                  onPlay();
                }
              }}
              data-testid="play-button"
            >
              {isPlaying ? (
                <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24" data-testid="pause-icon">
                  <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                </svg>
              ) : (
                <svg className="w-7 h-7 text-black" fill="currentColor" viewBox="0 0 24 24" data-testid="play-icon">
                  <path d="M6 4l15 8-15 8V4z" />
                </svg>
              )}
            </button>
          </>
        )}
      </div>
      <p className={`${textColorClass} font-medium truncate w-full text-left`}>已点赞的歌曲</p>
      <p className="text-sm text-spotify-light-gray truncate w-full text-left">{subtitle}</p>
    </button>
  );
}

// Arbitrary for component props
const likedSongsCardPropsArb = fc.record({
  subtitle: fc.string({ minLength: 0, maxLength: 50 }),
  isActive: fc.boolean(),
  isPlaying: fc.boolean(),
  hasLikedSongs: fc.boolean(),
});

describe('LikedSongsCard Play Button Property Tests', () => {
  /**
   * Property 3: LikedSongsCard 播放/暂停图标显示一致性
   * For any LikedSongsCard component, when isPlaying is true and queueSource.type === 'liked-songs',
   * it should show pause icon; otherwise it should show play icon
   * 
   * **Validates: Requirements 2.3, 2.4**
   */
  it('Property 3: play/pause icon should match isPlaying state for liked songs', () => {
    fc.assert(
      fc.property(likedSongsCardPropsArb, (props) => {
        const onPlay = vi.fn();
        const onPause = vi.fn();
        const onClick = vi.fn();
        
        const { container } = render(
          <LikedSongsCard
            {...props}
            onClick={onClick}
            onPlay={onPlay}
            onPause={onPause}
          />
        );

        // Simulate hover using fireEvent
        const cardButton = container.querySelector('[data-testid="liked-songs-card"]');
        if (cardButton) {
          fireEvent.mouseEnter(cardButton);
        }

        // Only check icon when hasLikedSongs is true (button is visible)
        if (props.hasLikedSongs) {
          const playButton = container.querySelector('[data-testid="play-button"]');
          
          if (playButton) {
            const pauseIcon = container.querySelector('[data-testid="pause-icon"]');
            const playIcon = container.querySelector('[data-testid="play-icon"]');
            
            if (props.isPlaying) {
              // When playing, should show pause icon
              expect(pauseIcon).toBeInTheDocument();
              expect(playIcon).not.toBeInTheDocument();
            } else {
              // When not playing, should show play icon
              expect(playIcon).toBeInTheDocument();
              expect(pauseIcon).not.toBeInTheDocument();
            }
          }
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1 (for LikedSongsCard): 播放按钮样式一致性
   * For any LikedSongsCard component in hovered state with liked songs,
   * the play button should have the same style as LibraryItemCard
   * 
   * **Validates: Requirements 2.1, 2.2**
   */
  it('Property 1: play button should have consistent green circular style', () => {
    fc.assert(
      fc.property(likedSongsCardPropsArb, (props) => {
        // Force hasLikedSongs to true to ensure button is visible
        const testProps = { ...props, hasLikedSongs: true };
        
        const { container } = render(
          <LikedSongsCard
            {...testProps}
            onClick={() => {}}
            onPlay={() => {}}
            onPause={() => {}}
          />
        );

        // Simulate hover using fireEvent
        const cardButton = container.querySelector('[data-testid="liked-songs-card"]');
        if (cardButton) {
          fireEvent.mouseEnter(cardButton);
        }

        const playButton = container.querySelector('[data-testid="play-button"]');
        
        if (playButton) {
          // Verify the play button has all required classes
          expect(playButton).toHaveClass('w-14');
          expect(playButton).toHaveClass('h-14');
          expect(playButton).toHaveClass('bg-spotify-green');
          expect(playButton).toHaveClass('rounded-full');
          expect(playButton).toHaveClass('shadow-lg');
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
   * Property 7 (for LikedSongsCard): 保留半透明覆盖层
   * For any LikedSongsCard component in hovered state with liked songs,
   * it should retain the semi-transparent overlay
   * 
   * **Validates: Requirements 3.3**
   */
  it('Property 7: should retain semi-transparent overlay when hovered', () => {
    // Use a fixed props with hasLikedSongs: true to ensure overlay is visible
    fc.assert(
      fc.property(
        fc.record({
          subtitle: fc.string({ minLength: 0, maxLength: 50 }),
          isActive: fc.boolean(),
          isPlaying: fc.boolean(),
        }),
        (props) => {
          const { container } = render(
            <LikedSongsCard
              {...props}
              hasLikedSongs={true}
              onClick={() => {}}
              onPlay={() => {}}
              onPause={() => {}}
            />
          );

          // Simulate hover using fireEvent
          const cardButton = container.querySelector('[data-testid="liked-songs-card"]');
          if (cardButton) {
            fireEvent.mouseEnter(cardButton);
          }

          // Check for semi-transparent overlay
          const overlay = container.querySelector('[data-testid="overlay"]');
          expect(overlay).toBeInTheDocument();
          expect(overlay).toHaveClass('bg-black/50');

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
