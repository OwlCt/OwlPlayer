import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import VerificationCodeInput from './VerificationCodeInput';

type Step = 'email' | 'verify' | 'success';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotPassword, resetPassword, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  // 已登录用户访问忘记密码页面时跳转到主页
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);
  
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleRequestCode = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError('请输入邮箱地址');
      return;
    }

    try {
      await forgotPassword(email);
      setStep('verify');
    } catch {}
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setLocalError('请输入完整的6位验证码');
      return;
    }

    if (!newPassword) {
      setLocalError('请输入新密码');
      return;
    }

    if (newPassword.length < 8) {
      setLocalError('密码至少需要8个字符');
      return;
    }

    if (newPassword !== confirmPassword) {
      setLocalError('两次输入的密码不一致');
      return;
    }

    try {
      await resetPassword(email, fullCode, newPassword);
      setStep('success');
    } catch {
      // Error handled by store
    }
  };

  const displayError = localError || error;

  if (step === 'success') {
    return (
      <div className="w-full">
        <div className="bg-neutral-900/80 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-white mb-4">密码重置成功</h1>
            <p className="text-white/60 mb-6">您的密码已成功重置，请使用新密码登录</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-full transition-colors"
            >
              返回登录
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="bg-neutral-900/80 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-white text-center mb-8">
          {step === 'email' ? '忘记密码' : '重置密码'}
        </h1>

        {step === 'email' && (
          <form onSubmit={handleRequestCode} className="space-y-6">
            {displayError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
                {displayError}
              </div>
            )}

            <p className="text-white/60 text-sm">
              请输入您的注册邮箱，我们将发送验证码帮助您重置密码
            </p>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="输入邮箱地址"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
            >
              {isLoading ? '发送中...' : '发送验证码'}
            </button>
          </form>
        )}

        {step === 'verify' && (
          <form onSubmit={handleResetPassword} className="space-y-6">
            {displayError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
                {displayError}
              </div>
            )}

            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-200 text-sm">
              验证码已发送至 <span className="text-white">{email}</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-4 text-center">
                输入6位验证码
              </label>
              <VerificationCodeInput
                value={code}
                onChange={setCode}
                disabled={isLoading}
                autoFocus
              />
            </div>

            <div className="text-center text-white/40 text-sm">
              验证码有效期为10分钟
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-white/80 mb-2">
                新密码
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="至少8个字符"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-white/80 mb-2">
                确认新密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="再次输入新密码"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || code.join('').length !== 6}
              className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
            >
              {isLoading ? '重置中...' : '重置密码'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode(['', '', '', '', '', '']);
                setNewPassword('');
                setConfirmPassword('');
                clearError();
              }}
              className="w-full py-3 text-white/60 hover:text-white transition-colors"
            >
              重新发送验证码
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link to="/login" className="text-white/60 hover:text-green-500 transition-colors">
            ← 返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
