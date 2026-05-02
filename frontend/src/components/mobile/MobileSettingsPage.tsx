import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import MobileHeader from "./MobileHeader";
import {
  FiChevronRight,
  FiMail,
  FiLock,
  FiDatabase,
  FiSettings,
  FiMusic,
} from "react-icons/fi";
import { MobileDebugPanel, useDebugTrigger } from "./MobileDebugPanel";
import { useManualOfflineMode } from "../../hooks/useOnlineStatus";
import { useBottomPadding } from "../../hooks/useBottomPadding";
import { getPlatformInfo } from "../../utils/audioSession";
import { usePlayerStore } from "../../store/playerStore";
import {
  getDownloadAudioQualityOption,
  getMobilePlaybackQuality,
  getMobilePlaybackQualityOption,
  loadDownloadAudioQuality,
} from "../../utils/playbackQuality";

// 版本号 - 用于触发调试面板
const APP_VERSION = __APP_VERSION__;

import OfflineModeIcon from "../icons/OfflineModeIcon";

const DEFAULT_AVATAR = "/api/avatars/default.svg";

/**
 * MobileSettingsPage - 移动端设置与隐私页面
 * 包含用户信息、账号设置、隐私设置、通知设置等子选项
 *
 * 调试功能：连续点击版本号 5 次可打开调试面板
 */
export default function MobileSettingsPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { isDebugOpen, handleTriggerClick, closeDebug } = useDebugTrigger();
  const { isManualOffline, setManualOffline } = useManualOfflineMode();
  const { paddingClass: bottomPaddingClass } = useBottomPadding();
  const iosHlsQuality = usePlayerStore((state) => state.iosHlsQuality);
  const desktopTranscodeQuality = usePlayerStore(
    (state) => state.desktopTranscodeQuality,
  );
  const platformInfo = getPlatformInfo();
  const showPlaybackQualitySettings =
    platformInfo.platform === "ios" || platformInfo.platform === "android";
  const currentPlaybackQuality = getMobilePlaybackQuality(
    platformInfo.platform,
    desktopTranscodeQuality,
    iosHlsQuality,
  );
  const currentDownloadAudioQuality = loadDownloadAudioQuality();
  const currentPlaybackQualityLabel = currentPlaybackQuality
    ? getMobilePlaybackQualityOption(currentPlaybackQuality).shortLabel
    : undefined;
  const currentDownloadAudioQualityLabel = getDownloadAudioQualityOption(
    currentDownloadAudioQuality,
  ).shortLabel;
  const audioQualitySubtitle = currentPlaybackQualityLabel
    ? `在线 ${currentPlaybackQualityLabel} · 缓存 ${currentDownloadAudioQualityLabel}`
    : `缓存 ${currentDownloadAudioQualityLabel}`;

  const avatarUrl = user?.avatar_url || DEFAULT_AVATAR;

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className={`min-h-screen bg-black ${bottomPaddingClass}`}>
      {/* Header */}
      <MobileHeader
        title="设置与隐私"
        opacity={1}
        backgroundColor="rgb(0, 0, 0)"
        showBackButton={true}
      />

      {/* Content with top padding for header */}
      <div
        className="pt-14"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      >
        {/* 用户信息区域 */}
        {isAuthenticated && user && (
          <button
            onClick={() => navigate("/profile")}
            className="flex items-center justify-between w-full px-4 py-4 active:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <img
                src={avatarUrl}
                alt={user.username}
                className="w-14 h-14 rounded-full object-cover bg-neutral-700"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
                }}
              />
              <div className="text-left">
                <div className="text-white font-semibold text-lg">
                  {user.username}
                </div>
                <div className="text-white/60 text-sm">查看个人资料</div>
              </div>
            </div>
            <FiChevronRight size={20} className="text-white/40" />
          </button>
        )}

        {/* 账号设置 */}
        <SettingsSection title="账号">
          <SettingsItem
            icon={<FiMail size={20} />}
            label="修改邮箱"
            onClick={() => navigate("/settings/email")}
          />
          <SettingsItem
            icon={<FiLock size={20} />}
            label="修改密码"
            onClick={() => navigate("/settings/password")}
          />
        </SettingsSection>

        {/* 通知 - temporarily hidden */}
        {/* <SettingsSection title="通知">
          <SettingsItem
            icon={<FiBell size={20} />}
            label="通知设置"
            onClick={() => navigate('/settings/notifications')}
          />
        </SettingsSection> */}

        {/* 网络 */}
        <SettingsSection title="网络">
          <SettingsToggleItem
            icon={<OfflineModeIcon size={20} />}
            label="离线模式"
            subtitle="开启后仅使用已缓存的内容"
            checked={isManualOffline}
            onChange={setManualOffline}
          />
        </SettingsSection>

        {showPlaybackQualitySettings && (
          <SettingsSection title="播放">
            <SettingsItem
              icon={<FiMusic size={20} />}
              label="音频质量"
              subtitle={audioQualitySubtitle}
              onClick={() => navigate("/settings/quality")}
            />
          </SettingsSection>
        )}

        {/* 数据管理 */}
        <SettingsSection title="数据管理">
          <SettingsItem
            icon={<FiDatabase size={20} />}
            label="数据管理"
            onClick={() => navigate("/settings/data")}
          />
        </SettingsSection>

        {/* 系统管理 - 仅管理员可见 */}
        {isAuthenticated && user?.is_admin && (
          <SettingsSection title="管理">
            <SettingsItem
              icon={<FiSettings size={20} />}
              label="系统管理"
              onClick={() => navigate("/admin")}
            />
          </SettingsSection>
        )}

        {/* 退出按钮 */}
        {isAuthenticated && (
          <div className="flex justify-center mt-12 px-4">
            <button
              onClick={handleLogout}
              className="px-12 py-3 rounded-full border border-white/30 text-white font-medium active:bg-white/10"
            >
              退出
            </button>
          </div>
        )}

        {/* 版本号 - 连续点击 5 次打开调试面板 */}
        <div className="flex justify-center mt-8 mb-4">
          <button
            onClick={handleTriggerClick}
            className="text-white/30 text-xs active:text-white/50"
          >
            版本 {APP_VERSION}
          </button>
        </div>
      </div>

      {/* 调试面板 */}
      <MobileDebugPanel isOpen={isDebugOpen} onClose={closeDebug} />
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="mt-6">
      <h3 className="px-4 text-white font-semibold text-base mb-2">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

