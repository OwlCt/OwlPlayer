/**
 * Web Push 通知工具函数
 * 处理浏览器兼容性检测、权限管理和推送订阅
 */

// Web Push 支持状态
export interface WebPushSupport {
  isSupported: boolean;
  isIOS: boolean;
  isIOSSafari: boolean;
  isIOSPWA: boolean;
  iOSVersion: IOSVersionInfo | null;
  needsHomeScreen: boolean;
  reason?: string;
}

interface IOSVersionInfo {
  major: number;
  minor: number;
  patch: number;
}

// 检测 iOS 版本
function getIOSVersion(): IOSVersionInfo | null {
  const ua = navigator.userAgent;
  const osMatch = ua.match(/OS (\d+)_([\d_]+)/);

  if (osMatch) {
    const [major, minor = '0', patch = '0'] = osMatch.slice(1).flatMap((part) => part.split('_'));

    return {
      major: parseInt(major, 10),
      minor: parseInt(minor, 10),
      patch: parseInt(patch, 10),
    };
  }

  // iPadOS 桌面 UA 使用 Version/xx.x 形式，需单独解析
  const versionMatch = ua.match(/Version\/(\d+)\.(\d+)/);
  if (versionMatch) {
    return {
      major: parseInt(versionMatch[1], 10),
      minor: parseInt(versionMatch[2], 10),
      patch: 0,
    };
  }

  return null;
}

// 判断 iOS 版本是否达到要求
function isIOSVersionAtLeast(version: IOSVersionInfo | null, targetMajor: number, targetMinor = 0): boolean {
  if (!version) return false;
  if (version.major > targetMajor) return true;
  if (version.major < targetMajor) return false;
  return version.minor >= targetMinor;
}

// 检测是否为 iOS 设备
function isIOSDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// 检测是否为 iOS Safari
function isIOSSafari(): boolean {
  const ua = navigator.userAgent;
  return isIOSDevice() && /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
}

// 检测是否为 PWA 模式（添加到主屏幕）
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * 检测 Web Push 支持状态
 */
export function checkWebPushSupport(): WebPushSupport {
  const isIOS = isIOSDevice();
  const iosSafari = isIOSSafari();
  const iosPWA = isIOS && isStandalone();
  const iOSVersion = isIOS ? getIOSVersion() : null;
  const isSecure = window.isSecureContext || location.hostname === 'localhost';

  // 基本 API 支持检测
  const hasNotificationAPI = 'Notification' in window;
  const hasServiceWorker = 'serviceWorker' in navigator;
  const hasPushManager =
    'PushManager' in window ||
    (typeof ServiceWorkerRegistration !== 'undefined' && 'pushManager' in ServiceWorkerRegistration.prototype);

  // iOS Safari < 16.4 不支持 Web Push
  if (isIOS && !isIOSVersionAtLeast(iOSVersion, 16, 4)) {
    return {
      isSupported: false,
      isIOS,
      isIOSSafari: iosSafari,
      isIOSPWA: iosPWA,
      iOSVersion,
      needsHomeScreen: false,
      reason: 'iOS 版本过低，需要 iOS 16.4 或更高版本',
    };
  }

  // iOS Safari 16.4+ 需要添加到主屏幕才能使用 Web Push
  if (isIOS && !iosPWA) {
    return {
      isSupported: false,
      isIOS,
      isIOSSafari: iosSafari,
      isIOSPWA: iosPWA,
      iOSVersion,
      needsHomeScreen: true,
      reason: '需要通过 Safari 添加到主屏幕才能接收通知',
    };
  }

  // iOS 及其他平台都需要安全上下文（HTTPS 或 localhost）
  if (!isSecure) {
    return {
      isSupported: false,
      isIOS,
      isIOSSafari: iosSafari,
      isIOSPWA: iosPWA,
      iOSVersion,
      needsHomeScreen: false,
      reason: '需要使用 HTTPS 域名（或 localhost）访问，才能开启推送通知',
    };
  }

  // Service Worker 不可用（通常是未在 HTTPS 或浏览器禁用）
  if (!hasServiceWorker) {
    return {
      isSupported: false,
      isIOS,
      isIOSSafari: iosSafari,
      isIOSPWA: iosPWA,
      iOSVersion,
      needsHomeScreen: false,
      reason: '浏览器未启用 Service Worker，无法注册推送',
    };
  }

  // Push API 不可用
  if (!hasPushManager) {
    return {
      isSupported: false,
      isIOS,
      isIOSSafari: iosSafari,
      isIOSPWA: iosPWA,
      iOSVersion,
      needsHomeScreen: false,
      reason: '浏览器未暴露 Push API（请使用 iOS 16.4+ 的 Safari 并添加到主屏幕）',
    };
  }

  // 检查基本 API 支持
  if (!hasNotificationAPI) {
    return {
      isSupported: false,
      isIOS,
      isIOSSafari: iosSafari,
      isIOSPWA: iosPWA,
      iOSVersion,
      needsHomeScreen: false,
      reason: '您的浏览器不支持通知 API',
    };
  }

  return {
    isSupported: true,
    isIOS,
    isIOSSafari: iosSafari,
    isIOSPWA: iosPWA,
    iOSVersion,
    needsHomeScreen: false,
  };
}

/**
 * 获取当前通知权限状态
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * 请求通知权限
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('浏览器不支持通知');
  }

  const permission = await Notification.requestPermission();
  return permission;
}

/**
 * 检查是否应该显示推送提醒
 * 条件：支持 Web Push、未开启通知、未被用户拒绝、未在本次会话中提醒过
 */
export function shouldShowPushReminder(): boolean {
  // 暂时禁用首次进入时的通知提示
  return false;

  /* 原有逻辑暂时注释
  const support = checkWebPushSupport();
  
  // 不支持则不提醒
  if (!support.isSupported) {
    return false;
  }

  const permission = getNotificationPermission();
  
  // 已授权或已拒绝则不提醒
  if (permission === 'granted' || permission === 'denied') {
    return false;
  }

  // 检查本次会话是否已提醒过
  const reminded = sessionStorage.getItem('push-reminder-shown');
  if (reminded === 'true') {
    return false;
  }

  // 检查用户是否选择了"不再提醒"
  const dismissed = localStorage.getItem('push-reminder-dismissed');
  if (dismissed === 'true') {
    return false;
  }

  return true;
  */
}

/**
 * 标记已显示推送提醒（本次会话）
 */
export function markPushReminderShown(): void {
  sessionStorage.setItem('push-reminder-shown', 'true');
}

/**
 * 标记用户选择不再提醒
 */
export function dismissPushReminder(): void {
  localStorage.setItem('push-reminder-dismissed', 'true');
}

/**
 * 重置推送提醒状态（用于测试或用户主动开启）
 */
export function resetPushReminderState(): void {
  sessionStorage.removeItem('push-reminder-shown');
  localStorage.removeItem('push-reminder-dismissed');
}
