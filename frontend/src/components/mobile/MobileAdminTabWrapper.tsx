import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import MobileAdminUsersTab from "./MobileAdminUsersTab";
import MobileAdminSystemTab from "./MobileAdminSystemTab";
import MobileAdminScanTab from "./MobileAdminScanTab";
import MobileAdminScrapeTab from "./MobileAdminScrapeTab";
import { AdminTab, isAdminTab } from "../admin/adminTabs";

export default function MobileAdminTabWrapper() {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab: string }>();
  const { user: currentUser } = useAuthStore();

  useEffect(() => {
    if (currentUser && !currentUser.is_admin) {
      navigate("/", { replace: true });
      return;
    }
    if (tab && !isAdminTab(tab)) {
      navigate("/admin", { replace: true });
    }
  }, [currentUser, tab, navigate]);

  if (!currentUser?.is_admin) {
    return null;
  }

  switch (tab as AdminTab) {
    case "users":
      return <MobileAdminUsersTab currentUser={currentUser} />;
    case "system":
      return <MobileAdminSystemTab isAdmin={currentUser.is_admin} />;
    case "scan":
      return <MobileAdminScanTab isAdmin={currentUser.is_admin} />;
    case "scrape":
      return <MobileAdminScrapeTab isAdmin={currentUser.is_admin} />;
    default:
      return null;
  }
}
