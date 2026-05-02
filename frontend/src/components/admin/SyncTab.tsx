import { useState } from 'react';
import { useSyncTab } from './hooks/useSyncTab';
import { LoadingSpinner, ErrorAlert, AdminCard, StatCard } from './common';
import ConfirmDialog from '../ConfirmDialog';
import { SyncHistoryResponse, SyncLogEntryResponse } from '../../api';

interface SyncTabProps {
  isAdmin: boolean;
  isActive: boolean;
}

export default function SyncTab({ isAdmin, isActive }: SyncTabProps) {
  const {
    syncStatus,
    syncSettings,
    isLoading,
    error,
    setError,
    isSaving,
    isTriggering,
    isClearingSnapshots,
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
    syncHistories,
    expandedHistoryId,
    isClearingHistory,
    syncedArtists,
    resyncingArtistId,
    logViewerRef,
    autoScroll,
    setAutoScroll,
    handleSave,
    handleTriggerSync,
    handleRefreshStatus,
    handleClearSnapshots,
    handleClearHistory,
    handleResyncArtist,
    toggleHistoryExpand,
  } = useSyncTab(isAdmin, isActive);

  const [clearSnapshotsDialogOpen, setClearSnapshotsDialogOpen] = useState(false);
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}

      <div className="space-y-8">
        {/* Sync Status */}
        <AdminCard
          title="同步状态"
          actions={
            <>
              <button
                onClick={handleRefreshStatus}
                className="px-3 py-1.5 text-xs bg-white/10 text-white hover:bg-white/20 rounded transition-colors"
              >
                刷新
              </button>
              <button
                onClick={handleTriggerSync}
                disabled={isTriggering || syncStatus?.is_running}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 rounded transition-colors"
              >
                {isTriggering ? '触发中...' : syncStatus?.is_running ? '同步中...' : '立即同步'}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              label="同步状态"
              value={syncStatus?.is_running ? '运行中' : '空闲'}
              valueClassName={`text-xl font-medium ${syncStatus?.is_running ? 'text-green-400' : 'text-white'}`}
            />
            <StatCard label="艺术家快照数" value={syncStatus?.snapshot_count || 0} />
            <StatCard label="上次处理艺术家" value={syncStatus?.last_result?.processed_artists ?? '-'} />
            <StatCard label="上次耗时" value={syncStatus?.last_result?.duration || '-'} small />
            <StatCard
              label="上次同步时间"
              value={syncStatus?.last_result?.completed_at
                ? new Date(syncStatus.last_result.completed_at).toLocaleString('zh-CN')
                : '-'}
              small
            />
          </div>
        </AdminCard>

        {/* Synced Artists */}
        <AdminCard title="已同步艺术家">
          {syncedArtists.length === 0 ? (
            <p className="text-white/60 text-sm">暂无已同步的艺术家</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-neutral-900">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-2 text-left text-sm font-medium text-white/60">艺术家</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-white/60">专辑数</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-white/60">单曲数</th>
                    <th className="px-4 py-2 text-left text-sm font-medium text-white/60">最后更新</th>
                    <th className="px-4 py-2 text-right text-sm font-medium text-white/60">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {syncedArtists.map((artist) => (
                    <tr key={artist.artist_id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-2 text-white text-sm">{artist.artist_name}</td>
                      <td className="px-4 py-2 text-white/60 text-sm">{artist.album_count}</td>
                      <td className="px-4 py-2 text-white/60 text-sm">{artist.single_count}</td>
                      <td className="px-4 py-2 text-white/60 text-sm">
                        {new Date(artist.last_updated_at).toLocaleString('zh-CN')}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => handleResyncArtist(artist.artist_id)}
                          disabled={resyncingArtistId === artist.artist_id}
                          className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 disabled:opacity-50 rounded transition-colors"
                        >
                          {resyncingArtistId === artist.artist_id ? '同步中...' : '重新同步'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminCard>

        {/* Sync History with Real-time Log Viewer */}
        <AdminCard
          title="同步历史"
          actions={
            <button
              onClick={() => setClearHistoryDialogOpen(true)}
              disabled={isClearingHistory || syncHistories.length === 0}
              className="px-3 py-1.5 text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50 rounded transition-colors"
            >
              {isClearingHistory ? '清除中...' : '清除历史'}
            </button>
          }
        >
          {syncHistories.length === 0 ? (
            <p className="text-white/60 text-sm">暂无同步历史</p>
          ) : (
            <div className="space-y-3">
              {syncStatus?.is_running && (
                <label className="flex items-center gap-2 text-sm text-white/60">
                  <input
                    type="checkbox"
                    checked={autoScroll}
                    onChange={(e) => setAutoScroll(e.target.checked)}
                    className="rounded"
                  />
                  自动滚动到最新日志
                </label>
              )}
              
              <div ref={logViewerRef} className="max-h-96 overflow-y-auto space-y-2">
                {syncHistories.map((history) => (
                  <SyncHistoryItem
                    key={history.id}
                    history={history}
                    isExpanded={expandedHistoryId === history.id}
                    onToggle={() => toggleHistoryExpand(history.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </AdminCard>

        {/* Sync Settings Form */}
        <AdminCard title="同步设置">
          <div className="space-y-4">
            {/* Schedule Settings */}
            <div className="p-4 bg-white/5 rounded-lg space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="scheduleEnabled"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 bg-white/5 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                />
                <label htmlFor="scheduleEnabled" className="text-sm text-white">
                  启用每日定时同步
                </label>
              </div>
              
              {scheduleEnabled && (
                <div className="flex items-center gap-2 ml-7">
                  <span className="text-sm text-white/60">每天</span>
                  <select
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(parseInt(e.target.value))}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-white/30"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i} className="bg-neutral-800">
                        {i.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="text-white">:</span>
                  <select
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(parseInt(e.target.value))}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-white/30"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i} className="bg-neutral-800">
                        {i.toString().padStart(2, '0')}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-white/60">执行同步</span>
                </div>
              )}
              
              <p className="text-xs text-white/40 ml-7">
                {scheduleEnabled 
                  ? '启用后将在每天指定时间自动同步，忽略下方的间隔设置'
                  : '启用后可设置每天固定时间自动同步艺术家新发布'}
              </p>
            </div>

            <div className={scheduleEnabled ? 'opacity-50' : ''}>
              <label className="block text-sm text-white/60 mb-2">同步间隔（小时）</label>
              <input
                type="number"
                min="1"
                max="168"
                value={intervalHours}
                onChange={(e) => setIntervalHours(Math.max(1, Math.min(168, parseInt(e.target.value) || 1)))}
                disabled={scheduleEnabled}
                className="w-24 px-3 py-2 bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-white/30 disabled:cursor-not-allowed"
              />
              <p className="text-xs text-white/40 mt-1">每隔多少小时自动检查艺术家新发布（1-168 小时）</p>
            </div>

            <div>
              <label className="block text-sm text-white/60 mb-2">请求延迟（毫秒）</label>
              <input
                type="number"
                min="0"
                max="60000"
                step="100"
                value={requestDelayMs}
                onChange={(e) => setRequestDelayMs(Math.max(0, Math.min(60000, parseInt(e.target.value) || 0)))}
                className="w-32 px-3 py-2 bg-white/5 border border-white/10 rounded text-white focus:outline-none focus:border-white/30"
              />
              <p className="text-xs text-white/40 mt-1">每个艺术家请求之间的延迟，避免 API 限流（0-60000 毫秒）</p>
            </div>

            {syncSettings && (
              <div className="mt-4 p-4 bg-white/5 rounded-lg">
                <p className="text-sm text-white/60">当前设置：</p>
                <p className="text-sm text-white mt-1">
                  {syncSettings.schedule_enabled 
                    ? `每日定时同步: ${syncSettings.schedule_hour.toString().padStart(2, '0')}:${syncSettings.schedule_minute.toString().padStart(2, '0')}`
                    : `同步间隔: ${syncSettings.interval_hours} 小时`}
                  {' | '}请求延迟: {syncSettings.request_delay_ms} 毫秒
                </p>
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 rounded transition-colors"
              >
                {isSaving ? '保存中...' : '保存设置'}
              </button>
            </div>
          </div>
        </AdminCard>

        {/* Clear Snapshots */}
        <AdminCard title="清除艺术家快照">
          <p className="text-sm text-white/60 mb-4">
            清除所有艺术家快照数据。清除后，下次同步时所有艺术家都会被视为首次同步，不会生成新发布通知。
          </p>
          <button
            onClick={() => setClearSnapshotsDialogOpen(true)}
            disabled={isClearingSnapshots}
            className="px-4 py-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 rounded transition-colors"
          >
            {isClearingSnapshots ? '清除中...' : '清除快照'}
          </button>
        </AdminCard>

        {/* Info Section */}
        <AdminCard title="功能说明">
          <div className="space-y-3 text-sm text-white/60">
            <p>• 艺术家同步功能会定期检查关注艺术家的新发布（专辑/单曲）</p>
            <p>• 可选择每日定时同步（指定时间）或间隔同步（每隔N小时）</p>
            <p>• VIP 用户关注的艺术家会优先处理</p>
            <p>• 首次同步艺术家时不会生成通知，只记录当前发布列表</p>
            <p>• 后续同步时检测到新发布会为所有关注该艺术家的用户生成通知</p>
            <p>• 通知会在 30 天后自动清理</p>
          </div>
        </AdminCard>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={clearSnapshotsDialogOpen}
        title="确认清除快照"
        message={`确定要清除所有艺术家快照吗？当前共有 ${syncStatus?.snapshot_count || 0} 个快照。清除后下次同步不会生成新发布通知。`}
        confirmText="清除"
        cancelText="取消"
        onConfirm={async () => { setClearSnapshotsDialogOpen(false); await handleClearSnapshots(); }}
        onCancel={() => setClearSnapshotsDialogOpen(false)}
        isDestructive={true}
      />

      <ConfirmDialog
        isOpen={clearHistoryDialogOpen}
        title="确认清除历史"
        message={`确定要清除所有同步历史记录吗？当前共有 ${syncHistories.length} 条记录。此操作不可撤销。`}
        confirmText="清除"
        cancelText="取消"
        onConfirm={async () => { setClearHistoryDialogOpen(false); await handleClearHistory(); }}
        onCancel={() => setClearHistoryDialogOpen(false)}
        isDestructive={true}
      />
    </>
  );
}

// Sub-components
interface SyncHistoryItemProps {
  history: SyncHistoryResponse;
  isExpanded: boolean;
  onToggle: () => void;
}

function SyncHistoryItem({ history, isExpanded, onToggle }: SyncHistoryItemProps) {
  const statusColors: Record<string, string> = {
    running: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    failed: 'bg-red-500/20 text-red-400',
  };

  const statusLabels: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    failed: '失败',
  };

  return (
    <div className="bg-white/5 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-4">
          <span className={`px-2 py-0.5 rounded text-xs ${statusColors[history.status]}`}>
            {statusLabels[history.status]}
          </span>
          <span className="text-white text-sm">
            {new Date(history.started_at).toLocaleString('zh-CN')}
          </span>
          <span className="text-white/60 text-sm">
            处理 {history.processed_artists} 个艺术家 | 新发布 {history.new_releases} | 错误 {history.errors}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-white/60 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && history.logs && history.logs.length > 0 && (
        <div className="px-4 pb-3 border-t border-white/10">
          <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
            {history.logs.map((log, index) => (
              <LogEntry key={index} log={log} />
            ))}
          </div>
        </div>
      )}

      {isExpanded && (!history.logs || history.logs.length === 0) && (
        <div className="px-4 pb-3 border-t border-white/10">
          <p className="mt-3 text-white/40 text-sm">暂无详细日志</p>
        </div>
      )}
    </div>
  );
}

function LogEntry({ log }: { log: SyncLogEntryResponse }) {
  return (
    <div className={`text-xs px-2 py-1 rounded ${log.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
      <span className={log.status === 'success' ? 'text-green-400' : 'text-red-400'}>
        [{log.status === 'success' ? '✓' : '✗'}]
      </span>
      <span className="text-white ml-2">{log.artist_name}</span>
      {log.new_releases > 0 && (
        <span className="text-blue-400 ml-2">+{log.new_releases} 新发布</span>
      )}
      {log.error && (
        <span className="text-red-400 ml-2">{log.error}</span>
      )}
      <span className="text-white/40 ml-2">
        {new Date(log.processed_at).toLocaleTimeString('zh-CN')}
      </span>
    </div>
  );
}
