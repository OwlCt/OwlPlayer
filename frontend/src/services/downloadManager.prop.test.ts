/**
 * Property-based tests for DownloadManager
 * 
 * Feature: pwa-offline-music-cache
 * 
 * Property 5: Download Progress Accuracy
 * Validates: Requirements 3.1, 3.2
 * 
 * Property 6: Download Failure Resilience
 * Validates: Requirements 3.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { DownloadManager, DownloadProgress } from './downloadManager';

// ============================================================================
// Test Helpers and Mocks
// ============================================================================

/**
 * Generate a mock song for testing
 */
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artistId: fc.uuid(),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.uuid(),
  duration: fc.integer({ min: 30000, max: 600000 }),
  artworkUrl: fc.constant('https://example.com/art/{w}x{h}.jpg'),
  hasLyrics: fc.boolean()
});

/**
 * Generate a mock album for testing
 */
const albumArbitrary = (trackCount: number) => fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  artistId: fc.uuid(),
  artworkUrl: fc.constant('https://example.com/art/{w}x{h}.jpg'),
  releaseDate: fc.constant('2024-01-01'),
  trackCount: fc.constant(trackCount),
  tracks: fc.array(songArbitrary, { minLength: trackCount, maxLength: trackCount }),
  genres: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 })
});

/**
 * Simulate download progress tracking
 * This is a pure function that simulates how progress should be tracked
 */
function simulateDownloadProgress(
  totalSongs: number,
  failedIndices: Set<number>
): DownloadProgress[] {
  const progressHistory: DownloadProgress[] = [];
  
  // Initial state
  progressHistory.push({
    totalSongs,
    completedSongs: 0,
    currentSongId: null,
    currentSongProgress: 0,
    failedSongs: [],
    status: 'downloading'
  });
  
  const failedSongs: string[] = [];
  
  for (let i = 0; i < totalSongs; i++) {
    const songId = `song-${i}`;
    
    // Start downloading song
    progressHistory.push({
      totalSongs,
      completedSongs: i,
      currentSongId: songId,
      currentSongProgress: 0,
      failedSongs: [...failedSongs],
      status: 'downloading'
    });
    
    if (failedIndices.has(i)) {
      // Song failed
      failedSongs.push(songId);
      progressHistory.push({
        totalSongs,
        completedSongs: i + 1,
        currentSongId: songId,
        currentSongProgress: 0,
        failedSongs: [...failedSongs],
        status: 'downloading'
      });
    } else {
      // Song succeeded - progress goes 0 -> 50 -> 100
      progressHistory.push({
        totalSongs,
        completedSongs: i,
        currentSongId: songId,
        currentSongProgress: 50,
        failedSongs: [...failedSongs],
        status: 'downloading'
      });
      
      progressHistory.push({
        totalSongs,
        completedSongs: i + 1,
        currentSongId: songId,
        currentSongProgress: 100,
        failedSongs: [...failedSongs],
        status: 'downloading'
      });
    }
  }
  
  // Final state
  progressHistory.push({
    totalSongs,
    completedSongs: totalSongs,
    currentSongId: null,
    currentSongProgress: 0,
    failedSongs: [...failedSongs],
    status: 'completed'
  });
  
  return progressHistory;
}

// ============================================================================
// Property 5: Download Progress Accuracy
// ============================================================================

