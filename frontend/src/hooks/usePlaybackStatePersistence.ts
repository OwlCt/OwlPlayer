import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { useAuthStore } from '../store/authStore';
import { savePlaybackStateBeacon, savePlaybackProgressBeacon, SavePlaybackStateRequest, SavePlaybackProgressRequest } from '../api';
import { getManualOfflineMode } from './useOnlineStatus';
import { offlineCacheService } from '../services/offlineCacheService';
import { getAuthenticatedStreamUrl } from '../utils/streamUrl';

// Debounce delay in milliseconds
const SAVE_DEBOUNCE_MS = 5000;
// Base interval for periodic progress saves while playing (desktop)
const DEFAULT_PROGRESS_SAVE_INTERVAL_MS = 10000;
// Faster interval on mobile where background suspension risk is higher
const MOBILE_PROGRESS_SAVE_INTERVAL_MS = 5000;
// Minimum progress delta (seconds) required to trigger a periodic save
const MIN_PROGRESS_DELTA_SEC = 2;
// Local fallback cache settings
const LOCAL_CACHE_KEY = 'playback-state-local-cache';
const LOCAL_SAVE_INTERVAL_MS = 2000;
const MIN_LOCAL_PROGRESS_DELTA_SEC = 0.5;

/**
 * Hook to handle automatic playback state persistence.
 * - Saves state with debounce when queue, playMode, isShuffled, or queueIndex changes
 * - Periodic saves while playing (5s mobile / 10s desktop) with progress delta guard
 * - Saves immediately on pause/background/unload using sendBeacon
 * - Local fallback cache for force-kill recovery (2s interval)
 */
