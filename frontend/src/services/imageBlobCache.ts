import { openDB, DBSchema, IDBPDatabase } from 'idb';

const DB_NAME = 'owl-image-cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const MAX_BYTES = 100 * 1024 * 1024;
const TARGET_AFTER_EVICT_BYTES = 90 * 1024 * 1024;

interface ImageRecord {
  url: string;
  blob: Blob;
  size: number;
  cachedAt: number;
  lastAccessed: number;
}

interface ImageCacheDB extends DBSchema {
  images: {
    key: string;
    value: ImageRecord;
    indexes: { 'by-lastAccessed': number };
  };
}

let dbPromise: Promise<IDBPDatabase<ImageCacheDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<ImageCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
          store.createIndex('by-lastAccessed', 'lastAccessed');
        }
      },
    });
  }
  return dbPromise;
}

const blobUrlMap = new Map<string, string>();
const knownMisses = new Set<string>();

const KEYABLE_PROTOCOLS = /^(\/|https?:|api\/)/;

function isCacheable(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('blob:') || url.startsWith('data:')) return false;
  return KEYABLE_PROTOCOLS.test(url) || url.startsWith('/');
}

export async function getCachedImageBlobUrl(url: string): Promise<string | null> {
  if (!isCacheable(url)) return null;
  const existing = blobUrlMap.get(url);
  if (existing) return existing;
  if (knownMisses.has(url)) return null;
  try {
    const db = await getDB();
    const record = await db.get(STORE_NAME, url);
    if (!record) {
      knownMisses.add(url);
      return null;
    }
    void db.put(STORE_NAME, { ...record, lastAccessed: Date.now() });
    const objectUrl = URL.createObjectURL(record.blob);
    blobUrlMap.set(url, objectUrl);
    return objectUrl;
  } catch (err) {
    console.warn('[imageBlobCache] getCachedImageBlobUrl failed', err);
    return null;
  }
}

export async function cacheImageBlob(url: string, blob: Blob): Promise<void> {
  if (!isCacheable(url) || !blob || blob.size === 0) return;
  if (blob.size > 2 * 1024 * 1024) return;
  try {
    const db = await getDB();
    const now = Date.now();
    await db.put(STORE_NAME, {
      url,
      blob,
      size: blob.size,
      cachedAt: now,
      lastAccessed: now,
    });
    knownMisses.delete(url);
    void enforceLimit();
  } catch (err) {
    console.warn('[imageBlobCache] cacheImageBlob failed', err);
  }
}

export async function isImageBlobCached(url: string): Promise<boolean> {
  if (!isCacheable(url)) return false;
  if (blobUrlMap.has(url)) return true;
  if (knownMisses.has(url)) return false;
  try {
    const db = await getDB();
    const record = await db.get(STORE_NAME, url);
    if (record) return true;
    knownMisses.add(url);
    return false;
  } catch {
    return false;
  }
}

let evictInFlight: Promise<void> | null = null;

async function enforceLimit(): Promise<void> {
  if (evictInFlight) return evictInFlight;
  evictInFlight = (async () => {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let total = 0;
      let cursor = await store.openCursor();
      const entries: Array<{ url: string; size: number; lastAccessed: number }> = [];
      while (cursor) {
        total += cursor.value.size || 0;
        entries.push({
          url: cursor.value.url,
          size: cursor.value.size || 0,
          lastAccessed: cursor.value.lastAccessed || 0,
        });
        cursor = await cursor.continue();
      }
      if (total <= MAX_BYTES) {
        await tx.done;
        return;
      }
      entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
      let freed = 0;
      for (const entry of entries) {
        if (total - freed <= TARGET_AFTER_EVICT_BYTES) break;
        await store.delete(entry.url);
        freed += entry.size;
        const cachedUrl = blobUrlMap.get(entry.url);
        if (cachedUrl) {
          URL.revokeObjectURL(cachedUrl);
          blobUrlMap.delete(entry.url);
        }
      }
      await tx.done;
    } catch (err) {
      console.warn('[imageBlobCache] enforceLimit failed', err);
    } finally {
      evictInFlight = null;
    }
  })();
  return evictInFlight;
}

export async function clearImageBlobCache(): Promise<void> {
  try {
    const db = await getDB();
    await db.clear(STORE_NAME);
    for (const objUrl of blobUrlMap.values()) {
      URL.revokeObjectURL(objUrl);
    }
    blobUrlMap.clear();
    knownMisses.clear();
  } catch (err) {
    console.warn('[imageBlobCache] clearImageBlobCache failed', err);
  }
}
