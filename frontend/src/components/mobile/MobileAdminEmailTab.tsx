import { FormEvent, useEffect, useState } from "react";
import {
  AdminEmailSettings,
  getAdminEmailSettings,
  updateAdminEmailSettings,
} from "../../api";
import MobileHeader from "./MobileHeader";

const DEFAULT_SETTINGS: AdminEmailSettings = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  from_address: "",
  from_name: "",
  use_tls: false,
};

interface MobileAdminEmailTabProps {
  isAdmin: boolean;
}

export default function MobileAdminEmailTab({
  isAdmin,
}: MobileAdminEmailTabProps) {
  const [settings, setSettings] =
    useState<AdminEmailSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) {
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
  }, [isAdmin]);

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

  return (
    <div className="min-h-screen bg-black pb-52">
      <MobileHeader
        title="邮件设置"
        opacity={1}
        backgroundColor="rgb(0, 0, 0)"
        showBackButton={true}
      />

      <div
        className="px-4 pt-14"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-200">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              关闭
            </button>
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-lg border border-green-500/50 bg-green-500/20 p-3 text-sm text-green-200">
            {success}
            <button onClick={() => setSuccess(null)} className="ml-2 underline">
              关闭
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pb-10">
            <MobileField
              label="SMTP Host"
              value={settings.smtp_host}
              onChange={(value) =>
                setSettings((current) => ({ ...current, smtp_host: value }))
              }
              placeholder="smtp.example.com"
            />
            <MobileField
              label="SMTP Port"
              value={String(settings.smtp_port)}
              onChange={(value) =>
                setSettings((current) => ({
                  ...current,
                  smtp_port: Number(value) || 0,
                }))
              }
              placeholder="587"
              type="number"
            />
            <MobileField
              label="SMTP 用户名"
              value={settings.smtp_user}
              onChange={(value) =>
                setSettings((current) => ({ ...current, smtp_user: value }))
              }
              placeholder="mailer@example.com"
            />
            <MobileField
              label="SMTP 密码"
              value={settings.smtp_password}
              onChange={(value) =>
                setSettings((current) => ({ ...current, smtp_password: value }))
              }
              placeholder="输入 SMTP 密码"
              type="password"
            />
            <MobileField
              label="发件邮箱"
              value={settings.from_address}
              onChange={(value) =>
                setSettings((current) => ({ ...current, from_address: value }))
              }
              placeholder="noreply@example.com"
              type="email"
            />
            <MobileField
              label="发件人名称"
              value={settings.from_name}
              onChange={(value) =>
                setSettings((current) => ({ ...current, from_name: value }))
              }
              placeholder="OwlPlayer"
            />

            <label className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-4 text-white">
              <span className="text-sm">强制使用 TLS</span>
              <input
                type="checkbox"
                checked={settings.use_tls}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    use_tls: event.target.checked,
                  }))
                }
                className="h-5 w-5 rounded border-white/20 bg-neutral-800"
              />
            </label>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-full bg-white py-3 text-sm font-medium text-black disabled:bg-white/40"
            >
              {isSaving ? "保存中..." : "保存设置"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

interface MobileFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function MobileField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: MobileFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/65">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-white/30"
      />
    </label>
  );
}
