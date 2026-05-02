import { useRef, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence, PanInfo, useMotionValue, useMotionTemplate, animate } from 'framer-motion';
import { createPortal } from 'react-dom';
import { IoPlay, IoRepeat, IoTimer, IoTrash, IoCheckmark, IoClose } from 'react-icons/io5';
import { FiShuffle } from 'react-icons/fi';
import { RiDraggable } from 'react-icons/ri';
import {
  DndContext,
  closestCenter,
  TouchSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Modifier } from '@dnd-kit/core';
import { usePlayerStore } from '../../store/playerStore';
import CachedImage from '../CachedImage';
import { getProxiedImageUrl } from '../../utils/image';
import { Song } from '../../types';

// Custom modifier to restrict dragging to vertical axis only
const restrictToVerticalAxis: Modifier = ({ transform }) => {
  return {
    ...transform,
    x: 0,
  };
};

interface MobileQueueSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SwipeableQueueItemProps {
  song: Song;
  index: number;
  isCurrentSong: boolean;
  onTap: () => void;
  onRemove: () => void;
  sortableProps: {
    setNodeRef: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
    isDragging: boolean;
  };
  dragHandleProps: {
    ref: (node: HTMLElement | null) => void;
    attributes: Record<string, any>;
    listeners: Record<string, any> | undefined;
  };
}

/**
 * Swipeable queue item with delete action
 */
