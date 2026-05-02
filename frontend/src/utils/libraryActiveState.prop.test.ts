import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { isItemActive, isItemPlaying, isLikedSongsPlaying, isValidPlaylistName } from './libraryActiveState';
import { QueueSource } from '../store/playerStore';

// **Feature: expanded-library-features, Property 1: Active State Detection**
// **Validates: Requirements 4.2, 4.3, 4.4, 4.6**

describe('Library Active State Utilities', () => {
  describe('Property 1: Active State Detection', () => {
    // **Feature: expanded-library-features, Property 1: Active State Detection**
    // **Validates: Requirements 4.2, 4.3, 4.4, 4.6**

    const itemTypes = ['playlist', 'album', 'artist'] as const;

    it('should return true when currentPage matches the pattern {type}-{id}', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          (type, id) => {
            const currentPage = `${type}-${id}`;
            const result = isItemActive(type, id, currentPage);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when currentPage does not match', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          fc.uuid(),
          (type, id, otherId) => {
            fc.pre(id !== otherId);
            const currentPage = `${type}-${otherId}`;
            const result = isItemActive(type, id, currentPage);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when type does not match', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          (type, otherType, id) => {
            fc.pre(type !== otherType);
            const currentPage = `${otherType}-${id}`;
            const result = isItemActive(type, id, currentPage);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle liked-songs type correctly', () => {
      expect(isItemActive('liked-songs', 'liked-songs', 'liked-songs')).toBe(true);
      expect(isItemActive('liked-songs', 'liked-songs', 'playlist-123')).toBe(false);
      expect(isItemActive('liked-songs', 'liked-songs', 'album-456')).toBe(false);
    });

    it('should return false for unknown types', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => !['playlist', 'album', 'artist', 'liked-songs'].includes(s)),
          fc.uuid(),
          fc.string(),
          (type, id, currentPage) => {
            const result = isItemActive(type, id, currentPage);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: expanded-library-features, Property 6: Play Callback Queue Source**
  // **Validates: Requirements 2.2, 7.2**
  describe('Property 6: Play Callback Queue Source', () => {
    const itemTypes = ['playlist', 'album', 'artist'] as const;

    it('should return true when queue source matches item type and id', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          (type, id) => {
            const queueSource: QueueSource = { type, id };
            const result = isItemPlaying(type, id, true, queueSource);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when player is not playing', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          (type, id) => {
            const queueSource: QueueSource = { type, id };
            const result = isItemPlaying(type, id, false, queueSource);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when queue source type does not match', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          (type, otherType, id) => {
            fc.pre(type !== otherType);
            const queueSource: QueueSource = { type: otherType, id };
            const result = isItemPlaying(type, id, true, queueSource);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return false when queue source id does not match', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...itemTypes),
          fc.uuid(),
          fc.uuid(),
          (type, id, otherId) => {
            fc.pre(id !== otherId);
            const queueSource: QueueSource = { type, id: otherId };
            const result = isItemPlaying(type, id, true, queueSource);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly detect liked songs playing state', () => {
      const playingSource: QueueSource = { type: 'liked-songs', id: null };
      expect(isLikedSongsPlaying(true, playingSource)).toBe(true);
      expect(isLikedSongsPlaying(false, playingSource)).toBe(false);
      
      const otherSource: QueueSource = { type: 'playlist', id: '123' };
      expect(isLikedSongsPlaying(true, otherSource)).toBe(false);
    });
  });

  // **Feature: expanded-library-features, Property 5: Empty Playlist Name Rejection**
  // **Validates: Requirements 5.3**
  describe('Property 5: Empty Playlist Name Rejection', () => {
    it('should reject empty strings', () => {
      expect(isValidPlaylistName('')).toBe(false);
    });

    it('should reject whitespace-only strings', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 20 }),
          (whitespaceChars) => {
            const whitespaceString = whitespaceChars.join('');
            const result = isValidPlaylistName(whitespaceString);
            expect(result).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept non-empty, non-whitespace strings', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s.trim().length > 0),
          (validName) => {
            const result = isValidPlaylistName(validName);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should accept strings with leading/trailing whitespace if they have content', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => s.trim().length > 0),
          fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }),
          fc.array(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 }),
          (content, leadingWsChars, trailingWsChars) => {
            const leadingWs = leadingWsChars.join('');
            const trailingWs = trailingWsChars.join('');
            const nameWithWhitespace = leadingWs + content + trailingWs;
            const result = isValidPlaylistName(nameWithWhitespace);
            expect(result).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
