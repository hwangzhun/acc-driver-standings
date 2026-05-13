import React, { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { adminLogin } from '../services/standingsApi';

interface Props {
  onSuccess: () => void;
}

const LoginPage: React.FC<Props> = ({ onSuccess }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请检查密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
      <header className="bg-slate-950 border-b border-slate-800 p-6">
        <div className="max-w-[1800px] mx-auto">
          <h1 className="text-2xl font-black tracking-tighter text-white italic">
            ACC 管理后台
          </h1>
          <p className="text-xs text-slate-400 font-mono tracking-wider mt-0.5">
            ACC Racing Analytics · Admin Panel
          </p>
        </div>
      </header>

      <main className="flex-grow flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
            <div className="flex flex-col items-center mb-6">
              <div className="p-3 bg-slate-700 rounded-full mb-4">
                <Lock className="w-8 h-8 text-slate-300" />
              </div>
              <h2 className="text-xl font-bold text-white">管理员登录</h2>
              <p className="text-sm text-slate-400 mt-1">请输入管理员密码以继续</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="输入密码..."
                  autoFocus
                  disabled={loading}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 transition-colors text-center text-lg tracking-widest"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 rounded-lg bg-red-700 hover:bg-red-600 text-white text-base font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? '验证中...' : '登录'}
              </button>
            </form>
          </div>
        </div>
      </main>

      <footer className="bg-slate-950 text-slate-600 text-center p-4 text-xs border-t border-slate-900">
        ACC 成绩展示站 By Hwangzhun &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
};

export default LoginPage;
