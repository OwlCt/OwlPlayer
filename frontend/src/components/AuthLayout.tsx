import { ReactNode } from 'react';
const owlLogo = '/OwlPlayer-400x400.png';

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * AuthLayout provides a standalone full-screen layout for authentication pages.
 * It hides the sidebar, top navigation bar, and player bar to provide a focused
 * authentication experience.
 * Supports both desktop and mobile layouts with responsive design.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-900 to-black flex flex-col safe-area-top safe-area-bottom">
      {/* Logo - responsive positioning for mobile */}
      <div className="px-4 py-4 sm:absolute sm:top-8 sm:left-8 sm:p-0">
        <div className="flex items-center gap-3 justify-center sm:justify-start">
          <img src={owlLogo} alt="OwlPlayer" className="w-10 h-10 rounded-md shadow-sm" />
          <span className="text-2xl font-bold text-white">OwlPlayer</span>
        </div>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
}
