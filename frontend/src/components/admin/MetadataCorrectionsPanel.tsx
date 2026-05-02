import { useEffect, useMemo, useState } from 'react';
import {
  clearAdminMetadataCorrection,
  getAdminMetadataCorrection,
  search,
  updateAdminMetadataCorrection,
  type MetadataCorrectionPayload,
} from '../../api';
import { Album, Artist, MetadataOverrideMode } from '../../types';
import { AdminCard } from './common';

type EntityType = 'artist' | 'album';

type SearchItem = {
  id: string;
  name: string;
  subtitle?: string;
};

const OVERRIDE_OPTIONS: Array<{ value: MetadataOverrideMode; label: string; description: string }> = [
  { value: 'inherit', label: '继承用户设置', description: '按用户分类开关决定是否使用 Apple Music 展示增强。' },
  { value: 'force_local', label: '强制本地', description: '这个实体只展示本地元数据与手工修正。' },
  { value: 'prefer_am', label: '优先 Apple Music', description: '这个实体优先采用 Apple Music 展示字段，但音源仍固定为本地。' },
  { value: 'manual_override', label: '手工校对优先', description: '优先使用你保存的手工修正结果。' },
];

function toSearchItems(entityType: EntityType, artists: Artist[], albums: Album[]): SearchItem[] {
  if (entityType === 'artist') {
    return artists.map((artist) => ({
      id: artist.id,
      name: artist.name,
    }));
  }
  return albums.map((album) => ({
    id: album.id,
    name: album.name,
    subtitle: album.artistName,
  }));
}

function buildManualDraft(payload: MetadataCorrectionPayload | null): Record<string, string> {
  if (!payload) return {};

  const manualData = payload.manualData ?? {};
  if (payload.entityType === 'artist') {
    return {
      name: stringValue(manualData.name),
      artworkUrl: stringValue(manualData.artworkUrl),
      genres: arrayValue(manualData.genres).join(', '),
      motionVideoUrl: stringValue(manualData.motionVideoUrl),
      landscapeUrl: stringValue(manualData.landscapeUrl),
    };
  }

  return {
    name: stringValue(manualData.name),
    artworkUrl: stringValue(manualData.artworkUrl),
    releaseDate: stringValue(manualData.releaseDate),
    artistName: stringValue(manualData.artistName),
  };
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function buildManualPayload(entityType: EntityType, draft: Record<string, string>): Record<string, unknown> {
  if (entityType === 'artist') {
    return compactObject({
      name: draft.name,
      artworkUrl: draft.artworkUrl,
      genres: draft.genres
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      motionVideoUrl: draft.motionVideoUrl,
      landscapeUrl: draft.landscapeUrl,
    });
  }

  return compactObject({
    name: draft.name,
    artworkUrl: draft.artworkUrl,
    releaseDate: draft.releaseDate,
    artistName: draft.artistName,
  });
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (Array.isArray(entry)) {
        return entry.length > 0;
      }
      return typeof entry === 'string' ? entry.trim() !== '' : entry != null;
    })
  );
}

