import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSyncStatus,
  getSyncSettings,
  updateSyncSettings,
  triggerSync,
  clearArtistSnapshots,
  getSyncHistory,
  getSyncHistoryDetail,
  clearSyncHistory,
  getSyncedArtists,
  resyncArtist,
  SyncStatus,
  SyncSettings,
  SyncHistoryResponse,
  SyncedArtistResponse,
} from '../../../api';

export function useSyncTab(isAdmin: boolean, isActive: boolean) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncSettings, setSyncSettings] = useState<SyncSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTriggering, setIsTriggering] = useState(false);
  const [isClearingSnapshots, setIsClearingSnapshots] = useState(false);

  // Form state
  const [intervalHours, setIntervalHours] = useState<number>(24);
  const [requestDelayMs, setRequestDelayMs] = useState<number>(1000);
  const [scheduleEnabled, setScheduleEnabled] = useState<boolean>(false);
  const [scheduleHour, setScheduleHour] = useState<number>(3);
  const [scheduleMinute, setScheduleMinute] = useState<number>(0);

  // Sync history state
  const [syncHistories, setSyncHistories] = useState<SyncHistoryResponse[]>([]);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  // Synced artists state
  const [syncedArtists, setSyncedArtists] = useState<SyncedArtistResponse[]>([]);
  const [resyncingArtistId, setResyncingArtistId] = useState<string | null>(null);

  // Auto-scroll ref for log viewer
  const logViewerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const fetchSyncHistory = useCallback(async () => {
    try {
      const histories = await getSyncHistory();
      setSyncHistories(histories);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取同步历史失败');
    }
  }, []);

  const fetchSyncedArtists = useCallback(async () => {
    try {
      const artists = await getSyncedArtists();
      setSyncedArtists(artists);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取艺术家列表失败');
    }
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [status, settings] = await Promise.all([
        getSyncStatus(),
        getSyncSettings()
      ]);
      setSyncStatus(status);
      setSyncSettings(settings);
      setIntervalHours(settings.interval_hours);
      setRequestDelayMs(settings.request_delay_ms);
      setScheduleEnabled(settings.schedule_enabled);
      setScheduleHour(settings.schedule_hour);
      setScheduleMinute(settings.schedule_minute);
      
      // Also fetch history, stats, and artists
      await Promise.all([
        fetchSyncHistory(),
        fetchSyncedArtists()
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取同步设置失败');
    } finally {
      setIsLoading(false);
    }
  }, [fetchSyncHistory, fetchSyncedArtists]);

  useEffect(() => {
    if (isAdmin && isActive) {
      fetchData();
    }
  }, [isAdmin, isActive, fetchData]);

  // Auto-refresh when sync is running
  useEffect(() => {
    if (isActive && syncStatus?.is_running) {
      const interval = setInterval(() => {
        getSyncStatus().then(setSyncStatus).catch(() => {});
        fetchSyncHistory();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [isActive, syncStatus?.is_running, fetchSyncHistory]);

  // Auto-scroll log viewer
  useEffect(() => {
    if (autoScroll && logViewerRef.current) {
      logViewerRef.current.scrollTop = logViewerRef.current.scrollHeight;
    }
  }, [syncHistories, autoScroll]);

  const handleSave = async () => {
    if (intervalHours < 1 || intervalHours > 168) {
      setError('同步间隔必须在 1-168 小时之间');
      return;
    }
    if (requestDelayMs < 0 || requestDelayMs > 60000) {
      setError('请求延迟必须在 0-60000 毫秒之间');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const newSettings = await updateSyncSettings({
        interval_hours: intervalHours,
        request_delay_ms: requestDelayMs,
        schedule_enabled: scheduleEnabled,
        schedule_hour: scheduleHour,
        schedule_minute: scheduleMinute
      });
      setSyncSettings(newSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存同步设置失败');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerSync = async () => {
    setIsTriggering(true);
    setError(null);
    try {
      await triggerSync();
      setTimeout(async () => {
        const status = await getSyncStatus();
        setSyncStatus(status);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '触发同步失败');
    } finally {
      setIsTriggering(false);
    }
  };

  const handleRefreshStatus = async () => {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新状态失败');
    }
  };

  const handleClearSnapshots = async () => {
    setIsClearingSnapshots(true);
    try {
      await clearArtistSnapshots();
      const status = await getSyncStatus();
      setSyncStatus(status);
      await fetchSyncedArtists();
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除快照失败');
    } finally {
      setIsClearingSnapshots(false);
    }
  };

  const handleClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      await clearSyncHistory();
      setSyncHistories([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除历史失败');
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleResyncArtist = async (artistId: string) => {
    setResyncingArtistId(artistId);
    setError(null);
    try {
      const result = await resyncArtist(artistId);
      if (!result.success && result.error) {
        setError(`重新同步失败: ${result.error}`);
      }
      // Refresh data
      await Promise.all([
        fetchSyncedArtists(),
        fetchSyncHistory()
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重新同步失败');
    } finally {
      setResyncingArtistId(null);
    }
  };

  const toggleHistoryExpand = async (historyId: string) => {
    if (expandedHistoryId === historyId) {
      setExpandedHistoryId(null);
    } else {
      setExpandedHistoryId(historyId);
      // Fetch detailed logs if not already loaded
      const history = syncHistories.find(h => h.id === historyId);
      if (history && (!history.logs || history.logs.length === 0)) {
        try {
          const detail = await getSyncHistoryDetail(historyId);
          setSyncHistories(prev => prev.map(h => h.id === historyId ? detail : h));
        } catch (err) {
          setError(err instanceof Error ? err.message : '获取历史详情失败');
        }
      }
    }
  };

  return {
    syncStatus,
    syncSettings,
    isLoading,
    error,
    setError,
    isSaving,
    isTriggering,
    isClearingSnapshots,
    // Form state
    intervalHours,
    setIntervalHours,
    requestDelayMs,
    setRequestDelayMs,
    scheduleEnabled,
    setScheduleEnabled,
    scheduleHour,
    setScheduleHour,
    scheduleMinute,
    setScheduleMinute,
    // Sync history
    syncHistories,
    expandedHistoryId,
    isClearingHistory,
    // Synced artists
    syncedArtists,
    resyncingArtistId,
    // Log viewer
    logViewerRef,
    autoScroll,
    setAutoScroll,
    // Actions
    handleSave,
    handleTriggerSync,
    handleRefreshStatus,
    handleClearSnapshots,
    handleClearHistory,
    handleResyncArtist,
    toggleHistoryExpand,
    fetchSyncHistory,
  };
}
