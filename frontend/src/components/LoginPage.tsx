import { useState, FormEvent, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import VerificationCodeInput from './VerificationCodeInput';

type LoginMethod = 'password' | 'code';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, sendLoginCode, loginWithCode, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  // 已登录用户访问登录页面时跳转到主页
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);
  
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [localError, setLocalError] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!identifier.trim()) {
      setLocalError('请输入邮箱或用户名');
      return;
    }

    if (!password) {
      setLocalError('请输入密码');
      return;
    }

    try {
      await login(identifier, password);
      navigate('/');
    } catch {}
  };

  const handleSendCode = async () => {
    setLocalError(null);
    clearError();

    if (!identifier.trim()) {
      setLocalError('请输入邮箱地址');
      return;
    }

    try {
      await sendLoginCode(identifier);
      setCodeSent(true);
      setCooldown(60);
    } catch {}
  };

  const handleCodeLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!identifier.trim()) {
      setLocalError('请输入邮箱地址');
      return;
    }

    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      setLocalError('请输入完整的6位验证码');
      return;
    }

    try {
      await loginWithCode(identifier, fullCode);
      navigate('/');
    } catch {
      // Error handled by store
    }
  };

  const switchMethod = (method: LoginMethod) => {
    setLoginMethod(method);
    setLocalError(null);
    clearError();
    setPassword('');
    setCode(['', '', '', '', '', '']);
    setCodeSent(false);
    // Preserve email/identifier when switching
  };

  const displayError = localError || error;

  return (
    <div className="w-full">
      <div className="bg-neutral-900/80 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-white text-center mb-8">登录</h1>

        {/* Login method toggle */}
        <div className="flex mb-6 bg-neutral-800 rounded-lg p-1">
          <button
            type="button"
            onClick={() => switchMethod('password')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              loginMethod === 'password'
                ? 'bg-green-500 text-black'
                : 'text-white/60 hover:text-white'
            }`}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => switchMethod('code')}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
              loginMethod === 'code'
                ? 'bg-green-500 text-black'
                : 'text-white/60 hover:text-white'
            }`}
          >
            验证码登录
          </button>
        </div>

        {displayError && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm mb-6">
            {displayError}
          </div>
        )}

        {loginMethod === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-6">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-white/80 mb-2">
                邮箱或用户名
              </label>
              <input
                id="identifier"
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="输入邮箱或用户名"
                disabled={isLoading}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-white/80">
                  密码
                </label>
                <Link to="/forgot-password" className="text-sm text-green-500 hover:text-green-400">
                  忘记密码？
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="输入密码"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
            >
              {isLoading ? '登录中...' : '登录'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCodeLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white/80 mb-2">
                邮箱地址
              </label>
              <input
                id="email"
                type="email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                placeholder="输入邮箱地址"
                disabled={isLoading}
              />
            </div>

            {!codeSent ? (
              <>
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={isLoading}
                  className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
                >
                  {isLoading ? '发送中...' : '获取验证码'}
                </button>
              </>
            ) : (
              <>
                <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-200 text-sm">
                  验证码已发送至 <span className="text-white">{identifier}</span>
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

                <button
                  type="submit"
                  disabled={isLoading || code.join('').length !== 6}
                  className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
                >
                  {isLoading ? '登录中...' : '登录'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (cooldown === 0) {
                      setCodeSent(false);
                      setCode(['', '', '', '', '', '']);
                    }
                  }}
                  disabled={cooldown > 0}
                  className="w-full py-3 text-white/60 hover:text-white disabled:text-white/30 transition-colors"
                >
                  {cooldown > 0 ? `重新发送 (${cooldown}s)` : '重新发送验证码'}
                </button>
              </>
            )}
          </form>
        )}

        <div className="mt-8 text-center">
          <p className="text-white/60">
            还没有账号？{' '}
            <Link to="/register" className="text-white hover:text-green-500 underline">
              注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
