import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShuffleButton } from './ShuffleButton';

describe('ShuffleButton', () => {
  it('renders in inactive state', () => {
    render(<ShuffleButton isActive={false} onClick={() => {}} />);
    const button = screen.getByTestId('shuffle-button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('text-white/60');
    expect(button).not.toHaveClass('text-spotify-green');
  });

  it('renders in active state with green color and dot', () => {
    render(<ShuffleButton isActive={true} onClick={() => {}} />);
    const button = screen.getByTestId('shuffle-button');
    expect(button).toHaveClass('text-spotify-green');
    // Check for the active indicator dot
    const dot = button.querySelector('span');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-spotify-green');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<ShuffleButton isActive={false} onClick={handleClick} />);
    const button = screen.getByTestId('shuffle-button');
    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('shows correct title based on active state', () => {
    const { rerender } = render(<ShuffleButton isActive={false} onClick={() => {}} />);
    expect(screen.getByTitle('开启随机播放')).toBeInTheDocument();

    rerender(<ShuffleButton isActive={true} onClick={() => {}} />);
    expect(screen.getByTitle('关闭随机播放')).toBeInTheDocument();
  });
});
