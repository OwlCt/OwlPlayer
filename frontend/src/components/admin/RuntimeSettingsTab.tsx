import { FormEvent, useEffect, useState } from "react";
import {
  getAdminRuntimeSettings,
  updateAdminRuntimeSettings,
  type RuntimeSettingsEnvelope,
} from "../../api";
import {
  LOCAL_MEDIA_CLEANUP_POLICY_OPTIONS,
  LOCAL_MEDIA_SCAN_MODE_OPTIONS,
} from "../../utils/runtimeSettingsOptions";
import { ErrorAlert, LoadingSpinner } from "./common";
import FolderPickerModal from "./FolderPickerModal";
import Select from "./common/Select";
import ToggleField from "./common/ToggleField";

const inputClassName =
  "w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/30";

const DEFAULT_SETTINGS: Omit<RuntimeSettingsEnvelope, "metadata"> = {
  email: {
    smtp_host: "",
    smtp_port: 587,
    smtp_user: "",
    smtp_password: "",
    from_address: "",
    from_name: "",
    use_tls: false,
  },
  local_media: {
    enabled: true,
    roots: ["/music"],
    scan_mode: "startup-incremental",
    cleanup_policy: "mark-unavailable",
  },
  apple_music: {
    storefront: "",
    language: "",
    media_user_token: "",
    metadata_enhancement: false,
    lyrics_enhancement: false,
    match_threshold: 0.75,
  },
};

interface RuntimeSettingsTabProps {
  isAdmin: boolean;
  isActive: boolean;
}

