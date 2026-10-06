import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.COLD_LOAD_PORT || 5184);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('COLD_LOAD_PORT must be an integer between 1024 and 65535');
}
const baseURL = `http://127.0.0.1:${port}`;
const artifactRoot = process.env.COLD_LOAD_ARTIFACT_DIR || '.tmp/cold-load-qa';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'cold-load.spec.ts',
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
  use: {
    baseURL,
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'pnpm exec vite build && node server/local-build-server.js',
    url: `${baseURL}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      APP_TEST_ENV: 'test',
      VITE_APP_URL: baseURL,
      VITE_APP_VERSION: 'cold-load-test',
      VITE_POCKETBASE_URL: baseURL,
      VITE_PUBLIC_POSTHOG_KEY: '',
      VITE_PUBLIC_POSTHOG_HOST: '',
      VITE_CONTACT_EMAIL: '',
      BLOG_ENABLED: 'false',
    },
  },
});
