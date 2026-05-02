import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { FiUser, FiSettings, FiClock, FiLogOut, FiUsers } from 'react-icons/fi';

const DEFAULT_AVATAR = '/api/avatars/default.svg';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * MobileSidebar - 移动端侧边栏菜单
 * 从左侧滑入，包含用户信息和导航菜单
 */
export default function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();

  // 按 Escape 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleLogout = useCallback(() => {
    logout();
    onClose();
    navigate('/');
  }, [logout, onClose, navigate]);

  const handleNavigation = useCallback((path: string) => {
    onClose();
    navigate(path);
  }, [onClose, navigate]);

  const avatarUrl = user?.avatar_url || DEFAULT_AVATAR;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 背景遮罩 */}
          <motion.div
            className="fixed inset-0 z-[9999] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
          />

          {/* 侧边栏 */}
          <motion.div
            className="fixed top-0 left-0 bottom-0 z-[9999] w-[280px] bg-[#121212] safe-area-bottom"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
          >
            {/* 用户信息区域 - 只用内联 paddingTop 处理 safe area，避免双重 padding */}
            <div 
              className="px-5 pb-5 border-b border-white/10"
              style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
            >
              {isAuthenticated && user ? (
                <button
                  onClick={() => handleNavigation('/profile')}
                  className="flex items-center gap-3 w-full text-left"
                >
                  <img
                    src={avatarUrl}
                    alt={user.username}
                    className="w-12 h-12 rounded-full object-cover bg-neutral-700"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-semibold text-base truncate">
                      {user.username}
                    </div>
                    <div className="text-white/60 text-sm">查看个人资料</div>
                  </div>
                </button>
              ) : (
                <Link
                  to="/login"
                  onClick={onClose}
                  className="flex items-center gap-3"
                >
                  <div className="w-12 h-12 rounded-full bg-neutral-700 flex items-center justify-center">
                    <FiUser size={24} className="text-white/60" />
                  </div>
                  <div className="text-white font-semibold">登录</div>
                </Link>
              )}
            </div>

            {/* 菜单列表 */}
            <div className="py-2">
              <SidebarMenuItem
                icon={<FiClock size={22} />}
                label="最近播放"
                onClick={() => handleNavigation('/recently-played')}
              />
              <SidebarMenuItem
                icon={<FiSettings size={22} />}
                label="设置和隐私"
                onClick={() => handleNavigation('/settings')}
              />
              
              {user?.is_admin && (
                <SidebarMenuItem
                  icon={<FiUsers size={22} />}
                  label="系统管理"
                  onClick={() => handleNavigation('/admin')}
                />
              )}
            </div>

            {/* 退出登录 */}
            {isAuthenticated && (
              <div className="absolute bottom-0 left-0 right-0 safe-area-bottom">
                <div className="px-5 pb-2 text-white/30 text-xs text-center">
                  版本 {__APP_VERSION__}
                </div>
                <div className="border-t border-white/10">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-4 w-full px-5 py-4 text-white/80 active:bg-white/10"
                  >
                    <FiLogOut size={22} />
                    <span className="text-[15px]">退出登录</span>
                  </button>
                </div>
              </div>
            )}

            {/* 未登录时也显示版本号 */}
            {!isAuthenticated && (
              <div className="absolute bottom-0 left-0 right-0 safe-area-bottom">
                <div className="px-5 pb-4 text-white/30 text-xs text-center">
                  版本 {__APP_VERSION__}
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

interface SidebarMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function SidebarMenuItem({ icon, label, onClick }: SidebarMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full px-5 py-3.5 text-white active:bg-white/10 transition-colors"
    >
      <span className="text-white/70">{icon}</span>
      <span className="text-[15px]">{label}</span>
    </button>
  );
}