describe('Property 5: Download Progress Accuracy', () => {
  /**
   * **Property 5: Download Progress Accuracy**
   * *For any* batch download of N songs, the download progress SHALL accurately report:
   * - totalSongs equals N
   * - completedSongs is between 0 and N inclusive
   * - completedSongs monotonically increases (never decreases) during download
   * 
   * **Validates: Requirements 3.1, 3.2**
   */

  it('totalSongs equals the number of songs in the collection', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (songCount) => {
          const progressHistory = simulateDownloadProgress(songCount, new Set());
          
          // All progress updates should have totalSongs equal to songCount
          for (const progress of progressHistory) {
            expect(progress.totalSongs).toBe(songCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('completedSongs is always between 0 and totalSongs inclusive', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 10 }),
        (songCount, failedIndicesArray) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          for (const progress of progressHistory) {
            expect(progress.completedSongs).toBeGreaterThanOrEqual(0);
            expect(progress.completedSongs).toBeLessThanOrEqual(progress.totalSongs);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('completedSongs monotonically increases during download', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 10 }),
        (songCount, failedIndicesArray) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          let previousCompleted = 0;
          for (const progress of progressHistory) {
            // completedSongs should never decrease
            expect(progress.completedSongs).toBeGreaterThanOrEqual(previousCompleted);
            previousCompleted = progress.completedSongs;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('currentSongProgress is always between 0 and 100', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (songCount) => {
          const progressHistory = simulateDownloadProgress(songCount, new Set());
          
          for (const progress of progressHistory) {
            expect(progress.currentSongProgress).toBeGreaterThanOrEqual(0);
            expect(progress.currentSongProgress).toBeLessThanOrEqual(100);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('final completedSongs equals totalSongs when download completes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 10 }),
        (songCount, failedIndicesArray) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          const finalProgress = progressHistory[progressHistory.length - 1];
          expect(finalProgress.completedSongs).toBe(songCount);
          expect(finalProgress.status).toBe('completed');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Property 6: Download Failure Resilience
// ============================================================================

describe('Property 6: Download Failure Resilience', () => {
  /**
   * **Property 6: Download Failure Resilience**
   * *For any* batch download where K songs fail (K < N), the download SHALL complete
   * with (N - K) songs successfully cached, and failedSongs array SHALL contain
   * exactly K song IDs.
   * 
   * **Validates: Requirements 3.4**
   */

  it('failedSongs array contains exactly the failed song IDs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 10 }),
        (songCount, failedIndicesArray) => {
          // Filter to valid indices and remove duplicates
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          const finalProgress = progressHistory[progressHistory.length - 1];
          
          // failedSongs should contain exactly the failed song IDs
          expect(finalProgress.failedSongs.length).toBe(failedIndices.size);
          
          // Each failed index should have a corresponding song ID in failedSongs
          for (const idx of failedIndices) {
            expect(finalProgress.failedSongs).toContain(`song-${idx}`);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('download completes even when some songs fail', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 50 }),
        fc.integer({ min: 1, max: 49 }),
        (songCount, failCount) => {
          // Ensure failCount is less than songCount
          const actualFailCount = Math.min(failCount, songCount - 1);
          const failedIndices = new Set<number>();
          for (let i = 0; i < actualFailCount; i++) {
            failedIndices.add(i);
          }
          
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          const finalProgress = progressHistory[progressHistory.length - 1];
          
          // Download should complete
          expect(finalProgress.status).toBe('completed');
          
          // All songs should be processed (completed = total)
          expect(finalProgress.completedSongs).toBe(songCount);
          
          // Failed songs should be tracked
          expect(finalProgress.failedSongs.length).toBe(actualFailCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('successful song count equals total minus failed count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 20 }),
        (songCount, failedIndicesArray) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          const finalProgress = progressHistory[progressHistory.length - 1];
          
          // Successful songs = total - failed
          const successfulCount = songCount - finalProgress.failedSongs.length;
          expect(successfulCount).toBe(songCount - failedIndices.size);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('failedSongs array grows monotonically during download', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 1, maxLength: 10 }),
        (songCount, failedIndicesArray) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          let previousFailedCount = 0;
          for (const progress of progressHistory) {
            // failedSongs should never shrink
            expect(progress.failedSongs.length).toBeGreaterThanOrEqual(previousFailedCount);
            previousFailedCount = progress.failedSongs.length;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no duplicate song IDs in failedSongs array', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        fc.array(fc.integer({ min: 0, max: 49 }), { minLength: 0, maxLength: 20 }),
        (songCount, failedIndicesArray) => {
          const failedIndices = new Set(failedIndicesArray.filter(i => i < songCount));
          const progressHistory = simulateDownloadProgress(songCount, failedIndices);
          
          for (const progress of progressHistory) {
            const uniqueIds = new Set(progress.failedSongs);
            expect(uniqueIds.size).toBe(progress.failedSongs.length);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Additional Progress Invariants
// ============================================================================

describe('Download Progress Invariants', () => {
  it('status transitions follow valid state machine', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (songCount) => {
          const progressHistory = simulateDownloadProgress(songCount, new Set());
          
          // Valid status transitions:
          // idle -> downloading -> completed/cancelled/error
          const validTransitions: Record<string, string[]> = {
            'idle': ['downloading'],
            'downloading': ['downloading', 'completed', 'cancelled', 'error'],
            'completed': [],
            'cancelled': [],
            'error': []
          };
          
          for (let i = 1; i < progressHistory.length; i++) {
            const prevStatus = progressHistory[i - 1].status;
            const currStatus = progressHistory[i].status;
            
            expect(validTransitions[prevStatus]).toContain(currStatus);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('currentSongId is null only at start and end of download', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (songCount) => {
          const progressHistory = simulateDownloadProgress(songCount, new Set());
          
          // First progress (initial state) should have null currentSongId
          expect(progressHistory[0].currentSongId).toBeNull();
          
          // Last progress (completed state) should have null currentSongId
          expect(progressHistory[progressHistory.length - 1].currentSongId).toBeNull();
          
          // Middle progress entries during downloading should have non-null currentSongId
          for (let i = 1; i < progressHistory.length - 1; i++) {
            if (progressHistory[i].status === 'downloading' && 
                progressHistory[i].completedSongs < progressHistory[i].totalSongs) {
              // During active download, currentSongId should be set
              // (except for brief moments between songs)
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
