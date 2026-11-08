import { ArrowUpRight, PanelLeftOpen, Plus, RefreshCw, ScanLine } from 'lucide-react';
import { formatMetricValue, generateAdvice, getMetricAnalysis, METRICS } from '../data';
import type { MetricKey, PageKey, Vault } from '../types';
import { MetricIcon } from './MetricIcon';
import { TrendChart } from './TrendChart';

interface Props {
  vault: Vault;
  overviewVisible: boolean;
  onShowOverview: () => void;
  onOpenMetric: (key: MetricKey) => void;
  onNavigate: (page: PageKey) => void;
  onNotify: (message: string) => void;
}

const statusLabels = { empty: '未记录', optimal: '最优', low: '偏低', high: '偏高' };

export function Dashboard({ vault, overviewVisible, onShowOverview, onOpenMetric, onNavigate, onNotify }: Props) {
  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}月${now.getDate()}日 · 星期${'日一二三四五六'[now.getDay()]}`;
  const advice = generateAdvice(vault).slice(0, 2);
  return (
    <div className="page-content dashboard-content">
      <header className="main-header">
        <div className="main-heading">
          {!overviewVisible && <button className="open-overview" onClick={onShowOverview}><PanelLeftOpen size={17} />Ai·健康</button>}
          <span className="section-kicker">TRACK YOUR HEALTH</span>
          <h1>看见身体的每一步变化。</h1>
          <p>{dateLabel}</p>
        </div>
        <div className="header-actions">
          <button className="button button-secondary" onClick={() => onNavigate('records')}><Plus size={17} />记一笔</button>
          <button className="button button-primary" onClick={() => onNavigate('scan')}><ScanLine size={17} />扫描报告</button>
        </div>
      </header>

      <section className="metrics-section">
        <div className="section-heading">
          <div className="section-title-row"><h2>身体指标</h2><span>{METRICS.length} 项</span></div>
          <span className="range-legend"><i />个人最优区间</span>
        </div>
        <div className="metric-list">
          {METRICS.map((definition) => {
            const analysis = getMetricAnalysis(vault, definition);
            const fullRange = definition.max - definition.min;
            const rangeLeft = Math.max(0, ((analysis.range.min - definition.min) / fullRange) * 100);
            const rangeWidth = Math.min(100 - rangeLeft, ((analysis.range.max - analysis.range.min) / fullRange) * 100);
            const markerLeft = analysis.value === null ? 0 : Math.min(100, Math.max(0, ((analysis.value - definition.min) / fullRange) * 100));
            return (
              <article className={`metric-card metric-${analysis.status}`} key={definition.key} onClick={() => onOpenMetric(definition.key)} onKeyDown={(event) => event.key === 'Enter' && onOpenMetric(definition.key)} role="button" tabIndex={0}>
                <div className="metric-card-header">
                  <div className="metric-identity">
                    <span className="metric-icon" style={{ color: definition.color, background: `${definition.color}12` }}><MetricIcon metric={definition.key} /></span>
                    <div><h3>{definition.name}</h3><span>{analysis.latest?.date ?? '尚无记录'}</span></div>
                  </div>
                  <div className="metric-value"><strong>{formatMetricValue(analysis.value, definition)}</strong><span>{definition.unit}</span><em className={`status-pill status-${analysis.status}`}>{statusLabels[analysis.status]}</em></div>
                </div>
                <div className="metric-body">
                  <div className="chart-wrap"><TrendChart records={analysis.records} color={definition.color} /></div>
                  <div className="metric-analysis">
                    <div><span>趋势</span><p>{analysis.analysis}</p></div>
                    <div><span>下一步</span><p>{definition.tip}</p></div>
                    <div className="optimal-range-block">
                      <div><span>个人最优区间</span><strong>{analysis.range.label}</strong></div>
                      <div className="range-track"><span className="range-optimal" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }} />{analysis.value !== null && <i style={{ left: `${markerLeft}%` }} />}</div>
                    </div>
                    <button className="text-link">查看 {analysis.records.length} 次记录<ArrowUpRight size={15} /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="advice-section">
        <div className="section-heading">
          <div><span className="section-kicker">ACTION PLAN</span><h2>今日行动</h2></div>
          <button className="text-link" onClick={() => onNotify('已按最新数据更新建议')}><RefreshCw size={14} />刷新</button>
        </div>
        <div className="advice-grid">
          {advice.map((item) => <article className="advice-card" key={item.id}><div><span>{item.tag}</span><span>{item.level}</span></div><h3>{item.title}</h3><p>{item.description}</p></article>)}
        </div>
        <p className="medical-disclaimer">仅提供营养、运动与生活方式建议，不替代医生诊断或治疗。</p>
      </section>
    </div>
  );
}
