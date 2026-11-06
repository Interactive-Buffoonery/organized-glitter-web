import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'overview-layout.spec.ts',
  use: { baseURL: 'http://localhost:3197' },
  webServer: {
    command: 'pnpm exec vite --port 3197 --strictPort',
    url: 'http://localhost:3197/e2e/fixtures/overview-layout/index.html',
    reuseExistingServer: true,
    env: { VITE_APP_VERSION: 'overview-layout-test', APP_TEST_ENV: 'test' },
  },
});