export function usePlaybackStatePersistence() {
  const { isAuthenticated } = useAuthStore();
  const { 
    queue, 
    queueIndex, 
    playMode, 
    isShuffled,
    queueSource,
    savePlaybackState,
    savePlaybackProgress,
    isPlaying,
  } = usePlayerStore();
  
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const lastQueueSignatureRef = useRef<string>('');
  const isSavingFullRef = useRef(false);
  const isSavingProgressRef = useRef(false);
  const pendingFullSaveRef = useRef(false);
  const lastProgressSavedRef = useRef<number>(usePlayerStore.getState().progress || 0);
  const lastProgressSaveTimeRef = useRef<number>(0);
  const lastQueueSaveTimeRef = useRef<number>(0);
  const isMobileDevice = useRef<boolean>(
    typeof navigator !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  );
  const lastLocalProgressRef = useRef<number>(usePlayerStore.getState().progress || 0);
  const lastLocalSaveTimeRef = useRef<number>(0);
  const hasHydratedLocalRef = useRef<boolean>(false);

  const clampVolume = (v: number): number => Math.max(0, Math.min(100, v));

  // Persist a lightweight copy to localStorage for force-kill recovery
  const persistLocalCache = useCallback(() => {
    try {
      const state = usePlayerStore.getState();
      if (state.queue.length === 0) return;

      const payload: SavePlaybackStateRequest & {
        updated_at: number;
        queue_source_type?: string | null;
        queue_source_id?: string | null;
        queue_source_name?: string | null;
      } = {
        queue_songs: state.queue.map((s) => ({
          id: s.id,
          name: s.name,
          artist_name: s.artistName,
          artist_id: s.artistId,
          album_name: s.albumName,
          album_id: s.albumId || '',
          duration: s.duration,
          artwork_url: s.artworkUrl,
          has_lyrics: s.hasLyrics,
        })),
        current_index: state.queueIndex,
        position: state.progress,
        play_mode: state.playMode,
        is_shuffled: state.isShuffled,
        volume: state.volume,
        queue_source_type: state.queueSource.type,
        queue_source_id: state.queueSource.id,
        queue_source_name: state.queueSource.name || null,
        updated_at: Date.now(),
      };

      localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload));
      lastLocalProgressRef.current = state.progress;
      lastLocalSaveTimeRef.current = Date.now();
    } catch {
      // Swallow localStorage failures (quota, privacy mode, etc.)
    }
  }, []);

  // Hydrate from local cache once after auth (only if queue is empty or matches)
  const hydrateFromLocalCache = useCallback(() => {
    if (hasHydratedLocalRef.current) return;
    hasHydratedLocalRef.current = true;

    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      if (!raw) return;

      const cached: SavePlaybackStateRequest & {
        updated_at?: number;
        queue_source_type?: string | null;
        queue_source_id?: string | null;
        queue_source_name?: string | null;
      } = JSON.parse(raw);

      if (!cached.queue_songs || cached.queue_songs.length === 0) return;

      const songs = cached.queue_songs.map((qs) => ({
        id: qs.id,
        name: qs.name,
        artistName: qs.artist_name,
        artistId: qs.artist_id,
        albumName: qs.album_name,
        albumId: qs.album_id,
        duration: qs.duration,
        artworkUrl: qs.artwork_url,
        hasLyrics: qs.has_lyrics,
      }));

      const state = usePlayerStore.getState();

      // Only hydrate if queue is empty or identical to avoid clobbering a new session
      const sameQueue =
        state.queue.length === songs.length &&
        state.queue.every((s, i) => s.id === songs[i].id);

      if (state.queue.length > 0 && !sameQueue) {
        return;
      }

      const queueIndexCached = Math.min(cached.current_index, songs.length - 1);
      const currentSong = songs[queueIndexCached] || null;
      const volume = clampVolume(cached.volume ?? 70);
      const queueSource = {
        type: (cached.queue_source_type as typeof state.queueSource.type) || null,
        id: cached.queue_source_id || null,
        name: cached.queue_source_name || undefined,
      };

      usePlayerStore.setState({
        queue: songs,
        originalQueue: songs,
        queueIndex: queueIndexCached,
        currentSong,
        progress: cached.position,
        playMode: cached.play_mode as typeof state.playMode,
        isShuffled: cached.is_shuffled,
        volume,
        queueSource,
        isPlaying: false,
      });

      const audioRef = usePlayerStore.getState().audioRef;
      if (audioRef && currentSong) {
        audioRef.volume = volume / 100;
        
        // 保存要恢复的歌曲 ID，用于后续验证
        const songIdToRestore = currentSong.id;
        const positionToRestore = cached.position;
        
        // 优先使用离线缓存，避免不必要的网络请求
        offlineCacheService.getCachedSong(currentSong.id).then((cachedSong) => {
          // 验证当前歌曲是否仍然是我们要恢复的歌曲（防止竞态条件）
          const currentState = usePlayerStore.getState();
          if (currentState.currentSong?.id !== songIdToRestore) {
            console.log(`[hydrateFromLocalCache] Song changed during async operation, skipping position restore`);
            return;
          }
          
          let audioUrl: string;
          if (cachedSong && cachedSong.audio) {
            // 使用缓存的音频
            audioUrl = URL.createObjectURL(cachedSong.audio);
            console.log(`[hydrateFromLocalCache] Using cached audio for ${currentSong.name}`);
          } else {
            // 使用服务器流
            audioUrl = getAuthenticatedStreamUrl(currentSong.id, false);
            console.log(`[hydrateFromLocalCache] Using server stream for ${currentSong.name}`);
          }
          
          audioRef.src = audioUrl;
          audioRef.addEventListener(
            'loadedmetadata',
            function onLoaded() {
              // 再次验证当前歌曲是否仍然是我们要恢复的歌曲
              const latestState = usePlayerStore.getState();
              if (latestState.currentSong?.id === songIdToRestore) {
                audioRef.currentTime = positionToRestore;
                console.log(`[hydrateFromLocalCache] Restored position to ${positionToRestore}s for ${currentSong.name}`);
              } else {
                console.log(`[hydrateFromLocalCache] Song changed before loadedmetadata, skipping position restore`);
              }
              audioRef.removeEventListener('loadedmetadata', onLoaded);
            },
            { once: true }
          );
          audioRef.load();
        }).catch((error) => {
          // 缓存检查失败，回退到服务器流
          console.error('[hydrateFromLocalCache] Cache check failed:', error);
          
          // 验证当前歌曲是否仍然是我们要恢复的歌曲
          const currentState = usePlayerStore.getState();
          if (currentState.currentSong?.id !== songIdToRestore) {
            console.log(`[hydrateFromLocalCache] Song changed during error handling, skipping`);
            return;
          }
          
          audioRef.src = getAuthenticatedStreamUrl(currentSong.id, false);
          audioRef.addEventListener(
            'loadedmetadata',
            function onLoaded() {
              // 再次验证当前歌曲是否仍然是我们要恢复的歌曲
              const latestState = usePlayerStore.getState();
              if (latestState.currentSong?.id === songIdToRestore) {
                audioRef.currentTime = positionToRestore;
                console.log(`[hydrateFromLocalCache] Restored position to ${positionToRestore}s for ${currentSong.name}`);
              } else {
                console.log(`[hydrateFromLocalCache] Song changed before loadedmetadata, skipping position restore`);
              }
              audioRef.removeEventListener('loadedmetadata', onLoaded);
            },
            { once: true }
          );
          audioRef.load();
        });
      }
    } catch {
      // Ignore corrupted cache
    }
  }, []);
  
  // Create a stable reference to savePlaybackState and savePlaybackProgress
  const saveStateRef = useRef(savePlaybackState);
  saveStateRef.current = savePlaybackState;
  const saveProgressRef = useRef(savePlaybackProgress);
  saveProgressRef.current = savePlaybackProgress;

  // Centralized save helper for full state (queue changes) - higher priority
  const saveNow = useCallback(() => {
    if (!isAuthenticated) return;
    // Skip server save in offline mode to save bandwidth
    if (getManualOfflineMode()) return;

    const state = usePlayerStore.getState();
    if (state.queue.length === 0) return;
    if (isSavingFullRef.current) {
      pendingFullSaveRef.current = true;
      return;
    }

    isSavingFullRef.current = true;
    pendingFullSaveRef.current = false;
    const progressToMark = state.progress;

    const result = saveStateRef.current();
    Promise.resolve(result)
      .catch(() => {
        // Errors are logged inside savePlaybackState; swallow to avoid unhandled rejection
      })
      .finally(() => {
        lastProgressSavedRef.current = progressToMark;
        lastProgressSaveTimeRef.current = Date.now();
        lastQueueSaveTimeRef.current = Date.now();
        isSavingFullRef.current = false;

        // If another full save was requested while we were saving, run it now (trailing edge)
        if (pendingFullSaveRef.current) {
          pendingFullSaveRef.current = false;
          setTimeout(() => saveNow(), 0);
        }
      });
  }, [isAuthenticated]);

  // Lightweight progress-only save helper (for periodic updates)
  const saveProgressNow = useCallback(() => {
    if (!isAuthenticated) return;
    // Skip server save in offline mode to save bandwidth
    if (getManualOfflineMode()) return;

    const state = usePlayerStore.getState();
    if (state.queue.length === 0) return;
    // If a full save is pending, avoid writing progress against a potentially stale server queue
    if (pendingFullSaveRef.current) return;
    // Skip if full save is in progress or was recent (within 2s)
    if (isSavingFullRef.current || isSavingProgressRef.current) return;
    if (Date.now() - lastQueueSaveTimeRef.current < 2000) return;

    isSavingProgressRef.current = true;
    const progressToMark = state.progress;

    const result = saveProgressRef.current();
    Promise.resolve(result)
      .catch(() => {
        // Errors are logged inside savePlaybackProgress; swallow to avoid unhandled rejection
      })
      .finally(() => {
        lastProgressSavedRef.current = progressToMark;
        lastProgressSaveTimeRef.current = Date.now();
        isSavingProgressRef.current = false;
      });
  }, [isAuthenticated]);
  
  // Debounced save function
  const debouncedSave = useCallback(() => {
    if (!isAuthenticated) return;
    
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Schedule new save
    saveTimeoutRef.current = setTimeout(() => {
      saveNow();
    }, SAVE_DEBOUNCE_MS);
  }, [isAuthenticated, saveNow]);
  
  // Immediate save using sendBeacon (for beforeunload - more reliable than async requests)
  // Uses FULL state to ensure queue is saved on page close/refresh
  // Note: We get fresh state directly from stores to ensure we have the latest values
  const immediateSaveBeacon = useCallback(() => {
    // Skip server save in offline mode to save bandwidth
    if (getManualOfflineMode()) {
      // Still save to local cache for offline recovery
      persistLocalCache();
      return;
    }
    
    // Get fresh auth state directly from store (not from React state which may be stale)
    const authState = useAuthStore.getState();
    if (!authState.isAuthenticated) return;
    
    // Get fresh player state from store
    const currentState = usePlayerStore.getState();
    if (currentState.queue.length === 0) return;
    
    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    // Use store's progress which is synced every 200ms by the interval below
    const currentPosition = currentState.progress;
    
    // Use FULL state beacon for page unload to ensure queue is saved
    const state: SavePlaybackStateRequest = {
      queue_songs: currentState.queue.map(s => ({
        id: s.id,
        name: s.name,
        artist_name: s.artistName,
        artist_id: s.artistId,
        album_name: s.albumName,
        album_id: s.albumId || '',
        duration: s.duration,
        artwork_url: s.artworkUrl,
        has_lyrics: s.hasLyrics,
      })),
      current_index: currentState.queueIndex,
      position: currentPosition,
      play_mode: currentState.playMode,
      is_shuffled: currentState.isShuffled,
      volume: currentState.volume,
      queue_source_type: currentState.queueSource.type,
      queue_source_id: currentState.queueSource.id,
      queue_source_name: currentState.queueSource.name || null,
    };
    
    savePlaybackStateBeacon(state);
    persistLocalCache();
  }, [persistLocalCache]); // Added persistLocalCache dependency

  // Save when playback transitions from playing -> paused/stopped
  const previousIsPlayingRef = useRef<boolean>(usePlayerStore.getState().isPlaying);
  useEffect(() => {
    if (!isAuthenticated) return;

    if (previousIsPlayingRef.current && !isPlaying) {
      saveNow();
      persistLocalCache();
    }
    previousIsPlayingRef.current = isPlaying;
  }, [isPlaying, isAuthenticated, saveNow, persistLocalCache]);

  // Periodically persist progress while playing so a sudden tab close loses at most a few seconds
  // Uses lightweight progress-only API to reduce bandwidth
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalMs = isMobileDevice.current ? MOBILE_PROGRESS_SAVE_INTERVAL_MS : DEFAULT_PROGRESS_SAVE_INTERVAL_MS;

    const intervalId = setInterval(() => {
      const authState = useAuthStore.getState();
      if (!authState.isAuthenticated) return;

      const state = usePlayerStore.getState();
      if (!state.isPlaying || state.queue.length === 0) return;

      const now = Date.now();
      const progressDelta = Math.abs(state.progress - lastProgressSavedRef.current);
      const timeSinceLast = now - lastProgressSaveTimeRef.current;

      // Skip if progress barely changed and we recently saved (avoid noisy writes)
      if (progressDelta < MIN_PROGRESS_DELTA_SEC && timeSinceLast < intervalMs * 2) {
        return;
      }

      // Use lightweight progress-only save for periodic updates
      saveProgressNow();
    }, intervalMs);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isAuthenticated, saveProgressNow]);

  // Local fallback cache: save more frequently (2s) to survive force-kill
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.queue.length === 0) return;
      if (!state.isPlaying) return;

      const progressDelta = Math.abs(state.progress - lastLocalProgressRef.current);
      const timeSinceLast = Date.now() - lastLocalSaveTimeRef.current;
      if (progressDelta < MIN_LOCAL_PROGRESS_DELTA_SEC && timeSinceLast < LOCAL_SAVE_INTERVAL_MS * 2) {
        return;
      }

      persistLocalCache();
    }, LOCAL_SAVE_INTERVAL_MS);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isAuthenticated, persistLocalCache]);
  
  // Watch for state changes and trigger save
  useEffect(() => {
    if (!isAuthenticated || queue.length === 0) return;
    
    // Create signatures to detect changes
    const queueSignature = queue.map(s => s.id).join(',');
    const fullSignature = JSON.stringify({
      queueIds: queue.map(s => s.id),
      queueIndex,
      playMode,
      isShuffled,
      queueSource: {
        type: queueSource?.type ?? null,
        id: queueSource?.id ?? null,
        name: queueSource?.name ?? null,
      },
    });
    
    // If this update came from server hydration, establish baseline but don't immediately save it back.
    const state = usePlayerStore.getState();
    if (state.skipNextPlaybackStateSave) {
      usePlayerStore.setState({ skipNextPlaybackStateSave: false });
      lastSavedRef.current = fullSignature;
      lastQueueSignatureRef.current = queueSignature;
      return;
    }

    // If we have no baseline yet, this is the first meaningful playback state in this session.
    // Save immediately so a refresh won't fall back to an old server queue.
    if (!lastSavedRef.current) {
      lastSavedRef.current = fullSignature;
      lastQueueSignatureRef.current = queueSignature;
      saveNow();
      persistLocalCache();
      return;
    }
    
    // Check if queue itself changed (not just index)
    const prevQueueSignature = lastQueueSignatureRef.current;
    const queueChanged = queueSignature !== prevQueueSignature && prevQueueSignature !== '';
    
    // Only save if state actually changed
    if (fullSignature !== lastSavedRef.current) {
      lastSavedRef.current = fullSignature;
      
      if (queueChanged) {
        // Queue changed - save immediately (no debounce)
        lastQueueSignatureRef.current = queueSignature;
        console.log('[PlaybackState] Queue changed, saving immediately');
        saveNow();
        persistLocalCache();
      } else {
        // Only index/mode changed - use debounce
        debouncedSave();
      }
    }
  }, [queue, queueIndex, playMode, isShuffled, queueSource, isAuthenticated, debouncedSave, saveNow, persistLocalCache]);
  
  // Handle page unload - save state before leaving using sendBeacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      immediateSaveBeacon();
      persistLocalCache();
    };
    
    // pagehide is more reliable than beforeunload in some browsers (especially for refresh)
    const handlePageHide = () => {
      immediateSaveBeacon();
      persistLocalCache();
    };

    // Mobile Chrome fires freeze before backgrounding the page
    const handleFreeze = () => {
      immediateSaveBeacon();
      persistLocalCache();
    };
    
    // Also handle visibilitychange for mobile browsers that may not fire beforeunload
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        immediateSaveBeacon();
        persistLocalCache();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('freeze', handleFreeze as EventListener);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('freeze', handleFreeze as EventListener);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // Also save when component unmounts
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [immediateSaveBeacon, persistLocalCache]);
  
  // Hydrate from local cache once after authentication (helps force-kill recovery)
  useEffect(() => {
    if (!isAuthenticated) return;
    hydrateFromLocalCache();
  }, [isAuthenticated, hydrateFromLocalCache]);
  
  // Periodically sync progress from audioRef to store while playing
  // This ensures store.progress is always up-to-date for page unload scenarios
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    const syncProgress = () => {
      const state = usePlayerStore.getState();
      if (state.audioRef && state.isPlaying && !isNaN(state.audioRef.currentTime)) {
        // Update store progress directly
        usePlayerStore.setState({ progress: state.audioRef.currentTime });
      }
    };
    
    // Sync progress every 200ms while playing for more accurate state on page unload
    intervalId = setInterval(syncProgress, 200);
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  // Save when audio element pauses (covers system-induced pauses on mobile)
  useEffect(() => {
    let cleanup: (() => void) | null = null;
    let prevAudioRef: HTMLAudioElement | null = null;

    const attachPauseListener = (audio: HTMLAudioElement | null) => {
      if (!audio) return;
      const handlePause = () => {
        saveNow();
        persistLocalCache();
      };
      audio.addEventListener('pause', handlePause);
      cleanup = () => audio.removeEventListener('pause', handlePause);
    };

    // Attach to current audioRef and re-attach on change
    const unsubscribe = usePlayerStore.subscribe((state) => {
      const audioRef = state.audioRef;
      if (audioRef !== prevAudioRef) {
        if (cleanup) {
          cleanup();
          cleanup = null;
        }
        attachPauseListener(audioRef);
        prevAudioRef = audioRef;
      }
    });

    // Initial attachment
    const initialAudioRef = usePlayerStore.getState().audioRef;
    if (initialAudioRef) {
      attachPauseListener(initialAudioRef);
      prevAudioRef = initialAudioRef;
    }

    return () => {
      unsubscribe();
      if (cleanup) cleanup();
    };
  }, [saveNow, persistLocalCache]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);
}
