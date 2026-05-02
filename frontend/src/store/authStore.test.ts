import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './authStore';
import { getManualOfflineMode, setManualOfflineMode } from '../hooks/useOnlineStatus';

const mockPause = vi.fn();
const mockClearQueue = vi.fn();

vi.mock('./playerStore', () => ({
  usePlayerStore: {
    getState: () => ({
      audioRef: {
        pause: mockPause,
        src: 'blob:test',
      },
      clearQueue: mockClearQueue,
    }),
  },
}));

describe('authStore logout', () => {
  beforeEach(() => {
    localStorage.clear();
    mockPause.mockClear();
    mockClearQueue.mockClear();
    setManualOfflineMode(false);
    useAuthStore.setState({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isInitialized: true,
      isLoading: false,
      error: null,
      pendingVerificationEmail: null,
    });
  });

  it('clears manual offline mode on logout', () => {
    setManualOfflineMode(true);
    localStorage.setItem('auth-token', 'token');
    localStorage.setItem('auth-refresh-token', 'refresh');
    localStorage.setItem('auth-user', JSON.stringify({ id: 'u1' }));

    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'test@example.com',
        username: 'tester',
        avatar_url: '',
        is_email_verified: true,
        is_active: true,
        is_admin: false,
        user_group: 'normal',
        created_at: '2026-03-21T00:00:00Z',
        updated_at: '2026-03-21T00:00:00Z',
      },
      token: 'token',
      refreshToken: 'refresh',
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      error: null,
      pendingVerificationEmail: null,
    });

    useAuthStore.getState().logout();

    expect(getManualOfflineMode()).toBe(false);
    expect(localStorage.getItem('manual_offline_mode')).toBe('false');
    expect(localStorage.getItem('auth-token')).toBeNull();
    expect(localStorage.getItem('auth-refresh-token')).toBeNull();
    expect(localStorage.getItem('auth-user')).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(mockPause).toHaveBeenCalledTimes(1);
    expect(mockClearQueue).toHaveBeenCalledTimes(1);
  });
});