function StateBadge({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs ${
        active ? 'bg-green-500/20 text-green-200' : 'bg-white/10 text-white/45'
      }`}
    >
      {label}
    </span>
  );
}

export default function MetadataCorrectionsPanel() {
  const [entityType, setEntityType] = useState<EntityType>('artist');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);
  const [payload, setPayload] = useState<MetadataCorrectionPayload | null>(null);
  const [overrideMode, setOverrideMode] = useState<MetadataOverrideMode>('inherit');
  const [manualDraft, setManualDraft] = useState<Record<string, string>>({});
  const [manualMatchId, setManualMatchId] = useState('');
  const [loadingPayload, setLoadingPayload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setResults([]);
    setSelectedItem(null);
    setPayload(null);
    setQuery('');
    setError(null);
    setMessage(null);
  }, [entityType]);

  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const response = await search(keyword, entityType === 'artist' ? 'artists' : 'albums');
        if (cancelled) return;
        setResults(toSearchItems(entityType, response.artists, response.albums));
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '无法搜索本地实体');
      } finally {
        if (!cancelled) {
          setSearching(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [entityType, query]);

  const loadPayload = async (item: SearchItem) => {
    setSelectedItem(item);
    setLoadingPayload(true);
    setError(null);
    setMessage(null);

    try {
      const nextPayload = await getAdminMetadataCorrection(entityType, item.id);
      setPayload(nextPayload);
      setOverrideMode(nextPayload.overrideMode);
      setManualDraft(buildManualDraft(nextPayload));
      setManualMatchId(nextPayload.currentMatch?.id ?? nextPayload.local.appleMusicId ?? '');
    } catch (err) {
      setPayload(null);
      setError(err instanceof Error ? err.message : '无法加载元数据校对信息');
    } finally {
      setLoadingPayload(false);
    }
  };

  const refreshPayload = async () => {
    if (!selectedItem) return;
    await loadPayload(selectedItem);
  };

  const handleSaveManual = async () => {
    if (!payload || !selectedItem) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await updateAdminMetadataCorrection(entityType, selectedItem.id, {
        overrideMode,
        manualData: buildManualPayload(entityType, manualDraft),
      });
      setPayload(saved);
      setOverrideMode(saved.overrideMode);
      setManualDraft(buildManualDraft(saved));
      setMessage('手工修正已保存。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存手工修正失败');
    } finally {
      setSaving(false);
    }
  };

  const handleBindAppleMusicId = async (appleMusicId: string) => {
    if (!selectedItem) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await updateAdminMetadataCorrection(entityType, selectedItem.id, {
        appleMusicId,
      });
      setPayload(saved);
      setOverrideMode(saved.overrideMode);
      setManualDraft(buildManualDraft(saved));
      setManualMatchId(saved.currentMatch?.id ?? saved.local.appleMusicId ?? appleMusicId);
      setMessage('Apple Music 匹配已更新。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 Apple Music 匹配失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClearMatch = async () => {
    if (!selectedItem) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const saved = await updateAdminMetadataCorrection(entityType, selectedItem.id, {
        clearMatch: true,
      });
      setPayload(saved);
      setOverrideMode(saved.overrideMode);
      setManualDraft(buildManualDraft(saved));
      setManualMatchId('');
      setMessage('Apple Music 匹配已清除。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除 Apple Music 匹配失败');
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverrides = async () => {
    if (!selectedItem) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await clearAdminMetadataCorrection(entityType, selectedItem.id);
      await refreshPayload();
      setMessage('实体级覆盖与手工修正已清空。');
    } catch (err) {
      setError(err instanceof Error ? err.message : '清空覆盖失败');
    } finally {
      setSaving(false);
    }
  };

  const resolvedFields = useMemo(() => {
    if (!payload) return [];

    if (payload.entityType === 'artist') {
      return [
        ['名称', payload.resolved.name || '-'],
        ['头像/封面', payload.resolved.artworkUrl || '-'],
        ['风格', payload.resolved.genres?.join(', ') || '-'],
        ['Hero 视频', payload.resolved.motionVideoUrl || '-'],
        ['Hero 背景', payload.resolved.landscapeUrl || '-'],
      ];
    }

    return [
      ['名称', payload.resolved.name || '-'],
      ['封面', payload.resolved.artworkUrl || '-'],
      ['发行日期', payload.resolved.releaseDate || '-'],
      ['主艺人', payload.resolved.artistName || '-'],
    ];
  }, [payload]);

  return (
    <AdminCard title="元数据校对">
      <div className="space-y-6">
        <p className="text-sm text-white/60">
          本地播放永远只走本地音源。这里的校对只影响展示层，可以为本地艺人或专辑绑定 Apple Music 元数据、
          设置实体级覆盖策略，或者保存手工修正。
        </p>

        {error && (
          <div className="rounded-lg border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-green-500/35 bg-green-500/10 p-4 text-sm text-green-200">
            {message}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex gap-2">
              <ToggleTab
                active={entityType === 'artist'}
                onClick={() => setEntityType('artist')}
                label="艺人"
              />
              <ToggleTab
                active={entityType === 'album'}
                onClick={() => setEntityType('album')}
                label="专辑"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm text-white/60">搜索本地{entityType === 'artist' ? '艺人' : '专辑'}</label>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={entityType === 'artist' ? '输入艺人名' : '输入专辑名'}
                className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30"
              />
            </div>

            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {searching && <div className="text-sm text-white/45">搜索中...</div>}
              {!searching && results.length === 0 && query.trim().length >= 2 && (
                <div className="text-sm text-white/45">没有找到可校对的本地实体。</div>
              )}
              {results.map((item) => {
                const active = selectedItem?.id === item.id;
                return (
                  <button
                    key={`${entityType}-${item.id}`}
                    type="button"
                    onClick={() => loadPayload(item)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      active
                        ? 'border-green-500/45 bg-green-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-white/80 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-medium">{item.name}</div>
                    {item.subtitle && <div className="mt-1 text-xs text-white/50">{item.subtitle}</div>}
                    <div className="mt-2 text-xs text-white/35">本地 ID: {item.id}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            {!selectedItem && (
              <div className="py-14 text-center text-white/40">
                先在左侧搜索一个本地{entityType === 'artist' ? '艺人' : '专辑'}，再开始校对。
              </div>
            )}

            {selectedItem && loadingPayload && (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-500 border-t-transparent" />
              </div>
            )}

            {selectedItem && payload && !loadingPayload && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{selectedItem.name}</h3>
                    {selectedItem.subtitle && <p className="mt-1 text-sm text-white/55">{selectedItem.subtitle}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StateBadge label="Apple Music 已参与展示" active={payload.metadataState.usesAppleMusic} />
                    <StateBadge label="手工修正生效中" active={payload.metadataState.usesManualOverride} />
                    <StateBadge label={`来源: ${payload.metadataState.displaySource}`} active />
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ValuePanel title="本地值">
                    {payload.entityType === 'artist' ? (
                      <>
                        <FieldRow label="名称" value={payload.local.name || '-'} />
                        <FieldRow label="头像/封面" value={payload.local.artworkUrl || '-'} />
                        <FieldRow label="风格" value={payload.local.genres?.join(', ') || '-'} />
                        <FieldRow label="Hero 视频" value={payload.local.motionVideoUrl || '-'} />
                        <FieldRow label="Hero 背景" value={payload.local.landscapeUrl || '-'} />
                        <FieldRow label="AM 匹配" value={payload.local.appleMusicId || '-'} />
                      </>
                    ) : (
                      <>
                        <FieldRow label="名称" value={payload.local.name || '-'} />
                        <FieldRow label="封面" value={payload.local.artworkUrl || '-'} />
                        <FieldRow label="发行日期" value={payload.local.releaseDate || '-'} />
                        <FieldRow label="主艺人" value={payload.local.artistName || '-'} />
                        <FieldRow label="AM 匹配" value={payload.local.appleMusicId || '-'} />
                      </>
                    )}
                  </ValuePanel>

                  <ValuePanel title="当前最终展示值">
                    {resolvedFields.map(([label, value]) => (
                      <FieldRow key={label} label={label} value={value} />
                    ))}
                  </ValuePanel>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-3 text-sm font-medium text-white">实体级覆盖策略</div>
                  <div className="grid gap-2">
                    {OVERRIDE_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                          overrideMode === option.value
                            ? 'border-green-500/40 bg-green-500/10'
                            : 'border-white/10 bg-black/20 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="overrideMode"
                            value={option.value}
                            checked={overrideMode === option.value}
                            onChange={() => setOverrideMode(option.value)}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm font-medium text-white">{option.label}</div>
                            <div className="mt-1 text-xs leading-5 text-white/55">{option.description}</div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 text-sm font-medium text-white">手工修正字段</div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ManualField
                        label="名称"
                        value={manualDraft.name ?? ''}
                        onChange={(value) => setManualDraft((current) => ({ ...current, name: value }))}
                      />
                      <ManualField
                        label={payload.entityType === 'artist' ? '头像/封面 URL' : '封面 URL'}
                        value={manualDraft.artworkUrl ?? ''}
                        onChange={(value) => setManualDraft((current) => ({ ...current, artworkUrl: value }))}
                      />

                      {payload.entityType === 'artist' ? (
                        <>
                          <ManualField
                            label="Genres"
                            value={manualDraft.genres ?? ''}
                            onChange={(value) => setManualDraft((current) => ({ ...current, genres: value }))}
                            placeholder="Pop, Rock"
                          />
                          <ManualField
                            label="Hero 视频 URL"
                            value={manualDraft.motionVideoUrl ?? ''}
                            onChange={(value) => setManualDraft((current) => ({ ...current, motionVideoUrl: value }))}
                          />
                          <div className="md:col-span-2">
                            <ManualField
                              label="Hero 背景 URL"
                              value={manualDraft.landscapeUrl ?? ''}
                              onChange={(value) => setManualDraft((current) => ({ ...current, landscapeUrl: value }))}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <ManualField
                            label="发行日期"
                            value={manualDraft.releaseDate ?? ''}
                            onChange={(value) => setManualDraft((current) => ({ ...current, releaseDate: value }))}
                            placeholder="YYYY-MM-DD"
                          />
                          <ManualField
                            label="主艺人"
                            value={manualDraft.artistName ?? ''}
                            onChange={(value) => setManualDraft((current) => ({ ...current, artistName: value }))}
                          />
                        </>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleSaveManual}
                        disabled={saving}
                        className="rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-green-400 disabled:opacity-60"
                      >
                        {saving ? '保存中...' : '保存手工修正'}
                      </button>
                      <button
                        type="button"
                        onClick={handleClearOverrides}
                        disabled={saving}
                        className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:opacity-60"
                      >
                        清空实体覆盖
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4">
                    <div>
                      <div className="mb-3 text-sm font-medium text-white">Apple Music 匹配</div>
                      <FieldRow
                        label="当前候选"
                        value={payload.currentMatch ? `${payload.currentMatch.name} (${payload.currentMatch.id})` : '未绑定'}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs text-white/50">直接指定 Apple Music ID</label>
                      <div className="flex gap-2">
                        <input
                          value={manualMatchId}
                          onChange={(event) => setManualMatchId(event.target.value)}
                          placeholder="例如 123456789"
                          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30"
                        />
                        <button
                          type="button"
                          disabled={saving || manualMatchId.trim() === ''}
                          onClick={() => handleBindAppleMusicId(manualMatchId.trim())}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-60"
                        >
                          绑定
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={saving || !payload.currentMatch}
                        onClick={handleClearMatch}
                        className="mt-3 text-sm text-white/60 underline-offset-4 hover:text-white hover:underline disabled:opacity-40"
                      >
                        清除匹配
                      </button>
                    </div>

                    <div>
                      <div className="mb-2 text-xs text-white/50">Apple Music 候选</div>
                      <div className="max-h-[280px] space-y-2 overflow-y-auto">
                        {payload.candidates.length === 0 && (
                          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-white/40">
                            暂无候选，仍可手动输入 Apple Music ID 绑定。
                          </div>
                        )}
                        {payload.candidates.map((candidate) => (
                          <div key={candidate.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                            <div className="text-sm font-medium text-white">{candidate.name}</div>
                            {candidate.subtitle && <div className="mt-1 text-xs text-white/50">{candidate.subtitle}</div>}
                            {candidate.releaseDate && <div className="mt-1 text-xs text-white/45">发行日期: {candidate.releaseDate}</div>}
                            {candidate.genres && candidate.genres.length > 0 && (
                              <div className="mt-1 text-xs text-white/45">{candidate.genres.join(', ')}</div>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="truncate text-[11px] text-white/35">{candidate.id}</span>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleBindAppleMusicId(candidate.id)}
                                className="rounded-md border border-green-500/35 px-2.5 py-1 text-xs text-green-200 transition-colors hover:bg-green-500/10 disabled:opacity-60"
                              >
                                使用此候选
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminCard>
  );
}

function ToggleTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm transition-colors ${
        active ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

function ValuePanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 text-sm font-medium text-white">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 px-3 py-2">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 break-all text-sm text-white/85">{value}</div>
    </div>
  );
}

function ManualField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-white/50">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-sm text-white outline-none transition-colors focus:border-white/30"
      />
    </label>
  );
}
