import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import MobileSidebar from './MobileSidebar';

const DEFAULT_AVATAR = '/api/avatars/default.svg';

/**
 * MobileHomeHeader - 移动端主页顶部 Header
 * 左侧显示用户头像，点击弹出侧边栏菜单
 */
export default function MobileHomeHeader() {
  const { user, isAuthenticated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const avatarUrl = user?.avatar_url || DEFAULT_AVATAR;

  return (
    <>
      <header 
        className="fixed top-0 left-0 right-0 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', backgroundColor: '#121212' }}
      >
        <div className="flex items-center h-14 px-3">
          {/* 头像按钮 */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-full overflow-hidden bg-neutral-700 flex-shrink-0"
            aria-label="打开菜单"
          >
            {isAuthenticated && user ? (
              <img
                src={avatarUrl}
                alt={user.username}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/60">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            )}
          </button>

          {/* App 名称 */}
          <div className="flex-1 flex justify-center">
            <span className="text-lg font-bold text-white">OwlPlayer</span>
          </div>

          {/* 右侧占位，保持标题居中 */}
          <div className="w-9 h-9 flex-shrink-0" />
        </div>
      </header>

      {/* 侧边栏 */}
      <MobileSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
