import { ReactNode } from 'react';
import { FiChevronLeft } from 'react-icons/fi';
import ScrollingText from '../ScrollingText';
import { useGoBack } from '../../hooks/useNavigationHistory';

export interface MobileHeaderProps {
  /** Title to show when header becomes opaque */
  title?: string;
  /** Header opacity (0-1), controls background and title visibility */
  opacity?: number;
  /** Background color when opaque */
  backgroundColor?: string;
  /** Whether to show back button */
  showBackButton?: boolean;
  /** Custom back button handler */
  onBack?: () => void;
  /** Right side content (e.g., play button) */
  rightContent?: ReactNode;
  /** Additional class names */
  className?: string;
}

/**
 * MobileHeader - Global header component for mobile pages
 * 
 * Features:
 * - Fixed position at top with safe area support
 * - Transparent to opaque transition based on scroll
 * - Back button with navigation (uses app-level navigation, not browser history)
 * - Title appears when scrolled (opacity controlled externally)
 * - Right side slot for action buttons
 */
export default function MobileHeader({
  title,
  opacity = 1,
  backgroundColor = 'rgb(18, 18, 18)',
  showBackButton = true,
  onBack,
  rightContent,
  className = '',
}: MobileHeaderProps) {
  const goBack = useGoBack();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      goBack();
    }
  };

  // Title opacity: starts appearing at 0.6 header opacity, fully visible at 0.9
  const titleOpacity = opacity < 0.6 ? 0 : Math.min(1, (opacity - 0.6) / 0.3);

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[70] ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >

      {/* Gradient background layer - extends into safe area for seamless look */}
      {/* Only render background when opacity is significant enough to be visible */}
      {opacity > 0.05 && (
        <div
          className="absolute inset-0"
          style={{
            top: 0, // 从顶部开始，延伸到状态栏区域
            background: `linear-gradient(180deg, rgb(${hexToRgb(backgroundColor)}) 0%, rgb(0, 0, 0) 100%)`,
            opacity: opacity,
          }}
        />
      )}
      <div className="relative z-10 flex items-center px-2 py-3 h-14">
        {/* Back button - always visible with larger touch target */}
        {showBackButton && (
          <button
            onClick={handleBack}
            className="w-10 h-10 flex items-center justify-center text-white flex-shrink-0 z-10"
            aria-label="返回"
          >
            <FiChevronLeft size={24} />
          </button>
        )}

        {/* Title - centered absolutely */}
        <div
          className="absolute left-0 right-0 flex justify-center px-14"
          style={{ opacity: titleOpacity }}
        >
          {title && (
            <div className="max-w-[60%]">
              <ScrollingText text={title} className="font-bold text-white text-center" />
            </div>
          )}
        </div>

        {/* Spacer to push right content to the end */}
        <div className="flex-1" />

        {/* Right content slot */}
        {rightContent && (
          <div className="z-10" style={{ opacity: titleOpacity }}>
            {rightContent}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Convert hex color or rgb string to RGB values
 */
function hexToRgb(color: string): string {
  // Handle rgb/rgba format
  if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      return `${match[0]}, ${match[1]}, ${match[2]}`;
    }
  }
  
  // Handle hex format
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return `${r}, ${g}, ${b}`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  }
  
  // Default fallback
  return '18, 18, 18';
}
