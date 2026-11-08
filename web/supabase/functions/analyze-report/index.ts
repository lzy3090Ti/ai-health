// Ai·健康 — 报告解析 Edge Function（Kimi 视觉模型）
// 部署: supabase functions deploy analyze-report
// 密钥: supabase secrets set KIMI_API_KEY=sk-xxx SUPABASE_SERVICE_ROLE_KEY=xxx
// 可选: KIMI_BASE_URL (默认 https://api.moonshot.cn/v1), KIMI_MODEL (默认 kimi-k2.6)
// 注意: moonshot-v1-32k-vision-preview 已下线，默认值必须用 kimi-k2.6；该模型不接受自定义 temperature

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KIMI_API_KEY = Deno.env.get('KIMI_API_KEY') ?? '';
const KIMI_BASE_URL = (Deno.env.get('KIMI_BASE_URL') ?? 'https://api.moonshot.cn/v1').replace(/\/$/, '');
const KIMI_MODEL = Deno.env.get('KIMI_MODEL') ?? 'kimi-k2.6';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const METRIC_RULES: Array<{ key: string; name: string; unit: string; min: number; max: number }> = [
  { key: 'weight', name: '体重', unit: 'kg', min: 20, max: 300 },
  { key: 'waist', name: '腰围', unit: 'cm', min: 30, max: 200 },
  { key: 'heartRate', name: '静息心率', unit: 'bpm', min: 25, max: 220 },
  { key: 'hrv', name: 'HRV', unit: 'ms', min: 5, max: 300 },
  { key: 'spo2', name: '血氧', unit: '%', min: 50, max: 100 },
  { key: 'sleep', name: '睡眠时长', unit: 'h', min: 0, max: 24 },
  { key: 'steps', name: '步数', unit: '步', min: 0, max: 100000 },
  { key: 'bodyFat', name: '体脂率', unit: '%', min: 2, max: 70 },
];

const SYSTEM_PROMPT_BASE = [
  '你是 Ai·健康 的健康资料解析引擎。用户会给你一张病历单/体检报告/化验单的图片，或一段报告文字。',
  '任务：读取报告，提取真实出现的身体指标，然后只输出一个 JSON 对象。',
  '下面是一个输出示例（仅示范结构，数值必须来自报告本身，绝不能照抄示例）：',
  '{"title":"2026 年度体检","summary":"体重 70.2kg，体脂率 24.5%，静息心率 72bpm。","advice":"每周三次力量训练并保证蛋白质摄入。本建议不替代医生诊断。","metrics":[{"key":"weight","value":70.2},{"key":"bodyFat","value":24.5},{"key":"heartRate","value":72}]}',
  `metrics 的 key 只能从这些里选：${METRIC_RULES.map((rule) => `${rule.key}(${rule.name}, 单位${rule.unit})`).join('、')}。`,
  '规则：value 是纯数字，不带单位；报告里没有的指标不要输出；不要输出解释、前言、代码块或除 JSON 以外的任何字符。',
];

function systemPrompt(profile: string) {
  const lines = [...SYSTEM_PROMPT_BASE];
  if (profile) {
    lines.splice(lines.length - 1, 0,
      `用户基础信息：${profile}。`,
      'advice 必须结合这些基础信息：说明该结果对这位用户意味着什么；若用户存在身体限制，只给出不涉及受限部位或器官负荷的替代方案，并明确提示回避的动作；不要做诊断，不给药物和补剂剂量。',
    );
  }
  return lines.join('\n');
}

