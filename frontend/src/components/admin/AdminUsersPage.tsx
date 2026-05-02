import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import UsersTab from "./UsersTab";
import RuntimeSettingsTab from "./RuntimeSettingsTab";
import ScanTab from "./ScanTab";
import ScrapeTab from "./ScrapeTab";
import { ADMIN_TABS, resolveAdminTab } from "./adminTabs";

export default function AdminUsersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    if (currentUser && !currentUser.is_admin) {
      navigate("/");
    }
  }, [currentUser, navigate]);

  if (!currentUser?.is_admin) {
    return null;
  }

  const activeTab = resolveAdminTab(location.pathname);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-white">系统管理</h1>
          <p className="text-sm text-white/60">
            管理用户、系统设置、本地媒体扫描和元数据刮削任务。
          </p>
        </div>
      </div>

      <div className="mb-8 flex gap-4 border-b border-white/10">
        {ADMIN_TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => navigate(`/admin/${tab.id}`)}
              className={`pb-3 px-2 text-sm font-medium transition-colors ${
                isActive
                  ? "text-white border-b-2 border-green-500"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "users" && (
        <UsersTab currentUser={currentUser} isActive={true} />
      )}
      {activeTab === "system" && (
        <RuntimeSettingsTab isAdmin={currentUser.is_admin} isActive={true} />
      )}
      {activeTab === "scan" && (
        <ScanTab isAdmin={currentUser.is_admin} isActive={true} />
      )}
      {activeTab === "scrape" && (
        <ScrapeTab isAdmin={currentUser.is_admin} isActive={true} />
      )}
    </div>
  );
}
