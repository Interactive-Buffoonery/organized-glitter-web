import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

import base from './playwright.config';
import { hostedStorageStatePath } from './e2e/hosted/storage-state';

if (process.env.SPACEFAST_QA_RUN !== '1') {
  throw new Error('Run Spacefast acceptance through pnpm test:e2e:spacefast');
}

const accessState = process.env.E2E_ACCESS_STORAGE_STATE
  ? path.resolve(process.env.E2E_ACCESS_STORAGE_STATE)
  : undefined;
const desktopUse = devices['Desktop Chrome'];
const publicUse = {
  ...desktopUse,
  ...(accessState ? { storageState: accessState } : {}),
};

export default defineConfig({
  ...base,
  webServer: undefined,
  workers: 1,
  retries: 0,
  maxFailures: 1,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR,
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.PLAYWRIGHT_HTML_REPORT, open: 'never' }],
  ],
  use: { ...base.use, baseURL: process.env.E2E_APP_URL },
  projects: [
    {
      name: 'setup',
      testMatch: /[/\\]hosted[/\\]login\.setup\.ts$/,
      use: publicUse,
    },
    {
      name: 'spacefast-public',
      testMatch: /[/\\]hosted[/\\]public\.spec\.ts$/,
      dependencies: ['setup'],
      use: publicUse,
    },
    {
      name: 'spacefast-authenticated',
      testMatch: /[/\\]hosted[/\\]authenticated\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...desktopUse, storageState: hostedStorageStatePath },
    },
    {
      name: 'spacefast-mobile-safari',
      testMatch: /[/\\]hosted[/\\]mobile\.spec\.ts$/,
      dependencies: ['setup'],
      use: { ...devices['iPhone 13'], storageState: hostedStorageStatePath },
    },
  ],
});
