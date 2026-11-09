import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:4174/personal-planner/',
    channel: process.platform === 'win32' ? 'msedge' : undefined,
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--no-first-run'] }
  },
  webServer: {
    command: 'node scripts/serve-test-build.mjs',
    url: 'http://127.0.0.1:4174/personal-planner/',
    reuseExistingServer: false
  }
});
