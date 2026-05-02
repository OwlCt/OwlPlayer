import { useState } from 'react';
import { useSyncTab } from '../admin/hooks/useSyncTab';
import MobileHeader from './MobileHeader';
import ConfirmDialog from '../ConfirmDialog';
import { FiChevronDown, FiChevronUp, FiCheck, FiX } from 'react-icons/fi';
import { SyncHistoryResponse, SyncLogEntryResponse } from '../../api';

interface MobileAdminSyncTabProps {
  isAdmin: boolean;
}

/**
 * MobileAdminSyncTab - 移动端艺术家同步页面
 */
export default function MobileAdminSyncTab({ isAdmin }: MobileAdminSyncTabProps) {
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
    handleSave,
    handleTriggerSync,
    handleRefreshStatus,
    handleClearSnapshots,
    handleClearHistory,
    handleResyncArtist,
    toggleHistoryExpand,
  } = useSyncTab(isAdmin, true);

  const [clearSnapshotsDialogOpen, setClearSnapshotsDialogOpen] = useState(false);
  const [clearHistoryDialogOpen, setClearHistoryDialogOpen] = useState(false);
  const [showArtists, setShowArtists] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black">
        <MobileHeader title="艺术家同步" opacity={1} backgroundColor="rgb(0, 0, 0)" showBackButton={true} />
        <div className="flex items-center justify-center pt-32">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-52">
      <MobileHeader title="艺术家同步" opacity={1} backgroundColor="rgb(0, 0, 0)" showBackButton={true} />

      <div className="pt-14 px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">关闭</button>
          </div>
        )}

        {/* Sync Status */}
        <MobileCard
          title="同步状态"
          action={
            <div className="flex gap-2">
              <button
                onClick={handleRefreshStatus}
                className="px-2.5 py-1.5 text-xs bg-white/10 text-white rounded active:bg-white/20"
              >
                刷新
              </button>
              <button
                onClick={handleTriggerSync}
                disabled={isTriggering || syncStatus?.is_running}
                className="px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded active:bg-blue-700 disabled:opacity-50"
              >
                {isTriggering ? '触发中...' : syncStatus?.is_running ? '同步中...' : '立即同步'}
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <StatItem
              label="同步状态"
              value={syncStatus?.is_running ? '运行中' : '空闲'}
              valueClassName={syncStatus?.is_running ? 'text-green-400' : 'text-white'}
            />
            <StatItem label="艺术家快照数" value={String(syncStatus?.snapshot_count || 0)} />
            <StatItem label="上次处理艺术家" value={String(syncStatus?.last_result?.processed_artists ?? '-')} />
            <StatItem label="上次耗时" value={syncStatus?.last_result?.duration || '-'} small />
          </div>
          {syncStatus?.last_result?.completed_at && (
            <div className="mt-3 text-xs text-white/50">
              上次同步: {new Date(syncStatus.last_result.completed_at).toLocaleString('zh-CN')}
            </div>
          )}
        </MobileCard>

        {/* Synced Artists */}
        <MobileCard title="已同步艺术家" className="mt-4">
          <button
            onClick={() => setShowArtists(!showArtists)}
            className="flex items-center justify-between w-full py-2"
          >
            <span className="text-white/60 text-sm">{syncedArtists.length} 个艺术家</span>
            {showArtists ? <FiChevronUp className="text-white/60" /> : <FiChevronDown className="text-white/60" />}
          </button>
          {showArtists && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
              {syncedArtists.map((artist) => (
                <div key={artist.artist_id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm truncate">{artist.artist_name}</div>
                    <div className="text-white/50 text-xs">
                      专辑: {artist.album_count} | 单曲: {artist.single_count}
                    </div>
                  </div>
                  <button
                    onClick={() => handleResyncArtist(artist.artist_id)}
                    disabled={resyncingArtistId === artist.artist_id}
                    className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded active:bg-blue-500/30 disabled:opacity-50"
                  >
                    {resyncingArtistId === artist.artist_id ? '...' : '重新同步'}
                  </button>
                </div>
              ))}
              {syncedArtists.length === 0 && (
                <p className="text-white/50 text-sm text-center py-4">暂无已同步的艺术家</p>
              )}
            </div>
          )}
        </MobileCard>

        {/* Sync History */}
        <MobileCard
          title="同步历史"
          className="mt-4"
          action={
            <button
              onClick={() => setClearHistoryDialogOpen(true)}
              disabled={isClearingHistory || syncHistories.length === 0}
              className="px-2.5 py-1.5 text-xs bg-red-500/20 text-red-400 rounded active:bg-red-500/30 disabled:opacity-50"
            >
              清除
            </button>
          }
        >
          {syncHistories.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-4">暂无同步历史</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {syncHistories.map((history) => (
                <SyncHistoryItem
                  key={history.id}
                  history={history}
                  isExpanded={expandedHistoryId === history.id}
                  onToggle={() => toggleHistoryExpand(history.id)}
                />
              ))}
            </div>
          )}
        </MobileCard>

        {/* Sync Settings */}
        <MobileCard title="同步设置" className="mt-4">
          <div className="space-y-5">
            {/* Schedule Settings */}
            <div className="p-3 bg-white/5 rounded-lg space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={scheduleEnabled}
                  onChange={(e) => setScheduleEnabled(e.target.checked)}
                  className="w-5 h-5 rounded border-white/20 bg-white/5 text-green-500"
                />
                <span className="text-sm text-white">启用每日定时同步</span>
              </label>
              
              {scheduleEnabled && (
                <div className="flex items-center gap-2 ml-8">
                  <span className="text-sm text-white/60">每天</span>
                  <select
                    value={scheduleHour}
                    onChange={(e) => setScheduleHour(parseInt(e.target.value))}
                    className="px-2 py-1.5 bg-neutral-800 border border-white/10 rounded text-white text-sm"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-white">:</span>
                  <select
                    value={scheduleMinute}
                    onChange={(e) => setScheduleMinute(parseInt(e.target.value))}
                    className="px-2 py-1.5 bg-neutral-800 border border-white/10 rounded text-white text-sm"
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Interval Hours */}
            <div className={scheduleEnabled ? 'opacity-50' : ''}>
              <label className="block text-sm text-white/60 mb-2">同步间隔（小时）</label>
              <input
                type="number"
                min="1"
                max="168"
                value={intervalHours}
                onChange={(e) => setIntervalHours(Math.max(1, Math.min(168, parseInt(e.target.value) || 1)))}
                disabled={scheduleEnabled}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white disabled:cursor-not-allowed"
              />
            </div>

            {/* Request Delay */}
            <div>
              <label className="block text-sm text-white/60 mb-2">请求延迟（毫秒）</label>
              <input
                type="number"
                min="0"
                max="60000"
                step="100"
                value={requestDelayMs}
                onChange={(e) => setRequestDelayMs(Math.max(0, Math.min(60000, parseInt(e.target.value) || 0)))}
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white"
              />
              <p className="text-xs text-white/40 mt-1.5">每个艺术家请求之间的延迟</p>
            </div>

            {/* Current Settings */}
            {syncSettings && (
              <div className="p-3 bg-white/5 rounded-lg">
                <p className="text-xs text-white/50">当前设置：</p>
                <p className="text-sm text-white mt-1">
                  {syncSettings.schedule_enabled 
                    ? `每日 ${syncSettings.schedule_hour.toString().padStart(2, '0')}:${syncSettings.schedule_minute.toString().padStart(2, '0')} 同步`
                    : `间隔 ${syncSettings.interval_hours} 小时`}
                  {' | '}延迟: {syncSettings.request_delay_ms}ms
                </p>
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="w-full py-3 bg-green-600 text-white font-medium rounded-lg active:bg-green-700 disabled:opacity-50"
            >
              {isSaving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </MobileCard>

        {/* Clear Snapshots */}
        <MobileCard title="清除艺术家快照" className="mt-4">
          <p className="text-sm text-white/60 mb-4">
            清除后，下次同步时所有艺术家都会被视为首次同步，不会生成新发布通知。
          </p>
          <button
            onClick={() => setClearSnapshotsDialogOpen(true)}
            disabled={isClearingSnapshots}
            className="w-full py-3 bg-red-600 text-white font-medium rounded-lg active:bg-red-700 disabled:opacity-50"
          >
            {isClearingSnapshots ? '清除中...' : '清除快照'}
          </button>
        </MobileCard>

        {/* Info Section */}
        <div className="bg-neutral-900 rounded-xl p-4 mt-4">
          <h3 className="text-white font-medium mb-3">功能说明</h3>
          <div className="space-y-2 text-sm text-white/60">
            <p>• 艺术家同步功能会定期检查关注艺术家的新发布</p>
            <p>• VIP 用户关注的艺术家会优先处理</p>
            <p>• 首次同步艺术家时不会生成通知</p>
            <p>• 通知会在 30 天后自动清理</p>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={clearSnapshotsDialogOpen}
        title="确认清除快照"
        message={`确定要清除所有艺术家快照吗？当前共有 ${syncStatus?.snapshot_count || 0} 个快照。`}
        confirmText="清除"
        cancelText="取消"
        onConfirm={async () => { setClearSnapshotsDialogOpen(false); await handleClearSnapshots(); }}
        onCancel={() => setClearSnapshotsDialogOpen(false)}
        isDestructive={true}
      />

      <ConfirmDialog
        isOpen={clearHistoryDialogOpen}
        title="确认清除历史"
        message={`确定要清除所有同步历史记录吗？当前共有 ${syncHistories.length} 条记录。`}
        confirmText="清除"
        cancelText="取消"
        onConfirm={async () => { setClearHistoryDialogOpen(false); await handleClearHistory(); }}
        onCancel={() => setClearHistoryDialogOpen(false)}
        isDestructive={true}
      />
    </div>
  );
}

// Reusable components
interface MobileCardProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

function MobileCard({ title, children, action, className = '' }: MobileCardProps) {
  return (
    <div className={`bg-neutral-900 rounded-xl p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

interface StatItemProps {
  label: string;
  value: string;
  valueClassName?: string;
  small?: boolean;
}

function StatItem({ label, value, valueClassName = 'text-white', small }: StatItemProps) {
  return (
    <div className="bg-white/5 rounded-lg p-2.5">
      <div className="text-white/60 text-xs mb-0.5">{label}</div>
      <div className={`${valueClassName} ${small ? 'text-sm' : 'text-base font-medium'}`}>{value}</div>
    </div>
  );
}

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
      <button onClick={onToggle} className="w-full p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${statusColors[history.status]}`}>
            {statusLabels[history.status]}
          </span>
          <span className="text-white/60 text-xs truncate">
            {new Date(history.started_at).toLocaleString('zh-CN')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/50 text-xs">
            {history.processed_artists}个 / +{history.new_releases}
          </span>
          {isExpanded ? <FiChevronUp className="text-white/60" /> : <FiChevronDown className="text-white/60" />}
        </div>
      </button>

      {isExpanded && history.logs && history.logs.length > 0 && (
        <div className="px-3 pb-3 border-t border-white/10">
          <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
            {history.logs.map((log, index) => (
              <LogEntry key={index} log={log} />
            ))}
          </div>
        </div>
      )}

      {isExpanded && (!history.logs || history.logs.length === 0) && (
        <div className="px-3 pb-3 border-t border-white/10">
          <p className="mt-2 text-white/40 text-xs">暂无详细日志</p>
        </div>
      )}
    </div>
  );
}

function LogEntry({ log }: { log: SyncLogEntryResponse }) {
  return (
    <div className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${log.status === 'success' ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
      {log.status === 'success' ? (
        <FiCheck className="text-green-400 flex-shrink-0" size={12} />
      ) : (
        <FiX className="text-red-400 flex-shrink-0" size={12} />
      )}
      <span className="text-white truncate">{log.artist_name}</span>
      {log.new_releases > 0 && (
        <span className="text-blue-400 flex-shrink-0">+{log.new_releases}</span>
      )}
    </div>
  );
}
