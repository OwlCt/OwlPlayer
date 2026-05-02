import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthLayout from "./AuthLayout";
import MobileHeader from "./mobile/MobileHeader";
import { useAuthStore } from "../store/authStore";
import { useIsMobile } from "../hooks/useIsMobile";
import {
  bootstrapSetupAdmin,
  getSetupStatus,
  saveSetupBootstrapConfig,
  saveSetupRuntimeSettings,
  testSetupDatabase,
  type BootstrapDatabaseSettings,
  type RuntimeSettingsEnvelope,
  type SetupStatus,
} from "../api";
import {
  LOCAL_MEDIA_CLEANUP_POLICY_OPTIONS,
  LOCAL_MEDIA_SCAN_MODE_OPTIONS,
} from "../utils/runtimeSettingsOptions";

type SetupStep = "database" | "admin" | "runtime" | "done";

const inputClassName =
  "w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500";
const selectClassName = `${inputClassName} [color-scheme:dark]`;
const secondaryButtonClassName =
  "w-full py-3 border border-white/15 hover:border-white/25 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-full transition-colors";
const primaryButtonClassName =
  "w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors";

interface SetupPageProps {
  onStatusChange?: (status: SetupStatus) => void;
}

function getInitialStep(status: SetupStatus | null): SetupStep {
  if (!status) return "database";
  if (status.state === "restart_required" || !status.setup_required) {
    return "done";
  }
  if (!status.database_connected) {
    return "database";
  }
  if (!status.has_initial_admin) {
    return "admin";
  }
  if (!status.runtime_configured) {
    return "runtime";
  }
  return "done";
}

