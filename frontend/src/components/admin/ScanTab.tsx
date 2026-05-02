import { useLocalLibraryAdmin } from './hooks/useLocalLibraryAdmin';
import { ErrorAlert, LoadingSpinner, StatCard } from './common';

interface ScanTabProps {
  isAdmin: boolean;
  isActive: boolean;
}

const SCAN_MODE_LABELS: Record<string, string> = {
  manual: '仅手动触发',
  'startup-full': '启动时全部重扫',
  'startup-incremental': '启动时扫描新文件',
  scheduled: '定时',
};

const CLEANUP_POLICY_LABELS: Record<string, string> = {
  'mark-unavailable': '保留记录，仅隐藏',
  'delete-missing': '直接删除记录',
};

const TASK_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '扫描中',
  completed: '已完成',
  partial: '部分完成',
  failed: '失败',
  stale: '已过期',
};

const TASK_STATUS_CLASSES: Record<string, string> = {
  queued: 'bg-yellow-500/20 text-yellow-300',
  running: 'bg-blue-500/20 text-blue-300',
  completed: 'bg-green-500/20 text-green-300',
  partial: 'bg-amber-500/20 text-amber-300',
  failed: 'bg-red-500/20 text-red-300',
  stale: 'bg-white/10 text-white/60',
};

export default function ScanTab({ isAdmin, isActive }: ScanTabProps) {
  const {
    overview,
    isLoading,
    isRefreshing,
    error,
    setError,
    message,
    setMessage,
    actionLoading,
    refreshOverview,
    runScan,
  } = useLocalLibraryAdmin(isAdmin, isActive);

  if (isLoading) return <LoadingSpinner />;
  if (!overview) return <div className="py-12 text-center text-white/60">暂无扫描数据</div>;

  const disableActions = !overview.enabled || overview.scan_running;

  return (
    <>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      {message && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-green-500/40 bg-green-500/15 p-4 text-sm text-green-200">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="underline">关闭</button>
        </div>
      )}

      <div className="space-y-10">
        <Section
          title="扫描概览"
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={refreshOverview}
                disabled={isRefreshing}
                className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {isRefreshing ? '刷新中...' : '刷新'}
              </button>
              <button
                onClick={() => runScan('incremental')}
                disabled={disableActions || actionLoading === 'scan:incremental'}
                className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {actionLoading === 'scan:incremental' ? '启动中...' : '增量扫描'}
              </button>
              <button
                onClick={() => runScan('full')}
                disabled={disableActions || actionLoading === 'scan:full'}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
              >
                {actionLoading === 'scan:full' ? '启动中...' : '全量扫描'}
              </button>
            </div>
          }
        >
          {!overview.enabled ? (
            <DisabledState reason={overview.disabled_reason || '本地媒体库未启用'} />
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="媒体数" value={overview.stats.media} />
                <StatCard label="可用媒体" value={overview.stats.available_media} />
                <StatCard label="文件数" value={overview.stats.files} />
                <StatCard label="可用文件" value={overview.stats.available_files} />
              </div>

              <div className="divide-y divide-white/5 border-y border-white/5">
                <Row
                  label="扫描模式"
                  value={SCAN_MODE_LABELS[overview.scan_mode] || overview.scan_mode}
                />
                <Row
                  label="文件丢失时"
                  value={CLEANUP_POLICY_LABELS[overview.cleanup_policy] || overview.cleanup_policy}
                />
                <Row
                  label="当前状态"
                  value={overview.scan_running ? '有扫描任务正在运行' : '空闲'}
                />
              </div>
            </div>
          )}
        </Section>

        <Section title="最近扫描任务">
          {overview.recent_scan_tasks.length === 0 ? (
            <p className="text-sm text-white/60">暂无扫描历史</p>
          ) : (
            <div className="space-y-3">
              {overview.recent_scan_tasks.map((task) => {
                const progress = `发现 ${task.files_discovered} / 新增 ${task.files_indexed} / 更新 ${task.files_updated} / 不可用 ${task.files_unavailable} / 错误 ${task.errors}`;

                return (
                  <div
                    key={task.id}
                    className="space-y-2 rounded-md border border-white/5 bg-white/[0.02] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${TASK_STATUS_CLASSES[task.status] || 'bg-white/10 text-white/70'}`}>
                        {TASK_STATUS_LABELS[task.status] || task.status}
                      </span>
                      <span className="text-xs text-white/45">
                        {formatDateTime(task.started_at || task.created_at)} → {task.completed_at ? formatDateTime(task.completed_at) : '进行中'}
                      </span>
                    </div>
                    <div className="text-sm text-white/85">{progress}</div>
                    {task.last_error && <div className="text-xs text-red-300">{task.last_error}</div>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/55">
                      <span>模式：{SCAN_MODE_LABELS[task.scan_mode] || task.scan_mode}</span>
                      <span>根目录：{task.library_root}</span>
                      <span>触发：{task.trigger_source}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

function DisabledState({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
      {reason}
    </div>
  );
}

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-white">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-white/80">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN');
}
