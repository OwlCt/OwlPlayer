import { useLocation, useNavigate } from 'react-router-dom';
import { useNavigationStore, SourceTab } from '../../store/navigationStore';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

// Search icon component - with filled center circle when active
const SearchIcon = ({ filled = false, className = "w-6 h-6" }: { filled?: boolean; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Magnifying glass circle */}
    <circle cx="11" cy="11" r="8" />
    {/* Handle */}
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    {/* Inner filled circle when active - with gap from outer circle */}
    {filled && <circle cx="11" cy="11" r="5" fill="currentColor" stroke="none" />}
  </svg>
);

// Home icon component - consistent style for hollow/filled states
const HomeIcon = ({ filled = false, className = "w-6 h-6" }: { filled?: boolean; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round">
    {filled ? (
      <>
        {/* Filled house - draw house shape with wider door opening at bottom */}
        <path 
          d="M12 2L3 9v11a2 2 0 0 0 2 2h3v-10h8v10h3a2 2 0 0 0 2-2V9L12 2z" 
          fill="currentColor" 
          stroke="currentColor" 
          strokeWidth="2"
        />
      </>
    ) : (
      <>
        {/* Hollow house outline with door opening at bottom */}
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4v-10h-6v10H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" strokeWidth="2" />
      </>
    )}
  </svg>
);

// Library icon component - two vertical bars + hollow square (IID style)
const LibraryIcon = ({ filled = false, className = "w-6 h-6" }: { filled?: boolean; className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    {/* First vertical bar */}
    <rect x="3" y="3" width="2.5" height="18" rx="1" />
    {/* Second vertical bar */}
    <rect x="8" y="3" width="2.5" height="18" rx="1" />
    {/* Square - filled keeps stroke outline, hollow has stroke only */}
    {filled ? (
      <rect x="14" y="4" width="7" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
    ) : (
      <rect x="14" y="4" width="7" height="16" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    )}
  </svg>
);

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
  activeIcon: React.ReactNode;
  matchPaths?: string[]; // Additional paths that should highlight this nav item
}

const navItems: NavItem[] = [
  {
    id: 'home',
    label: '主页',
    path: '/',
    icon: <HomeIcon className="w-6 h-6" />,
    activeIcon: <HomeIcon filled className="w-6 h-6" />,
    matchPaths: ['/recently-played'],
  },
  {
    id: 'search',
    label: '搜索',
    path: '/search',
    icon: <SearchIcon className="w-6 h-6" />,
    activeIcon: <SearchIcon filled className="w-6 h-6" />,
  },
  {
    id: 'library',
    label: '音乐库',
    path: '/library',
    icon: <LibraryIcon className="w-6 h-6" />,
    activeIcon: <LibraryIcon filled className="w-6 h-6" />,
    matchPaths: ['/liked-songs'],
  },
];

// Detail page paths that should inherit sourceTab highlighting
const DETAIL_PAGE_PREFIXES = ['/playlist/', '/album/', '/artist/'];

/**
 * Check if current path is a detail page (album, artist, playlist)
 */
function isDetailPage(path: string): boolean {
  return DETAIL_PAGE_PREFIXES.some(prefix => path.startsWith(prefix));
}

/**
 * Determines if a navigation item should be active based on current path and source tab
 */
export function isNavItemActive(item: NavItem, currentPath: string, sourceTab: SourceTab = null): boolean {
  // Extract pathname without query string for comparison
  const pathWithoutQuery = currentPath.split('?')[0];
  
  // Exact match for main path (ignoring query string)
  if (pathWithoutQuery === item.path) return true;
  
  // For detail pages (album, artist, playlist), use sourceTab to determine which nav item is active
  // If sourceTab is null (e.g., direct URL access), default to 'home' for better UX
  if (isDetailPage(pathWithoutQuery)) {
    const effectiveSourceTab = sourceTab || 'home';
    return item.id === effectiveSourceTab;
  }
  
  // Check additional match paths (prefix match) for non-detail pages
  if (item.matchPaths) {
    return item.matchPaths.some(matchPath => pathWithoutQuery.startsWith(matchPath));
  }
  
  return false;
}

interface BottomNavigationProps {
  className?: string;
}

/**
 * Bottom navigation bar for mobile UI.
 * Fixed at the bottom of the screen with safe area padding.
 * Displays Home, Search, and Library navigation items.
 * 
 * Requirements: 1.1, 1.2, 1.4
 */
export default function BottomNavigation({ className = '' }: BottomNavigationProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const { sourceTab, setSourceTab } = useNavigationStore();
  const { isOnline } = useOnlineStatus();

  const handleNavigate = (path: string, item: NavItem) => {
    // 如果已经在当前导航项对应的页面，不执行导航
    if (isNavItemActive(item, currentPath, sourceTab)) {
      return;
    }
    // Set source tab when navigating to a main tab
    setSourceTab(item.id as SourceTab);
    navigate(path);
  };

  return (
    <nav 
      className={`fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-black/90 border-t border-white/10 z-50 ${className}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const isActive = isNavItemActive(item, currentPath, sourceTab);
          
          return (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.path, item)}
              disabled={isActive}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[64px] min-h-[44px] transition-colors ${
                isActive ? 'text-white' : 'text-spotify-light-gray'
              } ${isActive ? 'cursor-default' : 'cursor-pointer'}`}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              <span className="mb-1">
                {isActive ? item.activeIcon : item.icon}
              </span>
              <span className="text-[10px] font-medium">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      
      {/* 离线模式提示条 - 在导航栏下方 */}
      <div 
        className="flex items-center justify-center bg-black overflow-hidden transition-all duration-200"
        style={{ height: !isOnline ? '28px' : '0px' }}
      >
        <span className="text-xs text-white/70">离线模式</span>
      </div>
      
      {/* Safe area padding */}
      <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="bg-black" />
    </nav>
  );
}
