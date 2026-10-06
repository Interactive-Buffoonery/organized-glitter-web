import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa-navigation.spec.ts',
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.tmp/pwa-navigation/report', open: 'never' }],
    ['json', { outputFile: '.tmp/pwa-navigation/results.json' }],
  ],
  outputDir: '.tmp/pwa-navigation/artifacts',
  use: { baseURL: 'http://localhost:4183', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm exec vite build && node server/local-build-server.js',
    url: 'http://localhost:4183/login',
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: '4183',
      VITE_APP_URL: 'http://localhost:4183',
      VITE_APP_VERSION: 'pwa-navigation-test',
      VITE_POCKETBASE_URL: 'http://localhost:4183',
      APP_TEST_ENV: 'test',
    },
  },
});