function SwipeableQueueItem({
  song,
  index,
  isCurrentSong,
  onTap,
  onRemove,
  sortableProps,
  dragHandleProps,
}: SwipeableQueueItemProps) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = () => {
    setIsRemoving(true);
    setTimeout(() => {
      onRemove();
    }, 150);
  };

  const handleContentTap = () => {
    if (isOpen) {
      setIsOpen(false);
      setOffsetX(0);
    } else {
      onTap();
    }
  };

  if (isRemoving) {
    return (
      <motion.div
        initial={{ height: 'auto', opacity: 1 }}
        animate={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="overflow-hidden"
      />
    );
  }

  const showDeleteButton = isOpen || offsetX < -5;

  return (
    <div
      ref={sortableProps.setNodeRef}
      style={sortableProps.style}
      data-queue-index={index}
      className={`relative overflow-hidden rounded-lg ${sortableProps.isDragging ? 'z-50' : ''}`}
    >
      {/* Delete button */}
      <div
        className={`absolute inset-y-0 right-0 w-[72px] bg-red-500 flex items-center justify-center rounded-r-lg ${
          showDeleteButton ? '' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button onClick={handleDelete} className="w-full h-full flex items-center justify-center">
          <IoTrash size={22} className="text-white" />
        </button>
      </div>

      {/* Swipeable content - use CSS transform for better performance */}
      <motion.div
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#282828] ${
          isCurrentSong ? 'bg-white/10' : ''
        } ${sortableProps.isDragging ? 'shadow-lg opacity-50' : ''}`}
        animate={{ x: isOpen ? -72 : 0 }}
        transition={{ type: 'tween', duration: 0.15 }}
        drag="x"
        dragConstraints={{ left: -72, right: 0 }}
        dragElastic={0}
        onDrag={(_, info) => setOffsetX(info.offset.x)}
        onDragEnd={(_, info) => {
          if (info.offset.x < -40 || info.velocity.x < -300) {
            setIsOpen(true);
          } else {
            setIsOpen(false);
          }
          setOffsetX(0);
        }}
        dragDirectionLock
      >
        {/* Artwork - tappable */}
        <div
          className="w-12 h-12 rounded overflow-hidden flex-shrink-0"
          onClick={handleContentTap}
        >
          {song.artworkUrl ? (
            <CachedImage
              src={getProxiedImageUrl(song.artworkUrl, 96)}
              alt={song.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-white/10 flex items-center justify-center text-white/40">
              ♪
            </div>
          )}
        </div>

        {/* Song info - tappable */}
        <div className="flex-1 min-w-0" onClick={handleContentTap}>
          <div
            className={`font-medium text-[15px] truncate ${
              isCurrentSong ? 'text-green-500' : 'text-white'
            }`}
          >
            {song.name}
          </div>
          <div className="text-sm text-white/60 truncate">{song.artistName}</div>
        </div>

        {/* Play indicator or drag handle */}
        {isCurrentSong ? (
          <div className="w-10 h-10 flex items-center justify-center text-green-500">
            <IoPlay size={20} />
          </div>
        ) : (
          <div
            ref={dragHandleProps.ref}
            {...dragHandleProps.attributes}
            {...dragHandleProps.listeners}
            className="w-10 h-10 flex items-center justify-center text-white/40 touch-none"
            style={{ touchAction: 'none' }}
          >
            <RiDraggable size={22} />
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * Wrapper component that combines sortable with swipeable
 */
function SortableSwipeableItem({
  song,
  index,
  isCurrentSong,
  onTap,
  onRemove,
}: {
  song: Song;
  index: number;
  isCurrentSong: boolean;
  onTap: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `${song.id}-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <SwipeableQueueItem
      song={song}
      index={index}
      isCurrentSong={isCurrentSong}
      onTap={onTap}
      onRemove={onRemove}
      sortableProps={{
        setNodeRef,
        style,
        isDragging,
      }}
      dragHandleProps={{
        ref: setActivatorNodeRef,
        attributes,
        listeners,
      }}
    />
  );
}

// Page size for lazy loading
const PAGE_SIZE = 30;

// Sheet height states
const HALF_HEIGHT = 50; // vh
const FULL_HEIGHT = 85; // vh

/**
 * MobileQueueSheet - Mobile queue view as bottom sheet
 * Supports half-screen and full-screen modes with drag to expand/collapse
 */
// Sleep timer options
const SLEEP_TIMER_OPTIONS = [
  { label: '5 分钟', value: 5 },
  { label: '10 分钟', value: 10 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '45 分钟', value: 45 },
  { label: '1 小时', value: 60 },
  { label: '曲目结束时', value: 'endOfTrack' as const },
];

export default function MobileQueueSheet({ isOpen, onClose }: MobileQueueSheetProps) {
  const {
    queue,
    queueIndex,
    queueSource,
    isShuffled,
    playMode,
    toggleShuffle,
    togglePlayMode,
    playFromQueue,
    reorderQueue,
    removeFromQueue,
    sleepTimerEndTime,
    sleepTimerMode,
    setSleepTimer,
    clearSleepTimer,
  } = usePlayerStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const sheetY = useMotionValue(0);
  const sheetHeight = useMotionValue(HALF_HEIGHT); // Dynamic height in vh
  const sheetHeightStyle = useMotionTemplate`${sheetHeight}vh`;
  
  // Track if sheet is expanded to full height
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Sleep timer sheet state
  const [showTimerSheet, setShowTimerSheet] = useState(false);
  
  // Lazy loading state
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  
  // Reset display count and expanded state when sheet opens or queue changes significantly
  useEffect(() => {
    if (isOpen) {
      // Ensure current song is visible
      const minDisplay = Math.min(queue.length, Math.max(PAGE_SIZE, queueIndex + 10));
      setDisplayCount(minDisplay);
      // Reset to half height when opening
      setIsExpanded(false);
      sheetHeight.set(HALF_HEIGHT);
    }
  }, [isOpen, queue.length, queueIndex]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!isOpen) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && displayCount < queue.length) {
          setDisplayCount(prev => Math.min(prev + PAGE_SIZE, queue.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [isOpen, displayCount, queue.length]);

  // Calculate the height difference for expansion
  const heightDiff = (FULL_HEIGHT - HALF_HEIGHT) * window.innerHeight / 100;

  // Handle drag on the handle area - supports expand/collapse and dismiss
  const handleHandleDrag = (_: any, info: PanInfo) => {
    if (isExpanded) {
      // When expanded, only allow dragging down
      const newY = Math.max(0, info.offset.y);
      sheetY.set(newY);
    } else {
      // When half-open, allow dragging up (negative) to expand or down to dismiss
      const newY = Math.max(-heightDiff, info.offset.y);
      sheetY.set(newY);
    }
  };

  const handleHandleDragEnd = (_: any, info: PanInfo) => {
    const offsetY = info.offset.y;
    const velocityY = info.velocity.y;

    if (isExpanded) {
      // When expanded: drag down to collapse or dismiss
      if (offsetY > 100 || (offsetY > 50 && velocityY > 500)) {
        // Dismiss completely
        onClose();
      } else {
        // Stay expanded
        animate(sheetY, 0, { type: 'spring', damping: 30, stiffness: 300 });
      }
    } else {
      // When half-open: drag up to expand, drag down to dismiss
      if (offsetY < -60 || (offsetY < -30 && velocityY < -400)) {
        // Expand to full
        setIsExpanded(true);
        animate(sheetY, 0, { type: 'spring', damping: 30, stiffness: 300 });
      } else if (offsetY > 100 || (offsetY > 50 && velocityY > 500)) {
        // Dismiss
        onClose();
      } else {
        // Stay at half
        animate(sheetY, 0, { type: 'spring', damping: 30, stiffness: 300 });
      }
    }
  };

  // Configure sensors - only activate on drag handle
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150,
        tolerance: 5,
      },
    })
  );

  // Create sortable items - only for displayed items
  const displayedQueue = queue.slice(0, displayCount);
  const sortableItems = displayedQueue.map((song, idx) => ({
    id: `${song.id}-${idx}`,
    song,
    index: idx,
  }));
  
  const hasMore = displayCount < queue.length;

  // Scroll to current song on open
  useEffect(() => {
    if (isOpen && containerRef.current && queueIndex >= 0) {
      const timer = setTimeout(() => {
        const currentEl = containerRef.current?.querySelector(
          `[data-queue-index="${queueIndex}"]`
        );
        if (currentEl) {
          currentEl.scrollIntoView({ block: 'start', behavior: 'auto' });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, queueIndex]);

  // Handle escape key and body scroll
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

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  const handleDndEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortableItems.findIndex((item) => item.id === active.id);
      const newIndex = sortableItems.findIndex((item) => item.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        reorderQueue(oldIndex, newIndex);
      }
    }
  };

  const getSourceText = () => {
    if (!queueSource || !queueSource.type) return '';
    return queueSource.name || '';
  };

  // Calculate remaining time for sleep timer display
  const [timerRemaining, setTimerRemaining] = useState<string | null>(null);
  
  useEffect(() => {
    if (!sleepTimerMode) {
      setTimerRemaining(null);
      return;
    }
    
    if (sleepTimerMode === 'endOfTrack') {
      setTimerRemaining('曲目结束');
      return;
    }
    
    if (sleepTimerEndTime) {
      const updateRemaining = () => {
        const remaining = sleepTimerEndTime - Date.now();
        if (remaining <= 0) {
          setTimerRemaining(null);
          return;
        }
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimerRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      };
      
      updateRemaining();
      const interval = setInterval(updateRemaining, 1000);
      return () => clearInterval(interval);
    }
  }, [sleepTimerMode, sleepTimerEndTime]);

  const handleTimerSelect = (value: number | 'endOfTrack') => {
    setSleepTimer(value);
    setShowTimerSheet(false);
  };

  const isTimerActive = sleepTimerMode !== null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[9999] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleBackdropClick}
          />

          {/* Bottom sheet - height changes for half/full */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#282828] rounded-t-2xl flex flex-col safe-area-bottom"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
            style={{ 
              y: sheetY, 
              height: sheetHeightStyle,
            }}
          >
            {/* Drag handle area - only this area is draggable */}
            <div
              className="cursor-grab active:cursor-grabbing"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                // Start tracking drag
                const startY = e.clientY;
                const startHeight = sheetHeight.get();
                const vh = window.innerHeight / 100;
                
                const handlePointerMove = (moveEvent: PointerEvent) => {
                  const deltaY = moveEvent.clientY - startY;
                  
                  if (deltaY < 0) {
                    // Dragging up - increase height
                    const deltaVh = -deltaY / vh;
                    const newHeight = Math.min(FULL_HEIGHT, startHeight + deltaVh);
                    sheetHeight.set(newHeight);
                    sheetY.set(0);
                  } else {
                    // Dragging down - move sheet down
                    sheetHeight.set(startHeight);
                    sheetY.set(deltaY);
                  }
                };
                
                const handlePointerUp = (upEvent: PointerEvent) => {
                  const deltaY = upEvent.clientY - startY;
                  const currentHeight = sheetHeight.get();
                  
                  if (deltaY < 0) {
                    // Was dragging up
                    const threshold = (HALF_HEIGHT + FULL_HEIGHT) / 2;
                    if (currentHeight > threshold) {
                      // Expand to full
                      setIsExpanded(true);
                      animate(sheetHeight, FULL_HEIGHT, { type: 'spring', damping: 30, stiffness: 300 });
                    } else {
                      // Snap back to half
                      setIsExpanded(false);
                      animate(sheetHeight, HALF_HEIGHT, { type: 'spring', damping: 30, stiffness: 300 });
                    }
                  } else {
                    // Was dragging down
                    if (deltaY > 100) {
                      // Dismiss
                      onClose();
                    } else {
                      // Snap back
                      animate(sheetY, 0, { type: 'spring', damping: 30, stiffness: 300 });
                    }
                  }
                  
                  document.removeEventListener('pointermove', handlePointerMove);
                  document.removeEventListener('pointerup', handlePointerUp);
                };
                
                document.addEventListener('pointermove', handlePointerMove);
                document.addEventListener('pointerup', handlePointerUp);
              }}
            >
              {/* Handle indicator */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/30 rounded-full" />
              </div>

              {/* Header */}
              <div className="px-5 pb-3">
                <h2 className="text-lg font-bold text-white">队列</h2>
                {getSourceText() && (
                  <p className="text-sm text-white/60 mt-0.5">正在播放 {getSourceText()}</p>
                )}
              </div>
            </div>

            {/* Queue list */}
            <div
              ref={containerRef}
              className="flex-1 overflow-y-auto min-h-0 px-2 overscroll-contain"
            >
              {queue.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/40">
                  队列为空
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDndEnd}
                  modifiers={[restrictToVerticalAxis]}
                >
                  <SortableContext
                    items={sortableItems.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1 pb-4">
                      {sortableItems.map((item) => (
                        <SortableSwipeableItem
                          key={item.id}
                          song={item.song}
                          index={item.index}
                          isCurrentSong={item.index === queueIndex}
                          onTap={() => playFromQueue(item.index)}
                          onRemove={() => removeFromQueue(item.index)}
                        />
                      ))}
                      {/* Load more trigger */}
                      {hasMore && (
                        <div ref={loaderRef} className="py-3 text-center">
                          <span className="text-white/30 text-xs">
                            {displayCount} / {queue.length}
                          </span>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Spacer for bottom action bar */}
            <div className="h-[72px] flex-shrink-0" />
          </motion.div>

          {/* Bottom action bar - fixed at bottom, doesn't move with drag */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[10000] bg-[#282828] border-t border-white/10 safe-area-bottom"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
          >
            <div className="flex items-center justify-around px-4 py-4">
              <button
                onClick={toggleShuffle}
                className={`flex flex-col items-center gap-1 min-w-[72px] py-2 rounded-lg ${
                  isShuffled ? 'text-green-500 bg-green-500/10' : 'text-white/60'
                }`}
              >
                <FiShuffle size={22} />
                <span className="text-xs">随机播放</span>
              </button>

              <button
                onClick={togglePlayMode}
                className={`flex flex-col items-center gap-1 min-w-[72px] py-2 rounded-lg relative ${
                  playMode !== 'sequential' ? 'text-green-500 bg-green-500/10' : 'text-white/60'
                }`}
              >
                <div className="relative">
                  <IoRepeat size={22} />
                  {playMode === 'single' && (
                    <span className="absolute -top-1 -right-2 text-[10px] font-bold">1</span>
                  )}
                </div>
                <span className="text-xs">循环播放</span>
              </button>

              <button
                onClick={() => setShowTimerSheet(true)}
                className={`flex flex-col items-center gap-1 min-w-[72px] py-2 rounded-lg ${
                  isTimerActive ? 'text-green-500 bg-green-500/10' : 'text-white/60'
                }`}
              >
                <IoTimer size={22} />
                <span className="text-xs">
                  {timerRemaining || '定时器'}
                </span>
              </button>
            </div>
          </motion.div>

          {/* Sleep Timer Sheet */}
          <AnimatePresence>
            {showTimerSheet && (
              <TimerSheet
                isTimerActive={isTimerActive}
                sleepTimerMode={sleepTimerMode}
                sleepTimerEndTime={sleepTimerEndTime}
                onClose={() => setShowTimerSheet(false)}
                onClearTimer={() => {
                  clearSleepTimer();
                  setShowTimerSheet(false);
                }}
                onSelectTimer={handleTimerSelect}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

/**
 * Timer Sheet component with drag-to-dismiss
 */
function TimerSheet({
  isTimerActive,
  sleepTimerMode,
  sleepTimerEndTime,
  onClose,
  onClearTimer,
  onSelectTimer,
}: {
  isTimerActive: boolean;
  sleepTimerMode: 'time' | 'endOfTrack' | null;
  sleepTimerEndTime: number | null;
  onClose: () => void;
  onClearTimer: () => void;
  onSelectTimer: (value: number | 'endOfTrack') => void;
}) {
  const sheetY = useMotionValue(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    const startY = e.clientY;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY;
      // Only allow dragging down
      const newY = Math.max(0, deltaY);
      sheetY.set(newY);
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      const deltaY = upEvent.clientY - startY;

      if (deltaY > 100) {
        onClose();
      } else {
        animate(sheetY, 0, { type: 'spring', damping: 30, stiffness: 300 });
      }

      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <>
      {/* Timer sheet backdrop */}
      <motion.div
        className="fixed inset-0 z-[10001] bg-black/60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Timer sheet */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-[10002] bg-[#282828] rounded-t-2xl safe-area-bottom"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        style={{ y: sheetY }}
      >
        {/* Handle - draggable area */}
        <div
          className="cursor-grab active:cursor-grabbing"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-white/30 rounded-full" />
          </div>

          {/* Header */}
          <div className="px-5 pb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">睡眠定时器</h2>
            {isTimerActive && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearTimer();
                }}
                className="text-red-500 text-sm flex items-center gap-1"
              >
                <IoClose size={18} />
                取消定时
              </button>
            )}
          </div>
        </div>

        {/* Timer options */}
        <div className="px-4 pb-6">
          {SLEEP_TIMER_OPTIONS.map((option) => {
            const isSelected =
              (sleepTimerMode === 'endOfTrack' && option.value === 'endOfTrack') ||
              (sleepTimerMode === 'time' && sleepTimerEndTime && option.value !== 'endOfTrack');

            return (
              <button
                key={option.label}
                onClick={() => onSelectTimer(option.value)}
                className="w-full flex items-center justify-between py-4 border-b border-white/10 last:border-b-0"
              >
                <span className="text-white text-base">{option.label}</span>
                {isSelected && sleepTimerMode === 'endOfTrack' && option.value === 'endOfTrack' && (
                  <IoCheckmark size={22} className="text-green-500" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </>
  );
}
