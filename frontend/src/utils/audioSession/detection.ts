/**
 * 平台检测模块
 * 检测运行环境：iOS/Android/Desktop、PWA模式、浏览器类型
 */

import type { Platform } from './types';

/** 浏览器类型 */
export type BrowserType = 'safari' | 'chrome' | 'firefox' | 'other';

/** 平台信息 */
export interface PlatformInfo {
  /** 平台类型 */
  platform: Platform;
  /** 是否为 PWA 模式 */
  isPWA: boolean;
  /** 浏览器类型 */
  browser: BrowserType;
  /** 是否支持原生 HLS */
  supportsHLS: boolean;
  /** 是否支持 Media Session API */
  supportsMediaSession: boolean;
}

/** 缓存的平台信息 */
let cachedPlatformInfo: PlatformInfo | null = null;

/**
 * 检测当前平台信息
 * @returns 平台信息对象
 */
export function detectPlatform(): PlatformInfo {
  // 返回缓存结果
  if (cachedPlatformInfo) {
    return cachedPlatformInfo;
  }

  const ua = navigator.userAgent;

  // 检测 iOS (包括 iPad 伪装成 Mac 的情况)
  // iPad 伪装成 Mac 时，UA 包含 Macintosh 但有触摸支持且 maxTouchPoints > 0
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && 'ontouchend' in document && navigator.maxTouchPoints > 0);

  // 检测 Android
  const isAndroid = /Android/i.test(ua);

  // 检测 PWA 模式 (安全处理测试环境)
  let isPWA = false;
  try {
    isPWA =
      (typeof window !== 'undefined' && 
       typeof window.matchMedia === 'function' &&
       window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    // 测试环境或不支持 matchMedia 的环境
    isPWA = false;
  }

  // 检测浏览器类型
  let browser: BrowserType = 'other';
  if (/Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua)) {
    browser = 'safari';
  } else if (/Chrome/.test(ua) || /CriOS/.test(ua)) {
    browser = 'chrome';
  } else if (/Firefox/.test(ua) || /FxiOS/.test(ua)) {
    browser = 'firefox';
  }

  // 确定平台
  let platform: Platform;
  if (isIOS) {
    platform = 'ios';
  } else if (isAndroid) {
    platform = 'android';
  } else {
    platform = 'desktop';
  }

  cachedPlatformInfo = {
    platform,
    isPWA,
    browser,
    supportsHLS: isIOS, // iOS 原生支持 HLS
    supportsMediaSession: 'mediaSession' in navigator,
  };

  return cachedPlatformInfo;
}

/**
 * 检测是否为 iOS PWA
 */
export function isIOSPWA(): boolean {
  const info = detectPlatform();
  return info.platform === 'ios' && info.isPWA;
}

/**
 * 检测是否为 Android PWA
 */
export function isAndroidPWA(): boolean {
  const info = detectPlatform();
  return info.platform === 'android' && info.isPWA;
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  const info = detectPlatform();
  return info.platform === 'ios' || info.platform === 'android';
}

/**
 * 清除缓存的平台信息 (用于测试)
 */
export function clearPlatformCache(): void {
  cachedPlatformInfo = null;
}