function getDefaultRuntimeSettings(): Omit<RuntimeSettingsEnvelope, "metadata"> {
  return {
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
}

export default function SetupPage({ onStatusChange }: SetupPageProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const setAuthenticatedSession = useAuthStore(
    (state) => state.setAuthenticatedSession,
  );

  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<SetupStep>("database");
  const [useExternalDatabase, setUseExternalDatabase] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [database, setDatabase] = useState<BootstrapDatabaseSettings>({
    host: "postgres",
    port: 5432,
    user: "owlplayer",
    password: "",
    dbname: "owlplayer",
    sslmode: "disable",
  });
  const [dbTested, setDbTested] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState("");
  const [runtimeSettings, setRuntimeSettings] = useState<
    Omit<RuntimeSettingsEnvelope, "metadata">
  >(getDefaultRuntimeSettings());

  const requiresBootstrapToken = status?.bootstrap_token_required === true;

  const loadStatus = async () => {
    setIsLoading(true);
    try {
      const next = await getSetupStatus();
      setStatus(next);
      setStep(getInitialStep(next));
      setUseExternalDatabase(!next.database_connected);
      setDatabase((current) => ({
        ...current,
        host: next.database.host || current.host,
        port: next.database.port || current.port,
        user: next.database.user || current.user,
        dbname: next.database.dbname || current.dbname,
        sslmode: next.database.sslmode || current.sslmode,
      }));
      onStatusChange?.(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载初始化状态失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const stepIndex = useMemo(() => {
    switch (step) {
      case "database":
        return 0;
      case "admin":
        return 1;
      case "runtime":
        return 2;
      case "done":
      default:
        return 3;
    }
  }, [step]);

  const handleTestDatabase = async () => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      await testSetupDatabase(bootstrapToken, database);
      setDbTested(true);
      setSuccess("数据库连接测试成功");
    } catch (err) {
      setDbTested(false);
      setError(err instanceof Error ? err.message : "数据库连接测试失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDatabase = async () => {
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const next = await saveSetupBootstrapConfig(bootstrapToken, database);
      setStatus(next);
      onStatusChange?.(next);
      setSuccess("数据库配置已保存");
      setStep(next.has_initial_admin ? "runtime" : "admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存数据库配置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateAdmin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (adminPassword.length < 8) {
      setError("密码至少需要8个字符");
      return;
    }
    if (adminPassword !== adminPasswordConfirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setIsSaving(true);
    try {
      const result = await bootstrapSetupAdmin({
        bootstrap_token: bootstrapToken,
        email: adminEmail,
        username: adminUsername,
        password: adminPassword,
      });
      setAuthenticatedSession(result.user, result.token);
      setSuccess("初始管理员已创建");
      setStep("runtime");
      void loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建管理员失败");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveRuntime = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSaving(true);
    try {
      const saved = await saveSetupRuntimeSettings(bootstrapToken, runtimeSettings);
      setRuntimeSettings({
        email: saved.email,
        local_media: saved.local_media,
        apple_music: saved.apple_music,
      });
      setSuccess(
        saved.metadata.restart_required
          ? "运行期配置已保存，重启应用后生效"
          : "运行期配置已保存",
      );
      const next = await getSetupStatus();
      setStatus(next);
      onStatusChange?.(next);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存运行期配置失败");
    } finally {
      setIsSaving(false);
    }
  };

  const renderDatabaseStep = () => {
    const canUseCurrentDatabase =
      status?.database_connected && !useExternalDatabase;

    return (
      <div className="space-y-5">
        <SetupStepIndicator current={stepIndex} />
        <h1 className="text-3xl font-bold text-white text-center">
          初始化系统
        </h1>
        <p className="text-sm text-white/60 text-center">
          先确认数据库连接，再创建初始管理员与本地媒体配置。
        </p>

        {status?.database_connected && (
          <div className="rounded-lg border border-green-500/40 bg-green-500/15 p-4 text-sm text-green-200">
            当前 bootstrap 数据库已连通：{status.database.host}:
            {status.database.port}/{status.database.dbname}
          </div>
        )}

        {requiresBootstrapToken && (
          <div>
            <label
              htmlFor="bootstrap-token"
              className="block text-sm font-medium text-white/80 mb-2"
            >
              Bootstrap Token
            </label>
            <input
              id="bootstrap-token"
              type="password"
              value={bootstrapToken}
              onChange={(e) => setBootstrapToken(e.target.value)}
              className={inputClassName}
              placeholder="输入初始化令牌"
              disabled={isSaving}
            />
          </div>
        )}

        {status?.database_connected && (
          <button
            type="button"
            onClick={() => setUseExternalDatabase((current) => !current)}
            className={secondaryButtonClassName}
            disabled={isSaving}
          >
            {useExternalDatabase ? "改回当前数据库" : "切换到外部数据库"}
          </button>
        )}

        {useExternalDatabase || !status?.database_connected ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Host
                </label>
                <input
                  value={database.host}
                  onChange={(e) =>
                    setDatabase((current) => ({
                      ...current,
                      host: e.target.value,
                    }))
                  }
                  className={inputClassName}
                  disabled={isSaving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Port
                </label>
                <input
                  type="number"
                  value={database.port}
                  onChange={(e) =>
                    setDatabase((current) => ({
                      ...current,
                      port: parseInt(e.target.value, 10) || 5432,
                    }))
                  }
                  className={inputClassName}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  User
                </label>
                <input
                  value={database.user}
                  onChange={(e) =>
                    setDatabase((current) => ({
                      ...current,
                      user: e.target.value,
                    }))
                  }
                  className={inputClassName}
                  disabled={isSaving}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Database
                </label>
                <input
                  value={database.dbname}
                  onChange={(e) =>
                    setDatabase((current) => ({
                      ...current,
                      dbname: e.target.value,
                    }))
                  }
                  className={inputClassName}
                  disabled={isSaving}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Password
              </label>
              <input
                type="password"
                value={database.password}
                onChange={(e) =>
                  setDatabase((current) => ({
                    ...current,
                    password: e.target.value,
                  }))
                }
                className={inputClassName}
                disabled={isSaving}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                SSL Mode
              </label>
              <select
                value={database.sslmode}
                onChange={(e) =>
                  setDatabase((current) => ({
                    ...current,
                    sslmode: e.target.value,
                  }))
                }
                className={inputClassName}
                disabled={isSaving}
              >
                <option value="disable">disable</option>
                <option value="require">require</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleTestDatabase}
              disabled={isSaving}
              className={secondaryButtonClassName}
            >
              {isSaving ? "测试中..." : "测试连接"}
            </button>

            <button
              type="button"
              onClick={handleSaveDatabase}
              disabled={isSaving || !dbTested}
              className={primaryButtonClassName}
            >
              {isSaving ? "保存中..." : "保存数据库配置"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStep(status?.has_initial_admin ? "runtime" : "admin")}
            disabled={isSaving}
            className={primaryButtonClassName}
          >
            继续使用当前数据库
          </button>
        )}
      </div>
    );
  };

  const renderAdminStep = () => (
    <form onSubmit={handleCreateAdmin} className="space-y-5">
      <SetupStepIndicator current={stepIndex} />
      <h1 className="text-3xl font-bold text-white text-center">创建管理员</h1>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          邮箱
        </label>
        <input
          type="email"
          value={adminEmail}
          onChange={(e) => setAdminEmail(e.target.value)}
          className={inputClassName}
          disabled={isSaving}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          用户名
        </label>
        <input
          value={adminUsername}
          onChange={(e) => setAdminUsername(e.target.value)}
          className={inputClassName}
          disabled={isSaving}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          密码
        </label>
        <input
          type="password"
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
          className={inputClassName}
          disabled={isSaving}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          确认密码
        </label>
        <input
          type="password"
          value={adminPasswordConfirm}
          onChange={(e) => setAdminPasswordConfirm(e.target.value)}
          className={inputClassName}
          disabled={isSaving}
        />
      </div>
      <button type="submit" disabled={isSaving} className={primaryButtonClassName}>
        {isSaving ? "创建中..." : "创建初始管理员"}
      </button>
    </form>
  );

  const renderRuntimeStep = () => (
    <form onSubmit={handleSaveRuntime} className="space-y-6">
      <SetupStepIndicator current={stepIndex} />
      <h1 className="text-3xl font-bold text-white text-center">运行期配置</h1>

      <SetupSection title="本地媒体库" required>
        <label className="flex items-center gap-3 text-white">
          <input
            type="checkbox"
            checked={runtimeSettings.local_media.enabled}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                local_media: {
                  ...current.local_media,
                  enabled: e.target.checked,
                },
              }))
            }
          />
          启用本地媒体库
        </label>
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            根目录
          </label>
          <textarea
            value={runtimeSettings.local_media.roots.join("\n")}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                local_media: {
                  ...current.local_media,
                  roots: e.target.value
                    .split("\n")
                    .map((item) => item.trim())
                    .filter(Boolean),
                },
              }))
            }
            className={`${inputClassName} min-h-28`}
            disabled={isSaving}
          />
          <p className="mt-2 text-xs text-white/50">
            填写应用进程可见路径。Docker 默认通常是 <code>/music</code>。
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              扫描模式
            </label>
            <select
              value={runtimeSettings.local_media.scan_mode}
              onChange={(e) =>
                setRuntimeSettings((current) => ({
                  ...current,
                  local_media: {
                    ...current.local_media,
                    scan_mode: e.target.value,
                  },
                }))
              }
              className={selectClassName}
              disabled={isSaving}
            >
              {LOCAL_MEDIA_SCAN_MODE_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-neutral-900 text-white"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              文件丢失时
            </label>
            <select
              value={runtimeSettings.local_media.cleanup_policy}
              onChange={(e) =>
                setRuntimeSettings((current) => ({
                  ...current,
                  local_media: {
                    ...current.local_media,
                    cleanup_policy: e.target.value,
                  },
                }))
              }
              className={selectClassName}
              disabled={isSaving}
            >
              {LOCAL_MEDIA_CLEANUP_POLICY_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  className="bg-neutral-900 text-white"
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SetupSection>

      <SetupSection title="Apple Music 增强">
        <label className="flex items-center gap-3 text-white">
          <input
            type="checkbox"
            checked={runtimeSettings.apple_music.metadata_enhancement}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                apple_music: {
                  ...current.apple_music,
                  metadata_enhancement: e.target.checked,
                  lyrics_enhancement: e.target.checked
                    ? current.apple_music.lyrics_enhancement
                    : false,
                },
              }))
            }
          />
          启用元数据增强
        </label>
        <label className="flex items-center gap-3 text-white">
          <input
            type="checkbox"
            checked={runtimeSettings.apple_music.lyrics_enhancement}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                apple_music: {
                  ...current.apple_music,
                  lyrics_enhancement: e.target.checked,
                  metadata_enhancement: e.target.checked
                    ? true
                    : current.apple_music.metadata_enhancement,
                },
              }))
            }
          />
          启用歌词增强
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            placeholder="storefront"
            value={runtimeSettings.apple_music.storefront}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                apple_music: {
                  ...current.apple_music,
                  storefront: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
          <input
            placeholder="language"
            value={runtimeSettings.apple_music.language}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                apple_music: {
                  ...current.apple_music,
                  language: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
        </div>
        <input
          placeholder="media-user-token"
          value={runtimeSettings.apple_music.media_user_token}
          onChange={(e) =>
            setRuntimeSettings((current) => ({
              ...current,
              apple_music: {
                ...current.apple_music,
                media_user_token: e.target.value,
              },
            }))
          }
          className={inputClassName}
          disabled={isSaving}
        />
      </SetupSection>

      <SetupSection title="SMTP 邮件">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            placeholder="smtp-host"
            value={runtimeSettings.email.smtp_host}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  smtp_host: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
          <input
            type="number"
            placeholder="smtp-port"
            value={runtimeSettings.email.smtp_port}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  smtp_port: parseInt(e.target.value, 10) || 587,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            placeholder="smtp-user"
            value={runtimeSettings.email.smtp_user}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  smtp_user: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
          <input
            type="password"
            placeholder="smtp-password"
            value={runtimeSettings.email.smtp_password}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  smtp_password: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            placeholder="from-address"
            value={runtimeSettings.email.from_address}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  from_address: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
          <input
            placeholder="from-name"
            value={runtimeSettings.email.from_name}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  from_name: e.target.value,
                },
              }))
            }
            className={inputClassName}
            disabled={isSaving}
          />
        </div>
        <label className="flex items-center gap-3 text-white">
          <input
            type="checkbox"
            checked={runtimeSettings.email.use_tls}
            onChange={(e) =>
              setRuntimeSettings((current) => ({
                ...current,
                email: {
                  ...current.email,
                  use_tls: e.target.checked,
                },
              }))
            }
          />
          使用 TLS
        </label>
      </SetupSection>

      <button type="submit" disabled={isSaving} className={primaryButtonClassName}>
        {isSaving ? "保存中..." : "保存运行期配置"}
      </button>
    </form>
  );

  const renderDoneStep = () => (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold text-white text-center">初始化完成</h1>
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
        {status?.restart_required
          ? "初始化信息已保存。请重启应用后刷新此页面，新的数据库和运行期配置才会全部生效。"
          : "初始化已完成。"}
      </div>
      <button
        type="button"
        onClick={() => navigate("/")}
        className={primaryButtonClassName}
      >
        返回应用
      </button>
    </div>
  );

  const content = (
    <div className="w-full">
      <div className="bg-neutral-900/80 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm mb-6">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/20 border border-green-500/40 rounded-lg p-4 text-green-200 text-sm mb-6">
            {success}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && step === "database" && renderDatabaseStep()}
        {!isLoading && step === "admin" && renderAdminStep()}
        {!isLoading && step === "runtime" && renderRuntimeStep()}
        {!isLoading && step === "done" && renderDoneStep()}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="min-h-screen bg-black text-white">
        <MobileHeader
          title="初始化系统"
          opacity={1}
          backgroundColor="rgb(0, 0, 0)"
          showBackButton={false}
        />
        <div
          className="px-4 pb-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 72px)" }}
        >
          {content}
        </div>
      </div>
    );
  }

  return <AuthLayout>{content}</AuthLayout>;
}

function SetupSection({
  title,
  children,
  required = false,
}: {
  title: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/5 p-4 space-y-4">
      <div className="text-sm font-medium text-white">
        {title}
        {required && <span className="ml-2 text-green-400">必填</span>}
      </div>
      {children}
    </div>
  );
}

function SetupStepIndicator({ current }: { current: number }) {
  const steps = ["数据库", "管理员", "媒体库", "完成"];
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {steps.map((label, index) => (
        <div
          key={label}
          className={`rounded-full px-3 py-1 text-xs ${
            index <= current
              ? "bg-green-500 text-black"
              : "bg-white/10 text-white/50"
          }`}
        >
          {label}
        </div>
      ))}
    </div>
  );
}
