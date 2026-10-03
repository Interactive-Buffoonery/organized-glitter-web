import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'not-found.spec.ts',
  outputDir: '.tmp/not-found-qa/results',
  reporter: [['list'], ['html', { outputFolder: '.tmp/not-found-qa/report', open: 'never' }]],
  use: { baseURL: 'http://localhost:5184', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'node scripts/generate-not-found.mjs --check && pnpm build && pnpm start',
    env: {
      PORT: '5184',
      APP_TEST_ENV: 'test',
      VITE_POCKETBASE_URL: 'http://127.0.0.1:8099',
      VITE_PUBLIC_POSTHOG_KEY: '',
      BLOG_ENABLED: 'false',
    },
    timeout: 120_000,
    url: 'http://localhost:5184',
    reuseExistingServer: false,
  },
});
