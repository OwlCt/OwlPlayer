/**
 * useMediaSession Hook
 * Integrates the player with the browser's Media Session API
 * Enables OS-level media controls (keyboard media keys, system notifications, lock screen)
 * 
 * Uses AudioSessionManager for platform detection instead of inline checks.
 */

import { useEffect, useCallback, useRef } from 'react';
import { Song } from '../types';
import {
  createMediaMetadataWithOfflineSupport,
  setMediaSessionMetadataSync,
  createPositionState,
  calculateSeekPosition,
  getPlaybackState,
  safeSetActionHandler,
  isMediaSessionSupported,
  DEFAULT_SEEK_OFFSET,
} from '../utils/mediaSession';
import { getPlatformInfo } from '../utils/audioSession';

/**
 * Check if we should skip seek handlers on iOS to show next/previous track buttons
 * Set to false to keep default iOS behavior (seek buttons)
 * Set to true to show next/previous track buttons instead
 * 
 * NOTE: Setting this to true may cause issues on some iOS versions
 * where the system expects seek handlers to be registered
 */
const PREFER_TRACK_NAVIGATION_ON_IOS = true;

/**
 * Position state update interval for iOS (in milliseconds)
 * iOS needs more frequent updates for lock screen progress bar interaction
 */
const IOS_POSITION_UPDATE_INTERVAL = 1000;

/**
 * Minimum progress delta to trigger position state update (in seconds)
 * Helps reduce unnecessary updates while still catching seeks
 */
const SEEK_DETECTION_THRESHOLD = 2;

/**
 * Periodic sync interval for iOS (in seconds)
 * Update position state every N seconds while playing
 */
const IOS_PERIODIC_SYNC_INTERVAL = 5;

/**
 * Fallback iOS detection for cases where platform detection might return desktop
 * (e.g., iPad desktop UA or resumed PWA contexts).
 */
const detectIOSFromUserAgent = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOSUA = /iPhone|iPad|iPod/i.test(ua);
  const hasTouchSupport = typeof document !== 'undefined' && 'ontouchend' in document;
  const touchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0;
  const isTouchMac = /Macintosh/i.test(ua) && hasTouchSupport && touchPoints > 0;
  return isIOSUA || isTouchMac;
};



/**
 * Options for the useMediaSession hook
 */
export interface UseMediaSessionOptions {
  /** Current song being played */
  currentSong: Song | null;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Current playback position in seconds */
  progress: number;
  /** Total duration in seconds */
  duration: number;
  /** Callback to resume playback */
  onPlay: () => void;
  /** Callback to pause playback */
  onPause: () => void;
  /** Callback to skip to next track */
  onNext: () => void;
  /** Callback to skip to previous track */
  onPrevious: () => void;
  /** Callback to seek to a specific position */
  onSeek: (position: number) => void;
  /** Optional callback to stop playback and clear queue */
  onStop?: () => void;
  /** Whether there is a next track available (for enabling/disabling controls) */
  hasNextTrack?: boolean;
  /** Whether there is a previous track available (for enabling/disabling controls) */
  hasPreviousTrack?: boolean;
}

/**
 * Hook to integrate with the browser's Media Session API
 * Updates metadata, playback state, and position state
 * Registers action handlers for media controls
 */
