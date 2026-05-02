import { FormEvent, useMemo, useState } from "react";
import { User } from "../../store/authStore";
import { useUsersTab } from "./hooks/useUsersTab";
import { AdminCard, ErrorAlert, LoadingSpinner } from "./common";
import { formatDate } from "./common/utils";
import Select from "./common/Select";
import ToggleField from "./common/ToggleField";
import ConfirmDialog from "../ConfirmDialog";

interface UsersTabProps {
  currentUser: User;
  isActive: boolean;
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

export default function UsersTab({ currentUser, isActive }: UsersTabProps) {
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
  } = useUsersTab(currentUser.is_admin, isActive);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [createForm, setCreateForm] =
    useState<CreateUserFormState>(INITIAL_CREATE_FORM);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState("");

  const isCreating = actionLoading === "create-user";

  const createButtonLabel = useMemo(
    () => (isCreating ? "创建中..." : "创建账号"),
    [isCreating],
  );

  const handleDeleteClick = (user: User) => {
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
    setCreateSuccess(null);
    try {
      await handleCreateUser(createForm);
      setCreateForm(INITIAL_CREATE_FORM);
      setCreateSuccess("账号已创建");
    } catch {
      // Error surfaced by shared hook state.
    }
  };

  const startEditingEmail = (user: User) => {
    setEditingUserId(user.id);
    setEditingEmail(user.email);
  };

  const cancelEditingEmail = () => {
    setEditingUserId(null);
    setEditingEmail("");
  };

  const saveEditingEmail = async (userId: string) => {
    try {
      await handleUpdateUserEmail(userId, editingEmail);
      cancelEditingEmail();
    } catch {
      // Error surfaced by shared hook state.
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <>
      {error && <ErrorAlert message={error} onClose={() => setError(null)} />}
      {createSuccess && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-green-500/50 bg-green-500/20 p-4 text-sm text-green-200">
          <span>{createSuccess}</span>
          <button
            onClick={() => setCreateSuccess(null)}
            className="underline"
          >
            关闭
          </button>
        </div>
      )}

      <div className="space-y-6">
        <AdminCard title="手动添加账号">
          <form onSubmit={handleCreateSubmit} className="space-y-5">
            <div className="grid gap-5 md:grid-cols-3">
              <FormField
                label="邮箱"
                type="email"
                value={createForm.email}
                onChange={(value) =>
                  setCreateForm((current) => ({ ...current, email: value }))
                }
                placeholder="user@example.com"
              />
              <FormField
                label="用户名"
                value={createForm.username}
                onChange={(value) =>
                  setCreateForm((current) => ({ ...current, username: value }))
                }
                placeholder="输入用户名"
              />
              <FormField
                label="初始密码"
                type="password"
                value={createForm.password}
                onChange={(value) =>
                  setCreateForm((current) => ({ ...current, password: value }))
                }
                placeholder="至少 8 位"
              />
            </div>

            <div className="divide-y divide-white/5 border-y border-white/5">
              <ToggleField
                label="创建后激活"
                checked={createForm.is_active}
                onChange={(checked) =>
                  setCreateForm((current) => ({
                    ...current,
                    is_active: checked,
                  }))
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

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isCreating}
                className="rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/40"
              >
                {createButtonLabel}
              </button>
            </div>
          </form>
        </AdminCard>

        <div className="space-y-1">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              currentUserId={currentUser.id}
              actionLoading={actionLoading}
              isEditingEmail={editingUserId === user.id}
              editingEmail={editingEmail}
              onEditingEmailChange={setEditingEmail}
              onStartEmailEdit={startEditingEmail}
              onCancelEmailEdit={cancelEditingEmail}
              onSaveEmailEdit={saveEditingEmail}
              onActivate={handleActivate}
              onDeactivate={handleDeactivate}
              onGrantAdmin={handleGrantAdmin}
              onRevokeAdmin={handleRevokeAdmin}
              onDelete={handleDeleteClick}
              onSetGroup={handleSetUserGroup}
            />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onPageChange={setPage}
        />
      )}

      {users.length === 0 && (
        <div className="py-12 text-center text-white/60">暂无用户数据</div>
      )}

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="确认删除用户"
        message={
          userToDelete
            ? `确定要删除用户 "${userToDelete.username}" (${userToDelete.email}) 吗？此操作将永久删除该用户及其所有关联数据，无法恢复。`
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
    </>
  );
}

