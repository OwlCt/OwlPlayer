/**
 * Service Worker for OwlPlayer PWA
 * Handles caching of essential assets for offline support
 * 
 * Requirements: 10.1, 10.3, 10.4, 5.1, 5.2, 5.3, 5.4, 5.6, 2.6
 */

const CACHE_NAME = 'owlplayer-v8';
const STATIC_CACHE_NAME = 'owlplayer-static-v8';
const DYNAMIC_CACHE_NAME = 'owlplayer-dynamic-v8';
const AUDIO_CACHE_NAME = 'owlplayer-audio-v1';

// Audio cache configuration
const AUDIO_CACHE_MAX_SIZE = 500 * 1024 * 1024; // 500MB
const AUDIO_CACHE_MAX_ITEMS = 50; // Maximum number of cached songs

// HLS cache configuration for iOS PWA background playback continuity
// Requirements: 2.1, 2.2, 2.4
const HLS_CACHE_NAME = 'owlplayer-hls-v1';
const HLS_CACHE_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const HLS_PLAYLIST_TTL = 5 * 60 * 1000; // 5 minutes TTL for m3u8 playlists
const HLS_SEGMENTS_TO_PREFETCH = 2; // Default number of segments to prefetch

// Essential assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/OwlPlayer-200x200.png',
  '/OwlPlayer-400x400.png',
];

// API routes that should use network-first strategy
const API_ROUTES = ['/api/'];

const API_NO_CACHE_PREFIXES = [
  '/api/playback-state',
];

// API routes that should use cache-first strategy (like static assets)
const API_CACHE_FIRST_PREFIXES = [
  '/api/avatars/',
  '/api/proxy/image',
  '/api/image',  // Proxied artwork images
];

// API routes matching specific patterns for cache-first
const API_CACHE_FIRST_PATTERNS = [
  /^\/api\/playlists\/[^/]+\/cover$/,  // Playlist cover images
];

// Audio stream routes - use cache-first for offline playback
const AUDIO_STREAM_PREFIX = '/api/stream/';

// Assets that should use cache-first strategy
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  /\.(?:woff|woff2|ttf|otf|eot)$/,
];

/**
 * Install event - cache essential static assets
 * Requirement: 10.1 - Cache essential assets for faster subsequent loads
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching', STATIC_ASSETS.length, 'static assets');
        return Promise.all(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => {
              console.warn('[SW] Failed to cache:', url, err.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Static assets cached');
      })
      .catch((error) => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => {
              // Delete old version caches, keep current version, audio cache, and HLS cache
              return name.startsWith('owlplayer-') && 
                     name !== STATIC_CACHE_NAME && 
                     name !== DYNAMIC_CACHE_NAME &&
                     name !== AUDIO_CACHE_NAME &&
                     name !== HLS_CACHE_NAME;
            })
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Old caches cleaned, taking control');
        return self.clients.claim();
      })
  );
});

/**
 * Fetch event - handle network requests with appropriate caching strategies
 * Requirement: 10.3 - Display cached content when offline
 * Requirement: 10.4 - Sync when connectivity is restored
 * Requirement: 5.1 - Cache-first for audio streams
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Audio stream requests - cache-first for offline playback
  // Requirement: 5.1, 5.2, 5.4
  if (url.pathname.startsWith(AUDIO_STREAM_PREFIX)) {
    event.respondWith(audioStreamCacheFirst(request, url));
    return;
  }

  // API routes that should use cache-first (avatars, proxied images)
  if (API_CACHE_FIRST_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API routes matching cache-first patterns (playlist covers, etc.)
  if (API_CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // API requests - Network first, fall back to cache
  if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Static assets (images, fonts) - Cache first
  if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation requests - Network first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Default - Stale while revalidate for JS/CSS bundles
  event.respondWith(staleWhileRevalidate(request));
});

/**
 * Audio stream cache-first strategy
 * Requirement: 5.1 - Cache-first for audio streams
 * Requirement: 5.2 - Cache audio for offline playback
 * Requirement: 5.3 - Limit cache size
 * Requirement: 5.4 - Serve cached audio when offline
 * Requirement: 2.6 - Respect backend cache headers (no-cache for m3u8)
 * Requirement: 2.2 - Short TTL for m3u8 playlists
 * Requirement: 2.3 - Cache-first for HLS segments
 */
