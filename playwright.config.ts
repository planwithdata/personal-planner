import { defineConfig, devices } from '@playwright/test';

const webkit = process.env.DAYLIGHT_TEST_WEBKIT === '1';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/accounts.spec.ts',
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4174/personal-planner/',
    ...(webkit ? { ...devices['iPhone 13'], browserName: 'webkit' as const } : { channel: process.platform === 'win32' ? 'msedge' : undefined }),
    timezoneId: 'Asia/Kolkata',
    trace: 'retain-on-failure',
    launchOptions: webkit ? undefined : { args: ['--no-first-run'] }
  },
  webServer: {
    command: 'node scripts/serve-test-build.mjs',
    url: 'http://127.0.0.1:4174/personal-planner/',
    reuseExistingServer: false
  }
});
