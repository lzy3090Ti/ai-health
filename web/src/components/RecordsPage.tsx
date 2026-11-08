import { ChevronRight, FileText, Plus, ScanLine, X } from 'lucide-react';
import { useState } from 'react';
import { formatMetricValue, generateAdvice, getDaily, getMetricAnalysis, METRICS, metricByKey, today } from '../data';
import type { HealthDocument, MetricKey, Vault } from '../types';
import { MetricIcon } from './MetricIcon';
import { TrendChart } from './TrendChart';

interface Props {
  vault: Vault;
  onOpenMetric: (key: MetricKey) => void;
  onAdd: (key: MetricKey, value: number, date: string, note: string) => void;
  onOpenScan: () => void;
}

export function RecordsPage({ vault, onOpenMetric, onAdd, onOpenScan }: Props) {
  const [tab, setTab] = useState<'metrics' | 'documents' | 'advice'>('metrics');
  const [showAdd, setShowAdd] = useState(false);
  const [key, setKey] = useState<MetricKey>('weight');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<HealthDocument | null>(null);
  const definition = metricByKey(key);
  const totalRecords = METRICS.reduce((total, item) => total + vault.metrics[item.key].length, 0);
  const daily = getDaily(vault);

  function submit() {
    const numeric = Number(value);
    if (!value || numeric < definition.min || numeric > definition.max) return;
    onAdd(key, numeric, date, note);
    setValue('');
    setNote('');
    setShowAdd(false);
  }

  return (
    <div className="page-content records-page">
      <header className="records-header"><div><span className="section-kicker">MY HEALTH VAULT</span><h1>我的数据</h1><p>{totalRecords} 次测量 · {vault.documents.length} 份资料 · 本机档案</p></div><button className="button button-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? <X size={17} /> : <Plus size={17} />}{showAdd ? '收起' : '记一笔'}</button></header>
      {showAdd && <section className="surface-card quick-add-card"><div className="card-heading"><h2>快速记录</h2></div><div className="form-grid three-columns"><label><span>指标</span><select value={key} onChange={(event) => setKey(event.target.value as MetricKey)}>{METRICS.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label><label><span>数值（{definition.unit}）</span><input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} placeholder="输入测量值" /></label><label><span>日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><label><span>备注（可选）</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="记录测量状态或数据来源" /></label><button className="button button-primary full-width" disabled={!value || Number(value) < definition.min || Number(value) > definition.max} onClick={submit}>保存记录</button></section>}
      <div className="record-tabs"><button className={tab === 'metrics' ? 'active' : ''} onClick={() => setTab('metrics')}>指标数据</button><button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>健康资料</button><button className={tab === 'advice' ? 'active' : ''} onClick={() => setTab('advice')}>运动建议</button></div>

      {tab === 'metrics' && <section className="records-metrics"><div className="data-table-heading"><span>指标</span><span>近期趋势</span><span>最新记录</span></div>{METRICS.map((item) => { const analysis = getMetricAnalysis(vault, item); return <button className="data-row" key={item.key} onClick={() => onOpenMetric(item.key)}><div className="data-metric-name"><span className="metric-icon" style={{ color: item.color, background: `${item.color}16` }}><MetricIcon metric={item.key} /></span><div><strong>{item.name}</strong><span>{analysis.records.length} 次记录</span></div></div><div className="record-sparkline"><TrendChart records={analysis.records} color={item.color} /></div><div className="data-latest"><strong>{formatMetricValue(analysis.value, item)} <small>{item.unit}</small></strong><span>{analysis.latest?.date}</span><ChevronRight size={17} /></div></button>; })}<div className="notice">点击任一指标进入二级页面，可查看完整折线、添加新测量或管理过往记录。</div></section>}

      {tab === 'documents' && <section>{vault.documents.length ? <div className="document-list">{vault.documents.map((document) => <button className="document-card" key={document.id} onClick={() => setPreview(document)}>{document.imagePath ? <img src={document.imagePath} alt="健康资料缩略图" /> : <span className="document-placeholder"><FileText size={30} /></span>}<div><div className="document-topline"><strong>{document.title}</strong><span>{document.createdAt.slice(0, 10)}</span></div><p>{document.summary}</p><div className="document-tags">{document.metrics.map((metric) => <span key={metric.key}>{metric.name} {metric.value} {metric.unit}</span>)}</div><small>{document.engine}</small></div></button>)}</div> : <div className="empty-state"><FileText size={46} strokeWidth={1.2} /><h2>还没有归档资料</h2><p>扫描病历或体检单后，AI 整理结果会保存在这里。</p><button className="button button-primary" onClick={onOpenScan}><ScanLine size={17} />扫描第一份资料</button></div>}</section>}

      {tab === 'advice' && <section className="advice-tab"><div className="plan-overview"><div className="small-progress-ring" style={{ '--progress': `${daily.progress * 3.6}deg` } as React.CSSProperties}><div>{daily.progress}%</div></div><div><h2>今日活动计划</h2><p>{daily.evaluation}</p><span>{daily.currentSteps.toLocaleString()} / {daily.targetSteps.toLocaleString()} 步</span></div></div>{generateAdvice(vault).map((item, index) => <article className="plan-card" key={item.id}><span className="plan-number">0{index + 1}</span><div><div><span>{item.tag}</span><span>{item.level}</span></div><h3>{item.title}</h3><p>{item.description}</p></div></article>)}<div className="notice">建议根据本机指标按保守规则生成。若有胸闷、头晕、持续异常指标或医生限制，请停止运动并寻求专业意见。</div></section>}

      {preview && <div className="modal-backdrop" onClick={() => setPreview(null)}><div className="document-modal" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPreview(null)}><X size={20} /></button>{preview.imagePath && <img src={preview.imagePath} alt="归档健康资料" />}<div><span className="section-kicker">{preview.createdAt.slice(0, 10)}</span><h2>{preview.title}</h2><p>{preview.summary}</p><h3>运动与恢复建议</h3><p>{preview.advice}</p><small>{preview.engine}</small></div></div></div>}
    </div>
  );
}
