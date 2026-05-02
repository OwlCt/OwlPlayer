import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { getLikeMenuLabel, SONG_MENU_ITEMS } from './SongContextMenu';

/**
 * **Feature: song-like-menu-toggle, Property 1: Like menu label selection based on liked state**
 * 
 * *For any* song and liked state (true or false), the menu label should be 
 * "从'已点赞的歌曲'中删除" when liked is true, and "收藏至你已点赞的歌曲" when liked is false.
 * 
 * **Validates: Requirements 1.1, 1.2**
 */
describe('SongContextMenu - Property Tests', () => {
  it('Property 1: Like menu label selection based on liked state', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (liked: boolean) => {
          const label = getLikeMenuLabel(liked);
          
          if (liked) {
            expect(label).toBe(SONG_MENU_ITEMS.REMOVE_FROM_LIKED);
          } else {
            expect(label).toBe(SONG_MENU_ITEMS.ADD_TO_LIKED);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
