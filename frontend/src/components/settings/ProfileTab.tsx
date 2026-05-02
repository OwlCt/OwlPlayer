import { useProfileTab } from './hooks';
import { SuccessAlert, ErrorAlert, FormInput } from './common';

const DEFAULT_AVATAR = '/api/avatars/default.svg';

export default function ProfileTab() {
  const {
    user,
    avatarPreview,
    isUploadingAvatar,
    error,
    success,
    fileInputRef,
    handleAvatarClick,
    handleAvatarChange,
  } = useProfileTab();

  if (!user) return null;

  const avatarUrl = avatarPreview || user.avatar_url || DEFAULT_AVATAR;

  return (
    <div className="space-y-6">
      {success && <SuccessAlert message={success} />}
      {error && <ErrorAlert message={error} />}

      {/* Avatar */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-4">头像</label>
        <div className="flex items-center gap-6">
          <div className="relative">
            <img
              src={avatarUrl}
              alt={user.username}
              className="w-24 h-24 rounded-full object-cover bg-neutral-700"
              onError={(e) => {
                (e.target as HTMLImageElement).src = DEFAULT_AVATAR;
              }}
            />
            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
          <div>
            <button
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:bg-white/5 text-white text-sm rounded-lg transition-colors"
            >
              更换头像
            </button>
            <p className="mt-2 text-xs text-white/40">支持 JPEG、PNG、GIF、WebP，最大 5MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Username (read-only) */}
      <FormInput
        id="username"
        label="用户名"
        value={user.username}
        readOnly
      />

      {/* Email (masked, read-only) */}
      <FormInput
        id="email"
        label="邮箱"
        value={user.email}
        readOnly
        hint="如需修改邮箱，请切换到「修改邮箱」标签"
      />
    </div>
  );
}
