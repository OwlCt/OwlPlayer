import { useLocalLibraryAdmin } from './hooks/useLocalLibraryAdmin';
import { ErrorAlert, LoadingSpinner, StatCard } from './common';
import MetadataCorrectionsPanel from './MetadataCorrectionsPanel';

interface ScrapeTabProps {
  isAdmin: boolean;
  isActive: boolean;
}

export default function ScrapeTab({ isAdmin, isActive }: ScrapeTabProps) {
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
    runScrape,
  } = useLocalLibraryAdmin(isAdmin, isActive);

  if (isLoading) return <LoadingSpinner />;
  if (!overview) return <div className="py-12 text-center text-white/60">暂无刮削数据</div>;

  const scrapeStatus = overview.scrape_status;
  const progressRatio = scrapeStatus.total > 0 ? Math.min(100, Math.round((scrapeStatus.processed / scrapeStatus.total) * 100)) : 0;
  const disabled = !scrapeStatus.available || scrapeStatus.is_running;

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
          title="刮削概览"
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
                onClick={() => runScrape('unmatched')}
                disabled={disabled || actionLoading === 'scrape:unmatched'}
                className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                {actionLoading === 'scrape:unmatched' ? '启动中...' : '刮削未匹配'}
              </button>
              <button
                onClick={() => runScrape('all')}
                disabled={disabled || actionLoading === 'scrape:all'}
                className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
              >
                {actionLoading === 'scrape:all' ? '启动中...' : '全量重刮'}
              </button>
            </div>
          }
        >
          {!scrapeStatus.available ? (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
              {scrapeStatus.disabled_reason || '刮削功能当前不可用'}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="已匹配" value={overview.stats.matched_media} />
                <StatCard label="待刮削" value={overview.stats.unmatched_media} />
                <StatCard label="错误" value={overview.stats.errored_media} />
                <StatCard label="可用媒体" value={overview.stats.available_media} />
              </div>

              <div className="divide-y divide-white/5 border-y border-white/5">
                <Row label="元数据增强" value={overview.apple_music.metadata_enhancement ? '已启用' : '未启用'} />
                <Row label="歌词增强" value={overview.apple_music.lyrics_enhancement ? '已启用' : '未启用'} />
                <Row label="匹配阈值" value={overview.apple_music.match_threshold.toFixed(2)} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white/80">任务状态</span>
                  <span className="text-white/60">{scrapeStatus.is_running ? '运行中' : '空闲'}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${progressRatio}%` }} />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <StatCard small label="范围" value={scrapeStatus.scope === 'all' ? '全部媒体' : '未匹配媒体'} />
                  <StatCard small label="进度" value={`${scrapeStatus.processed}/${scrapeStatus.total}`} />
                  <StatCard small label="成功" value={String(scrapeStatus.succeeded)} />
                  <StatCard small label="失败" value={String(scrapeStatus.failed)} />
                </div>
                <div className="space-y-1 text-xs text-white/55">
                  <div>开始时间：{formatDateTime(scrapeStatus.started_at)}</div>
                  <div>结束时间：{formatDateTime(scrapeStatus.completed_at)}</div>
                  {scrapeStatus.current_media_id ? <div>当前媒体 ID：{scrapeStatus.current_media_id}</div> : null}
                  {scrapeStatus.last_error ? <div className="text-red-300">最近错误：{scrapeStatus.last_error}</div> : null}
                </div>
              </div>
            </div>
          )}
        </Section>

        <Section title="刮削说明">
          <div className="space-y-2 text-sm text-white/60">
            <p>• “刮削未匹配”只处理尚未匹配到 Apple Music 或曾经匹配失败的本地媒体。</p>
            <p>• “全量重刮”会重新遍历全部可用本地媒体，适合调整阈值或批量修复后使用。</p>
            <p>• 刮削只补充元数据，不影响本地媒体是否可播放。</p>
            <p>• 若未启用 Apple Music 元数据增强，刮削入口会保持禁用。</p>
          </div>
        </Section>

        <MetadataCorrectionsPanel />
      </div>
    </>
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
