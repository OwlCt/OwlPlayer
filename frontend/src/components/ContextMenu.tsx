import {
  useEffect,
  useRef,
  useCallback,
  useState,
  useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';

export interface MenuPosition {
  x: number;
  y: number;
}

export interface MenuAnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export type MenuPlacement =
  | 'top-start'
  | 'top-end'
  | 'bottom-start'
  | 'bottom-end';

interface ContextMenuProps {
  isOpen: boolean;
  position: MenuPosition;
  onClose: () => void;
  children: React.ReactNode;
  closeOnScroll?: boolean;
  anchorRect?: MenuAnchorRect;
  placement?: MenuPlacement;
  offset?: number;
  className?: string;
}

interface MenuItemProps {
  icon?: React.ReactNode;
  label: string;
  onClick?: () => void;
  hasSubmenu?: boolean;
  submenu?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}

interface MenuDividerProps {}

// Calculate menu position to keep it within viewport
export function calculateMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number
): MenuPosition {
  const padding = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = x;
  let adjustedY = y;

  // Adjust horizontal position
  if (x + menuWidth + padding > viewportWidth) {
    adjustedX = viewportWidth - menuWidth - padding;
  }
  if (adjustedX < padding) {
    adjustedX = padding;
  }

  // Adjust vertical position
  if (y + menuHeight + padding > viewportHeight) {
    adjustedY = viewportHeight - menuHeight - padding;
  }
  if (adjustedY < padding) {
    adjustedY = padding;
  }

  return { x: adjustedX, y: adjustedY };
}

interface CalculateAnchoredMenuPositionOptions {
  anchorRect: MenuAnchorRect;
  menuWidth: number;
  menuHeight: number;
  placement?: MenuPlacement;
  offset?: number;
}

export function calculateAnchoredMenuPosition({
  anchorRect,
  menuWidth,
  menuHeight,
  placement = 'bottom-start',
  offset = 8,
}: CalculateAnchoredMenuPositionOptions): MenuPosition {
  const padding = 8;
  const viewportHeight = window.innerHeight;
  const prefersTop = placement.startsWith('top');
  const alignEnd = placement.endsWith('end');
  const topY = anchorRect.top - menuHeight - offset;
  const bottomY = anchorRect.bottom + offset;
  const topFits = topY >= padding;
  const bottomFits = bottomY + menuHeight <= viewportHeight - padding;

  let anchoredY = prefersTop ? topY : bottomY;

  if (prefersTop && !topFits && bottomFits) {
    anchoredY = bottomY;
  } else if (!prefersTop && !bottomFits && topFits) {
    anchoredY = topY;
  }

  const anchoredX = alignEnd
    ? anchorRect.right - menuWidth
    : anchorRect.left;

  return calculateMenuPosition(
    anchoredX,
    anchoredY,
    menuWidth,
    menuHeight,
  );
}


// Main ContextMenu component
export function ContextMenu({
  isOpen,
  position,
  onClose,
  children,
  closeOnScroll = true,
  anchorRect,
  placement = 'bottom-start',
  offset = 8,
  className = '',
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState<MenuPosition>(position);

  // Handle click outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  // Handle escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  // Handle scroll
  const handleScroll = useCallback(() => {
    onClose();
  }, [onClose]);

  // Adjust position when menu opens or position changes
  useLayoutEffect(() => {
    if (isOpen && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newPosition = anchorRect
        ? calculateAnchoredMenuPosition({
            anchorRect,
            menuWidth: rect.width,
            menuHeight: rect.height,
            placement,
            offset,
          })
        : calculateMenuPosition(
            position.x,
            position.y,
            rect.width,
            rect.height
          );
      setAdjustedPosition(newPosition);
    }
  }, [anchorRect, isOpen, offset, placement, position]);

  // Add event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      if (closeOnScroll) {
        window.addEventListener('scroll', handleScroll, true);
      }

      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
        if (closeOnScroll) {
          window.removeEventListener('scroll', handleScroll, true);
        }
      };
    }
  }, [isOpen, handleClickOutside, handleKeyDown, handleScroll, closeOnScroll]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`fixed z-[9999] min-w-[200px] py-1 bg-[#282828] rounded-md shadow-xl border border-white/10 ${className}`.trim()}
      style={{
        left: adjustedPosition.x,
        top: adjustedPosition.y,
      }}
    >
      {children}
    </div>,
    document.body
  );
}


// Menu item component
export function MenuItem({ icon, label, onClick, hasSubmenu, submenu, disabled, danger }: MenuItemProps) {
  const [showSubmenu, setShowSubmenu] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submenuPosition, setSubmenuPosition] = useState<'right' | 'left'>('right');

  // Calculate submenu position based on available space
  useEffect(() => {
    if (showSubmenu && itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect();
      const submenuWidth = 220; // Approximate submenu width
      const viewportWidth = window.innerWidth;

      if (rect.right + submenuWidth > viewportWidth) {
        setSubmenuPosition('left');
      } else {
        setSubmenuPosition('right');
      }
    }
  }, [showSubmenu]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    if (disabled) return;
    if (!hasSubmenu && onClick) {
      onClick();
    }
  };

  const handleMouseEnter = () => {
    if (hasSubmenu) {
      // Clear any pending close timeout
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
      setShowSubmenu(true);
    }
  };

  const handleMouseLeave = () => {
    if (hasSubmenu) {
      // Add delay before closing to allow moving to submenu
      closeTimeoutRef.current = setTimeout(() => {
        setShowSubmenu(false);
      }, 150);
    }
  };

  const handleSubmenuMouseEnter = () => {
    // Cancel close when entering submenu
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleSubmenuMouseLeave = () => {
    // Close submenu when leaving it
    closeTimeoutRef.current = setTimeout(() => {
      setShowSubmenu(false);
    }, 100);
  };

  const baseClasses = `
    flex items-center gap-3 px-3 py-2 text-sm cursor-pointer relative
    ${disabled ? 'text-gray-500 cursor-not-allowed' : danger ? 'text-red-400 hover:bg-white/10' : 'text-white hover:bg-white/10'}
  `;

  return (
    <div
      ref={itemRef}
      className={baseClasses}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {icon && <span className="w-5 h-5 flex items-center justify-center">{icon}</span>}
      <span className="flex-1">{label}</span>
      {hasSubmenu && (
        <>
          <span className="text-gray-400">›</span>
          {showSubmenu && submenu && (
            <div
              ref={submenuRef}
              className={`absolute top-0 min-w-[200px] py-1 bg-[#282828] rounded-md shadow-xl border border-white/10 ${
                submenuPosition === 'right' ? 'left-full ml-1' : 'right-full mr-1'
              }`}
              onMouseEnter={handleSubmenuMouseEnter}
              onMouseLeave={handleSubmenuMouseLeave}
            >
              {submenu}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Menu divider component
export function MenuDivider({}: MenuDividerProps) {
  return <div className="my-1 border-t border-white/10" />;
}

// Export types for external use
export type { ContextMenuProps, MenuItemProps };
