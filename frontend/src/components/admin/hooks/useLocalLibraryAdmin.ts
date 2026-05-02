import { useCallback, useEffect, useState } from 'react';
import {
  getLocalLibraryOverview,
  LocalLibraryOverview,
  LocalLibraryScrapeScope,
  triggerLocalLibraryScan,
  triggerLocalLibraryScrape,
} from '../../../api';

export function useLocalLibraryAdmin(isAdmin: boolean, isActive: boolean) {
  const [overview, setOverview] = useState<LocalLibraryOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchOverview = useCallback(async (background = false) => {
    if (!isAdmin || !isActive) {
      setIsLoading(false);
      return;
    }

    if (background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      setError(null);
      const data = await getLocalLibraryOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取本地媒体库状态失败');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isAdmin, isActive]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (!isActive || !overview) return;
    if (!overview.scan_running && !overview.scrape_status.is_running) return;

    const interval = window.setInterval(() => {
      fetchOverview(true);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [fetchOverview, isActive, overview]);

  const runScan = async (mode: 'incremental' | 'full') => {
    setActionLoading(`scan:${mode}`);
    try {
      setError(null);
      const result = await triggerLocalLibraryScan(mode);
      setMessage(result);
      await fetchOverview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动扫描失败');
    } finally {
      setActionLoading(null);
    }
  };

  const runScrape = async (scope: LocalLibraryScrapeScope) => {
    setActionLoading(`scrape:${scope}`);
    try {
      setError(null);
      const result = await triggerLocalLibraryScrape(scope);
      setMessage(result);
      await fetchOverview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动刮削失败');
    } finally {
      setActionLoading(null);
    }
  };

  return {
    overview,
    isLoading,
    isRefreshing,
    error,
    setError,
    message,
    setMessage,
    actionLoading,
    refreshOverview: () => fetchOverview(true),
    runScan,
    runScrape,
  };
}