async function audioStreamCacheFirst(request, url) {
  const pathname = url.pathname;
  
  // Check if this is an HLS playlist (m3u8)
  // Requirement: 2.2 - Use short TTL cache for m3u8 playlists
  if (pathname.endsWith('.m3u8') || pathname.includes('playlist.m3u8')) {
    return await hlsPlaylistCacheFirst(request, url);
  }
  
  // Check if this is an HLS segment (.ts file)
  // Requirement: 2.3 - Cache-first for HLS segments
  if (isHLSMediaAssetPath(pathname)) {
    return await hlsSegmentCacheFirst(request, url);
  }
  
  // For other audio files (direct stream), use cache-first with audio cache
  const audioCache = await caches.open(AUDIO_CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await audioCache.match(request);
  if (cachedResponse) {
    console.log('[SW] Audio cache hit:', pathname);
    return cachedResponse;
  }
  
  // Not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Check cache headers - respect no-cache directive
      const cacheControl = networkResponse.headers.get('Cache-Control') || '';
      const shouldCache = !cacheControl.includes('no-cache') && !cacheControl.includes('no-store');
      
      if (shouldCache) {
        // Clone response before caching
        const responseToCache = networkResponse.clone();
        
        // Cache the response and manage cache size
        cacheAudioResponse(audioCache, request, responseToCache);
      }
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Audio fetch failed:', pathname, error);
    
    // Return offline error
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Audio not available offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function normalizeHLSCacheUrl(input) {
  try {
    const raw = typeof input === 'string' ? input : input.url;
    const url = new URL(raw, self.location.origin);
    url.searchParams.delete('t');
    url.searchParams.delete('_t');
    return url.href;
  } catch {
    return typeof input === 'string' ? input : input.url;
  }
}

function isHLSMediaAssetPath(pathname) {
  return pathname.endsWith('.ts') ||
         pathname.endsWith('.m4s') ||
         pathname.endsWith('/init.mp4') ||
         /\/segment[0-9]+\.(ts|m4s)$/i.test(pathname) ||
         pathname.includes('segment_');
}

/**
 * HLS playlist (m3u8) cache strategy with short TTL
 * Requirement: 2.2 - Short TTL (5 minutes) for m3u8 playlists
 * Requirement: 1.4 - Serve from cache without network request when cached
 * 
 * Property 4: Cache-First Serving
 * For any HLS resource request where the resource is cached (and not expired),
 * the Service Worker SHALL serve from cache without making a network request.
 * 
 * @param {Request} request - The request object
 * @param {URL} url - Parsed URL
 * @returns {Promise<Response>} Response from cache or network
 */
async function hlsPlaylistCacheFirst(request, url) {
  const pathname = url.pathname;
  const hlsCache = await caches.open(HLS_CACHE_NAME);
  const cacheKey = normalizeHLSCacheUrl(request);
  
  // Try HLS cache first
  const cachedResponse = await hlsCache.match(cacheKey);
  if (cachedResponse) {
    // Check if playlist is still fresh (within TTL)
    // Extract song ID from URL to check metadata
    const songIdMatch = pathname.match(/\/api\/stream\/([^/]+)\/playlist\.m3u8/);
    if (songIdMatch) {
      const songId = songIdMatch[1];
      const metadata = await getHLSCacheEntry(songId);
      
      if (metadata && metadata.expiresAt && Date.now() < metadata.expiresAt) {
        console.log('[SW] HLS playlist cache hit (fresh, no network):', pathname);
        // Update last accessed timestamp
        await touchHLSCacheEntry(songId);
        // Return cached response with custom header to indicate cache hit
        const headers = new Headers(cachedResponse.headers);
        headers.set('X-SW-Cache-Hit', 'true');
        headers.set('X-SW-Cache-Source', 'hls-cache');
        headers.set('X-SW-Cache-Fresh', 'true');
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers
        });
      } else {
        console.log('[SW] HLS playlist cache expired, fetching fresh:', pathname);
      }
    } else {
      // No metadata, but we have cached response - use it
      console.log('[SW] HLS playlist cache hit (no network):', pathname);
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-SW-Cache-Hit', 'true');
      headers.set('X-SW-Cache-Source', 'hls-cache');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
  }
  
  // Cache miss or expired - fetch from network
  console.log('[SW] HLS playlist cache miss, fetching from network:', pathname);
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache the playlist
      const responseToCache = networkResponse.clone();
      await hlsCache.put(cacheKey, responseToCache);
      
      // Update metadata if we can extract song ID
      const songIdMatch = pathname.match(/\/api\/stream\/([^/]+)\/playlist\.m3u8/);
      if (songIdMatch) {
        const songId = songIdMatch[1];
        await updateHLSCacheMetadata({
          songId,
          playlistUrl: cacheKey,
          segmentUrls: [],
          totalSize: 0,
          cachedAt: Date.now()
        });
      }
      
      console.log('[SW] HLS playlist cached from network:', pathname);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] HLS playlist fetch failed:', pathname, error);
    
    // If we have a cached response (even if expired), return it as fallback
    if (cachedResponse) {
      console.log('[SW] Returning stale HLS playlist from cache (offline fallback):', pathname);
      const headers = new Headers(cachedResponse.headers);
      headers.set('X-SW-Cache-Hit', 'true');
      headers.set('X-SW-Cache-Source', 'hls-cache');
      headers.set('X-SW-Cache-Stale', 'true');
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers
      });
    }
    
    // Return offline error
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Cannot load playlist while offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * HLS segment cache-first strategy
 * Requirement: 2.3 - Cache-first for HLS segments
 * Requirement: 1.4 - Serve from cache without network request when cached
 * 
 * Property 4: Cache-First Serving
 * For any HLS resource request where the resource is cached, 
 * the Service Worker SHALL serve from cache without making a network request.
 * 
 * @param {Request} request - The request object
 * @param {URL} url - Parsed URL
 * @returns {Promise<Response>} Response from cache or network
 */
