import { useState, FormEvent } from 'react';
import { useAuthStore } from '../../../store/authStore';
import api from '../../../api';

export function useEmailTab() {
  const { user, fetchCurrentUser } = useAuthStore();
  const [newEmail, setNewEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailStep, setEmailStep] = useState<'request' | 'verify'>('request');
  const [isChangingEmail, setIsChangingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleRequestEmailChange = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!newEmail.trim()) {
      setError('请输入新邮箱地址');
      return;
    }

    setIsChangingEmail(true);
    try {
      const response = await api.post<{ status: string; error?: { message: string } }>('/user/change-email', {
        new_email: newEmail,
      });

      if (response.data.status === 'error') {
        throw new Error(response.data.error?.message || '请求失败');
      }

      setSuccess('验证码已发送到新邮箱');
      setEmailStep('verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : '请求失败');
    } finally {
      setIsChangingEmail(false);
    }
  };

  const handleConfirmEmailChange = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!emailCode.trim()) {
      setError('请输入验证码');
      return;
    }

    setIsChangingEmail(true);
    try {
      const response = await api.post<{ status: string; error?: { message: string } }>('/user/confirm-email', {
        code: emailCode,
      });

      if (response.data.status === 'error') {
        throw new Error(response.data.error?.message || '验证失败');
      }

      setSuccess('邮箱更新成功');
      setNewEmail('');
      setEmailCode('');
      setEmailStep('request');
      await fetchCurrentUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证失败');
    } finally {
      setIsChangingEmail(false);
    }
  };

  const goBack = () => {
    setEmailStep('request');
    setError(null);
    setSuccess(null);
  };

  return {
    user,
    newEmail,
    setNewEmail,
    emailCode,
    setEmailCode,
    emailStep,
    isChangingEmail,
    error,
    success,
    handleRequestEmailChange,
    handleConfirmEmailChange,
    goBack,
    clearMessages: () => { setError(null); setSuccess(null); },
  };
}
