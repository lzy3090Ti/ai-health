import { Activity, BedDouble, Droplets, Footprints, Gauge, HeartPulse, Ruler, Scale, Waves } from 'lucide-react';
import type { MetricKey } from '../types';

export function MetricIcon({ metric, size = 20 }: { metric: MetricKey; size?: number }) {
  const props = { size, strokeWidth: 1.7 };
  if (metric === 'weight') return <Scale {...props} />;
  if (metric === 'waist') return <Ruler {...props} />;
  if (metric === 'heartRate') return <HeartPulse {...props} />;
  if (metric === 'hrv') return <Activity {...props} />;
  if (metric === 'spo2') return <Droplets {...props} />;
  if (metric === 'sleep') return <BedDouble {...props} />;
  if (metric === 'steps') return <Footprints {...props} />;
  if (metric === 'bodyFat') return <Gauge {...props} />;
  return <Waves {...props} />;
}
