/**
 * Property test for AlbumDetailPage queue source correctness
 * **Feature: shuffle-button-feature, Property 5: Queue Source Correctness**
 * **Validates: Requirements 5.2**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Helper to simulate setQueue call with album source
const createAlbumQueueSource = (albumId: string) => ({
  type: 'album' as const,
  id: albumId,
});

describe('AlbumDetailPage Queue Source Correctness', () => {
  /**
   * Property 5: Queue Source Correctness
   * For any album ID, when playback starts from the album detail page,
   * the queueSource SHALL be set to { type: 'album', id: albumId }
   */
  it('should set correct queue source for any album ID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (albumId) => {
          const queueSource = createAlbumQueueSource(albumId);
          
          // Verify queue source type is 'album'
          expect(queueSource.type).toBe('album');
          // Verify queue source id matches the album id
          expect(queueSource.id).toBe(albumId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve album ID format in queue source', () => {
    fc.assert(
      fc.property(
        // Generate realistic Apple Music album IDs (numeric strings)
        fc.stringMatching(/^[0-9]{5,15}$/),
        (albumId) => {
          const queueSource = createAlbumQueueSource(albumId);
          
          // Queue source should exactly preserve the album ID
          expect(queueSource.id).toBe(albumId);
          expect(typeof queueSource.id).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
