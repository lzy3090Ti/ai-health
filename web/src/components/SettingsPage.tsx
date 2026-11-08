import { Bluetooth, Copy, CreditCard, Download, Eye, FileJson, FolderInput, LogOut, Moon, Save, ShieldCheck, Sun, UploadCloud, UserRound, Watch } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS, LIMITATION_OPTIONS, SEX_OPTIONS } from '../data';
import { exportVault, importVaultFile, uploadWebDAV } from '../lib/store';
import { trialState } from '../lib/supabase';
import type { AccountProfile, ActivityLevelKey, AISettings, GoalKey, LimitationKey, SexKey, UserProfile, Vault } from '../types';

interface Props {
  vault: Vault;
  theme: string;
  user: User | null;
  profile: AccountProfile | null;
  demoMode: boolean;
  onToggleTheme: () => void;
  onSave: (settings: AISettings, targetSteps: number, profile: UserProfile, weight: number | null) => void;
  onImport: (vault: Vault) => void;
  onNotify: (message: string) => void;
  onOpenAuth: () => void;
  onSignOut: () => Promise<void>;
  onRequestTrial: () => Promise<void>;
  onPayDemo: () => void;
  onDemoModeChange: (enabled: boolean) => void;
}

type BluetoothNavigator = Navigator & { bluetooth?: { requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<unknown> } };

