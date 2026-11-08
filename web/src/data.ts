import type { ActivityLevelKey, Advice, AIResult, ExtractedMetric, GoalKey, HealthAssessment, HealthRecord, LimitationKey, MetricDefinition, MetricKey, SexKey, UserProfile, Vault } from './types';

export const SEX_OPTIONS: Array<{ value: SexKey; label: string }> = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' },
  { value: 'other', label: '其他 / 不便说明' },
];

export const LIMITATION_OPTIONS: Array<{ value: LimitationKey; label: string }> = [
  { value: 'none', label: '无' },
  { value: 'lower', label: '下肢受限' },
  { value: 'upper', label: '上肢受限' },
  { value: 'vision', label: '视力受限' },
  { value: 'cardio', label: '心肺功能受限' },
  { value: 'other', label: '其他（请在下方说明）' },
];

export const GOAL_OPTIONS: Array<{ value: GoalKey; label: string }> = [
  { value: 'fatLoss', label: '降低体脂' },
  { value: 'muscle', label: '增肌塑形' },
  { value: 'maintain', label: '维持现状' },
  { value: 'endurance', label: '提升心肺耐力' },
  { value: 'rehab', label: '康复与功能恢复' },
];

export const ACTIVITY_OPTIONS: Array<{ value: ActivityLevelKey; label: string }> = [
  { value: 'sedentary', label: '久坐为主' },
  { value: 'light', label: '轻度活动' },
  { value: 'moderate', label: '中度活动' },
  { value: 'high', label: '高强度训练' },
];

export const EMPTY_PROFILE: UserProfile = {
  name: '我的健康档案',
  height: 170,
  age: 0,
  sex: '',
  limitation: 'none',
  limitationNote: '',
  goal: '',
  activityLevel: '',
};

const labelOf = <T extends string>(options: Array<{ value: T; label: string }>, value: string) => options.find((item) => item.value === value)?.label || '';

/** 把用户基础信息拼成一句话，用于交给 AI 作为分析前提 */
export function profileBrief(vault: Vault): string {
  const profile = vault.profile;
  const weight = latestRecord(vault, 'weight');
  const parts: string[] = [];
  if (profile.age >= 5) parts.push(`${profile.age} 岁`);
  if (profile.sex) parts.push(labelOf(SEX_OPTIONS, profile.sex));
  if (profile.height >= 80) parts.push(`身高 ${profile.height} cm`);
  if (weight) {
    parts.push(`体重 ${weight.value} kg`);
    if (profile.height >= 80) parts.push(`BMI ${(Number(weight.value) / (profile.height / 100) ** 2).toFixed(1)}`);
  }
  if (profile.limitation && profile.limitation !== 'none') {
    parts.push(`身体限制：${labelOf(LIMITATION_OPTIONS, profile.limitation)}${profile.limitationNote ? `（${profile.limitationNote}）` : ''}`);
  }
  if (profile.goal) parts.push(`训练目标：${labelOf(GOAL_OPTIONS, profile.goal)}`);
  if (profile.activityLevel) parts.push(`日常活动量：${labelOf(ACTIVITY_OPTIONS, profile.activityLevel)}`);
  return parts.join('，');
}

export const METRICS: MetricDefinition[] = [
  { key: 'weight', name: '体重', shortName: '重', unit: 'kg', decimals: 1, min: 25, max: 250, lowerBetter: true, optimalMin: 18.5, optimalMax: 23.9, color: '#e46f51', tip: '固定晨起测量条件，用四周趋势调整饮食与力量训练。' },
  { key: 'waist', name: '腰围', shortName: '围', unit: 'cm', decimals: 1, min: 35, max: 180, lowerBetter: true, optimalMin: 60, optimalMax: 85, color: '#d99032', tip: '保持自然呼吸，在肚脐水平测量，结合力量训练改善体成分。' },
  { key: 'heartRate', name: '静息心率', shortName: '心', unit: 'bpm', decimals: 0, min: 30, max: 220, lowerBetter: true, optimalMin: 50, optimalMax: 80, color: '#d95c6a', tip: '优先稳定作息与有氧基础，疲劳时不要突然增加训练量。' },
  { key: 'hrv', name: '心率变异性', shortName: '律', unit: 'ms', decimals: 0, min: 5, max: 250, lowerBetter: false, optimalMin: 35, optimalMax: 120, color: '#8d73aa', tip: '观察个人长期基线，优先保证规律睡眠和恢复。' },
  { key: 'spo2', name: '血氧饱和度', shortName: '氧', unit: '%', decimals: 0, min: 70, max: 100, lowerBetter: false, optimalMin: 95, optimalMax: 100, color: '#358ba4', tip: '保持测量时静止；持续异常或伴随不适时请及时就医。' },
  { key: 'sleep', name: '睡眠时长', shortName: '眠', unit: 'h', decimals: 1, min: 0, max: 24, lowerBetter: false, optimalMin: 7, optimalMax: 9, color: '#5979ad', tip: '固定起床时间，逐步靠近七到九小时的规律睡眠。' },
  { key: 'steps', name: '运动步数', shortName: '动', unit: '步', decimals: 0, min: 0, max: 100000, lowerBetter: false, optimalMin: 8000, optimalMax: 12000, color: '#3c8c6c', tip: '在现有步数上循序渐进，每周增幅不超过一成。' },
  { key: 'bodyFat', name: '体脂率', shortName: '脂', unit: '%', decimals: 1, min: 2, max: 70, lowerBetter: true, optimalMin: 8, optimalMax: 22, color: '#a06d43', tip: '每周安排力量训练，配合充足蛋白质与适度热量管理。' },
];

