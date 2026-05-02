import { ReactNode, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useIsMobile } from '../hooks/useIsMobile';

interface ProtectedRouteProps {
  children: ReactNode;
  requireActive?: boolean;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ 
  children, 
  requireActive = true,
  requireAdmin = false 
}: ProtectedRouteProps) {
  const location = useLocation();
  const { isAuthenticated, user, initialize } = useAuthStore();
  const isMobile = useIsMobile();

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Check if we have a token in localStorage but not yet initialized in state
  const hasStoredToken = localStorage.getItem('auth-token') !== null;
  
  // Not authenticated and no stored token - redirect to login
  if (!isAuthenticated && !hasStoredToken) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  // Still initializing (has token but not yet authenticated in state)
  if (!isAuthenticated && hasStoredToken) {
    return null; // or a loading spinner
  }

  // Require admin but user is not admin
  if (requireAdmin && !user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  // Require active but user is not active - show only banner, block access
  if (requireActive && user && !user.is_active) {
    if (isMobile) {
      return <MobileInactiveAccountPage />;
    }
    return (
      <div className="min-h-full flex items-center justify-center">
        <InactiveAccountBanner />
      </div>
    );
  }

  return <>{children}</>;
}

// Inactive account banner component - blocks access until activated (Desktop)
export function InactiveAccountBanner() {
  const { logout } = useAuthStore();
  
  return (
    <div className="bg-neutral-900 rounded-xl p-8 max-w-md mx-auto text-center">
      <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg 
          className="w-8 h-8 text-yellow-400" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
          />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-white mb-2">账号未激活</h2>
      <p className="text-white/60 mb-6">
        您的账号尚未激活，无法使用任何功能。请联系管理员激活您的账号。
      </p>
      <button
        onClick={logout}
        className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
      >
        退出登录
      </button>
    </div>
  );
}

// Mobile-optimized inactive account page
export function MobileInactiveAccountPage() {
  const { logout, user } = useAuthStore();
  
  return (
    <div className="min-h-screen bg-black flex flex-col safe-area-all">
      {/* Header area with safe area padding */}
      <div className="pt-12 px-6 pb-4">
        <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto">
          <svg 
            className="w-10 h-10 text-yellow-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 px-6 flex flex-col">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white mb-3">账号未激活</h1>
          <p className="text-white/60 text-sm leading-relaxed">
            您的账号尚未激活，无法使用任何功能。请联系管理员激活您的账号。
          </p>
        </div>

        {/* User info card */}
        {user && (
          <div className="bg-white/5 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                <span className="text-white text-lg font-medium">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium truncate">{user.username}</p>
                <p className="text-white/50 text-sm truncate">{user.email}</p>
              </div>
              <div className="px-2 py-1 bg-yellow-500/20 rounded-full">
                <span className="text-yellow-400 text-xs font-medium">待激活</span>
              </div>
            </div>
          </div>
        )}

        {/* Info section */}
        <div className="bg-white/5 rounded-xl p-4 mb-auto">
          <h3 className="text-white/80 text-sm font-medium mb-3">如何激活账号？</h3>
          <ul className="text-white/50 text-xs space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">•</span>
              <span>联系系统管理员，提供您的用户名或邮箱</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">•</span>
              <span>管理员审核通过后会为您激活账号</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-yellow-400 mt-0.5">•</span>
              <span>激活后退出重新登录即可正常使用</span>
            </li>
          </ul>
        </div>

        {/* Logout button */}
        <div className="py-8">
          <button
            onClick={logout}
            className="w-full py-3.5 bg-white/10 active:bg-white/20 text-white rounded-full font-medium transition-colors"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
