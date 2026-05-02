import React from 'react';
import { motion, Variants } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { NavigationDirection } from '../../hooks/useNavigationDirection';

/**
 * Page transition variants for mobile navigation.
 * Implements smooth transitions between pages with appropriate easing.
 * 
 * Requirements: 8.1 - Animate transitions with appropriate easing
 */
export const pageTransitionVariants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
};

/**
 * Transition configuration for page animations.
 * Uses spring physics for natural feel.
 */
export const pageTransitionConfig: import('framer-motion').Transition = {
  duration: 0.15,
  ease: 'easeOut',
};

/**
 * Slide transition variants for mobile navigation (forward only).
 * - Forward (entering new page): slide in from right
 * - Back navigation is handled separately without animation
 */
export const getSlideTransitionVariants = (_direction: NavigationDirection): Variants => ({
  initial: {
    x: '100%',
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
  },
  exit: {
    x: '-30%',
    opacity: 0,
  },
});

/**
 * Transition configuration for slide animations.
 */
export const slideTransitionConfig: import('framer-motion').Transition = {
  type: 'tween',
  duration: 0.3,
  ease: [0.25, 0.1, 0.25, 1], // cubic-bezier for smooth iOS-like feel
};

/**
 * Fade transition variants for simpler transitions.
 */
export const fadeTransitionVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

interface MobilePageTransitionProps {
  children: React.ReactNode;
  className?: string;
  /** Use simpler fade transition instead of slide */
  fadeOnly?: boolean;
}

/**
 * MobilePageTransition component - Wraps page content with animated transitions.
 * Provides smooth page-to-page navigation animations for mobile UI.
 * 
 * Requirements: 8.1 - Animate transitions with appropriate easing
 */
export default function MobilePageTransition({ 
  children, 
  className = '',
  fadeOnly = false,
}: MobilePageTransitionProps) {
  const location = useLocation();
  
  const variants = fadeOnly ? fadeTransitionVariants : pageTransitionVariants;
  const transition = fadeOnly 
    ? { duration: 0.2, ease: 'easeOut' }
    : pageTransitionConfig;

  return (
    <motion.div
      key={location.pathname}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={transition}
      className={`h-full ${className}`}
      data-testid="mobile-page-transition"
    >
      {children}
    </motion.div>
  );
}

/**
 * Shared element transition for MiniPlayer to NowPlaying artwork.
 * Uses layoutId for smooth shared element animations.
 * 
 * Requirements: 8.2, 8.3 - Animate artwork and controls smoothly between views
 */
export const sharedArtworkTransition = {
  layoutId: 'now-playing-artwork',
  transition: {
    type: 'spring' as const,
    stiffness: 350,
    damping: 35,
  },
};

/**
 * Transition variants for expanding MiniPlayer to full-screen NowPlaying.
 * 
 * Requirements: 8.2 - Animate the artwork and controls smoothly
 */
export const expandTransitionVariants = {
  collapsed: {
    y: '100%',
    opacity: 0,
  },
  expanded: {
    y: 0,
    opacity: 1,
  },
};

export const expandTransitionConfig = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
};
