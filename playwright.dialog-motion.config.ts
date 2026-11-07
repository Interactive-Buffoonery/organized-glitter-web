import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/dialog-motion',
  outputDir: '.tmp/dialog-motion/results',
  reporter: [['list'], ['html', { outputFolder: '.tmp/dialog-motion/report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4196', video: 'on' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4196 --strictPort',
    url: 'http://127.0.0.1:4196/e2e/dialog-motion/index.html',
    env: { VITE_APP_VERSION: 'dialog-motion-test' },
    reuseExistingServer: true,
  },
});
