import { useRef, useLayoutEffect, useState } from 'react';

interface AdaptiveTitleProps {
  title: string;
  className?: string;
}

// Calculate base font size from title length
function getBaseFontSize(titleLength: number): number {
  if (titleLength <= 8) return 6;
  if (titleLength <= 15) return 5;
  if (titleLength <= 25) return 4;
  if (titleLength <= 40) return 3;
  if (titleLength <= 60) return 2.25;
  return 1.75;
}

/**
 * Spotify-style adaptive title component
 * Adjusts font size based on title length and container width
 * Max 3 lines with ellipsis overflow
 */
export function AdaptiveTitle({ title, className = '' }: AdaptiveTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseFontSize = getBaseFontSize(title.length);
  const [fontSize, setFontSize] = useState(baseFontSize);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const calculate = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.offsetWidth;
      const baseWidth = 500;
      
      let newSize = baseFontSize;
      if (containerWidth < baseWidth) {
        const scale = Math.max(0.4, containerWidth / baseWidth);
        newSize = Math.max(1.5, baseFontSize * scale);
      }
      
      setFontSize(newSize);
      setReady(true);
    };

    calculate();

    const observer = new ResizeObserver(calculate);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [baseFontSize, title]);

  const lineHeight = fontSize >= 4 ? 1.1 : fontSize >= 2.5 ? 1.2 : 1.3;

  return (
    <div ref={containerRef} className={`w-full ${className}`}>
      <h1
        className="font-bold text-white"
        style={{
          fontSize: `${fontSize}rem`,
          lineHeight,
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          wordBreak: 'break-word',
          visibility: ready ? 'visible' : 'hidden',
        }}
      >
        {title}
      </h1>
    </div>
  );
}
