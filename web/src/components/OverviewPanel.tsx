import { PanelLeftClose } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { getBMI, getHealthAssessment } from '../data';
import { asset } from '../lib/asset';
import type { Vault } from '../types';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function OverviewPanel({ vault, demoMode, signedIn, onCollapse }: { vault: Vault; demoMode: boolean; signedIn: boolean; onCollapse: () => void }) {
  const assessment = getHealthAssessment(vault);
  const circleRef = useRef<SVGCircleElement>(null);
  const animatedValue = useRef(assessment.score);
  const [displayScore, setDisplayScore] = useState(assessment.score);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetOffset = CIRCUMFERENCE * (1 - assessment.score / 100);
    if (reduced) {
      circleRef.current?.style.setProperty('stroke-dashoffset', String(targetOffset));
      animatedValue.current = assessment.score;
      setDisplayScore(assessment.score);
      return;
    }
    const counter = { value: animatedValue.current };
    const tween = gsap.to(counter, {
      value: assessment.score,
      duration: 1.15,
      ease: 'power3.out',
      onUpdate: () => {
        animatedValue.current = counter.value;
        setDisplayScore(Math.round(counter.value));
      },
    });
    gsap.to(circleRef.current, { strokeDashoffset: targetOffset, duration: 1.15, ease: 'power3.out' });
    return () => { tween.kill(); gsap.killTweensOf(circleRef.current); };
  }, [assessment.score]);

  return (
    <aside className="overview-panel">
      <div className="brand-row">
        <div className="brand-lockup"><img src={asset('app-icon.png')} alt="Ai·健康" /><div><span className="brand">Ai·健康</span><span className="brand-subtitle">PERSONAL HEALTH</span></div></div>
        <button className="icon-button collapse-button" onClick={onCollapse} aria-label="收起总览"><PanelLeftClose size={19} /></button>
      </div>
      <section className="ring-section">
        <div className="panel-label"><span>综合健康率</span><span className="live-label">0–100</span></div>
        <div className={`health-score-ring ${assessment.score >= 100 ? 'ring-closed' : ''}`}>
          <svg viewBox="0 0 128 128" role="img" aria-label={`综合健康率 ${assessment.score}%`}>
            <circle className="score-track" cx="64" cy="64" r={RADIUS} />
            <circle ref={circleRef} className="score-progress" cx="64" cy="64" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - assessment.score / 100)} />
          </svg>
          <div className="ring-inner"><strong>{displayScore}<small>%</small></strong><span>健康率</span></div>
        </div>
        <div className="score-caption"><strong>{assessment.coverage}/8</strong><span>项指标已覆盖</span></div>
      </section>
      <section className="evaluation-section">
        <div className="panel-label"><span>关键发现</span>{demoMode && <span className="soft-badge">演示</span>}</div>
        <strong className="key-issue">{assessment.keyIssue}</strong>
        <p>{assessment.summary}</p>
      </section>
      <div className="mini-stats">
        <div><strong>{getBMI(vault)}</strong><span>当前 BMI</span></div>
        <div><strong>{vault.documents.length}</strong><span>健康资料</span></div>
      </div>
      <div className="local-note"><span />{demoMode ? '演示档案' : signedIn ? '账户档案' : '本机档案'}</div>
    </aside>
  );
}
