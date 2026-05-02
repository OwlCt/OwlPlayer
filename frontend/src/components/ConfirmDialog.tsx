import { useEffect, useCallback } from 'react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  isDestructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
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
      // 阻止背景滚动
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center safe-area-y touch-none"
      onClick={onCancel}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* Semi-transparent backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Dialog - White background style */}
      <div
        className="relative bg-white rounded-xl w-[380px] max-w-[calc(100%-2rem)] p-6 shadow-2xl mx-4 touch-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-black text-xl font-bold mb-3">{title}</h2>
        <p className="text-gray-600 text-sm mb-8 leading-relaxed">{message}</p>

        <div className="flex justify-end items-center gap-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-semibold text-black hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-6 py-2.5 text-sm font-semibold rounded-full transition-all hover:scale-105 bg-[#1DB954] text-black border border-black/10 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isLoading ? '处理中...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
