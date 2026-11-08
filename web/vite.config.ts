import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { HttpsProxyAgent } from 'https-proxy-agent';

const SUPABASE_ORIGIN = process.env.SUPABASE_ORIGIN || 'https://earnolaubmnzhzumldqq.supabase.co';
const LOCAL_PROXY = process.env.LOCAL_PROXY === 'off' ? '' : process.env.LOCAL_PROXY || 'http://127.0.0.1:7890';

const relay = {
  target: SUPABASE_ORIGIN,
  changeOrigin: true,
  secure: true,
  rewrite: (path: string) => path.replace(/^\/sb/, ''),
  ...(LOCAL_PROXY ? { agent: new HttpsProxyAgent(LOCAL_PROXY) } : {}),
};

const proxy = { '/sb': relay } as unknown as Record<string, never>;

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    proxy,
  },
  build: {
    target: 'es2022',
  },
});
