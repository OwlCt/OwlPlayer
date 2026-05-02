import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheImageBlob, getCachedImageBlobUrl, isImageBlobCached } from '../services/imageBlobCache';
import { getCacheFirstArtworkUrl } from '../utils/cacheFirstImage';
import CachedImage, { shouldRetryImageLoad } from './CachedImage';

vi.mock('../services/imageBlobCache', () => ({
  cacheImageBlob: vi.fn(async () => undefined),
  getCachedImageBlobUrl: vi.fn(async () => null),
  isImageBlobCached: vi.fn(async () => false),
}));

vi.mock('../utils/cacheFirstImage', () => ({
  getCacheFirstArtworkUrl: vi.fn(async (_songId: string, fallbackUrl: string) => fallbackUrl),
  getCacheFirstAlbumArtworkUrl: vi.fn(async (_albumId: string, fallbackUrl: string) => fallbackUrl),
  getCacheFirstPlaylistArtworkUrl: vi.fn(async (_playlistId: string, fallbackUrl: string) => fallbackUrl),
}));

describe('CachedImage', () => {
  const flushAsyncEffects = async () => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(cacheImageBlob).mockResolvedValue(undefined);
    vi.mocked(getCachedImageBlobUrl).mockResolvedValue(null);
    vi.mocked(isImageBlobCached).mockResolvedValue(false);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('increments retry count across consecutive failures', async () => {
    const { container } = render(
      <CachedImage src="/api/image?url=https%3A%2F%2Fexample.com%2Fcover.jpg" alt="cover" retryDelay={10} maxRetries={3} />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    await flushAsyncEffects();
    expect(img?.getAttribute('src')).toBe('/api/image?url=https%3A%2F%2Fexample.com%2Fcover.jpg');

    fireEvent.error(img!);
    await act(async () => {
      vi.advanceTimersByTime(20);
    });
    expect(img?.getAttribute('src')).toContain('_retry=1');

    fireEvent.error(img!);
    await act(async () => {
      vi.advanceTimersByTime(30);
    });
    expect(img?.getAttribute('src')).toContain('_retry=2');
  });

  it('does not retry local artwork api requests', async () => {
    const { container } = render(
      <CachedImage src="/api/artwork/album/31" alt="album cover" retryDelay={10} maxRetries={3} />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    await flushAsyncEffects();
    expect(img?.getAttribute('src')).toBe('/api/artwork/album/31');

    fireEvent.error(img!);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(img?.getAttribute('src')).toBe('/api/artwork/album/31');
  });

  it('uses URL-keyed blob cache before legacy cache lookup', async () => {
    vi.mocked(getCachedImageBlobUrl).mockResolvedValue('blob:cached-cover');

    const { container } = render(
      <CachedImage src="/api/image?url=https%3A%2F%2Fexample.com%2Fcover.jpg" songId="song-1" alt="cover" />
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    await flushAsyncEffects();
    expect(img?.getAttribute('src')).toBe('blob:cached-cover');
    expect(getCacheFirstArtworkUrl).not.toHaveBeenCalled();
  });

  it('persists successfully loaded network images to blob cache', async () => {
    const src = '/api/image?url=https%3A%2F%2Fexample.com%2Fcover.jpg';
    const fetchMock = vi.fn(
      async () =>
        new Response(new Blob([new Uint8Array(1024)], { type: 'image/png' }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<CachedImage src={src} alt="cover" />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    await flushAsyncEffects();
    fireEvent.load(img!);
    await flushAsyncEffects();

    expect(isImageBlobCached).toHaveBeenCalledWith(src);
    expect(fetchMock).toHaveBeenCalledWith(src, { credentials: 'same-origin', cache: 'default' });
    expect(cacheImageBlob).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cacheImageBlob).mock.calls[0][0]).toBe(src);
    expect(vi.mocked(cacheImageBlob).mock.calls[0][1].size).toBeGreaterThan(0);
  });
});

describe('shouldRetryImageLoad', () => {
  it('skips retries for local artwork endpoints', () => {
    expect(shouldRetryImageLoad('/api/artwork/album/31')).toBe(false);
    expect(shouldRetryImageLoad('http://localhost:3000/api/artwork/album/31?_retry=1')).toBe(false);
  });

  it('allows retries for proxied remote images', () => {
    expect(shouldRetryImageLoad('/api/image?url=https%3A%2F%2Fexample.com%2Fcover.jpg')).toBe(true);
  });
});
