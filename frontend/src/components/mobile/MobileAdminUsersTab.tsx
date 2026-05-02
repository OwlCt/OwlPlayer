import { FormEvent, useState } from "react";
import { User } from "../../store/authStore";
import { useUsersTab } from "../admin/hooks/useUsersTab";
import MobileHeader from "./MobileHeader";
import MobileMenu, { MobileMenuItem, MobileMenuDivider } from "./MobileMenu";
import MobileBottomSheet from "./MobileBottomSheet";
import ConfirmDialog from "../ConfirmDialog";
import Select from "../admin/common/Select";
import ToggleField from "../admin/common/ToggleField";
import { formatDate } from "../admin/common/utils";
import {
  FiEdit2,
  FiMail,
  FiMoreHorizontal,
  FiChevronLeft,
  FiChevronRight,
  FiPlus,
  FiUserCheck,
  FiUserX,
  FiShield,
  FiShieldOff,
  FiTrash2,
  FiStar,
  FiUser,
} from "react-icons/fi";

interface MobileAdminUsersTabProps {
  currentUser: User;
}

interface CreateUserFormState {
  email: string;
  username: string;
  password: string;
  is_active: boolean;
  is_admin: boolean;
  is_email_verified: boolean;
  user_group: "normal" | "vip";
}

const INITIAL_CREATE_FORM: CreateUserFormState = {
  email: "",
  username: "",
  password: "",
  is_active: true,
  is_admin: false,
  is_email_verified: true,
  user_group: "normal",
};

const GROUP_OPTIONS = [
  { value: "normal" as const, label: "普通" },
  { value: "vip" as const, label: "VIP" },
];

/**
 * MobileAdminUsersTab - 移动端用户管理页面
 */
