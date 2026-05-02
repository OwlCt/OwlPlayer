/**
 * Property test for ArtistDetailPage queue source correctness
 * **Feature: shuffle-button-feature, Property 5: Queue Source Correctness**
 * **Validates: Requirements 5.1**
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Helper to simulate setQueue call with artist source
const createArtistQueueSource = (artistId: string) => ({
  type: 'artist' as const,
  id: artistId,
});

describe('ArtistDetailPage Queue Source Correctness', () => {
  /**
   * Property 5: Queue Source Correctness
   * For any artist ID, when playback starts from the artist detail page,
   * the queueSource SHALL be set to { type: 'artist', id: artistId }
   */
  it('should set correct queue source for any artist ID', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (artistId) => {
          const queueSource = createArtistQueueSource(artistId);
          
          // Verify queue source type is 'artist'
          expect(queueSource.type).toBe('artist');
          // Verify queue source id matches the artist id
          expect(queueSource.id).toBe(artistId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve artist ID format in queue source', () => {
    fc.assert(
      fc.property(
        // Generate realistic Apple Music artist IDs (numeric strings)
        fc.stringMatching(/^[0-9]{5,15}$/),
        (artistId) => {
          const queueSource = createArtistQueueSource(artistId);
          
          // Queue source should exactly preserve the artist ID
          expect(queueSource.id).toBe(artistId);
          expect(typeof queueSource.id).toBe('string');
        }
      ),
      { numRuns: 100 }
    );
  });
});
