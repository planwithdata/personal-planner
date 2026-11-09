import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode, command, isPreview }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url || key) {
    if (!url || !key?.startsWith('sb_publishable_')) {
      throw new Error('Set both VITE_SUPABASE_URL and a Supabase sb_publishable_ key. Never use a secret key in this build.');
    }
    const endpoint = new URL(url);
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/' || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) {
      throw new Error('VITE_SUPABASE_URL must be the HTTPS project origin.');
    }
  }
  return { plugins: [react()], base: command === 'build' || isPreview ? '/personal-planner/' : './' };
});