export const DEFAULT_SETTINGS = {
  webdavUrl: '',
  webdavUser: '',
  webdavPassword: '',
  huaweiClientId: '',
};

const pad = (value: number) => String(value).padStart(2, '0');
export const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => formatDate(new Date());
export const uid = (prefix = 'item') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const metricByKey = (key: MetricKey) => METRICS.find((item) => item.key === key) ?? METRICS[0];
export const formatMetricValue = (value: number | null, definition: MetricDefinition) => value === null ? '--' : value.toFixed(definition.decimals);

function dateBefore(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return formatDate(date);
}

function seedRecords(key: MetricKey, values: number[]): HealthRecord[] {
  const days = [35, 28, 21, 14, 7, 0];
  return values.map((value, index) => ({ id: uid(key), date: dateBefore(days[index]), value, note: index === values.length - 1 ? '最近一次记录' : '', source: 'demo' }));
}

function emptyMetrics(): Record<MetricKey, HealthRecord[]> {
  return { weight: [], waist: [], heartRate: [], hrv: [], spo2: [], sleep: [], steps: [], bodyFat: [] };
}

export function createEmptyVault(): Vault {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    profile: { ...EMPTY_PROFILE },
    activity: { targetSteps: 8000 },
    settings: { ...DEFAULT_SETTINGS },
    documents: [],
    metrics: emptyMetrics(),
  };
}

export function createSeedVault(): Vault {
  const vault = createEmptyVault();
  vault.profile = { ...EMPTY_PROFILE, name: '演示健康档案', age: 31, sex: 'male', limitation: 'none', goal: 'fatLoss', activityLevel: 'light', height: 176 };
  vault.metrics = {
    weight: seedRecords('weight', [68.8, 68.4, 68.1, 67.6, 67.2, 66.8]),
    waist: seedRecords('waist', [82, 81.4, 80.8, 80.2, 79.6, 79]),
    heartRate: seedRecords('heartRate', [78, 76, 75, 73, 72, 70]),
    hrv: seedRecords('hrv', [36, 38, 41, 40, 43, 45]),
    spo2: seedRecords('spo2', [96, 97, 97, 98, 98, 98]),
    sleep: seedRecords('sleep', [6.4, 6.8, 7, 6.9, 7.3, 7.5]),
    steps: seedRecords('steps', [5100, 6200, 5800, 7100, 6800, 5600]),
    bodyFat: seedRecords('bodyFat', [25.2, 24.8, 24.4, 24, 23.6, 23.2]),
  };
  return vault;
}

export const sortRecords = (records: HealthRecord[]) => [...records].sort((a, b) => a.date.localeCompare(b.date));
export const latestRecord = (vault: Vault, key: MetricKey) => sortRecords(vault.metrics[key]).at(-1) ?? null;

export function getDaily(vault: Vault) {
  const currentSteps = Number(latestRecord(vault, 'steps')?.value ?? 0);
  const targetSteps = vault.activity.targetSteps || 8000;
  const progress = Math.min(100, Math.max(0, Math.round((currentSteps / targetSteps) * 100)));
  const sleep = Number(latestRecord(vault, 'sleep')?.value ?? 8);
  let evaluation = '从轻松步行开始，建立今天的活动节奏。';
  if (progress >= 100) evaluation = '今日活动目标已完成，注意拉伸与补水。';
  else if (sleep < 7) evaluation = '昨晚恢复不足，今天适合轻量活动。';
  else if (progress >= 70) evaluation = '再完成一小段步行即可接近今日目标。';
  return { progress, currentSteps, targetSteps, remainingSteps: Math.max(0, targetSteps - currentSteps), evaluation, closed: progress >= 100 };
}

