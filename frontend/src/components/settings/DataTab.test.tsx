import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DataTab from './DataTab';

const mocks = vi.hoisted(() => ({
  clearPlayHistory: vi.fn(),
  deletePlaybackState: vi.fn(),
  clearHistory: vi.fn(),
  clearQueue: vi.fn(),
  clearTransientAudioCaches: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('../../api', () => ({
  clearPlayHistory: mocks.clearPlayHistory,
  deletePlaybackState: mocks.deletePlaybackState,
}));

vi.mock('../../store/playHistoryStore', () => ({
  usePlayHistoryStore: () => ({
    clearHistory: mocks.clearHistory,
  }),
}));

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: Object.assign(vi.fn(), {
    getState: () => ({
      clearQueue: mocks.clearQueue,
    }),
  }),
}));

vi.mock('../../utils/transientAudioCache', () => ({
  clearTransientAudioCaches: mocks.clearTransientAudioCaches,
}));

describe('DataTab', () => {
  beforeEach(() => {
    mocks.clearPlayHistory.mockReset();
    mocks.deletePlaybackState.mockReset();
    mocks.clearHistory.mockReset();
    mocks.clearQueue.mockReset();
    mocks.clearTransientAudioCaches.mockReset();
    mocks.confirm.mockReset();
    mocks.confirm.mockReturnValue(true);
    vi.stubGlobal('confirm', mocks.confirm);
  });

  it('clears streaming audio cache without touching playback state cache', async () => {
    mocks.clearTransientAudioCaches.mockResolvedValue(undefined);

    render(<DataTab />);

    expect(
      screen.getByText('清除当前设备上用于在线播放的音频缓存，包括预加载音频和 Service Worker 流式缓存。不会删除离线下载内容。'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '清除流式缓存' }));

    expect(mocks.confirm).toHaveBeenCalledWith(
      '确定要清除所有流式音频缓存吗？这不会删除离线下载，只会清除在线播放产生的缓存数据。',
    );

    await waitFor(() => {
      expect(mocks.clearTransientAudioCaches).toHaveBeenCalledTimes(1);
    });

    expect(mocks.deletePlaybackState).not.toHaveBeenCalled();
    expect(screen.getByText('流式音频缓存已清除')).toBeInTheDocument();
  });
});
