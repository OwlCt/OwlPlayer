import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { FiFolder } from "react-icons/fi";
import {
  listAdminFilesystem,
  type AdminFilesystemListing,
} from "../../api";

interface FolderPickerModalProps {
  isOpen: boolean;
  initialPath?: string;
  onClose: () => void;
  onSelect: (path: string) => void;
}

export default function FolderPickerModal({
  isOpen,
  initialPath,
  onClose,
  onSelect,
}: FolderPickerModalProps) {
  const [listing, setListing] = useState<AdminFilesystemListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPath = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    try {
      const nextListing = await listAdminFilesystem(path);
      setListing(nextListing);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载文件夹失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadPath(initialPath ?? "");
    }
  }, [initialPath, isOpen, loadPath]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  const canNavigateParent =
    listing?.parent_path !== undefined && listing.parent_path !== null;

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleSelectCurrent = () => {
    if (!listing || listing.is_virtual_root) {
      return;
    }
    onSelect(listing.current_path);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-picker-title"
      onMouseDown={handleOverlayMouseDown}
    >
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-white/10 bg-neutral-900 p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="folder-picker-title" className="text-lg font-medium text-white">
              选择文件夹
            </h2>
            <div className="mt-2 text-xs text-white/45">当前位置</div>
            <div className="mt-1 truncate text-sm text-white">
              {listing?.current_path || "(根)"}
            </div>
          </div>
          {canNavigateParent && (
            <button
              type="button"
              onClick={() => void loadPath(listing.parent_path ?? "")}
              className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5"
            >
              上一级
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {loading && <div className="text-sm text-white/55">加载中…</div>}

          {error && (
            <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {!loading && listing?.is_virtual_root && (
            <div className="mb-2 text-xs text-white/45">Windows 驱动器</div>
          )}

          {!loading && listing && (
            <div className="space-y-1">
              {listing.entries.map((entry) => (
                <button
                  key={entry.path}
                  type="button"
                  onClick={() => void loadPath(entry.path)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-white/5"
                >
                  <FiFolder className="h-4 w-4 shrink-0 text-white/60" />
                  <span className="truncate text-sm text-white">{entry.name}</span>
                </button>
              ))}
              {listing.entries.length === 0 && (
                <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-xs text-white/50">
                  没有可浏览的子目录
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-white hover:bg-white/5"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSelectCurrent}
            disabled={!listing || listing.is_virtual_root}
            className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
          >
            选择此目录
          </button>
        </div>
      </div>
    </div>
  );
}
