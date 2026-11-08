import { ArrowLeft, Check, LockKeyhole, Mail } from 'lucide-react';
import { useState } from 'react';
import { asset } from '../lib/asset';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export function AuthPage({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    setMessage('');
    if (!supabase) return setError('Supabase 尚未配置');
    if (!email.includes('@') || password.length < 6) return setError('请输入有效邮箱和至少 6 位密码');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        onSuccess();
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() || '健康用户' } } });
        if (signUpError) throw signUpError;
        if (data.session) onSuccess();
        else setMessage('验证邮件已发送，完成后即可登录');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-content auth-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} />返回设置</button>
      <div className="auth-layout">
        <section className="auth-intro">
          <img src={asset('app-icon.png')} alt="Ai·健康" />
          <span className="section-kicker">YOUR HEALTH ACCOUNT</span>
          <h1>保存你的<br />健康轨迹。</h1>
          <div className="trial-number"><strong>24</strong><span>h</span></div>
          <p>新用户免费体验</p>
        </section>
        <section className="surface-card auth-form-card">
          <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>登录</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>注册</button></div>
          <h2>{mode === 'login' ? '欢迎回来' : '创建账户'}</h2>
          {mode === 'register' && <label><span>称呼</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="如何称呼你" /></label>}
          <label><span>邮箱</span><div className="input-with-icon"><Mail size={17} /><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></div></label>
          <label><span>密码</span><div className="input-with-icon"><LockKeyhole size={17} /><input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" onKeyDown={(event) => event.key === 'Enter' && submit()} /></div></label>
          {error && <div className="notice error-notice">{error}</div>}
          {message && <div className="notice success-notice"><Check size={16} />{message}</div>}
          <button className="button button-primary full-width" disabled={busy || !isSupabaseConfigured} onClick={submit}>{busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并开始体验'}</button>
          <p className="auth-disclaimer">仅提供健康管理建议，不替代医生诊断或治疗。</p>
        </section>
      </div>
    </div>
  );
}
