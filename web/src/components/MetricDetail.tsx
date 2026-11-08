import { ArrowLeft, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatMetricValue, getMetricAnalysis, metricByKey, sortRecords, today } from '../data';
import type { HealthRecord, MetricKey, Vault } from '../types';
import { HeartRateCapture } from './HeartRateCapture';
import { MetricIcon } from './MetricIcon';
import { TrendChart } from './TrendChart';

interface Props {
  metric: MetricKey;
  vault: Vault;
  onBack: () => void;
  onAdd: (key: MetricKey, value: number, date: string, note: string, source?: HealthRecord['source']) => void;
  onDelete: (key: MetricKey, id: string) => void;
}

export function MetricDetail({ metric, vault, onBack, onAdd, onDelete }: Props) {
  const definition = metricByKey(metric);
  const analysis = getMetricAnalysis(vault, definition);
  const records = sortRecords(analysis.records);
  const values = records.map((record) => Number(record.value));
  const [showForm, setShowForm] = useState(false);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const latest = records.at(-1);
  const previous = records.at(-2);
  const delta = latest && previous ? Number(latest.value) - Number(previous.value) : 0;

  function submit() {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < definition.min || numeric > definition.max) return;
    onAdd(metric, numeric, date, note);
    setValue('');
    setNote('');
    setShowForm(false);
  }

  return (
    <div className="page-content detail-page">
      <button className="back-button" onClick={onBack}><ArrowLeft size={17} />返回</button>
      <header className="detail-hero">
        <div className="detail-heading"><span className="detail-icon" style={{ color: definition.color, background: `${definition.color}12` }}><MetricIcon metric={metric} size={27} /></span><div><span className="section-kicker">HEALTH MARKER</span><h1>{definition.name}</h1></div></div>
        <div className="hero-value"><div><strong>{formatMetricValue(analysis.value, definition)}</strong><span>{definition.unit}</span></div><p>{previous ? `较上次 ${delta > 0 ? '+' : ''}${delta.toFixed(definition.decimals)} ${definition.unit}` : '个人最优区间'}</p></div>
      </header>

      <section className="surface-card trend-detail-card">
        <div className="card-heading"><div><h2>变化趋势</h2><p>{analysis.range.label}</p></div><span className={`status-pill status-${analysis.status}`}>{analysis.status === 'optimal' ? '最优' : analysis.status === 'low' ? '偏低' : analysis.status === 'high' ? '偏高' : '未记录'}</span></div>
        <TrendChart records={records} color={definition.color} large />
        <div className="stats-row">
          <div><strong>{values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(definition.decimals) : '--'}</strong><span>平均值 / {definition.unit}</span></div>
          <div><strong>{values.length ? Math.min(...values).toFixed(definition.decimals) : '--'}</strong><span>最低值 / {definition.unit}</span></div>
          <div><strong>{values.length ? Math.max(...values).toFixed(definition.decimals) : '--'}</strong><span>最高值 / {definition.unit}</span></div>
        </div>
      </section>

      {metric === 'heartRate' && <HeartRateCapture onSave={(heartRate) => onAdd(metric, heartRate, today(), '穿戴设备心率广播', 'ble')} />}

      <section className="surface-card record-form-card">
        <button className="card-heading clickable-heading" onClick={() => setShowForm(!showForm)}><div><h2>手动记录</h2></div><span className={`form-toggle ${showForm ? 'rotated' : ''}`}><ChevronDown size={21} /></span></button>
        {showForm && <div className="record-form">
          <div className="form-grid two-columns"><label><span>{definition.name}（{definition.unit}）</span><input type="number" step="any" value={value} onChange={(event) => setValue(event.target.value)} placeholder="请输入数值" /></label><label><span>测量日期</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
          <label><span>备注</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="选填" /></label>
          <button className="button button-primary full-width" onClick={submit} disabled={!value || Number(value) < definition.min || Number(value) > definition.max}><Plus size={17} />保存</button>
        </div>}
      </section>

      <section className="measure-tip"><span>下一阶段</span><p>{definition.tip}</p></section>

      <section className="history-section">
        <div className="card-heading"><h2>过往记录</h2><p>{records.length} 条</p></div>
        <div className="history-list">
          {[...records].reverse().map((record) => <div className="history-item" key={record.id}><div className="history-date"><strong>{record.date}</strong><span>{record.source === 'scan' ? '扫描归档' : record.source === 'demo' ? '演示数据' : record.source === 'ble' ? '穿戴设备' : '手动记录'}</span></div><p>{record.note}</p><div className="history-value"><strong>{Number(record.value).toFixed(definition.decimals)} <small>{definition.unit}</small></strong><button className="delete-button" onClick={() => onDelete(metric, record.id)} aria-label="删除记录"><Trash2 size={16} /></button></div></div>)}
        </div>
      </section>
      <p className="medical-disclaimer">仅提供营养、运动与生活方式建议，不替代医生诊断或治疗。</p>
    </div>
  );
}
