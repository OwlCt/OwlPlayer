/**
 * Service Worker Audio Cache 工具
 * 
 * 用于与 Service Worker 通信，预缓存音频文件
 * 这对于 Android PWA 后台播放至关重要：
 * - Service Worker 可以在主线程被节流时继续工作
 * - 预缓存的音频可以在后台快速加载
 */

/**
 * 向 Service Worker 发送消息并等待响应
 */
async function sendMessageToSW<T>(message: object): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      reject(new Error('Service Worker not available'));
      return;
    }

    const messageChannel = new MessageChannel();

    // 设置超时
    const timeout = setTimeout(() => {
      reject(new Error('Service Worker message timeout'));
    }, 30000);

    messageChannel.port1.onmessageerror = () => {
      clearTimeout(timeout);
      reject(new Error('Service Worker message error'));
    };

    messageChannel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data as T);
    };

    navigator.serviceWorker.controller.postMessage(message, [messageChannel.port2]);
  });
}

async function sendCacheClearMessage(type: 'CLEAR_AUDIO_CACHE' | 'CLEAR_HLS_CACHE'): Promise<void> {
  if (!isSWAvailable()) {
    return;
  }

  try {
    await sendMessageToSW<{ success?: boolean; error?: string }>({ type });
  } catch (error) {
    console.warn(`[SWAudioCache] ${type} failed:`, error);
  }
}

function isStreamingAudioRequest(url: string): boolean {
  return url.includes('/api/stream/');
}

async function clearCacheStorageStreamingEntries(): Promise<void> {
  if (!('caches' in window)) {
    return;
  }

  const cacheNames = await caches.keys();

  await Promise.allSettled(
    cacheNames.map(async (cacheName) => {
      if (
        cacheName.startsWith('owlplayer-audio-') ||
        cacheName.startsWith('owlplayer-hls-')
      ) {
        await caches.delete(cacheName);
        return;
      }

      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      const streamingRequests = requests.filter((request) =>
        isStreamingAudioRequest(request.url),
      );

      await Promise.allSettled(
        streamingRequests.map((request) => cache.delete(request)),
      );
    }),
  );
}

function deleteIndexedDbDatabase(name: string): Promise<void> {
  if (!('indexedDB' in window)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function clearStreamingCacheMetadata(): Promise<void> {
  await Promise.allSettled([
    deleteIndexedDbDatabase('owlplayer-audio-meta'),
    deleteIndexedDbDatabase('owlplayer-hls-meta'),
  ]);
}

/**
 * 预缓存音频文件到 Service Worker 缓存
 * 
 * @param songIds - 要预缓存的歌曲 ID 列表
 * @returns 预缓存结果
 */
export async function prefetchAudioToSWCache(songIds: string[]): Promise<{
  cached: string[];
  failed: string[];
  skipped: string[];
}> {
  try {
    const result = await sendMessageToSW<{
      success: boolean;
      results?: { cached: string[]; failed: string[]; skipped: string[] };
      error?: string;
    }>({
      type: 'PREFETCH_AUDIO',
      songIds,
    });

    if (result.success && result.results) {
      return result.results;
    }

    console.warn('[SWAudioCache] Prefetch failed:', result.error);
    return { cached: [], failed: songIds, skipped: [] };
  } catch (error) {
    console.error('[SWAudioCache] Prefetch error:', error);
    return { cached: [], failed: songIds, skipped: [] };
  }
}

/**
 * 检查歌曲是否已在 Service Worker 缓存中
 * 
 * @param songIds - 要检查的歌曲 ID 列表
 * @returns 歌曲 ID 到缓存状态的映射
 */
export async function checkAudioInSWCache(songIds: string[]): Promise<Record<string, boolean>> {
  try {
    const result = await sendMessageToSW<Record<string, boolean>>({
      type: 'CHECK_AUDIO_CACHED',
      songIds,
    });

    return result;
  } catch (error) {
    console.error('[SWAudioCache] Check cache error:', error);
    return {};
  }
}

/**
 * 检查 Service Worker 是否可用
 */
export function isSWAvailable(): boolean {
  return !!(navigator.serviceWorker && navigator.serviceWorker.controller);
}

/**
 * 获取 Service Worker 音频缓存状态
 */
export async function getSWAudioCacheStatus(): Promise<{
  itemCount: number;
  totalSize: number;
  maxSize: number;
  maxItems: number;
  error?: string;
}> {
  try {
    const result = await sendMessageToSW<{
      itemCount: number;
      totalSize: number;
      maxSize: number;
      maxItems: number;
      error?: string;
    }>({
      type: 'GET_AUDIO_CACHE_STATUS',
    });

    return result;
  } catch (error) {
    console.error('[SWAudioCache] Get status error:', error);
    return {
      itemCount: 0,
      totalSize: 0,
      maxSize: 0,
      maxItems: 0,
      error: (error as Error).message,
    };
  }
}

/**
 * 清理 Service Worker 中的瞬时音频缓存
 * 包括直接音频缓存和 HLS 预缓存，避免删除离线内容后仍可从 SW 命中播放。
 */
export async function clearSWMediaCaches(): Promise<void> {
  await Promise.allSettled([
    sendCacheClearMessage('CLEAR_AUDIO_CACHE'),
    sendCacheClearMessage('CLEAR_HLS_CACHE'),
    clearCacheStorageStreamingEntries(),
    clearStreamingCacheMetadata(),
  ]);
}
