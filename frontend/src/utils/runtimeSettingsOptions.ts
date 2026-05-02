export const LOCAL_MEDIA_SCAN_MODE_OPTIONS = [
  { value: "startup-incremental", label: "启动时扫描新文件" },
  { value: "startup-full", label: "启动时全部重扫" },
  { value: "manual", label: "仅手动触发" },
] as const;

export const LOCAL_MEDIA_CLEANUP_POLICY_OPTIONS = [
  { value: "mark-unavailable", label: "保留记录，仅隐藏" },
  { value: "delete-missing", label: "直接删除记录" },
] as const;
