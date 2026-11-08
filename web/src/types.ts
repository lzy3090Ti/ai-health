export type MetricKey = 'weight' | 'waist' | 'heartRate' | 'hrv' | 'spo2' | 'sleep' | 'steps' | 'bodyFat';
export type PageKey = 'dashboard' | 'metric' | 'scan' | 'records' | 'settings' | 'auth';

export interface MetricDefinition {
  key: MetricKey;
  name: string;
  shortName: string;
  unit: string;
  decimals: number;
  min: number;
  max: number;
  lowerBetter: boolean;
  optimalMin: number;
  optimalMax: number;
  color: string;
  tip: string;
}

export interface HealthRecord {
  id: string;
  date: string;
  value: number;
  note: string;
  source: 'demo' | 'manual' | 'scan' | 'huawei' | 'ble';
}

export interface ExtractedMetric {
  key: MetricKey;
  name: string;
  unit: string;
  value: number;
}

export interface HealthDocument {
  id: string;
  title: string;
  summary: string;
  advice: string;
  imagePath?: string;
  rawText: string;
  engine: string;
  createdAt: string;
  metrics: ExtractedMetric[];
}

export interface AISettings {
  webdavUrl: string;
  webdavUser: string;
  webdavPassword: string;
  huaweiClientId: string;
}

export type SexKey = 'male' | 'female' | 'other';
export type LimitationKey = 'none' | 'lower' | 'upper' | 'vision' | 'cardio' | 'other';
export type GoalKey = 'fatLoss' | 'muscle' | 'maintain' | 'endurance' | 'rehab';
export type ActivityLevelKey = 'sedentary' | 'light' | 'moderate' | 'high';

/** 用户身体基础信息，会随报告一起交给 AI 作为分析前提 */
export interface UserProfile {
  name: string;
  height: number;
  age: number;
  sex: SexKey | '';
  limitation: LimitationKey | '';
  limitationNote: string;
  goal: GoalKey | '';
  activityLevel: ActivityLevelKey | '';
}

export interface Vault {
  schemaVersion: 1;
  updatedAt: string;
  profile: UserProfile;
  activity: { targetSteps: number };
  settings: AISettings;
  documents: HealthDocument[];
  metrics: Record<MetricKey, HealthRecord[]>;
}

export interface AIResult {
  title: string;
  summary: string;
  metrics: ExtractedMetric[];
  advice: string;
  engine: string;
}

export interface Advice {
  id: string;
  tag: string;
  title: string;
  description: string;
  level: string;
}

export interface HealthAssessment {
  score: number;
  keyIssue: string;
  summary: string;
  coverage: number;
}

export interface AccountProfile {
  id: string;
  display_name: string;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  plan_status: 'trial' | 'expired' | 'paid';
}
