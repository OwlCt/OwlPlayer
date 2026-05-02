import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { loadMobileNavigationState, isStandaloneMode } from '../../hooks/useMobileStatePersistence';

/**
 * MobileStateRestorer - Restores navigation state on app startup in PWA standalone mode.
 * 
 * This component should be rendered inside the Router context but before routes.
 * It checks for saved navigation state and redirects to the saved path on initial load.
 * 
 * Requirements: 10.2 - State persistence for mobile
 */
export default function MobileStateRestorer() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuthStore();
  const hasRestoredRef = useRef(false);

  useEffect(() => {
    // Only restore once, when authenticated, and in standalone mode
    if (hasRestoredRef.current || !isAuthenticated) return;
    
    // Only restore if we're at the root path (fresh app start)
    // Don't restore if user navigated to a specific URL
    if (location.pathname !== '/') return;

    hasRestoredRef.current = true;

    const savedState = loadMobileNavigationState();
    if (!savedState) return;

    // Don't restore to auth pages
    const authPaths = ['/login', '/register', '/verify-email', '/forgot-password'];
    if (authPaths.some(path => savedState.pathname.startsWith(path))) return;

    // Don't restore if already at the saved path
    if (savedState.pathname === location.pathname) return;

    // Navigate to the saved path
    // Use replace to avoid adding to history stack
    navigate(savedState.pathname, { replace: true });
  }, [isAuthenticated, location.pathname, navigate]);

  // This component doesn't render anything
  return null;
}
