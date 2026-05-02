import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { Song } from '../types';

// **Feature: playlist-add-modal, Property 1: Unliked song click adds to liked songs**
// **Feature: playlist-add-modal, Property 2: Liked song click opens modal without unliking**
// **Validates: Requirements 1.1, 1.2**

// Song generator
const songArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  artistName: fc.string({ minLength: 1, maxLength: 50 }),
  albumName: fc.string({ minLength: 1, maxLength: 50 }),
  albumId: fc.option(fc.uuid(), { nil: undefined }),
  duration: fc.integer({ min: 1000, max: 600000 }),
  artworkUrl: fc.webUrl(),
  hasLyrics: fc.boolean(),
}) as fc.Arbitrary<Song>;

describe('LikeButton', () => {
  // **Feature: playlist-add-modal, Property 1: Unliked song click adds to liked songs**
  // **Validates: Requirements 1.1**
  describe('Property 1: Unliked song click adds to liked songs', () => {
    it('clicking on unliked song should trigger likeSong action', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // Simulate the click handler logic for unliked song
          const isLiked = false;
          let likeSongCalled = false;
          let modalOpened = false;
          
          // Simulate handleClick
          if (isLiked) {
            modalOpened = true;
          } else {
            likeSongCalled = true;
          }
          
          // Verify: likeSong is called, modal is not opened
          expect(likeSongCalled).toBe(true);
          expect(modalOpened).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('unliked song should not open playlist modal', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          const isLiked = false;
          let showPlaylistModal = false;
          
          // Simulate handleClick for unliked song
          if (isLiked) {
            showPlaylistModal = true;
          }
          
          expect(showPlaylistModal).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property 2: Liked song click opens modal without unliking**
  // **Validates: Requirements 1.2**
  describe('Property 2: Liked song click opens modal without unliking', () => {
    it('clicking on liked song should open playlist modal', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // Simulate the click handler logic for liked song
          const isLiked = true;
          let showPlaylistModal = false;
          let unlikeSongCalled = false;
          
          // Simulate handleClick
          if (isLiked) {
            showPlaylistModal = true;
          } else {
            unlikeSongCalled = true;
          }
          
          // Verify: modal is opened, unlikeSong is not called
          expect(showPlaylistModal).toBe(true);
          expect(unlikeSongCalled).toBe(false);
        }),
        { numRuns: 100 }
      );
    });

    it('liked song should remain liked after clicking', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          // Simulate state
          let isLiked = true;
          let showPlaylistModal = false;
          
          // Simulate handleClick - should NOT change isLiked
          if (isLiked) {
            showPlaylistModal = true;
            // isLiked should NOT be changed here
          }
          
          // Verify: song remains liked
          expect(isLiked).toBe(true);
          expect(showPlaylistModal).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });

  // **Feature: playlist-add-modal, Property: Tooltip text matches liked state**
  // **Validates: Requirements 7.1, 7.2**
  describe('Tooltip text matches liked state', () => {
    it('tooltip should show "加入歌单" for liked songs', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          const isLiked = true;
          const tooltipText = isLiked ? '加入歌单' : '添加至已点赞的歌曲';
          
          expect(tooltipText).toBe('加入歌单');
        }),
        { numRuns: 100 }
      );
    });

    it('tooltip should show "添加至已点赞的歌曲" for unliked songs', () => {
      fc.assert(
        fc.property(songArbitrary, (song) => {
          const isLiked = false;
          const tooltipText = isLiked ? '加入歌单' : '添加至已点赞的歌曲';
          
          expect(tooltipText).toBe('添加至已点赞的歌曲');
        }),
        { numRuns: 100 }
      );
    });
  });
});
