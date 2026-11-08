import { createClient } from '@supabase/supabase-js';
import type { AccountProfile } from '../types';

const rawUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * 本机浏览器直连 supabase.co 会被网络层重置（TLS reset），
 * 所以本地网页运行时统一走同源转发 /sb，由 vite 的 server/preview proxy 中转。
 * Android（Capacitor）内没有这层转发，保持直连原始地址。
 */
function resolveSupabaseUrl(): string {
  if (typeof window === 'undefined') return rawUrl;
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } }).Capacitor;
  const isNative = Boolean(capacitor && (capacitor.isNativePlatform ? capacitor.isNativePlatform() : capacitor.platform && capacitor.platform !== 'web'));
  if (isNative) return rawUrl;
  const { protocol, hostname, origin } = window.location;
  const isLocalWeb = protocol.startsWith('http') && ['127.0.0.1', 'localhost', '::1'].includes(hostname);
  return isLocalWeb ? `${origin}/sb` : rawUrl;
}

const supabaseUrl = resolveSupabaseUrl();

export const isSupabaseRelayed = supabaseUrl !== rawUrl;
export const isSupabaseConfigured = /^https:\/\/.+\.supabase\.co$/i.test(rawUrl) && supabaseAnonKey.length > 20;
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;

export async function fetchAccountProfile(userId: string): Promise<AccountProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('id,display_name,trial_started_at,trial_ends_at,plan_status').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as AccountProfile | null;
}

export async function requestTrial(): Promise<AccountProfile> {
  if (!supabase) throw new Error('Supabase 尚未配置');
  const { data, error } = await supabase.rpc('start_trial');
  if (error) throw error;
  return data as AccountProfile;
}

export function trialState(profile: AccountProfile | null) {
  if (!profile) return { active: false, label: '尚未开通体验' };
  if (profile.plan_status === 'paid') return { active: true, label: '正式会员' };
  if (!profile.trial_ends_at) return { active: false, label: '可申请 24h 体验' };
  const remaining = new Date(profile.trial_ends_at).getTime() - Date.now();
  if (remaining <= 0) return { active: false, label: '体验已结束' };
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.max(1, Math.floor((remaining % 3600000) / 60000));
  return { active: true, label: `体验剩余 ${hours}h ${minutes}m` };
}
