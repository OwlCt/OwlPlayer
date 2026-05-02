/**
 * iOS/Android PWA Detection Utility
 * 
 * Provides functions to detect if the app is running as a PWA on iOS/Android devices.
 * Used to determine when to enable HLS playback mode for reliable audio playback.
 * 
 * Note: This module uses direct detection logic for backward compatibility.
 * For new code, consider using AudioSessionManager's detection functions.
 */

/**
 * Checks if the current device is an iOS device (iPhone, iPad, iPod)
 * @returns true if the device is running iOS
 */
export function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  
  const userAgent = navigator.userAgent;
  
  // Check for iOS devices: iPhone, iPad, iPod
  // Also check for iPad on iOS 13+ which reports as Mac
  const isIOS = /iPhone|iPad|iPod/.test(userAgent);
  const isIPadOS13Plus = /Macintosh/.test(userAgent) && 
    typeof document !== 'undefined' && 'ontouchend' in document;
  
  return isIOS || isIPadOS13Plus;
}

/**
 * Checks if the current device is an Android device
 * @returns true if the device is running Android
 */
export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  
  return /Android/i.test(navigator.userAgent);
}

/**
 * Checks if the app is running in standalone mode (PWA)
 * @returns true if running as a PWA (added to home screen)
 */
export function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  // Check navigator.standalone (iOS Safari specific)
  const navigatorStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  
  // Check display-mode media query (standard PWA detection)
  // Safely handle test environments where matchMedia may not exist
  let displayModeStandalone = false;
  try {
    if (typeof window.matchMedia === 'function') {
      displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    }
  } catch {
    // Ignore errors in test environments
  }
  
  return navigatorStandalone || displayModeStandalone;
}

/**
 * Checks if the app is running as a PWA on iOS
 * This is the main function to determine if HLS mode should be enabled
 * @returns true if running as iOS PWA (iOS device + standalone mode)
 */
export function isIOSPWA(): boolean {
  return isIOSDevice() && isStandaloneMode();
}

/**
 * Checks if the app is running as a PWA on Android
 * @returns true if running as Android PWA (Android device + standalone mode)
 */
export function isAndroidPWA(): boolean {
  return isAndroidDevice() && isStandaloneMode();
}

/**
 * Checks if the app is running as a mobile PWA (iOS or Android)
 * @returns true if running as mobile PWA
 */
export function isMobilePWA(): boolean {
  return isStandaloneMode() && (isIOSDevice() || isAndroidDevice());
}
