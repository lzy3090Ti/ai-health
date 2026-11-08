import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { createEmptyVault, DEFAULT_SETTINGS, METRICS, toMarkdown } from '../data';
import type { AISettings, Vault } from '../types';

const STORAGE_PREFIX = 'ai.health.vault.v2';
const THEME_KEY = 'ai.health.theme';
const storageKey = (ownerId?: string) => `${STORAGE_PREFIX}.${ownerId || 'guest'}`;

function normalize(value: unknown): Vault {
  if (!value || typeof value !== 'object') return createEmptyVault();
  const candidate = value as Partial<Vault>;
  if (!candidate.metrics) return createEmptyVault();
  const seed = createEmptyVault();
  const metrics = { ...seed.metrics };
  METRICS.forEach(({ key }) => {
    metrics[key] = Array.isArray(candidate.metrics?.[key]) ? candidate.metrics[key] : [];
  });
  return {
    schemaVersion: 1,
    updatedAt: candidate.updatedAt ?? new Date().toISOString(),
    profile: { ...seed.profile, ...candidate.profile },
    activity: { ...seed.activity, ...candidate.activity },
    settings: { ...DEFAULT_SETTINGS, ...candidate.settings },
    documents: Array.isArray(candidate.documents) ? candidate.documents : [],
    metrics,
  };
}

export function loadVault(ownerId?: string): Vault {
  try {
    const stored = localStorage.getItem(storageKey(ownerId));
    return stored ? normalize(JSON.parse(stored)) : createEmptyVault();
  } catch {
    return createEmptyVault();
  }
}

export function saveVault(vault: Vault, ownerId?: string) {
  localStorage.setItem(storageKey(ownerId), JSON.stringify({ ...vault, updatedAt: new Date().toISOString() }));
}

export function parseVault(text: string): Vault {
  const parsed = JSON.parse(text) as Partial<Vault>;
  if (parsed.schemaVersion !== 1 || !parsed.metrics) throw new Error('档案格式或版本不受支持');
  return normalize(parsed);
}

export function loadTheme() {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

export function saveTheme(theme: string) {
  localStorage.setItem(THEME_KEY, theme);
}

function downloadFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportVault(vault: Vault) {
  const json = JSON.stringify(vault, null, 2);
  const markdown = toMarkdown(vault);
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: 'AiHealth/health.vault.json', data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    await Filesystem.writeFile({ path: 'AiHealth/健康档案.md', data: markdown, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true });
    return '已保存到 Android 文档目录 /AiHealth';
  }
  downloadFile('health.vault.json', json, 'application/json;charset=utf-8');
  setTimeout(() => downloadFile('健康档案.md', markdown, 'text/markdown;charset=utf-8'), 180);
  return '已开始下载 JSON 与 Markdown';
}

export async function importVaultFile(file: File) {
  return parseVault(await file.text());
}

export function resizeImage(file: File, maxSize = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件'));
    if (file.size > 20 * 1024 * 1024) return reject(new Error('图片不能超过 20 MB'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片格式不受支持'));
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function encodeAuth(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

export async function uploadWebDAV(settings: AISettings, vault: Vault) {
  if (!/^https:\/\//i.test(settings.webdavUrl)) throw new Error('请填写 HTTPS WebDAV 目录地址');
  const url = `${settings.webdavUrl.replace(/\/$/, '')}/health.vault.json`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' };
  if (settings.webdavUser) headers.Authorization = `Basic ${encodeAuth(`${settings.webdavUser}:${settings.webdavPassword}`)}`;
  const response = await fetch(url, { method: 'PUT', headers, body: JSON.stringify(vault, null, 2) });
  if (!response.ok) throw new Error(`WebDAV 上传失败（${response.status}）`);
  return url;
}
