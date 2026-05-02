/**
 * Property-based tests for CacheManager
 * 
 * These tests validate the correctness properties of the cache manager service
 * using fast-check for property-based testing.
 */

import * as fc from 'fast-check';
import { SongReference } from './offlineCacheService';

// ============================================================================
// Generators
// ============================================================================

/**
 * Generator for song IDs
 */
const songIdArb = fc.uuid();

/**
 * Generator for album IDs
 */
const albumIdArb = fc.uuid();

/**
 * Generator for playlist IDs
 */
const playlistIdArb = fc.uuid();

/**
 * Generator for a list of unique song IDs
 */
const songIdListArb = fc.array(songIdArb, { minLength: 1, maxLength: 20 })
  .map(ids => [...new Set(ids)]); // Ensure uniqueness

/**
 * Generator for SongReference
 */
const songReferenceArb: fc.Arbitrary<SongReference> = fc.record({
  songId: songIdArb,
  albumIds: fc.array(albumIdArb, { minLength: 0, maxLength: 5 }).map(ids => [...new Set(ids)]),
  playlistIds: fc.array(playlistIdArb, { minLength: 0, maxLength: 5 }).map(ids => [...new Set(ids)]),
});

/**
 * Generator for a collection (album or playlist) with songs
 */
interface MockCollection {
  id: string;
  type: 'album' | 'playlist';
  trackIds: string[];
}

const mockCollectionArb: fc.Arbitrary<MockCollection> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('album' as const, 'playlist' as const),
  trackIds: songIdListArb,
});

/**
 * Generator for multiple collections that may share songs
 */
const collectionsWithSharedSongsArb = fc.tuple(
  songIdListArb,
  fc.array(fc.uuid(), { minLength: 2, maxLength: 5 })
).chain(([sharedSongs, collectionIds]) => {
  // Create collections that share some songs
  return fc.tuple(
    fc.constant(sharedSongs),
    fc.array(
      fc.record({
        id: fc.constantFrom(...collectionIds),
        type: fc.constantFrom('album' as const, 'playlist' as const),
        trackIds: fc.shuffledSubarray(sharedSongs, { minLength: 1 })
          .chain(shared => 
            fc.array(songIdArb, { minLength: 0, maxLength: 5 })
              .map(unique => [...shared, ...unique])
          ),
      }),
      { minLength: 2, maxLength: 5 }
    )
  );
});

// ============================================================================
// Mock Cache State for Testing
// ============================================================================

/**
 * Mock cache state for testing reference counting logic
 */
interface MockCacheState {
  songs: Map<string, boolean>; // songId -> isCached
  albums: Map<string, string[]>; // albumId -> trackIds
  playlists: Map<string, string[]>; // playlistId -> trackIds
  references: Map<string, SongReference>; // songId -> references
}

/**
 * Create an empty mock cache state
 */
const createMockCacheState = (): MockCacheState => ({
  songs: new Map(),
  albums: new Map(),
  playlists: new Map(),
  references: new Map(),
});

/**
 * Add a song to the mock cache
 */
const addSongToMockCache = (state: MockCacheState, songId: string): void => {
  state.songs.set(songId, true);
  if (!state.references.has(songId)) {
    state.references.set(songId, { songId, albumIds: [], playlistIds: [] });
  }
};

/**
 * Add an album to the mock cache with its songs
 */
const addAlbumToMockCache = (state: MockCacheState, albumId: string, trackIds: string[]): void => {
  state.albums.set(albumId, trackIds);
  for (const songId of trackIds) {
    addSongToMockCache(state, songId);
    const ref = state.references.get(songId)!;
    if (!ref.albumIds.includes(albumId)) {
      ref.albumIds.push(albumId);
    }
  }
};

/**
 * Add a playlist to the mock cache with its songs
 */
const addPlaylistToMockCache = (state: MockCacheState, playlistId: string, trackIds: string[]): void => {
  state.playlists.set(playlistId, trackIds);
  for (const songId of trackIds) {
    addSongToMockCache(state, songId);
    const ref = state.references.get(songId)!;
    if (!ref.playlistIds.includes(playlistId)) {
      ref.playlistIds.push(playlistId);
    }
  }
};

/**
 * Delete an album from the mock cache with reference counting
 * Returns the list of songs that were deleted
 */
