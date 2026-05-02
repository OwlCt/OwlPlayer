import { useState, useRef, ChangeEvent } from 'react';
import { useAuthStore } from '../../../store/authStore';
import api from '../../../api';

export function useProfileTab() {
  const { user, fetchCurrentUser } = useAuthStore();
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('请选择有效的图片格式（JPEG、PNG、GIF、WebP）');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('图片大小不能超过5MB');
      return;
    }

    // Preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setAvatarPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    setError(null);
    setSuccess(null);
    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await api.put<{ success: boolean; avatar_url?: string; error?: { message: string } }>(
        '/user/avatar',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );

      if (!response.data.success) {
        throw new Error(response.data.error?.message || '上传失败');
      }

      setSuccess('头像更新成功');
      await fetchCurrentUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      setAvatarPreview(null);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return {
    user,
    avatarPreview,
    isUploadingAvatar,
    error,
    success,
    fileInputRef,
    handleAvatarClick,
    handleAvatarChange,
    clearMessages: () => { setError(null); setSuccess(null); },
  };
}