async function hlsSegmentCacheFirst(request, url) {
  const pathname = url.pathname;
  const hlsCache = await caches.open(HLS_CACHE_NAME);
  const cacheKey = normalizeHLSCacheUrl(request);
  
  // Try HLS cache first - CACHE HIT = NO NETWORK REQUEST
  // This is critical for iOS PWA background playback continuity
  const cachedResponse = await hlsCache.match(cacheKey);
  if (cachedResponse) {
    console.log('[SW] HLS segment cache hit (no network):', pathname);
    // Return cached response with custom header to indicate cache hit
    const headers = new Headers(cachedResponse.headers);
    headers.set('X-SW-Cache-Hit', 'true');
    headers.set('X-SW-Cache-Source', 'hls-cache');
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers
    });
  }
  
  // Also check audio cache (for backward compatibility)
  const audioCache = await caches.open(AUDIO_CACHE_NAME);
  const audioCachedResponse = await audioCache.match(cacheKey);
  if (audioCachedResponse) {
    console.log('[SW] HLS segment audio cache hit (no network):', pathname);
    const headers = new Headers(audioCachedResponse.headers);
    headers.set('X-SW-Cache-Hit', 'true');
    headers.set('X-SW-Cache-Source', 'audio-cache');
    return new Response(audioCachedResponse.body, {
      status: audioCachedResponse.status,
      statusText: audioCachedResponse.statusText,
      headers
    });
  }
  
  // Cache miss - must fetch from network
  console.log('[SW] HLS segment cache miss, fetching from network:', pathname);
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache the segment in HLS cache for future requests
      const responseToCache = networkResponse.clone();
      await hlsCache.put(cacheKey, responseToCache);
      console.log('[SW] HLS segment cached from network:', pathname);
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] HLS segment fetch failed:', pathname, error);
    
    // Return offline error
    return new Response(
      JSON.stringify({ error: 'offline', message: 'Audio segment not available offline' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Cache audio response with size management
 * Requirement: 5.3 - Limit cache size (500MB)
 * Requirement: 5.6 - LRU cache cleanup
 */
async function cacheAudioResponse(cache, request, response) {
  try {
    // Get content length from response
    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
    
    // Check if we need to clean up cache before adding
    await enforceAudioCacheLimit(cache, contentLength);
    
    // Store the response
    await cache.put(request, response);
    
    // Store metadata for LRU tracking
    await updateAudioCacheMetadata(request.url, contentLength);
    
    console.log('[SW] Audio cached:', new URL(request.url).pathname);
  } catch (error) {
    console.error('[SW] Failed to cache audio:', error);
  }
}

/**
 * Enforce audio cache size limit using LRU eviction
 * Requirement: 5.3 - Limit cache size
 * Requirement: 5.6 - Clean up old entries
 */
async function enforceAudioCacheLimit(cache, newItemSize) {
  try {
    const keys = await cache.keys();
    
    // If under item limit and we don't have size info, just check item count
    if (keys.length < AUDIO_CACHE_MAX_ITEMS) {
      return;
    }
    
    // Get metadata for all cached items
    const metadata = await getAudioCacheMetadata();
    
    // Calculate total size
    let totalSize = 0;
    const itemsWithMeta = [];
    
    for (const key of keys) {
      const url = key.url;
      const meta = metadata[url] || { size: 0, timestamp: 0 };
      totalSize += meta.size;
      itemsWithMeta.push({ url, ...meta, request: key });
    }
    
    // Check if we need to evict
    const needsEviction = keys.length >= AUDIO_CACHE_MAX_ITEMS || 
                          (totalSize + newItemSize) > AUDIO_CACHE_MAX_SIZE;
    
    if (!needsEviction) {
      return;
    }
    
    // Sort by timestamp (oldest first) for LRU eviction
    itemsWithMeta.sort((a, b) => a.timestamp - b.timestamp);
    
    // Evict oldest items until we have space
    let evictedCount = 0;
    let evictedSize = 0;
    
    while (
      (keys.length - evictedCount >= AUDIO_CACHE_MAX_ITEMS || 
       (totalSize - evictedSize + newItemSize) > AUDIO_CACHE_MAX_SIZE) &&
      evictedCount < itemsWithMeta.length
    ) {
      const item = itemsWithMeta[evictedCount];
      await cache.delete(item.request);
      evictedSize += item.size;
      evictedCount++;
      console.log('[SW] Evicted audio from cache:', new URL(item.url).pathname);
    }
    
    // Update metadata
    if (evictedCount > 0) {
      const evictedUrls = itemsWithMeta.slice(0, evictedCount).map(i => i.url);
      await removeFromAudioCacheMetadata(evictedUrls);
    }
  } catch (error) {
    console.error('[SW] Error enforcing cache limit:', error);
  }
}

/**
 * Audio cache metadata storage using IndexedDB
 * Stores size and timestamp for LRU eviction
 */
const AUDIO_META_DB_NAME = 'owlplayer-audio-meta';
const AUDIO_META_STORE_NAME = 'metadata';

async function openAudioMetaDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_META_DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(AUDIO_META_STORE_NAME)) {
        db.createObjectStore(AUDIO_META_STORE_NAME, { keyPath: 'url' });
      }
    };
  });
}

async function getAudioCacheMetadata() {
  try {
    const db = await openAudioMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_META_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUDIO_META_STORE_NAME);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = {};
        for (const item of request.result) {
          result[item.url] = { size: item.size, timestamp: item.timestamp };
        }
        resolve(result);
      };
    });
  } catch (error) {
    console.error('[SW] Error getting audio cache metadata:', error);
    return {};
  }
}

async function updateAudioCacheMetadata(url, size) {
  try {
    const db = await openAudioMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_META_STORE_NAME);
      
      store.put({
        url,
        size,
        timestamp: Date.now()
      });
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Error updating audio cache metadata:', error);
  }
}

