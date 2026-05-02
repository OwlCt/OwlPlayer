/**
 * iOS PWA Audio Session Keep-Alive Utility
 * 
 * 向后兼容的包装器，内部使用 AudioSessionManager。
 * 保留原有的导出接口，但实际功能由 AudioSessionManager 提供。
 * 
 * @deprecated 请直接使用 AudioSessionManager
 */

import { getAudioSessionManager, getPlatformInfo, isIOSPWA as checkIsIOSPWA } from './audioSession';
import { iOSAudioSession } from './audioSession/ios';

/**
 * 检测是否是 iOS 设备（包括 PWA 和 Safari）
 * @deprecated 使用 getPlatformInfo().platform === 'ios'
 */
export function isIOS(): boolean {
  return getPlatformInfo().platform === 'ios';
}

/**
 * 检测是否是 iOS PWA
 * @deprecated 使用 isIOSPWA() from './audioSession'
 */
export function isIOSPWAMode(): boolean {
  return checkIsIOSPWA();
}

/**
 * 清除 iOS PWA 的音频相关缓存
 * 在 PWA 被杀后台恢复时调用，确保音频能正常播放
 */
export async function clearAudioCache(): Promise<void> {
  if (!isIOSPWAMode()) return;
  
  console.log('[AudioSession] Clearing audio cache for iOS PWA...');
  
  try {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        
        for (const request of requests) {
          // 只清除音频相关的缓存（stream 和 m3u8）
          if (request.url.includes('/api/stream/') || 
              request.url.includes('.m3u8') || 
              request.url.includes('.ts')) {
            await cache.delete(request);
            console.log('[AudioSession] Deleted cache:', request.url.slice(-50));
          }
        }
      }
    }
    
    console.log('[AudioSession] Audio cache cleared');
  } catch (e) {
    console.warn('[AudioSession] Failed to clear audio cache:', e);
  }
}

// 上次页面隐藏的时间戳
let lastHiddenTimestamp = 0;

// 判断是否被杀后台的阈值（毫秒）
const BACKGROUND_KILL_THRESHOLD = 30000; // 30 秒

/**
 * 记录页面隐藏时间
 */
export function recordPageHidden(): void {
  lastHiddenTimestamp = Date.now();
  console.log('[AudioSession] Page hidden at:', lastHiddenTimestamp);
}

/**
 * 检查是否可能被杀后台了
 */
export function mayHaveBeenKilled(): boolean {
  if (lastHiddenTimestamp === 0) return false;
  const hiddenDuration = Date.now() - lastHiddenTimestamp;
  const maybeKilled = hiddenDuration > BACKGROUND_KILL_THRESHOLD;
  console.log('[AudioSession] Hidden duration:', hiddenDuration, 'ms, maybeKilled:', maybeKilled);
  return maybeKilled;
}

/**
 * 标记 AudioContext 可能已失效
 * 在页面从后台恢复时调用
 */
export function markAudioContextMayBeInvalid(): void {
  // AudioSessionManager 内部处理这个逻辑
  console.log('[AudioSession] Marked AudioContext as potentially invalid');
}

/**
 * 唤醒音频上下文 - 必须在用户手势中调用
 * @deprecated 使用 AudioSessionManager.resumePlayback()
 */
export async function wakeUpAudioSession(): Promise<boolean> {
  const manager = getAudioSessionManager();
  if (manager.platform !== 'ios') return true;
  
  // iOS 实现有 wakeUpAudioContext 方法
  try {
    await manager.initialize();
    return true;
  } catch (e) {
    console.warn('[AudioSession] Failed to wake up audio session:', e);
    return false;
  }
}

/**
 * 在用户交互时初始化音频会话
 * @deprecated 使用 AudioSessionManager.initialize()
 */
export async function initAudioSessionOnUserGesture(): Promise<void> {
  if (!isIOS()) return;
  
  console.log('[AudioSession] Initializing on user gesture...');
  await wakeUpAudioSession();
}

/**
 * 初始化 iOS 音频会话保活
 * 在应用启动时调用一次
 */
export function initIOSAudioSession(): void {
  if (!isIOS()) return;
  
  console.log('[AudioSession] Initializing iOS audio session handler via AudioSessionManager');
  
  // 获取 AudioSessionManager 实例会自动初始化
  const manager = getAudioSessionManager();
  manager.initialize().catch((e) => {
    console.warn('[AudioSession] Failed to initialize:', e);
  });
}

/**
 * 检查音频会话是否处于活跃状态
 */
export function isAudioSessionActive(): boolean {
  const manager = getAudioSessionManager();
  if (manager.platform === 'ios') {
    return (manager as iOSAudioSession).isAudioSessionActive();
  }
  return manager.state === 'active';
}

/**
 * 获取音频会话状态（用于调试）
 */
export function getAudioSessionState(): string {
  const manager = getAudioSessionManager();
  if (manager.platform === 'ios') {
    return (manager as iOSAudioSession).getAudioSessionState();
  }
  return manager.state;
}

// ==================== 以下函数保留但标记为废弃 ====================

/**
 * 获取或创建全局 AudioContext
 * @deprecated 由 AudioSessionManager 内部管理
 */
export function getAudioContext(): AudioContext | null {
  console.warn('[AudioSession] getAudioContext() is deprecated, use AudioSessionManager instead');
  return null;
}

/**
 * 强制重新创建 AudioContext
 * @deprecated 由 AudioSessionManager 内部管理
 */
export function recreateAudioContext(): AudioContext | null {
  const manager = getAudioSessionManager();
  if (manager.platform === 'ios') {
    return (manager as iOSAudioSession).recreateAudioContext();
  }
  return null;
}

/**
 * 设置页面可见性监听器
 * @deprecated 由 AudioSessionManager 内部管理
 */
export function setupVisibilityListener(_onResume?: () => void): () => void {
  console.warn('[AudioSession] setupVisibilityListener() is deprecated, AudioSessionManager handles this internally');
  return () => {};
}
