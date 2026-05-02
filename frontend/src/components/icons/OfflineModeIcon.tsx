/**
 * 离线模式图标 - WiFi 加斜线
 */
interface OfflineModeIconProps {
  size?: number;
  className?: string;
}

export default function OfflineModeIcon({ size = 20, className }: OfflineModeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* WiFi 信号弧线 */}
      <path d="M5 12.55a11 11 0 0 1 14.08 0" />
      <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      {/* 中心点 */}
      <circle cx="12" cy="20" r="1" fill="currentColor" />
      {/* 斜线 */}
      <line x1="4" y1="4" x2="20" y2="20" />
    </svg>
  );
}
