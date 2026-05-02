/**
 * Audio Cache Manager 缓存大小限制属性测试
 * 
 * **Property 7: Cache Size Limit Enforcement**
 * *For any* audio cache state, the total size SHALL NOT exceed AUDIO_CACHE_MAX_SIZE,
 * and old entries SHALL be evicted when the limit is reached.
 * 
 * **Validates: Requirements 5.3, 5.6, 9.2**
 * 
 * **Feature: playback-control-refactor, Property 7: Cache Size Limit Enforcement**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  AudioCacheEntry,
  AudioCacheConfig,
  calculateEvictions,
  validateCacheState,
  addEntryWithEviction,
  shouldCacheAudioUrl,
  DEFAULT_AUDIO_CACHE_CONFIG,
} from './audioCacheManager';

// 生成有效的缓存条目
const cacheEntryArbitrary = fc.record({
  url: fc.string({ minLength: 1, maxLength: 100 })
    .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s))
    .map(s => `/api/stream/${s}`),
  size: fc.integer({ min: 1000, max: 50 * 1024 * 1024 }), // 1KB to 50MB
  timestamp: fc.integer({ min: 0, max: Date.now() }),
});

// 生成缓存条目列表（确保 URL 唯一）
const cacheEntriesArbitrary = fc.array(cacheEntryArbitrary, { minLength: 0, maxLength: 100 })
  .map(entries => {
    // 确保 URL 唯一
    const seen = new Set<string>();
    return entries.filter(e => {
      if (seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });
  });

// 生成缓存配置
const cacheConfigArbitrary = fc.record({
  maxSize: fc.integer({ min: 10 * 1024 * 1024, max: 1000 * 1024 * 1024 }), // 10MB to 1GB
  maxItems: fc.integer({ min: 5, max: 200 }),
});

describe('Audio Cache Manager Property Tests', () => {
  /**
   * Property 7: 缓存大小不超过最大限制
   * 验证 Requirements 5.3: 缓存大小限制
   * 注意：当新条目大小超过最大限制时，这是一个边界情况
   */
  it('should never exceed max cache size after eviction when new entry fits', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary,
        cacheEntryArbitrary,
        cacheConfigArbitrary,
        (entries, newEntry, config) => {
          // 确保新条目大小不超过最大限制（否则无法满足约束）
          if (newEntry.size > config.maxSize) {
            return true; // 跳过这种边界情况
          }
          
          // 添加新条目并执行清理
          const result = addEntryWithEviction(entries, newEntry, config);
          
          // 验证结果
          const validation = validateCacheState(result, config);
          
          // 总大小不应超过最大限制
          expect(validation.totalSize).toBeLessThanOrEqual(config.maxSize);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 缓存条目数不超过最大限制
   * 验证 Requirements 5.3: 缓存条目数限制
   */
  it('should never exceed max item count after eviction', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary,
        cacheEntryArbitrary,
        cacheConfigArbitrary,
        (entries, newEntry, config) => {
          // 添加新条目并执行清理
          const result = addEntryWithEviction(entries, newEntry, config);
          
          // 验证结果
          const validation = validateCacheState(result, config);
          
          // 条目数不应超过最大限制
          expect(validation.itemCount).toBeLessThanOrEqual(config.maxItems);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: LRU 清理策略 - 最旧的条目先被清理
   * 验证 Requirements 5.6: LRU 缓存清理
   */
  it('should evict oldest entries first (LRU)', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary.filter(e => e.length >= 3),
        cacheEntryArbitrary,
        (entries, newEntry) => {
          // 使用较小的配置强制清理
          const config: AudioCacheConfig = {
            maxSize: entries.reduce((sum, e) => sum + e.size, 0) + newEntry.size - 1000,
            maxItems: entries.length,
          };
          
          // 计算需要清理的条目
          const evictions = calculateEvictions(entries, newEntry.size, config);
          
          if (evictions.length === 0) {
            return true; // 不需要清理
          }
          
          // 获取被清理条目的时间戳
          const evictedTimestamps = entries
            .filter(e => evictions.includes(e.url))
            .map(e => e.timestamp);
          
          // 获取保留条目的时间戳
          const remainingTimestamps = entries
            .filter(e => !evictions.includes(e.url))
            .map(e => e.timestamp);
          
          // 被清理的条目应该比保留的条目更旧（时间戳更小）
          if (evictedTimestamps.length > 0 && remainingTimestamps.length > 0) {
            const maxEvictedTimestamp = Math.max(...evictedTimestamps);
            const minRemainingTimestamp = Math.min(...remainingTimestamps);
            
            // 最新被清理的条目应该不比最旧保留的条目更新
            expect(maxEvictedTimestamp).toBeLessThanOrEqual(minRemainingTimestamp);
          }
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 新条目总是被添加
   * 验证 Requirements 5.2: 缓存音频响应
   */
  it('should always include new entry after eviction', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary,
        cacheEntryArbitrary,
        cacheConfigArbitrary,
        (entries, newEntry, config) => {
          // 确保新条目大小不超过最大限制
          const adjustedNewEntry = {
            ...newEntry,
            size: Math.min(newEntry.size, config.maxSize - 1000),
          };
          
          // 添加新条目并执行清理
          const result = addEntryWithEviction(entries, adjustedNewEntry, config);
          
          // 新条目应该在结果中
          const hasNewEntry = result.some(e => e.url === adjustedNewEntry.url);
          expect(hasNewEntry).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 空缓存不需要清理
   * 验证 Requirements 5.3: 边界条件
   */
  it('should not evict anything from empty cache', () => {
    fc.assert(
      fc.property(
        cacheEntryArbitrary,
        cacheConfigArbitrary,
        (newEntry, config) => {
          const entries: AudioCacheEntry[] = [];
          
          // 计算需要清理的条目
          const evictions = calculateEvictions(entries, newEntry.size, config);
          
          // 空缓存不应该有任何清理
          expect(evictions.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 缓存未满时不需要清理
   * 验证 Requirements 5.3: 只在需要时清理
   */
  it('should not evict when cache is under limits', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary,
        cacheEntryArbitrary,
        (entries, newEntry) => {
          // 使用足够大的配置
          const totalSize = entries.reduce((sum, e) => sum + e.size, 0) + newEntry.size;
          const config: AudioCacheConfig = {
            maxSize: totalSize * 2, // 两倍大小
            maxItems: entries.length + 10, // 足够多的条目
          };
          
          // 计算需要清理的条目
          const evictions = calculateEvictions(entries, newEntry.size, config);
          
          // 缓存未满时不应该清理
          expect(evictions.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: validateCacheState 正确验证缓存状态
   * 验证 Requirements 5.3: 状态验证
   */
  it('should correctly validate cache state', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary,
        cacheConfigArbitrary,
        (entries, config) => {
          const validation = validateCacheState(entries, config);
          const totalSize = entries.reduce((sum, e) => sum + e.size, 0);
          
          // 验证返回的大小和数量正确
          expect(validation.totalSize).toBe(totalSize);
          expect(validation.itemCount).toBe(entries.length);
          
          // 验证 valid 标志正确
          const shouldBeValid = 
            entries.length <= config.maxItems && 
            totalSize <= config.maxSize;
          
          expect(validation.valid).toBe(shouldBeValid);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: shouldCacheAudioUrl 正确判断 URL
   * 验证 Requirements 2.6: 遵守缓存头
   */
  it('should correctly determine cacheable URLs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z0-9]+$/.test(s)),
        (songId) => {
          // 直接流应该缓存
          expect(shouldCacheAudioUrl(`/api/stream/${songId}`)).toBe(true);
          
          // HLS 播放列表不应该缓存
          expect(shouldCacheAudioUrl(`/api/stream/${songId}/playlist.m3u8`)).toBe(false);
          expect(shouldCacheAudioUrl(`/api/stream/${songId}.m3u8`)).toBe(false);
          
          // HLS 切片应该缓存
          expect(shouldCacheAudioUrl(`/api/stream/${songId}/segment0.ts`)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: 使用默认配置时缓存限制正确
   * 验证 Requirements 5.3, 9.2: 默认配置
   */
  it('should use correct default configuration', () => {
    expect(DEFAULT_AUDIO_CACHE_CONFIG.maxSize).toBe(500 * 1024 * 1024); // 500MB
    expect(DEFAULT_AUDIO_CACHE_CONFIG.maxItems).toBe(50);
  });

  /**
   * Property 7: 清理后缓存状态有效
   * 验证 Requirements 5.3, 5.6: 清理后状态
   * 注意：当新条目大小超过最大限制时，这是一个边界情况
   */
  it('should have valid cache state after eviction when new entry fits', () => {
    fc.assert(
      fc.property(
        cacheEntriesArbitrary,
        cacheEntryArbitrary,
        cacheConfigArbitrary,
        (entries, newEntry, config) => {
          // 确保新条目大小不超过最大限制（否则无法满足约束）
          if (newEntry.size > config.maxSize) {
            return true; // 跳过这种边界情况
          }
          
          // 添加新条目并执行清理
          const result = addEntryWithEviction(entries, newEntry, config);
          
          // 验证结果状态
          const validation = validateCacheState(result, config);
          
          // 清理后状态应该有效
          expect(validation.valid).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
