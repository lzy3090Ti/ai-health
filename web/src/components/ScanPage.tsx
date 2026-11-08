import { Camera, Check, FileText, ScanLine, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useRef, useState } from 'react';
import { METRICS, metricByKey } from '../data';
import { analyzeReport, SAMPLE_REPORT } from '../lib/ai';
import { resizeImage } from '../lib/store';
import type { AIResult, ExtractedMetric, MetricKey } from '../types';

type EditableMetric = Omit<ExtractedMetric, 'value'> & { value: string };

interface Props {
  demoMode: boolean;
  profileContext: string;
  onArchive: (result: AIResult, metrics: ExtractedMetric[], image: string, transcript: string) => void;
  onOpenAuth: () => void;
  onOpenSettings: () => void;
  onFinish: () => void;
  onNotify: (message: string) => void;
}

export function ScanPage({ demoMode, profileContext, onArchive, onOpenAuth, onOpenSettings, onFinish, onNotify }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState('');
  const [transcript, setTranscript] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AIResult | null>(null);
  const [metrics, setMetrics] = useState<EditableMetric[]>([]);
  const [saved, setSaved] = useState(false);

  async function chooseImage() {
    setError('');
    if (Capacitor.isNativePlatform()) {
      try {
        const photo = await CapacitorCamera.getPhoto({ quality: 85, allowEditing: false, resultType: CameraResultType.DataUrl, source: CameraSource.Prompt, width: 1600 });
        if (photo.dataUrl) {
          setImage(photo.dataUrl);
          setResult(null);
          setSaved(false);
        }
      } catch (reason) {
        if (String(reason).toLowerCase().includes('cancel')) return;
        onNotify('无法打开相机，请检查应用权限');
      }
      return;
    }
    fileInput.current?.click();
  }

  async function handleFile(file?: File) {
    if (!file) return;
    try {
      setImage(await resizeImage(file));
      setResult(null);
      setSaved(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '图片读取失败');
    }
  }

  async function startAnalysis() {
    if (!image && !transcript.trim()) {
      setError('请先拍照、上传图片或粘贴报告文字');
      return;
    }
    setAnalyzing(true);
    setError('');
    setResult(null);
    try {
      const analysis = await analyzeReport({ image, transcript: transcript.trim(), demoMode, profileContext });
      setResult(analysis);
      setMetrics(analysis.metrics.map((item) => ({ ...item, value: String(item.value) })));
      setSaved(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '解析失败，请稍后重试');
    } finally {
      setAnalyzing(false);
    }
  }

  function addMetric(key: MetricKey) {
    if (metrics.some((item) => item.key === key)) return;
    const definition = metricByKey(key);
    setMetrics([...metrics, { key, name: definition.name, unit: definition.unit, value: '' }]);
    setSaved(false);
  }

  function archive() {
    if (!result) return;
    const valid = metrics.filter((item) => item.value.trim()).every((item) => {
      const definition = metricByKey(item.key);
      const value = Number(item.value);
      return Number.isFinite(value) && value >= definition.min && value <= definition.max;
    });
    if (!valid) {
      setError('请检查指标数值');
      return;
    }
    const extracted: ExtractedMetric[] = metrics.filter((item) => item.value.trim()).map((item) => ({ ...item, value: Number(item.value) }));
    onArchive(result, extracted, image, transcript);
    setSaved(true);
    onNotify('资料已归档');
  }

  function reset() {
    setImage('');
    setTranscript('');
    setResult(null);
    setMetrics([]);
    setSaved(false);
    setError('');
  }

  return (
    <div className="page-content scan-page">
      <header className="page-header"><span className="section-kicker">HEALTH REPORT</span><h1>扫描健康资料</h1></header>
      <div className="step-indicator">
        {[['01', '上传资料'], ['02', '整理指标'], ['03', '核对归档']].map(([number, name], index) => <div className="step-wrap" key={number}><div className={`step ${index === 0 || (index === 1 && result) || (index === 2 && saved) ? 'step-active' : ''}`}><span>{number}</span><div><strong>{name}</strong></div></div>{index < 2 && <i />}</div>)}
      </div>

      {!result && !analyzing && <>
        <section className="surface-card upload-card">
          {image ? <div className="image-preview"><img src={image} alt="待解析的健康资料" /><span className="scan-corner tl" /><span className="scan-corner tr" /><span className="scan-corner bl" /><span className="scan-corner br" /><button className="remove-image" onClick={() => setImage('')}><X size={18} /></button></div> : <button className="upload-placeholder" onClick={chooseImage}><span className="camera-icon"><Camera size={34} strokeWidth={1.4} /></span><strong>拍摄或上传</strong><span className="upload-action"><Upload size={15} />选择图片</span></button>}
          <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => handleFile(event.target.files?.[0])} />
          {image && <div className="two-buttons"><button className="button button-secondary" onClick={chooseImage}>重新选择</button><button className="button button-primary" onClick={startAnalysis}><Sparkles size={17} />开始整理</button></div>}
        </section>
        <section className="surface-card text-report-card">
          <div className="card-heading"><div><h2>报告文字</h2></div><button className="text-link" onClick={() => { setTranscript(SAMPLE_REPORT); setResult(null); }}>填入示例</button></div>
          <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setSaved(false); }} placeholder="粘贴报告文字" />
          <div className="engine-row"><div><strong>{demoMode ? '演示模式 · 本地解析' : 'Kimi 视觉解析'}</strong></div><button className="text-link" onClick={onOpenAuth}><UserRound size={15} />账户</button></div>
          {transcript && !image && <button className="button button-primary full-width" onClick={startAnalysis}><FileText size={17} />整理报告</button>}
        </section>
      </>}

      {analyzing && <section className="surface-card analyzing-card"><div className="scan-animation"><div className="scan-document"><i /><i /><i /></div><span /></div><h2>正在整理资料…</h2></section>}
      {error && <div className="notice error-notice"><span>{error}</span><button onClick={startAnalysis}>重试</button>{/未登录|登录状态|请先登录/.test(error) && <button onClick={onOpenAuth}>去登录</button>}{/体验已结束|开通会员/.test(error) && <button onClick={onOpenSettings}>去开通</button>}</div>}

      {result && !analyzing && <section className="result-section">
        <span className="result-check"><Check size={27} /></span><h2>请核对指标</h2><p className="result-engine">{result.engine}</p>
        <div className="surface-card summary-card"><span className="section-kicker">资料摘要</span><h3>{result.title}</h3><p>{result.summary}</p></div>
        <div className="surface-card metric-edit-section">
          <div className="card-heading"><h2>识别到的指标</h2><p>{metrics.length} 项</p></div>
          {metrics.map((item, index) => <div className="edit-metric" key={item.key}><div><strong>{item.name}</strong></div><div className="edit-value"><input type="number" step="any" value={item.value} onChange={(event) => { const next = [...metrics]; next[index] = { ...item, value: event.target.value }; setMetrics(next); setSaved(false); }} /><span>{item.unit}</span><button onClick={() => { setMetrics(metrics.filter((_, i) => i !== index)); setSaved(false); }} aria-label="移除指标"><Trash2 size={16} /></button></div></div>)}
          <select className="add-metric-select" value="" onChange={(event) => event.target.value && addMetric(event.target.value as MetricKey)}><option value="">＋ 补充指标</option>{METRICS.filter((item) => !metrics.some((metric) => metric.key === item.key)).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select>
        </div>
        <div className="ai-advice-card"><span className="section-kicker">运动与恢复</span><p>{result.advice}</p></div>
        <div className="notice">请以原始报告为准；建议不替代医生诊断。</div>
        <button className="button button-primary full-width archive-button" onClick={archive} disabled={saved}>{saved ? <><Check size={17} />已归档</> : <><ScanLine size={17} />确认归档</>}</button>
        {saved && <div className="two-buttons"><button className="button button-secondary" onClick={reset}>继续扫描</button><button className="button button-primary" onClick={onFinish}>返回首页</button></div>}
      </section>}
      <div className="privacy-note"><ShieldCheck size={17} /><p>仅在你确认后写入健康档案。</p></div>
    </div>
  );
}
