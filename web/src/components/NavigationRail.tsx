import { Database, Moon, ScanLine, Settings2, Sun } from 'lucide-react';
import type { PageKey } from '../types';

interface Props {
  activePage: PageKey;
  theme: string;
  onNavigate: (page: PageKey) => void;
  onToggleTheme: () => void;
}

export function NavigationRail({ activePage, theme, onNavigate, onToggleTheme }: Props) {
  const items: Array<{ page: PageKey; label: string; icon: React.ReactNode }> = [
    { page: 'records', label: '我的数据', icon: <Database size={21} strokeWidth={1.6} /> },
    { page: 'scan', label: '扫描', icon: <ScanLine size={22} strokeWidth={1.6} /> },
    { page: 'settings', label: '设置', icon: <Settings2 size={21} strokeWidth={1.6} /> },
  ];
  return (
    <nav className="navigation-rail" aria-label="主要功能">
      <button className="rail-mark" onClick={() => onNavigate('dashboard')} aria-label="返回首页">Ai</button>
      {items.map((item) => <button key={item.page} className={`rail-item ${activePage === item.page ? 'rail-active' : ''}`} onClick={() => onNavigate(item.page)}>{item.icon}<span>{item.label}</span></button>)}
      <button className="rail-item" onClick={onToggleTheme}>{theme === 'dark' ? <Sun size={21} strokeWidth={1.6} /> : <Moon size={21} strokeWidth={1.6} />}<span>{theme === 'dark' ? '日间模式' : '暗夜模式'}</span></button>
      <span className="rail-bottom" />
    </nav>
  );
}
