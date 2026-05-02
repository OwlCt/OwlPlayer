import { useState } from 'react';
import { clearPlayHistory, deletePlaybackState } from '../../../api';
import { usePlayHistoryStore } from '../../../store/playHistoryStore';
import { usePlayerStore } from '../../../store/playerStore';
import { clearTransientAudioCaches } from '../../../utils/transientAudioCache';

const LOCAL_CACHE_KEY = 'playback-state-local-cache';

export function useDataTab() {
  const [isClearingPlayHistory, setIsClearingPlayHistory] = useState(false);
  const [isClearingPlaybackState, setIsClearingPlaybackState] = useState(false);
  const [isClearingStreamingAudioCache, setIsClearingStreamingAudioCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { clearHistory: clearPlayHistoryStore } = usePlayHistoryStore();

  const handleClearPlayHistory = async () => {
    if (!confirm('确定要清除所有播放历史吗？此操作不可撤销。')) return;

    setIsClearingPlayHistory(true);
    setError(null);
    setSuccess(null);

    try {
      await clearPlayHistory();
      await clearPlayHistoryStore();
      setSuccess('播放历史已清除');
    } catch (err) {
      console.error('Failed to clear play history:', err);
      setError('清除播放历史失败');
    } finally {
      setIsClearingPlayHistory(false);
    }
  };

  const handleClearPlaybackState = async () => {
    if (!confirm('确定要清除播放状态缓存吗？这将清除当前播放队列和进度。')) return;

    setIsClearingPlaybackState(true);
    setError(null);
    setSuccess(null);

    try {
      // Clear localStorage cache
      localStorage.removeItem(LOCAL_CACHE_KEY);
      
      // Clear server-side playback state
      await deletePlaybackState();
      
      // Clear player store state
      usePlayerStore.getState().clearQueue();
      
      setSuccess('播放状态缓存已清除');
    } catch (err) {
      console.error('Failed to clear playback state:', err);
      setError('清除播放状态缓存失败');
    } finally {
      setIsClearingPlaybackState(false);
    }
  };

  const handleClearStreamingAudioCache = async () => {
    if (!confirm('确定要清除所有流式音频缓存吗？这不会删除离线下载，只会清除在线播放产生的缓存数据。')) return;

    setIsClearingStreamingAudioCache(true);
    setError(null);
    setSuccess(null);

    try {
      await clearTransientAudioCaches();
      setSuccess('流式音频缓存已清除');
    } catch (err) {
      console.error('Failed to clear streaming audio cache:', err);
      setError('清除流式音频缓存失败');
    } finally {
      setIsClearingStreamingAudioCache(false);
    }
  };

  return {
    isClearingPlayHistory,
    isClearingPlaybackState,
    isClearingStreamingAudioCache,
    error,
    success,
    handleClearPlayHistory,
    handleClearPlaybackState,
    handleClearStreamingAudioCache,
    clearMessages: () => { setError(null); setSuccess(null); },
  };
}