async function removeFromAudioCacheMetadata(urls) {
  try {
    const db = await openAudioMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_META_STORE_NAME);
      
      for (const url of urls) {
        store.delete(url);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Error removing audio cache metadata:', error);
  }
}

/**
 * HLS cache metadata storage using IndexedDB
 * Stores song ID, playlist URL, segment URLs, timestamps for LRU eviction
 * Requirements: 2.1, 2.2, 2.4
 */
const HLS_META_DB_NAME = 'owlplayer-hls-meta';
const HLS_META_STORE_NAME = 'hls-cache-metadata';

/**
 * Open HLS metadata IndexedDB
 */
async function openHLSMetaDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HLS_META_DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(HLS_META_STORE_NAME)) {
        const store = db.createObjectStore(HLS_META_STORE_NAME, { keyPath: 'songId' });
        store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        store.createIndex('cachedAt', 'cachedAt', { unique: false });
      }
    };
  });
}

/**
 * Get all HLS cache metadata entries
 * @returns {Promise<Object>} Map of songId to metadata
 */
async function getHLSCacheMetadata() {
  try {
    const db = await openHLSMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HLS_META_STORE_NAME, 'readonly');
      const store = tx.objectStore(HLS_META_STORE_NAME);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = {};
        for (const item of request.result) {
          result[item.songId] = item;
        }
        resolve(result);
      };
    });
  } catch (error) {
    console.error('[SW] Error getting HLS cache metadata:', error);
    return {};
  }
}

/**
 * Get HLS cache metadata for a specific song
 * @param {string} songId - Song ID
 * @returns {Promise<Object|null>} Metadata entry or null
 */
async function getHLSCacheEntry(songId) {
  try {
    const db = await openHLSMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HLS_META_STORE_NAME, 'readonly');
      const store = tx.objectStore(HLS_META_STORE_NAME);
      const request = store.get(songId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (error) {
    console.error('[SW] Error getting HLS cache entry:', error);
    return null;
  }
}

/**
 * Update or create HLS cache metadata entry
 * @param {Object} entry - HLS cache entry
 * @param {string} entry.songId - Song ID
 * @param {string} entry.playlistUrl - m3u8 playlist URL
 * @param {string[]} entry.segmentUrls - Array of segment URLs
 * @param {number} entry.totalSize - Total size in bytes
 */
async function updateHLSCacheMetadata(entry) {
  try {
    const db = await openHLSMetaDB();
    const now = Date.now();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HLS_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HLS_META_STORE_NAME);
      
      store.put({
        songId: entry.songId,
        playlistUrl: entry.playlistUrl,
        segmentUrls: entry.segmentUrls || [],
        cachedAt: entry.cachedAt || now,
        lastAccessed: now,
        totalSize: entry.totalSize || 0,
        expiresAt: now + HLS_PLAYLIST_TTL
      });
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Error updating HLS cache metadata:', error);
  }
}

/**
 * Update last accessed timestamp for HLS cache entry
 * @param {string} songId - Song ID
 */
async function touchHLSCacheEntry(songId) {
  try {
    const entry = await getHLSCacheEntry(songId);
    if (entry) {
      entry.lastAccessed = Date.now();
      await updateHLSCacheMetadata(entry);
    }
  } catch (error) {
    console.error('[SW] Error touching HLS cache entry:', error);
  }
}

/**
 * Remove HLS cache metadata entries
 * @param {string[]} songIds - Array of song IDs to remove
 */
async function removeFromHLSCacheMetadata(songIds) {
  try {
    const db = await openHLSMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HLS_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HLS_META_STORE_NAME);
      
      for (const songId of songIds) {
        store.delete(songId);
      }
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Error removing HLS cache metadata:', error);
  }
}

/**
 * Clear all HLS cache metadata
 */
async function clearHLSCacheMetadata() {
  try {
    const db = await openHLSMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(HLS_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(HLS_META_STORE_NAME);
      store.clear();
      
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Error clearing HLS cache metadata:', error);
  }
}

/**
 * Parse m3u8 playlist content and extract segment URLs
 * Handles both relative and absolute URLs
 * Requirement: 1.2
 * 
 * @param {string} content - m3u8 playlist content
 * @param {string} baseUrl - Base URL for resolving relative paths
 * @returns {string[]} Array of segment URLs
 */
function parseM3U8Playlist(content, baseUrl) {
  if (!content || typeof content !== 'string') {
    return [];
  }
  
  const lines = content.split('\n');
  const segmentUrls = [];
  
  // Parse base URL for resolving relative paths
  let base;
  try {
    base = new URL(baseUrl);
  } catch (e) {
    console.error('[SW] Invalid base URL for m3u8 parsing:', baseUrl);
    return [];
  }
  
  // Get the directory path from base URL (remove filename if present)
  const basePath = base.pathname.substring(0, base.pathname.lastIndexOf('/') + 1);
  
  for (const line of lines) {
    const trimmedLine = line.trim();

    const uriMatch = trimmedLine.match(/URI="([^"]+)"/i);
    if (uriMatch && uriMatch[1]) {
      const uri = uriMatch[1];
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        segmentUrls.push(uri);
      } else if (uri.startsWith('/')) {
        segmentUrls.push(`${base.origin}${uri}`);
      } else {
        segmentUrls.push(`${base.origin}${basePath}${uri}`);
      }
      continue;
    }
    
    // Skip empty lines and comments/tags
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }
    
    // This should be a segment URL
    let segmentUrl;
    
    if (trimmedLine.startsWith('http://') || trimmedLine.startsWith('https://')) {
      // Absolute URL
      segmentUrl = trimmedLine;
    } else if (trimmedLine.startsWith('/')) {
      // Absolute path - use origin from base URL
      segmentUrl = `${base.origin}${trimmedLine}`;
    } else {
      // Relative path - resolve against base directory
      segmentUrl = `${base.origin}${basePath}${trimmedLine}`;
    }
    
    segmentUrls.push(segmentUrl);
  }
  
  return segmentUrls;
}