export default function MobileAdminUsersTab({
  currentUser,
}: MobileAdminUsersTabProps) {
  const {
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
  } = useUsersTab(currentUser.is_admin, true);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [actionMenuUser, setActionMenuUser] = useState<User | null>(null);
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [emailSheetOpen, setEmailSheetOpen] = useState(false);
  const [createForm, setCreateForm] =
    useState<CreateUserFormState>(INITIAL_CREATE_FORM);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingEmail, setEditingEmail] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  const handleDeleteClick = (user: User) => {
    setActionMenuUser(null);
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setDeleteDialogOpen(false);
    await handleDeleteUser(userToDelete.id);
    setUserToDelete(null);
  };

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await handleCreateUser(createForm);
      setCreateForm(INITIAL_CREATE_FORM);
      setCreateSheetOpen(false);
      setSuccess("账号已创建");
    } catch {
      // Error surfaced by shared hook state.
    }
  };

  const openEmailSheet = (user: User) => {
    setActionMenuUser(null);
    setEditingUser(user);
    setEditingEmail(user.email);
    setEmailSheetOpen(true);
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    try {
      await handleUpdateUserEmail(editingUser.id, editingEmail);
      setEmailSheetOpen(false);
      setEditingUser(null);
      setEditingEmail("");
      setSuccess("邮箱已更新");
    } catch {
      // Error surfaced by shared hook state.
    }
  };

  const isCreating = actionLoading === "create-user";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black">
        <MobileHeader
          title="用户管理"
          opacity={1}
          backgroundColor="rgb(0, 0, 0)"
          showBackButton={true}
        />
        <div className="flex items-center justify-center pt-32">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-52">
      <MobileHeader
        title="用户管理"
        opacity={1}
        backgroundColor="rgb(0, 0, 0)"
        showBackButton={true}
      />

      <div
        className="pt-14"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 56px)" }}
      >
        {error && (
          <div className="mx-4 mb-4 flex items-center justify-between gap-4 rounded-lg border border-red-500/50 bg-red-500/20 p-3 text-sm text-red-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 underline">
              关闭
            </button>
          </div>
        )}
        {success && (
          <div className="mx-4 mb-4 flex items-center justify-between gap-4 rounded-lg border border-green-500/50 bg-green-500/20 p-3 text-sm text-green-200">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="shrink-0 underline">
              关闭
            </button>
          </div>
        )}

        <div className="px-4 pb-4">
          <button
            onClick={() => setCreateSheetOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-white py-3 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
          >
            <FiPlus size={18} />
            手动添加账号
          </button>
        </div>

        <div className="divide-y divide-white/5">
          {users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              isCurrentUser={user.id === currentUser.id}
              isLoading={actionLoading === user.id}
              onShowActions={() => setActionMenuUser(user)}
              onSetGroup={handleSetUserGroup}
            />
          ))}
        </div>

        {users.length === 0 && (
          <div className="py-12 text-center text-white/60">暂无用户数据</div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-white/10 px-4 py-4">
            <span className="text-sm text-white/60">共 {total} 个用户</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-full border border-white/15 p-2 text-white active:bg-white/5 disabled:opacity-30"
              >
                <FiChevronLeft size={20} className="text-white" />
              </button>
              <span className="px-2 text-sm text-white">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="rounded-full border border-white/15 p-2 text-white active:bg-white/5 disabled:opacity-30"
              >
                <FiChevronRight size={20} className="text-white" />
              </button>
            </div>
          </div>
        )}
      </div>

      <MobileMenu
        isOpen={!!actionMenuUser}
        onClose={() => setActionMenuUser(null)}
        header={
          actionMenuUser
            ? {
                artworkUrl: actionMenuUser.avatar_url || "/api/avatars/default",
                title: actionMenuUser.username,
                subtitle: actionMenuUser.email,
              }
            : undefined
        }
      >
        {actionMenuUser && (
          <>
            <MobileMenuItem
              icon={<FiMail size={20} />}
              label="修改邮箱"
              onClick={() => openEmailSheet(actionMenuUser)}
              disabled={actionLoading === actionMenuUser.id}
            />

            {actionMenuUser.is_active ? (
              <MobileMenuItem
                icon={<FiUserX size={20} />}
                label="停用账号"
                onClick={() => {
                  handleDeactivate(actionMenuUser.id);
                  setActionMenuUser(null);
                }}
                disabled={actionLoading === actionMenuUser.id}
              />
            ) : (
              <MobileMenuItem
                icon={<FiUserCheck size={20} />}
                label="激活账号"
                onClick={() => {
                  handleActivate(actionMenuUser.id);
                  setActionMenuUser(null);
                }}
                disabled={actionLoading === actionMenuUser.id}
              />
            )}

            {actionMenuUser.is_admin ? (
              <MobileMenuItem
                icon={<FiShieldOff size={20} />}
                label="撤销管理员"
                onClick={() => {
                  handleRevokeAdmin(actionMenuUser.id);
                  setActionMenuUser(null);
                }}
                disabled={actionLoading === actionMenuUser.id}
              />
            ) : (
              <MobileMenuItem
                icon={<FiShield size={20} />}
                label="设为管理员"
                onClick={() => {
                  handleGrantAdmin(actionMenuUser.id);
                  setActionMenuUser(null);
                }}
                disabled={actionLoading === actionMenuUser.id}
              />
            )}

            {actionMenuUser.user_group === "vip" ? (
              <MobileMenuItem
                icon={<FiUser size={20} />}
                label="降为普通用户"
                onClick={() => {
                  handleSetUserGroup(actionMenuUser.id, "normal");
                  setActionMenuUser(null);
                }}
                disabled={actionLoading === actionMenuUser.id}
              />
            ) : (
              <MobileMenuItem
                icon={<FiStar size={20} />}
                label="升级为 VIP"
                onClick={() => {
                  handleSetUserGroup(actionMenuUser.id, "vip");
                  setActionMenuUser(null);
                }}
                disabled={actionLoading === actionMenuUser.id}
              />
            )}

            <MobileMenuDivider />

            <MobileMenuItem
              icon={<FiTrash2 size={20} />}
              label="删除用户"
              onClick={() => handleDeleteClick(actionMenuUser)}
              disabled={actionLoading === actionMenuUser.id}
              danger
            />
          </>
        )}
      </MobileMenu>

      <MobileBottomSheet
        isOpen={createSheetOpen}
        onClose={() => setCreateSheetOpen(false)}
        title="手动添加账号"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4 px-4 py-4">
          <SheetField
            label="邮箱"
            value={createForm.email}
            onChange={(value) =>
              setCreateForm((current) => ({ ...current, email: value }))
            }
            placeholder="user@example.com"
            type="email"
          />
          <SheetField
            label="用户名"
            value={createForm.username}
            onChange={(value) =>
              setCreateForm((current) => ({ ...current, username: value }))
            }
            placeholder="输入用户名"
          />
          <SheetField
            label="初始密码"
            value={createForm.password}
            onChange={(value) =>
              setCreateForm((current) => ({ ...current, password: value }))
            }
            placeholder="至少 8 位"
            type="password"
          />

          <div className="divide-y divide-white/5 border-y border-white/5">
            <ToggleField
              label="创建后激活"
              checked={createForm.is_active}
              onChange={(checked) =>
                setCreateForm((current) => ({ ...current, is_active: checked }))
              }
            />
            <ToggleField
              label="设为管理员"
              checked={createForm.is_admin}
              onChange={(checked) =>
                setCreateForm((current) => ({
                  ...current,
                  is_admin: checked,
                  user_group: checked ? "vip" : current.user_group,
                }))
              }
            />
            <ToggleField
              label="标记为已验证"
              checked={createForm.is_email_verified}
              onChange={(checked) =>
                setCreateForm((current) => ({
                  ...current,
                  is_email_verified: checked,
                }))
              }
            />
            <div className="flex items-center justify-between gap-4 py-2">
              <span className="text-sm text-white/80">分组</span>
              <Select<"normal" | "vip">
                value={createForm.user_group}
                onChange={(value) =>
                  setCreateForm((current) => ({
                    ...current,
                    user_group: value,
                  }))
                }
                disabled={createForm.is_admin}
                options={GROUP_OPTIONS}
                ariaLabel="分组"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isCreating}
            className="w-full rounded-full bg-white py-3 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
          >
            {isCreating ? "创建中..." : "创建账号"}
          </button>
        </form>
      </MobileBottomSheet>

      <MobileBottomSheet
        isOpen={emailSheetOpen}
        onClose={() => {
          setEmailSheetOpen(false);
          setEditingUser(null);
        }}
        title="修改邮箱"
      >
        <form onSubmit={handleEmailSubmit} className="space-y-4 px-4 py-4">
          <div className="text-sm text-white/60">
            {editingUser ? `正在修改 ${editingUser.username} 的邮箱` : ""}
          </div>
          <SheetField
            label="新邮箱"
            value={editingEmail}
            onChange={setEditingEmail}
            placeholder="new@example.com"
            type="email"
          />
          <button
            type="submit"
            disabled={!editingUser || actionLoading === editingUser.id}
            className="w-full rounded-full bg-white py-3 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
          >
            {editingUser && actionLoading === editingUser.id
              ? "保存中..."
              : "保存邮箱"}
          </button>
        </form>
      </MobileBottomSheet>

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="确认删除用户"
        message={
          userToDelete
            ? `确定要删除用户 "${userToDelete.username}" 吗？此操作不可撤销。`
            : ""
        }
        confirmText="删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setUserToDelete(null);
        }}
        isDestructive={true}
      />
    </div>
  );
}

