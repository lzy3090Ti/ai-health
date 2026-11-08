import { useEffect, useId, useRef } from 'react';
import { gsap } from 'gsap';
import { sortRecords } from '../data';
import type { HealthRecord } from '../types';

interface Props {
  records: HealthRecord[];
  color: string;
  large?: boolean;
}

export function TrendChart({ records, color, large = false }: Props) {
  const id = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const sorted = sortRecords(records).slice(-6);
  const values = sorted.map((record) => Number(record.value));
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 1;
  const padding = max === min ? Math.max(1, Math.abs(max) * 0.08) : (max - min) * 0.2;
  min -= padding;
  max += padding;
  const points = sorted.map((record, index) => ({
    record,
    x: sorted.length === 1 ? 150 : 18 + (index / (sorted.length - 1)) * 264,
    y: 112 - ((Number(record.value) - min) / (max - min)) * 92,
  }));
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = points.length ? `M ${points[0].x} 116 L ${points.map((point) => `${point.x} ${point.y}`).join(' L ')} L ${points.at(-1)?.x} 116 Z` : '';

  useEffect(() => {
    if (!svgRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const context = gsap.context(() => {
      const line = svgRef.current?.querySelector('polyline');
      if (line) {
        const length = line.getTotalLength();
        gsap.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.85, ease: 'power2.out' });
      }
      gsap.fromTo('circle.chart-point', { opacity: 0, scale: 0.4, transformOrigin: 'center' }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.055, ease: 'back.out(2)' });
    }, svgRef);
    return () => context.revert();
  }, [records, color, large]);

  return (
    <svg ref={svgRef} className={`trend-chart ${large ? 'trend-chart-large' : ''}`} viewBox="0 0 300 150" role="img" aria-label="指标变化折线图">
      <defs>
        <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[20, 52, 84, 116].map((y) => <line key={y} x1="12" x2="288" y1={y} y2={y} className="chart-grid" />)}
      {area && <path d={area} fill={`url(#area-${id})`} />}
      {points.length > 1 && <polyline points={polyline} fill="none" stroke={color} strokeWidth={large ? 3 : 2.6} strokeLinecap="round" strokeLinejoin="round" />}
      {points.map(({ record, x, y }) => (
        <g key={record.id}>
          <circle className="chart-point" cx={x} cy={y} r={large ? 4.5 : 3.6} fill="var(--surface)" stroke={color} strokeWidth="2.2"><title>{`${record.date} · ${record.value}`}</title></circle>
          <text x={x} y="140" textAnchor="middle" className="chart-date">{record.date.slice(5).replace('-', '/')}</text>
        </g>
      ))}
      {!points.length && <text x="150" y="72" textAnchor="middle" className="chart-empty">暂无数据</text>}
    </svg>
  );
}