/**
 * Prefetch HLS resources for a song
 * 1. Fetch and cache m3u8 playlist
 * 2. Parse playlist to get segment URLs
 * 3. Prefetch first N segments
 * Requirements: 1.2, 1.3, 2.1, 2.5, 2.6
 * 
 * @param {string} songId - Song ID to prefetch
 * @param {number} segmentCount - Number of segments to prefetch (default: 2)
 * @returns {Promise<Object>} Prefetch result
 */
async function prefetchHLSResources(songId, playlistUrl, segmentCount = HLS_SEGMENTS_TO_PREFETCH) {
  const result = {
    success: false,
    songId,
    playlistCached: false,
    segmentsCached: 0,
    totalSegments: 0,
    error: null
  };
  
  if (!songId) {
    result.error = 'No song ID provided';
    return result;
  }
  
  const resolvedPlaylistUrl = playlistUrl || `/api/stream/${songId}/playlist.m3u8`;
  
  try {
    // Open HLS cache
    const hlsCache = await caches.open(HLS_CACHE_NAME);
    const playlistCacheKey = normalizeHLSCacheUrl(resolvedPlaylistUrl);
    
    // Step 1: Fetch m3u8 playlist
    console.log('[SW] Prefetching HLS playlist for song:', songId);
    const playlistResponse = await fetch(resolvedPlaylistUrl, { credentials: 'include' });
    
    if (!playlistResponse.ok) {
      result.error = `Failed to fetch playlist: ${playlistResponse.status}`;
      console.error('[SW] HLS prefetch failed:', result.error);
      return result;
    }
    
    // Clone response for caching
    const playlistToCache = playlistResponse.clone();
    const playlistContent = await playlistResponse.text();
    
    // Cache the playlist with TTL metadata
    await hlsCache.put(playlistCacheKey, playlistToCache);
    result.playlistCached = true;
    console.log('[SW] HLS playlist cached:', resolvedPlaylistUrl);
    
    // Step 2: Parse playlist to get segment URLs
    // Construct full URL for parsing
    const fullPlaylistUrl = new URL(resolvedPlaylistUrl, self.location.origin).href;
    const segmentUrls = parseM3U8Playlist(playlistContent, fullPlaylistUrl);
    result.totalSegments = segmentUrls.length;
    
    console.log('[SW] Found', segmentUrls.length, 'segments in playlist');
    
    // Step 3: Prefetch first N segments
    const segmentsToPrefetch = segmentUrls.slice(0, segmentCount);
    let totalSize = 0;
    
    for (const segmentUrl of segmentsToPrefetch) {
      try {
        const normalizedSegmentUrl = normalizeHLSCacheUrl(segmentUrl);
        // Check if already cached
        const existingResponse = await hlsCache.match(normalizedSegmentUrl);
        if (existingResponse) {
          result.segmentsCached++;
          console.log('[SW] HLS segment already cached:', segmentUrl);
          continue;
        }
        
        // Fetch and cache segment
        console.log('[SW] Prefetching HLS segment:', segmentUrl);
        const segmentResponse = await fetch(segmentUrl, { credentials: 'include' });
        
        if (segmentResponse.ok) {
          const contentLength = parseInt(segmentResponse.headers.get('Content-Length') || '0', 10);
          totalSize += contentLength;
          
          await hlsCache.put(normalizedSegmentUrl, segmentResponse.clone());
          result.segmentsCached++;
          console.log('[SW] HLS segment cached:', segmentUrl);
        } else {
          console.warn('[SW] Failed to fetch HLS segment:', segmentUrl, segmentResponse.status);
        }
      } catch (segmentError) {
        console.error('[SW] Error prefetching HLS segment:', segmentUrl, segmentError);
      }
    }
    
    // Step 4: Update metadata
    await updateHLSCacheMetadata({
      songId,
      playlistUrl: playlistCacheKey,
      segmentUrls: segmentsToPrefetch.map(normalizeHLSCacheUrl),
      totalSize,
      cachedAt: Date.now()
    });
    
    // Step 5: Enforce cache limit
    await enforceHLSCacheLimit();
    
    result.success = result.playlistCached && result.segmentsCached > 0;
    console.log('[SW] HLS prefetch complete for song:', songId, result);
    
    return result;
  } catch (error) {
    result.error = error.message;
    console.error('[SW] HLS prefetch error:', error);
    return result;
  }
}

/**
 * Check if HLS resources for a song are cached
 * Requirement: 5.5
 * 
 * @param {string} songId - Song ID to check
 * @returns {Promise<Object>} Cache status
 */
