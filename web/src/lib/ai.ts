import { analyzeTextLocally, METRICS, metricByKey } from '../data';
import type { AIResult, ExtractedMetric } from '../types';
import { supabase } from './supabase';

export const SAMPLE_REPORT = '体检摘要：体重 66.5 kg，腰围 78.8 cm，静息心率 69 bpm，HRV 46 ms，血氧 98%，睡眠时长 7.6 h，体脂率 22.9%，昨日运动步数 6200 步。';

function sanitize(payload: unknown): AIResult {
  if (!payload || typeof payload !== 'object') throw new Error('解析结果不完整');
  const candidate = payload as { title?: string; summary?: string; advice?: string; metrics?: Array<{ key?: string; name?: string; value?: number }> };
  const metrics: ExtractedMetric[] = [];
  (candidate.metrics ?? []).forEach((item) => {
    const definition = METRICS.find((entry) => entry.key === item.key || entry.name === item.name);
    const value = Number(item.value);
    if (!definition || !Number.isFinite(value) || value < definition.min || value > definition.max || metrics.some((entry) => entry.key === definition.key)) return;
    metrics.push({ key: definition.key, name: definition.name, unit: definition.unit, value });
  });
  return {
    title: String(candidate.title || '健康资料').slice(0, 60),
    summary: String(candidate.summary || '请核对指标后归档').slice(0, 500),
    advice: String(candidate.advice || '保持规律作息与轻量活动，异常指标请咨询医生。').slice(0, 500),
    metrics,
    engine: 'Kimi',
  };
}

interface AnalyzeOptions {
  image?: string;
  transcript: string;
  demoMode: boolean;
  profileContext?: string;
}

export async function analyzeReport({ image, transcript, demoMode, profileContext }: AnalyzeOptions): Promise<AIResult> {
  if (demoMode) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return analyzeTextLocally(transcript || (image ? SAMPLE_REPORT : ''));
  }
  if (!supabase) throw new Error('Supabase 尚未配置');
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new Error('请先在设置中登录');
  const { data, error } = await supabase.functions.invoke('analyze-report', { body: { image, transcript, profile: profileContext || '' } });
  if (error) throw new Error(error.message || '报告解析失败');
  return sanitize(data);
}

export function validateMetricValue(key: string, value: number) {
  const definition = metricByKey(key as Parameters<typeof metricByKey>[0]);
  return Number.isFinite(value) && value >= definition.min && value <= definition.max;
}