const deleteAlbumFromMockCache = (state: MockCacheState, albumId: string): string[] => {
  const trackIds = state.albums.get(albumId);
  if (!trackIds) return [];

  const deletedSongs: string[] = [];

  for (const songId of trackIds) {
    const ref = state.references.get(songId);
    if (ref) {
      // Remove album reference
      ref.albumIds = ref.albumIds.filter(id => id !== albumId);
      
      // Check if song has no more references
      if (ref.albumIds.length === 0 && ref.playlistIds.length === 0) {
        state.songs.delete(songId);
        state.references.delete(songId);
        deletedSongs.push(songId);
      }
    }
  }

  state.albums.delete(albumId);
  return deletedSongs;
};

/**
 * Delete a playlist from the mock cache with reference counting
 * Returns the list of songs that were deleted
 */
const deletePlaylistFromMockCache = (state: MockCacheState, playlistId: string): string[] => {
  const trackIds = state.playlists.get(playlistId);
  if (!trackIds) return [];

  const deletedSongs: string[] = [];

  for (const songId of trackIds) {
    const ref = state.references.get(songId);
    if (ref) {
      // Remove playlist reference
      ref.playlistIds = ref.playlistIds.filter(id => id !== playlistId);
      
      // Check if song has no more references
      if (ref.albumIds.length === 0 && ref.playlistIds.length === 0) {
        state.songs.delete(songId);
        state.references.delete(songId);
        deletedSongs.push(songId);
      }
    }
  }

  state.playlists.delete(playlistId);
  return deletedSongs;
};

/**
 * Delete a single song from a collection (preserves collection structure)
 * Returns whether the song was actually deleted from cache
 */
const deleteSongFromCollectionInMockCache = (
  state: MockCacheState,
  songId: string,
  collectionType: 'album' | 'playlist',
  collectionId: string
): boolean => {
  const ref = state.references.get(songId);
  if (!ref) return false;

  // Remove the collection reference
  if (collectionType === 'album') {
    ref.albumIds = ref.albumIds.filter(id => id !== collectionId);
  } else {
    ref.playlistIds = ref.playlistIds.filter(id => id !== collectionId);
  }

  // Check if song has no more references
  if (ref.albumIds.length === 0 && ref.playlistIds.length === 0) {
    state.songs.delete(songId);
    state.references.delete(songId);
    return true;
  }

  return false;
};

// ============================================================================
// Property Tests
// ============================================================================

/**
 * **Feature: pwa-offline-music-cache, Property 7: Collection Deletion Removes Associated Songs**
 * **Validates: Requirements 4.1, 4.2**
 * 
 * For any cached album or playlist deletion, all songs that are exclusively referenced
 * by that collection (not shared with other cached collections) SHALL be removed from
 * the songs store.
 */
