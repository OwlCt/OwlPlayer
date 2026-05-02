import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiX, FiMusic, FiEdit2 } from 'react-icons/fi';
import { getProxiedImageUrl } from '../utils/image';

export interface PlaylistEditModalProps {
  playlist: {
    id: string;
    name: string;
    description?: string;
    artwork_url?: string;
  };
  defaultCoverUrl?: string; // First song's artwork URL
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: PlaylistUpdateData) => Promise<void>;
}

export interface PlaylistUpdateData {
  name: string;
  description: string; // Empty string means clear description
  artwork_url?: string;
  coverImage?: File; // New uploaded image file
  removeCover?: boolean; // Whether to remove custom cover
}

interface PlaylistEditState {
  name: string;
  description: string;
  previewImageUrl: string | null;
  pendingImageFile: File | null;
  shouldRemoveCover: boolean;
  isLoading: boolean;
  error: string | null;
}

// Accepted image formats
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export default function PlaylistEditModal({
  playlist,
  defaultCoverUrl,
  isOpen,
  onClose,
  onSave,
}: PlaylistEditModalProps) {
  // Form state
  const [state, setState] = useState<PlaylistEditState>({
    name: '',
    description: '',
    previewImageUrl: null,
    pendingImageFile: null,
    shouldRemoveCover: false,
    isLoading: false,
    error: null,
  });

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Initialize form when modal opens
  useEffect(() => {
    if (isOpen) {
      setState({
        name: playlist.name,
        description: playlist.description || '',
        previewImageUrl: null,
        pendingImageFile: null,
        shouldRemoveCover: false,
        isLoading: false,
        error: null,
      });
      // Focus name input after modal opens
      setTimeout(() => nameInputRef.current?.focus(), 100);
    }
    // Only re-run when isOpen changes or playlist.id changes (not on every playlist object change)
  }, [isOpen, playlist.id]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Get current display image URL
  const getDisplayImageUrl = useCallback(() => {
    // If there's a preview image (newly selected), show it
    if (state.previewImageUrl) {
      return state.previewImageUrl;
    }
    // If cover should be removed, show default or nothing
    if (state.shouldRemoveCover) {
      return defaultCoverUrl ? getProxiedImageUrl(defaultCoverUrl, 300) : null;
    }
    // Show existing artwork or default
    if (playlist.artwork_url) {
      return getProxiedImageUrl(playlist.artwork_url, 300);
    }
    return defaultCoverUrl ? getProxiedImageUrl(defaultCoverUrl, 300) : null;
  }, [state.previewImageUrl, state.shouldRemoveCover, playlist.artwork_url, defaultCoverUrl]);

  // Check if custom cover exists (either original or newly selected)
  const hasCustomCover = useCallback(() => {
    if (state.pendingImageFile) return true;
    if (state.shouldRemoveCover) return false;
    return !!playlist.artwork_url;
  }, [state.pendingImageFile, state.shouldRemoveCover, playlist.artwork_url]);

  // Validate image file
  const validateImageFile = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return '不支持的图片格式，请选择 JPEG、PNG 或 WebP 格式';
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return '图片大小不能超过 5MB';
    }
    return null;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      setState(prev => ({ ...prev, error }));
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setState(prev => ({
      ...prev,
      previewImageUrl: previewUrl,
      pendingImageFile: file,
      shouldRemoveCover: false,
      error: null,
    }));
  };

  // Handle remove cover
  const handleRemoveCover = () => {
    // Revoke previous preview URL if exists
    if (state.previewImageUrl) {
      URL.revokeObjectURL(state.previewImageUrl);
    }
    setState(prev => ({
      ...prev,
      previewImageUrl: null,
      pendingImageFile: null,
      shouldRemoveCover: true,
      error: null,
    }));
  };

  // Handle save
  const handleSave = async () => {
    // Validate name
    if (!state.name.trim()) {
      setState(prev => ({ ...prev, error: '歌单名称不能为空' }));
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      await onSave({
        name: state.name.trim(),
        description: state.description.trim(), // Pass empty string to allow clearing
        coverImage: state.pendingImageFile || undefined,
        removeCover: state.shouldRemoveCover,
      });
      onClose();
    } catch (err) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : '保存失败，请重试',
      }));
    }
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (state.previewImageUrl) {
        URL.revokeObjectURL(state.previewImageUrl);
      }
    };
  }, [state.previewImageUrl]);

  if (!isOpen) return null;

  const displayImageUrl = getDisplayImageUrl();
  const isNameValid = state.name.trim().length > 0;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" />

      {/* Modal */}
      <div
        className="relative bg-[#282828] rounded-lg w-[524px] max-w-[90vw] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-bold text-white">编辑详情</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
            aria-label="关闭"
          >
            <FiX size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <div className="flex gap-4">
            {/* Image upload area */}
            <ImageUploadArea
              imageUrl={displayImageUrl}
              hasCustomImage={hasCustomCover()}
              onSelectImage={() => fileInputRef.current?.click()}
              onRemoveImage={handleRemoveCover}
            />

            {/* Form fields */}
            <div className="flex-1 flex flex-col gap-4">
              {/* Name input */}
              <div>
                <label className="block text-xs font-semibold text-white mb-2">
                  名称
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={state.name}
                  onChange={e => setState(prev => ({ ...prev, name: e.target.value, error: null }))}
                  className="w-full bg-[#3e3e3e] text-white text-sm rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="歌单名称"
                />
                {!isNameValid && state.name !== playlist.name && (
                  <p className="text-red-400 text-xs mt-1">歌单名称不能为空</p>
                )}
              </div>

              {/* Description textarea */}
              <div className="flex-1">
                <label className="block text-xs font-semibold text-white mb-2">
                  简介
                </label>
                <textarea
                  value={state.description}
                  onChange={e => setState(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full h-[120px] bg-[#3e3e3e] text-white text-sm rounded px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-white/30"
                  placeholder="添加简介（可选）"
                />
              </div>
            </div>
          </div>

          {/* Error message */}
          {state.error && (
            <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm">
              {state.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={!isNameValid || state.isLoading}
            className="px-8 py-3 bg-white text-black font-semibold rounded-full hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
          >
            {state.isLoading && (
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            )}
            保存
          </button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}


// Image upload area sub-component
interface ImageUploadAreaProps {
  imageUrl: string | null;
  hasCustomImage: boolean;
  onSelectImage: () => void;
  onRemoveImage: () => void;
}

function ImageUploadArea({
  imageUrl,
  hasCustomImage,
  onSelectImage,
  onRemoveImage,
}: ImageUploadAreaProps) {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setContextMenuPos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setShowContextMenu(true);
    }
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowContextMenu(false);
    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  return (
    <div
      ref={containerRef}
      className="relative w-[180px] h-[180px] flex-shrink-0 group cursor-pointer"
      onClick={onSelectImage}
      onContextMenu={handleContextMenu}
    >
      {/* Image or placeholder */}
      <div className="w-full h-full bg-[#3e3e3e] rounded shadow-lg overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="歌单封面"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FiMusic className="w-16 h-16 text-gray-500" />
          </div>
        )}
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded flex flex-col items-center justify-center gap-2">
        <FiEdit2 className="w-12 h-12 text-white" />
        <span className="text-white text-sm font-medium">选择照片</span>
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <div
          className="absolute bg-[#282828] rounded shadow-xl py-1 z-10 min-w-[140px]"
          style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
            onClick={() => {
              setShowContextMenu(false);
              onSelectImage();
            }}
          >
            更改照片
          </button>
          {hasCustomImage && (
            <button
              className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 transition-colors"
              onClick={() => {
                setShowContextMenu(false);
                onRemoveImage();
              }}
            >
              删除照片
            </button>
          )}
        </div>
      )}
    </div>
  );
}