export function useMediaSession(options: UseMediaSessionOptions): void {
  const {
    currentSong,
    isPlaying,
    progress,
    duration,
    onPlay,
    onPause,
    onNext,
    onPrevious,
    onSeek,
    onStop,
    hasNextTrack = true,
    hasPreviousTrack = true,
  } = options;

  // Update metadata when current song changes
  useEffect(() => {
    if (!isMediaSessionSupported()) return;

    if (currentSong) {
      // Set metadata immediately (preloaded or basic)
      setMediaSessionMetadataSync(currentSong);

      let isCancelled = false;
      // Update with offline cached artwork when available
      createMediaMetadataWithOfflineSupport(currentSong)
        .then((metadata) => {
          if (isCancelled) return;
          try {
            navigator.mediaSession.metadata = metadata;
          } catch (error) {
            console.warn('[MediaSession] Failed to set media metadata:', error);
          }
        })
        .catch((error) => {
          if (isCancelled) return;
          console.warn('[MediaSession] Failed to create media metadata:', error);
        });

      return () => {
        isCancelled = true;
      };
    } else {
      // Clear metadata when no song is playing
      navigator.mediaSession.metadata = null;
    }
  }, [currentSong]);

  // Update playback state when isPlaying changes
  useEffect(() => {
    if (!isMediaSessionSupported()) return;

    try {
      navigator.mediaSession.playbackState = getPlaybackState(isPlaying);
    } catch (error) {
      console.warn('Failed to set playback state:', error);
    }
  }, [isPlaying]);

  // Track previous values to detect meaningful changes
  const prevSongIdRef = useRef<string | null>(null);
  const prevIsPlayingRef = useRef<boolean>(false);
  const prevDurationRef = useRef<number>(0);
  const prevProgressRef = useRef<number>(0);
  // Use ref for progress to avoid triggering effect on every progress change
  const progressRef = useRef<number>(progress);
  progressRef.current = progress;
  const durationRef = useRef<number>(duration);
  durationRef.current = duration;
  
  // Get platform info from AudioSessionManager (cached, no re-detection)
  const platformInfoRef = useRef(getPlatformInfo());
  const isIOSDevice = platformInfoRef.current.platform === 'ios' || detectIOSFromUserAgent();

  // Helper to update position state
  const updatePositionState = useCallback((position: number, dur: number) => {
    if (!isMediaSessionSupported() || dur <= 0) return;
    try {
      navigator.mediaSession.setPositionState(createPositionState(position, dur));
    } catch (error) {
      console.warn('Failed to set position state:', error);
    }
  }, []);

  // Update position state on meaningful events
  // For iOS: update more frequently to enable lock screen progress bar interaction
  useEffect(() => {
    if (!isMediaSessionSupported() || duration <= 0) return;

    const songChanged = currentSong?.id !== prevSongIdRef.current;
    const playStateChanged = isPlaying !== prevIsPlayingRef.current;
    const durationChanged = duration !== prevDurationRef.current && prevDurationRef.current === 0;
    
    // Detect significant progress changes (user seek or periodic sync)
    // Update when progress jumps by more than threshold (seek detection)
    const progressDelta = Math.abs(progress - prevProgressRef.current);
    const isSeek = progressDelta > SEEK_DETECTION_THRESHOLD;
    // iOS periodic sync: update every N seconds while playing
    const isPeriodicSync = isIOSDevice && isPlaying && progressDelta >= IOS_PERIODIC_SYNC_INTERVAL;

    // Update position state when:
    // 1. Song changes (new track)
    // 2. Play/pause state changes
    // 3. Duration becomes available (was 0, now has value)
    // 4. User seeks (progress jumps significantly)
    // 5. iOS periodic sync (every ~5 seconds while playing)
    if (songChanged || playStateChanged || durationChanged || isSeek || isPeriodicSync) {
      updatePositionState(progress, duration);
      prevProgressRef.current = progress;
    }

    // Update refs
    prevSongIdRef.current = currentSong?.id ?? null;
    prevIsPlayingRef.current = isPlaying;
    prevDurationRef.current = duration;
  }, [currentSong?.id, isPlaying, duration, progress, updatePositionState, isIOSDevice]);

  // iOS: Update position state every second while playing
  // This is crucial for iOS lock screen/Dynamic Island progress bar to be interactive
  useEffect(() => {
    if (!isMediaSessionSupported() || !isIOSDevice) return;
    if (!isPlaying || duration <= 0) return;

    const intervalId = setInterval(() => {
      updatePositionState(progressRef.current, durationRef.current);
    }, IOS_POSITION_UPDATE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [isPlaying, duration, updatePositionState, isIOSDevice]);

  // Create stable callback references for action handlers
  const handlePlay = useCallback(() => {
    onPlay();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    onPause();
  }, [onPause]);

  const handleStop = useCallback(() => {
    if (onStop) {
      onStop();
    } else {
      onPause();
    }
  }, [onStop, onPause]);

  const handleSeekTo = useCallback(
    (details: MediaSessionActionDetails) => {
      if (details.seekTime !== undefined && details.seekTime !== null) {
        onSeek(details.seekTime);
        // Update position state immediately after seek
        updatePositionState(details.seekTime, durationRef.current);
      }
    },
    [onSeek, updatePositionState]
  );

  const handleSeekForward = useCallback(
    (details: MediaSessionActionDetails) => {
      const offset = details.seekOffset ?? DEFAULT_SEEK_OFFSET;
      const newPosition = calculateSeekPosition(progressRef.current, offset, durationRef.current);
      onSeek(newPosition);
      // Update position state immediately after seek
      updatePositionState(newPosition, durationRef.current);
    },
    [onSeek, updatePositionState]
  );

  const handleSeekBackward = useCallback(
    (details: MediaSessionActionDetails) => {
      const offset = details.seekOffset ?? DEFAULT_SEEK_OFFSET;
      const newPosition = calculateSeekPosition(progressRef.current, -offset, durationRef.current);
      onSeek(newPosition);
      // Update position state immediately after seek
      updatePositionState(newPosition, durationRef.current);
    },
    [onSeek, updatePositionState]
  );

  // Track refs for hasNextTrack/hasPreviousTrack to use in handlers
  // This allows handlers to check current state without re-registering
  const hasNextTrackRef = useRef(hasNextTrack);
  const hasPreviousTrackRef = useRef(hasPreviousTrack);
  hasNextTrackRef.current = hasNextTrack;
  hasPreviousTrackRef.current = hasPreviousTrack;

  // Create wrapped handlers that check availability before executing
  // This ensures iOS always shows next/previous buttons (not seek buttons)
  // but they only execute when tracks are actually available
  const handleNextTrackWithCheck = useCallback(() => {
    if (hasNextTrackRef.current) {
      onNext();
    }
  }, [onNext]);

  const handlePreviousTrackWithCheck = useCallback(() => {
    if (hasPreviousTrackRef.current) {
      onPrevious();
    }
  }, [onPrevious]);

  // Helper function to register all action handlers
  // This is called on mount and whenever we need to re-register handlers (e.g., after metadata update on iOS)
  const registerActionHandlers = useCallback(() => {
    if (!isMediaSessionSupported()) return;

    // Determine if we should skip seek buttons (seekforward/seekbackward) on iOS
    // to show next/previous track buttons instead
    // Note: We still register seekto for progress bar scrubbing
    const skipSeekButtons = PREFER_TRACK_NAVIGATION_ON_IOS && isIOSDevice;

    console.log('[MediaSession] Registering action handlers, isIOSDevice:', isIOSDevice, 'skipSeekButtons:', skipSeekButtons);

    // Register all action handlers
    safeSetActionHandler('play', handlePlay);
    safeSetActionHandler('pause', handlePause);
    safeSetActionHandler('stop', handleStop);
    
    // Always register seekto - this enables progress bar scrubbing on iOS lock screen
    safeSetActionHandler('seekto', handleSeekTo);
    
    // On iOS: Always register nexttrack/previoustrack handlers
    // IMPORTANT: Setting handler to null causes iOS to show seek buttons instead!
    // We must always register a handler to show track navigation buttons.
    // The handlers internally check hasNextTrack/hasPreviousTrack before executing.
    // This ensures iOS Control Center always shows next/previous buttons.
    safeSetActionHandler('nexttrack', handleNextTrackWithCheck);
    safeSetActionHandler('previoustrack', handlePreviousTrackWithCheck);
    console.log('[MediaSession] Registered nexttrack and previoustrack handlers');
    
    // On iOS: Skip seekforward/seekbackward handlers to show track navigation buttons
    // iOS Control Center shows either seek buttons OR track buttons, not both
    // When seekforward/seekbackward are registered, iOS prefers to show those
    if (skipSeekButtons) {
      safeSetActionHandler('seekforward', null);
      safeSetActionHandler('seekbackward', null);
      console.log('[MediaSession] Cleared seekforward/seekbackward handlers for iOS');
    } else {
      safeSetActionHandler('seekforward', handleSeekForward);
      safeSetActionHandler('seekbackward', handleSeekBackward);
    }
  }, [
    handlePlay,
    handlePause,
    handleStop,
    handleNextTrackWithCheck,
    handlePreviousTrackWithCheck,
    handleSeekTo,
    handleSeekForward,
    handleSeekBackward,
    isIOSDevice,
  ]);

  // Register action handlers on mount, clean up on unmount
  // Note: We always register nexttrack/previoustrack handlers to ensure iOS shows
  // the track navigation buttons instead of seek buttons. The handlers internally
  // check if navigation is available before executing.
  useEffect(() => {
    registerActionHandlers();

    // Cleanup: remove all action handlers on unmount
    return () => {
      safeSetActionHandler('play', null);
      safeSetActionHandler('pause', null);
      safeSetActionHandler('stop', null);
      safeSetActionHandler('seekto', null);
      safeSetActionHandler('nexttrack', null);
      safeSetActionHandler('previoustrack', null);
      safeSetActionHandler('seekforward', null);
      safeSetActionHandler('seekbackward', null);
    };
  }, [registerActionHandlers]);

  // iOS: Re-register action handlers after metadata is set or playback starts
  // This is crucial because iOS sometimes loses action handlers when metadata changes
  // or when transitioning from stopped to playing state
  useEffect(() => {
    if (!isIOSDevice) return;
    if (!currentSong && !isPlaying) return;
    
    // Small delay to ensure metadata is set first
    const timeoutId = setTimeout(() => {
      registerActionHandlers();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [currentSong?.id, isPlaying, isIOSDevice, registerActionHandlers]);
}

export default useMediaSession;
