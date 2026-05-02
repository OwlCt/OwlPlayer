import { useState, FormEvent } from 'react';
import api from '../../../api';

export function usePasswordTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword) {
      setError('请输入当前密码');
      return;
    }

    if (!newPassword) {
      setError('请输入新密码');
      return;
    }

    if (newPassword.length < 6) {
      setError('新密码至少需要6个字符');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await api.post<{ status: string; error?: { message: string } }>('/user/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      if (response.data.status === 'error') {
        throw new Error(response.data.error?.message || '修改失败');
      }

      setSuccess('密码修改成功');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    isChangingPassword,
    error,
    success,
    handlePasswordChange,
    clearMessages: () => { setError(null); setSuccess(null); },
  };
}