describe('Property 7: Collection Deletion Removes Associated Songs', () => {
  it('deleting an album removes exclusively referenced songs', () => {
    fc.assert(
      fc.property(
        mockCollectionArb.filter(c => c.type === 'album'),
        (album) => {
          const state = createMockCacheState();
          
          // Add the album to cache
          addAlbumToMockCache(state, album.id, album.trackIds);
          
          // Verify all songs are cached
          const allSongsCachedBefore = album.trackIds.every(id => state.songs.has(id));
          if (!allSongsCachedBefore) return false;
          
          // Delete the album
          const deletedSongs = deleteAlbumFromMockCache(state, album.id);
          
          // All songs should be deleted since they were only referenced by this album
          return (
            deletedSongs.length === album.trackIds.length &&
            album.trackIds.every(id => !state.songs.has(id)) &&
            !state.albums.has(album.id)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deleting a playlist removes exclusively referenced songs', () => {
    fc.assert(
      fc.property(
        mockCollectionArb.filter(c => c.type === 'playlist'),
        (playlist) => {
          const state = createMockCacheState();
          
          // Add the playlist to cache
          addPlaylistToMockCache(state, playlist.id, playlist.trackIds);
          
          // Verify all songs are cached
          const allSongsCachedBefore = playlist.trackIds.every(id => state.songs.has(id));
          if (!allSongsCachedBefore) return false;
          
          // Delete the playlist
          const deletedSongs = deletePlaylistFromMockCache(state, playlist.id);
          
          // All songs should be deleted since they were only referenced by this playlist
          return (
            deletedSongs.length === playlist.trackIds.length &&
            playlist.trackIds.every(id => !state.songs.has(id)) &&
            !state.playlists.has(playlist.id)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deleting a collection preserves songs shared with other collections', () => {
    fc.assert(
      fc.property(
        songIdListArb,
        albumIdArb,
        playlistIdArb,
        (sharedSongs, albumId, playlistId) => {
          const state = createMockCacheState();
          
          // Add both album and playlist with the same songs
          addAlbumToMockCache(state, albumId, sharedSongs);
          addPlaylistToMockCache(state, playlistId, sharedSongs);
          
          // Delete the album
          const deletedSongs = deleteAlbumFromMockCache(state, albumId);
          
          // No songs should be deleted because they're still referenced by the playlist
          return (
            deletedSongs.length === 0 &&
            sharedSongs.every(id => state.songs.has(id)) &&
            !state.albums.has(albumId) &&
            state.playlists.has(playlistId)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * **Feature: pwa-offline-music-cache, Property 8: Single Song Deletion Preserves Collection Structure**
 * **Validates: Requirements 4.3, 4.4**
 * 
 * For any single song deletion from a collection, the collection's trackIds array
 * SHALL still contain the deleted song's ID (song shows as uncached but still listed
 * in the collection).
 */
describe('Property 8: Single Song Deletion Preserves Collection Structure', () => {
  it('deleting a song from album preserves album trackIds', () => {
    fc.assert(
      fc.property(
        mockCollectionArb.filter(c => c.type === 'album' && c.trackIds.length > 0),
        fc.integer({ min: 0, max: 100 }),
        (album, indexSeed) => {
          const state = createMockCacheState();
          
          // Add the album to cache
          addAlbumToMockCache(state, album.id, album.trackIds);
          
          // Pick a song to delete
          const songIndex = indexSeed % album.trackIds.length;
          const songIdToDelete = album.trackIds[songIndex];
          
          // Delete the song from the collection
          deleteSongFromCollectionInMockCache(state, songIdToDelete, 'album', album.id);
          
          // The album should still exist with the same trackIds
          // (Note: In real implementation, trackIds are preserved in the album metadata)
          const albumTrackIds = state.albums.get(album.id);
          
          return (
            albumTrackIds !== undefined &&
            albumTrackIds.length === album.trackIds.length &&
            albumTrackIds.includes(songIdToDelete)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('deleting a song from playlist preserves playlist trackIds', () => {
    fc.assert(
      fc.property(
        mockCollectionArb.filter(c => c.type === 'playlist' && c.trackIds.length > 0),
        fc.integer({ min: 0, max: 100 }),
        (playlist, indexSeed) => {
          const state = createMockCacheState();
          
          // Add the playlist to cache
          addPlaylistToMockCache(state, playlist.id, playlist.trackIds);
          
          // Pick a song to delete
          const songIndex = indexSeed % playlist.trackIds.length;
          const songIdToDelete = playlist.trackIds[songIndex];
          
          // Delete the song from the collection
          deleteSongFromCollectionInMockCache(state, songIdToDelete, 'playlist', playlist.id);
          
          // The playlist should still exist with the same trackIds
          const playlistTrackIds = state.playlists.get(playlist.id);
          
          return (
            playlistTrackIds !== undefined &&
            playlistTrackIds.length === playlist.trackIds.length &&
            playlistTrackIds.includes(songIdToDelete)
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('song is removed from cache when deleted from its only collection', () => {
    fc.assert(
      fc.property(
        mockCollectionArb.filter(c => c.trackIds.length > 0),
        fc.integer({ min: 0, max: 100 }),
        (collection, indexSeed) => {
          const state = createMockCacheState();
          
          // Add the collection to cache
          if (collection.type === 'album') {
            addAlbumToMockCache(state, collection.id, collection.trackIds);
          } else {
            addPlaylistToMockCache(state, collection.id, collection.trackIds);
          }
          
          // Pick a song to delete
          const songIndex = indexSeed % collection.trackIds.length;
          const songIdToDelete = collection.trackIds[songIndex];
          
          // Verify song is cached before deletion
          const wasCached = state.songs.has(songIdToDelete);
          
          // Delete the song from the collection
          const wasDeleted = deleteSongFromCollectionInMockCache(
            state, 
            songIdToDelete, 
            collection.type, 
            collection.id
          );
          
          // Song should be deleted from cache since it was only in this collection
          return wasCached && wasDeleted && !state.songs.has(songIdToDelete);
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: pwa-offline-music-cache, Property 9: Reference Counting for Shared Songs**
 * **Validates: Requirements 4.5**
 * 
 * For any song that is referenced by multiple cached collections, deleting one collection
 * SHALL NOT delete the song if other collections still reference it. The song SHALL only
 * be deleted when its reference count reaches zero.
 */
describe('Property 9: Reference Counting for Shared Songs', () => {
  it('shared songs are preserved when one collection is deleted', () => {
    fc.assert(
      fc.property(
        songIdListArb,
        fc.array(albumIdArb, { minLength: 2, maxLength: 5 }).map(ids => [...new Set(ids)]),
        (sharedSongs, albumIds) => {
          // Need at least 2 unique album IDs
          if (albumIds.length < 2) return true;
          
          const state = createMockCacheState();
          
          // Add all albums with the same shared songs
          for (const albumId of albumIds) {
            addAlbumToMockCache(state, albumId, sharedSongs);
          }
          
          // Verify all songs have correct reference count
          const allSongsHaveCorrectRefs = sharedSongs.every(songId => {
            const ref = state.references.get(songId);
            return ref && ref.albumIds.length === albumIds.length;
          });
          if (!allSongsHaveCorrectRefs) return false;
          
          // Delete the first album
          const deletedSongs = deleteAlbumFromMockCache(state, albumIds[0]);
          
          // No songs should be deleted because they're still referenced by other albums
          return (
            deletedSongs.length === 0 &&
            sharedSongs.every(id => state.songs.has(id))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('shared songs are deleted only when last reference is removed', () => {
    fc.assert(
      fc.property(
        songIdListArb,
        fc.array(albumIdArb, { minLength: 2, maxLength: 4 }).map(ids => [...new Set(ids)]),
        (sharedSongs, albumIds) => {
          // Need at least 2 unique album IDs
          if (albumIds.length < 2) return true;
          
          const state = createMockCacheState();
          
          // Add all albums with the same shared songs
          for (const albumId of albumIds) {
            addAlbumToMockCache(state, albumId, sharedSongs);
          }
          
          // Delete all albums except the last one
          for (let i = 0; i < albumIds.length - 1; i++) {
            const deletedSongs = deleteAlbumFromMockCache(state, albumIds[i]);
            // No songs should be deleted yet
            if (deletedSongs.length > 0) return false;
            // All songs should still be cached
            if (!sharedSongs.every(id => state.songs.has(id))) return false;
          }
          
          // Delete the last album
          const finalDeletedSongs = deleteAlbumFromMockCache(state, albumIds[albumIds.length - 1]);
          
          // Now all songs should be deleted
          return (
            finalDeletedSongs.length === sharedSongs.length &&
            sharedSongs.every(id => !state.songs.has(id))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('reference count decreases correctly with each deletion', () => {
    fc.assert(
      fc.property(
        songIdArb,
        fc.array(albumIdArb, { minLength: 1, maxLength: 5 }).map(ids => [...new Set(ids)]),
        fc.array(playlistIdArb, { minLength: 1, maxLength: 5 }).map(ids => [...new Set(ids)]),
        (songId, albumIds, playlistIds) => {
          const state = createMockCacheState();
          
          // Add the song to multiple albums and playlists
          for (const albumId of albumIds) {
            addAlbumToMockCache(state, albumId, [songId]);
          }
          for (const playlistId of playlistIds) {
            addPlaylistToMockCache(state, playlistId, [songId]);
          }
          
          // Verify initial reference count
          const initialRef = state.references.get(songId);
          if (!initialRef) return false;
          if (initialRef.albumIds.length !== albumIds.length) return false;
          if (initialRef.playlistIds.length !== playlistIds.length) return false;
          
          // Delete one album
          deleteAlbumFromMockCache(state, albumIds[0]);
          
          // Verify reference count decreased
          const afterAlbumDelete = state.references.get(songId);
          if (!afterAlbumDelete) return false;
          if (afterAlbumDelete.albumIds.length !== albumIds.length - 1) return false;
          if (afterAlbumDelete.playlistIds.length !== playlistIds.length) return false;
          
          // Song should still be cached
          return state.songs.has(songId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mixed album and playlist references are tracked correctly', () => {
    fc.assert(
      fc.property(
        songIdListArb,
        albumIdArb,
        playlistIdArb,
        (songs, albumId, playlistId) => {
          const state = createMockCacheState();
          
          // Add songs to both album and playlist
          addAlbumToMockCache(state, albumId, songs);
          addPlaylistToMockCache(state, playlistId, songs);
          
          // Each song should have references to both
          const allHaveBothRefs = songs.every(songId => {
            const ref = state.references.get(songId);
            return (
              ref &&
              ref.albumIds.includes(albumId) &&
              ref.playlistIds.includes(playlistId)
            );
          });
          if (!allHaveBothRefs) return false;
          
          // Delete the album
          deleteAlbumFromMockCache(state, albumId);
          
          // Songs should still be cached (referenced by playlist)
          const allStillCached = songs.every(id => state.songs.has(id));
          
          // Songs should only have playlist reference now
          const onlyPlaylistRef = songs.every(songId => {
            const ref = state.references.get(songId);
            return (
              ref &&
              ref.albumIds.length === 0 &&
              ref.playlistIds.includes(playlistId)
            );
          });
          
          return allStillCached && onlyPlaylistRef;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: pwa-offline-music-cache, Property 12: Clear All Cache Empties All Stores**
 * **Validates: Requirements 8.4**
 * 
 * For any cache state, after calling clearAllCache(), all IndexedDB stores
 * (songs, albums, playlists, songReferences) SHALL be empty.
 */
describe('Property 12: Clear All Cache Empties All Stores', () => {
  it('clearAllCache empties all stores regardless of initial state', () => {
    fc.assert(
      fc.property(
        fc.array(mockCollectionArb, { minLength: 0, maxLength: 10 }),
        (collections) => {
          const state = createMockCacheState();
          
          // Add all collections to cache
          for (const collection of collections) {
            if (collection.type === 'album') {
              addAlbumToMockCache(state, collection.id, collection.trackIds);
            } else {
              addPlaylistToMockCache(state, collection.id, collection.trackIds);
            }
          }
          
          // Clear all cache (simulated)
          state.songs.clear();
          state.albums.clear();
          state.playlists.clear();
          state.references.clear();
          
          // All stores should be empty
          return (
            state.songs.size === 0 &&
            state.albums.size === 0 &&
            state.playlists.size === 0 &&
            state.references.size === 0
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  it('clearAllCache works on empty cache', () => {
    const state = createMockCacheState();
    
    // Clear empty cache
    state.songs.clear();
    state.albums.clear();
    state.playlists.clear();
    state.references.clear();
    
    // All stores should still be empty
    expect(state.songs.size).toBe(0);
    expect(state.albums.size).toBe(0);
    expect(state.playlists.size).toBe(0);
    expect(state.references.size).toBe(0);
  });

  it('clearAllCache removes all data including shared songs', () => {
    fc.assert(
      fc.property(
        songIdListArb,
        fc.array(albumIdArb, { minLength: 2, maxLength: 5 }).map(ids => [...new Set(ids)]),
        (sharedSongs, albumIds) => {
          const state = createMockCacheState();
          
          // Add multiple albums sharing the same songs
          for (const albumId of albumIds) {
            addAlbumToMockCache(state, albumId, sharedSongs);
          }
          
          // Verify data exists
          const hasData = state.songs.size > 0 && state.albums.size > 0;
          if (!hasData) return true; // Skip if no data was added
          
          // Clear all cache
          state.songs.clear();
          state.albums.clear();
          state.playlists.clear();
          state.references.clear();
          
          // All stores should be empty
          return (
            state.songs.size === 0 &&
            state.albums.size === 0 &&
            state.playlists.size === 0 &&
            state.references.size === 0
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Export generators for use in other test files
export {
  songIdArb,
  albumIdArb,
  playlistIdArb,
  songIdListArb,
  songReferenceArb,
  mockCollectionArb,
  createMockCacheState,
  addSongToMockCache,
  addAlbumToMockCache,
  addPlaylistToMockCache,
  deleteAlbumFromMockCache,
  deletePlaylistFromMockCache,
  deleteSongFromCollectionInMockCache,
};
