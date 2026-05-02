/**
 * Property-based tests for retired prefetch behavior in playerStore.
 * Apple Music prefetch is no longer part of the local playback path.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

vi.mock('../api', () => ({
  getPlaybackState: vi.fn().mockResolvedValue(null),
  savePlaybackState: vi.fn().mockResolvedValue(undefined),
  savePlaybackProgress: vi.fn().mockResolvedValue(undefined),
  prefetchSongs: vi.fn().mockResolvedValue({}),
  getPrefetchStatus: vi.fn().mockResolvedValue({}),
}));

import { getPrefetchStatus, prefetchSongs } from '../api';
import { usePlayerStore } from './playerStore';

describe('playerStore retired prefetch behavior', () => {
  beforeEach(() => {
    usePlayerStore.setState({
      queue: [],
      queueIndex: -1,
      originalQueue: [],
      shuffledQueue: [],
      currentSong: null,
      prefetchStatuses: {},
      prefetchCount: 3,
      audioRef: null,
    });
    vi.clearAllMocks();
  });

  it('triggerPrefetch never calls the legacy prefetch API for any queue shape', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 24 }),
            name: fc.string({ minLength: 1, maxLength: 48 }),
            artistName: fc.string({ minLength: 1, maxLength: 48 }),
            artistId: fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: undefined }),
            albumName: fc.string({ minLength: 1, maxLength: 48 }),
            albumId: fc.option(fc.string({ minLength: 1, maxLength: 24 }), { nil: undefined }),
            duration: fc.integer({ min: 1, max: 600000 }),
            artworkUrl: fc.string(),
            hasLyrics: fc.boolean(),
          }),
          { maxLength: 20 }
        ),
        fc.integer({ min: -1, max: 20 }),
        (songs, queueIndex) => {
          const boundedIndex = songs.length === 0 ? -1 : Math.min(Math.max(queueIndex, 0), songs.length - 1);
          usePlayerStore.setState({
            queue: songs,
            queueIndex: boundedIndex,
            currentSong: boundedIndex >= 0 ? songs[boundedIndex] : null,
          });

          usePlayerStore.getState().triggerPrefetch();

          expect(prefetchSongs).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('refreshPrefetchStatuses never polls the legacy prefetch status API', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.string({ minLength: 1, maxLength: 24 }), { maxLength: 10 }), async () => {
        await usePlayerStore.getState().refreshPrefetchStatuses();
        expect(getPrefetchStatus).not.toHaveBeenCalled();
      }),
      { numRuns: 50 }
    );
  });
});
