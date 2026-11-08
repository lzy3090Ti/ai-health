import { CheckCircle2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import type { User } from '@supabase/supabase-js';
import { AuthPage } from './components/AuthPage';
import { Dashboard } from './components/Dashboard';
import { MetricDetail } from './components/MetricDetail';
import { NavigationRail } from './components/NavigationRail';
import { OverviewPanel } from './components/OverviewPanel';
import { RecordsPage } from './components/RecordsPage';
import { ScanPage } from './components/ScanPage';
import { SettingsPage } from './components/SettingsPage';
import { createSeedVault, metricByKey, profileBrief, today, uid } from './data';
import { loadTheme, loadVault, saveTheme, saveVault } from './lib/store';
import { fetchAccountProfile, isSupabaseConfigured, requestTrial, supabase } from './lib/supabase';
import type { AccountProfile, AIResult, AISettings, ExtractedMetric, HealthRecord, MetricKey, PageKey, UserProfile, Vault } from './types';
import './styles.css';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [vault, setVault] = useState<Vault>(() => loadVault());
  const [vaultOwner, setVaultOwner] = useState('guest');
  const [page, setPage] = useState<PageKey>('dashboard');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('weight');
  const [overviewVisible, setOverviewVisible] = useState(true);
  const [theme, setTheme] = useState(loadTheme);
  const [demoMode, setDemoMode] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realVaultRef = useRef<{ owner: string; vault: Vault } | null>(null);
  const ownerId = user?.id || 'guest';

  useEffect(() => {
    if (!demoMode && vaultOwner === ownerId) saveVault(vault, user?.id);
  }, [vault, vaultOwner, ownerId, demoMode, user?.id]);

  useEffect(() => {
    saveTheme(theme);
    document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1214' : '#fff5f5');
  }, [theme]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setUser(data.session?.user ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    let mounted = true;
    fetchAccountProfile(user.id).then((nextProfile) => {
      if (mounted) setProfile(nextProfile);
    }).catch(() => {
      if (mounted) setProfile(null);
    });
    return () => { mounted = false; };
  }, [user?.id, user]);

  useEffect(() => {
    realVaultRef.current = null;
    setDemoMode(false);
    setVault(loadVault(user?.id));
    setVaultOwner(ownerId);
  }, [ownerId, user?.id]);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      gsap.fromTo('.page-content', { autoAlpha: 0, y: 18 }, { autoAlpha: 1, y: 0, duration: 0.52, ease: 'power3.out' });
      if (page === 'dashboard') gsap.fromTo('.metric-card', { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.055, ease: 'power3.out' });
    });
    return () => context.revert();
  }, [page, selectedMetric]);

  function notify(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }

  function navigate(next: PageKey) {
    setPage(next);
    if (next !== 'dashboard') setOverviewVisible(true);
  }

  function openMetric(key: MetricKey) {
    setSelectedMetric(key);
    setPage('metric');
    setOverviewVisible(true);
  }

  function addRecord(key: MetricKey, value: number, date: string, note: string, source: HealthRecord['source'] = 'manual') {
    setVault((current) => ({ ...current, metrics: { ...current.metrics, [key]: [...current.metrics[key], { id: uid(key), value, date, note, source }] } }));
    notify(`${metricByKey(key).name}已保存`);
  }

  function deleteRecord(key: MetricKey, id: string) {
    if (!window.confirm('删除这条记录？')) return;
    setVault((current) => ({ ...current, metrics: { ...current.metrics, [key]: current.metrics[key].filter((record) => record.id !== id) } }));
    notify('记录已删除');
  }

  function archive(result: AIResult, metrics: ExtractedMetric[], image: string, transcript: string) {
    const createdAt = new Date().toISOString();
    const document = { id: uid('document'), title: result.title, summary: result.summary, advice: result.advice, imagePath: image, rawText: transcript, engine: result.engine, createdAt, metrics };
    setVault((current) => {
      const nextMetrics = { ...current.metrics };
      metrics.forEach((metric) => { nextMetrics[metric.key] = [...nextMetrics[metric.key], { id: uid(metric.key), date: today(), value: metric.value, note: result.title, source: 'scan' }]; });
      return { ...current, metrics: nextMetrics, documents: [document, ...current.documents] };
    });
  }

  function saveSettings(settings: AISettings, targetSteps: number, profile: UserProfile, weight: number | null) {
    setVault((current) => {
      let metrics = current.metrics;
      if (weight && Number.isFinite(weight)) {
        const records = current.metrics.weight;
        const todayRecord = records.find((record) => record.date === today());
        if (!todayRecord) {
          metrics = { ...current.metrics, weight: [...records, { id: uid('weight'), date: today(), value: weight, note: '设置页录入', source: 'manual' }] };
        } else if (Number(todayRecord.value) !== weight) {
          metrics = { ...current.metrics, weight: records.map((record) => record.id === todayRecord.id ? { ...record, value: weight, note: '设置页录入', source: 'manual' } : record) };
        }
      }
      return { ...current, settings, activity: { targetSteps }, profile, metrics };
    });
  }

  function setDemo(enabled: boolean) {
    if (enabled) {
      if (!demoMode) {
        if (vaultOwner === ownerId) saveVault(vault, user?.id);
        realVaultRef.current = { owner: ownerId, vault };
      }
      setDemoMode(true);
      setVault(createSeedVault());
      setVaultOwner('demo');
      setPage('dashboard');
      setOverviewVisible(true);
      notify('已进入演示模式');
      return;
    }
    const snapshot = realVaultRef.current;
    setDemoMode(false);
    setVault(snapshot?.owner === ownerId ? snapshot.vault : loadVault(user?.id));
    setVaultOwner(ownerId);
    setPage('dashboard');
    setOverviewVisible(true);
    notify('已退出演示模式');
  }

  async function handleRequestTrial() {
    const nextProfile = await requestTrial();
    setProfile(nextProfile);
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setPage('settings');
    notify('已退出登录');
  }

  return (
    <div className={`app ${theme === 'dark' ? 'theme-dark' : ''} ${demoMode ? 'demo-mode' : ''}`}>
      <div className={`app-shell ${overviewVisible ? '' : 'overview-collapsed'}`}>
        {overviewVisible && <OverviewPanel vault={vault} demoMode={demoMode} signedIn={Boolean(user)} onCollapse={() => setOverviewVisible(false)} />}
        <main className="main-panel">
          {page === 'dashboard' && <Dashboard vault={vault} overviewVisible={overviewVisible} onShowOverview={() => setOverviewVisible(true)} onOpenMetric={openMetric} onNavigate={navigate} onNotify={notify} />}
          {page === 'metric' && <MetricDetail key={selectedMetric} metric={selectedMetric} vault={vault} onBack={() => setPage('dashboard')} onAdd={addRecord} onDelete={deleteRecord} />}
          {page === 'scan' && <ScanPage demoMode={demoMode} profileContext={profileBrief(vault)} onArchive={archive} onOpenAuth={() => setPage('auth')} onOpenSettings={() => setPage('settings')} onFinish={() => setPage('dashboard')} onNotify={notify} />}
          {page === 'records' && <RecordsPage vault={vault} onOpenMetric={openMetric} onAdd={addRecord} onOpenScan={() => setPage('scan')} />}
          {page === 'settings' && <SettingsPage vault={vault} theme={theme} user={user} profile={profile} demoMode={demoMode} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} onSave={saveSettings} onImport={setVault} onNotify={notify} onOpenAuth={() => setPage('auth')} onSignOut={handleSignOut} onRequestTrial={handleRequestTrial} onPayDemo={() => notify('缴费功能为演示，未发起扣款')} onDemoModeChange={setDemo} />}
          {page === 'auth' && <AuthPage onBack={() => setPage('settings')} onSuccess={() => { setPage('settings'); notify('已登录'); }} />}
        </main>
        <NavigationRail activePage={page} theme={theme} onNavigate={navigate} onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
      </div>
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}