interface SettingsItemProps {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
  subtitle?: string;
}

function SettingsItem({ icon, label, onClick, subtitle }: SettingsItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full px-4 py-3.5 active:bg-white/5"
    >
      <div className="flex items-center gap-3">
        {icon && <span className="text-white/70">{icon}</span>}
        <div className="text-left">
          <span className="text-white text-[15px]">{label}</span>
          {subtitle && <div className="text-white/50 text-sm">{subtitle}</div>}
        </div>
      </div>
      <FiChevronRight size={20} className="text-white/40" />
    </button>
  );
}

interface SettingsToggleItemProps {
  icon?: React.ReactNode;
  label: string;
  subtitle?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function SettingsToggleItem({
  icon,
  label,
  subtitle,
  checked,
  onChange,
  disabled = false,
}: SettingsToggleItemProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      className="flex items-center justify-between w-full px-4 py-3.5 active:bg-white/5 disabled:opacity-70"
    >
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {icon && <span className="text-white/70 flex-shrink-0">{icon}</span>}
        <div className="text-left min-w-0">
          <span className="text-white text-[15px]">{label}</span>
          {subtitle && <div className="text-white/50 text-sm">{subtitle}</div>}
        </div>
      </div>
      <span
        aria-hidden="true"
        className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ml-3 ${
          checked ? "bg-green-500" : "bg-white/20"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