export function SettingsPage({ vault, theme, user, profile, demoMode, onToggleTheme, onSave, onImport, onNotify, onOpenAuth, onSignOut, onRequestTrial, onPayDemo, onDemoModeChange }: Props) {
  const importInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<AISettings>({ ...vault.settings });
  const [targetSteps, setTargetSteps] = useState(String(vault.activity.targetSteps));
  const [height, setHeight] = useState(String(vault.profile.height));
  const [weight, setWeight] = useState(() => {
    const latest = [...vault.metrics.weight].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    return latest ? String(latest.value) : '';
  });
  const [age, setAge] = useState(vault.profile.age ? String(vault.profile.age) : '');
  const [sex, setSex] = useState<SexKey | ''>(vault.profile.sex);
  const [limitation, setLimitation] = useState<LimitationKey | ''>(vault.profile.limitation || 'none');
  const [limitationNote, setLimitationNote] = useState(vault.profile.limitationNote || '');
  const [goal, setGoal] = useState<GoalKey | ''>(vault.profile.goal);
  const [activityLevel, setActivityLevel] = useState<ActivityLevelKey | ''>(vault.profile.activityLevel);
  const [busy, setBusy] = useState('');
  const trial = trialState(profile);

  const heightValue = Number(height);
  const weightValue = Number(weight);
  const liveBmi = heightValue >= 80 && heightValue <= 250 && weightValue >= 20 ? weightValue / (heightValue / 100) ** 2 : null;

  function patch<K extends keyof AISettings>(key: K, value: AISettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function composeProfile(): UserProfile {
    return {
      ...vault.profile,
      height: Number(height) || vault.profile.height,
      age: Number(age) || 0,
      sex,
      limitation: limitation || 'none',
      limitationNote: limitationNote.trim().slice(0, 120),
      goal,
      activityLevel,
    };
  }

  function validTargets() {
    const target = Number(targetSteps);
    const ageValue = Number(age || 0);
    const weightOk = weight === '' || (weightValue >= 20 && weightValue <= 300);
    const ageOk = age === '' || (ageValue >= 5 && ageValue <= 120);
    return target >= 1000 && target <= 50000 && heightValue >= 80 && heightValue <= 250 && weightOk && ageOk;
  }

  function save(silent = false) {
    if (!validTargets()) {
      onNotify('请检查身高、体重、年龄与每日步数目标');
      return false;
    }
    onSave(form, Number(targetSteps), composeProfile(), weight === '' ? null : weightValue);
    if (!silent) onNotify('设置已保存');
    return true;
  }

  function nextVault(): Vault {
    return { ...vault, settings: form, activity: { targetSteps: Number(targetSteps) }, profile: composeProfile() };
  }

  async function handleExport() {
    setBusy('export');
    try {
      onNotify(await exportVault(nextVault()));
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : '导出失败');
    } finally { setBusy(''); }
  }

  async function handleImport(file?: File) {
    if (!file || !window.confirm('导入会替换当前档案，是否继续？')) return;
    try {
      onImport(await importVaultFile(file));
      onNotify('健康档案已导入');
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : '无法导入档案');
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  }

  async function handleWebDAV() {
    if (!save(true)) return;
    setBusy('webdav');
    try {
      await uploadWebDAV(form, nextVault());
      onNotify('WebDAV 快照已上传');
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : 'WebDAV 暂时无法同步');
    } finally { setBusy(''); }
  }

  async function handleTrial() {
    setBusy('trial');
    try {
      await onRequestTrial();
      onNotify('24h 体验已开通');
    } catch (reason) {
      onNotify(reason instanceof Error ? reason.message : '暂时无法开通体验');
    } finally { setBusy(''); }
  }

  async function checkBluetooth() {
    if (Capacitor.isNativePlatform()) {
      onNotify('请进入静息心率页连接穿戴设备');
      return;
    }
    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!bluetooth) {
      onNotify('当前浏览器不支持 Web Bluetooth');
      return;
    }
    try {
      await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: ['battery_service'] });
      onNotify('蓝牙设备可用');
    } catch { onNotify('未选择蓝牙设备'); }
  }

  return (
    <div className="page-content settings-page">
      <header className="page-header"><span className="section-kicker">PREFERENCES</span><h1>设置</h1></header>

      <section className="surface-card settings-section account-section">
        <div className="settings-section-heading"><h2>账户与体验</h2><p>{user ? user.email : '登录后可使用报告解析'}</p></div>
        {user ? <div className="account-panel"><div className="account-avatar"><UserRound size={22} /></div><div><strong>{profile?.display_name || user.email}</strong><span>{trial.label}</span></div><button className="text-link" onClick={onSignOut}><LogOut size={15} />退出</button></div> : <button className="button button-primary full-width" onClick={onOpenAuth}><UserRound size={17} />登录 / 注册</button>}
        {user && !trial.active && profile && !profile.trial_ends_at && <button className="button button-secondary full-width" disabled={busy === 'trial'} onClick={handleTrial}>{busy === 'trial' ? '开通中…' : '申请 24h 免费体验'}</button>}
        <button className="button button-secondary full-width" onClick={onPayDemo}><CreditCard size={16} />缴费（演示）</button>
      </section>

      <section className={`surface-card settings-section demo-section ${demoMode ? 'demo-active' : ''}`}>
        <div className="settings-section-heading"><h2>演示模式</h2><p>{demoMode ? '正在显示演示数据' : '真实档案默认隐藏演示数据'}</p></div>
        <button className={`button full-width ${demoMode ? 'button-secondary' : 'button-primary'}`} onClick={() => onDemoModeChange(!demoMode)}><Eye size={17} />{demoMode ? '退出演示模式' : '进入演示模式'}</button>
      </section>

      <section className="surface-card settings-section profile-section">
        <div className="settings-section-heading"><h2>用户数据</h2><p>用于 BMI、评分与 AI 分析前提</p></div>
        <div className="form-grid two-columns">
          <label><span>身高（cm）</span><input type="number" step="any" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
          <label><span>体重（kg）</span><input type="number" step="any" value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="例如 68.5" /></label>
        </div>
        <div className="form-grid two-columns">
          <label><span>年龄</span><input type="number" value={age} onChange={(event) => setAge(event.target.value)} placeholder="例如 28" /></label>
          <label><span>性别</span><select value={sex} onChange={(event) => setSex(event.target.value as SexKey | '')}><option value="">未填写</option>{SEX_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <div className="form-grid two-columns">
          <label><span>训练目标</span><select value={goal} onChange={(event) => setGoal(event.target.value as GoalKey | '')}><option value="">未填写</option>{GOAL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span>日常活动量</span><select value={activityLevel} onChange={(event) => setActivityLevel(event.target.value as ActivityLevelKey | '')}><option value="">未填写</option>{ACTIVITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        <label><span>身体情况（有无残缺或运动限制）</span><select value={limitation} onChange={(event) => setLimitation(event.target.value as LimitationKey | '')}>{LIMITATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label><span>补充说明</span><input value={limitationNote} onChange={(event) => setLimitationNote(event.target.value)} placeholder="例如：左膝术后，避免深蹲与跳跃" maxLength={120} /></label>
        <p className="profile-hint">{liveBmi ? <>当前 BMI <strong>{liveBmi.toFixed(1)}</strong>，AI 分析会参考这项数据与身体限制</> : '填写身高与体重后自动计算 BMI，AI 分析会参考这些信息'}</p>
      </section>

      <section className="surface-card settings-section"><div className="settings-section-heading"><h2>健康目标</h2></div><label><span>每日步数目标</span><input type="number" value={targetSteps} onChange={(event) => setTargetSteps(event.target.value)} /></label></section>

      <section className="surface-card settings-section"><div className="settings-section-heading"><h2>健康档案</h2></div><div className="file-format-card"><span><FileJson size={28} /></span><div><strong>health.vault.json</strong><p>结构化档案</p></div><div><strong>健康档案.md</strong><p>Markdown 表格</p></div></div><div className="settings-actions three-buttons"><button className="button button-secondary" disabled={busy === 'export'} onClick={handleExport}><Download size={16} />导出</button><button className="button button-secondary" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(nextVault(), null, 2)); onNotify('JSON 备份已复制'); }}><Copy size={16} />复制</button><button className="button button-secondary" onClick={() => importInput.current?.click()}><FolderInput size={16} />导入</button></div><input ref={importInput} hidden type="file" accept=".json,application/json" onChange={(event) => handleImport(event.target.files?.[0])} /></section>

      <section className="surface-card settings-section"><div className="settings-section-heading"><h2>WebDAV</h2></div><label><span>HTTPS 目录地址</span><input value={form.webdavUrl} onChange={(event) => patch('webdavUrl', event.target.value)} placeholder="https://your-server.com/dav/health" /></label><div className="form-grid two-columns"><label><span>用户名</span><input value={form.webdavUser} onChange={(event) => patch('webdavUser', event.target.value)} /></label><label><span>密码</span><input type="password" value={form.webdavPassword} onChange={(event) => patch('webdavPassword', event.target.value)} /></label></div><button className="button button-secondary full-width" disabled={busy === 'webdav'} onClick={handleWebDAV}><UploadCloud size={17} />{busy === 'webdav' ? '上传中…' : '上传快照'}</button></section>

      <section className="surface-card settings-section"><div className="settings-section-heading"><h2>设备</h2></div><div className="adapter-card"><div className="adapter-heading"><span><Watch size={23} /></span><div><strong>穿戴设备</strong><small>标准心率广播</small></div><i>已接入</i></div><p>进入静息心率页连接设备。</p></div><div className="adapter-card"><div className="adapter-heading"><span><Bluetooth size={23} /></span><div><strong>蓝牙状态</strong></div></div><button className="text-link" onClick={checkBluetooth}>检测</button></div></section>

      <section className="surface-card appearance-section"><div><h2>外观</h2></div><button className="theme-toggle" onClick={onToggleTheme}>{theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}{theme === 'dark' ? '暗夜' : '日间'}<span className={theme === 'dark' ? 'active' : ''}><i /></span></button></section>
      <button className="button button-primary full-width save-settings" onClick={() => save()}><Save size={17} />保存设置</button>
      <p className="settings-footer"><ShieldCheck size={14} />健康建议不替代医生诊断或治疗 · v2.0</p>
    </div>
  );
}