function sanitize(payload: unknown) {
  if (!payload || typeof payload !== 'object') throw new Error('empty');
  const candidate = payload as { title?: string; summary?: string; advice?: string; metrics?: Array<{ key?: string; value?: number }> };
  const metrics: Array<{ key: string; value: number }> = [];
  (candidate.metrics ?? []).forEach((item) => {
    const rule = METRIC_RULES.find((entry) => entry.key === item?.key);
    const value = Number(item?.value);
    if (!rule || !Number.isFinite(value) || value < rule.min || value > rule.max) return;
    if (metrics.some((entry) => entry.key === rule.key)) return;
    metrics.push({ key: rule.key, value });
  });
  return {
    title: String(candidate.title || '健康资料').slice(0, 60),
    summary: String(candidate.summary || '请核对指标后归档').slice(0, 500),
    advice: String(candidate.advice || '保持规律作息与轻量活动，异常指标请咨询医生。').slice(0, 500),
    metrics,
  };
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw Object.assign(new Error('no json'), { raw: text.slice(0, 400) });
  return JSON.parse(match[0]);
}

async function requestKimi(messages: unknown[]) {
  const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIMI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: KIMI_MODEL, messages, max_tokens: 1500, stream: false }),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error('kimi upstream error', response.status, detail.slice(0, 500));
    throw Object.assign(new Error(`Kimi ${response.status}: ${detail.slice(0, 220)}`), { detail, status: response.status });
  }
  const payload = await response.json();
  const message = payload?.choices?.[0]?.message ?? {};
  return typeof message.content === 'string' && message.content.trim()
    ? message.content
    : (typeof message.reasoning_content === 'string' ? message.reasoning_content : '');
}

const CORRECTION = '上一次回复不是合法 JSON。请直接输出一个 JSON 对象：所有字段填真实数值，不要复述格式说明，不要代码块、不要解释文字。';

async function callKimi(image: string | undefined, transcript: string, profile: string) {
  const content: unknown[] = [{
    type: 'text',
    text: transcript
      ? `请解析这份健康报告，报告文字：${transcript}${image ? '（同时附报告图片供核对）' : ''}`
      : '请解析这张图片中的健康报告并提取指标。',
  }];
  if (image) content.push({ type: 'image_url', image_url: { url: image } });
  const prompt = systemPrompt(profile);
  const base: unknown[] = [
    { role: 'system', content: prompt },
    { role: 'user', content },
  ];
  const first = await requestKimi(base);
  if (!first) throw new Error('invalid upstream payload');
  try {
    return sanitize(extractJson(first));
  } catch {
    const second = await requestKimi([
      { role: 'system', content: prompt },
      { role: 'user', content: '上一次输出格式错误，请重新解析并只输出 JSON。' },
    ]);
    try {
      return sanitize(extractJson(second));
    } catch {
      throw Object.assign(new Error('报告已读取，但未能整理成结构化数据，请换一张更清晰的图片或补充文字后重试'), { raw: (second || first).slice(0, 300) });
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    if (!KIMI_API_KEY) return json({ error: '服务端尚未配置 KIMI_API_KEY' }, 500);

    const authorization = request.headers.get('Authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return json({ error: '请先登录' }, 401);

    // 体验期/会员校验（需要 SUPABASE_SERVICE_ROLE_KEY）
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const token = authorization.replace('Bearer ', '');
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: '登录状态无效，请重新登录' }, 401);
      const { data: profile } = await admin.from('profiles').select('plan_status,trial_ends_at').eq('id', userData.user.id).maybeSingle();
      const paid = profile?.plan_status === 'paid';
      const trialActive = profile?.trial_ends_at ? new Date(profile.trial_ends_at).getTime() > Date.now() : false;
      if (!paid && !trialActive) return json({ error: '体验已结束，请开通会员后再解析' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : undefined;
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 4000) : '';
    const profile = typeof body.profile === 'string' ? body.profile.slice(0, 400) : '';
    if (!image && !transcript) return json({ error: '请提供报告图片或文字' }, 400);

    return json(await callKimi(image, transcript, profile));
  } catch (error) {
    const message = error instanceof Error ? error.message : '解析失败';
    const raw = (error as { raw?: string })?.raw;
    const status = (error as { status?: number })?.status === 401 ? 502 : 500;
    return json({ error: message, raw }, status);
  }
});
