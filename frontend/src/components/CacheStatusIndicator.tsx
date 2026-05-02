export function MiniDownloadedIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="flex-shrink-0"
      role="img"
      aria-label="已下载"
    >
      <circle cx="12" cy="12" r="11" fill="#1DB954" />
      <line
        x1="12"
        y1="7"
        x2="12"
        y2="15"
        stroke="#000000"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 13L12 17L16 13"
        stroke="#000000"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MiniPartialDownloadIcon({ size = 14 }: { size?: number }) {
  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label="部分下载"
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="#1DB954"
          strokeWidth="1.5"
          fill="none"
        />
        <line
          x1="12"
          y1="7"
          x2="12"
          y2="15"
          stroke="#1DB954"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M8 13L12 17L16 13"
          stroke="#1DB954"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="absolute bg-orange-500 rounded-full"
        style={{
          width: size * 0.35,
          height: size * 0.35,
          top: -1,
          right: -1,
        }}
      />
    </div>
  );
}

export function MiniDownloadingIcon({
  size = 14,
  progress = 0,
}: {
  size?: number;
  progress?: number;
}) {
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progress / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="flex-shrink-0"
      role="img"
      aria-label="下载中"
    >
      <circle
        cx="12"
        cy="12"
        r={radius}
        stroke="#9ca3af"
        strokeWidth="2"
        fill="none"
        opacity={0.3}
      />
      <circle
        cx="12"
        cy="12"
        r={radius}
        stroke="#1DB954"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={progressOffset}
        transform="rotate(-90 12 12)"
      />
      <rect x="10" y="10" width="4" height="4" fill="white" />
    </svg>
  );
}
