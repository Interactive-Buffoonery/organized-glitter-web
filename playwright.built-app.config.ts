import { defineConfig, devices } from '@playwright/test';

// One production build serves the cold-load, standalone 404, and PWA navigation suites.
const baseURL = 'http://localhost:4183';
const artifactRoot = '.tmp/built-app-qa';

export default defineConfig({
  testDir: './e2e',
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: `${artifactRoot}/results`,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${artifactRoot}/report`, open: 'never' }],
    ['json', { outputFile: `${artifactRoot}/results.json` }],
  ],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'cold-load',
      testMatch: 'cold-load.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
        serviceWorkers: 'block',
        screenshot: 'only-on-failure',
      },
    },
    { name: 'not-found', testMatch: 'not-found.spec.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'pwa-navigation',
      testMatch: 'pwa-navigation.spec.ts',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'pnpm exec vite build && node server/local-build-server.js',
    url: `${baseURL}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: '4183',
      APP_TEST_ENV: 'test',
      VITE_APP_URL: baseURL,
      VITE_APP_VERSION: 'built-app-test',
      VITE_POCKETBASE_URL: baseURL,
      VITE_PUBLIC_POSTHOG_KEY: '',
      VITE_PUBLIC_POSTHOG_HOST: '',
      VITE_CONTACT_EMAIL: '',
      BLOG_ENABLED: 'false',
    },
  },
});
