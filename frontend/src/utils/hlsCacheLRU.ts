/**
 * HLS Cache LRU Eviction Logic
 * 
 * Pure functions for LRU cache eviction that can be tested independently
 * of the Service Worker environment.
 * 
 * Requirements: 2.4
 */

/**
 * HLS cache entry metadata
 */
export interface HLSCacheEntry {
  songId: string;
  playlistUrl: string;
  segmentUrls: string[];
  cachedAt: number;
  lastAccessed: number;
  totalSize: number;
  expiresAt: number;
}

/**
 * Result of LRU eviction calculation
 */
export interface LRUEvictionResult {
  entriesToEvict: string[];  // Song IDs to evict
  evictedSize: number;       // Total size freed
  remainingSize: number;     // Size after eviction
}

/**
 * Default HLS cache max size (50MB)
 */
export const HLS_CACHE_MAX_SIZE = 50 * 1024 * 1024;

/**
 * Calculate which entries should be evicted using LRU strategy
 * 
 * @param entries - Map of songId to cache entry metadata
 * @param maxSize - Maximum cache size in bytes
 * @returns Eviction result with entries to evict
 */
export function calculateLRUEviction(
  entries: Record<string, HLSCacheEntry>,
  maxSize: number = HLS_CACHE_MAX_SIZE
): LRUEvictionResult {
  const result: LRUEvictionResult = {
    entriesToEvict: [],
    evictedSize: 0,
    remainingSize: 0
  };

  // Calculate total size
  let totalSize = 0;
  const entryList: Array<HLSCacheEntry & { songId: string }> = [];

  for (const songId in entries) {
    const entry = entries[songId];
    totalSize += entry.totalSize || 0;
    entryList.push({ ...entry, songId });
  }

  result.remainingSize = totalSize;

  // Check if eviction is needed
  if (totalSize <= maxSize) {
    return result;
  }

  // Sort by lastAccessed (oldest first) for LRU eviction
  entryList.sort((a, b) => {
    const aTime = a.lastAccessed || a.cachedAt || 0;
    const bTime = b.lastAccessed || b.cachedAt || 0;
    return aTime - bTime;
  });

  // Evict oldest entries until we're under the limit
  for (const entry of entryList) {
    if (result.remainingSize <= maxSize) {
      break;
    }

    result.entriesToEvict.push(entry.songId);
    result.evictedSize += entry.totalSize || 0;
    result.remainingSize -= entry.totalSize || 0;
  }

  return result;
}

/**
 * Verify that eviction result satisfies LRU properties
 * 
 * @param entries - Original entries
 * @param result - Eviction result
 * @param maxSize - Maximum cache size
 * @returns true if eviction is valid
 */
export function verifyLRUEviction(
  entries: Record<string, HLSCacheEntry>,
  result: LRUEvictionResult,
  maxSize: number = HLS_CACHE_MAX_SIZE
): boolean {
  // Property 1: After eviction, remaining size should be at or below limit
  if (result.remainingSize > maxSize) {
    return false;
  }

  // Property 2: Evicted entries should be the oldest ones
  const evictedSet = new Set(result.entriesToEvict);
  const remainingEntries = Object.entries(entries)
    .filter(([songId]) => !evictedSet.has(songId));
  const evictedEntries = Object.entries(entries)
    .filter(([songId]) => evictedSet.has(songId));

  // All evicted entries should have lastAccessed <= all remaining entries
  for (const [, evicted] of evictedEntries) {
    const evictedTime = evicted.lastAccessed || evicted.cachedAt || 0;
    for (const [, remaining] of remainingEntries) {
      const remainingTime = remaining.lastAccessed || remaining.cachedAt || 0;
      if (evictedTime > remainingTime) {
        // Evicted entry is newer than a remaining entry - violates LRU
        return false;
      }
    }
  }

  // Property 3: Evicted size should match sum of evicted entry sizes
  const expectedEvictedSize = evictedEntries.reduce(
    (sum, [, entry]) => sum + (entry.totalSize || 0),
    0
  );
  if (result.evictedSize !== expectedEvictedSize) {
    return false;
  }

  return true;
}

/**
 * Calculate total cache size from entries
 * 
 * @param entries - Map of songId to cache entry metadata
 * @returns Total size in bytes
 */
export function calculateTotalSize(entries: Record<string, HLSCacheEntry>): number {
  let total = 0;
  for (const songId in entries) {
    total += entries[songId].totalSize || 0;
  }
  return total;
}

/**
 * Get entries sorted by last accessed time (oldest first)
 * 
 * @param entries - Map of songId to cache entry metadata
 * @returns Array of entries sorted by lastAccessed
 */
export function getEntriesByAge(
  entries: Record<string, HLSCacheEntry>
): Array<HLSCacheEntry & { songId: string }> {
  const entryList: Array<HLSCacheEntry & { songId: string }> = [];

  for (const songId in entries) {
    entryList.push({ ...entries[songId], songId });
  }

  entryList.sort((a, b) => {
    const aTime = a.lastAccessed || a.cachedAt || 0;
    const bTime = b.lastAccessed || b.cachedAt || 0;
    return aTime - bTime;
  });

  return entryList;
}
