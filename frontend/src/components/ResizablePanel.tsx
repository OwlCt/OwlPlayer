import React, { useState, useRef, useEffect } from 'react';

interface ResizablePanelProps {
  children: React.ReactNode;
  minWidth: number;
  maxWidth: number;
  defaultWidth: number;
  side: 'left' | 'right';
  className?: string;
  onWidthChange?: (width: number) => void;
  // 吸附模式：当宽度小于 snapThreshold 时，吸附到 snapWidth
  snapWidth?: number;
  snapThreshold?: number;
  // 最小吸附宽度：当宽度小于此值时，吸附到此宽度
  minSnapWidth?: number;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({ 
  children, 
  minWidth, 
  maxWidth, 
  defaultWidth,
  side,
  className = '',
  onWidthChange,
  snapWidth,
  snapThreshold,
  minSnapWidth,
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const isResizing = useRef(false);

  useEffect(() => {
    if (defaultWidth) {
      setWidth(defaultWidth);
    }
  }, [defaultWidth]);

  // 共用的宽度计算逻辑
  const calculateWidth = (clientX: number) => {
    let newWidth;
    if (side === 'left') {
      newWidth = clientX;
    } else {
      newWidth = window.innerWidth - clientX;
    }

    let finalWidth: number;

    // 最小吸附宽度逻辑：如果设置了 minSnapWidth，当宽度小于 minSnapWidth 时吸附到 minSnapWidth
    if (minSnapWidth !== undefined && newWidth < minSnapWidth) {
      finalWidth = minSnapWidth;
    }
    // 吸附逻辑：如果设置了 snapWidth 和 snapThreshold
    else if (snapWidth !== undefined && snapThreshold !== undefined) {
      if (newWidth < snapThreshold) {
        // 小于阈值，吸附到 mini 宽度
        finalWidth = snapWidth;
      } else if (newWidth < minWidth) {
        // 在阈值和最小宽度之间，保持最小宽度
        finalWidth = minWidth;
      } else {
        // 正常范围
        finalWidth = Math.min(maxWidth, newWidth);
      }
    } else {
      // 没有吸附，使用普通逻辑
      finalWidth = Math.min(maxWidth, Math.max(minWidth, newWidth));
    }

    setWidth(finalWidth);
    if (onWidthChange) onWidthChange(finalWidth);
  };

  // 鼠标事件处理
  const handleMouseDown = () => {
    isResizing.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing.current) return;
    calculateWidth(e.clientX);
  };

  const handleMouseUp = () => {
    isResizing.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };

  // 触摸事件处理（iPadOS 支持）
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    isResizing.current = true;
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isResizing.current) return;
    e.preventDefault(); // 阻止页面滚动
    if (e.touches.length === 1) {
      calculateWidth(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    isResizing.current = false;
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.removeEventListener('touchcancel', handleTouchEnd);
  };

  return (
    <div style={{ width }} className={`relative flex-shrink-0 ${className}`}>
      {children}
      {/* Invisible resize handle - only shows subtle indicator on interaction */}
      <div
        className="absolute top-0 bottom-0 w-4 cursor-col-resize z-50 touch-none group"
        style={{ [side === 'left' ? 'right' : 'left']: -8 }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      />
    </div>
  );
};

export default ResizablePanel;