async function checkHLSCached(songId, playlistUrl) {
  const result = {
    songId,
    playlistCached: false,
    segmentsCached: 0,
    totalSegments: 0,
    isFullyCached: false
  };
  
  if (!songId) {
    return result;
  }
  
  try {
    const hlsCache = await caches.open(HLS_CACHE_NAME);
    const resolvedPlaylistUrl = playlistUrl || `/api/stream/${songId}/playlist.m3u8`;
    const playlistCacheKey = normalizeHLSCacheUrl(resolvedPlaylistUrl);
    
    // Check if playlist is cached
    const playlistResponse = await hlsCache.match(playlistCacheKey);
    if (!playlistResponse) {
      return result;
    }
    
    result.playlistCached = true;
    
    // Get metadata to check segments
    const metadata = await getHLSCacheEntry(songId);
    if (metadata && metadata.segmentUrls) {
      result.totalSegments = metadata.segmentUrls.length;
      
      // Check how many segments are cached
      for (const segmentUrl of metadata.segmentUrls) {
        const segmentResponse = await hlsCache.match(normalizeHLSCacheUrl(segmentUrl));
        if (segmentResponse) {
          result.segmentsCached++;
        }
      }
      
      // Consider fully cached if playlist and all expected segments are cached
      result.isFullyCached = result.playlistCached && 
                             result.segmentsCached >= result.totalSegments &&
                             result.totalSegments > 0;
    }
    
    // Update last accessed timestamp
    if (result.playlistCached) {
      await touchHLSCacheEntry(songId);
    }
    
    return result;
  } catch (error) {
    console.error('[SW] Error checking HLS cache:', error);
    return result;
  }
}

/**
 * Enforce HLS cache size limit using LRU eviction
 * Requirement: 2.4 - Evict oldest entries when cache exceeds 50MB
 * 
 * @returns {Promise<void>}
 */
async function enforceHLSCacheLimit() {
  try {
    const hlsCache = await caches.open(HLS_CACHE_NAME);
    const metadata = await getHLSCacheMetadata();
    
    // Calculate total size from metadata
    let totalSize = 0;
    const entries = [];
    
    for (const songId in metadata) {
      const entry = metadata[songId];
      totalSize += entry.totalSize || 0;
      entries.push({
        songId,
        lastAccessed: entry.lastAccessed || entry.cachedAt || 0,
        totalSize: entry.totalSize || 0,
        playlistUrl: entry.playlistUrl,
        segmentUrls: entry.segmentUrls || []
      });
    }
    
    // Check if we need to evict
    if (totalSize <= HLS_CACHE_MAX_SIZE) {
      console.log('[SW] HLS cache within limit:', totalSize, '/', HLS_CACHE_MAX_SIZE);
      return;
    }
    
    console.log('[SW] HLS cache exceeds limit:', totalSize, '/', HLS_CACHE_MAX_SIZE, '- starting LRU eviction');
    
    // Sort by lastAccessed (oldest first) for LRU eviction
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
    
    // Evict oldest entries until we're under the limit
    const evictedSongIds = [];
    let evictedSize = 0;
    
    for (const entry of entries) {
      if (totalSize - evictedSize <= HLS_CACHE_MAX_SIZE) {
        break;
      }
      
      // Delete playlist from cache
      if (entry.playlistUrl) {
        await hlsCache.delete(entry.playlistUrl);
        console.log('[SW] Evicted HLS playlist:', entry.playlistUrl);
      }
      
      // Delete segments from cache
      for (const segmentUrl of entry.segmentUrls) {
        await hlsCache.delete(segmentUrl);
      }
      
      evictedSongIds.push(entry.songId);
      evictedSize += entry.totalSize;
      
      console.log('[SW] Evicted HLS cache for song:', entry.songId, 'size:', entry.totalSize);
    }
    
    // Remove metadata for evicted entries
    if (evictedSongIds.length > 0) {
      await removeFromHLSCacheMetadata(evictedSongIds);
      console.log('[SW] HLS cache LRU eviction complete. Evicted', evictedSongIds.length, 'songs, freed', evictedSize, 'bytes');
    }
  } catch (error) {
    console.error('[SW] Error enforcing HLS cache limit:', error);
  }
}

/**
 * Get HLS cache status (size, item count)
 * @returns {Promise<Object>} Cache status
 */
async function getHLSCacheStatus() {
  try {
    const hlsCache = await caches.open(HLS_CACHE_NAME);
    const keys = await hlsCache.keys();
    const metadata = await getHLSCacheMetadata();
    
    let totalSize = 0;
    let songCount = 0;
    
    for (const songId in metadata) {
      totalSize += metadata[songId].totalSize || 0;
      songCount++;
    }
    
    return {
      itemCount: keys.length,
      songCount,
      totalSize,
      maxSize: HLS_CACHE_MAX_SIZE
    };
  } catch (error) {
    console.error('[SW] Error getting HLS cache status:', error);
    return {
      itemCount: 0,
      songCount: 0,
      totalSize: 0,
      maxSize: HLS_CACHE_MAX_SIZE,
      error: error.message
    };
  }
}

/**
 * Clear all HLS cache
 * @returns {Promise<void>}
 */
async function clearHLSCache() {
  try {
    await caches.delete(HLS_CACHE_NAME);
    await clearHLSCacheMetadata();
    console.log('[SW] HLS cache cleared');
  } catch (error) {
    console.error('[SW] Error clearing HLS cache:', error);
  }
}


