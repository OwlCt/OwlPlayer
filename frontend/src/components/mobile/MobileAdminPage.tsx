import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronRight, FiRefreshCw, FiSettings, FiUsers } from "react-icons/fi";
import { HiOutlineSparkles } from "react-icons/hi2";
import MobileHeader from "./MobileHeader";
import { useAuthStore } from "../../store/authStore";
import { ADMIN_TABS, AdminTab } from "../admin/adminTabs";

const ICONS: Record<AdminTab, React.ReactNode> = {
  users: <FiUsers size={20} />,
  system: <FiSettings size={20} />,
  scan: <FiRefreshCw size={20} />,
  scrape: <HiOutlineSparkles size={20} />,
};

export default function MobileAdminPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    if (currentUser && !currentUser.is_admin) {
      navigate("/");
    }
  }, [currentUser, navigate]);

  if (!currentUser?.is_admin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-black pb-52">
      <MobileHeader
        title="系统管理"
        opacity={1}
        backgroundColor="rgb(0, 0, 0)"
        showBackButton={true}
      />

      <div
        className="pt-14"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      >
        <div className="px-4 py-4">
          <h1 className="mb-2 text-2xl font-bold text-white">系统管理</h1>
          <p className="text-sm text-white/60">
            管理用户、本地媒体扫描和元数据刮削。
          </p>
        </div>

        <div className="mt-2">
          {ADMIN_TABS.map((tab) => (
            <AdminMenuItem
              key={tab.id}
              icon={ICONS[tab.id]}
              label={tab.label}
              description={tab.description}
              onClick={() => navigate(`/admin/${tab.id}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface AdminMenuItemProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}

function AdminMenuItem({
  icon,
  label,
  description,
  onClick,
}: AdminMenuItemProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-4 py-4 active:bg-white/5"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/70">
          {icon}
        </div>
        <div className="text-left">
          <div className="font-medium text-white">{label}</div>
          <div className="text-sm text-white/50">{description}</div>
        </div>
      </div>
      <FiChevronRight size={20} className="text-white/40" />
    </button>
  );
}