interface UserRowProps {
  user: User;
  currentUserId: string;
  actionLoading: string | null;
  isEditingEmail: boolean;
  editingEmail: string;
  onEditingEmailChange: (value: string) => void;
  onStartEmailEdit: (user: User) => void;
  onCancelEmailEdit: () => void;
  onSaveEmailEdit: (userId: string) => void;
  onActivate: (id: string) => void;
  onDeactivate: (id: string) => void;
  onGrantAdmin: (id: string) => void;
  onRevokeAdmin: (id: string) => void;
  onDelete: (user: User) => void;
  onSetGroup: (id: string, group: "normal" | "vip") => void;
}

function UserRow({
  user,
  currentUserId,
  actionLoading,
  isEditingEmail,
  editingEmail,
  onEditingEmailChange,
  onStartEmailEdit,
  onCancelEmailEdit,
  onSaveEmailEdit,
  onActivate,
  onDeactivate,
  onGrantAdmin,
  onRevokeAdmin,
  onDelete,
  onSetGroup,
}: UserRowProps) {
  const isCurrentUser = user.id === currentUserId;
  const isLoading = actionLoading === user.id;
  const emailLine = user.is_email_verified
    ? user.email
    : `${user.email} · 未验证`;
  const metaLine = [
    user.is_admin ? "管理员" : "普通用户",
    formatDate(user.created_at),
  ].join(" · ");

  return (
    <div className="group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-white/5">
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
        {isEditingEmail ? (
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="email"
              value={editingEmail}
              onChange={(event) => onEditingEmailChange(event.target.value)}
              className="w-full max-w-xs rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white outline-none focus:border-white/40"
            />
            <button
              type="button"
              onClick={() => onSaveEmailEdit(user.id)}
              disabled={isLoading}
              className="text-xs text-white transition-colors hover:text-white/80 disabled:opacity-50"
            >
              {isLoading ? "..." : "保存"}
            </button>
            <button
              type="button"
              onClick={onCancelEmailEdit}
              className="text-xs text-white/60 transition-colors hover:text-white"
            >
              取消
            </button>
          </div>
        ) : (
          <>
            <div className="mt-0.5 break-words text-xs text-white/55">
              {emailLine}
            </div>
            <div className="text-xs text-white/45">{metaLine}</div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isCurrentUser ? (
          <span className="px-2 text-xs text-white/40">当前用户</span>
        ) : (
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {!isEditingEmail && (
              <>
                <RowAction
                  onClick={() => onStartEmailEdit(user)}
                  disabled={isLoading}
                >
                  {isLoading ? "..." : "改邮箱"}
                </RowAction>
                <RowAction
                  onClick={() =>
                    user.is_active ? onDeactivate(user.id) : onActivate(user.id)
                  }
                  disabled={isLoading}
                >
                  {isLoading ? "..." : user.is_active ? "停用" : "激活"}
                </RowAction>
                <RowAction
                  onClick={() =>
                    user.is_admin
                      ? onRevokeAdmin(user.id)
                      : onGrantAdmin(user.id)
                  }
                  disabled={isLoading}
                >
                  {isLoading
                    ? "..."
                    : user.is_admin
                      ? "撤销管理员"
                      : "设为管理员"}
                </RowAction>
                <RowAction
                  onClick={() => onDelete(user)}
                  disabled={isLoading}
                  className="hover:!text-red-400"
                >
                  {isLoading ? "..." : "删除"}
                </RowAction>
              </>
            )}
          </div>
        )}
        <Select<"normal" | "vip">
          value={(user.user_group as "normal" | "vip") || "normal"}
          onChange={(value) => onSetGroup(user.id, value)}
          disabled={isLoading || isCurrentUser}
          options={GROUP_OPTIONS}
          ariaLabel="用户分组"
          className={`min-w-[4.5rem] justify-between rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed ${
            user.user_group === "vip"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-white/10 bg-transparent text-white/60"
          } ${isCurrentUser ? "opacity-60 cursor-not-allowed" : "hover:border-white/30"} focus:border-white/40 focus:outline-none`}
        />
      </div>
    </div>
  );
}

interface RowActionProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: string;
}

function RowAction({
  onClick,
  disabled = false,
  className = "",
  children,
}: RowActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 ${className}`.trim()}
    >
      {children}
    </button>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: PaginationProps) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <p className="text-sm text-white/60">
        共 {total} 个用户，第 {page} / {totalPages} 页
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
        >
          上一页
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:bg-white/5 disabled:text-white/30"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: FormFieldProps) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-white/70">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition-colors focus:border-white/30"
      />
    </label>
  );
}
