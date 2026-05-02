import { FormEvent, useEffect, useState } from "react";
import {
  AdminEmailSettings,
  getAdminEmailSettings,
  updateAdminEmailSettings,
} from "../../api";
import { AdminCard, ErrorAlert, LoadingSpinner } from "./common";

const DEFAULT_SETTINGS: AdminEmailSettings = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  from_address: "",
  from_name: "",
  use_tls: false,
};

interface EmailSettingsTabProps {
  isAdmin: boolean;
  isActive: boolean;
}

export default function EmailSettingsTab({
  isAdmin,
  isActive,
}: EmailSettingsTabProps) {
  const [settings, setSettings] =
    useState<AdminEmailSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !isActive) {
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await getAdminEmailSettings();
        if (!cancelled) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...next,
            smtp_port: next.smtp_port || DEFAULT_SETTINGS.smtp_port,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "加载邮件设置失败");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = await updateAdminEmailSettings({
        ...settings,
        smtp_port: Number(settings.smtp_port),
      });
      setSettings(saved);
      setSuccess("邮件设置已保存并立即生效");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存邮件设置失败");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      {success && (
        <div className="mb-6 rounded-lg border border-green-500/50 bg-green-500/20 p-4 text-sm text-green-200">
          {success}
          <button onClick={() => setSuccess(null)} className="ml-4 underline">
            关闭
          </button>
        </div>
      )}

      <AdminCard title="SMTP 配置">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <FormField
              label="SMTP Host"
              value={settings.smtp_host}
              onChange={(value) =>
                setSettings((current) => ({ ...current, smtp_host: value }))
              }
              placeholder="smtp.example.com"
            />
            <FormField
              label="SMTP Port"
              type="number"
              value={String(settings.smtp_port)}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  smtp_port: Number(value) || 0,
                }))
              }
              placeholder="587"
            />
            <FormField
              label="SMTP 用户名"
              value={settings.smtp_user}
              onChange={(value) =>
                setSettings((current) => ({ ...current, smtp_user: value }))
              }
              placeholder="mailer@example.com"
            />
            <FormField
              label="SMTP 密码"
              type="password"
              value={settings.smtp_password}
              onChange={(value) =>
                setSettings((current) => ({ ...current, smtp_password: value }))
              }
              placeholder="输入 SMTP 密码"
            />
            <FormField
              label="发件邮箱"
              type="email"
              value={settings.from_address}
              onChange={(value) =>
                setSettings((current) => ({ ...current, from_address: value }))
              }
              placeholder="noreply@example.com"
            />
            <FormField
              label="发件人名称"
              value={settings.from_name}
              onChange={(value) =>
                setSettings((current) => ({ ...current, from_name: value }))
              }
              placeholder="OwlPlayer"
            />
          </div>

          <label className="flex items-center gap-3 text-sm text-white/80">
            <input
              type="checkbox"
              checked={settings.use_tls}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  use_tls: event.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-white/20 bg-neutral-800"
            />
            强制使用 TLS
          </label>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
            >
              {isSaving ? "保存中..." : "保存设置"}
            </button>
          </div>
        </form>
      </AdminCard>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: FormFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition-colors focus:border-white/30"
      />
    </label>
  );
}
