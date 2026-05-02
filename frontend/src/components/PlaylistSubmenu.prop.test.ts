import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { filterPlaylists } from './PlaylistSubmenu';
import { Playlist } from '../store/playlistsStore';

// **Feature: context-menu, Property 6: Playlist filter correctness**
// **Validates: Requirements 3.6**

// Generator for ISO date string
const isoDateArbitrary = fc.integer({ min: 1577836800000, max: 1767225600000 }) // 2020-01-01 to 2025-12-31
  .map(ts => new Date(ts).toISOString());

// Generator for Playlist
const playlistArbitrary: fc.Arbitrary<Playlist> = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  description: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
  artwork_url: fc.option(fc.webUrl(), { nil: undefined }),
  song_count: fc.integer({ min: 0, max: 1000 }),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
});

describe('PlaylistSubmenu Filter Logic', () => {
  // **Feature: context-menu, Property 6: Playlist filter correctness**
  // **Validates: Requirements 3.6**
  
  describe('Property 6: Playlist filter correctness', () => {
    it('filtered results should only contain playlists whose names include the search query (case-insensitive)', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArbitrary, { minLength: 0, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          (playlists, searchQuery) => {
            const filtered = filterPlaylists(playlists, searchQuery);
            const queryLower = searchQuery.toLowerCase().trim();
            
            // All filtered results should contain the query
            for (const playlist of filtered) {
              if (queryLower) {
                expect(playlist.name.toLowerCase()).toContain(queryLower);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('empty search query should return all playlists', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArbitrary, { minLength: 0, maxLength: 20 }),
          (playlists) => {
            const filtered = filterPlaylists(playlists, '');
            expect(filtered).toEqual(playlists);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('whitespace-only search query should return all playlists', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArbitrary, { minLength: 0, maxLength: 20 }),
          fc.constantFrom('   ', '\t', '\n', '  \t  ', '\n\n'),
          (playlists, whitespace) => {
            const filtered = filterPlaylists(playlists, whitespace);
            expect(filtered).toEqual(playlists);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filter should be case-insensitive', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArbitrary, { minLength: 1, maxLength: 20 }),
          (playlists) => {
            // Pick a random playlist and use part of its name as query
            const randomPlaylist = playlists[0];
            const query = randomPlaylist.name.slice(0, Math.min(3, randomPlaylist.name.length));
            
            const filteredLower = filterPlaylists(playlists, query.toLowerCase());
            const filteredUpper = filterPlaylists(playlists, query.toUpperCase());
            
            // Both should return the same results
            expect(filteredLower.map(p => p.id).sort()).toEqual(filteredUpper.map(p => p.id).sort());
          }
        ),
        { numRuns: 100 }
      );
    });

    it('filtered results should be a subset of original playlists', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArbitrary, { minLength: 0, maxLength: 20 }),
          fc.string({ minLength: 0, maxLength: 20 }),
          (playlists, searchQuery) => {
            const filtered = filterPlaylists(playlists, searchQuery);
            
            // Filtered length should be <= original length
            expect(filtered.length).toBeLessThanOrEqual(playlists.length);
            
            // All filtered items should exist in original
            const originalIds = new Set(playlists.map(p => p.id));
            for (const playlist of filtered) {
              expect(originalIds.has(playlist.id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('no matching playlists should return empty array', () => {
      fc.assert(
        fc.property(
          fc.array(playlistArbitrary, { minLength: 0, maxLength: 10 }),
          (playlists) => {
            // Use a query that's unlikely to match any playlist name
            const impossibleQuery = '___IMPOSSIBLE_QUERY_12345___';
            const filtered = filterPlaylists(playlists, impossibleQuery);
            expect(filtered).toEqual([]);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