interface UserCardProps {
  user: User;
  isCurrentUser: boolean;
  isLoading: boolean;
  onShowActions: () => void;
  onSetGroup: (userId: string, group: "normal" | "vip") => Promise<void>;
}

function UserCard({
  user,
  isCurrentUser,
  isLoading,
  onShowActions,
  onSetGroup,
}: UserCardProps) {
  const emailLine = user.is_email_verified
    ? user.email
    : `${user.email} · 未验证`;
  const metaLine = [
    user.is_admin ? "管理员" : "普通用户",
    formatDate(user.created_at),
  ].join(" · ");

  return (
    <div className="group flex items-start gap-3 px-4 py-3 active:bg-white/5">
      <img
        src={user.avatar_url || "/api/avatars/default"}
        alt={user.username}
        className="h-10 w-10 shrink-0 rounded-full bg-neutral-700 object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${user.is_active ? "bg-green-400" : "bg-yellow-400"}`}
          />
          <span className="truncate text-sm font-medium text-white">
            {user.username}
          </span>
        </div>
        <div className="mt-0.5 break-words text-xs text-white/55">
          {emailLine}
        </div>
        <div className="text-xs text-white/45">{metaLine}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        {isCurrentUser && (
          <span className="px-2 text-xs text-white/40">当前用户</span>
        )}
        <Select<"normal" | "vip">
          value={user.user_group}
          onChange={(value) => onSetGroup(user.id, value)}
          disabled={isCurrentUser || isLoading}
          options={GROUP_OPTIONS}
          ariaLabel="用户分组"
          className={`min-w-[4.5rem] justify-between rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
            user.user_group === "vip"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-white/10 bg-transparent text-white/60"
          } ${isCurrentUser ? "opacity-60 cursor-not-allowed" : "active:border-white/30"} focus:border-white/40 focus:outline-none`}
        />
        <button
          type="button"
          onClick={onShowActions}
          disabled={isCurrentUser || isLoading}
          aria-hidden={isCurrentUser}
          tabIndex={isCurrentUser ? -1 : 0}
          className={`rounded-full p-1.5 text-white/55 active:bg-white/10 active:text-white ${
            isCurrentUser ? "invisible" : ""
          }`}
        >
          {isLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <FiMoreHorizontal size={18} />
          )}
        </button>
      </div>
    </div>
  );
}

interface SheetFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function SheetField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: SheetFieldProps) {
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
