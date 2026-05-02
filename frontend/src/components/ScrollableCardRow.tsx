import { useState, useRef, useEffect, ReactNode, Children } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useIsMobile } from '../hooks/useIsMobile';

interface ScrollableCardRowProps {
  children: ReactNode;
  /** Card width in pixels (default: 200, mobile: 140) */
  cardWidth?: number;
  /** Card width on mobile in pixels (default: 140) */
  mobileCardWidth?: number;
  /** Gap between cards in pixels (default: 16, mobile: 12) */
  gap?: number;
  /** Gap between cards on mobile in pixels (default: 12) */
  mobileGap?: number;
  /** Padding to align with parent container edge (default: 24 for p-6 pages, use 32 for p-8 pages) */
  edgePadding?: number;
  /** Padding on mobile (default: 12) */
  mobileEdgePadding?: number;
}

/**
 * A horizontally scrollable card row with hover-activated scroll buttons.
 * Cards have a fixed width and the row scrolls smoothly when buttons are clicked.
 * Automatically uses smaller card sizes on mobile viewports.
 */
export default function ScrollableCardRow({
  children,
  cardWidth = 200,
  mobileCardWidth = 140,
  gap = 16,
  mobileGap = 12,
  edgePadding = 24,
  mobileEdgePadding = 12,
}: ScrollableCardRowProps) {
  const isMobile = useIsMobile();
  
  // Use mobile-optimized values on small screens
  const effectiveCardWidth = isMobile ? mobileCardWidth : cardWidth;
  const effectiveGap = isMobile ? mobileGap : gap;
  const effectiveEdgePadding = isMobile ? mobileEdgePadding : edgePadding;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll state
  const updateScrollState = () => {
    if (!containerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', updateScrollState);
      // Also check on resize
      const resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(container);
      return () => {
        container.removeEventListener('scroll', updateScrollState);
        resizeObserver.disconnect();
      };
    }
  }, [children]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;
    const scrollAmount = containerRef.current.clientWidth * 0.8;
    containerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <div
      className="relative"
      // Only enable hover detection on non-mobile (desktop) to avoid touch event conflicts
      onMouseEnter={isMobile ? undefined : () => setIsHovered(true)}
      onMouseLeave={isMobile ? undefined : () => setIsHovered(false)}
    >
      {/* Left scroll button - hidden on mobile since users can swipe */}
      {!isMobile && canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className={`absolute top-1/2 z-10 w-10 h-10 bg-black/70 hover:bg-black/90 hover:scale-110 rounded-full flex items-center justify-center text-white shadow-lg transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ left: '8px', transform: 'translateY(-50%)' }}
        >
          <FiChevronLeft size={20} />
        </button>
      )}

      {/* Right scroll button - hidden on mobile since users can swipe */}
      {!isMobile && canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className={`absolute top-1/2 z-10 w-10 h-10 bg-black/70 hover:bg-black/90 hover:scale-110 rounded-full flex items-center justify-center text-white shadow-lg transition-opacity duration-200 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ right: '8px', transform: 'translateY(-50%)' }}
        >
          <FiChevronRight size={20} />
        </button>
      )}

      {/* Scrollable container */}
      <div
        ref={containerRef}
        className="flex overflow-x-auto scrollbar-hide"
        style={{ gap: `${effectiveGap}px`, paddingLeft: `${effectiveEdgePadding}px`, paddingRight: `${effectiveEdgePadding}px` }}
      >
        {Children.map(children, (child) => (
          <div style={{ width: effectiveCardWidth, flexShrink: 0 }}>
            {child}
          </div>
        ))}
      </div>

      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}