export default function RuntimeSettingsTab({
  isAdmin,
  isActive,
}: RuntimeSettingsTabProps) {
  const [settings, setSettings] =
    useState<Omit<RuntimeSettingsEnvelope, "metadata">>(DEFAULT_SETTINGS);
  const [metadata, setMetadata] = useState<RuntimeSettingsEnvelope["metadata"] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newRoot, setNewRoot] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastBrowsedPath, setLastBrowsedPath] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (!isAdmin || !isActive) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await getAdminRuntimeSettings();
        if (!cancelled) {
          setSettings({
            email: next.email,
            local_media: next.local_media,
            apple_music: next.apple_music,
          });
          setMetadata(next.metadata);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载系统设置失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, isActive]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateAdminRuntimeSettings(settings);
      setSettings({
        email: saved.email,
        local_media: saved.local_media,
        apple_music: saved.apple_music,
      });
      setMetadata(saved.metadata);
      setSuccess(
        saved.metadata.restart_required
          ? "系统设置已保存。SMTP 立即生效，其它改动将在重启应用后生效。"
          : "系统设置已保存。",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存系统设置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const addRoot = (root: string) => {
    const trimmedRoot = root.trim();
    if (!trimmedRoot) {
      return;
    }

    setSettings((current) => {
      if (current.local_media.roots.includes(trimmedRoot)) {
        return current;
      }
      return {
        ...current,
        local_media: {
          ...current.local_media,
          roots: [...current.local_media.roots, trimmedRoot],
        },
      };
    });
  };

  const removeRoot = (indexToRemove: number) => {
    setSettings((current) => ({
      ...current,
      local_media: {
        ...current.local_media,
        roots: current.local_media.roots.filter(
          (_, index) => index !== indexToRemove,
        ),
      },
    }));
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      {success && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-green-500/40 bg-green-500/15 p-4 text-sm text-green-200">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="underline">
            关闭
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-10">
        <Section title="本地媒体库">
          <div className="space-y-4">
            <div className="divide-y divide-white/5 border-y border-white/5">
              <ToggleField
                label="启用本地媒体库"
                checked={settings.local_media.enabled}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    local_media: {
                      ...current.local_media,
                      enabled: checked,
                    },
                  }))
                }
              />
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm text-white/80">扫描模式</span>
                <Select<string>
                  options={LOCAL_MEDIA_SCAN_MODE_OPTIONS}
                  value={settings.local_media.scan_mode}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      local_media: {
                        ...current.local_media,
                        scan_mode: value,
                      },
                    }))
                  }
                  ariaLabel="扫描模式"
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-sm text-white/80">文件丢失时</span>
                <Select<string>
                  options={LOCAL_MEDIA_CLEANUP_POLICY_OPTIONS}
                  value={settings.local_media.cleanup_policy}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      local_media: {
                        ...current.local_media,
                        cleanup_policy: value,
                      },
                    }))
                  }
                  ariaLabel="文件丢失时"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-white/65">媒体根目录</div>

              <div className="space-y-1">
                {settings.local_media.roots.map((root, index) => (
                  <div
                    key={`${root}-${index}`}
                    className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"
                  >
                    <span className="flex-1 truncate text-sm text-white">
                      {root}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeRoot(index)}
                      className="text-xs text-white/55 hover:text-red-400"
                    >
                      移除
                    </button>
                  </div>
                ))}
                {settings.local_media.roots.length === 0 && (
                  <div className="rounded-md border border-dashed border-white/10 px-3 py-3 text-xs text-white/50">
                    尚未添加任何根目录
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newRoot}
                  onChange={(event) => setNewRoot(event.target.value)}
                  placeholder="例如 /music 或 D:\\Music"
                  className="flex-1 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && newRoot.trim()) {
                      event.preventDefault();
                      addRoot(newRoot.trim());
                      setNewRoot("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newRoot.trim()) {
                      addRoot(newRoot.trim());
                      setNewRoot("");
                    }
                  }}
                  disabled={!newRoot.trim()}
                  className="rounded-full border border-white/15 px-3 py-2 text-xs text-white hover:bg-white/5 disabled:opacity-50"
                >
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="rounded-full border border-white/15 px-3 py-2 text-xs text-white hover:bg-white/5"
                >
                  浏览
                </button>
              </div>
            </div>

            <FolderPickerModal
              isOpen={pickerOpen}
              initialPath={lastBrowsedPath}
              onClose={() => setPickerOpen(false)}
              onSelect={(picked) => {
                addRoot(picked);
                setLastBrowsedPath(picked);
              }}
            />

            <MetadataHint applyMode={metadata?.local_media.apply_mode} />
          </div>
        </Section>

        <Section title="Apple Music 增强">
          <div className="space-y-4">
            <div className="divide-y divide-white/5 border-y border-white/5">
              <ToggleField
                label="启用元数据增强"
                checked={settings.apple_music.metadata_enhancement}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    apple_music: {
                      ...current.apple_music,
                      metadata_enhancement: checked,
                      lyrics_enhancement: checked
                        ? current.apple_music.lyrics_enhancement
                        : false,
                    },
                  }))
                }
              />
              <ToggleField
                label="启用歌词增强"
                checked={settings.apple_music.lyrics_enhancement}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    apple_music: {
                      ...current.apple_music,
                      lyrics_enhancement: checked,
                      metadata_enhancement: checked
                        ? true
                        : current.apple_music.metadata_enhancement,
                    },
                  }))
                }
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="Storefront">
                <input
                  value={settings.apple_music.storefront}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      apple_music: {
                        ...current.apple_music,
                        storefront: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
              <FieldLabel label="Language">
                <input
                  value={settings.apple_music.language}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      apple_music: {
                        ...current.apple_music,
                        language: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
            </div>

            <FieldLabel label="Media User Token">
              <input
                type="password"
                value={settings.apple_music.media_user_token}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    apple_music: {
                      ...current.apple_music,
                      media_user_token: event.target.value,
                    },
                  }))
                }
                className={inputClassName}
              />
            </FieldLabel>

            <MetadataHint applyMode={metadata?.apple_music.apply_mode} />
          </div>
        </Section>

        <Section title="SMTP 邮件">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="SMTP Host">
                <input
                  value={settings.email.smtp_host}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      email: {
                        ...current.email,
                        smtp_host: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
              <FieldLabel label="SMTP Port">
                <input
                  type="number"
                  value={settings.email.smtp_port}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      email: {
                        ...current.email,
                        smtp_port: parseInt(event.target.value, 10) || 587,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="SMTP 用户名">
                <input
                  value={settings.email.smtp_user}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      email: {
                        ...current.email,
                        smtp_user: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
              <FieldLabel label="SMTP 密码">
                <input
                  type="password"
                  value={settings.email.smtp_password}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      email: {
                        ...current.email,
                        smtp_password: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FieldLabel label="发件邮箱">
                <input
                  value={settings.email.from_address}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      email: {
                        ...current.email,
                        from_address: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
              <FieldLabel label="发件人名称">
                <input
                  value={settings.email.from_name}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      email: {
                        ...current.email,
                        from_name: event.target.value,
                      },
                    }))
                  }
                  className={inputClassName}
                />
              </FieldLabel>
            </div>

            <div className="divide-y divide-white/5 border-y border-white/5">
              <ToggleField
                label="使用 TLS"
                checked={settings.email.use_tls}
                onChange={(checked) =>
                  setSettings((current) => ({
                    ...current,
                    email: {
                      ...current.email,
                      use_tls: checked,
                    },
                  }))
                }
              />
            </div>

            <MetadataHint applyMode={metadata?.email.apply_mode} />
          </div>
        </Section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
          >
            {isSaving ? "保存中..." : "保存系统设置"}
          </button>
        </div>
      </form>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {children}
    </section>
  );
}

function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/65">{label}</span>
      {children}
    </label>
  );
}

function MetadataHint({
  applyMode,
}: {
  applyMode?: string;
}) {
  return (
    <div className="text-xs text-white/45">
      生效方式：{applyMode === "restart_required" ? "重启后生效" : "立即生效"}
    </div>
  );
}
