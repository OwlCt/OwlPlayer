import { getAudioSessionManager } from "./audioSession";
import { audioPreloader } from "./audioPreloader";
import { clearSWMediaCaches } from "./swAudioCache";

/**
 * Clear client-side transient streaming audio caches without touching offline downloads.
 * This covers in-memory preloads, platform-specific preload buffers, and SW-backed stream caches.
 */
export async function clearTransientAudioCaches(songIds?: string[]): Promise<void> {
  if (songIds && songIds.length > 0) {
    songIds.forEach((songId) => audioPreloader.remove(songId));
  } else {
    audioPreloader.clear();
  }

  try {
    const sessionManager = getAudioSessionManager();
    if (
      "clearPreloadCache" in sessionManager &&
      typeof sessionManager.clearPreloadCache === "function"
    ) {
      sessionManager.clearPreloadCache();
    }
  } catch {
    // Ignore session manager initialization failures during cache cleanup.
  }

  await clearSWMediaCaches();
}
