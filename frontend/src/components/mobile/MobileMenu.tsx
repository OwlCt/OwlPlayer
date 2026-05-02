import React from 'react';
import MobileBottomSheet from './MobileBottomSheet';
import CachedImage from '../CachedImage';
import { getProxiedImageUrl } from '../../utils/image';

/**
 * Mobile menu header info - displays artwork, title, and subtitle
 */
export interface MobileMenuHeader {
  /** Artwork URL */
  artworkUrl?: string;
  /** Main title (e.g., song name, album name) */
  title: string;
  /** Subtitle (e.g., artist name, track count) */
  subtitle?: string;
}

/**
 * Mobile menu item props
 */
export interface MobileMenuItemProps {
  /** Icon element */
  icon: React.ReactNode;
  /** Menu item label */
  label: string;
  /** Click handler */
  onClick?: () => void;
  /** Whether the item is disabled */
  disabled?: boolean;
  /** Whether this is a destructive action (shown in red) */
  danger?: boolean;
}

/**
 * MobileMenuItem component - Individual menu item with icon and label
 * Touch-optimized with minimum 48px height for easy tapping
 */
export function MobileMenuItem({ icon, label, onClick, disabled, danger }: MobileMenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-4 px-5 py-3.5 min-h-[52px]
        transition-colors active:bg-white/10
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${danger ? 'text-red-400' : 'text-white'}
      `}
    >
      <span className="w-6 h-6 flex items-center justify-center text-white/70 flex-shrink-0">
        {icon}
      </span>
      <span className="text-[15px] font-normal">{label}</span>
    </button>
  );
}

/**
 * MobileMenuDivider component - Visual separator between menu sections
 */
export function MobileMenuDivider() {
  return <div className="my-1 mx-5 border-t border-white/10" />;
}

/**
 * MobileMenuHeader component - Header section with artwork and info
 */
function MobileMenuHeaderSection({ header }: { header: MobileMenuHeader }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
      {/* Artwork */}
      <div className="w-12 h-12 rounded overflow-hidden bg-neutral-800 flex-shrink-0">
        {header.artworkUrl ? (
          <CachedImage
            src={getProxiedImageUrl(header.artworkUrl, 96)}
            alt={header.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-xl">
            ♪
          </div>
        )}
      </div>
      
      {/* Title and subtitle */}
      <div className="flex-1 min-w-0">
        <div className="text-white font-semibold text-[15px] truncate">
          {header.title}
        </div>
        {header.subtitle && (
          <div className="text-white/60 text-sm truncate">
            {header.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MobileMenu props
 */
interface MobileMenuProps {
  /** Whether the menu is open */
  isOpen: boolean;
  /** Callback when the menu should close */
  onClose: () => void;
  /** Optional header with artwork and info */
  header?: MobileMenuHeader;
  /** Menu content (MobileMenuItem components) */
  children: React.ReactNode;
}

/**
 * MobileMenu component - Unified bottom sheet menu for mobile
 * 
 * Features:
 * - Bottom sheet presentation with slide-up animation
 * - Optional header with artwork, title, and subtitle
 * - Touch-optimized menu items (min 48px height)
 * - Swipe down to dismiss
 * - Backdrop tap to close
 * 
 * Usage:
 * ```tsx
 * <MobileMenu
 *   isOpen={menuOpen}
 *   onClose={() => setMenuOpen(false)}
 *   header={{ artworkUrl: song.artworkUrl, title: song.name, subtitle: song.artistName }}
 * >
 *   <MobileMenuItem icon={<IoShare />} label="分享" onClick={handleShare} />
 *   <MobileMenuItem icon={<IoAdd />} label="加入歌单" onClick={handleAddToPlaylist} />
 *   <MobileMenuDivider />
 *   <MobileMenuItem icon={<IoTrash />} label="删除" onClick={handleDelete} danger />
 * </MobileMenu>
 * ```
 */
export default function MobileMenu({ isOpen, onClose, header, children }: MobileMenuProps) {
  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      showDragHandle={true}
    >
      {/* Header section */}
      {header && <MobileMenuHeaderSection header={header} />}
      
      {/* Menu items */}
      <div className="py-2">
        {children}
      </div>
    </MobileBottomSheet>
  );
}
