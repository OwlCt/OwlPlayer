import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import ScrollableCardRow from './ScrollableCardRow';
import { useIsMobile } from '../hooks/useIsMobile';

interface RecommendationSectionProps {
  title: string;
  viewAllPath?: string;
  children: ReactNode;
  itemCount: number;
  minItemsForViewAll?: number;
  /** Card width in pixels (default: 200) */
  cardWidth?: number;
  /** Gap between cards in pixels (default: 16) */
  gap?: number;
}

/**
 * Reusable recommendation section component with title and optional "显示全部" button.
 * Hides "显示全部" when items < minItemsForViewAll (default 6).
 * Uses horizontal scrolling with hover-activated scroll buttons.
 * Automatically adjusts styling for mobile viewports.
 */
export default function RecommendationSection({
  title,
  viewAllPath,
  children,
  itemCount,
  minItemsForViewAll = 6,
  cardWidth = 200,
  gap = 16,
}: RecommendationSectionProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const showViewAll = viewAllPath && itemCount >= minItemsForViewAll;

  return (
    <section 
      className={isMobile ? 'mb-6' : 'mb-8'} 
      style={{ marginLeft: isMobile ? '-12px' : '-24px', marginRight: isMobile ? '-12px' : '-24px' }}
    >
      <div 
        className={`flex items-center justify-between ${isMobile ? 'mb-2' : 'mb-4'}`} 
        style={{ paddingLeft: isMobile ? '12px' : '40px', paddingRight: isMobile ? '12px' : '40px' }}
      >
        <h2 className={`font-bold text-white ${isMobile ? 'text-lg' : 'text-2xl'}`}>{title}</h2>
        {showViewAll && (
          <button
            onClick={() => navigate(viewAllPath)}
            className="text-sm font-semibold text-white/60 hover:text-white transition-colors"
          >
            显示全部
          </button>
        )}
      </div>
      <ScrollableCardRow cardWidth={cardWidth} gap={gap}>
        {children}
      </ScrollableCardRow>
    </section>
  );
}
