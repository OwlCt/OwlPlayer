import { describe, expect, it } from "vitest";
import { ADMIN_TABS, isAdminTab, resolveAdminTab } from "./adminTabs";

describe("adminTabs", () => {
  it("includes users, system, scan, and scrape admin workspaces", () => {
    expect(ADMIN_TABS.map((tab) => tab.id)).toEqual([
      "users",
      "system",
      "scan",
      "scrape",
    ]);
    expect(
      ADMIN_TABS.every(
        (tab) => tab.label.length > 0 && tab.description.length > 0,
      ),
    ).toBe(true);
  });

  it("recognizes valid admin tabs only", () => {
    expect(isAdminTab("users")).toBe(true);
    expect(isAdminTab("system")).toBe(true);
    expect(isAdminTab("scan")).toBe(true);
    expect(isAdminTab("scrape")).toBe(true);
    expect(isAdminTab("unknown")).toBe(false);
    expect(isAdminTab(undefined)).toBe(false);
  });

  it("resolves admin tab from pathname and falls back to users", () => {
    expect(resolveAdminTab("/admin/users")).toBe("users");
    expect(resolveAdminTab("/admin/system")).toBe("system");
    expect(resolveAdminTab("/admin/scan")).toBe("scan");
    expect(resolveAdminTab("/admin/scrape")).toBe("scrape");
    expect(resolveAdminTab("/admin")).toBe("users");
    expect(resolveAdminTab("/settings")).toBe("users");
  });
});