export function getOptimalRange(vault: Vault, definition: MetricDefinition) {
  if (definition.key === 'weight') {
    const factor = (vault.profile.height / 100) ** 2;
    return { min: 18.5 * factor, max: 23.9 * factor, label: `${(18.5 * factor).toFixed(1)}–${(23.9 * factor).toFixed(1)} ${definition.unit}` };
  }
  if (definition.key === 'steps') return { min: vault.activity.targetSteps, max: Math.round(vault.activity.targetSteps * 1.5), label: `≥ ${vault.activity.targetSteps.toLocaleString()} ${definition.unit}` };
  return { min: definition.optimalMin, max: definition.optimalMax, label: `${definition.optimalMin}–${definition.optimalMax} ${definition.unit}` };
}

export function getMetricAnalysis(vault: Vault, definition: MetricDefinition) {
  const records = sortRecords(vault.metrics[definition.key]);
  const latest = records.at(-1) ?? null;
  const previous = records.at(-2) ?? null;
  const value = latest ? Number(latest.value) : null;
  const delta = latest && previous ? Number(latest.value) - Number(previous.value) : 0;
  const stable = Math.abs(delta) < 10 ** -definition.decimals / 2;
  const improved = previous ? (definition.lowerBetter ? delta < 0 : delta > 0) : true;
  const range = getOptimalRange(vault, definition);
  let status: 'empty' | 'optimal' | 'low' | 'high' = 'empty';
  if (value !== null) status = value < range.min ? 'low' : value > range.max ? 'high' : 'optimal';
  let analysis = '等待首次测量';
  if (latest && previous && stable) analysis = '近阶段保持平稳';
  if (latest && previous && !stable) analysis = `较上期${delta > 0 ? '上升' : '下降'} ${Math.abs(delta).toFixed(definition.decimals)} ${definition.unit}${improved ? '，趋势向好' : '，继续观察'}`;
  if (latest && !previous) analysis = '已建立首条个人基线';
  return { value, latest, previous, records, analysis, improved, range, status, delta };
}

export function getHealthAssessment(vault: Vault): HealthAssessment {
  const issues: Array<{ key: MetricKey; points: number; issue: string; advice: string }> = [];
  const addIf = (key: MetricKey, condition: boolean, points: number, issue: string, advice: string) => {
    if (latestRecord(vault, key) && condition) issues.push({ key, points, issue, advice });
  };
  const weight = latestRecord(vault, 'weight');
  const bmi = weight ? Number(weight.value) / (vault.profile.height / 100) ** 2 : null;
  const female = vault.profile.sex === 'female';
  const waistLimit = female ? 80 : 85;
  const bodyFatUpper = female ? 30 : 22;
  addIf('weight', bmi !== null && (bmi < 18.5 || bmi > 23.9), 16, '最关键的是体重偏离个人目标区间', '先稳定饮食结构，并用每周两次力量训练改善体成分');
  addIf('waist', Number(latestRecord(vault, 'waist')?.value ?? 0) > waistLimit, 16, '最关键的是腰围偏高', '以可持续的热量管理、轻快走和核心训练逐步改善');
  addIf('heartRate', Number(latestRecord(vault, 'heartRate')?.value ?? 65) > 80, 12, '最关键的是静息心率偏高', '先安排低强度有氧与恢复，持续异常时请咨询医生');
  addIf('hrv', Number(latestRecord(vault, 'hrv')?.value ?? 45) < 35, 10, '最关键的是心率变异性偏低', '优先固定睡眠时间，减少连续高强度训练');
  addIf('spo2', Number(latestRecord(vault, 'spo2')?.value ?? 98) < 95, 24, '最关键的是血氧指标偏低', '请结合原始测量条件复核，持续异常或不适时及时就医');
  addIf('sleep', (() => { const value = Number(latestRecord(vault, 'sleep')?.value ?? 8); return value < 7 || value > 9; })(), 12, '最关键的是睡眠时长偏离目标', '固定起床时间，逐步建立七到九小时的规律睡眠');
  addIf('bodyFat', (() => { const value = Number(latestRecord(vault, 'bodyFat')?.value ?? 18); return value > bodyFatUpper || value < 8; })(), 20, '最关键的是体脂率偏高', '每周安排 2–3 次力量训练，配合轻快走和充足蛋白质逐步降低体脂率');
  const coverage = METRICS.filter((definition) => latestRecord(vault, definition.key)).length;
  if (!coverage) return { score: 0, keyIssue: '等待建立健康基线', summary: '完成一项测量或上传健康资料后生成评分', coverage };
  issues.sort((a, b) => b.points - a.points);
  const score = Math.max(0, Math.min(100, 100 - issues.reduce((total, issue) => total + issue.points, 0)));
  if (!issues.length) return { score: 100, keyIssue: '已记录指标均在个人目标区间', summary: '保持当前饮食、训练与恢复节奏', coverage };
  return { score, keyIssue: issues[0].issue, summary: issues[0].advice, coverage };
}

