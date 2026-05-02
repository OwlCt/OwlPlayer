import { useState, FormEvent, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function RegisterPage() {
  const navigate = useNavigate();
  const {
    register,
    isLoading,
    error,
    clearError,
    setPendingVerificationEmail,
    isAuthenticated,
  } = useAuthStore();

  // 已登录用户访问注册页面时跳转到主页
  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    if (!email.trim()) {
      setLocalError("请输入邮箱");
      return;
    }

    if (!validateEmail(email)) {
      setLocalError("请输入有效的邮箱地址");
      return;
    }

    if (!username.trim()) {
      setLocalError("请输入用户名");
      return;
    }

    if (username.length < 3) {
      setLocalError("用户名至少需要3个字符");
      return;
    }

    if (!password) {
      setLocalError("请输入密码");
      return;
    }

    if (password.length < 8) {
      setLocalError("密码至少需要8个字符");
      return;
    }

    if (password !== confirmPassword) {
      setLocalError("两次输入的密码不一致");
      return;
    }

    try {
      const verificationRequired = await register(email, username, password);
      if (verificationRequired) {
        setPendingVerificationEmail(email);
        navigate("/verify-email");
      } else {
        navigate("/login");
      }
    } catch {}
  };

  const displayError = localError || error;

  return (
    <div className="w-full">
      <div className="bg-neutral-900/80 backdrop-blur-sm rounded-xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold text-white text-center mb-8">注册</h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          {displayError && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-200 text-sm">
              {displayError}
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-white/80 mb-2"
            >
              邮箱
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

          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-white/80 mb-2"
            >
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder="输入用户名"
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-white/80 mb-2"
            >
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder="输入密码（至少8个字符）"
              disabled={isLoading}
            />
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-white/80 mb-2"
            >
              确认密码
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-neutral-800 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
              placeholder="再次输入密码"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-green-500/50 disabled:cursor-not-allowed text-black font-semibold rounded-full transition-colors"
          >
            {isLoading ? "注册中..." : "注册"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-white/60">
            已有账号？{" "}
            <Link
              to="/login"
              className="text-white hover:text-green-500 underline"
            >
              登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
