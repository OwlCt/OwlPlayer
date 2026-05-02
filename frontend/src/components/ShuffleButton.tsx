import { FiShuffle } from 'react-icons/fi';
import { clsx } from 'clsx';

interface ShuffleButtonProps {
  isActive: boolean;
  onClick: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disableHover?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
};

const iconSizes = {
  sm: 16,
  md: 20,
  lg: 24,
};

export function ShuffleButton({ isActive, onClick, size = 'md', className, disableHover = false }: ShuffleButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex items-center justify-center rounded-full',
        !disableHover && 'transition-all hover:scale-105',
        sizeClasses[size],
        isActive ? 'text-spotify-green' : disableHover ? 'text-white/60' : 'text-white/60 hover:text-white',
        className
      )}
      title={isActive ? '关闭随机播放' : '开启随机播放'}
      data-testid="shuffle-button"
    >
      <FiShuffle size={iconSizes[size]} />
      {/* Active indicator dot */}
      {isActive && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-spotify-green rounded-full" />
      )}
    </button>
  );
}

export default ShuffleButton;
