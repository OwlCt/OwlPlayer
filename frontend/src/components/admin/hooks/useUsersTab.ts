import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { User } from "../../../store/authStore";
import api, {
  createAdminUser,
  updateAdminUserEmail,
  AdminCreateUserInput,
} from "../../../api";

const LIMIT = 10;

function getRequestErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const responseMessage = err.response?.data?.error?.message;
    if (typeof responseMessage === "string" && responseMessage.trim() !== "") {
      return responseMessage;
    }
  }

  return err instanceof Error ? err.message : fallback;
}

export function useUsersTab(isAdmin: boolean, isActive: boolean) {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const totalPages = Math.ceil(total / LIMIT);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get<{
        success: boolean;
        users?: User[];
        pagination?: { total: number };
        error?: { message: string };
      }>(`/admin/users?page=${page}&limit=${LIMIT}`);

      if (!response.data.success) {
        throw new Error(response.data.error?.message || "获取用户列表失败");
      }

      setUsers(response.data.users || []);
      setTotal(response.data.pagination?.total || 0);
    } catch (err) {
      setError(getRequestErrorMessage(err, "获取用户列表失败"));
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    if (isAdmin && isActive) {
      fetchUsers();
    }
  }, [isAdmin, isActive, fetchUsers]);

  const handleActivate = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>(`/admin/users/${userId}/activate`);
      if (!response.data.success) {
        throw new Error(response.data.error?.message || "激活失败");
      }
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, is_active: true } : u)),
      );
    } catch (err) {
      setError(getRequestErrorMessage(err, "激活失败"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeactivate = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>(`/admin/users/${userId}/deactivate`);
      if (!response.data.success) {
        throw new Error(response.data.error?.message || "停用失败");
      }
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, is_active: false } : u)),
      );
    } catch (err) {
      setError(getRequestErrorMessage(err, "停用失败"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleGrantAdmin = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>(`/admin/users/${userId}/grant-admin`);
      if (!response.data.success) {
        throw new Error(response.data.error?.message || "授权失败");
      }
      setUsers((current) =>
        current.map((u) =>
          u.id === userId ? { ...u, is_admin: true, user_group: "vip" } : u,
        ),
      );
    } catch (err) {
      setError(getRequestErrorMessage(err, "授权失败"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeAdmin = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>(`/admin/users/${userId}/revoke-admin`);
      if (!response.data.success) {
        throw new Error(response.data.error?.message || "撤销失败");
      }
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, is_admin: false } : u)),
      );
    } catch (err) {
      setError(getRequestErrorMessage(err, "撤销失败"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const response = await api.delete<{
        success: boolean;
        error?: { message: string };
      }>(`/admin/users/${userId}`);
      if (!response.data.success) {
        throw new Error(response.data.error?.message || "删除失败");
      }
      setUsers((current) => current.filter((u) => u.id !== userId));
      setTotal((prev) => prev - 1);
    } catch (err) {
      setError(getRequestErrorMessage(err, "删除失败"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSetUserGroup = async (
    userId: string,
    group: "normal" | "vip",
  ) => {
    setActionLoading(userId);
    try {
      const response = await api.post<{
        success: boolean;
        error?: { message: string };
      }>(`/admin/users/${userId}/set-group`, { group });
      if (!response.data.success) {
        throw new Error(response.data.error?.message || "设置分组失败");
      }
      setUsers((current) =>
        current.map((u) => (u.id === userId ? { ...u, user_group: group } : u)),
      );
    } catch (err) {
      setError(getRequestErrorMessage(err, "设置分组失败"));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateUser = async (payload: AdminCreateUserInput) => {
    setActionLoading("create-user");
    setError(null);
    try {
      const createdUser = await createAdminUser(payload);
      setUsers((current) =>
        page === 1 ? [createdUser, ...current].slice(0, LIMIT) : current,
      );
      setTotal((prev) => prev + 1);
      return createdUser;
    } catch (err) {
      const message = getRequestErrorMessage(err, "创建用户失败");
      setError(message);
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateUserEmail = async (userId: string, email: string) => {
    setActionLoading(userId);
    setError(null);
    try {
      const updatedUser = await updateAdminUserEmail(userId, email);
      setUsers((current) =>
        current.map((user) => (user.id === userId ? updatedUser : user)),
      );
      return updatedUser;
    } catch (err) {
      const message = getRequestErrorMessage(err, "更新邮箱失败");
      setError(message);
      throw err;
    } finally {
      setActionLoading(null);
    }
  };

  return {
    users,
    total,
    page,
    setPage,
    totalPages,
    isLoading,
    error,
    setError,
    actionLoading,
    handleActivate,
    handleDeactivate,
    handleGrantAdmin,
    handleRevokeAdmin,
    handleDeleteUser,
    handleSetUserGroup,
    handleCreateUser,
    handleUpdateUserEmail,
    refreshUsers: fetchUsers,
  };
}
