import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const appUrl = new URL(import.meta.env.BASE_URL, location.href);

export const accountNamespace = url ? new URL(url).origin : '';
export const accountClient = url && key ? createClient(url, key, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: `daylight-auth:${appUrl.pathname}:${accountNamespace}`
  },
  global: { fetch: fetchWithDeadline }
}) : null;

async function fetchWithDeadline(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const original = init?.signal;
  const abort = () => controller.abort();
  if (original?.aborted) abort();
  original?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 15000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    original?.removeEventListener('abort', abort);
  }
}

export async function signInWithGoogle() {
  if (!accountClient) return;
  const { error } = await accountClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: appUrl.href, queryParams: { prompt: 'select_account' } }
  });
  if (error) throw error;
}
