/**
 * Hook for managing lyrics display settings
 * Settings are persisted to localStorage
 * 
 * Property 12: Translation preference persistence
 * Validates: Requirements 8.4
 */
import { useState, useEffect, useCallback } from 'react';

export interface LyricsSettings {
  showTranslation: boolean;
  showTransliteration: boolean;
  chineseVariant: 'simplified' | 'traditional' | 'auto';
}

export const STORAGE_KEY = 'lyrics-settings';

export const defaultSettings: LyricsSettings = {
  showTranslation: true,
  showTransliteration: false,
  chineseVariant: 'auto'
};

/**
 * Serialize settings to JSON string for storage.
 * Exported for property testing.
 */
export function serializeSettings(settings: LyricsSettings): string {
  return JSON.stringify(settings);
}

/**
 * Deserialize settings from JSON string.
 * Returns default settings if parsing fails.
 * Exported for property testing.
 */
export function deserializeSettings(json: string | null): LyricsSettings {
  if (!json) return defaultSettings;
  try {
    const parsed = JSON.parse(json);
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

/**
 * Load settings from localStorage.
 */
export function loadSettings(): LyricsSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return deserializeSettings(stored);
  } catch (e) {
    console.warn('Failed to load lyrics settings:', e);
  }
  return defaultSettings;
}

/**
 * Save settings to localStorage.
 */
export function saveSettings(settings: LyricsSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSettings(settings));
  } catch (e) {
    console.warn('Failed to save lyrics settings:', e);
  }
}

export function useLyricsSettings() {
  const [settings, setSettings] = useState<LyricsSettings>(loadSettings);

  // Save to localStorage whenever settings change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const toggleTranslation = useCallback(() => {
    setSettings(prev => ({ ...prev, showTranslation: !prev.showTranslation }));
  }, []);

  const toggleTransliteration = useCallback(() => {
    setSettings(prev => ({ ...prev, showTransliteration: !prev.showTransliteration }));
  }, []);

  const setChineseVariant = useCallback((variant: LyricsSettings['chineseVariant']) => {
    setSettings(prev => ({ ...prev, chineseVariant: variant }));
  }, []);

  const cycleChineseVariant = useCallback(() => {
    setSettings(prev => {
      const variants: LyricsSettings['chineseVariant'][] = ['auto', 'simplified', 'traditional'];
      const currentIndex = variants.indexOf(prev.chineseVariant);
      const nextIndex = (currentIndex + 1) % variants.length;
      return { ...prev, chineseVariant: variants[nextIndex] };
    });
  }, []);

  return {
    settings,
    toggleTranslation,
    toggleTransliteration,
    setChineseVariant,
    cycleChineseVariant
  };
}
