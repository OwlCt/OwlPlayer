/**
 * AudioPreloader 预加载取消属性测试
 * 
 * **Property 6: Preloader Cancellation on Song Switch**
 * *For any* sequence of rapid song switches, the AudioPreloader SHALL cancel previous preload requests
 * before starting new ones.
 * 
 * **Validates: Requirements 9.6**
 * 
 * **Feature: playback-control-refactor, Property 6: Preloader Cancellation on Song Switch**
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';

// Mock AudioSessionManager before importing audioPreloader
vi.mock('./audioSession', () => ({
  getAudioSessionManager: vi.fn(() => ({
    platform: 'desktop',
    state: 'active',
    isHlsMode: false,
    config: {
      hlsEnabled: true,
      backgroundPreloadEnabled: true,
      maxRetryAttempts: 3,
    },
    getStreamUrl: vi.fn((songId: string) => `/api/stream/${songId}`),
  })),
  getPlatformInfo: vi.fn(() => ({
    platform: 'desktop',
    isPWA: false,
    browser: 'chrome',
    supportsHLS: false,
    supportsMediaSession: true,
  })),
  isAndroidPWA: vi.fn(() => false),
}));

// Mock online status
vi.mock('../hooks/useOnlineStatus', () => ({
  getManualOfflineMode: vi.fn(() => false),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn((blob: Blob) => `blob:mock-${Math.random()}`);
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

// 生成有效的歌曲 ID
const songIdArbitrary = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-zA-Z0-9]+$/.test(s));

// 生成歌曲 ID 序列（用于快速切歌测试）
const songIdSequenceArbitrary = fc.array(songIdArbitrary, { minLength: 2, maxLength: 10 });

describe('AudioPreloader Cancellation Property Tests', () => {
  let audioPreloader: typeof import('./audioPreloader').audioPreloader;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // 重置模块以获取新的 audioPreloader 实例
    vi.resetModules();
    
    // 重新设置 mocks
    vi.doMock('./audioSession', () => ({
      getAudioSessionManager: vi.fn(() => ({
        platform: 'desktop',
        state: 'active',
        isHlsMode: false,
        config: {
          hlsEnabled: true,
          backgroundPreloadEnabled: true,
          maxRetryAttempts: 3,
        },
        getStreamUrl: vi.fn((songId: string) => `/api/stream/${songId}`),
      })),
      getPlatformInfo: vi.fn(() => ({
        platform: 'desktop',
        isPWA: false,
        browser: 'chrome',
        supportsHLS: false,
        supportsMediaSession: true,
      })),
      isAndroidPWA: vi.fn(() => false),
    }));

    vi.doMock('../hooks/useOnlineStatus', () => ({
      getManualOfflineMode: vi.fn(() => false),
    }));

    // 默认 fetch mock - 返回成功响应但延迟
    mockFetch.mockImplementation(() => 
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
          });
        }, 100);
      })
    );

    // 动态导入以获取新实例
    const module = await import('./audioPreloader');
    audioPreloader = module.audioPreloader;
    audioPreloader.clear();
  });

  afterEach(() => {
    if (audioPreloader) {
      audioPreloader.clear();
    }
  });

  /**
   * Property 6: 取消预加载应该中止 fetch 请求
   * 验证 Requirements 9.6: 快速切歌时取消预加载
   */
  it('should cancel preload when cancelPreload is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdArbitrary,
        async (songId) => {
          // 设置一个永不完成的 fetch
          let abortSignalReceived = false;
          mockFetch.mockImplementationOnce((_url: string, options?: RequestInit) => 
            new Promise((_, reject) => {
              if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                  abortSignalReceived = true;
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }
            })
          );

          // 开始预加载
          const preloadPromise = audioPreloader.preload(songId);
          
          // 立即取消
          audioPreloader.cancelPreload(songId);
          
          // 等待预加载完成（应该返回 null）
          const result = await preloadPromise;
          
          // 验证结果
          expect(result).toBeNull();
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: cancelAll 应该取消所有正在进行的预加载
   * 验证 Requirements 9.6: 取消所有预加载
   */
  it('should cancel all preloads when cancelAll is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdSequenceArbitrary,
        async (songIds) => {
          // 设置永不完成的 fetch
          mockFetch.mockImplementation((_url: string, options?: RequestInit) => 
            new Promise((_, reject) => {
              if (options?.signal) {
                options.signal.addEventListener('abort', () => {
                  reject(new DOMException('Aborted', 'AbortError'));
                });
              }
            })
          );

          // 开始多个预加载
          const promises = songIds.map(id => audioPreloader.preload(id));
          
          // 取消所有
          audioPreloader.cancelAll();
          
          // 等待所有预加载完成
          const results = await Promise.all(promises);
          
          // 所有结果应该是 null
          results.forEach(result => {
            expect(result).toBeNull();
          });
          
          // 状态应该显示没有正在加载的
          const status = audioPreloader.getStatus();
          expect(status.loading.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 6: 已缓存的歌曲不应该重新加载
   * 验证 Requirements 9.6: 缓存命中时不发起新请求
   */
  it('should return cached URL without new fetch for cached songs', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdArbitrary,
        async (songId) => {
          // 设置成功的 fetch
          mockFetch.mockImplementationOnce(() => 
            Promise.resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
            })
          );

          // 第一次预加载
          const firstResult = await audioPreloader.preload(songId);
          expect(firstResult).not.toBeNull();
          
          const fetchCallCount = mockFetch.mock.calls.length;
          
          // 第二次预加载同一首歌
          const secondResult = await audioPreloader.preload(songId);
          
          // 应该返回相同的 URL，不发起新请求
          expect(secondResult).toBe(firstResult);
          expect(mockFetch.mock.calls.length).toBe(fetchCallCount);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: 正在加载的歌曲应该返回相同的 Promise
   * 验证 Requirements 9.6: 避免重复请求
   */
  it('should return same promise for concurrent preload requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdArbitrary,
        async (songId) => {
          // 清除之前的调用记录
          mockFetch.mockClear();
          audioPreloader.clear();
          
          // 设置延迟的 fetch
          mockFetch.mockImplementationOnce(() => 
            new Promise(resolve => {
              setTimeout(() => {
                resolve({
                  ok: true,
                  blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
                });
              }, 50);
            })
          );

          // 同时发起两个预加载请求
          const promise1 = audioPreloader.preload(songId);
          const promise2 = audioPreloader.preload(songId);
          
          // 等待两个都完成
          const [result1, result2] = await Promise.all([promise1, promise2]);
          
          // 应该返回相同的结果
          expect(result1).toBe(result2);
          
          // 应该只发起一次 fetch（对于这个特定的 songId）
          const callsForThisSong = mockFetch.mock.calls.filter(
            call => String(call[0]).startsWith(`/api/stream/${songId}`)
          );
          expect(callsForThisSong.length).toBe(1);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: isCached 应该正确反映缓存状态
   * 验证 Requirements 9.6: 缓存状态查询
   */
  it('should correctly report cached status', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdArbitrary,
        async (songId) => {
          // 预加载前不应该被缓存
          expect(audioPreloader.isCached(songId)).toBe(false);
          
          // 设置成功的 fetch
          mockFetch.mockImplementationOnce(() => 
            Promise.resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
            })
          );

          // 预加载
          await audioPreloader.preload(songId);
          
          // 预加载后应该被缓存
          expect(audioPreloader.isCached(songId)).toBe(true);
          
          // 移除后不应该被缓存
          audioPreloader.remove(songId);
          expect(audioPreloader.isCached(songId)).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: isLoading 应该正确反映加载状态
   * 验证 Requirements 9.6: 加载状态查询
   */
  it('should correctly report loading status', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdArbitrary,
        async (songId) => {
          // 清除之前的状态
          audioPreloader.clear();
          mockFetch.mockClear();
          
          // 加载前不应该显示正在加载
          expect(audioPreloader.isLoading(songId)).toBe(false);
          
          // 设置成功的 fetch（立即返回）
          mockFetch.mockImplementationOnce(() => 
            Promise.resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
            })
          );

          // 开始预加载
          const preloadPromise = audioPreloader.preload(songId);
          
          // 等待预加载完成
          await preloadPromise;
          
          // 加载完成后不应该显示正在加载
          expect(audioPreloader.isLoading(songId)).toBe(false);
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 6: 缓存大小应该有限制
   * 验证 Requirements 9.6: 缓存大小限制
   */
  it('should limit cache size', async () => {
    const MAX_CACHE_SIZE = 2;
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(songIdArbitrary, { minLength: 5, maxLength: 10 })
          .filter(arr => new Set(arr).size === arr.length), // 确保 ID 唯一
        async (songIds) => {
          // 清除之前的状态
          audioPreloader.clear();
          mockFetch.mockClear();
          
          // 设置成功的 fetch
          mockFetch.mockImplementation(() => 
            Promise.resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
            })
          );

          // 依次预加载所有歌曲
          for (const songId of songIds) {
            await audioPreloader.preload(songId);
          }
          
          // 缓存大小不应该超过限制
          const status = audioPreloader.getStatus();
          expect(status.cached.length).toBeLessThanOrEqual(MAX_CACHE_SIZE);
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  }, 30000); // 增加超时时间

  /**
   * Property 6: clear 应该清空所有缓存和加载状态
   * 验证 Requirements 9.6: 清空缓存
   */
  it('should clear all cache and loading state', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdSequenceArbitrary,
        async (songIds) => {
          // 设置成功的 fetch
          mockFetch.mockImplementation(() => 
            Promise.resolve({
              ok: true,
              blob: () => Promise.resolve(new Blob(['audio data'], { type: 'audio/mp4' })),
            })
          );

          // 预加载一些歌曲
          for (const songId of songIds.slice(0, 2)) {
            await audioPreloader.preload(songId);
          }
          
          // 清空
          audioPreloader.clear();
          
          // 状态应该为空
          const status = audioPreloader.getStatus();
          expect(status.cached.length).toBe(0);
          expect(status.loading.length).toBe(0);
          
          return true;
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 6: getStatus 应该返回正确的状态信息
   * 验证 Requirements 9.6: 状态查询
   */
  it('should return correct status information', async () => {
    await fc.assert(
      fc.asyncProperty(
        songIdArbitrary,
        async (songId) => {
          const status = audioPreloader.getStatus();
          
          // 状态应该包含必要的字段
          expect(Array.isArray(status.cached)).toBe(true);
          expect(Array.isArray(status.loading)).toBe(true);
          expect(typeof status.platform).toBe('string');
          expect(typeof status.preloadEnabled).toBe('boolean');
          
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});
