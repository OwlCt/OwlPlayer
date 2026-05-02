export type AdminTab = "users" | "system" | "scan" | "scrape";

export interface AdminTabDefinition {
  id: AdminTab;
  label: string;
  description: string;
  mobileTitle: string;
}

export const ADMIN_TABS: AdminTabDefinition[] = [
  {
    id: "users",
    label: "用户管理",
    description: "管理系统用户",
    mobileTitle: "用户管理",
  },
  {
    id: "system",
    label: "系统设置",
    description: "配置本地媒体、Apple Music 增强和 SMTP",
    mobileTitle: "系统设置",
  },
  {
    id: "scan",
    label: "扫描",
    description: "扫描本地媒体库并查看任务历史",
    mobileTitle: "扫描管理",
  },
  {
    id: "scrape",
    label: "刮削",
    description: "执行 Apple Music 元数据刮削",
    mobileTitle: "刮削管理",
  },
];

export const DEFAULT_ADMIN_TAB: AdminTab = "users";

export function isAdminTab(value: string | undefined): value is AdminTab {
  return ADMIN_TABS.some((tab) => tab.id === value);
}

export function resolveAdminTab(pathname: string): AdminTab {
  const match = pathname.match(/\/admin\/([^/]+)/);
  const candidate = match?.[1];
  return isAdminTab(candidate) ? candidate : DEFAULT_ADMIN_TAB;
}