export function generateAdvice(vault: Vault): Advice[] {
  const daily = getDaily(vault);
  const sleep = Number(latestRecord(vault, 'sleep')?.value ?? 8);
  const heart = Number(latestRecord(vault, 'heartRate')?.value ?? 70);
  const limitation = vault.profile.limitation || 'none';
  const note = vault.profile.limitationNote ? `（${vault.profile.limitationNote}）` : '';
  const noLegLoad = limitation === 'lower' || limitation === 'cardio';
  const noArmLoad = limitation === 'upper';
  const strength = noLegLoad
    ? { title: '安排 2 次坐姿力量训练', description: `坐姿抬腿、弹力带上肢划船各两组，避开站立负重${note}，组间充分休息。`, level: '关节友好' }
    : noArmLoad
      ? { title: '安排 2 次下肢主导训练', description: `椅子深蹲、臀桥各两组，器械辅助替代上肢负重${note}，组间充分休息。`, level: '循序渐进' }
      : heart > 80
        ? { title: '先进行呼吸与活动度训练', description: '静息心率偏高时先观察恢复，若持续异常请咨询医生。', level: '循序渐进' }
        : { title: '安排 2 次基础力量训练', description: '深蹲、推墙俯卧撑、臀桥各两组，组间充分休息。', level: '循序渐进' };
  const walk = noLegLoad
    ? { title: daily.closed ? '舒缓拉伸 12 分钟' : `上肢循环训练 ${Math.max(10, Math.ceil(daily.remainingSteps / 1000) * 6)} 分钟`, description: `以坐姿或卧姿完成上肢与核心动作替代步行${note}，避免下肢负荷。`, level: '低强度' }
    : { title: daily.closed ? '舒缓拉伸 12 分钟' : `轻快走 ${Math.max(10, Math.ceil(daily.remainingSteps / 1000) * 8)} 分钟`, description: daily.closed ? '目标已完成，以髋部、腿后侧和肩颈放松为主。' : `以能正常说话的强度完成，剩余约 ${daily.remainingSteps} 步，不必一次走完。`, level: '低至中强度' };
  return [
    { id: 'walk', tag: '今日运动', ...walk },
    { id: 'recover', tag: '恢复建议', title: sleep < 7 ? '今晚提前 30 分钟休息' : '保持当前入睡节奏', description: sleep < 7 ? '减少睡前屏幕刺激，避免用高强度运动弥补疲劳。' : '继续固定起床时间，让睡眠和 HRV 形成稳定基线。', level: '恢复优先' },
    { id: 'strength', tag: '本周计划', ...strength },
  ];
}

export function getBMI(vault: Vault) {
  const weight = latestRecord(vault, 'weight');
  return weight ? (Number(weight.value) / (vault.profile.height / 100) ** 2).toFixed(1) : '--';
}

export function analyzeTextLocally(text: string): AIResult {
  const rules: Array<[MetricKey, RegExp]> = [
    ['weight', /体重[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['waist', /腰围[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['heartRate', /(?:静息)?心率[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['hrv', /(?:HRV|心率变异性)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['spo2', /(?:血氧|SpO2)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['sleep', /睡眠(?:时长)?[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['steps', /(?:步数|运动步数)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
    ['bodyFat', /体脂(?:率)?[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/i],
  ];
  const metrics: ExtractedMetric[] = [];
  rules.forEach(([key, pattern]) => {
    const match = text.match(pattern);
    if (!match) return;
    const definition = metricByKey(key);
    const value = Number(match[1]);
    if (value >= definition.min && value <= definition.max) metrics.push({ key, name: definition.name, unit: definition.unit, value });
  });
  return {
    title: `健康资料 ${today()}`,
    summary: metrics.length ? `整理出 ${metrics.length} 项指标` : '未识别到指标，可手动补充',
    metrics,
    advice: '保持规律作息与轻量活动；异常指标请结合原始报告咨询医生。',
    engine: '演示解析',
  };
}

export function toMarkdown(vault: Vault) {
  const lines = ['---', 'schema: health-vault/v1', `updated: ${new Date().toISOString()}`, `height_cm: ${vault.profile.height}`, `target_steps: ${vault.activity.targetSteps}`, '---', '', '# 我的健康档案', '', '> 健康建议不替代医疗诊断。', ''];
  METRICS.forEach((definition) => {
    lines.push(`## ${definition.name}（${definition.unit}）`, '', '| 日期 | 数值 | 来源 | 备注 |', '| --- | ---: | --- | --- |');
    sortRecords(vault.metrics[definition.key]).forEach((record) => lines.push(`| ${record.date} | ${record.value} | ${record.source} | ${(record.note || '').replace(/\|/g, '／')} |`));
    lines.push('');
  });
  lines.push('## 资料索引', '');
  vault.documents.forEach((document) => lines.push(`- ${document.createdAt.slice(0, 10)} · ${document.title}：${document.summary}`));
  return lines.join('\n');
}