/**
 * Network first strategy - try network, fall back to cache
 * Used for API requests
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    const url = new URL(request.url);
    const isNoCacheEndpoint = API_NO_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
    const cacheControl = networkResponse.headers.get('Cache-Control') || '';
    const responseSaysNoCache = /no-store|no-cache/i.test(cacheControl);

    if (networkResponse.ok && !isNoCacheEndpoint && !responseSaysNoCache) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for API
    return new Response(
      JSON.stringify({ error: 'offline', message: 'You are currently offline' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Cache first strategy - try cache, fall back to network
 * Used for static assets like images and fonts
 * 
 * Note: Uses URL string for cache matching to handle cases where
 * Media Session API sends requests with different headers/modes
 * (especially on Firefox Android)
 */
async function cacheFirst(request) {
  const url = new URL(request.url);
  const cacheKey = request.url; // Use URL string for consistent matching
  
  // Check static cache first
  const staticCache = await caches.open(STATIC_CACHE_NAME);
  const staticResponse = await staticCache.match(cacheKey);
  if (staticResponse) {
    console.log('[SW] Static cache hit:', url.pathname);
    return staticResponse;
  }
  
  // Check dynamic cache
  const dynamicCache = await caches.open(DYNAMIC_CACHE_NAME);
  const cachedResponse = await dynamicCache.match(cacheKey);
  if (cachedResponse) {
    console.log('[SW] Dynamic cache hit:', url.pathname);
    return cachedResponse;
  }

  console.log('[SW] Cache miss, fetching:', url.pathname);
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      // Use URL string as cache key for consistent matching
      dynamicCache.put(cacheKey, networkResponse.clone());
      console.log('[SW] Cached response for:', url.pathname);
    }
    
    return networkResponse;
  } catch (error) {
    // Return a placeholder for images if offline
    if (request.destination === 'image') {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#282828" width="200" height="200"/></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    throw error;
  }
}

/**
 * Navigation handler with offline-first fallback
 * When offline, immediately return cached index.html without waiting for network timeout
 */
async function networkFirstWithOfflineFallback(request) {
  // Check if we're offline - if so, skip network entirely for faster response
  if (!navigator.onLine) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fall back to cached index.html for SPA routing
    const indexResponse = await caches.match('/index.html');
    if (indexResponse) {
      return indexResponse;
    }
  }
  
  // Online: try network first with a timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const networkResponse = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    // Cache the response
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Network failed or timed out, try all caches
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Fall back to cached index.html for SPA routing
    const indexResponse = await caches.match('/index.html');
    if (indexResponse) {
      return indexResponse;
    }
    
    throw error;
  }
}

/**
 * Stale while revalidate strategy
 * Returns cached version immediately, updates cache in background
 * Used for JS/CSS bundles
 */
async function staleWhileRevalidate(request) {
  // Check static cache first
  const staticCache = await caches.open(STATIC_CACHE_NAME);
  const staticResponse = await staticCache.match(request);
  if (staticResponse) {
    return staticResponse;
  }
  
  // Check dynamic cache
  const dynamicCache = await caches.open(DYNAMIC_CACHE_NAME);
  const dynamicResponse = await dynamicCache.match(request);
  if (dynamicResponse) {
    // Update cache in background (don't await)
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.ok) {
          dynamicCache.put(request, networkResponse.clone());
        }
      })
      .catch(() => {});
    return dynamicResponse;
  }
  
  // Check all caches (including old versions for transition period)
  const anyCache = await caches.match(request);
  if (anyCache) {
    return anyCache;
  }

  // No cached response - must fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      dynamicCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Network failed and no cache - return offline error for scripts
    const url = new URL(request.url);
    if (url.pathname.endsWith('.js') || url.pathname.endsWith('.mjs')) {
      return new Response(
        'throw new Error("ChunkLoadError: Loading chunk failed (offline)");',
        { 
          status: 200,
          headers: { 'Content-Type': 'application/javascript' }
        }
      );
    }
    throw error;
  }
}

