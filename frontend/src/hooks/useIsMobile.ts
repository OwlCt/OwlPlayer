import { useState, useEffect, useRef } from 'react';

/**
 * Default mobile breakpoint (768px) - matches Tailwind's md breakpoint
 */
export const MOBILE_BREAKPOINT = 768;

/**
 * Tablet landscape breakpoint - iPad横屏宽度约为1024px+
 * 低于此宽度使用移动端布局，高于此宽度使用桌面端布局
 */
export const TABLET_LANDSCAPE_BREAKPOINT = 1024;

/**
 * Debounce delay for resize events to prevent rapid mode switching
 * Especially important for iPad when rotating or returning from background
 */
const RESIZE_DEBOUNCE_MS = 200;

/**
 * Check if the device is a tablet (iPad or Android tablet)
 */
function isTabletDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  
  const userAgent = navigator.userAgent;
  
  // Check for iPad (including iPadOS 13+ which reports as Mac)
  const isIPad = /iPad/.test(userAgent) || 
    (/Macintosh/.test(userAgent) && typeof document !== 'undefined' && 'ontouchend' in document);
  
  // Check for Android tablets (Android without "Mobile" in UA)
  const isAndroidTablet = /Android/i.test(userAgent) && !/Mobile/i.test(userAgent);
  
  return isIPad || isAndroidTablet;
}

/**
 * Check if the device is a phone (not tablet)
 */
function isPhoneDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  
  const userAgent = navigator.userAgent;
  
  // iPhone
  const isIPhone = /iPhone/.test(userAgent);
  
  // Android phone (has "Mobile" in UA)
  const isAndroidPhone = /Android/i.test(userAgent) && /Mobile/i.test(userAgent);
  
  return isIPhone || isAndroidPhone;
}

/**
 * Determine if current viewport should use mobile layout
 * 
 * Logic:
 * - Phone: always mobile layout
 * - Tablet portrait (width < 1024): mobile layout  
 * - Tablet landscape (width >= 1024): desktop layout
 * - Desktop: use standard breakpoint (768px)
 */
function shouldUseMobileLayout(breakpoint: number): boolean {
  if (typeof window === 'undefined') return false;
  
  const width = window.innerWidth;
  
  // Phone devices always use mobile layout
  if (isPhoneDevice()) {
    return true;
  }
  
  // Tablet devices: use mobile layout in portrait, desktop in landscape
  if (isTabletDevice()) {
    return width < TABLET_LANDSCAPE_BREAKPOINT;
  }
  
  // Desktop: use standard breakpoint
  return width < breakpoint;
}

/**
 * Hook to detect if the current viewport is mobile-sized.
 * Uses a responsive breakpoint of 768px by default.
 * 
 * Enhanced for iPad/tablet support:
 * - iPad横屏 (>=1024px): 桌面端布局
 * - iPad竖屏 (<1024px): 移动端布局
 * - iPhone: 始终移动端布局
 * - 桌面端: 使用标准768px断点
 * - 防抖处理防止快速切换
 * 
 * @param breakpoint - The width threshold below which is considered mobile (default: 768px)
 * @returns boolean - true if should use mobile layout
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(() => shouldUseMobileLayout(breakpoint));
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMobileStateRef = useRef(isMobile);

  useEffect(() => {
    // Handler to update state on resize with debouncing
    const handleResize = () => {
      // Clear any pending debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      
      // Debounce the state update to prevent rapid switching
      debounceTimerRef.current = setTimeout(() => {
        const newIsMobile = shouldUseMobileLayout(breakpoint);
        
        // Only update if the state actually changed
        if (newIsMobile !== lastMobileStateRef.current) {
          lastMobileStateRef.current = newIsMobile;
          setIsMobile(newIsMobile);
        }
      }, RESIZE_DEBOUNCE_MS);
    };

    // Set initial value (in case it differs from SSR)
    const initialMobile = shouldUseMobileLayout(breakpoint);
    if (initialMobile !== lastMobileStateRef.current) {
      lastMobileStateRef.current = initialMobile;
      setIsMobile(initialMobile);
    }

    // Add event listener with passive option for better performance
    window.addEventListener('resize', handleResize, { passive: true });
    
    // Also listen for orientation change (important for tablets)
    window.addEventListener('orientationchange', handleResize, { passive: true });

    // Cleanup on unmount
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [breakpoint]);

  return isMobile;
}

export default useIsMobile;
