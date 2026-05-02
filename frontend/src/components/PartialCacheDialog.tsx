/**
 * PartialCacheDialog - Dialog for handling partially cached collections
 * 
 * When a playlist/album has new songs added after initial download,
 * this dialog allows users to:
 * - Download only the missing songs (incremental download)
 * - Delete all cached songs
 */

import { useEffect, useCallback } from 'react';

export interface PartialCacheDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  cachedCount: number;
  totalCount: number;
  onIncrementalDownload: () => void;
  onDelete: () => void;
  onCancel: () => void;
}

export default function PartialCacheDialog({
  isOpen,
  title,
  message,
  cachedCount,
  totalCount,
  onIncrementalDownload,
  onDelete,
  onCancel,
}: PartialCacheDialogProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const missingCount = totalCount - cachedCount;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center safe-area-y touch-none"
      onClick={onCancel}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Dialog - White background style matching ConfirmDialog */}
      <div
        className="relative bg-white rounded-xl w-[380px] max-w-[calc(100%-2rem)] p-6 shadow-2xl mx-4 touch-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-black text-xl font-bold mb-3">{title}</h2>
        <p className="text-gray-600 text-sm mb-2 leading-relaxed">{message}</p>
        <p className="text-gray-500 text-xs mb-6">
          已缓存 {cachedCount}/{totalCount} 首歌曲，还有 {missingCount} 首未下载
        </p>

        <div className="flex flex-col gap-3">
          {/* Incremental download button - primary action */}
          <button
            onClick={onIncrementalDownload}
            className="w-full px-6 py-3 text-sm font-semibold rounded-full transition-all hover:scale-[1.02] bg-[#1DB954] text-black border border-black/10"
          >
            下载剩余 {missingCount} 首歌曲
          </button>
          
          {/* Delete button - secondary action */}
          <button
            onClick={onDelete}
            className="w-full px-6 py-3 text-sm font-semibold rounded-full transition-all hover:scale-[1.02] bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            删除全部下载
          </button>
          
          {/* Cancel button */}
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
