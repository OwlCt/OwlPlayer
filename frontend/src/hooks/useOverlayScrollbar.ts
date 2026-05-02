import { useState, useRef, useEffect, useCallback } from 'react';

interface UseOverlayScrollbarReturn {
  showScrollbar: boolean;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  scrollbarClassName: string;
}

export function useOverlayScrollbar(hideDelay: number = 1800): UseOverlayScrollbarReturn {
  const [showScrollbar, setShowScrollbar] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowScrollbar(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setShowScrollbar(false);
    }, hideDelay);
  }, [hideDelay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scrollbarClassName = `overlay-scrollbar ${showScrollbar ? 'scrollbar-visible' : ''}`;

  return {
    showScrollbar,
    handleMouseEnter,
    handleMouseLeave,
    scrollbarClassName,
  };
}
