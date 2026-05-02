import { useRef, RefObject, ReactNode, CSSProperties, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { FiClock } from 'react-icons/fi';
import { OverlayScrollbarsComponent, OverlayScrollbarsComponentRef } from 'overlayscrollbars-react';
import { useScrollHeader } from '../hooks/useScrollHeader';
import { useScrollPosition } from '../hooks/useScrollPosition';
import { useNavigationStore } from '../store/navigationStore';

export interface StickyHeaderProps {
  /** Content name (album/artist/playlist name) */
  title: string;
  /** Theme color for background gradient */
  themeColor: string;
  /** Play button click callback */
  onPlay: () => void;
  /** Reference to the action bar element for scroll threshold calculation */
  actionBarRef: RefObject<HTMLElement>;
  /** Children (page content) */
  children: ReactNode;
  /** Whether to show track list header in sticky header */
  showTrackHeader?: boolean;
  /** Custom track header content (overrides default header) */
  customTrackHeader?: ReactNode;
  /** Extra offset to trigger header earlier (positive = earlier trigger) */
  triggerOffset?: number;
  /** Whether the current source is playing (for showing pause icon) */
  isCurrentSourcePlaying?: boolean;
  /** Whether to preserve and restore scroll position */
  preserveScrollPosition?: boolean;
}

const DEFAULT_THEME_COLOR = 'rgb(18, 18, 18)';

/**
 * StickyHeader component that provides:
 * - Sticky header with play button and title when scrolled past action bar
 * - Track list header that sticks below the main header
 */
export function StickyHeader({
  title,
  themeColor,
  onPlay,
  actionBarRef,
  children,
  showTrackHeader = true,
  customTrackHeader,
  triggerOffset = 0,
  isCurrentSourcePlaying = false,
  preserveScrollPosition = false,
}: StickyHeaderProps) {
  const osRef = useRef<OverlayScrollbarsComponentRef>(null);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (osRef.current) {
      const instance = osRef.current.osInstance();
      if (instance) {
        setViewport(instance.elements().viewport);
      }
    }
  }, []);

  const { isHeaderVisible, headerOpacity } = useScrollHeader(
    actionBarRef,
    viewport,
    100,
    triggerOffset
  );
  
  // Preserve and restore scroll position when navigating back
  useScrollPosition(viewport, { restoreOnMount: preserveScrollPosition, key: 'sticky' });

  // Force re-apply saved scroll after overlayscrollbars initializes to avoid late resets
  useEffect(() => {
    if (!viewport || !preserveScrollPosition) return;
    const pathKey = `${location.pathname}::sticky`;
    const saved = useNavigationStore.getState().getScrollPosition(pathKey);
    if (!saved) return;

    const apply = () => {
      viewport.scrollTop = saved;
    };

    apply();
    const ids = [50, 150, 300].map((delay) => setTimeout(apply, delay));
    return () => ids.forEach(clearTimeout);
  }, [viewport, preserveScrollPosition, location.pathname]);

  const effectiveThemeColor = themeColor || DEFAULT_THEME_COLOR;
  
  // Show header when there's any opacity
  const showHeader = headerOpacity > 0;
  const trackHeaderHeight = isHeaderVisible && showTrackHeader ? 36 : 0;

  return (
    <OverlayScrollbarsComponent
      ref={osRef}
      className="h-full"
      options={{ 
        scrollbars: { 
          theme: 'os-theme-light',
          autoHide: 'move',
          clickScroll: true
        } 
      }}
      events={{
        initialized: (instance) => {
          setViewport(instance.elements().viewport);
        }
      }}
      data-testid="sticky-header-container"
    >
      {/* Sticky header overlay - uses absolute positioning within scroll container */}
      <div
        className="sticky top-0 left-0 right-0 z-50"
        style={{
          pointerEvents: showHeader ? 'auto' : 'none',
          height: 0, // Don't take up space
          overflow: 'visible',
        }}
        data-testid="sticky-header-fixed"
      >
        {/* Main header with play button and title - pure fade in/out */}
        <div
          className="px-8 py-3 flex items-center gap-4"
          style={{
            background: effectiveThemeColor,
            opacity: headerOpacity,
          }}
          data-testid="sticky-header-bar"
          data-theme-color={effectiveThemeColor}
        >
          {/* Play button */}
          <button
            onClick={onPlay}
            className="w-12 h-12 bg-spotify-green rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform flex-shrink-0"
            aria-label={isCurrentSourcePlaying ? 'Pause' : 'Play'}
            data-testid="sticky-header-play-button"
          >
            <svg className="w-6 h-6 text-black" fill="currentColor" viewBox="0 0 24 24">
              {isCurrentSourcePlaying ? (
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              ) : (
                <path d="M6 4l15 8-15 8V4z" />
              )}
            </svg>
          </button>
          
          {/* Title */}
          <h2 
            className="text-xl font-bold truncate"
            data-testid="sticky-header-title"
          >
            {title}
          </h2>
        </div>
        
        {/* Track list header row - appears instantly when action bar is fully covered */}
        {showTrackHeader && (
          <div 
            style={{
              background: DEFAULT_THEME_COLOR,
              opacity: isHeaderVisible ? 1 : 0,
            }}
          >
            {customTrackHeader ? (
              customTrackHeader
            ) : (
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-4 px-4 mx-8 py-2 text-sm text-white/60 border-b border-white/10">
                <span className="w-8 text-center">#</span>
                <span>标题</span>
                <span className="w-8"></span>
                <span className="w-12 flex items-center justify-end">
                  <FiClock size={16} />
                </span>
                <span className="w-8"></span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Page content */}
      {children}
    </OverlayScrollbarsComponent>
  );
}

export default StickyHeader;
