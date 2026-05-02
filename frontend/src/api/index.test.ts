import { beforeEach, describe, expect, it, vi } from 'vitest';
import api, { OfflineModeError } from './index';
import { setManualOfflineMode } from '../hooks/useOnlineStatus';

describe('api offline mode request filtering', () => {
  beforeEach(() => {
    setManualOfflineMode(false);
    localStorage.clear();
  });

  it('allows explicit auth requests in manual offline mode', async () => {
    setManualOfflineMode(true);

    const adapter = vi.fn(async (config: any) => ({
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));

    await api.post(
      '/auth/login',
      { identifier: 'user', password: 'pass' },
      { adapter }
    );

    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('continues blocking non-auth api requests in manual offline mode', async () => {
    setManualOfflineMode(true);

    const adapter = vi.fn(async (config: any) => ({
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }));

    await expect(
      api.get('/recently-played', { adapter })
    ).rejects.toBeInstanceOf(OfflineModeError);

    expect(adapter).not.toHaveBeenCalled();
  });
});
