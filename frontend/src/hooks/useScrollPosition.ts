import { useEffect, useRef, RefObject } from 'react';
import { useLocation } from 'react-router-dom';
import { useNavigationStore } from '../store/navigationStore';

/**
 * Hook to save and restore scroll position for a scrollable container.
 * Automatically saves scroll position when navigating away and restores it when returning.
 * 
 * 工作原理：
 * 1. 在滚动时实时保存滚动位置（带 debounce）
 * 2. 在路由变化时，从快照中获取保存的位置并恢复
 * 
 * @param containerRef - Reference to the scrollable container element
 * @param options - Configuration options
 * @returns void
 */
export function useScrollPosition(
  containerRef: RefObject<HTMLElement> | HTMLElement | null,
 options: {
    /** Debounce delay for saving scroll position (ms) */
    debounceMs?: number;
    /** Whether to restore scroll position on mount */
    restoreOnMount?: boolean;
    /** Optional key to distinguish multiple scroll containers on the same route */
    key?: string;
  } = {}
) {
  const { debounceMs = 50, restoreOnMount = true, key } = options;
  const location = useLocation();
  const { saveScrollPosition, getScrollPosition } = useNavigationStore();
  const pathKey = key ? `${location.pathname}::${key}` : location.pathname;
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentPathRef = useRef(pathKey);
  // 保存每个路径（或路径+key）的滚动位置快照 - 这是关键！滚动时实时更新
  const scrollSnapshotRef = useRef<Record<string, number>>({});
  // 上一个路径 key
  const prevPathRef = useRef(pathKey);

  const getContainer = () => {
    if (!containerRef) return null;
    if ('current' in containerRef) return containerRef.current;
    return containerRef;
  };

  // 在滚动时实时保存滚动位置（带 debounce）
  // 这是保存滚动位置的主要方式
  useEffect(() => {
    const container = getContainer();
    if (!container) return;

    const handleScroll = () => {
      const currentPath = currentPathRef.current;
      const scrollTop = container.scrollTop;
      
      // 立即更新本地快照（不等 debounce）
      scrollSnapshotRef.current[currentPath] = scrollTop;

      // Clear any pending save to store
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce the save to store
      saveTimeoutRef.current = setTimeout(() => {
        saveScrollPosition(currentPath, scrollTop);
      }, debounceMs);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [containerRef, saveScrollPosition, debounceMs]);

  // 路由变化时恢复滚动位置
  const restoreTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  
  useEffect(() => {
    const prevPath = prevPathRef.current;
    const newPath = pathKey;
    
    // 清理之前的恢复 timeout 和 ResizeObserver
    restoreTimeoutsRef.current.forEach(clearTimeout);
    restoreTimeoutsRef.current = [];
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    
    // 更新路径引用
    currentPathRef.current = newPath;
    prevPathRef.current = newPath;
    
    // 如果不需要恢复，直接返回
    if (!restoreOnMount) return;
    
    // 从快照或 store 获取保存的滚动位置
    const savedPosition =
      scrollSnapshotRef.current[newPath] ?? getScrollPosition(newPath);

    // 如果保存的位置是 0，不需要恢复
    if (savedPosition === 0) return;

    // 标记是否已成功恢复到目标位置
    let restored = false;
    // 超时时间（5秒后停止尝试）
    const maxWaitTime = 5000;
    const startTime = Date.now();

    // 恢复滚动位置的函数
    const restoreScroll = () => {
      if (restored) return;
      
      const container = getContainer();
      if (!container) return;

      // 检查容器是否有足够的滚动高度
      const maxScroll = container.scrollHeight - container.clientHeight;

      if (maxScroll >= savedPosition) {
        // 内容高度足够，可以恢复到目标位置
        container.scrollTop = savedPosition;
        // 如果已经恢复到目标位置（或接近），标记为已恢复
        if (Math.abs(container.scrollTop - savedPosition) < 5) {
          restored = true;
          // 清理 ResizeObserver
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
          }
        }
      } else if (maxScroll > 0) {
        // 内容高度不够，先滚动到当前最大位置
        container.scrollTop = maxScroll;
      }
    };
    
    // 使用 ResizeObserver 监听内容高度变化
    // 当内容加载完成高度增加时，尝试恢复滚动位置
    const container = getContainer();
    if (container) {
      resizeObserverRef.current = new ResizeObserver(() => {
        // 检查是否超时
        if (Date.now() - startTime > maxWaitTime) {
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
            resizeObserverRef.current = null;
          }
          return;
        }
        restoreScroll();
      });
      
      // 观察容器的第一个子元素（内容区域）
      // 因为容器本身高度固定，需要观察内容高度变化
      if (container.firstElementChild) {
        resizeObserverRef.current.observe(container.firstElementChild);
      }
      // 也观察容器本身
      resizeObserverRef.current.observe(container);
    }
    
    // 同时使用定时器作为备用方案
    // 这是为了处理 ResizeObserver 可能不触发的情况
    // 注意：第一次延迟设为 0，立即尝试恢复（在动画开始前）
    // 这样可以避免用户看到滚动动画
    const delays = [0, 50, 150, 300, 500, 800, 1500];
    delays.forEach((delay) => {
      if (delay === 0) {
        // 立即恢复，在动画开始前
        restoreScroll();
      } else {
        const timeoutId = setTimeout(restoreScroll, delay);
        restoreTimeoutsRef.current.push(timeoutId);
      }
    });
    
    // 清理函数
    return () => {
      restoreTimeoutsRef.current.forEach(clearTimeout);
      restoreTimeoutsRef.current = [];
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [pathKey, containerRef, getScrollPosition, restoreOnMount]);

  // 组件卸载时保存滚动位置
  useEffect(() => {
    return () => {
      const container = getContainer();
      if (container) {
        const path = currentPathRef.current;
        const scrollTop = container.scrollTop;
        saveScrollPosition(path, scrollTop);
        scrollSnapshotRef.current[path] = scrollTop;
      }
    };
  }, [containerRef, saveScrollPosition]);
}

export default useScrollPosition;
