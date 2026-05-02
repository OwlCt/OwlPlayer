import { useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { clsx } from 'clsx';

interface ScrollingTextProps {
  text?: string;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}

/**
 * 自动滚动文本组件
 * - 当文本超出容器宽度时自动来回滚动
 * - 滚动到头停顿1秒后返回
 * - 鼠标悬停时停止滚动
 * - 容器宽度足够时停止滚动
 */
const ScrollingText = ({ text, children, className = '', onClick }: ScrollingTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  
  const animationRef = useRef<number | null>(null);
  const pauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directionRef = useRef<'left' | 'right'>('left');
  const isPausedRef = useRef(false);

  // 检查是否溢出
  const checkOverflow = useCallback(() => {
    if (!containerRef.current || !textRef.current) return;
    
    const containerWidth = containerRef.current.offsetWidth;
    const textWidth = textRef.current.offsetWidth;
    
    const overflow = textWidth > containerWidth + 1; // +1 避免浮点误差
    setIsOverflowing(overflow);
    
    if (!overflow) {
      setScrollOffset(0);
      directionRef.current = 'left';
      isPausedRef.current = false;
    }
  }, []);

  // 监听容器大小变化和文本变化
  useEffect(() => {
    // 重置状态
    setScrollOffset(0);
    directionRef.current = 'left';
    isPausedRef.current = false;
    
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    
    // 延迟检查确保 DOM 已渲染
    const timer = setTimeout(checkOverflow, 50);
    
    return () => clearTimeout(timer);
  }, [text, children, checkOverflow]);

  // ResizeObserver 监听容器大小变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      checkOverflow();
    });
    
    resizeObserver.observe(container);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [checkOverflow]);

  // 滚动动画
  useEffect(() => {
    // 清理之前的动画
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }

    if (!isOverflowing || isHovered) {
      return;
    }

    const scrollSpeed = 24; // 像素/秒
    const pauseDuration = 1000; // 停顿时间（毫秒）
    let lastTime: number | null = null;

    const getMaxOffset = () => {
      if (!containerRef.current || !textRef.current) return 0;
      return Math.max(0, textRef.current.offsetWidth - containerRef.current.offsetWidth);
    };

    const animate = (currentTime: number) => {
      if (lastTime === null) {
        lastTime = currentTime;
      }
      
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      if (isPausedRef.current) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      const maxOffset = getMaxOffset();
      
      setScrollOffset(prev => {
        let newOffset = prev;
        
        if (directionRef.current === 'left') {
          newOffset = prev + scrollSpeed * deltaTime;
          if (newOffset >= maxOffset) {
            newOffset = maxOffset;
            isPausedRef.current = true;
            pauseTimeoutRef.current = setTimeout(() => {
              isPausedRef.current = false;
              directionRef.current = 'right';
            }, pauseDuration);
          }
        } else {
          newOffset = prev - scrollSpeed * deltaTime;
          if (newOffset <= 0) {
            newOffset = 0;
            isPausedRef.current = true;
            pauseTimeoutRef.current = setTimeout(() => {
              isPausedRef.current = false;
              directionRef.current = 'left';
            }, pauseDuration);
          }
        }
        
        return newOffset;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    // 开始前先停顿
    isPausedRef.current = true;
    directionRef.current = 'left';
    setScrollOffset(0);
    
    pauseTimeoutRef.current = setTimeout(() => {
      isPausedRef.current = false;
      lastTime = null;
      animationRef.current = requestAnimationFrame(animate);
    }, pauseDuration);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }
    };
  }, [isOverflowing, isHovered]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ width: '100%' }}
    >
      <span
        ref={textRef}
        className={clsx(className, 'inline-block whitespace-nowrap', onClick && 'cursor-pointer')}
        style={{
          transform: `translateX(-${scrollOffset}px)`,
        }}
        onClick={onClick}
      >
        {children || text}
      </span>
    </div>
  );
};

export default ScrollingText;
