/**
 * Audio Cache Manager - 音频缓存管理器
 * 
 * 提供音频缓存的大小限制和 LRU 清理逻辑
 * 这个模块可以在主线程中使用，也可以被 Service Worker 引用
 * 
 * Requirements: 5.3, 5.6, 9.2
 */

export interface AudioCacheEntry {
  url: string;
  size: number;
  timestamp: number;
}

export interface AudioCacheConfig {
  maxSize: number;      // 最大缓存大小（字节）
  maxItems: number;     // 最大缓存条目数
}

export const DEFAULT_AUDIO_CACHE_CONFIG: AudioCacheConfig = {
  maxSize: 500 * 1024 * 1024,  // 500MB
  maxItems: 50,
};

/**
 * 计算需要清理的条目以满足缓存限制
 * 使用 LRU (Least Recently Used) 策略
 * 
 * @param entries 当前缓存条目列表
 * @param newItemSize 新条目的大小
 * @param config 缓存配置
 * @returns 需要删除的条目 URL 列表
 */
export function calculateEvictions(
  entries: AudioCacheEntry[],
  newItemSize: number,
  config: AudioCacheConfig = DEFAULT_AUDIO_CACHE_CONFIG
): string[] {
  const { maxSize, maxItems } = config;
  
  // 计算当前总大小
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  
  // 检查是否需要清理
  const needsEviction = 
    entries.length >= maxItems || 
    (totalSize + newItemSize) > maxSize;
  
  if (!needsEviction) {
    return [];
  }
  
  // 按时间戳排序（最旧的在前）
  const sortedEntries = [...entries].sort((a, b) => a.timestamp - b.timestamp);
  
  const evictions: string[] = [];
  let evictedSize = 0;
  let evictedCount = 0;
  
  // 清理直到满足限制
  while (
    evictedCount < sortedEntries.length &&
    (
      (entries.length - evictedCount >= maxItems) ||
      ((totalSize - evictedSize + newItemSize) > maxSize)
    )
  ) {
    const entry = sortedEntries[evictedCount];
    evictions.push(entry.url);
    evictedSize += entry.size;
    evictedCount++;
  }
  
  return evictions;
}

/**
 * 验证缓存状态是否满足限制
 * 
 * @param entries 当前缓存条目列表
 * @param config 缓存配置
 * @returns 是否满足限制
 */
export function validateCacheState(
  entries: AudioCacheEntry[],
  config: AudioCacheConfig = DEFAULT_AUDIO_CACHE_CONFIG
): { valid: boolean; totalSize: number; itemCount: number; reason?: string } {
  const { maxSize, maxItems } = config;
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  const itemCount = entries.length;
  
  if (itemCount > maxItems) {
    return {
      valid: false,
      totalSize,
      itemCount,
      reason: `Item count ${itemCount} exceeds max ${maxItems}`,
    };
  }
  
  if (totalSize > maxSize) {
    return {
      valid: false,
      totalSize,
      itemCount,
      reason: `Total size ${totalSize} exceeds max ${maxSize}`,
    };
  }
  
  return { valid: true, totalSize, itemCount };
}

/**
 * 模拟添加条目到缓存并执行清理
 * 用于测试缓存管理逻辑
 * 
 * @param entries 当前缓存条目列表
 * @param newEntry 新条目
 * @param config 缓存配置
 * @returns 更新后的缓存条目列表
 */
export function addEntryWithEviction(
  entries: AudioCacheEntry[],
  newEntry: AudioCacheEntry,
  config: AudioCacheConfig = DEFAULT_AUDIO_CACHE_CONFIG
): AudioCacheEntry[] {
  // 计算需要清理的条目
  const evictions = calculateEvictions(entries, newEntry.size, config);
  
  // 过滤掉需要清理的条目
  const remainingEntries = entries.filter(e => !evictions.includes(e.url));
  
  // 添加新条目
  return [...remainingEntries, newEntry];
}

/**
 * 检查 URL 是否应该被缓存
 * 
 * @param url 请求 URL
 * @returns 是否应该缓存
 */
export function shouldCacheAudioUrl(url: string): boolean {
  // HLS 播放列表不缓存
  if (url.endsWith('.m3u8') || url.includes('playlist.m3u8')) {
    return false;
  }
  
  // 音频流应该缓存
  if (url.includes('/api/stream/')) {
    return true;
  }
  
  // HLS 切片应该缓存
  if (url.endsWith('.ts')) {
    return true;
  }
  
  return false;
}
