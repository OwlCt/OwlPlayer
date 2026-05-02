import { useState, FormEvent, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const { verifyEmail, resendCode, isLoading, error, clearError, pendingVerificationEmail } = useAuthStore();
  
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no pending email
  useEffect(() => {
    if (!pendingVerificationEmail) {
      navigate('/register');
    }
  }, [pendingVerificationEmail, navigate]);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle backspace
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      const newCode = [...code];
      for (let i = 0; i < pastedData.length; i++) {
        newCode[i] = pastedData[i];
      }
      setCode(newCode);
      // Focus the next empty input or the last one
      const nextEmptyIndex = newCode.findIndex(c => !c);
      inputRefs.current[nextEmptyIndex === -1 ? 5 : nextEmptyIndex]?.focus();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMessage(null);
    clearError();

    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setLocalError('请输入完整的6位验证码');
      return;
    }

    if (!pendingVerificationEmail) {
      setLocalError('验证邮箱信息丢失，请重新注册');
      return;
    }

    try {
      await verifyEmail(pendingVerificationEmail, fullCode);
      setSuccessMessage('邮箱验证成功！正在跳转到登录页面...');
      setTimeout(() => navigate('/login'), 2000);
    } catch {
      // Error is handled by the store
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0 || !pendingVerificationEmail) return;

    setLocalError(null);
    setSuccessMessage(null);
    clearError();

    try {
      await resendCode(pendingVerificationEmail);
      setSuccessMessage('验证码已重新发送到您的邮箱');
      setResendCooldown(60);
    } catch {
      // Error is handled by the store
    }
  };

  const displayError = localError || error;

  if (!pendingVerificationEmail) {
    return null;
  }

  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="bg-neutral-900 rounded-lg p-8">
          <h1 className="text-3xl font-bold text-white text-center mb-4">验证邮箱</h1>
          <p className="text-white/60 text-center mb-8">
            我们已向 <span className="text-white">{pendingVerificationEmail}</span> 发送了验证码
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {displayError && (
              <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
                {displayError}
              </div>
            )}

            {successMessage && (
              <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-200 text-sm">
                {successMessage}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-white/80 mb-4 text-center">
                输入6位验证码
              </label>
              <div className="flex justify-center gap-3" onPaste={handlePaste}>
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => { inputRefs.current[index] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleCodeChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    className="w-12 h-14 text-center text-2xl font-bold bg-neutral-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    disabled={isLoading}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || code.join('').length !== 6}
              className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
            >
              {isLoading ? '验证中...' : '验证'}
            </button>
          </form>

          <div className="mt-8 text-center">
            <p className="text-white/60">
              没有收到验证码？{' '}
              <button
                onClick={handleResendCode}
                disabled={resendCooldown > 0 || isLoading}
                className="text-white hover:text-green-500 underline disabled:text-white/40 disabled:no-underline disabled:cursor-not-allowed"
              >
                {resendCooldown > 0 ? `重新发送 (${resendCooldown}s)` : '重新发送'}
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-white/40 text-sm">
              验证码有效期为10分钟
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