/**
 * Notification click handler - focus or open the app when media notification is clicked
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If a window is already open, focus it
        for (const client of clientList) {
          if ('focus' in client) {
            return client.focus();
          }
        }
        // Otherwise, open a new window
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

/**
 * Message handler for communication with the main app
 * Supports cache clearing, status checks, and audio cache management
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      Promise.all(names.map(name => caches.delete(name)))
        .then(() => {
          event.ports[0].postMessage({ success: true });
        });
    });
  }
  
  // Get audio cache status
  if (event.data && event.data.type === 'GET_AUDIO_CACHE_STATUS') {
    getAudioCacheStatus().then((status) => {
      event.ports[0].postMessage(status);
    });
  }
  
  // Clear audio cache
  if (event.data && event.data.type === 'CLEAR_AUDIO_CACHE') {
    clearAudioCache().then(() => {
      event.ports[0].postMessage({ success: true });
    });
  }
  
  // Prefetch audio for background playback
  // This is called by the main app to pre-cache upcoming songs
  if (event.data && event.data.type === 'PREFETCH_AUDIO') {
    const songIds = event.data.songIds || [];
    prefetchAudioForBackground(songIds).then((results) => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true, results });
      }
    }).catch((error) => {
      console.error('[SW] Prefetch error:', error);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: false, error: error.message });
      }
    });
  }
  
  // Prefetch HLS resources for iOS PWA background playback continuity
  // Requirements: 1.2, 1.3, 2.1, 2.5, 2.6
  if (event.data && event.data.type === 'PREFETCH_HLS') {
    const songId = event.data.songId;
    const playlistUrl = event.data.playlistUrl;
    const segmentCount = event.data.segmentCount || HLS_SEGMENTS_TO_PREFETCH;
    
    prefetchHLSResources(songId, playlistUrl, segmentCount).then((result) => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(result);
      }
    }).catch((error) => {
      console.error('[SW] HLS prefetch error:', error);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          success: false,
          songId,
          playlistCached: false,
          segmentsCached: 0,
          totalSegments: 0,
          error: error.message
        });
      }
    });
  }
  
  // Check if HLS resources for a song are cached
  // Requirement: 5.5
  if (event.data && event.data.type === 'CHECK_HLS_CACHED') {
    const songId = event.data.songId;
    const playlistUrl = event.data.playlistUrl;
    
    checkHLSCached(songId, playlistUrl).then((result) => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(result);
      }
    }).catch((error) => {
      console.error('[SW] Check HLS cached error:', error);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          songId,
          playlistCached: false,
          segmentsCached: 0,
          totalSegments: 0,
          isFullyCached: false,
          error: error.message
        });
      }
    });
  }
  
  // Get HLS cache status
  if (event.data && event.data.type === 'GET_HLS_CACHE_STATUS') {
    getHLSCacheStatus().then((status) => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(status);
      }
    });
  }
  
  // Clear HLS cache
  if (event.data && event.data.type === 'CLEAR_HLS_CACHE') {
    clearHLSCache().then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ success: true });
      }
    });
  }
  
  // Check if specific songs are cached
  if (event.data && event.data.type === 'CHECK_AUDIO_CACHED') {
    const songIds = event.data.songIds || [];
    checkAudioCached(songIds).then((results) => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage(results);
      }
    });
  }
});

/**
 * Get audio cache status (size, item count)
 */
async function getAudioCacheStatus() {
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    const metadata = await getAudioCacheMetadata();
    
    let totalSize = 0;
    for (const key of keys) {
      const meta = metadata[key.url];
      if (meta) {
        totalSize += meta.size;
      }
    }
    
    return {
      itemCount: keys.length,
      totalSize,
      maxSize: AUDIO_CACHE_MAX_SIZE,
      maxItems: AUDIO_CACHE_MAX_ITEMS
    };
  } catch (error) {
    console.error('[SW] Error getting audio cache status:', error);
    return {
      itemCount: 0,
      totalSize: 0,
      maxSize: AUDIO_CACHE_MAX_SIZE,
      maxItems: AUDIO_CACHE_MAX_ITEMS,
      error: error.message
    };
  }
}

/**
 * Clear all audio cache
 */
async function clearAudioCache() {
  try {
    await caches.delete(AUDIO_CACHE_NAME);
    
    // Clear metadata
    const db = await openAudioMetaDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIO_META_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIO_META_STORE_NAME);
      store.clear();
      
      tx.oncomplete = () => {
        console.log('[SW] Audio cache cleared');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[SW] Error clearing audio cache:', error);
  }
}

/**
 * Prefetch audio files for background playback
 * This is called by the main app to pre-cache upcoming songs in the queue
 * Service Worker can continue fetching even when the main thread is throttled
 * 
 * @param {string[]} songIds - Array of song IDs to prefetch
 * @returns {Promise<Object>} - Results of prefetch operations
 */
async function prefetchAudioForBackground(songIds) {
  if (!songIds || songIds.length === 0) {
    return { cached: [], failed: [] };
  }
  
  console.log('[SW] Prefetching', songIds.length, 'songs for background playback');
  
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const results = { cached: [], failed: [], skipped: [] };
  
  for (const songId of songIds) {
    const url = `/api/stream/${songId}`;
    
    try {
      // Check if already cached
      const existingResponse = await cache.match(url);
      if (existingResponse) {
        console.log('[SW] Song already cached:', songId);
        results.skipped.push(songId);
        continue;
      }
      
      // Fetch and cache
      console.log('[SW] Prefetching song:', songId);
      const response = await fetch(url, { credentials: 'include' });
      
      if (response.ok) {
        // Check cache headers
        const cacheControl = response.headers.get('Cache-Control') || '';
        const shouldCache = !cacheControl.includes('no-cache') && !cacheControl.includes('no-store');
        
        if (shouldCache) {
          const responseToCache = response.clone();
          await cacheAudioResponse(cache, new Request(url), responseToCache);
          results.cached.push(songId);
          console.log('[SW] Prefetched and cached:', songId);
        } else {
          results.skipped.push(songId);
        }
      } else {
        console.warn('[SW] Prefetch failed for', songId, ':', response.status);
        results.failed.push(songId);
      }
    } catch (error) {
      console.error('[SW] Prefetch error for', songId, ':', error);
      results.failed.push(songId);
    }
  }
  
  console.log('[SW] Prefetch complete:', results);
  return results;
}

/**
 * Check if specific songs are cached
 * @param {string[]} songIds - Array of song IDs to check
 * @returns {Promise<Object>} - Map of songId to cached status
 */
async function checkAudioCached(songIds) {
  if (!songIds || songIds.length === 0) {
    return {};
  }
  
  const cache = await caches.open(AUDIO_CACHE_NAME);
  const results = {};
  
  for (const songId of songIds) {
    const url = `/api/stream/${songId}`;
    const response = await cache.match(url);
    results[songId] = !!response;
  }
  
  return results;
}
