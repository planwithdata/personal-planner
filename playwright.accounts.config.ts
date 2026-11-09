import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: '**/accounts.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4175/personal-planner/', serviceWorkers: 'block' },
  webServer: {
    command: 'node scripts/serve-account-test-build.mjs',
    url: 'http://127.0.0.1:4175/personal-planner/',
    reuseExistingServer: false,
    env: {
      VITE_SUPABASE_URL: 'https://daylight-test.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-fixture'
    }
  }
});
