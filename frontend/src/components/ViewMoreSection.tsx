import { useState, useEffect, useRef, useCallback } from 'react';
import { FiArrowLeft, FiLoader } from 'react-icons/fi';
import { searchPaginated } from '../api';
import { Song, Album, Artist } from '../types';

type ItemType = 'songs' | 'albums' | 'artists';

interface ViewMoreSectionProps<T> {
  title: string;
  type: ItemType;
  searchQuery: string;
  initialItems: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  gridCols?: number;
  onBack: () => void;
}

const ITEMS_PER_BATCH = 20;
const INITIAL_DISPLAY = 5;

export default function ViewMoreSection<T extends Song | Album | Artist>({
  title,
  type,
  searchQuery,
  initialItems,
  renderItem,
  gridCols,
  onBack,
}: ViewMoreSectionProps<T>) {
  const [items, setItems] = useState<T[]>(initialItems);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Load more items
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;

    setLoading(true);
    setError(null);

    try {
      const result = await searchPaginated(searchQuery, type, items.length, ITEMS_PER_BATCH);
      const newItems = result.items as T[];
      
      if (newItems.length === 0) {
        setHasMore(false);
      } else {
        setItems(prev => [...prev, ...newItems]);
        setHasMore(result.hasMore);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more items');
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, searchQuery, type, items.length]);

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadMore]);

  return (
    <section className="h-full flex flex-col">
      {/* Header with back button */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Go back"
        >
          <FiArrowLeft size={24} />
        </button>
        <h2 className="text-2xl font-bold">{title}</h2>
        <span className="text-white/60 text-sm">
          已加载 {items.length} 项
        </span>
      </div>

      {/* Items container with scroll */}
      <div className="flex-1 overflow-y-auto pr-2">
        {gridCols ? (
          <div
            className="grid gap-6"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            }}
          >
            {items.map((item, index) => renderItem(item, index))}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => renderItem(item, index))}
          </div>
        )}

        {/* Load more trigger / Loading indicator */}
        <div ref={loadMoreRef} className="py-8 flex justify-center">
          {loading && (
            <div className="flex items-center gap-2 text-white/60">
              <FiLoader className="animate-spin" size={20} />
              <span>加载中...</span>
            </div>
          )}
          {!loading && !hasMore && items.length > 0 && (
            <span className="text-white/40">没有更多了</span>
          )}
          {error && (
            <div className="text-red-400">
              {error}
              <button
                onClick={loadMore}
                className="ml-2 underline hover:no-underline"
              >
                重试
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Export constants for testing
export { INITIAL_DISPLAY, ITEMS_PER_BATCH };
