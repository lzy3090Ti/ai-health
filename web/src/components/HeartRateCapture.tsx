import { Bluetooth, Check, HeartPulse, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { connectHeartRate, type HeartRateSession } from '../lib/heart-rate';

export function HeartRateCapture({ onSave }: { onSave: (value: number) => void }) {
  const [session, setSession] = useState<HeartRateSession | null>(null);
  const [heartRate, setHeartRate] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const sessionRef = useRef<HeartRateSession | null>(null);

  useEffect(() => () => { void sessionRef.current?.stop(); }, []);

  async function connect() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const next = await connectHeartRate((value) => { setHeartRate(value); setSaved(false); });
      sessionRef.current = next;
      setSession(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '未能连接穿戴设备');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    await sessionRef.current?.stop();
    sessionRef.current = null;
    setSession(null);
    setHeartRate(null);
  }

  return (
    <section className="surface-card heart-capture-card">
      <div className="card-heading"><div><h2>穿戴设备</h2><p>{session ? session.deviceName : '标准心率广播'}</p></div><span className={`connection-dot ${session ? 'connected' : ''}`} /></div>
      <div className="heart-live-value"><HeartPulse size={24} /><strong>{heartRate ?? '--'}</strong><span>bpm</span></div>
      {error && <p className="capture-error">{error}</p>}
      <div className="two-buttons">
        {!session ? <button className="button button-secondary" disabled={busy} onClick={connect}><Bluetooth size={16} />{busy ? '连接中…' : '连接设备'}</button> : <button className="button button-secondary" onClick={disconnect}><Square size={15} />断开</button>}
        <button className="button button-primary" disabled={!heartRate || saved} onClick={() => { if (heartRate) { onSave(heartRate); setSaved(true); } }}><Check size={16} />{saved ? '已记录' : '记录心率'}</button>
      </div>
    </section>
  );
}
