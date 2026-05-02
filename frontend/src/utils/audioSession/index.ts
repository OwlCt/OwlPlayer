/**
 * AudioSessionManager 工厂模块
 * 根据平台返回正确的实现，实现单例模式
 * 导出所有类型和工具函数
 */

import {
  clearPlatformCache,
  detectPlatform,
  type PlatformInfo,
} from "./detection";
import { iOSAudioSession } from "./ios";
import { AndroidAudioSession } from "./android";
import { DesktopAudioSession } from "./desktop";
import type { IAudioSessionManager, AudioSessionConfig } from "./types";
import { defaultAudioSessionConfig } from "./types";

/** 单例实例 */
let instance: IAudioSessionManager | null = null;

const HLS_PREFERENCE_KEY = "owl-hls-playback-enabled";

function loadStoredHlsPreference(platformInfo: PlatformInfo): boolean {
  void platformInfo;
  return true;
}

/**
 * 获取 AudioSessionManager 实例（单例模式）
 * 根据当前平台自动选择正确的实现
 *
 * @param config 可选的配置覆盖
 * @returns AudioSessionManager 实例
 */
export function getAudioSessionManager(
  config?: Partial<AudioSessionConfig>,
): IAudioSessionManager {
  // 如果已有实例，直接返回
  if (instance) {
    return instance;
  }

  // 检测平台
  const platformInfo = detectPlatform();

  // 合并配置
  const mergedConfig: AudioSessionConfig = {
    ...defaultAudioSessionConfig,
    hlsEnabled: loadStoredHlsPreference(platformInfo),
    ...config,
  };

  console.log(
    "[AudioSessionManager] Creating instance for platform:",
    platformInfo.platform,
  );
  console.log("[AudioSessionManager] PWA mode:", platformInfo.isPWA);
  console.log("[AudioSessionManager] Browser:", platformInfo.browser);

  // 根据平台创建对应的实现
  switch (platformInfo.platform) {
    case "ios":
      instance = new iOSAudioSession(mergedConfig);
      break;
    case "android":
      instance = new AndroidAudioSession(mergedConfig);
      break;
    default:
      instance = new DesktopAudioSession(mergedConfig);
  }

  return instance;
}

/**
 * 获取当前平台信息
 * 如果 AudioSessionManager 已初始化，返回缓存的信息
 * 否则执行新的检测
 */
export function getPlatformInfo(): PlatformInfo {
  return detectPlatform();
}

/**
 * 检查 AudioSessionManager 是否已初始化
 */
export function isAudioSessionManagerInitialized(): boolean {
  return instance !== null;
}

/**
 * 重置 AudioSessionManager 实例（主要用于测试）
 * 会清理现有实例并允许创建新实例
 */
export function resetAudioSessionManager(): void {
  if (instance) {
    instance.cleanup();
    instance = null;
  }
  clearPlatformCache();
}

export function getHlsPlaybackPreference(): boolean {
  return loadStoredHlsPreference(getPlatformInfo());
}

export function setHlsPlaybackPreference(enabled: boolean): void {
  try {
    localStorage.setItem(HLS_PREFERENCE_KEY, String(Boolean(enabled)));
  } catch {
    // Ignore storage failures.
  }
}

/**
 * 获取当前实例（如果存在）
 * 不会创建新实例，如果不存在返回 null
 */
export function getAudioSessionManagerIfExists(): IAudioSessionManager | null {
  return instance;
}

// ==================== 导出类型和工具函数 ====================

// 导出类型
export type {
  Platform,
  AudioSessionState,
  AudioSessionEvents,
  AudioSessionConfig,
  IAudioSessionManager,
} from "./types";

export { defaultAudioSessionConfig } from "./types";

// 导出平台检测工具
export {
  clearPlatformCache,
  detectPlatform,
  isIOSPWA,
  isAndroidPWA,
  isMobileDevice,
  type PlatformInfo,
  type BrowserType,
} from "./detection";

// 导出具体实现类（用于测试或特殊场景）
export { iOSAudioSession } from "./ios";
export { AndroidAudioSession } from "./android";
export { DesktopAudioSession } from "./desktop";
